"use strict";

var express = require("express");
var app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);

var htmlSourceDir = "/HTML";
var scriptSourceDir = "/Javascript";
var styleSourceDir = "/CSS";

app.get("/",
	(req, res) => {
		res.sendFile(__dirname + htmlSourceDir + "/app.html");
	});

app.get("/style",
	(req, res) => {
		res.sendFile(__dirname + styleSourceDir + "/style.css");
	});

app.get("/script",
	(req, res) => {
		res.sendFile(__dirname + scriptSourceDir + "/client.js");
	});

class Board{
	constructor() 
	{
		this.columns = 7;
		this.rows = 6;
		this.winAmoumt = 4;
		// Initialize board
		this.board = [this.columns];
		for (let col = 0; col < this.columns; ++col)
		{
			this.board[col] = [this.rows];
			for (let row = 0; row < this.rows; ++row)
			{
				this.board[col][row] = -1;
			}
		}
	}

	// Returns the slot that the chip was added to
	// Returns col=-1, row=-1 if the column was full 
	// Returns undefined if the input was invalid
	addChip(team, col)
	{
		// Validate column
		if (col < 0 || col >= this.columns)
		{
			return undefined;
		}
		// Validate team
		if (team !== 0 && team !== 1)
		{
			return undefined;
		}
		for (let row = 0; row < this.rows; ++row)
		{
			if (this.board[col][row] === -1)
			{
				this.board[col][row] = team;
				return {col:col, row:row};
			}
		}
		return {col:-1, row:-1};
	}

	// Returns team = -1 if no winner, otherwise team == 0 or 1 and slots with winning line
	// See https://stackoverflow.com/questions/32770321/connect-4-check-for-a-win-algorithm
	getWinner()
	{
		let lastTeam = -1;
		let connectionCount = 0;
		let currentTeam = 0;
		let slots = [];

		let lineReset = () =>{
			slots = [];
			connectionCount = 0;
			currentTeam = lastTeam = -1;
		}

		let breakStreak = () =>{
			slots = [];
			connectionCount = 0;
		}

		let checkForWinner = (col, row) =>{
			currentTeam = this.board[col][row];
			if (currentTeam !== -1 && currentTeam === lastTeam)
			{
				++connectionCount;
				if (connectionCount === this.winAmoumt - 1)
				{
					slots.push({col:col, row:row});
					return {team:lastTeam, slots:slots};
				}
			} else
			{
				breakStreak();
			}
			slots.push({col:col, row:row});
			lastTeam = currentTeam;
			return {team:-1, slots:undefined};
		}

		// Check vertical
		for (let col = 0; col < this.columns; ++col)
		{
			for (let row = 0; row < this.rows; ++row)
			{
				let winner = checkForWinner(col, row);
				if (winner.team !== -1){
					return winner;
				}
			}
			lineReset();
		}
		// Check horrizontal
		for (let row = 0; row < this.rows; ++row)
		{
			for (let col = 0; col < this.columns; ++col)
			{
				let winner = checkForWinner(col, row);
				if (winner.team !== -1){
					return winner;
				}
			}
			lineReset();
		}
		// Diagonal lines
		for (let startCol = 0, startRow = 0;
			 startCol < this.columns - this.winAmoumt + 1; ++startCol){
			for(let col = startCol, row = startRow; col < this.columns && row < this.rows; ++col, ++row){
				let winner = checkForWinner(col, row);
				if (winner.team !== -1){
					return winner;
				}
			}
			lineReset();
		}
		for (let startCol = 0, startRow = 1;
			 startRow < this.rows - this.winAmoumt + 1; ++startRow){
			for(let col = startCol, row = startRow; col < this.columns && row < this.rows; ++col, ++row){
				let winner = checkForWinner(col, row);
				if (winner.team !== -1){
					return winner;
				}
			}
			lineReset();
		}
		for (let startCol = this.columns - 1, startRow = 0;
			startCol >= this.winAmoumt - 1; --startCol){
			for(let col = startCol, row = startRow; col >= 0 && row < this.rows; --col, ++row){
				let winner = checkForWinner(col, row);
				if (winner.team !== -1){
					return winner;
				}
			}
			lineReset();
		}
		for (let startCol = this.columns - 1, startRow = 1;
			startRow < this.rows - this.winAmoumt + 1; ++startRow){
			for(let col = startCol, row = startRow; col >= 0 && row < this.rows; --col, ++row){
				let winner = checkForWinner(col, row);
				if (winner.team !== -1){
					return winner;
				}
			}
			lineReset();
		}
		return {team:-1, slots:undefined};
	}
}

