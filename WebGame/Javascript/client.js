"use strict";

var pi = 3.14159265358979323;
var c;
var canvasWidth;
var canvasHeight;

var colorSchemeArray = [];
(() =>
{
	colorSchemeArray.push({
		teams: ["#00bcd4", "#dd2c00"],
		board: "#d1cebd",
		boardHighlight: "#f1decd",
		background: "#ffffff"
	});
	colorSchemeArray.push({
		teams: ["#d63447", "#f57b51"],
		board: "#d1cebd",
		boardHighlight: "#f1decd",
		background: "#ffffff"
	});
	colorSchemeArray.push({
		teams: ["#ef962d", "#9c5518"],
		board: "#faf4f4",
		boardHighlight: "#f1decd",
		background: "#444444"
	});
	colorSchemeArray.push({
		teams: ["#ffa34d", "#f67575"],
		board: "#1eb2a6",
		boardHighlight: "#f1decd",
		background: "#d4f8e8"
	});
	colorSchemeArray.push({
		teams: ["#5b8c85", "#434e52"],
		board: "#b0a160",
		boardHighlight: "#f1decd",
		background: "#ecce6d"
	});
	colorSchemeArray.push({
		teams: ["#7fa998", "#ff8364"],
		board: "#5b5656",
		boardHighlight: "#f1decd",
		background: "#f5eaea"
	});
})();

var mouse = { x: undefined, y: undefined };

var board;
var renderables = [];

// Get the coord that a rect should be at to be in the center
function getRectCenteredCoordFromSize(size)
{
	let xCoord = (canvasWidth / 2) - (size.x / 2);
	let yCoord = (canvasHeight / 2) - (size.y / 2);
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
	return percentY / 100 * canvasHeight;
}

