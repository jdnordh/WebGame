"use strict";

var pi = 3.14159265358979323;
var g_menu = undefined;
var g_canvasHtmlElement = undefined;
var g_canvas = undefined;
var g_canvasWidth = 0;
var g_canvasHeight = 0;
var g_socket = undefined;
var g_username = undefined;
var g_board = undefined;

var s_clientStates = {mainMenu: 0, inGame:1}
var g_clientState = s_clientStates.inGame;
var s_cookies = {
	username: "username",
	colorScheme: "colorScheme"
}
var s_gameStates = {waitingForPlayer: 0, waitingForTurn: 1, playingTurn: 2, finished: 3}

var g_mouse = { x: undefined, y: undefined };
var g_renderables = [];

var s_colorSchemes = [];
(() =>
{
	s_colorSchemes.push({
		teams: ["#00bcd4", "#dd2c00"],
		board: "#d1cebd",
		boardHighlight: "#f1decd",
		background: "#ffffff"
	});
	s_colorSchemes.push({
		teams: ["#d63447", "#f57b51"],
		board: "#d1cebd",
		boardHighlight: "#f1decd",
		background: "#ffffff"
	});
	s_colorSchemes.push({
		teams: ["#ef962d", "#9c5518"],
		board: "#faf4f4",
		boardHighlight: "#f1decd",
		background: "#444444"
	});
	s_colorSchemes.push({
		teams: ["#ffa34d", "#f67575"],
		board: "#1eb2a6",
		boardHighlight: "#f1decd",
		background: "#d4f8e8"
	});
	s_colorSchemes.push({
		teams: ["#5b8c85", "#434e52"],
		board: "#b0a160",
		boardHighlight: "#f1decd",
		background: "#ecce6d"
	});
	s_colorSchemes.push({
		teams: ["#7fa998", "#ff8364"],
		board: "#5b5656",
		boardHighlight: "#f1decd",
		background: "#f5eaea"
	});
})();

// Get the coord that a rect should be at to be in the center
function getRectCenteredCoordFromSize(size)
{
	let xCoord = (g_canvasWidth / 2) - (size.x / 2);
	let yCoord = (g_canvasHeight / 2) - (size.y / 2);
	return { x: xCoord, y: yCoord };
}

// Get the max size given a maximum percentage and a (height / width) aspect ratio
function getSizeGivenAspectRatio(maxPercentX, maxPercentY, aspectRatio)
{
	// The goal is to either get to max x or max y, then accomodate the other
	let pixelX = xPercentToPixel(maxPercentX);
	let pixelY = yPercentToPixel(maxPercentY);

	let currentRatio = pixelY / pixelX;
	if (currentRatio < aspectRatio)
	{
		// Keep pixelY where it is, shrink pixelX according to ratio
		pixelX = pixelY / aspectRatio;
	}
	else if (currentRatio > aspectRatio)
	{
		// Keep pixelX where it is, shrink pixelY according to ratio
		pixelY = pixelX * aspectRatio;
	}
	return { x: pixelX, y: pixelY };
}

function yPercentToPixel(percentY)
{
	return percentY / 100 * g_canvasHeight;
}

function xPercentToPixel(percentX)
{
	return percentX / 100 * g_canvasWidth;
}

class Renderable
{
	render()
	{
		throw "Exception: Need to override render function.";
	}
}

class Board extends Renderable
{
	constructor(columns, rows, winAmount, id, player) 
	{
		super();
		this.state = s_gameStates.waitingForPlayer;
		this.columns = columns;
		this.rows = rows;
		this.winAmoumt = winAmount;
		this.winningTeam = -1;
		this.winningSlots = [];
		this.gameId = id;
		this.player = player;

		// Visuals
		this.visualChips = [];
		this.radius = 1;
		this.colorScheme = s_colorSchemes[0];
		this.size = { x: 1, y: 1 };
		this.coords = { x: 0, y: 0 };
		this.activeColumn = -1;
		this.activeSlot = { x: 0, y: 0 };
		this.currentTeam = 1;
		this.resized = false;

		// Initialize board
		this.board = [this.columns];
		for (let i = 0; i < this.columns; ++i)
		{
			this.board[i] = [this.rows];
			for (let j = 0; j < this.rows; ++j)
			{
				this.board[i][j] = -1;
			}
		}
		// Mouse hover effects
		let self = this;
		window.addEventListener("mousemove", (event) =>
		{
			self.private_updateActiveSlot();
		});
		// Click
		window.addEventListener("click", (event) =>
		{
			if (self.state === s_gameStates.playingTurn && self.activeColumn !== -1){
				playTurn(self.activeColumn);
			}
		});
		window.addEventListener("resize", (event) =>
		{
			self.resized = true;
		});
	}

