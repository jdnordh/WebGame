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

var userTemplate = { username: "user1", usernameColor: "RRGGBB", socketId: 0 };
var chatMessages = [];
var userDictionary = {};
var chatCommands = [
	{
		// Nickname command
		regex: /^\/nick .+/, handler: (instanceIo, socket, username, command) => {
			var internalRegex = /^(?:\/nick\s+)(.+)/gm;
			var m;
			var groups = [];
			while ((m = internalRegex.exec(command))) {
				groups.push(m[1]);
			}
			if (groups.length === 0) {
				// Send usage message
				var usage = { text: formatMessageNoDate("Usage", "888", "/nick nickname") };
				socket.emit("chatMessage", usage);
				return;
			}
			var newUsername = makeStringAlphaNumeric(groups[0]);
			if (newUsername.length > 64) {
				newUsername = newUsername.substring(0, 63);
			}
			if (newUsername === username) {
				return;
			}
			if (usernameIsAvailable()) {
				// Re-register as new username
				registerUsername(newUsername, socket, userDictionary[username].usernameColor);
				unregisterUsername(username);
				socket.emit("usernameResponse", newUsername);
				instanceIo.emit("userListUpdate", getUsernames());
				console.log("'" + username + "' renamed to '" + newUsername + "'");
			} else {
				// Send name taken message
				var taken = { text: formatMessageNoDate("Error", "888", "That name is already taken.") };
				socket.emit("chatMessage", taken);
			}
		}
	},
	{
		// Nickname color command
		regex: /^\/nickcolor .+/, handler: (instanceIo, socket, username, command) => {
			var internalRegex = /^(?:\/nickcolor\s+)([\da-fA-F]{6})/gm;
			var m;
			var groups = [];
			while ((m = internalRegex.exec(command))) {
				groups.push(m[1]);
			}
			if (groups.length === 0) {
				// Send usage message
				var msg = { text: formatMessageNoDate("Usage", "888", "/nickcolor RRGGBB") };
				socket.emit("chatMessage", msg);
				return;
			}
			var newColor = groups[0];
			if (usernameIsRegistered(username)) {
				userDictionary[username].usernameColor = newColor;
				instanceIo.emit("userListUpdate", getUsernames());
			}
		}
	},
	{
		// Help command
		regex: /^\/help/, handler: (instanceIo, socket, username, command) => {
			// Send usage message
			var msg = { text: formatMessageNoDate("Help", "888", "<p>/nick [nickname] to change nickname</p><p>/nickcolor [RRGGBB] to change nickname color</p><p>/help to see this message</p>") };
			socket.emit("chatMessage", msg);
		}
	}];

io.on("connection", (socket) => {
	// On chat message sent
	socket.on("chatMessage",
		(msg) => {
			// Limit the length of messages
			if (msg.text.length > 1000) {
				msg.text = msg.text.substring(0, 999);
			}

			// Replace any injections
			msg.username = makeStringSafe(msg.username);
			msg.text = makeStringSafe(msg.text);

			// Verify username
			if (!usernameIsRegistered(msg.username)) {
				return;
			}

			// Make sure there's actually a message
			if (msg.text && msg.text.length > 0) {
				// Check for commands
				if (msg.text[0] === "/") {
					for (var i = 0; i < chatCommands.length; ++i) {
						var command = chatCommands[i];
						var matches = msg.text.match(command.regex);
						if (matches && matches.length > 0) {
							command.handler(io, socket, msg.username, msg.text);
							return;
						}
					}
					// If command not recognized, offer help command
					var help = { text: formatMessageNoDate("Error", "888", "Use '/help' to see command usage.") };
					socket.emit("chatMessage", help);
					return;
				}
				msg.timeSent = getCurrentTime();
				msg.text = formatMessage(msg.username, userDictionary[msg.username].usernameColor, msg.text);
				io.emit("chatMessage", msg);
				chatMessages.push(msg);
				if (chatMessages.length > 1000) {
					chatMessages = chatMessages.slice(1, chatMessages.length - 1);
				}
			}
		});

	// On client connecting and trying to register a nickname
	socket.on("usernameRequest",
		(username) => {
			// Username will be null/empty if no username found in cookies
			var registeredUsername = "";
			if (username) {
				var safeUsername = makeStringSafe(username);

				if (safeUsername.length > 64) {
					safeUsername = safeUsername.substring(0, 63);
				}
				// Check if username is available
				if (usernameIsAvailable(safeUsername)) {
					registerUsername(safeUsername, socket);
					registeredUsername = safeUsername;
				}
			}
			if (!registeredUsername) {
				registeredUsername = generateNewUsername();

				var available = usernameIsAvailable(registeredUsername);
				while (!available) {
					registeredUsername = generateNewUsername();
					available = usernameIsAvailable(registeredUsername);
				}
				registerUsername(registeredUsername, socket);
			}
			socket.emit("usernameResponse", registeredUsername);
			io.emit("userListUpdate", getUsernames());
		});

	// Send chat log
	socket.emit("chatLogUpdate", chatMessages);

	// Unregister on disconnect
	socket.on("disconnect",
		(data) => {
			var keys = Object.keys(userDictionary);
			for (var i = 0; i < keys.length; ++i) {
				if (userDictionary[keys[i]].socketId === socket.id) {
					unregisterUsername(userDictionary[keys[i]].username);
					io.emit("userListUpdate", getUsernames());
					return;
				}
			}
		});
});

// Start the server
http.listen(3000, function () {
	console.log("listening on *:3000");
});

// Get an array of usernames in html
function getUsernames() {
	var keys = Object.keys(userDictionary);
	var usernames = [];
	for (var i = 0; i < keys.length; ++i) {
		usernames.push(formatUsername(keys[i]));
	}
	return usernames;
}

// Generates a new username
function generateNewUsername() {
	var index = Math.floor(Math.random() * 10);
	var names = ["Martha", "Lil Debbie", "Johnny", "Tessa", "Brick", "Yachub", "Trae", "Donatello", "Trip", "Fetty"];
	return names[index] + (Math.floor(Math.random() * 998) + 1);
}

// Check if the username is registered
function usernameIsRegistered(username) {
	return !usernameIsAvailable(username);
}

// Check if the username is available
function usernameIsAvailable(username) {
	return userDictionary[username] == null;
}

// Register a username with a socket and username color
function registerUsername(username, socket, usernameColor = "000000") {
	if (!usernameIsAvailable(username)) {
		return false;
	} else {
		userDictionary[username] = { username: username, usernameColor: usernameColor, socketId: socket.id };
		console.log("Registered user: " + username);
		return true;
	}
}

// Unregisters a username from the system
function unregisterUsername(username) {
	delete userDictionary[username];
	console.log("Unregistered user: " + username);
}

// Removes any html tags from a string
function makeStringSafe(string) {
	return string.replace(/<\/?.+?>/gm, "");
}

// Removes all non-alphanumeric characters
function makeStringAlphaNumeric(string) {
	string = string.replace(/\s+/gm, " ");
	return string.replace(/\W/gmi, "");
}

// Formats a message for the chat
function formatMessage(username, color, message) {
	return getCurrentTime() + " <span style=\"color:#" + color + "\">" + username + "</span>: " + message;
}

// Formats a message for the chat from the server
function formatMessageNoDate(username, color, message) {
	return "<span style=\"color:#" + color + "\">" + username + "</span>: " + message;
}

// Formats a username for the user list
function formatUsername(username) {
	return "<span style=\"color:#" + userDictionary[username].usernameColor + "\">" + username + "</span>";
}

// Get the current time
function getCurrentTime() {
	var date = new Date();
	return ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2);
}