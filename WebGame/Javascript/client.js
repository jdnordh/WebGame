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
	colorScheme: "colorScheme",
	sessionKey: "sessionKey"
}
var s_gameStates = {waitingForPlayer: 0, waitingForTurn: 1, playingTurn: 2, finished: 3}

var g_mouse = { x: undefined, y: undefined };
var g_renderables = [];
var g_clickables = [];

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

//#region Classes

class Renderable
{
	render()
	{
		throw "Exception: Need to override render function.";
	}
}

class Clickable{
	// Constructor value are in percentage of the window
	// Click action is the action to perform when clicked
	// Update hover action takes a bool that specifies if the mouse is hovering over
	constructor(isEnabled, xPos, yPos, width, height, clickAction, updateHoverStateAction){
		this.isEnabled = isEnabled;
		this.xPos = xPos;
		this.yPos = yPos;
		this.width = width;
		this.height = height;
		this.clickAction = clickAction;
		this.updateHoverStateAction = updateHoverStateAction;
	}

	clickAt(mouseX, mouseY){
		if (!this.isEnabled){
			return;
		}
		let left = xPercentToPixel(this.xPos);
		let right = xPercentToPixel(this.xPos + this.width);
		let top = yPercentToPixel(this.yPos);
		let bottom = yPercentToPixel(this.yPos + this.height);

		if (mouseX > left && mouseX < right &&
			mouseY > top && mouseY < bottom){
				this.clickAction();
		}
	}

	updateHoverState(mouseX, mouseY){
		if (!this.isEnabled){
			return;
		}
		let left = xPercentToPixel(this.xPos);
		let right = xPercentToPixel(this.xPos + this.width);
		let top = yPercentToPixel(this.yPos);
		let bottom = yPercentToPixel(this.yPos + this.height);

		let mouseIsOver = mouseX > left && mouseX < right && mouseY > top && mouseY < bottom;
		this.updateHoverStateAction(mouseIsOver);
	}
}

class Button extends Renderable{
	constructor(isEnabled, xPos, yPos, width, height, text, clickAction, colorScheme)
	{
		super();
		this.isEnabled = isEnabled;
		this.text = text;
		this.colorScheme = colorScheme;
		this.borderColor = "#dddddd";
		this.backgroundColor = "#dddddd";
		this.isHovering = false;
		let self = this;
		let updateHoverStateAction = (value) =>{
			self.isHovering = value;
		};
		this.clickable = new Clickable(isEnabled, xPos, yPos, width, height, clickAction, updateHoverStateAction);
	}

	setEnabled(value){
		this.clickable.isEnabled = this.isEnabled = value;
	}

	updateColorScheme(colorScheme){
		this.colorScheme = colorScheme;
	}

	render(){
		if (!this.isEnabled){
			return;
		}

		// TODO Use isHovering value
		let x = xPercentToPixel(this.clickable.xPos);
		let width = xPercentToPixel(this.clickable.width);
		let y = yPercentToPixel(this.clickable.yPos);
		let height = yPercentToPixel(this.clickable.height);

		let centerX = xPercentToPixel(this.clickable.xPos + this.clickable.width / 2)
		let centerY = xPercentToPixel(this.clickable.yPos + this.clickable.height / 2)

		let textColor = this.colorScheme.board;
		let backgroundColor = this.colorScheme.background;

		fillRect(x, y, width, height, textColor);
		fillRect(x + 2, y + 2, width - 4, height - 4, backgroundColor);
		let fontSize = this.clickable.width < this.clickable.height 
			? this.clickable.width : this.clickable.height;
		drawText(this.text, centerX, centerY, textColor, fontSize, "center");
	}
}

