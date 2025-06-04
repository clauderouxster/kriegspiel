// *** NEW : Variable to track game state (finished or not) ***
let gameOver = false; // Flag to indicate if the game has ended
// *** END NEW ***

let messageChat = null;

// *** NEW : Synchronization sequence number ***
let syncSequenceNumber = 0; // For Blue player: Incremented for each STATE_SYNC sent
let lastReceivedSyncSequenceNumber = -1; // For Red player: Tracks the last processed sequence number


// ============================================================================
// Multiplayer Variables and Functions
// ============================================================================
let ws = null; // WebSocket connection
let playerArmyColor = null; // Will be assigned 'blue' or 'red'
let syncIntervalId = null; // For periodic state synchronization from Blue


/**
 * Establishes the WebSocket connection to the server.
 */
function connectToServer() {
    const serverAddressInput = document.getElementById('serverAddressInput');
    const serverAddress = serverAddressInput.value.trim(); // Get server address from input

    if (!serverAddress) {
        console.error("Please enter the server address.");
        return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("Already connected to the server.");
        return;
    }

    console.log(`Attempting WebSocket connection to ${serverAddress}...`);
    // Use ws:// for WebSocket, wss:// for Secure WebSocket
    if (serverAddress.includes('.ngrok')) 
        ws = new WebSocket(`wss://${serverAddress}`); // Assuming ws for local testing
    else
        ws = new WebSocket(`ws://${serverAddress}`); // Assuming ws for local testing

    ws.onopen = () => {
        console.log('WebSocket connection established.');
        // The server will send the ASSIGN_COLOR message upon connection
        document.getElementById('connectButton').disabled = true; // Disable button after connecting
        serverAddressInput.disabled = true;
        console.log("Waiting for army assignment...");
        gameOver = false;
        messageEndGame = null;
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // originalConsoleLog(`[ws.onmessage] Received message type: ${data.type}`); // Too chatty

        switch (data.type) {
            case 'ASSIGN_COLOR':
                // The server tells us which army we are
                playerArmyColor = data.color === 'blue' ? ARMY_COLOR_BLUE : ARMY_COLOR_RED;
                console.log(`Assigned as player: ${data.color === 'blue' ? 'Blue' : 'Red'}`);

                // --- NEW : Wait for the Red player to connect (for Blue) ---
                if (playerArmyColor === ARMY_COLOR_BLUE) {
                    console.log("Waiting for the Red player to connect...");
                    // Blue waits for RED_PLAYER_CONNECTED message
                    // Disable regeneration until game starts
                    document.getElementById('regenerateButton').disabled = true;
                    document.getElementById('mapHeightSelect').disabled = true;

                } else { // playerArmyColor === ARMY_COLOR_RED
                    // Red waits for GAME_STATE message from Blue
                    console.log("Waiting for initial game state from Blue player...");
                    // Disable regeneration for Red player in multiplayer
                    document.getElementById('regenerateButton').disabled = true;
                    document.getElementById('mapHeightSelect').disabled = false; // Red can change map height to request new size from Blue
                }
                // --- END NEW ---

                // The game loop is now requested later, when the initial state is ready for the client
                // Do NOT request requestAnimationFrame(gameLoop) here anymore


                break;

            // --- NEW : Message indicating that the Red player is connected (for Blue) ---
            case 'RED_PLAYER_CONNECTED':
                if (playerArmyColor === ARMY_COLOR_BLUE) {
                    console.log("The Red player is connected. You can start the game.");
                    // Show the Start button to the Blue player
                    if (startButton) {
                        startButton.style.display = 'inline-block'; // Or 'block', depending on layout
                        originalConsoleLog("[ws.onmessage] RED_PLAYER_CONNECTED received, showing Start button.");
                    } else {
                        originalConsoleWarn("[ws.onmessage] RED_PLAYER_CONNECTED received but Start button element not found.");
                    }
                    // Re-enable map generation controls for Blue player
                    document.getElementById('regenerateButton').disabled = false;
                    document.getElementById('mapHeightSelect').disabled = false;


                } else {
                    // Red should not receive this message, or can ignore it
                    originalConsoleLog("[ws.onmessage] Received RED_PLAYER_CONNECTED but client is Red. Ignoring.");
                }
                break;
            // --- END NEW ---

            case 'GAME_STATE':
                // Red player receives the initial state from Blue
                if (playerArmyColor === ARMY_COLOR_RED) {
                    console.log('Received initial game state. Loading...');
                    loadGameStateFromJson(data.state);
                    // After loading the state, Red starts its game loop
                    if (gameLoopInterval === null) {
                        lastRealTime = performance.now(); // Initialize lastRealTime when game starts
                        gameLoopInterval = requestAnimationFrame(gameLoop);
                        originalConsoleLog("[ws.onmessage] Game loop requested after GAME_STATE loaded (Red).");
                    }
                    // Red player does NOT start sync interval
                } else {
                    // Blue player might receive its own GAME_STATE message echoed by the server
                    // or if re-connecting. If it's from a fresh start, ignore.
                    originalConsoleLog("[ws.onmessage] Received GAME_STATE but client is Blue. Ignoring.");
                }
                break;
            case 'MOVE_ORDER':
                // Process received move orders only if they are for the *enemy* units
                // Blue processes Red's orders, Red processes Blue's orders.
                handleReceivedMoveOrder(data);
                break;
            case 'COMBAT_RESULT':
                // Red player receives combat results from Blue
                if (playerArmyColor === ARMY_COLOR_RED) {
                    handleReceivedCombatResult(data);
                } else {
                    // Blue receives its own combat result message, can ignore
                    // originalConsoleLog("[ws.onmessage] Received own COMBAT_RESULT. Ignoring."); // Too chatty
                }
                break;
            case 'STATE_SYNC': // Periodic state sync from Blue to Red
                // Only Red player needs to process this
                if (playerArmyColor === ARMY_COLOR_RED) {
                    handleReceivedStateSync(data);
                }
                break;
            case 'GAME_OVER':
                // Both clients might receive this, but only Red acts on it from the server.
                // Blue calls endGame directly.
                if (playerArmyColor === ARMY_COLOR_RED) {
                    originalConsoleLog("[ws.onmessage] Red client received GAME_OVER message from Blue.");
                    handleGameOver(data.outcome); // Handle the game over state for Red
                }
                break;
            case 'PLAY_SOUND':
                playTrumpetSound();
                break;
            case 'PLAYER_LEFT':
                console.warn(`${data.army === 'blue' ? 'The Blue player' : 'The Red player'} has left the game.`);
                stopSyncInterval(); // Stop sending sync if we were Blue
                // Potentially stop game loop, disable controls, show message.
                if (gameLoopInterval !== null) {
                    cancelAnimationFrame(gameLoopInterval);
                    gameLoopInterval = null;
                    console.log("Game ended due to opponent disconnection.");
                }
                document.getElementById('connectButton').disabled = false; // Allow reconnecting/starting new game
                serverAddressInput.disabled = false;
                document.getElementById('regenerateButton').disabled = false; // Re-enable regeneration
                document.getElementById('mapHeightSelect').disabled = false; // Re-enable height selection
                if (startButton) startButton.style.display = 'none'; // Hide start button if a player leaves


                // Clear game state? Or leave it as is? Clearing might be cleaner.
                map = null;
                currentUnits = [];
                unitOnId.clear();
                currentMapRows = 0;
                currentMapCols = 0;
                selectedUnit = null;
                combatHexes.clear();
                visibleHexes = [];
                playerArmyColor = null; // Reset player color
                gameOver = false; // Reset game over flag
                messageEndGame = null;
                drawMapAndUnits(ctx, null, [], HEX_SIZE, TerrainColors); // Draw empty screen or start state

                break;

            // *** NEW: Handle incoming chat messages ***
            case 'CHAT_MESSAGE':
                 // Display the received chat message in the console output
                 const senderColor = playerArmyColor === ARMY_COLOR_BLUE ? 'Red' : 'Blue';
                 messageChat = `${senderColor}: ${data.text}`;
                 originalConsoleLog(`[ws.onmessage] Received chat message from ${data.sender}: "${data.text}"`);
                 break;
            // *** END NEW ***

            default:
                console.warn(`Unknown message type: ${data.type}`, data);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.log('Unable to connect to the server.');
        document.getElementById('connectButton').disabled = false;
        serverAddressInput.disabled = false;
        stopSyncInterval(); // Ensure sync stops on error
        if (startButton) startButton.style.display = 'none'; // Hide start button on error
        if (gameLoopInterval !== null) { // Stop game loop on network error
            cancelAnimationFrame(gameLoopInterval);
            gameLoopInterval = null;
        }
        playerArmyColor = null; // Reset player color
        map = null; currentUnits = []; currentMapRows = 0; currentMapCols = 0; selectedUnit = null; combatHexes.clear(); visibleHexes = [];
        unitOnId.clear();
        drawMapAndUnits(ctx, null, [], HEX_SIZE, TerrainColors); // Draw empty screen
        gameOver = false; // Reset game over flag
        messageEndGame = null;
    };

    ws.onclose = (event) => {
        console.log('WebSocket connection closed.', event.code, event.reason);
        document.getElementById('connectButton').disabled = false;
        serverAddressInput.disabled = false;
        stopSyncInterval(); // Ensure sync stops on close
        if (startButton) startButton.style.display = 'none'; // Hide start button on close
        if (gameLoopInterval !== null) { // Stop game loop on close
            cancelAnimationFrame(gameLoopInterval);
            gameLoopInterval = null;
        }
        playerArmyColor = null; // Reset player color
        map = null; currentUnits = []; currentMapRows = 0; currentMapCols = 0; selectedUnit = null; combatHexes.clear(); visibleHexes = [];
        unitOnId.clear();
        drawMapAndUnits(ctx, null, [], HEX_SIZE, TerrainColors); // Draw empty screen
        gameOver = false; // Reset game over flag
        messageEndGame = null;
        // Handle game state if closed unexpectedly (like PLAYER_LEFT)
    };
}

/**
 * Handles a received move order from the other player.
 * Updates the target position for the specified enemy unit.
 * @param {object} data - The parsed message data for the move order.
 */
function handleReceivedMoveOrder(data) {
    // Find the unit by ID
    //const unitToMove = currentUnits.find(unit => unit && unit.id === data.unitId);
    const unitToMove = unitOnId.get(data.unitId);

    if (unitToMove) {
        // A client should only process MOVE_ORDER messages for the *enemy* army.
        // Blue client processes MOVE_ORDER for Red units.
        // Red client processes MOVE_ORDER for Blue units.
        // Update the unit's target and reset movement progress to start new pathfinding locally
        unitToMove.targetRow = data.targetR;
        unitToMove.targetCol = data.targetC;
        unitToMove.movementProgress = 0; // Reset progress for the new move
        unitToMove.previousRow = unitToMove.row; // Update previous
        unitToMove.previousCol = unitToMove.col;
        // The gameLoop's movement processing will pick up this new target.
        // Visibility will be updated in gameLoop or on next sync.
    } else {
        originalConsoleWarn(`[handleReceivedMoveOrder] Received MOVE_ORDER for unknown unit ID ${data.unitId}.`);
    }
}

/**
 * Handles a received combat result from the Blue player.
 * Updates unit health and eliminates units on the Red client.
 * @param {object} data - The parsed message data for the combat result.
 */
function handleReceivedCombatResult(data) {
    originalConsoleLog("[handleReceivedCombatResult] Received COMBAT_RESULT update.");

    // Apply the health updates received from the Blue client
    if (data.updatedUnits && Array.isArray(data.updatedUnits)) {
        const unitsMap = new Map(currentUnits.map(unit => [unit.id, unit])); // Map local units by ID

        data.updatedUnits.forEach(updatedUnitData => {
            const localUnit = unitsMap.get(updatedUnitData.id);
            if (localUnit) {
                // Update the health based on the official result from Blue
                const oldHealth = localUnit.health;
                localUnit.health = updatedUnitData.health;
                if (localUnit.health !== oldHealth) {
                    // Optional: Log if health actually changed
                    originalConsoleLog(`[handleReceivedCombatResult] Updated health for unit ID ${localUnit.id} (${getUnitTypeName(localUnit.type)}) from ${oldHealth.toFixed(2)} to ${localUnit.health.toFixed(2)}.`);
                }
                // Ensure position is also in sync (should match STATE_SYNC, but doesn't hurt)
                localUnit.row = updatedUnitData.row;
                localUnit.col = updatedUnitData.col;
                // Also sync target and movement progress from combat result if needed?
                // No, STATE_SYNC is the main source for these. Combat result is just health/elimination.

            } else {
                originalConsoleWarn(`[handleReceivedCombatResult] Received health update for unknown unit ID ${updatedUnitData.id}.`);
            }
        });
    }

    // Apply eliminations received from the Blue client
    if (data.eliminatedUnitIds && Array.isArray(data.eliminatedUnitIds)) {
        const eliminatedSet = new Set(data.eliminatedUnitIds);
        const unitsBefore = currentUnits.length;
        unitOnId.clear();

        currentUnits = currentUnits.filter(unit => {
            if (unit && eliminatedSet.has(unit.id)) {
                originalConsoleLog(`[handleReceivedCombatResult] Eliminating unit ID ${unit.id} (${getUnitTypeName(unit.type)}) from local state (via network sync).`);
                console.log(`${getUnitTypeName(unit.type)} of the ${unit.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army at (${unit.row}, ${unit.col}) has been eliminated.`);
                // No need to reset target/progress/previous, the unit is removed
                return false; // Remove the unit
            }
            unitOnId.set(unit.id, unit);
            return unit !== null && unit !== undefined;
        });
        if (unitsBefore !== currentUnits.length) {
            originalConsoleLog(`[handleReceivedCombatResult] Eliminated ${unitsBefore - currentUnits.length} units. Total remaining: ${currentUnits.length}.`);
        }
    }

    // Update visibility after units might have been removed or health changed significantly
    updateVisibility();
    // The redraw happens in the gameLoop, which is running.
}


/**
 * Handles a received state synchronization message from the Blue player.
 * Updates local game state based on the received data.
 * @param {object} data - The parsed message data containing the state snapshot.
 */
function handleReceivedStateSync(data) {
    // This message is only processed by the Red client
    if (playerArmyColor !== ARMY_COLOR_RED) {
        return;
    }

    // *** NEW: Check sequence number ***
    const receivedSequenceNumber = data.state.sequenceNumber;
    if (receivedSequenceNumber <= lastReceivedSyncSequenceNumber) {
        originalConsoleLog(`[handleReceivedStateSync] Red: Ignoring STATE_SYNC with sequence number ${receivedSequenceNumber} (last processed: ${lastReceivedSyncSequenceNumber}). Out of order or duplicate.`);
        return;
    }
    // Update the last received sequence number
    lastReceivedSyncSequenceNumber = receivedSequenceNumber;
    originalConsoleLog(`[handleReceivedStateSync] Red: Processing STATE_SYNC with sequence number ${receivedSequenceNumber}.`);
    // *** END NEW ***

    const receivedState = data.state;

    // Update game time based on Blue's clock
    gameTimeInMinutes = receivedState.gameTimeInMinutes;

    // Update map data and dimensions
    if (receivedState.map && Array.isArray(receivedState.map) && receivedState.map.length > 0) {
        map = receivedState.map;
        currentMapRows = receivedState.currentMapRows !== undefined ? receivedState.currentMapRows : map.length;
        currentMapCols = receivedState.currentMapCols !== undefined ? receivedState.currentMapCols : (map[0] ? map[0].length : 0);

        // Adjust canvas size based on synced map dimensions
        if (canvas && ctx) {
            const canvasWidth = (currentMapCols + currentMapCols/6) * HEX_SIZE * 1.5 + HEX_SIZE * 0.5;
            const canvasHeight = (currentMapRows + currentMapRows/7) * HEX_SIZE * Math.sqrt(3) * 0.75 + HEX_SIZE * Math.sqrt(3) * 0.25 + CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2 + 20;
            if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                originalConsoleLog(`[handleReceivedStateSync] Red: Canvas resized to Width=${canvasWidth}, Height=${canvasHeight} based on sync.`);
            }

            // Update console width based on new canvas size
            if (consoleOutputDiv) {
                consoleOutputDiv.style.width = canvas.width + 'px';
                consoleOutputDiv.style.margin = '10px auto';
            }
        } else {
            originalConsoleWarn("[handleReceivedStateSync] Red: Canvas or context not available for resizing during state sync.");
        }
    } else {
        originalConsoleWarn("[handleReceivedStateSync] Red: Received STATE_SYNC with no map data or invalid map data.");
    }

    // Update unit states based on Blue's snapshot
    if (receivedState.units && Array.isArray(receivedState.units)) {
        const receivedUnitsMap = new Map(receivedState.units.map(unit => [unit.id, unit]));
        const updatedUnitsList = [];
        const localUnitIdsBeforeSync = new Set(currentUnits.map(unit => unit.id));

        receivedState.units.forEach(syncedUnitData => {
            //const localUnit = currentUnits.find(unit => unit && unit.id === syncedUnitData.id);
            const localUnit = unitOnId.get(syncedUnitData.id);

            if (localUnit) {
                localUnit.row = syncedUnitData.row;
                localUnit.col = syncedUnitData.col;
                localUnit.health = syncedUnitData.health;
                localUnit.targetRow = syncedUnitData.targetRow;
                localUnit.targetCol = syncedUnitData.targetCol;
                localUnit.movementProgress = syncedUnitData.movementProgress;
                localUnit.type = syncedUnitData.type;
                localUnit.armyColor = syncedUnitData.armyColor;
                localUnit.previousRow = syncedUnitData.previousRow;
                localUnit.previousCol = syncedUnitData.previousCol;
                updatedUnitsList.push(localUnit);
                localUnitIdsBeforeSync.delete(localUnit.id);
            } else {
                originalConsoleLog(`[handleReceivedStateSync] Red: Adding unit ID ${syncedUnitData.id} from sync (not found locally).`);
                updatedUnitsList.push({
                    id: syncedUnitData.id,
                    type: syncedUnitData.type,
                    armyColor: syncedUnitData.armyColor,
                    row: syncedUnitData.row,
                    col: syncedUnitData.col,
                    health: syncedUnitData.health,
                    targetRow: syncedUnitData.targetRow,
                    targetCol: syncedUnitData.targetCol,
                    movementProgress: syncedUnitData.movementProgress,
                    previousRow: syncedUnitData.previousRow,
                    previousCol: syncedUnitData.previousCol
                });
            }
        });

        unitOnId.clear();
        currentUnits = updatedUnitsList.filter(unit => unit && receivedUnitsMap.has(unit.id) && unitOnId.set(unit.id, unit));
        
        // Synchronize combat hexes
        if (receivedState.combatHexes && Array.isArray(receivedState.combatHexes)) {
            combatHexes.clear();
            receivedState.combatHexes.forEach(hexKey => {
                combatHexes.add(hexKey);
            });
        } else {
            if (combatHexes.size > 0) {
                combatHexes.clear();
            }
        }
    } else {
        originalConsoleWarn("[handleReceivedStateSync] Red: Received STATE_SYNC with no unit data or invalid unit data.");
    }

    // Update visibility after applying state changes
    updateVisibility();
}