function xPercentToPixel(percentX)
{
	return percentX / 100 * canvasWidth;
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
	constructor() 
	{
		super();
		this.columns = 7;
		this.rows = 6;
		this.winAmoumt = 4;
		this.visualChips = [];
		this.radius = 1;
		this.colorScheme = colorSchemeArray[0];
		this.size = { x: undefined, y: undefined };
		this.coords = { x: undefined, y: undefined };
		this.activeColumn = -1;
		this.activeSlot = { x: undefined, y: undefined };
		this.currentTeam = 1;
		this.resized = false;

		// Initialize board
		this.board = [this.columns];
		for (let i = 0; i < this.columns; ++i)
		{
			this.board[i] = [this.rows];
			for (let j = 0; j < this.rows; ++j)
			{
				this.board[i][j] = 0;
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
			self.addChip(this.currentTeam, self.activeColumn);
		});
		window.addEventListener("resize", (event) =>
		{
			self.resized = true;
		});
	}

	clear()
	{
		this.board = [this.columns];
		for (let i = 0; i < this.columns; ++i)
		{
			this.board[i] = [this.rows];
			for (let j = 0; j < this.rows; ++j)
			{
				this.board[i][j] = 0;
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
			return { x: -1, y: -1 };
		}
		for (let i = 0; i < this.rows; ++i)
		{
			let current = this.board[col][i];
			if (current === 0)
			{
				return { x: col, y: i };
			}
		}
		// Column is full so no active slot
		return { x: -1, y: -1 };
	}

	// From the given mouse position, get the coresponding column.
	// If no coresponding colum, returns -1
	private_getActiveColumnFromPosition()
	{
		if (mouse.x < this.coords.x || mouse.x > this.coords.x + this.size.x)
		{
			return -1;
		}
		if (mouse.y < this.coords.y || mouse.y > this.coords.y + this.size.y)
		{
			return -1;
		}
		// Mouse is over the board, so return the column it's in
		let columnSize = this.size.x / this.columns;
		let distance = mouse.x - this.coords.x;
		return Math.floor(distance / columnSize);
	}

	// Returns 0 if no winner, otherwise 1 or 2
	// See https://stackoverflow.com/questions/32770321/connect-4-check-for-a-win-algorithm
	getWinner()
	{
		let lastTeam = 0;
		let connectionCount = 0;
		// Check vertical
		for (let i = 0; i < this.columns; ++i)
		{
			for (let j = 0; j < this.rows; ++j)
			{
				let currentTeam = this.board[i][j];
				if (currentTeam !== 0 && currentTeam === lastTeam)
				{
					++connectionCount;
					if (connectionCount === this.winAmoumt - 1)
					{
						return lastTeam;
					}
				} else
				{
					connectionCount = 0;
				}
				lastTeam = currentTeam;
			}
		}
		connectionCount = 0;
		// Check horrizontal
		for (let j = 0; j < this.rows; ++j)
		{
			for (let i = 0; i < this.columns; ++i)
			{
				let currentTeam = this.board[i][j];
				if (currentTeam !== 0 & currentTeam === lastTeam)
				{
					++connectionCount;
					if (connectionCount === this.winAmoumt - 1)
					{
						return lastTeam;
					}
				} else
				{
					connectionCount = 0;
				}
				lastTeam = currentTeam;
			}
		}
		connectionCount = 0;
		// Diagonal lines
		for (let startCol = 0, startRow = 0;
			 startCol < this.columns - this.winAmoumt; ++startCol){
			for(let col = startCol, row = startRow; col < this.columns && row < this.rows; ++col, ++row){
				let currentTeam = this.board[col][row];
				if (currentTeam !== 0 & currentTeam === lastTeam)
				{
					++connectionCount;
					if (connectionCount === this.winAmoumt - 1)
					{
						return lastTeam;
					}
				} else
				{
					connectionCount = 0;
				}
				lastTeam = currentTeam;
			}
			connectionCount = 0;
		}
		connectionCount = 0;
		for (let startCol = 1, startRow = 1;
			 startRow < this.rows - this.winAmoumt; ++startRow){
			for(let col = startCol, row = startRow; col < this.columns && row < this.rows; ++col, ++row){
				let currentTeam = this.board[col][row];
				if (currentTeam !== 0 & currentTeam === lastTeam)
				{
					++connectionCount;
					if (connectionCount === this.winAmoumt - 1)
					{
						return lastTeam;
					}
				} else
				{
					connectionCount = 0;
				}
				lastTeam = currentTeam;
			}
			connectionCount = 0;
		}
		connectionCount = 0;
		for (let startCol = this.columns - 1, startRow = 0;
			startCol >= this.winAmoumt - 1; --startCol){
			for(let col = startCol, row = startRow; col >= 0 && row < this.rows; --col, ++row){
				let currentTeam = this.board[col][row];
				if (currentTeam !== 0 & currentTeam === lastTeam)
				{
					++connectionCount;
					if (connectionCount === this.winAmoumt - 1)
					{
						return lastTeam;
					}
				} else
				{
					connectionCount = 0;
				}
				lastTeam = currentTeam;
			}
			connectionCount = 0;
		}
		connectionCount = 0;
		for (let startCol = this.columns - 1, startRow = 1;
			startRow < this.rows - this.winAmoumt; ++startRow){
			for(let col = startCol, row = startRow; col >= 0 && row < this.rows; --col, ++row){
				let currentTeam = this.board[col][row];
				if (currentTeam !== 0 & currentTeam === lastTeam)
				{
					++connectionCount;
					if (connectionCount === this.winAmoumt - 1)
					{
						return lastTeam;
					}
				} else
				{
					connectionCount = 0;
				}
				lastTeam = currentTeam;
			}
			connectionCount = 0;
		}
		// TODO Winning line animation
		return 0;
	}

	changeColorScheme(index)
	{
		if (index < 0 || index > colorSchemeArray.length)
		{
			return;
		}
		this.colorScheme = colorSchemeArray[index];
		for (let i = 0; i < this.visualChips.length; ++i)
		{
			let chip = this.visualChips[i];
			chip.color = this.colorScheme.teams[chip.team - 1];
		}
	}

	// Returns -1 if column is full
	// Returns -2 if input is invalid
	addChip(team, col)
	{
		// Validate column
		if (col < 0 || col >= this.columns)
		{
			return -2;
		}
		// Validate team
		if (team !== 1 && team !== 2)
		{
			return -2;
		}
		for (let i = 0; i < this.columns; ++i)
		{
			if (this.board[col][i] === 0)
			{
				this.private_addVisualChip(team, col);
				this.board[col][i] = team;
				this.private_updateActiveSlot();
				if (this.currentTeam === 1)
				{
					this.currentTeam = 2;
				} else
				{
					this.currentTeam = 1;
				}
				return 1;
			}
		}
		return -1;
	}

	// Adds a chip to be rendered
	private_addVisualChip(team, col)
	{
		if (team !== 1 && team !== 2)
		{
			throw "Exception: invalid team -> " + team;
			return;
		}
		// Get the slot that the chip will fall into
		let slot = this.private_getFirstAvailableInColumn(col);
		if (slot.x === -1 || slot.y === -1)
		{
			// No slot avaiable in that column
			return;
		}
		let yStart = this.private_getChipYStart();
		let coords = this.private_getCircleCoords(slot.x, slot.y);
		let chip = new GravityChip(team,
			coords.x,
			yStart,
			coords.y + this.radius, // Add the radius, because the bottom point is the contact point
			slot.x,
			slot.y,
			this.radius,
			this.colorScheme.teams[team - 1]);
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
		let winner = this.getWinner();
		if (winner !== 0){
			console.log("Winner: " + winner);
			this.clear();
		}
		this.size = getSizeGivenAspectRatio(80, 70, 6 / 7);
		this.coords = getRectCenteredCoordFromSize(this.size);

		// Fill board
		c.fillStyle = this.colorScheme.board;
		c.fillRect(this.coords.x, this.coords.y, this.size.x, this.size.y);

		// Get the dynamic radius of the circles
		let twoPercentX = 2 / 100 * this.size.x;
		this.radius = (this.size.x - 8 * twoPercentX) / (7 * 2);
		if (this.radius < 1)
		{
			this.radius = 1;
		}
		// Make board cutouts
		c.save();
		c.globalCompositeOperation = "destination-out";
		for (let i = 0; i < this.columns; ++i)
		{
			for (let j = 0; j < this.rows; ++j)
			{
				c.beginPath();
				let circleCoords = this.private_getCircleCoords(i, j);
				c.arc(circleCoords.x, circleCoords.y, this.radius, 0, 2 * pi, false);
				c.fill();
				c.closePath();
			}
		}
		c.restore();

		// Fill active slot
		let slot = this.activeSlot;
		let hasActiveSlot = slot.x !== -1 && slot.y !== -1;
		if (hasActiveSlot)
		{
			let activeSlotCoords = this.private_getCircleCoords(slot.x, slot.y);
			fillCircle(activeSlotCoords.x,
				activeSlotCoords.y,
				this.radius,
				this.colorScheme.teams[this.currentTeam - 1] + "88");
		}

		// Fill chips behind board
		c.save();
		c.globalCompositeOperation = "destination-over";
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
		c.restore();

		// Fill background behind everything
		c.save();
		c.globalCompositeOperation = "destination-over";
		c.fillStyle = this.colorScheme.background;
		c.fillRect(0, 0, canvasWidth, canvasHeight);
		c.restore();
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
	c.beginPath();
	c.fillStyle = color;
	c.arc(x, y, radius, 0, 2 * pi, false);
	c.fill();
	c.closePath();
}

$(function ()
{
	// Initialize canvas
	var canvas = document.querySelector('canvas');
	canvasWidth = canvas.width = window.innerWidth;
	canvasHeight = canvas.height = window.innerHeight;
	console.log(canvas);
	c = canvas.getContext("2d");

	// Update mouse variable on move
	window.addEventListener("mousemove", (event) =>
	{
		mouse.x = event.x;
		mouse.y = event.y;
	});

	window.addEventListener("resize", (event) =>
	{
		// Resize canvas to window size
		var canvas = document.querySelector('canvas');
		canvasWidth = canvas.width = window.innerWidth;
		canvasHeight = canvas.height = window.innerHeight;
	});

	// Make a board
	board = new Board();
	var i = 0;
	// Color switching and clearing
	$(document).keydown((event) =>
	{
		let colorChanged = false;
		switch (event.keyCode)
		{
			case 8:
				board.clear();
				break;
			case 38:
				++i;
				i %= colorSchemeArray.length;
				colorChanged = true;
				break;
			case 40:
				--i;
				if (i < 0)
				{
					i = colorSchemeArray.length - 1;
				}
				colorChanged = true;
				break;
		}
		if (colorChanged)
		{
			board.changeColorScheme(i);
		}
	});

	// Add the board and initialize draw function
	renderables.push(board);
	draw();
});

// Animation function to run every frame
function draw()
{
	requestAnimationFrame(draw);
	c.clearRect(0, 0, canvasWidth, canvasHeight);
	for (let i = 0; i < renderables.length; ++i)
	{
		renderables[i].render();
	}
}
