// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs");
 
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
 
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
 
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);
 
 
//Server variables:

var default_chatroom = {
	name:"default_chatroom",
	creator:"",
	currentUsers: [] ,
	bannedUsers: [],
	password: ""
}
var chatroomArray = [default_chatroom];
var userPMchatroomArray = [];
var userLocations = [];
 
 //Get list of chatrooms
 //Logging in (Quick method of sending the current username to server)
 //Change chatrooms
 //Create chatroom
 //Ban someone specific
 
 
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.
	socket.currentUsername ="";
	socket.currentRoom = default_chatroom.name;
	socket.join("default_chatroom");
	socket.currentRoom = "default_chatroom";
	
	//Update
	broadcastChatrooms();
	broadcastUsernames();
	function broadcastChatrooms() {
		var stringToSend = "";
		for (i=0; i<chatroomArray.length; i++) {
			stringToSend+=String(chatroomArray[i].name);
			if (i!=chatroomArray.length-1) {
				stringToSend+="~~~&#";
			}
		}
		io.emit("chatrooms_updated",{message:stringToSend});
	}
	function broadcastUsernames() {
		var stringToSend = "";
		for (i=0; i<userPMchatroomArray.length; i++) {
			stringToSend+=String(userPMchatroomArray[i]);
			if (i!=userPMchatroomArray.length-1) {
				stringToSend+="~~~&#";
			}
		}
		io.emit("usernames_updated",{message:stringToSend});
	}
	
	socket.on('setup', function(data){
		socket.currentUsername = data.username;
		console.log("currentUsername: "+data.username);
		io.to(socket.currentRoom).emit("message_to_client",{message: data.username + " has joined the room default_chatroom"}); // broadcast the message to other users
		
		userPMchatroomArray.push(socket.currentUsername);
		socket.join(socket.currentUsername);
		
		default_chatroom.currentUsers.push(socket.currentUsername);
		
		var me = {
			username: socket.currentUsername,
			location: "default_chatroom"
		}
		userLocations.push(me);
		
		broadcastUsernames();
		broadcastChatrooms();
	});
	
	socket.on('new_chatroom', function(data){
		if (findRoom(data.roomname)!=null && findPMRoom(data.roomname)!=null) {
			io.to(socket.currentUsername).emit("error_message",{message: "Chatroom "+data.roomname+ " already exists."});
		} else {
			var newChatroom = new Object();
			newChatroom.name = data["roomname"];
			newChatroom.creator = socket.currentUsername;
			newChatroom.currentUsers = [];
			newChatroom.bannedUsers = [];
			newChatroom.password = data["password"];
			chatroomArray.push(newChatroom);
			broadcastChatrooms();
		}
	});
	
	function findRoom(roomName) {
		for (i=0; i<chatroomArray.length; ++i) {
			if (roomName==chatroomArray[i].name) {
				return chatroomArray[i];
			}
		}
		return null;
	}
	function findPMRoom(roomName) {
		for (i=0; i<userPMchatroomArray.length; ++i) {
			if (roomName==userPMchatroomArray[i]) {
				return userPMchatroomArray[i];
			}
		}
		return null;
	}
	socket.on('switch_chatroom', function(data){
		if (data.roomname==socket.currentRoom) {
			io.to(socket.currentUsername).emit("error_message",{message: "You are already in "+socket.currentRoom+"."});
		} else {
			var nextRoom = findRoom(data.roomname);
			if (nextRoom!=null){
				
				if (banCheck(socket.currentUsername,data.roomname)) {
					io.to(socket.currentUsername).emit("error_message",{message: "You have been banned from "+socket.currentRoom+" by its creator. You cannot enter."});
				} else {
					//Didn't check passwords yet.
				
					if (nextRoom.password!="") {
						if (data.password==nextRoom.password){
							//Correct password
							socket.join(String(nextRoom.name));
							
							socket.leave(socket.currentRoom);
							socket.currentRoom = nextRoom.name;
							
							setLocation(socket.currentUsername, nextRoom.name);
							
							nextRoom.currentUsers.push(socket.currentUsername);
							io.to(socket.currentRoom).emit("message_to_client",{message: socket.currentUsername + " has joined the chatroom "+data.roomname}); // broadcast the message to other users
						} else {
							//Incorrect password
							io.to(socket.currentUsername).emit("error_message",{message: "Incorrect Password."});
						}
					} else {
						//No password for that chatroom
						socket.join(String(nextRoom.name));
						
						socket.leave(socket.currentRoom);
						socket.currentRoom = nextRoom.name;
						
						setLocation(socket.currentUsername, nextRoom.name);
					
						nextRoom.currentUsers.push(socket.currentUsername);
						io.to(socket.currentRoom).emit("message_to_client",{message: socket.currentUsername + " has joined the chatroom "+data.roomname}); // broadcast the message to other users
					}
				}
				
			} else {
				io.to(socket.currentUsername).emit("error_message",{message: "The room "+data.roomname+" does not exist."});
			}
		}	
	});
	
	socket.on('send_pm', function(data){
		//To your own private user stream and the other user's private stream (and lets them both know that)
		if (data.target!="") {
			if (data.message=="") {
				io.to(socket.currentUsername).emit("error_message",{message: "No sending blank private messages"});
			} else {
				if (findPMRoom(data.target)!=null) {
					io.to(socket.currentUsername).emit("message_to_client",{message: getTime()+":    PM from "+socket.currentUsername+" to "+data.target+": "+data.message});
					io.to(data.target).emit("message_to_client",{ message: getTime()+":    PM from "+socket.currentUsername+" to "+data.target+": "+data.message});
				} else {
					io.to(socket.currentUsername).emit("error_message",{message: "The user "+data.target+" does not exist."});
				}
			}
		} else {
			io.to(socket.currentUsername).emit("error_message",{message: "Target user is not set."});
		}
	});
	
	function findLocation(in_user_name) {
		for (i=0; i<userLocations.length; ++i){
			if (in_user_name==userLocations[i].username) {
				return userLocations[i].location;
			}
		}
		return null;
	}
	function setLocation(in_user_name, in_location) {
		if (findRoom(in_location)==null || findRoom(in_location).password!="") {
				in_location = "default_chatroom";
		}
		for (i=0; i<userLocations.length; ++i){
			if (in_user_name==userLocations[i].username) {
				userLocations[i].location=in_location;
				return in_location;
			}
		}
		return null;
	}
	
	function banCheck(in_user_name, in_room_name) {
		var room_to_check=findRoom(in_room_name);
		for (i=0; i<room_to_check.bannedUsers.length; ++i) {
			if (room_to_check.bannedUsers[i]==in_user_name){
				return true;
			}
		}
		return false;
	}
	
	function getTime() {
		var today = new Date(); //Now
		var Hours = today.getHours();
		var Minutes = today.getMinutes();
		if (Number(Minutes)<10) {
			Minutes = "0"+Minutes;
		}
		var toReturn = Hours+":"+Minutes;
		return toReturn;
	}
	
	socket.on('kick', function(data){
		if (data.target!="") {
		if (socket.currentUsername==findRoom(socket.currentRoom).creator) {
			var stringToSend = "KICK: You has been kicked out of "+socket.currentRoom+"by the creator";
			if (data.message!="") {
				stringToSend += ": " + data.message;
			}
			io.to(socket.currentUsername).emit("message_to_client",{message: "You have kicked "+data.target+" out from your room "+socket.currentRoom});
			io.to(data.target).emit("message_to_client",{message: stringToSend});
			io.to(data.target).emit("message_to_client",{message: "You have been moved to "+setLocation(data.target, "default_chatroom")});
		} else {
			io.to(socket.currentUsername).emit("error_message",{message: "You can't kick someone from a chatroom you didn't create."});
		}
		} else {
			io.to(socket.currentUsername).emit("error_message",{message: "Target user is not set."});
		}
		
		
	});
	socket.on('ban',function(data){
		if (data.target!="") {
		if (socket.currentUsername==findRoom(socket.currentRoom).creator) {
			//Check if you're the creator
			findRoom(socket.currentRoom).bannedUsers.push(data.target);
			
			var stringToSend = "BAN: You has been banned from "+socket.currentRoom+" by the creator";
			if (data.message!="") {
				stringToSend += ": " + data.message;
			}
			io.to(socket.currentUsername).emit("message_to_client",{message: "You have banned "+data.target+" from your room "+socket.currentRoom});
			io.to(data.target).emit("message_to_client",{message: stringToSend});
			io.to(data.target).emit("message_to_client",{message: "You have been moved to "+setLocation(data.target, "default_chatroom")});
		} else {
			io.to(socket.currentUsername).emit("error_message",{message: "You can't ban someone from a chatroom you didn't create."});
		}
		} else {
			io.to(socket.currentUsername).emit("error_message",{message: "Target user is not set."});
		}
	});
	
	socket.on('message_to_server', function(data) {
		// This callback runs when the server receives a new message from the client.
		
		if (data.message=="") {
			io.to(socket.currentUsername).emit("error_message",{message: "No sending blank messages"});
		} else {
			var newLoc = findLocation(socket.currentUsername);
			if (socket.currentRoom!=newLoc) {
				//setLocation, which is what other users use to move you out of their room into a
				//different room, only is able to move you to
				//1) a room that exists and
				//2) a room that doesn't have a password.
				//If they try moving you to an impossible room, you are moved to default_chatroom.
				socket.leave(socket.currentRoom);
				socket.join(newLoc);
				socket.currentRoom = newLoc;
			}
			//No matter what, the message still sends.
			console.log("message: "+data["message"]); // log it to the Node.JS output
			io.to(socket.currentRoom).emit("message_to_client",{message:getTime()+":    "+data["message"] }); // broadcast the message to other users
		}
		
		});
	
	socket.on('disconnect', function(){
		if (socket.currentUsername!="") {
		//If the person had already signed in and chose a username
			io.to(socket.currentRoom).emit("message_to_client",{message: socket.currentUsername+" has left"});
			console.log(socket.currentUsername+" left the chatroom");
			
			//Removing the user from the lists of users stored on the server
			var indexOfLeaver = userPMchatroomArray.indexOf(socket.currentUsername);
			if (indexOfLeaver > -1) {
				userPMchatroomArray.splice(indexOfLeaver, 1);
			}
			var indexOfLeaverInLoc = userLocations.indexOf(socket.currentUsername);
			if (indexOfLeaverInLoc > -1) {
				userLocations.splice(indexOfLeaverInLoc, 1);
			}
			broadcastUsernames();
			
		}
	});
});