// Region: Classes
class User{
	constructor(username, socket){
		this.username = username;
		this.socket = socket;
		this.game = undefined;
	}

	getSocketId(){
		return this.socket.id;
	}
}

class Game{
	constructor(id){
		this.players = [];
		this.board = new Board();
		this.id = id;
		this.isFinished = false;
		this.isStarted = false;
		this.currentTeamTurn = 0;
	}

	getData(){
		return {
			columns: this.board.columns, 
			rows: this.board.rows, 
			winAmount: this.board.winAmoumt, 
			id: this.id,
			youArePlayer: this.players.length - 1
		}
	}

	// Play a turn of the game, returns 1 if successful, -1 if invalid column or team
	playTurn(user, col){
		if (!this.isReadyToPlay() || !this.isStarted || this.isFinished){
			return -1;
		}
		let index = this.players.indexOf(user);
		if (index < 0){
			console.log("Did not find user " + user.isername + " in game " + this.id);
		}
		if (!this.players[0].getSocketId() === user.getSocketId() &&
			!this.players[1].getSocketId() === user.getSocketId())
		{
			return -1;
		}
		let slot = this.board.addChip(this.currentTeamTurn, col);
		if (slot && slot.col !== -1 && slot.row !== -1){
			console.log("User " + user.isername + " in game " + this.id + " played at col:" + slot.col +", " + slot.row);
			// Notify of added chip
			for (let player of this.players){
				player.socket.emit("boardUpdate", {board: this.board.board, slot:slot, team: this.currentTeamTurn});
			}
		}
		else {
			// Column was full
			return;
		}
		// Check for winner
		let winner = this.getWinner();
		if (winner.team !== -1){
			this.isFinished =  true;
			for (let player of this.players){
				player.socket.emit("gameFinished", {winningTeam: winner.team, winningSlots: winner.slots});
			}
			return;
		}
		// Notify wait
		this.players[this.currentTeamTurn].socket.emit("waitForTurn");
		// Switch team turn
		this.currentTeamTurn = this.currentTeamTurn === 0 ? 1 : 0;
		// Notify turn
		this.players[this.currentTeamTurn].socket.emit("turnNotify");
	}

	removeUser(user){
		let index = this.players.indexOf(user);
		if (index > -1){
			this.players.splice(index, 1);
			console.log("Removed user " + user.username + " from game " + this.id);
		}
	}

	start(){
		this.isStarted = true;
		this.players[this.currentTeamTurn].socket.emit("turnNotify");
	}

	addPlayer(user){
		// Check if game is full
		if (this.players.length === 2){
			return;
		}
		this.players.push(user);
	}

	needsPlayers(){
		return this.players.length < 2;
	}

	isReadyToPlay(){
		return !this.isFinished && this.players.length === 2;
	}

	getWinner(){
		let winner = this.board.getWinner();
		this.isFinished = winner.team !== -1;
		return winner;
	}
}
// End Region: Classes

var games = [];
var userDictionary = {};