	setState(state){
		this.state = state;
		console.log("Board state: " + state);
	}

	setWinner(winningTeam, winningSlots){
		this.winningTeam = winningTeam;
		this.winningSlots = winningSlots;
	}

	clear()
	{
		this.board = [this.columns];
		for (let i = 0; i < this.columns; ++i)
		{
			this.board[i] = [this.rows];
			for (let j = 0; j < this.rows; ++j)
			{
				this.board[i][j] = -1;
			}
		}
		this.visualChips = [];
		this.private_updateActiveSlot();
	}

	private_updateActiveSlot()
	{
		this.activeColumn = this.private_getActiveColumnFromPosition();
		this.activeSlot = this.private_getFirstAvailableInColumn(this.activeColumn);
	}

	// Get the position that a chip would fall into if the user clicked
	private_getFirstAvailableInColumn(col)
	{
		if (col === -1 || col >= this.columns)
		{
			return { col: -1, row: -1 };
		}
		for (let i = 0; i < this.rows; ++i)
		{
			let current = this.board[col][i];
			if (current === -1)
			{
				return { col: col, row: i };
			}
		}
		// Column is full so no active slot
		return { col: -1, row: -1 };
	}

	// From the given mouse position, get the coresponding column.
	// If no coresponding colum, returns -1
	private_getActiveColumnFromPosition()
	{
		if (g_mouse.x < this.coords.x || g_mouse.x > this.coords.x + this.size.x)
		{
			return -1;
		}
		if (g_mouse.y < this.coords.y || g_mouse.y > this.coords.y + this.size.y)
		{
			return -1;
		}
		// Mouse is over the board, so return the column it's in
		let columnSize = this.size.x / this.columns;
		let distance = g_mouse.x - this.coords.x;
		return Math.floor(distance / columnSize);
	}

	changeColorScheme(index)
	{
		if (index < 0 || index > s_colorSchemes.length)
		{
			return;
		}
		this.colorScheme = s_colorSchemes[index];
		for (let i = 0; i < this.visualChips.length; ++i)
		{
			let chip = this.visualChips[i];
			chip.color = this.colorScheme.teams[chip.team];
		}
	}

	updateBoard(board, lastPlayedTeam, lastPlayedSlot)
	{
		// Update the board from the server
		this.board = board;
		// Validate column
		if (lastPlayedSlot < 0 || lastPlayedSlot >= this.columns)
		{
			throw "Exception: Invalid input.";
		}
		// Validate team
		if (lastPlayedTeam !== 0 && lastPlayedTeam !== 1)
		{
			throw "Exception: Invalid input.";
		}
		this.private_addVisualChip(lastPlayedTeam, lastPlayedSlot);
	}

	// Adds a chip to be rendered
	private_addVisualChip(team, slot)
	{
		if (team !== 0 && team !== 1)
		{
			throw "Exception: invalid team " + team;
		}
		let yStart = this.private_getChipYStart();
		let coords = this.private_getCircleCoords(slot.col, slot.row);
		let chip = new GravityChip(team,
			coords.x,
			yStart,
			coords.y + this.radius, // Add the radius, because the bottom point is the contact point
			slot.col,
			slot.row,
			this.radius,
			this.colorScheme.teams[team]);
		this.visualChips.push(chip);
	}

	// Get the y start coordinate for a visual chip
	private_getChipYStart()
	{
		let y = this.coords.y - this.radius;
		return y;
	}

	// Gets the dynamic coordinates of a specific column and row of the board
	private_getCircleCoords(col, row)
	{
		let left = this.coords.x;
		let top = this.coords.y;
		let twoPercentX = 2 / 100 * this.size.x;
		let twoPercentY = 2 / 100 * this.size.y;

		let circleX = left + this.radius + twoPercentX;
		let circleY = top + this.radius + twoPercentY;
		circleX += col * 2 * this.radius + col * twoPercentX;
		circleY += (this.rows - 1 - row) * 2 * this.radius + (this.rows - 1 - row) * twoPercentY;
		return { x: circleX, y: circleY };
	}