/**
 * Starts the periodic state synchronization interval.
 * Only called on the Blue client.
 */
function startSyncInterval() {
    // Ensure this is only called for the Blue player
    // Ensure sync doesn't start if game is already over
    if (gameOver) {
        originalConsoleWarn("[startSyncInterval] Attempted to start sync interval but game is over. Ignoring.");
        return;
    }

    if (playerArmyColor !== ARMY_COLOR_BLUE) {
        originalConsoleWarn("[startSyncInterval] Attempted to start sync interval on non-Blue client. Ignoring.");
        return;
    }

    originalConsoleLog(`[startSyncInterval] Starting state synchronization every ${SYNC_INTERVAL_MS}ms.`);
    // Clear any existing interval before starting a new one
    if (syncIntervalId !== null) {
        clearInterval(syncIntervalId);
    }

    syncIntervalId = setInterval(() => {
        // Gather the dynamic state and map data to send
        if (gameOver) {
            originalConsoleLog("[startSyncInterval] Game is over, stopping sync interval.");
            stopSyncInterval(); // Stop the interval itself
            return; // Do not send sync message
        }
        const stateSnapshot = {
            gameTimeInMinutes: gameTimeInMinutes,
            map: map, // Include map data
            currentMapRows: currentMapRows, // Include map dimensions
            currentMapCols: currentMapCols, // Include map dimensions
            units: currentUnits.map(unit => ({
                id: unit.id,
                type: unit.type, // Include unit type
                armyColor: unit.armyColor, // Include army color
                row: unit.row,
                col: unit.col,
                health: unit.health,
                targetRow: unit.targetRow,
                targetCol: unit.targetCol,
                movementProgress: unit.movementProgress,
                previousRow: unit.previousRow,
                previousCol: unit.previousCol
            })),
            combatHexes: Array.from(combatHexes), // Send the set of combat hex keys
            sequenceNumber: syncSequenceNumber // *** NEW: Include the sequence number ***
        };

        // Send the state via WebSocket if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'STATE_SYNC',
                state: stateSnapshot
            }));
            syncSequenceNumber++; // *** NEW: Increment sequence number after sending ***
            originalConsoleLog(`[startSyncInterval] Sent STATE_SYNC message with sequence number ${syncSequenceNumber - 1}.`);
        } else {
            originalConsoleWarn("[startSyncInterval] WebSocket not open, cannot send STATE_SYNC.");
        }

    }, SYNC_INTERVAL_MS); // Use the constant
}

