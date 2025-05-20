/*
 * utils.js
 * Contient des fonctions utilitaires générales pour le serveur
 
 * Copyright 2025-present Claude ROUX
 * The 3-Clause BSD License
 */

const WebSocket = require('ws');
const http = require('http');

// Create a simple HTTP server (needed for WebSocketServer)
const server = http.createServer((req, res) => {
    // This server only hosts WebSockets, you can serve static files here later if needed
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Kriegspiel Map WebSocket server\n');
});

const wss = new WebSocket.Server({ server });

let blueClient = null;
let redClient = null;
let gameInProgress = false; // Track if a game is active

console.log('Kriegspiel Map WebSocket server started on port 8080');

wss.on('connection', (ws) => {
    console.log('New client connected.');

    // Assign roles (Blue is first, Red is second)
    if (!blueClient) {
        blueClient = ws;
        ws.armyColor = 'blue';
        console.log('Client assigned: Blue');
        ws.send(JSON.stringify({ type: 'ASSIGN_COLOR', color: 'blue' }));
        console.log('Waiting for the second player (Red)...');


    } else if (!redClient) {
        redClient = ws;
        ws.armyColor = 'red';
        console.log('Client assigned: Red');
        ws.send(JSON.stringify({ type: 'ASSIGN_COLOR', color: 'red' }));
        console.log('Both players are connected.');
        gameInProgress = true; // Mark game as in progress

        // *** NEW: Notify the Blue client that the Red player is connected ***
        if (blueClient && blueClient.readyState === WebSocket.OPEN) {
             blueClient.send(JSON.stringify({ type: 'RED_PLAYER_CONNECTED' }));
             console.log('Notified the Blue client that the Red player is connected.');
        }
        // *** END NEW ***


    } else {
        console.log('Too many clients connected. Connection refused.');
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Game already full.' }));
        ws.close();
        return;
    }

    ws.on('message', (message) => {
        // console.log(`Message received from ${ws.armyColor}: ${message}`); // Too chatty for sync messages
        try {
            const data = JSON.parse(message);

            // *** NEW: Handle Chat Messages ***
            if (data.type === 'CHAT_MESSAGE') {
                console.log(`Chat message from ${ws.armyColor}: ${data.text}`);
                // Relay the chat message to the OTHER client
                if (ws.armyColor === 'blue' && redClient && redClient.readyState === WebSocket.OPEN) {
                     // Relay from Blue to Red
                     redClient.send(JSON.stringify(data));
                     console.log('Relayed chat message from Blue to Red.');
                } else if (ws.armyColor === 'red' && blueClient && blueClient.readyState === WebSocket.OPEN) {
                     // Relay from Red to Blue
                     blueClient.send(JSON.stringify(data));
                     console.log('Relayed chat message from Red to Blue.');
                } else {
                     console.warn(`Cannot relay chat message from ${ws.armyColor}: Other client not connected or not ready.`);
                }
                return; // Stop processing this message further after handling chat

            }
            // *** END NEW ***

            // Relay other messages (like MOVE_ORDER, STATE_SYNC, GAME_STATE, etc.)
            if (ws.armyColor === 'blue' && redClient && redClient.readyState === WebSocket.OPEN) {
                // Relay all messages from Blue to Red
                redClient.send(JSON.stringify(data));
                // console.log(`Relayed message type ${data.type} from Blue to Red`); // Too chatty

            } else if (ws.armyColor === 'red' && blueClient && blueClient.readyState === WebSocket.OPEN) {
                // Relay all messages from Red to Blue
                blueClient.send(JSON.stringify(data));
                // console.log(`Relayed message type ${data.type} from Red to Blue`); // Too chatty

            } else {
                // This case might occur if the other client disconnected.
                // The sending client should ideally handle this (ws.readyState check before send).
                // The server could also send a PLAYER_LEFT message here if it detects a message
                // for a client that is no longer OPEN.
                console.warn(`Unable to relay message type ${data.type} from ${ws.armyColor}: Target client not connected or not ready.`);
            }

        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`${ws.armyColor} client disconnected (Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}).`);
        const disconnectedColor = ws.armyColor;

        if (disconnectedColor === 'blue') {
            blueClient = null;
            gameInProgress = false; // Game ends if Blue leaves
             // Notify Red that Blue has left
             if (redClient && redClient.readyState === WebSocket.OPEN) {
                 redClient.send(JSON.stringify({ type: 'PLAYER_LEFT', army: 'blue' }));
             }

        } else if (disconnectedColor === 'red') {
            redClient = null;
            // Notify Blue that Red has left
            if (blueClient && blueClient.readyState === WebSocket.OPEN) {
                 blueClient.send(JSON.stringify({ type: 'PLAYER_LEFT', army: 'red' }));
             }
        }

        console.log(`Client status: Blue=${blueClient ? 'Connected' : 'Disconnected'}, Red=${redClient ? 'Connected' : 'Disconnected'}`);
        if (!blueClient && !redClient) {
            gameInProgress = false; // Ensure gameInProgress is false if both leave
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.armyColor}:`, error);
         // The 'close' event usually follows an 'error' event.
    });
});

// Start the HTTP server listening
server.listen(8080, () => {
    console.log('HTTP server (for WebSockets) listening on port 8080');
});