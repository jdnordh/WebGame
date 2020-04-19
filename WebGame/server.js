"use strict";
//#region Initialization

var express = require("express");
var app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);

var htmlSourceDir = "/HTML";
var scriptSourceDir = "/Javascript";
var styleSourceDir = "/CSS";

//#endregion

//#region Resources

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

//#endregion

//#region Classes

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

	// Returns true if all slots are taken and there is no winner
	isDraw(){
		for (let col = 0; col < this.columns; ++col)
		{
			for (let row = 0; row < this.rows; ++row)
			{
				if (this.board[col][row] === -1){
					return false;
				}
			}
		}
		return true;
	}
}

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
	constructor(id, isRematch = false){
		this.players = [];
		this.board = new Board();
		this.id = id;
		this.isFinished = false;
		this.isStarted = false;
		this.currentTeamTurn = 0;
		this.rematchId = -1;
		this.isRematch = isRematch;
		this.isAcceptingPlayers = true;
	}

	getData(){
		return {
			columns: this.board.columns, 
			rows: this.board.rows, 
			winAmount: this.board.winAmoumt, 
			id: this.id,
			youArePlayer: this.players.length - 1,
			isRematch: this.isRematch
		}
	}

	canBeClosed(){
		return this.players.length === 0;
	}

	getPlayers(){
		let array = [];
		for(let player of this.players){
			array.push(player.username);
		}
		return array;
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
			//console.log("User " + user.isername + " in game " + this.id + " played at col:" + slot.col +", " + slot.row);
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
		// Check for draw
		if (this.board.isDraw()){
			this.isFinished =  true;
			for (let player of this.players){
				player.socket.emit("gameFinished", {winningTeam: -1, winningSlots: []});
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
		if (this.players.length === 2){
			this.isAcceptingPlayers = false;
		}
	}

	isAcceptingPlayers(){
		return this.isAcceptingPlayers;
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

//#endregion

var gameDictionary = {};
var userDictionary = {};

io.on("connection", (socket) => {
	// On client connecting and trying to register a nickname
	socket.on("registerRequest",
		(data) => {
			// Username will be null/empty if no username found in cookies
			let registeredUsername = "";
			if (data.username && data.username.length > 0) 
			{
				registeredUsername = makeSafeUsername(data.username);
			}
			// If username was null, or the safe username is empty, create a random one
			if (registeredUsername.length === 0){
				registeredUsername = generateRandomUsername();
			}
			registerUser(registeredUsername, socket);
			socket.emit("registerResponse", {username: registeredUsername});
		});

	// This is called before entering a game to verify the username
	socket.on("usernameUpdate", (data) => {
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: Unregistered user tried to connect.");
			return;
		}
		let username = data.username;
		if (!username || username.length === 0 ){
			sendGameError(socket, "Nickname cannot be empty.");
			return;
		}
		user.username = makeSafeUsername(username);
		if (!user.username || user.username.length === 0){
			sendGameError(socket, "Nickname should include alphanumeric characters.");
			return;
		}
		console.log("Updated user " + user.username);
		socket.emit("usernameUpdateResponse", {username: user.username, gameToJoinId: data.gameToJoinId});
	});

	socket.on("enterGame", (id) => {
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: Unregistered user tried to connect.");
			return;
		}
		if (user.game){
			// User is already in a game
			console.log(user.username + " is in game " + user.game.is + " and is trying to enter game " + id);
			return;
		}
		if (id === -1){
			// Join random game
			let gameToJoin = getRandomGame();
			if (gameToJoin){
				enterUserIntoGame(user, gameToJoin);
				return;
			}
			else {
				sendGameError(socket, "No games found to join!");
				return;
			}
		}
		else if (id === -2){
			// Create game
			let createdGame = getNewGame();
			enterUserIntoGame(user, createdGame);
			return;
		}
		else if (id) {
			// Try to join game with id
			let gameToJoin = getGameFromId(id);
			if (gameToJoin){
				enterUserIntoGame(user, gameToJoin);
				return;
			}
			else {
				sendGameError(socket, "Game with that ID doesn't exist!");
				return;
			}
		}
		else {
			sendGameError(socket, "Game with that ID doesn't exist!");
		}
	});

	socket.on("playTurn", (col) =>{
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: Unregistered user tried to connect.");
			return;
		}
		let game = user.game;
		if (!game){
			console.log( user.username + " tried to play a turn while not in a game.");
			return;
		}
		game.playTurn(user, col);
	});

	socket.on("rematchRequest", () =>{
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: Unregistered user tried to connect.");
			return;
		}
		let oldGame = user.game;
		let rematchGame = undefined;
		if (!oldGame){
			return;
		}
		// Check for existing rematch game
		if (oldGame.rematchId !== -1){
			removeUserTheirGame(user, true);
			rematchGame = getGameFromId(oldGame.rematchId);
			enterUserIntoGame(user, rematchGame);
		}
		else{
			// Create new game
			removeUserTheirGame(user, true);
			rematchGame = getNewGame(true);
			oldGame.rematchId = rematchGame.id;
			enterUserIntoGame(user, rematchGame);
		}
	});

	socket.on("leaveGame", (id) => {
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: Unregistered user tried to connect.");
			return;
		}
		if (user.game) {
			removeUserTheirGame(user);
		}
	});

	socket.on("disconnect", () => {
		let user = getUserFromSocket(socket);
		if (!user){
			console.log("Exception: Unregistered user tried to connect.");
			return;
		}
		if (user.game)
		{
			removeUserTheirGame(user);
		}
		unregisterUser(user);
	});

});