class Board extends Renderable
{
	constructor(columns, rows, winAmount, id, iAmPlayer) 
	{
		super();
		this.state = s_gameStates.waitingForPlayer;
		this.columns = columns;
		this.rows = rows;
		this.winAmoumt = winAmount;
		this.winningTeam = -1;
		this.winningSlots = [];
		this.id = id;
		this.iAmPlayer = iAmPlayer;
		this.players = [];
		this.isFinished = false;

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
		this.continueButton = new Button(false, 45, 92, 10, 4, "Continue", 
			() =>{ switchToRematchMenu();}, this.colorScheme);
		g_clickables.push(this.continueButton);

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

	setPlayers(players){
		this.players = players;
	}

	setWinner(winningTeam, winningSlots){
		this.isFinished = true;
		this.winningTeam = winningTeam;
		this.winningSlots = winningSlots;
		this.continueButton.isEnabled = true;
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
		fillRect(this.coords.x, this.coords.y, this.size.x, this.size.y, this.colorScheme.board)

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
				this.colorScheme.teams[this.iAmPlayer] + "88");
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

		if (this.state === s_gameStates.playingTurn){
			let text = "Your turn";
			let color = this.colorScheme.teams[this.colorScheme.board];
			this.renderHeadingText(text, color);
		}
		
		// Draw text
		let usernameSize = 3;
		let textX = xPercentToPixel(10);
		let textY = yPercentToPixel(92);
		drawText(g_username, textX, textY, this.colorScheme.teams[this.iAmPlayer], usernameSize);
		if (this.state !== s_gameStates.waitingForPlayer){
			textX = xPercentToPixel(90);
			textY = yPercentToPixel(92);
			let otherPlayer = (this.iAmPlayer + 1) % 2;
			drawText(this.players[otherPlayer], textX, textY, this.colorScheme.teams[otherPlayer], usernameSize, "right");
		}
		else {
			// Show game id while waiting for a player
			let text = "Game ID: " + this.id;
			this.renderHeadingText(text, this.colorScheme.board);
		}

		if (this.isFinished === true){
			if (this.winningTeam !== -1){
				for(let i = 0; i < this.winningSlots.length; ++i){
					let slot = this.winningSlots[i];
					let slotCoords = this.private_getCircleCoords(slot.col, slot.row);
					fillCircle(slotCoords.x,
						slotCoords.y,
						this.radius * 0.75,
						"#ffffff88");
				}
				let text = this.players[this.winningTeam] + " won the game!";
				let color = this.colorScheme.teams[this.winningTeam];
				this.renderHeadingText(text, color);
			}
			else {
				// Game was a draw
				let text = "Draw!";
				let color = this.colorScheme.board;
				this.renderHeadingText(text, color);
			}
		}
		if (this.continueButton.isEnabled){
			this.continueButton.render();
		}
	}

	renderHeadingText(text, color){
		let textX = xPercentToPixel(50);
		let textY = yPercentToPixel(10);
		let fontSize = 5;
		drawText(text, textX, textY, color, fontSize, "center");
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

//#endregion

//#region Drawing Functions

function fillCircle(x, y, radius, color)
{
	g_canvas.beginPath();
	g_canvas.fillStyle = color;
	g_canvas.arc(x, y, radius, 0, 2 * pi, false);
	g_canvas.fill();
	g_canvas.closePath();
}

// Positions in pixels
function fillRect(x, y, width, height, color){
	g_canvas.fillStyle = color;
	g_canvas.fillRect(x, y, width, height);
}

// Positions in pixels, fontSize in percentage
function drawText(text, x, y, color, fontSize, align = "left"){
	g_canvas.fillStyle = color;
	let size = getFontPixelsFromPercentage(fontSize) + "px";
	g_canvas.font = size + " Righteous";
	g_canvas.textAlign = align;
	g_canvas.fillText(text, x, y);
}

function getFontPixelsFromPercentage(size){
	let x = g_canvasWidth * size / 100;
	let y = g_canvasHeight * size / 100;
	return (x + y) / 2;
}

//#endregion

$(function ()
{
	InitializeSocket();
	InitizlizeCanvas();

	// Update mouse variable on move
	window.addEventListener("mousemove", (event) =>
	{
		g_mouse.x = event.x;
		g_mouse.y = event.y;
		
		for(let clickable of g_clickables){
			clickable.updateHoverState(g_mouse.x, g_mouse.y);
		}
	});

	window.addEventListener("resize", (event) =>
	{
		resizeGameBoard();
	});

	window.addEventListener("click", (event) =>{
		for(let clickable of g_clickables){
			clickable.clickAt(event.x, event.y);
		}
	});

	var i = 0;
	// Color switching
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
		let iAmPlayer = boardData.youArePlayer;
		let columns = boardData.columns;
		let rows = boardData.rows;
		let winAmount = boardData.winAmoumt
		let id = boardData.id;
		g_board = new Board(columns, rows, winAmount, id, iAmPlayer);
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
	g_socket.on("gameStarted", (players) =>{
		console.log("Game started.");
		g_board.setPlayers(players);
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
	for (let renderable of g_renderables)
	{
		renderable.render();
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

function switchToRematchMenu(){
	alert("Todo!");
}

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

	$("body").append("<div id=\"menuDiv\"><div id=\"menu\"><label class=\"grid-row=1\" for=\"username\">Nickname:<\/label><input class=\"grid-row=2\" type=\"text\" id=\"username\" name=\"username\" autocomplete=\"off\" spellcheck=\"false\"><label class=\"grid-row=3\" for=\"gameId\">Game ID (Optional):<\/label><input class=\"grid-row=4\" type=\"text\" id=\"gameId\" name=\"gameId\" autocomplete=\"off\"><button class=\"grid-row=5\" id=\"joinGame\">Join Game<\/button><button class=\"grid-row=6 back-button\" id=\"backToMain\">Back<\/button><\/div></div>");

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