/**
 * Stops the periodic state synchronization interval.
 * Called when the game ends, client role changes, or connection closes.
 */
function stopSyncInterval() {
    if (syncIntervalId !== null) {
        originalConsoleLog("[stopSyncInterval] Stopping state synchronization interval.");
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
}


/*
 * Reads the message from the chat input, appends it to the console output, and clears the input.
 * This version sends the message to the server via WebSocket for multiplayer chat.
 * Accesses global consoleOutputDiv, chatInput, ws, playerArmyColor.
 */
function sendChatMessage() {
    messageChat = null;
    const chatInput = document.getElementById('chatInput'); // Get the element inside the function too for safety
    if (!chatInput || !consoleOutputDiv) {
        originalConsoleWarn("[sendChatMessage] Chat input or console output div not found.");
        return;
    }

    const message = chatInput.value.trim(); // Get message and remove leading/trailing whitespace

    if (message) { // Only send non-empty messages
        // Display the message in the local console immediately with player's army color
        const senderColor = playerArmyColor ? (playerArmyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red') : 'Player'; // Use playerArmyColor if set
        console.log(`${senderColor}: ${message}`);

        // *** For multiplayer, send this message via WebSocket: ***
        if (ws && ws.readyState === WebSocket.OPEN) { // Only send if connected and player color is assigned
            const chatMessage = {
                type: 'CHAT_MESSAGE',
                text: message,
                sender: playerArmyColor // Include sender's army color
            };
            ws.send(JSON.stringify(chatMessage));
            originalConsoleLog(`[sendChatMessage] Sent CHAT_MESSAGE to server: "${message}"`);
        } else {
            // This case is for multiplayer but WS is not open (e.g., disconnected)
            console.warn("Cannot send message: server connection not established.");
            originalConsoleWarn(`[sendChatMessage] Cannot send message "${message}": WebSocket not open.`);
        }
        // *** END WebSocket sending ***


        chatInput.value = ''; // Clear the input field after sending
        chatInput.focus(); // Keep focus on the input field
    }
}