// Start the server
http.listen(3000, function () {
	console.log("listening on *:3000");
});

//#region Registry

function getUserFromSocket(socket){
	return userDictionary[socket.id];
}

// Register a username with a socket and username color
function registerUser(username, socket) {
	userDictionary[socket.id] = new User(username, socket);
	console.log("Registered user: " + username);
}

// Un-registers a username from the system
function unregisterUser(user) {
	delete userDictionary[user.socket.id];
	console.log("Unregistered user: " + user.username);
}

//#endregion

//#region Game Management

// Send a user an error message
// goHome: If true, then the user will be directed to the home page, else can continue
function sendGameError(socket, message, goHome = false){
	socket.emit("gameError", {message: message, goHome: goHome});
}

// Removes a game if both players have left
function removeGameIfNeeded(game){
	if (game.canBeClosed() && game.id in gameDictionary){
		let id = game.id;
		delete gameDictionary[id];
		console.log("Deleted game " + id);
	}
}

// Returns undefined if there are no open games
function getRandomGame(){
	let gameIds = Object.keys(gameDictionary);
	for(let id of gameIds){
		let game = getGameFromId(id);
		if (game && game.isAcceptingPlayers()){
			return game;
		}
	}
	return undefined;
}

// Create a new game, add it to the dictionary, and return it.
function getNewGame(isRematch = false){
	let id;
	do {
		id = Math.floor(Math.random() * 1000);
	} while(id in gameDictionary);
	let game = new Game(id, isRematch);
	gameDictionary[id] = game;
	console.log("Game " + id + " created.");
	return game;
}

// Enters a user into a game, notifies them, and starts the game if needed
function enterUserIntoGame(user, game){
	if (!game.isAcceptingPlayers()){
		console.log("Tried to enter user " + user.username + " into a closed game " + game.id);
		return;
	}
	user.game = game;
	game.addPlayer(user);
	user.socket.emit("gameJoined", game.getData());
	console.log("User " + user.username + " joined game " + game.id);
	if (game.isReadyToPlay()){
		console.log("Game " + game.id + " started.");
		for (let player of game.players) {
			player.socket.emit("gameStarted", game.getPlayers());
		}
		game.start();
	}
}

// Remove a user from a game and notify opponent if needed
function removeUserTheirGame(user, isEnteringRematch = false){
	let game = user.game;
	if (game){
		game.removeUser(user);
		user.game = undefined;

		if (!isEnteringRematch){
			if (game.rematchId !== -1){
				// Another user is waiting for this user, so notify them
				let rematchGame = getGameFromId(game.rematchId);
				for(let player of rematchGame.players){
					sendGameError(player.socket, user.username + " has left the game.", true);
				}
			}
			for(let player of game.players){
				sendGameError(player.socket, user.username + " has left the game.", true);
			}
		}
	}
	removeGameIfNeeded(game);
}

// Returns undefined if no game with id exists
function getGameFromId(gameId){
	if(gameId in gameDictionary){
		return gameDictionary[gameId];
	}
	else {
		return undefined;
	}
}

//#endregion

//#region Utility

function makeSafeUsername(username){
	let safe = makeStringAlphaNumeric(username);
	let maxNameSize = 20;
	if (safe.length > maxNameSize) 
	{
		safe = safe.substring(0, maxNameSize - 1);
	}
	return safe;
}

// Removes all non-alphanumeric characters and trim
function makeStringAlphaNumeric(string) {
	string = string.replace(/\s+/gm, " ");
	string = string.trim();
	return string.replace(/[^0-9a-zA-Z ]/gmi, "");
}

let names = [];
names.push( ["Artless", "Bootless", "Craven", "Dankish", "Errant", "Fawning", "Frothy", "Goatish", "Jarring", "Mangled", "Puking", "Puny", "Saucy", "Spongey", "Vain", "Warped", "Wayward", "Weedy", "Yeasty"] );
//names.push( ["Bat-fowling", "Beef-witted", "Beetle-headed", "Boil-Brained", "Clay-brained", "Dizzy-eyed", "Orc-skinned", "Flap-mouthed", "Dull-headed", "Rough-hewn", "Rump-fed", "Toad-spotted", "Urchin-snouted"] );
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

//#endregion