	render()
	{
		this.size = getSizeGivenAspectRatio(80, 70, 6 / 7);
		this.coords = getRectCenteredCoordFromSize(this.size);

		// Fill board
		g_canvas.fillStyle = this.colorScheme.board;
		g_canvas.fillRect(this.coords.x, this.coords.y, this.size.x, this.size.y);

		// Get the dynamic radius of the circles
		let twoPercentX = 2 / 100 * this.size.x;
		this.radius = (this.size.x - 8 * twoPercentX) / (7 * 2);
		if (this.radius < 1)
		{
			this.radius = 1;
		}
		// Make board cutouts
		g_canvas.save();
		g_canvas.globalCompositeOperation = "destination-out";
		for (let i = 0; i < this.columns; ++i)
		{
			for (let j = 0; j < this.rows; ++j)
			{
				g_canvas.beginPath();
				let circleCoords = this.private_getCircleCoords(i, j);
				g_canvas.arc(circleCoords.x, circleCoords.y, this.radius, 0, 2 * pi, false);
				g_canvas.fill();
				g_canvas.closePath();
			}
		}
		g_canvas.restore();

		// Fill active slot
		let slot = this.activeSlot;
		let hasActiveSlot = slot.col !== -1 && slot.row !== -1;
		if (hasActiveSlot && this.state === s_gameStates.playingTurn)
		{
			let activeSlotCoords = this.private_getCircleCoords(slot.col, slot.row);
			fillCircle(activeSlotCoords.x,
				activeSlotCoords.y,
				this.radius,
				this.colorScheme.teams[this.player] + "88");
		}

		// Fill chips behind board
		g_canvas.save();
		g_canvas.globalCompositeOperation = "destination-over";
		for (let i = 0; i < this.visualChips.length; ++i)
		{
			let chip = this.visualChips[i];
			chip.radius = this.radius;
			if (chip.landed || this.resized)
			{
				let chipCoords = this.private_getCircleCoords(chip.col, chip.row);
				chip.x = chipCoords.x;
				chip.y = chipCoords.y;
				chip.yMax = chip.y;
				this.resized = false;
			}
			chip.render();
		}
		g_canvas.restore();

		// Fill background behind everything
		g_canvas.save();
		g_canvas.globalCompositeOperation = "destination-over";
		g_canvas.fillStyle = this.colorScheme.background;
		g_canvas.fillRect(0, 0, g_canvasWidth, g_canvasHeight);
		g_canvas.restore();

		// TODO Change winner animation to function 
		if (this.winningTeam !== -1){
			console.log("Winner: " + this.winningTeam);
			//console.log(winner.slots);
			for(let i = 0; i < this.winningSlots.length; ++i){
				let slot = this.winningSlots[i];
				let slotCoords = this.private_getCircleCoords(slot.col, slot.row);
				fillCircle(slotCoords.x,
					slotCoords.y,
					this.radius * 0.75,
					"#ffffff88");
			}
		}
	}
}

class GravityChip extends Renderable
{
	constructor(team, x, y, yMax, col, row, radius, color)
	{
		super();
		this.team = team;
		this.x = x;
		this.y = y;
		this.col = col;
		this.row = row;
		this.yMax = yMax;
		this.dx = 0;
		this.dy = 0;
		this.radius = radius;
		this.color = color;
		this.landed = false;
	}

	render()
	{
		this.update();
		fillCircle(this.x, this.y, this.radius, this.color);
	}

	update()
	{
		if (this.landed)
		{
			return;
		}
		this.dy += 9.81 / 10;
		this.y += this.dy;
		if (this.y + this.radius >= this.yMax)
		{
			this.y = this.yMax - this.radius;
			this.dy = 0;
			this.landed = true;
		}
	}
}

function fillCircle(x, y, radius, color)
{
	g_canvas.beginPath();
	g_canvas.fillStyle = color;
	g_canvas.arc(x, y, radius, 0, 2 * pi, false);
	g_canvas.fill();
	g_canvas.closePath();
}

$(function ()
{
	InitializeSocket();
	InitizlizeCanvas();

	// Update mouse variable on move
	window.addEventListener("mousemove", (event) =>
	{
		g_mouse.x = event.x;
		g_mouse.y = event.y;
	});

	window.addEventListener("resize", (event) =>
	{
		resizeGameBoard();
	});

	var i = 0;
	// Color switching and clearing
	$(document).keydown((event) =>
	{
		let colorChanged = false;
		switch (event.keyCode)
		{
			case 38:
				++i;
				i %= s_colorSchemes.length;
				colorChanged = true;
				break;
			case 40:
				--i;
				if (i < 0)
				{
					g_menu.add();
					i = s_colorSchemes.length - 1;
				}
				colorChanged = true;
				break;
		}
		if (colorChanged)
		{
			g_board.changeColorScheme(i);
		}
	});

	draw();
});