io.on("connection", (socket) => {
	// On client connecting and trying to register a nickname
	socket.on("registerRequest",
		(data) => {
			// Username will be null/empty if no username found in cookies
			var registeredUsername = "";
			if (data.username) 
			{
				registeredUsername = makeStringAlphaNumeric(data.username);
				if (registeredUsername.length > 64) 
				{
					registeredUsername = registeredUsername.substring(0, 63);
				}
			}
			else 
			{
				registeredUsername = generateRandomUsername();
			}
			registerUser(registeredUsername, socket);
			socket.emit("registerResponse", {username: registeredUsername});
		});

	socket.on("usernameUpdate", (username) => {
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: user was null");
			console.log(userDictionary);
			return;
		}
		user.username = makeStringAlphaNumeric(username);
		socket.emit("registerResponse", {username: user.username});
	});

	socket.on("createGame", () => {
		let user = getUserFromSocket(socket);
		
		if (!user){
			console.log("Exception: user was null");
			console.log(userDictionary);
			return;
		}
		if (user.game){
			// User is already in a game
			return;
		}
		let index = games.length;
		let game = new Game(index);
		games.push(game);
		game.addPlayer(user);
		user.game = games[index];
		socket.emit("gameJoined", game.getData());
		console.log("User " + user.username + " created a game. Total games: " + games.length);
	});

	socket.on("joinGame", (id) => {
		// If id = -1, join a random game
		let user = getUserFromSocket(socket);
		
		if (!user){
			console.log("Exception: user was null");
			console.log(userDictionary);
			return;
		}
		if (user.game){
			// User is already in a game
			return;
		}
		console.log("User " + user.username + " is joining game " + id);
		if (id === -1){
			// Join random game
			for(let game of games){
				if(game.needsPlayers()){
					user.game = game;
					game.addPlayer(user);
					socket.emit("gameJoined");
					if (game.isReadyToPlay()){
						// Start game
						console.log("Game " + game.id + " started.");
						for (user of game.players) {
							user.socket.emit("gameStarted");
							game.start();
						}
					}
					return;
				}
			}
			socket.emit("gameError", "No games found to join!");
		}
		else if (id >= 0 && id < games.length) {
			let game = games[id];
			if (game.needsPlayers()){
				user.game = game;
				game.addPlayer(user);
				socket.emit("gameJoined", game.getData());
				if (game.isReadyToPlay()){
					// Start game
					console.log("Game " + id + " started.");
					for (user of game.players) {
						user.socket.emit("gameStarted");
						game.start();
					}
				}
			}
			else {
				socket.emit("gameError", "Game is full!");
			}
		}
		else {
			socket.emit("gameError", "Game with that id doesn't exist!");
		}
	});

	socket.on("leaveGame", (id) => {
		let user = getUserFromSocket(socket);
		
		if (!user){
			console.log("Exception: user was null");
			console.log(userDictionary);
			return;
		}
		if (user.game) {
			user.game.removeUser(user);
			user.game = undefined;
		}

	});

	socket.on("playTurn", (col) =>{
		let user = getUserFromSocket(socket);
		
		if (!user){
			console.log("Exception: user was null");
			console.log(userDictionary);
			return;
		}
		let game = user.game;
		if (!game){
			return;
		}
		game.playTurn(user, col);
	});

	socket.on("rematch", (slot) =>{
		// TODO
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: user was null");
			console.log(userDictionary);
			return;
		}
		let game = user.game;

		if (!game){
			return;
		}

	});

	socket.on("disconnect", () => {
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: user was null");
			console.log(userDictionary);
			return;
		}
		if (user.game)
		{
			user.game.removeUser(user);
			user.game = undefined;
		}
		console.log("Disconnected");
	});

});

// Start the server
http.listen(3000, function () {
	console.log("listening on *:3000");
});

let names = [];
names.push( ["Artless", "Bootless", "Craven", "Dankish", "Errant", "Fawning", "Frothy", "Goatish", "Jarring", "Mangled", "Puking", "Puny", "Saucy", "Spongey", "Vain", "Warped", "Wayward", "Weedy", "Yeasty"] );
names.push( ["Bat-fowling", "Beef-witted", "Beetle-headed", "Boil-Brained", "Clay-brained", "Dizzy-eyed", "Orc-skinned", "Flap-mouthed", "Dull-headed", "Rough-hewn", "Rump-fed", "Toad-spotted", "Urchin-snouted"] );
names.push( ["Baggage", "Barnacle", "Boar-pig", "Bug-bear", "Bum", "Canker-blossom", "clotpole", "Dewberry", "Dink", "Flap-dragon", "Flax-wench", "Foot-licker", "Giglet", "Haggard", "Harpy", "Hedge-pig", "Horn-beast", "Lewdster", "Lout", "Maggot-pie", "Malt-worm", "Measle", "Minnow", "Nut", "Worm-eater"] );

// From https://jsfiddle.net/ygo5a48r/
function generateRandomUsername() {
	let username = "";
	for (let i = 0; i < names.length; ++i)
	{
		let name = names[i];
		username += name[Math.floor(Math.random() * name.length)];
		if (i !== names.length - 1){
			username += " ";
		}
	}
	return username;
}

function getUserFromSocket(socket){
	return userDictionary[socket.id];
}

// Register a username with a socket and username color
function registerUser(username, socket) {
	userDictionary[socket.id] = new User(username, socket);
	console.log("Registered user: " + username);
}

// Un-registers a username from the system
function unregisterUser(socket) {
	let user = getUserFromSocket(socket);
	delete userDictionary[socket.id];
	console.log("Unregistered user: " + user.username);
}

// Removes all non-alphanumeric characters
function makeStringAlphaNumeric(string) {
	string = string.replace(/\s+/gm, " ");
	return string.replace(/\W/gmi, "");
}
