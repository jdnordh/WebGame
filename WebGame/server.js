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
		this.currentTeam = 0;
		// Initialize board
		this.board = [this.columns];
		for (let col = 0; col < this.columns; ++col)
		{
			this.board[col] = [this.rows];
			for (let row = 0; row < this.rows; ++row)
			{
				this.board[col][row] = 0;
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
		if (team !== 1 && team !== 2)
		{
			return undefined;
		}
		for (let row = 0; row < this.rows; ++row)
		{
			if (this.board[col][row] === 0)
			{
				this.board[col][row] = team;
				this.currentTeam = this.currentTeam === 0 ? 1 : 0;
				return {col:col, row:row};
			}
		}
		return {col:-1, row:-1};
	}

	// Returns team = -1 if no winner, otherwise team == 1 or 2 and slots with winning line
	// See https://stackoverflow.com/questions/32770321/connect-4-check-for-a-win-algorithm
	getWinner()
	{
		let lastTeam = 0;
		let connectionCount = 0;
		let currentTeam = 0;
		let slots = [];

		let lineReset = () =>{
			slots = [];
			lastTeam = connectionCount = currentTeam = 0;
		}

		let breakStreak = () =>{
			slots = [];
			connectionCount = 0;
		}

		let checkForWinner = (col, row) =>{
			currentTeam = this.board[col][row];
			if (currentTeam !== 0 && currentTeam === lastTeam)
			{
				++connectionCount;
				if (connectionCount === this.winAmoumt - 1)
				{
					slots.push({x:col, y:row});
					return {team:lastTeam, slots:slots};
				}
			} else
			{
				breakStreak();
			}
			slots.push({x:col, y:row});
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
		// TODO Winning line animation
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
		this.started = false;
		this.currentTeamTurn = 0;
	}

	// Play a turn of the game, returns 1 if successful, -1 if invalid column or team
	playTurn(user, col){
		if (!this.isReadyToPlay()){
			return -1;
		}
		if (!this.players[0].socket.id === user.socket.id &&
			!this.players[1].socket.id === user.socket.id)
		{
			return -1;
		}
		let slot = this.board.addChip(this.currentTeamTurn, col);
		if (!slot || slot.x === -1 || slot.y === -1){

		}
		// Notify wait
		this.players[this.currentTeamTurn].socket.emit("waitForTurn");
		// Switch team turn
		this.currentTeamTurn = this.currentTeamTurn === 0 ? 1 : 0;
		// Notify turn
		this.players[this.currentTeamTurn].socket.emit("turnNotify");
	}

	start(){
		players[this.currentTeamTurn].socket.emit("turnNotify");
	}

	needsPlayers(){
		return this.getPlayerAmount() < 2;
	}

	getPlayerAmount(){
		return this.players.length;
	}

	addPlayer(user){
		// Check if game is full
		if (this.players.length === 2){
			return;
		}
		this.players.push(user);
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
	socket.on("usernameRequest",
		(username) => {
			// Username will be null/empty if no username found in cookies
			var registeredUsername = "";
			if (username) 
			{
				var registeredUsername = makeStringAlphaNumeric(username);
				if (registeredUsername.length > 64) 
				{
					registeredUsername = registeredUsername.substring(0, 63);
				}
			}
			else 
			{
				registeredUsername = generateRandomUsername();
			}
			registerUser(registeredUsername, socket.id);
			socket.emit("usernameResponse", registeredUsername);
		});

		socket.on("createGame", (data) => {
			let user = userDictionary[socket.id];
			if (user.game){
				// User is already in a game
				return;
			}
			let index = games.length;
			games.push(new Game());
			user.game = games[index];
			socket.emit("gameCreated");
		});

		socket.on("joinGame", (id) => {
			// If id = -1, join a random game
			let user = userDictionary[socket.id];
			if (user.game){
				// User is already in a game
				return;
			}
			let game = getGameFromId(id);
			if (game){
				if (game.needsPlayers()){
					user.game = game;
					game.addPlayer(user);
					socket.emit("gameJoined");
					if (!game.needsPlayers()){
						// Start game
						for (user of game.teams){
							game.start();
							user.socket.emit("gameStarted");
						}
					}
				}
				else{
					socket.emit("gameIsFull");
				}
			}
			else {
				// Join random game
				for(game of games){
					if(game.needsPlayers()){
						user.game = game;
						game.addPlayer(user);
						socket.emit("gameJoined");
						return;
					}
				}
				// No games to join... maybe make a new game with a CPU player
				// TODO
			}
		});

		socket.on("leaveGame", (id) => {
			// If id = -1, join a random game
			// TODO
			let game = getAssociatedGame(socket.id);
			if (!game){
				return;
			}
		});

		socket.on("playChip", (slot) =>{
			// TODO
			let game = getAssociatedGame(socket.id);
			if (!game){
				return;
			}
			game.playTurn();
		});

		socket.on("rematch", (slot) =>{
			// TODO
			let game = getAssociatedGame(socket.id);
			if (!game){
				return;
			}

		});

		// Unregister on disconnect
		socket.on("disconnect",
			(data) => {
				unregisterUser(socket.id);
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
	username = "";
	for(let i = 0; i < names.length; ++i){
		username += name[Math.floor(Math.random() * name.length)];
		if (i !== names.length - 1){
			username += " ";
		}
	}
	return username;
}

// Get a game that a user is a part of
// Returns the game, or undefined if no game is found
function getAssociatedGame(socketId){
	for(let i = 0; i < games.length; ++i){
		let game = games[i];
		for(let j = 0; j < game.players.length; ++j){
			if (game.players[j].id === socketId){
				return game;
			}
		}
	}
	return undefined;
}

// Register a username with a socket and username color
function registerUser(username, socket) {
	userDictionary[socket.id] = new User(username, socket);
	console.log("Registered user: " + username);
}

// Unregisters a username from the system
function unregisterUser(socketId) {
	delete userDictionary[socketId];
	console.log("Unregistered user: " + username);
}

// Removes all non-alphanumeric characters
function makeStringAlphaNumeric(string) {
	string = string.replace(/\s+/gm, " ");
	return string.replace(/\W/gmi, "");
}