//#region Server Coms

function InitializeSocket(){
	g_socket = io();
	g_username = getCookieValue(s_cookies.username);
	console.log("Read username cookie: " + g_username);

	g_socket.on("registerResponse",
		(data) => {
			deleteCookie(s_cookies.username);
			console.log("Removed username cookie");
			g_username = data.username;
			createCookie(s_cookies.username, g_username, 30);
			console.log("Added username cookie: " + g_username);
		});
	g_socket.on("gameJoined", (boardData) =>{
		console.log("Joined game " + boardData.id);
		switchToGameBoard();
		let imPlayer = boardData.youArePlayer;
		let columns = boardData.columns;
		let rows = boardData.rows;
		let winAmount = boardData.winAmoumt
		let id = boardData.id;
		g_board = new Board(columns, rows, winAmount, id, imPlayer);
		g_board.setState(s_gameStates.waitingForPlayer);
		g_renderables.push(g_board);
		
	});
	g_socket.on("boardUpdate", (boardData) =>{
		let board = boardData.board;
		let team = boardData.team;
		let slot = boardData.slot;
		g_board.updateBoard(board, team, slot);
	});
	g_socket.on("gameError", (message) =>{
		showMessage(message)
	});
	g_socket.on("gameStarted", () =>{
		console.log("Game started.");
		g_board.setState(s_gameStates.waitingForTurn);
	});
	g_socket.on("turnNotify", () =>{
		console.log("My turn!");
		g_board.setState(s_gameStates.playingTurn);
	});
	g_socket.on("waitForTurn", () =>{
		g_board.setState(s_gameStates.waitingForTurn);
	});
	g_socket.on("gameFinished", (winner) =>{
		g_board.setState(s_gameStates.finished);
		g_board.setWinner(winner.winningTeam, winner.winningSlots);
	});
	g_socket.on("gameClosed", ()=>{
		// TODO Alert that the game was closed
		g_clientState = s_clientStates.mainMenu;
	});

	g_socket.emit("registerRequest", {username:g_username});

	switchToMainMenu();
}

function requestUsernameUpdate(username){
	g_socket.emit("usernameUpdate", username);
}

function leaveGame(){
	g_socket.emit("leaveGame");
}

function requestRematch(){
	g_socket.emit("rematchRequest");
}

function joinGame(id = -1){
	g_socket.emit("joinGame", id);
}

function playTurn(col){
	g_socket.emit("playTurn", col);
}

function createGame(){
	g_socket.emit("createGame");
}

//#endregion

// Animation function to run every frame
function draw()
{
	requestAnimationFrame(draw);
	g_canvas.clearRect(0, 0, g_canvasWidth, g_canvasHeight);
	for (let i = 0; i < g_renderables.length; ++i)
	{
		g_renderables[i].render();
	}
}

//#region Cookies

// Based on https://stackoverflow.com/questions/5639346/what-is-the-shortest-function-for-reading-a-cookie-by-name-in-javascript
function createCookie(name,value,days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 *1000));
        var expires = "; expires=" + date.toGMTString();
    } else {
        var expires = "";
    }
    document.cookie = name + "=" + value + expires + "; path=/";
}

function getCookieValue(cookieName) {
    var matched = document.cookie.match("(^|[^;]+)\\s*" + cookieName + "\\s*=\\s*([^;]+)");
    return matched ? matched.pop() : "";
}

function deleteCookie(name) {
    createCookie(name,"",-1);
}

//#endregion

//#region Menus

function switchToMainMenu(){
	removeGameBoard();
	removeMenu();
	let joinButtonId = "joinMenu";
	let createButtonId = "createMenu";

	$("body").append("<div id=\"menuDiv\"><div id=\"menu\">\r\n\t\t<button class=\"grid-row=1\" id=\"joinMenu\">Join Game<\/button>\r\n\t\t<button class=\"grid-row-2\" id=\"createMenu\">Create Game<\/button>\r\n\t<\/div></div>");

	// Add click handlers
	$("#" + joinButtonId).click((e) =>{
		switchToJoinMenu();
	});
	$("#" + createButtonId).click((e) =>{
		switchToCreateMenu();
	});
}

function switchToJoinMenu(){
	removeGameBoard();
	removeMenu();

	let usernameInputId = "username";
	let gameIdId = "gameId";
	let joinGameButtonId = "joinGame";
	let backButtonId = "backToMain";

	$("body").append("<div id=\"menuDiv\"><div id=\"menu\"><label class=\"grid-row=1\" for=\"username\">Nickname:<\/label><input class=\"grid-row=2\" type=\"text\" id=\"username\" name=\"username\" autocomplete=\"off\" spellcheck=\"false\"><label class=\"grid-row=3\" for=\"gameId\">Game ID:<\/label><input class=\"grid-row=4\" type=\"text\" id=\"gameId\" name=\"gameId\" autocomplete=\"off\"><button class=\"grid-row=5\" id=\"joinGame\">Join Game<\/button><button class=\"grid-row=6 back-button\" id=\"backToMain\">Back<\/button><\/div></div>");

	// Add current username
	$("#" + usernameInputId).val(g_username);

	// Add click handlers
	$("#" + joinGameButtonId).click((e) =>{
		requestUsernameUpdate($("#" + usernameInputId).val());
		let gameId = makeStringNumeric($("#" + gameIdId).val());
		if (!gameId){
			gameId = -1;
		}
		joinGame(gameId);
	});
	$("#" + backButtonId).click((e) =>{
		switchToMainMenu();
	});
}

function switchToCreateMenu(){
	removeGameBoard();
	removeMenu();
	let usernameInputId = "username";
	let createGameButtonId = "createGame";
	let backButtonId = "backToMain";

	$("body").append("<div id=\"menuDiv\"><div id=\"menu\"><label class=\"grid-row=1\" for=\"username\">Nickname:<\/label><input class=\"grid-row=2\" type=\"text\" id=\"username\" name=\"username\" autocomplete=\"off\" spellcheck=\"false\"><button class=\"grid-row=3\" id=\"createGame\">Create Game<\/button><button class=\"grid-row=4 back-button\" id=\"backToMain\">Back<\/button><\/div></div>");

	// Add current username
	$("#" + usernameInputId).val(g_username);

	// Add click handlers
	$("#" + createGameButtonId).click((e) =>{
		requestUsernameUpdate($("#" + usernameInputId).val());
		createGame();
	});
	$("#" + backButtonId).click((e) =>{
		switchToMainMenu();
	});
}

function showMessage(message){
	let okayButtonId = "okay";
	let messageId = "messageDiv";
	let greyOutId = "greyOut"
	$("body").append("<div id=\"" + greyOutId + "\"></div>");
	$("body").append("<div id=\"" + messageId + "\"><div id=\"error\"><label class=\"grid-row=1\">" + message + "<\/label><button class=\"grid-row=2\" id=\"okay\">Okay<\/button><\/div></div>");

	$("#" + okayButtonId).click((e) =>{
		let greyOut = $("#" + greyOutId);
		if (greyOut){
			greyOut.remove();
		}
		let message = $("#" + messageId);
		if (message){
			message.remove();
		}
	});
}

function resizeGameBoard(){
	if (g_clientState === s_clientStates.inGame){
		g_canvasWidth = g_canvasHtmlElement.width = window.innerWidth;
		g_canvasHeight = g_canvasHtmlElement.height = window.innerHeight;
	}
}

function removeGameBoard(){
	if (g_canvasHtmlElement){
		// Change canvas size
		g_canvasWidth = g_canvasHtmlElement.width = 0;
		g_canvasHeight = g_canvasHtmlElement.height = 0;
	}
}

function removeMenu(){
	g_menu = $("#menuDiv");
	if (g_menu){
		g_menu.remove();
	}
}

function InitizlizeCanvas(){
	// Initialize canvas
	g_canvasHtmlElement = document.getElementById("appCanvas");
	if (!g_canvasHtmlElement){
		throw "Exception: Canvas element is null.";
	}
	g_canvasWidth = g_canvasHtmlElement.width = 0;
	g_canvasHeight = g_canvasHtmlElement.height = 0;
	g_canvas = g_canvasHtmlElement.getContext("2d");
}

function switchToGameBoard(){
	removeMenu();
	// Change canvas size
	g_canvasWidth = g_canvasHtmlElement.width = window.innerWidth;
	g_canvasHeight = g_canvasHtmlElement.height = window.innerHeight;
}

//#endregion

// Removes all non-numeric characters
function makeStringNumeric(string) {
	if (!string){
		return "";
	}
	return string.replace(/[^0-9]/gmi, "");
}
