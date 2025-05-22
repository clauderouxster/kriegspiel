/*
 * game.js
 * Contains the main game loop, rendering, user interactions, and initialization.
 * Depends on all other files (.constants.js, .utils.js, .mapGeneration.js, .unitManagement.js).
 * Manages console redirection and main global variables.
 *
 * Copyright 2025-present Claude ROUX
 * The 3-Clause BSD License
 */

// ============================================================================
// Global Variables (used across different logical sections)
// ============================================================================
let canvas;
let ctx;
let map; // Variable to hold the generated map array (Populated by mapGeneration.js)
let currentMapRows; // Dynamic map height (Set by mapGeneration.js)
let currentMapCols; // Dynamic map width (Set by mapGeneration.js)
let currentUnits = []; // Array to hold the currently placed units (Populated by unitManagement.js)

let audioContext;
let trumpetBuffer;
let musicDefeat;
let musicVictory;
let allUnitInvolvedCombat = new Set();

let messageEndGame = null;
let messageChat = null;

// Image loading variables
const unitImages = {}; // Object to hold loaded Image objects { UnitType: Image, ... }
let imagesLoadedCount = 0;
let totalImagesToLoad = Object.keys(UNIT_IMAGE_PATHS).length; // From constants.js
let allImagesLoaded = false; // Flag to indicate if all images are ready

// Unit Selection Variable
let selectedUnit = null; // To store the currently selected unit object
// NOUVELLES VARIABLES POUR LA SÉLECTION DE ZONE
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragCurrentX = 0;
let dragCurrentY = 0;
let unitMovementTimers = new Map(); // Map<unit.id, setTimeoutId>

// Game Time Variables
let gameTimeInMinutes = 6 * 60; // Start at 06:00 (6 hours * 60 minutes)
let lastRealTime = performance.now(); // To track real time for game time progression
let gameLoopInterval = null; // To hold the interval ID for the game loop

let movedHexUnit = new Map();
let selectedUnits = [];

// Combat Time Tracking
let lastCombatGameTimeInMinutes = gameTimeInMinutes; // Initialize last combat time to current game time

// Fog of War Variables
let visibleHexes = []; // 2D array to track visible hexes (true/false)

// Reference to the console output div
let consoleOutputDiv = null;

// *** Variables for the settings modal ***
let settingsModal = null;
let hamburgerButton = null;
let closeModalButton = null;
// *** END Modal Variables ***

// *** Variables for save/load controls ***
// NOTE: Save/Load local might be less relevant in a multiplayer game,
// but keeping the functionality as it was. Network sync is primary.
let filenameInput = null;
let saveGameButton = null;
let loadGameButton = null;
let loadFileInput = null; // Hidden file input
// *** END NEW ***

// *** NEW : Variable for the help button ***
let helpButton = null;
// *** END NEW ***

// *** NEW : Variable for the Start button (for the Blue player) ***
let startButton = null;
// *** END NEW ***


// *** Variable to track combat hexes for display ***
let combatHexes = new Set(); // Stores "r,c" keys of hexes involved in the current combat

// Store original console functions
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// *** NEW : Variable to track game state (finished or not) ***
let gameOver = false; // Flag to indicate if the game has ended
// *** END NEW ***


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
    const unitToMove = currentUnits.find(unit => unit && unit.id === data.unitId);

    if (unitToMove) {
        // A client should only process MOVE_ORDER messages for the *enemy* army.
        // Blue client processes MOVE_ORDER for Red units.
        // Red client processes MOVE_ORDER for Blue units.
        const isEnemyUnit = (playerArmyColor === ARMY_COLOR_BLUE && unitToMove.armyColor === ARMY_COLOR_RED) ||
            (playerArmyColor === ARMY_COLOR_RED && unitToMove.armyColor === ARMY_COLOR_BLUE);

        if (isEnemyUnit) {
            originalConsoleLog(`[handleReceivedMoveOrder] Client ${playerArmyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} received MOVE_ORDER for enemy unit ID ${data.unitId} (${unitToMove.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'}) to (${data.targetR}, ${data.targetC}). Applying locally.`);
            // Update the unit's target and reset movement progress to start new pathfinding locally
            unitToMove.targetRow = data.targetR;
            unitToMove.targetCol = data.targetC;
            unitToMove.movementProgress = 0; // Reset progress for the new move
            unitToMove.previousRow = unitToMove.row; // Update previous
            unitToMove.previousCol = unitToMove.col;
            // The gameLoop's movement processing will pick up this new target.
            // Visibility will be updated in gameLoop or on next sync.
        } else {
            // Received a move order for own unit (shouldn't happen with new click logic)
            originalConsoleLog(`[handleReceivedMoveOrder] Received MOVE_ORDER for unit ID ${data.unitId} (own army or unexpected). Ignoring.`);
        }
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
        currentUnits = currentUnits.filter(unit => {
            if (unit && eliminatedSet.has(unit.id)) {
                originalConsoleLog(`[handleReceivedCombatResult] Eliminating unit ID ${unit.id} (${getUnitTypeName(unit.type)}) from local state (via network sync).`);
                console.log(`${getUnitTypeName(unit.type)} of the ${unit.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army at (${unit.row}, ${unit.col}) has been eliminated.`);
                // No need to reset target/progress/previous, the unit is removed
                return false; // Remove the unit
            }
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
        // originalConsoleLog("[handleReceivedStateSync] Received STATE_SYNC but client is Blue. Ignoring."); // Too chatty
        return;
    }

    // originalConsoleLog("[handleReceivedStateSync] Received STATE_SYNC update."); // Too chatty

    const receivedState = data.state;

    // Update game time based on Blue's clock
    gameTimeInMinutes = receivedState.gameTimeInMinutes;
    // Note: lastRealTime does *not* need to be synced, it's just for local time progression calculation

    // *** NEW : Update map data and dimensions ***
    // Check if map data is included and seems valid before updating
    if (receivedState.map && Array.isArray(receivedState.map) && receivedState.map.length > 0) {
        map = receivedState.map;
        currentMapRows = receivedState.currentMapRows !== undefined ? receivedState.currentMapRows : map.length;
        currentMapCols = receivedState.currentMapCols !== undefined ? receivedState.currentMapCols : (map[0] ? map[0].length : 0);
        // originalConsoleLog(`[handleReceivedStateSync] Red: Map data updated. Dimensions: ${currentMapRows}x${currentMapCols}.`); // Too chatty


        // Adjust canvas size based on synced map dimensions (important if Blue generated a different size)
        if (canvas && ctx) {
            const canvasWidth = (currentMapCols + 10) * HEX_SIZE * 1.5 + HEX_SIZE * 0.5;
            const canvasHeight = (currentMapRows + 3) * HEX_SIZE * Math.sqrt(3) * 0.75 + HEX_SIZE * Math.sqrt(3) * 0.25 + CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2 + 20;
            // Only resize if dimensions actually changed significantly to avoid unnecessary redraws
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
        // This might happen if the map wasn't included or is invalid.
        // Log a warning, but don't clear the existing map if there is one.
        originalConsoleWarn("[handleReceivedStateSync] Red: Received STATE_SYNC with no map data or invalid map data.");
    }
    // *** END NEW ***


    // Update unit states based on Blue's snapshot
    if (receivedState.units && Array.isArray(receivedState.units)) {
        // Create a map of received units for easy lookup
        const receivedUnitsMap = new Map(receivedState.units.map(unit => [unit.id, unit]));

        // --- Update existing units and add new units from received state ---
        const updatedUnitsList = [];
        // Keep track of local unit IDs to identify those that were eliminated on Blue's side
        const localUnitIdsBeforeSync = new Set(currentUnits.map(unit => unit.id));

        receivedState.units.forEach(syncedUnitData => {
            const localUnit = currentUnits.find(unit => unit && unit.id === syncedUnitData.id);

            if (localUnit) {
                // Update the dynamic properties of the local unit to match Blue's state
                localUnit.row = syncedUnitData.row;
                localUnit.col = syncedUnitData.col;
                localUnit.health = syncedUnitData.health;
                // *** IMPORTANT FIX: Apply target and movement progress from sync ***
                localUnit.targetRow = syncedUnitData.targetRow;
                localUnit.targetCol = syncedUnitData.targetCol;
                localUnit.movementProgress = syncedUnitData.movementProgress;
                // *** END IMPORTANT FIX ***
                // Ensure static properties like type and armyColor are also consistent (should be, but safety)
                localUnit.type = syncedUnitData.type;
                localUnit.armyColor = syncedUnitData.armyColor;
                localUnit.previousRow = syncedUnitData.previousRow;
                localUnit.previousCol = syncedUnitData.previousCol;
                updatedUnitsList.push(localUnit); // Add updated unit to the new list
                localUnitIdsBeforeSync.delete(localUnit.id); // Remove this unit ID from the set of units that were local

            } else {
                // This is a new unit on Blue's side that Red didn't know about (shouldn't happen in this game unless a dev feature adds units).
                // Or more likely, a unit was eliminated on Red's side by mistake and Blue revived it (unlikely in this game).
                // Create a new unit object on Red's side if it's in the sync but not locally.
                originalConsoleLog(`[handleReceivedStateSync] Red: Adding unit ID ${syncedUnitData.id} from sync (not found locally).`);
                updatedUnitsList.push({
                    id: syncedUnitData.id,
                    type: syncedUnitData.type, // Ensure type and armyColor are sent in sync
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
                // This new unit wasn't in localUnitIdsBeforeSync, so it won't be mistakenly filtered out below.
            }
        });

        // --- Handle units missing from the received state (eliminated on Blue's side) ---
        // Filter out local units whose IDs are NOT in the receivedUnitsMap.
        // This is the primary way Red eliminates units based on Blue's state.
        const unitsBeforeFilter = currentUnits.length;
        currentUnits = updatedUnitsList.filter(unit => unit && receivedUnitsMap.has(unit.id));

        // Log which units were removed because they were no longer in the sync list
        localUnitIdsBeforeSync.forEach(unitId => {
            // This unit ID was in the local list before sync but is not in the received list.
            // This means Blue eliminated it. Log this event.
            const eliminatedUnit = currentUnits.find(unit => unit && unit.id === unitId); // Search updated list (shouldn't be there) or original list?
            const originalUnit = currentUnits.find(unit => unit && unit.id === unitId); // Check if it was actually removed

            // This check is a bit tricky. A unit might be in updatedUnitsList if it was a *new* unit added.
            // The simpler check is: compare the *set* of IDs in receivedState.units vs the set of IDs in currentUnits *before* this sync.
            // The filter approach above correctly removes units whose IDs aren't in the received map.
            // Let's just log the total count difference and trust the filter.
            // Logging individual eliminations from sync might be too chatty and less precise than combat results.
        });


        if (unitsBeforeFilter !== currentUnits.length) {
            originalConsoleLog(`[handleReceivedStateSync] Red: Eliminated ${unitsBeforeFilter - currentUnits.length} units based on STATE_SYNC (missing from sync). Total remaining: ${currentUnits.length}.`);
            // Note: This elimination via missing sync is a fallback/consistency mechanism. Primary elimination should come from COMBAT_RESULT.
        }
        // --- END Unit Sync ---


        // *** NEW : Synchronize combat hexes ***
        // Blue should include the list of hexes in combat in the STATE_SYNC message.
        // If the STATE_SYNC message includes a list of combat hexes (e.g., data.state.combatHexes)
        if (receivedState.combatHexes && Array.isArray(receivedState.combatHexes)) {
            combatHexes.clear(); // Clear current combat hexes on Red
            receivedState.combatHexes.forEach(hexKey => {
                combatHexes.add(hexKey); // Add hexes from the synced list
            });
            // originalConsoleLog(`[handleReceivedStateSync] Red: Synced combat hexes. Total: ${combatHexes.size}`); // Too chatty
        } else {
            // If no combat hexes info is sent, clear local combat hexes on Red.
            // This ensures highlights disappear after a combat interval passes on Blue.
            if (combatHexes.size > 0) {
                combatHexes.clear();
                // originalConsoleLog("[handleReceivedStateSync] Red: No combat hexes in sync data. Cleared local combat highlights."); // Too chatty
            }
        }
        // *** END NEW ***


    } else {
        // If receivedState.units is not an array or empty, this might mean no units are left,
        // or an error. Be cautious about clearing all units based on an empty sync.
        // Maybe log a warning or ignore if no units were expected.
        originalConsoleWarn("[handleReceivedStateSync] Red: Received STATE_SYNC with no unit data or invalid unit data.");
        // If unit data is missing, maybe clear units? Be careful: currentUnits = [];
        // It might be better to keep existing units and log a warning if unit data is missing.
    }


    // Visibility needs to be updated after applying state changes as unit positions changed
    updateVisibility();
    // The redraw happens in the gameLoop, which is running.
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
            // *** NEW : Include map and dimensions in sync ***
            map: map, // Include map data
            currentMapRows: currentMapRows, // Include map dimensions
            currentMapCols: currentMapCols, // Include map dimensions
            // *** END NEW ***
            // Send only dynamic properties of units (and essential static ones for reliable updates on Red)
            units: currentUnits.map(unit => ({
                id: unit.id,
                type: unit.type, // Include unit type
                armyColor: unit.armyColor, // Include army color
                row: unit.row,
                col: unit.col,
                health: unit.health,
                // *** IMPORTANT: Include target and movement progress in sync ***
                targetRow: unit.targetRow,
                targetCol: unit.targetCol,
                movementProgress: unit.movementProgress,
                // *** END IMPORTANT ***
                previousRow: unit.previousRow, // Include previous position
                previousCol: unit.previousCol
            })),
            // *** NEW : Include combat hexes for highlighting on Red ***
            combatHexes: Array.from(combatHexes) // Send the set of combat hex keys
            // *** END NEW ***
        };

        // Send the state via WebSocket if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'STATE_SYNC',
                state: stateSnapshot
            }));
            // originalConsoleLog("[startSyncInterval] Sent STATE_SYNC message."); // Too chatty
        } else {
            // originalConsoleWarn("[startSyncInterval] WebSocket not open, cannot send STATE_SYNC."); // Too chatty
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


// ============================================================================
// Drawing Logic (Functions moved from mapGenerator.js)
// Depend on constants.js and utils.js
// Access global map, currentUnits, currentMapRows, currentMapCols, selectedUnit, gameTimeInMinutes, unitImages, allImagesLoaded, visibleHexes.
// Calls getHexCenter, drawHex, drawUnitIcon, drawClock, getUnitAt.
// ============================================================================

/**
 * Draws a single hexagon.
 */
function drawHex(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle_deg = 60 * i - 30;
        const angle_rad = Math.PI / 180 * angle_deg;
        ctx.lineTo(x + size * Math.cos(angle_rad), y + size * Math.sin(angle_rad));
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000'; // Hex border color
    ctx.lineWidth = 1;
    ctx.stroke();
}

/**
 * Draws the entire map background (terrain).
 */
function drawMap(ctx, map, size, terrainColors) {
    if (!ctx || !map) return;

    const rows = map.length;
    const cols = map[0].length;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const { x, y } = getHexCenter(r, c, size);
            const terrainType = map[r][c];
            // Ensure temporary/unassigned states are drawn as a default (e.g., flat)
            let displayTerrainType = terrainType;
            if (displayTerrainType < 0) {
                displayTerrainType = Terrain.FLAT;
            }
            const color = terrainColors[displayTerrainType];
            drawHex(ctx, x, y, size, color);
        }
    }
}

/**
 * Draws a unit icon (image) centered on a hex.
 * Depends on allImagesLoaded, unitImages global variables.
 */
function drawUnitIcon(ctx, x, y, unitType, armyColor, size) {
    // Check if images are loaded and the specific unit type image exists
    if (allImagesLoaded && unitImages[unitType]) {
        const img = unitImages[unitType];
        // Adjust size and position for the image (e.g., make it slightly smaller than the hex)
        const imgSize = size * 1.2; // Example: 120% of hex size
        const imgX = x - imgSize / 2;
        const imgY = y - imgSize / 2;
        ctx.drawImage(img, imgX, imgY, imgSize, imgSize);

        // Optionally draw a small circle at the bottom center to indicate army color
        const dotRadius = size * 0.2;
        const dotX = x; // Center X
        const dotY = y + size * 0.5 - dotRadius * 0.5; // Slightly above the bottom edge

        ctx.fillStyle = armyColor;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        // Optional: Add a small border for visibility
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.stroke();


    } else {
        // Fallback: draw a colored circle if the image is not loaded
        ctx.fillStyle = armyColor;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000'; // Circle border color
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

/**
 * Draws an analog clock on the canvas.
 */
function drawClock(ctx, gameTimeInMinutes) {
    const canvasWidth = ctx.canvas.width;
    const clockCenterX = canvasWidth / 2; // Center horizontally
    const clockCenterY = CLOCK_MARGIN_TOP + CLOCK_RADIUS; // Uses constants

    // Draw clock circle
    ctx.beginPath();
    ctx.arc(clockCenterX, clockCenterY, CLOCK_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw clock hands
    const hours = Math.floor(gameTimeInMinutes / 60) % 24; // 24-hour format
    const minutes = gameTimeInMinutes % 60;

    // Hour hand (12-hour format on the clock face)
    // Adjust for 12-hour format: 12 is at the top (angle -90 degrees or 270 degrees)
    // Full circle = 12 hours. 1 hour = 30 degrees. Minutes also affect hour hand.
    const hourAngle = ((hours % 12) + (minutes / 60)) * 30 - 90;
    const hourAngleRad = hourAngle * Math.PI / 180;
    const hourHandLength = CLOCK_RADIUS * 0.5;
    ctx.beginPath();
    ctx.moveTo(clockCenterX, clockCenterY);
    ctx.lineTo(clockCenterX + hourHandLength * Math.cos(hourAngleRad), clockCenterY + hourHandLength * Math.sin(hourAngleRad));
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Minute hand
    // Full circle = 60 minutes. 1 minute = 6 degrees.
    const minuteAngle = minutes * 6 - 90;
    const minuteAngleRad = minuteAngle * Math.PI / 180;
    const minuteHandLength = CLOCK_RADIUS * 0.8;
    ctx.beginPath();
    ctx.moveTo(clockCenterX, clockCenterY);
    ctx.lineTo(clockCenterX + minuteHandLength * Math.cos(minuteAngleRad), clockCenterY + minuteHandLength * Math.sin(minuteAngleRad));
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw center dot
    ctx.beginPath();
    ctx.arc(clockCenterX, clockCenterY, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    /*
    // Display digital time below the clock
    const digitalTimeX = clockCenterX;
    const digitalTimeY = clockCenterY + CLOCK_RADIUS + 15; // Position below the clock circle

    const formattedHours = String(Math.floor(hours)).padStart(2, '0'); // Ensure 2 digits
    const formattedMinutes = String(Math.floor(minutes)).padStart(2, '0'); // Ensure 2 digits

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText(`${formattedHours}:${formattedMinutes}`, digitalTimeX, digitalTimeY);
    */
}


/**
 * Draws the entire scene: map, units, highlights, and clock, respecting fog of war.
 * Depends on getHexCenter, getUnitAt from utils.js.
 * Depends on HEX_SIZE, TerrainColors, UNIT_ARMY_INDICATOR_OFFSET_X, UNIT_ARMY_INDICATOR_OFFSET_Y, UNIT_ARMY_INDICATOR_RADIUS, FOG_COLOR, UNIT_HEALTH, COMBAT_HIGHLIGHT_COLOR from constants.js.
 * Depends on Terrain (constant).
 * Access global map, currentUnits, selectedUnit, gameTimeInMinutes, visibleHexes, combatHexes, playerArmyColor.
 * Calls drawHex, drawUnitIcon, drawClock.
 */
function drawMapAndUnits(ctx, map, currentUnits, size, terrainColors) {
    // If map or context is not available, just clear the canvas
    if (!ctx || !canvas || !map || !currentUnits) { // Added canvas check
        if (ctx && canvas) { // Added canvas check
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Maybe draw a placeholder if no map/units?
            if (canvas && ctx) { // Ensure canvas and context are available for drawing placeholder
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '20px sans-serif';
                ctx.fillStyle = '#333';
                let message = "Connect to the server to start";
                message = playerArmyColor === ARMY_COLOR_BLUE ? "Waiting for Red player..." : "Waiting for initial game state...";
                ctx.fillText(message, canvas.width / 2, canvas.height / 2);
            }
        }
        return;
    }

    // Clear the canvas before drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Uses global canvas

    const rows = map.length;
    const cols = map[0].length;

    // Draw the map terrain and units, respecting fog of war
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const { x, y } = getHexCenter(r, c, size); // Uses utils function, size from parameter

            // Check if the hex is visible to the local player
            const isVisible = visibleHexes && visibleHexes[r] && visibleHexes[r][c]; // Uses global visibleHexes

            if (isVisible) {
                // Draw visible hex (terrain)
                const terrainType = map[r][c]; // Uses global map
                let displayTerrainType = terrainType;
                if (displayTerrainType < 0) {
                    displayTerrainType = Terrain.FLAT; // Use flat for temp/unassigned states, uses constant
                }
                const color = terrainColors[displayTerrainType]; // Uses terrainColors from parameter
                drawHex(ctx, x, y, size, color); // Uses drawing function

                // *** Draw combat highlight if the hex is visible and in combat ***
                // This highlight is based on the local combatHexes set, which is populated
                // on the Blue client during combat resolution, and potentially synced (TBD exact sync).
                const hexKey = `${r},${c}`;
                const isInCombat = combatHexes.has(hexKey); // Uses the global combatHexes variable
                if (isInCombat) {
                    // Draw a semi-transparent red layer over the terrain
                    drawHex(ctx, x, y, size, COMBAT_HIGHLIGHT_COLOR); // Uses the color constant and drawing function
                }
                // *** END NEW ***


                // Draw unit if present at this visible hex
                const unitAtHex = getUnitAt(r, c, currentUnits.filter(u => u !== null && u !== undefined), "drawMapAndUnits - unit check"); // Use filtered list
                if (unitAtHex) {
                    if (unitAtHex.type === UnitType.GENERAL && !isInCombat) {
                        drawHex(ctx, x, y, size, GENERAL_HEX_COLOR);
                    }
                    drawUnitIcon(ctx, x, y, unitAtHex.type, unitAtHex.armyColor, size); // Uses drawing function
                    // Draw movement indicator if unit has a target destination and is not there yet
                    // Draw for both friendly and enemy units if visible
                    if (unitAtHex.targetRow !== null && unitAtHex.targetCol !== null && (unitAtHex.row !== unitAtHex.targetRow || unitAtHex.col !== unitAtHex.col)) {
                        const dotRadius = size * 0.15;
                        const dotX = x + size * 0.4;
                        const dotY = y + size * 0.4;

                        ctx.fillStyle = '#0000FF'; // Blue color for movement indicator (can be changed if needed)
                        ctx.beginPath();
                        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // Draw army indicator based on armyColor (top-left)
                    const indicatorX = x + UNIT_ARMY_INDICATOR_OFFSET_X; // Uses constant
                    const indicatorY = y + UNIT_ARMY_INDICATOR_OFFSET_Y; // Uses constant

                    ctx.fillStyle = unitAtHex.armyColor; // Use the unit's army color
                    ctx.beginPath();
                    ctx.arc(indicatorX, indicatorY, UNIT_ARMY_INDICATOR_RADIUS, 0, Math.PI * 2); // Uses constant
                    ctx.fill();
                    // Optional: Add a small border for visibility
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();

                    // *** Draw Health Bar/Indicator (simple) ***
                    const healthBarHeight = 3;
                    const healthBarWidth = size * 1.0; // Proportionate to hex size
                    const healthBarX = x - healthBarWidth / 2;
                    const healthBarY = y + size * 0.5 - healthBarHeight; // Below the unit icon

                    const maxHealth = UNIT_HEALTH[unitAtHex.type] !== undefined ? UNIT_HEALTH[unitAtHex.type] : 1; // Uses constant
                    const currentHealth = Math.max(0, unitAtHex.health); // Ensure health isn't drawn below 0

                    const healthPercentage = currentHealth / maxHealth;

                    // Draw background (red usually)
                    ctx.fillStyle = '#FF0000'; // Red
                    ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);

                    // Draw health bar (green usually)
                    ctx.fillStyle = '#00FF00'; // Green
                    ctx.fillRect(healthBarX, healthBarY, healthBarWidth * healthPercentage, healthBarHeight);

                    // Draw a border around the health bar
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);

                    // *** END Draw Health Bar/Indicator ***

                }

            } else {
                // Draw fogged hex - ONLY draw fog if playerArmyColor is defined (multiplayer)
                // In single player, visibleHexes is always true.
                drawHex(ctx, x, y, size, FOG_COLOR); // Use FOG_COLOR constant, drawing function
            }
        }
    }

    if (messageEndGame != null) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '40px sans-serif';

        if (messageEndGame.includes("VICTORY"))
            playVictoryMusic();
        else
            playDefeatMusic();
        
        ctx.fillStyle = 'rgba(0, 200, 0, 0.8)'; // Green for victory message
        // Draw a background rectangle for the message
        const textWidth = ctx.measureText(messageEndGame).width;
        const padding = 30;
        const rectX = canvas.width / 2 - (textWidth / 2 + padding);
        const rectY = canvas.height / 2 - (40 / 2 + padding); // 40 is font size
        const rectWidth = textWidth + padding * 2;
        const rectHeight = 40 + padding * 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // Semi-transparent white background
        ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

        // Draw the message text
        ctx.fillStyle = '#008000'; // Darker green for text
        ctx.fillText(messageEndGame, canvas.width / 2, canvas.height / 2);
        ctx.strokeStyle = '#000'; // Black border
        ctx.lineWidth = 2;
        ctx.strokeText(messageEndGame, canvas.width / 2, canvas.height / 2);
    }

    // --- Add Highlighting Logic Here ---
    // Highlight the selected unit's hex ONLY if it's visible and NOT currently in combat (combat highlight takes precedence)
    // And only if the selected unit belongs to the local player's army
    if (!gameOver && selectedUnits && selectedUnits.length > 0 && visibleHexes) {
        // We have selected units, the game is not over, and visibleHexes exists.
        // Now, loop through each selected unit and apply specific checks.

        for (const unit of selectedUnits) {
            // Check if the current unit in the loop belongs to the player's army (or playerArmyColor is null)
            // AND if the unit's hex is visible (checking for row and column existence in visibleHexes)
            // AND if the unit's hex is NOT currently in combat
            if (unit.armyColor === playerArmyColor&&
                visibleHexes[unit.row] &&
                visibleHexes[unit.row][unit.col] &&
                !combatHexes.has(`${unit.row},${unit.col}`)) {

                // Uses utils function, current 'unit' from loop, size from parameter
                const { x: selectedX, y: selectedY } = getHexCenter(unit.row, unit.col, size);

                ctx.fillStyle = 'rgba(255, 255, 0, 0.5)'; // Semi-transparent yellow highlight

                // Uses drawing function
                drawHex(ctx, selectedX, selectedY, size, ctx.fillStyle);
            }
        }
    }
    // --- End Highlighting Logic ---

    // --- Draw Chat Message ---
    // Check if messageChat is not null or empty
    if (messageChat && messageChat.trim() !== '') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '20px sans-serif'; // Set font size to 20px

        const messageX = canvas.width / 2;
        let messageY;

        // Determine vertical position based on playerArmyColor
        if (playerArmyColor === ARMY_COLOR_BLUE) {
            messageY = canvas.height * 0.2; // Near the top
        } else if (playerArmyColor === ARMY_COLOR_RED) {
            messageY = canvas.height * 0.8; // Near the bottom
        } else {
            // Default to center if playerArmyColor is not set
            messageY = canvas.height / 2;
        }

        // Measure text width for background rectangle
        const textWidth = ctx.measureText(messageChat).width;
        const textHeight = 20; // Approximate height based on font size
        const padding = 10; // Padding around the text

        // Calculate background rectangle position centered around the message text position (messageX, messageY)
        const rectX = messageX - (textWidth / 2 + padding);
        // Adjust rectY calculation to center the rectangle vertically around messageY
        const rectY = messageY - (textHeight / 2 + padding);
        const rectWidth = textWidth + padding * 2;
        const rectHeight = textHeight + padding * 2;

        // Draw yellow background rectangle
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)'; // Semi-transparent yellow
        ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

        // Optional: Add a border to the background
        ctx.strokeStyle = '#000'; // Black border
        ctx.lineWidth = 1;
        ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);


        ctx.fillStyle = '#000000'; // Black color for chat message text for better contrast on yellow
        // Optional: Add a subtle shadow for readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Draw the message centered at the calculated pixel coordinates
        ctx.fillText(messageChat, messageX, messageY);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
    // --- End Draw Chat Message ---

    // Dessiner le rectangle de sélection si le glisser-déposer est en cours
    if (isDragging) {
        const x = Math.min(dragStartX, dragCurrentX);
        const y = Math.min(dragStartY, dragCurrentY);
        const width = Math.abs(dragStartX - dragCurrentX);
        const height = Math.abs(dragStartY - dragCurrentY);

        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; // Couleur verte semi-transparente
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; // Remplissage vert clair semi-transparent
        ctx.fillRect(x, y, width, height);
    }


    // Draw the game clock (always visible)
    //drawClock(ctx, gameTimeInMinutes); // Use global gameTimeInMinutes, drawing function
}

// ============================================================================
// Image Loading
// Depends on UNIT_IMAGE_PATHS from constants.js
// Accesses global unitImages, imagesLoadedCount, totalImagesToLoad, allImagesLoaded
// Uses originalConsoleLog, originalConsoleError
// ============================================================================

// --- Function to load a single audio file ---
async function loadAudio(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

// --- Function to play the trumpet sound ---
function playTrumpetSound() {
    if (trumpetBuffer && audioContext) {
        const source = audioContext.createBufferSource();
        source.buffer = trumpetBuffer;
        source.connect(audioContext.destination);
        source.start(0); // Play immediately
    }
}

function playVictoryMusic() {
    if (musicVictory && audioContext) {
        const source = audioContext.createBufferSource();
        source.buffer = musicVictory;
        source.connect(audioContext.destination);
        source.start(0); // Play immediately
    }
}

function playDefeatMusic() {
    if (musicDefeat && audioContext) {
        const source = audioContext.createBufferSource();
        source.buffer = musicDefeat;
        source.connect(audioContext.destination);
        source.start(0); // Play immediately
    }
}

async function loadSounds() {
    // Initialize AudioContext
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Load sound
    try {
        trumpetBuffer = await loadAudio(SOUND_TRUMPET_PATH); // Assuming SOUND_TRUMPET_PATH is defined in constants.js
        console.log("Trumpet sound loaded successfully.");
    } catch (error) {
        console.error("Error loading trumpet sound:", error);
    }
    try {
        musicVictory = await loadAudio(SOUND_VICTORY_PATH); // Assuming SOUND_TRUMPET_PATH is defined in constants.js
        console.log("Trumpet sound loaded successfully.");
    } catch (error) {
        console.error("Error loading trumpet sound:", error);
    }
    try {
        musicDefeat = await loadAudio(SOUND_DEFEAT_PATH); // Assuming SOUND_TRUMPET_PATH is defined in constants.js
        console.log("Trumpet sound loaded successfully.");
    } catch (error) {
        console.error("Error loading trumpet sound:", error);
    }
}

/**
 * Loads all unit images asynchronously. Calls a callback when all images are loaded.
 * Depends on UNIT_IMAGE_PATHS from constants.js.
 * Accesses global unitImages, imagesLoadedCount, totalImagesToLoad, allImagesLoaded.
 * Uses originalConsoleLog, originalConsoleError.
 */
function loadUnitImages(callback) {
    originalConsoleLog(`[loadUnitImages] Starting to load ${totalImagesToLoad} unit images...`);
    imagesLoadedCount = 0;
    allImagesLoaded = false;

    loadSounds();
    // If there are no images to load, just call the callback immediately
    if (totalImagesToLoad === 0) {
        allImagesLoaded = true;
        originalConsoleLog("[loadUnitImages] No images to load. Callback executed immediately.");
        if (callback) callback();
        return;
    }

    for (const unitType in UNIT_IMAGE_PATHS) { // Iterate through the mapping in constants.js
        if (UNIT_IMAGE_PATHS.hasOwnProperty(unitType)) {
            const img = new Image();
            img.onload = () => {
                // Store the loaded image object using the unit type as the key
                unitImages[unitType] = img;
                imagesLoadedCount++;
                originalConsoleLog(`[loadUnitImages] Loaded ${getUnitTypeName(parseInt(unitType))} image. (${imagesLoadedCount}/${totalImagesToLoad})`); // Use getUnitTypeName
                // Check if all images are loaded
                if (imagesLoadedCount === totalImagesToLoad) {
                    allImagesLoaded = true;
                    originalConsoleLog("[loadUnitImages] All unit images loaded.");
                    if (callback) {
                        callback(); // Execute the callback function
                    }
                }
            };
            img.onerror = (e) => {
                originalConsoleError(`[loadUnitImages] Error loading image for unit type ${getUnitTypeName(parseInt(unitType))} from path ${UNIT_IMAGE_PATHS[unitType]}:`, e); // Use getUnitTypeName
                imagesLoadedCount++; // Still increment count even on error to avoid blocking
                // We might want to load a placeholder image here or mark this unit type as having no image.
                // unitImages[unitType] = null; // Or a default error image
                if (imagesLoadedCount === totalImagesToLoad) {
                    allImagesLoaded = true;
                    originalConsoleLog("[loadUnitImages] Finished loading images (with errors).");
                    if (callback) {
                        callback();
                    }
                }
            };
            img.src = UNIT_IMAGE_PATHS[unitType]; // Set the source to start loading
        }
    }
}


// ============================================================================
// Map Generation and Unit Placement Logic (Wrapped in updateDimensionsAndDraw for UI interaction)
// Depends on calculateMapDimensions, generateMap from mapGeneration.js.
// Depends on createInitialUnits, unitIdCounter (global counter) from unitManagement.js.
// Depends on HEX_SIZE, TerrainColors, UnitType, ARMY_COLOR_BLUE, ARMY_COLOR_RED from constants.js.
// Depends on drawMap, drawMapAndUnits, updateVisibility from this file.
// Accesses global canvas, ctx, map, currentMapRows, currentMapCols, currentUnits, gameTimeInMinutes, lastCombatGameTimeInMinutes, playerArmyColor, ws.
// Uses originalConsoleLog, originalConsoleError.
// Accesses mapHeightSelect, unit type count inputs.
// Calls drawMap, createInitialUnits, drawMapAndUnits, updateVisibility, startSyncInterval.
// ============================================================================
/**
 * Reads desired map dimensions from UI, generates a new map, places units, and redraws.
 * This function is triggered by UI changes (like map height select or regenerate button)
 * OR by the Start button click for the Blue player in multiplayer.
 * In multiplayer (playerArmyColor is set), this only generates/sends state for Blue.
 * Depends on calculateMapDimensions, generateMap from mapGeneration.js.
 * Depends on createInitialUnits, unitIdCounter (global counter) from unitManagement.js.
 * Depends on HEX_SIZE, TerrainColors, UnitType, ARMY_COLOR_BLUE, ARMY_COLOR_RED from constants.js.
 * Depends on drawMap, drawMapAndUnits, updateVisibility from this file.
 * Accesses global canvas, ctx, map, currentMapRows, currentMapCols, currentUnits, gameTimeInMinutes, lastCombatGameTimeInMinutes, playerArmyColor, ws.
 * Uses originalConsoleLog, originalConsoleError.
 * Accesses mapHeightSelect, unit type count inputs.
 * Calls drawMap, createInitialUnits, drawMapAndUnits, updateVisibility, startSyncInterval.
 */
function updateDimensionsAndDraw() {
    originalConsoleLog("[updateDimensionsAndDraw] Starting map generation and unit placement.");

    // *** NEW : Block generation if the client is not Blue in multiplayer ***
    // or if it's the Blue player triggering it (e.g., via Start button after Red connects).
    // The regenerate button is disabled for Red, but the mapHeightSelect changes can still trigger this.
    // If Red changes map height, this function will run, but it should send a message to Blue
    // requesting the new map size rather than generating it locally.
    if (playerArmyColor === ARMY_COLOR_RED) {
        // Red client wants a new map size. Send a request to Blue.
        const mapHeightSelect = document.getElementById('mapHeightSelect');
        const requestedHeight = mapHeightSelect ? parseInt(mapHeightSelect.value) : 40;
        console.log(`Request for new map of size ${requestedHeight} sent to Blue player.`);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'REQUEST_NEW_MAP_SIZE', requestedHeight: requestedHeight }));
        } else {
            console.warn("Unable to send request: server connection not established.");
        }
        // Red does NOT generate the map locally here. It waits for GAME_STATE from Blue.
        originalConsoleLog("[updateDimensionsAndDraw] Red client requested new map size, not generating locally.");
        // Close the settings modal
        if (settingsModal) {
            settingsModal.style.display = "none";
        }
        return; // Exit the function for Red client
    }
    // If we reach here, it's either single player or the Blue client triggering generation.


    // Get desired map height from the select element
    const mapHeightSelect = document.getElementById('mapHeightSelect');
    // Use a default height if element is not found or value is invalid
    const desiredHeight = mapHeightSelect ? parseInt(mapHeightSelect.value) : 20; // Default to 20 if select not found

    // Calculate full dimensions
    const dimensions = calculateMapDimensions(desiredHeight); // Uses mapGeneration function
    currentMapRows = dimensions.rows;
    currentMapCols = dimensions.cols;
    originalConsoleLog(`[updateDimensionsAndDraw] Calculated map dimensions: Rows=${currentMapRows}, Cols=${currentMapCols}`);


    // Adjust canvas size based on calculated map dimensions
    const canvasWidth = (currentMapCols + 10) * HEX_SIZE * 1.5 + HEX_SIZE * 0.5; // Hex grid width calculation
    const canvasHeight = (currentMapRows + 3) * HEX_SIZE * Math.sqrt(3) * 0.75 + HEX_SIZE * Math.sqrt(3) * 0.25 + CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2 + 20; // Height including clock and padding

    if (canvas) { // Check if canvas element exists
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        originalConsoleLog(`[updateDimensionsAndDraw] Canvas resized to Width=${canvasWidth}, Height=${canvasHeight}`);

        // Update console output width
        if (consoleOutputDiv) {
            consoleOutputDiv.style.width = canvasWidth + 'px';
            consoleOutputDiv.style.margin = '10px auto';
            consoleOutputDiv.innerHTML = ''; // Clear console on regeneration
            console.log("New game generated!"); // Log to the new console div
        }

    } else {
        originalConsoleError("[updateDimensionsAndDraw] Canvas element not found!");
        // Cannot proceed without canvas
        return;
    }


    // --- Generate the map ---
    map = generateMap(currentMapRows, currentMapCols, // Uses mapGeneration function
        MOUNTAIN_PROBABILITY,
        BASE_HEIGHT_FOR_LAKE_SCALING, BASE_LAKE_SIZE_MIN, BASE_LAKE_SIZE_MAX, BASE_MAX_LAKES_FACTOR,
        BASE_HEIGHT_FOR_FOREST_SCALING, BASE_FOREST_SIZE_MIN, BASE_FOREST_SIZE_MAX, BASE_MAX_FOREST_FACTOR);
    originalConsoleLog("[updateDimensionsAndDraw] Map generated.");

    // --- Place initial units ---
    // Get desired unit counts from UI inputs
    const unitCounts = {};
    // Ensure input elements exist before trying to read their values
    const spyInput = document.getElementById('spyCount');
    const cavalryInput = document.getElementById('cavalryCount');
    const infantryInput = document.getElementById('infantryCount');
    const artilleryInput = document.getElementById('artilleryCount');
    const supplyInput = document.getElementById('supplyCount');

    const generalInput = document.getElementById('generalCount');

    unitCounts[UnitType.SPY] = spyInput ? parseInt(spyInput.value) || 0 : 0;
    unitCounts[UnitType.CAVALRY] = cavalryInput ? parseInt(cavalryInput.value) || 0 : 0;
    unitCounts[UnitType.INFANTERY] = infantryInput ? parseInt(infantryInput.value) || 0 : 0;
    unitCounts[UnitType.ARTILLERY] = artilleryInput ? parseInt(artilleryInput.value) || 0 : 0;
    unitCounts[UnitType.SUPPLY] = supplyInput ? parseInt(supplyInput.value) || 0 : 0;

    unitCounts[UnitType.GENERAL] = 1;

    // Reset the unit ID counter for a new game (Defined in unitManagement.js)
    unitIdCounter = 0; // Ensure unitIdCounter is accessible here or reset in unitManagement.js function


    currentUnits = createInitialUnits(map, currentMapRows, currentMapCols, unitCounts); // Uses unitManagement function
    originalConsoleLog(`[updateDimensionsAndDraw] Initial units created. Total: ${currentUnits.length}`);


    // Reset game time and combat timer
    gameTimeInMinutes = 6 * 60; // Start again at 06:00
    lastCombatGameTimeInMinutes = gameTimeInMinutes;
    lastRealTime = performance.now(); // Reset real-time reference


    // --- Initial visibility calculation and drawing ---
    // Update visibility based on the newly placed units and player color
    updateVisibility(); // Uses function from this file
    originalConsoleLog("[updateDimensionsAndDraw] Initial visibility calculated.");

    // Draw the initial state of the map and units
    drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Uses function from this file
    originalConsoleLog("[updateDimensionsAndDraw] Initial map and units drawn.");

    // Clear selected unit
    selectedUnit = null;
    //combatHexes.clear(); // Clear any previous combat highlights


    // *** NEW : If the client is Blue in multiplayer, send initial state and start sync AND THE GAME LOOP ***
    // This now happens when the Blue player clicks the Start button, not immediately on receiving RED_PLAYER_CONNECTED
    if (playerArmyColor === ARMY_COLOR_BLUE && ws && ws.readyState === WebSocket.OPEN) {
        originalConsoleLog("[updateDimensionsAndDraw] Client is Blue, sending initial GAME_STATE to server and starting sync.");
        const initialState = {
            map: map,
            currentMapRows: currentMapRows,
            currentMapCols: currentMapCols,
            currentUnits: currentUnits, // Send the full unit state
            gameTimeInMinutes: gameTimeInMinutes,
            lastCombatGameTimeInMinutes: lastCombatGameTimeInMinutes, // Consider adding lastCombatGameTimeInMinutes if needed for Red's combat sync
            combatHexes: Array.from(combatHexes) // Include combat hexes in initial state
        };
        ws.send(JSON.stringify({ type: 'GAME_STATE', state: initialState }));
        startSyncInterval(); // Start periodic sync from Blue

        // *** NEW : Start the game loop for the Blue client ***
        if (gameLoopInterval === null) {
            originalConsoleLog("[updateDimensionsAndDraw] Client is Blue, starting game loop.");
            lastRealTime = performance.now(); // Initialize lastRealTime when game starts
            gameLoopInterval = requestAnimationFrame(gameLoop); // <-- START THE GAME LOOP HERE FOR BLUE
        }
        // *** END NEW ***


        // Hide the Start button after the game starts
        if (startButton) startButton.style.display = 'none';

    }
    // *** END NEW ***


    originalConsoleLog("[updateDimensionsAndDraw] Map generation and unit placement finished.");

    // Close the settings modal after generation
    if (settingsModal) {
        settingsModal.style.display = "none";
    }
}

// ============================================================================
// Combat Logic (Only executed on the Blue client)
// Depends on constants.js, utils.js.
// Access global map, currentUnits, currentMapRows, currentMapCols, UNIT_COMBAT_STATS, UNIT_HEALTH, COMBAT_DAMAGE_SCALE.
// Calls getHexDistance, getUnitTypeName, isValid, getNeighbors, getUnitAt.
// Uses originalConsoleLog, originalConsoleWarn.
// ============================================================================


/**
 * Calculates the effective combat range for a group of units involved in a single engagement.
 * The group's range is the minimum combat range of all non-Cavalry units in the group,
 * unless a Cavalry unit is present, in which case the range is always 1 (melee).
 * Depends on getCombatRange from this file (which depends on constants/utils).
 * Depends on UnitType from constants.js.
 * Access global UNIT_COMBAT_STATS.
 * Uses originalConsoleWarn.
 */

function getEffectiveCombatRange(unit, unitCombatStats, unitTypeConstants) {
    let minBaseRange = 0;
    let hasCavalry = false;

    // Ensure unit and its type/stats are valid
    if (unit && unitCombatStats[unit.type]) {
        if (unit.type === unitTypeConstants.CAVALRY) {
            hasCavalry = true;
        }

        // Get the base range defined in UNIT_COMBAT_STATS
        const baseRange = unitCombatStats[unit.type].range?.base; // Use optional chaining

        if (baseRange !== undefined && baseRange !== null && baseRange !== Infinity) {
            minBaseRange = Math.max(minBaseRange, baseRange);
        } else {
            // If a unit has an undefined/null/Infinity base range, treat it as having 0 range for the group min
            minBaseRange = Math.max(minBaseRange, 0);
        }
    } else if (unit) { // Check if unit is not null/undefined before accessing properties
        // Treat invalid units as contributing 0 to the minimum range calculation
        minBaseRange = Math.max(minBaseRange, 0);
    }

    // Apply the Cavalry rule: if any Cavalry is present, the group's effective range is 1 (melee)
    //if (hasCavalry) {
    // originalConsoleLog("[getEffectiveGroupCombatRange] Cavalry detected in group, effective range is 1.");
    //   return 1;
    //}

    // Return the minimum base range found among non-Cavalry units, or 0 if no valid ranges were found
    // originalConsoleLog(`[getEffectiveGroupCombatRange] No Cavalry. Minimum base range in group: ${minBaseRange === Infinity ? 0 : minBaseRange}.`);
    return minBaseRange === Infinity ? 0 : minBaseRange;
}


function evaluateAttackDefense(attacker, defender) {
    //We need to evaluate the different attack values
    //First there might be some attacker that cannot attack a defender because they are too far
    attackList = new Set();
    defenseList = new Set();
    attackInBattle = new Set();
    defenseInBattle = new Set();

    //First we check that each unit is in range
    //cavalry could be part of a group but not be in range of any other units
    attacker.forEach(unitA => {
        const rangeA = getEffectiveCombatRange(unitA, UNIT_COMBAT_STATS, UnitType);
        defender.forEach(unitB => {
            const dst = getHexDistance(unitA.row, unitA.col, unitB.row, unitB.col);
            //Unit B is in range, we keep it
            if (dst <= rangeA) {
                attackList.add(unitA);
                defenseInBattle.add(unitB);
            }
        });
    });

    defender.forEach(unitB => {
        const rangeB = getEffectiveCombatRange(unitB, UNIT_COMBAT_STATS, UnitType);
        attacker.forEach(unitA => {
            const dst = getHexDistance(unitA.row, unitA.col, unitB.row, unitB.col);
            //Unit A is in range, we keep it
            if (dst <= rangeB) {
                defenseList.add(unitB);
                attackInBattle.add(unitA);
            }
        });
    });

    let totalStatAttacker = 0;
    let totalStatDefender = 0;
    attackList.forEach(unit => {
        const stat= UNIT_COMBAT_STATS[unit.type]["attack"]; // Uses constant
        totalStatAttacker += stat;
    });

    defenseList.forEach(unit => {
        const stat= UNIT_COMBAT_STATS[unit.type]["defense"]; // Uses constant
        totalStatDefender += stat;
    });

    return {totalStatAttacker, totalStatDefender, attackInBattle, defenseInBattle};
}

/**
 * Resolves a single combat instance based on aggregated attack and defense stats,
 * introducing randomness to the effective power of each side.
 * Uses a diminishing returns formula to give smaller forces a fighting chance.
 * Determines the winner and calculates the damage to apply to the loser(s).
 *
 * Depends on:
 * - COMBAT_DAMAGE_SCALE from constants.js
 * - COMBAT_RANDOMNESS_FACTOR from constants.js
 *
 * @param {number} totalAttackerAttack - The sum of attack stats of all attacking units.
 * @param {number} totalDefenderDefense - The sum of defense stats of all defending units.
 * @returns {{outcome: string, damage: number, targetSide: string}} An object describing the combat result.
 */
function resolveCombat(totalAttackerAttack, totalDefenderDefense) {
    let outcome = 'draw';
    let damage = 0;
    let targetSide = 'both'; // Default to both sides taking damage in a draw

    // --- Introduce Randomness with Attacker Bias ---
    const R = COMBAT_RANDOMNESS_FACTOR;

    // Generate a base random factor between -R and +R centered around 0
    const baseRandomFactor = () => (Math.random() - 0.5) * 2 * R;

    // Apply a positive bias for the attacker and negative for the defender
    const attackerRandomFactor = baseRandomFactor() + (R * 0.5);
    const defenderRandomFactor = baseRandomFactor() - (R * 0.5);

    // Calculate effective power after applying biased randomness
    // Ensure power does not become negative
    const effectiveAttackerPower = Math.max(0, totalAttackerAttack * (1 + attackerRandomFactor));
    const effectiveDefenderPower = Math.max(0, totalDefenderDefense * (1 + defenderRandomFactor));
    // --- End Randomness with Attacker Bias ---

    // --- Apply Diminishing Returns Formula ---
    // This formula gives smaller forces a better chance
    // while still giving an advantage to superior forces
    const applyDiminishingReturns = (value) => {
        // Square root is a good way to get diminishing returns
        // Could also use Math.pow(value, 0.7) or another exponent between 0 and 1
        return Math.pow(value, 0.45);
    };

    // Combat Power for comparison is now based on effective stats after randomness AND diminishing returns
    const attackerCombatPower = applyDiminishingReturns(effectiveAttackerPower);
    const defenderCombatPower = applyDiminishingReturns(effectiveDefenderPower);
    // --- End Diminishing Returns ---

    // Increase the threshold difference required for a decisive victory
    const victoryThreshold = 1.15; // 10% minimum difference for a decisive victory

    // Determine winner based on the adjusted combat powers
    if (attackerCombatPower > defenderCombatPower * victoryThreshold) {
        outcome = 'attacker';
        // Damage based on raw effective powers (not diminished) to maintain significant impact
        damage = (effectiveAttackerPower - effectiveDefenderPower) * COMBAT_DAMAGE_SCALE;
        targetSide = 'defender';
    }
    else if (defenderCombatPower > attackerCombatPower * victoryThreshold) {
        outcome = 'defender';
        damage = (effectiveDefenderPower - effectiveAttackerPower) * COMBAT_DAMAGE_SCALE;
        targetSide = 'attacker';
    }
    else {
        outcome = 'draw';
        // Damage in a draw - calculated as a fraction of total combined effective power
        damage = (effectiveAttackerPower + effectiveDefenderPower) * COMBAT_DAMAGE_SCALE * 0.5;
        targetSide = 'both';
    }

    // Ensure damage is not negative
    damage = Math.max(0, damage);

    return { outcome, damage, targetSide };
}


/**
 * Distributes damage among a list of units. Reduces health.
 * Returns a list of units that were eliminated (health <= 0).
 * Modifies unit objects directly.
 * Uses originalConsoleLog.
 */
function distributeDamage(unitsList, damage) {
    if (!unitsList || unitsList.size === 0 || damage <= 0) {
        return []; // Nothing to do
    }

    const eliminatedUnits = [];
    const damagePerUnit = damage / unitsList.size; // Simple distribution

    unitsList.forEach(unit => {
        if (unit && unit.health > 0) {
            unit.health -= damagePerUnit;
            if (unit.health <= 0) {
                unit.health = 0; // Ensure health doesn't go below zero
                eliminatedUnits.push(unit);
                originalConsoleLog(`[distributeDamage] Unit ID ${unit.id} (${getUnitTypeName(unit.type)}) eliminated!`);
            }
        }
    });

    return eliminatedUnits;
}


// ============================================================================
// Fog of War Logic
// Depends on constants.js, utils.js.
// Access global map, currentUnits, currentMapRows, currentMapCols, visibleHexes, playerArmyColor.
// Calls getHexDistance, getNeighbors, getUnitTypeName, isValid.
// Uses originalConsoleLog, originalConsoleWarn.
// ============================================================================


/**
 * Calculates and updates the visible hexes based on unit positions and vision ranges
 * for the *local player's army*.
 * Depends on getHexDistance, getNeighbors, getUnitTypeName, isValid from utils.js.
 * Depends on VISION_RANGES, UnitType, Terrain from constants.js.
 * Access global map, currentUnits, currentMapRows, currentMapCols, visibleHexes, playerArmyColor.
 * Calls getHexDistance, getNeighbors, getUnitTypeName, isValid.
 * Uses originalConsoleLog, originalConsoleWarn.
 */
function updateVisibility() {
    // originalConsoleLog(`[updateVisibility] Recalculating visible hexes. playerArmyColor: ${playerArmyColor}, Map defined: ${map !== null}, Units count: ${currentUnits ? currentUnits.length : 'null'}`); // *** ADDED LOGGING ***
    // Initialize visibleHexes array
    visibleHexes = Array(currentMapRows).fill(null).map(() => Array(currentMapCols).fill(false));

    // *** NEW: Check if playerArmyColor is defined before calculating visibility ***
    // If playerArmyColor is null, it's either the start (not yet assigned)
    // or single-player mode. In single-player mode, visibility is total (no fog).
    if (!map || !currentUnits || currentUnits.length === 0) { // Check if map or units exist
        originalConsoleLog(`[updateVisibility] Map or units not initialized or no units remaining for ${playerArmyColor} army. No visibility calculated via BFS.`); // *** IMPROVED LOGGING ***
        // Continue to the next block to ensure own hexes are visible even if no general visibility is spread
    } else {

        // Filter units to only include the local player's army for visibility calculation
        // *** MODIFICATION HERE: Use playerArmyColor instead of ARMY_COLOR_BLUE ***
        const playerUnits = currentUnits.filter(unit => unit && unit.armyColor === playerArmyColor && unit.health > 0); // Use global playerArmyColor, check health

        // originalConsoleLog(`[updateVisibility] Calculating visibility for ${playerUnits.length} player units (${playerArmyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} Army) via BFS.`); // *** IMPROVED LOGGING TOO CHATTY***


        playerUnits.forEach(unit => {
            // Add unit existence check
            if (!unit) return;

            const unitR = unit.row;
            const unitC = unit.col;
            const unitType = unit.type;

            if (!isValid(unitR, unitC, currentMapRows, currentMapCols)) { // Uses utils function, global dims
                originalConsoleWarn(`[updateVisibility] Skipping visibility for invalid unit position at (${unitR}, ${unitC}) for unit ID ${unit.id}.`); // *** IMPROVED LOGGING ***
                return;
            }

            const terrainAtUnitHex = map[unitR][unitC]; // Uses global map

            let visionRange = VISION_RANGES[unitType]?.base || 0; // Use optional chaining and default to 0


            // Apply terrain bonus for Infantry and Artillery (and Artillery combat range?)
            if (unitType === UnitType.INFANTERY || unitType === UnitType.ARTILLERY) { // Uses constants
                // Assuming VISION_RANGES structure has hill_mountain for these types
                if (terrainAtUnitHex === Terrain.HILL || terrainAtUnitHex === Terrain.MOUNTAIN) { // Uses constants
                    // Check if hill_mountain range is defined, otherwise use base
                    visionRange = VISION_RANGES[unitType]?.hill_mountain !== undefined ? VISION_RANGES[unitType].hill_mountain : visionRange;
                }
                // Note: Artillery combat range bonus might be different from vision range bonus.
                // Check constants.js and adjust if necessary. Assuming vision and combat ranges are related.
            }
            // Note: Cavalry, Supply, Spy use base range only as per constants.js definition


            // originalConsoleLog(`[updateVisibility] Unit type ${getUnitTypeName(unitType)} ID ${unit.id} at (${unitR}, ${unitC}) on terrain ${terrainAtUnitHex} has vision range: ${visionRange}.`); // Too chatty


            // Use BFS to mark all hexes within the calculated vision range as visible
            const queue = [{ r: unitR, c: unitC, dist: 0 }];
            const visited = new Set(`${unitR},${unitC}`); // Initialize visited with the starting hex - *** BUG FIX: Used unitR, unitC instead of potentially uninitialized r, c ***

            while (queue.length > 0) {
                const { r, c, dist } = queue.shift();

                // Mark the current hex as visible
                if (isValid(r, c, currentMapRows, currentMapCols)) { // Check validity again
                    visibleHexes[r][c] = true; // Sets global visibleHexes
                } else {
                    continue; // Skip invalid hexes
                }

                // If we are within vision range, explore neighbors
                if (dist < visionRange) {
                    const neighbors = getNeighbors(r, c, currentMapRows, currentMapCols);
                    for (const [nr, nc] of neighbors) {
                        const neighborKey = `${nr},${nc}`;
                        if (!visited.has(neighborKey) && isValid(nr, nc, currentMapRows, currentMapCols)) {
                            visited.add(neighborKey);
                            queue.push({ r: nr, c: nc, dist: dist + 1 });
                        }
                    }
                }
            }
        });
    } // End of else block for map/units check


    // --- Ensure hexes with player units are visible (Added Fix) ---
    // This loop runs AFTER the BFS calculation and ensures that any hex
    // currently occupied by a living unit of the local player's army is marked visible.
    // This fixes the issue where a unit's own hex might not be visible.
    // This check should happen regardless of whether the main BFS loop ran (e.g., if no units have vision > 0).
    // originalConsoleLog(`[updateVisibility] Ensuring hexes of living player units (${playerArmyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} Army) are visible.`); // *** IMPROVED LOGGING TOO CHATTY***
    let ownUnitHexesVisibleCount = 0; // *** ADDED LOGGING ***
    if (currentUnits) { // Only applies if player color is assigned and units exist
        currentUnits.forEach(unit => {
            if (unit && unit.armyColor === playerArmyColor && unit.health > 0) {
                if (isValid(unit.row, unit.col, currentMapRows, currentMapCols)) {
                    visibleHexes[unit.row][unit.col] = true;
                    ownUnitHexesVisibleCount++; // *** ADDED LOGGING ***
                    // originalConsoleLog(`[updateVisibility] Ensuring hex (${unit.row}, ${unit.col}) of unit ID ${unit.id} is visible.`); // Optional detailed log
                } else {
                    originalConsoleWarn(`[updateVisibility] Unit ID ${unit.id} at invalid position (${unit.row}, ${unit.col}) while ensuring visibility.`); // Log invalid unit position
                }
            }
        });
    }
}

/**
 * Gets all hexes within a specified range from a center hex.
 * Does NOT check for line-of-sight or terrain blocking vision.
 * Uses a BFS-like approach up to the max range.
 * Depends on getNeighbors, isValid from utils.js.
 * Access global currentMapRows, currentMapCols.
 */
function getHexesInRange(centerR, centerC, range) {
    const hexes = new Set();
    const queue = [{ r: centerR, c: centerC, dist: 0 }];
    const visited = new Set(`${centerR},${centerC}`);

    // Include the center hex itself
    if (isValid(centerR, centerC, currentMapRows, currentMapCols)) {
        hexes.add(`${centerR},${centerC}`);
    } else {
        // Should not happen if called with valid center, but safety check
        originalConsoleWarn(`[getHexesInRange] Invalid center coordinates provided: (${centerR}, ${centerC})`);
        return []; // Return empty array if center is invalid
    }


    while (queue.length > 0) {
        const { r, c, dist } = queue.shift();

        // If we are within range, explore neighbors
        if (dist < range) {
            const neighbors = getNeighbors(r, c, currentMapRows, currentMapCols);
            for (const [nr, nc] of neighbors) {
                const neighborKey = `${nr},${nc}`;
                if (!visited.has(neighborKey) && isValid(nr, nc, currentMapRows, currentMapCols)) {
                    visited.add(neighborKey);
                    hexes.add(neighborKey); // Add the neighbor hex to the set
                    queue.push({ r: nr, c: nc, dist: dist + 1 });
                }
            }
        }
    }

    // Convert Set of strings back to array of [r, c] pairs
    const hexArray = Array.from(hexes).map(key => key.split(',').map(Number));
    return hexArray;
}


// ============================================================================
// Game Loop and Time Management
// This is where movement is now processed incrementally each tick.
// ============================================================================

/**
 * Gère un seul pas de mouvement pour une unité donnée.
 * Calcule le prochain hexagone, met à jour la position de l'unité,
 * et redémarre un timer pour le pas suivant si nécessaire.
 * @param {object} unit - L'unité à déplacer.
 */
function moveUnitStep(unit) {
    // Si l'unité a été éliminée pendant que son timer était en cours
    if (!unit || unit.health <= 0) {
        //originalConsoleLog(`[moveUnitStep] Unit ID ${unit.id} is no longer alive. Cancelling further movement.`);
        unitMovementTimers.delete(unit.id);
        return;
    }

    const currentR = unit.row;
    const currentC = unit.col;
    const targetR = unit.targetRow;
    const targetC = unit.targetCol;

    // Si l'unité est déjà à la cible ou n'a plus de cible valide, annuler le mouvement.
    if (targetR === null || targetC === null || (currentR === targetR && currentC === targetC)) {
        //originalConsoleLog(`[moveUnitStep] Unit ID ${unit.id} arrived at target (${unit.row}, ${unit.col}) or target cleared. Stopping movement.`);
        movedHexUnit.delete(unit); // Supprimer de la liste de détection de boucle
        unit.targetRow = null;
        unit.targetCol = null;
        unit.movementProgress = 0; // Réinitialiser le progrès
        unit.previousRow = unit.row;
        unit.previousCol = unit.col;
        if (unitMovementTimers.has(unit.id)) {
            clearTimeout(unitMovementTimers.get(unit.id));
            unitMovementTimers.delete(unit.id);
        }
        return; // Arrêter le traitement pour cette unité
    }

    const neighbors = getNeighbors(currentR, currentC, currentMapRows, currentMapCols);
    let bestNextHex = null;
    let minCombinedMetric = Infinity;
    let viableNeighbors = [];

    const validLivingCurrentUnits = currentUnits.filter(u => u !== null && u !== undefined && u.health > 0);

    for (const neighbor of neighbors) {
        const neighborR = neighbor[0];
        const neighborC = neighbor[1];

        if (!isValid(neighborR, neighborC, currentMapRows, currentMapCols)) continue;

        const neighborTerrain = map[neighborR][neighborC];
        const gameMinutesNeededForStep = calculateMoveDurationGameMinutes(unit.type, neighborTerrain);

        if (gameMinutesNeededForStep === Infinity) continue;

        const unitAtNeighbor = getUnitAt(neighborR, neighborC, validLivingCurrentUnits, "moveUnitStep - movement blocking check neighbor");
        const isOccupied = (unitAtNeighbor !== null && unitAtNeighbor.id !== unit.id);

        if (isOccupied) continue;

        viableNeighbors.push({ r: neighborR, c: neighborC, gameMinutesCost: gameMinutesNeededForStep });
    }

    if (viableNeighbors.length === 0) {
        console.log(`${getUnitTypeName(unit.type)} of the ${unit.armyColor === playerArmyColor ? 'Blue' : 'Red'} army is blocked at (${unit.row}, ${unit.col}) towards (${targetR}, ${targetC}).`);
        originalConsoleLog(`[moveUnitStep] Unit type ${getUnitTypeName(unit.type)} ID ${unit.id} is blocked at (${unit.row}, ${unit.col}). No viable neighbors.`);
        movedHexUnit.delete(unit);
        unit.targetRow = null;
        unit.targetCol = null;
        unit.movementProgress = 0;
        unit.previousRow = unit.row;
        unit.previousCol = unit.col;
        if (unitMovementTimers.has(unit.id)) {
            clearTimeout(unitMovementTimers.get(unit.id));
            unitMovementTimers.delete(unit.id);
        }
        return; // Unité bloquée, arrêter le mouvement
    }

    let onlyPreviousHexIsViable = viableNeighbors.length === 1 && viableNeighbors[0].r === unit.previousRow && viableNeighbors[0].c === unit.previousCol;

    for (const neighbor of viableNeighbors) {
        const { r: neighborR, c: neighborC, gameMinutesCost: gameMinutesNeededForStep } = neighbor;
        const targetDistance = getHexDistance(neighborR, neighborC, targetR, targetC);

        let previousHexPenalty = 0;
        if (neighborR === unit.previousRow && neighborC === unit.previousCol && !onlyPreviousHexIsViable) {
            previousHexPenalty = 60 * 5;
        }

        // Garder le facteur aléatoire pour la cohérence des tests locaux, mais
        // noter le risque de désynchro sans un PRNG avec seed synchronisée pour le multijoueur.
        const randomFactor = (Math.random() * 0.01) - 0.005;

        const combinedMetric = targetDistance * 1000 + (gameMinutesNeededForStep + previousHexPenalty) + randomFactor;

        if (bestNextHex === null || combinedMetric < minCombinedMetric) {
            minCombinedMetric = combinedMetric;
            bestNextHex = { r: neighborR, c: neighborC, gameMinutesCost: gameMinutesNeededForStep };
        }
    }

    if (bestNextHex) {
        const { r: nextR, c: nextC, gameMinutesCost: gameMinutesNeededForStep } = bestNextHex;

        const oldR = unit.row;
        const oldC = unit.col;

        unit.row = nextR;
        unit.col = nextC;
        unit.previousRow = oldR;
        unit.previousCol = oldC;

        // Mise à jour de movedHexUnit pour la détection de boucle
        if (!movedHexUnit.has(unit)) {
            const hexVisits = new Map();
            hexVisits.set(`${nextR},${nextC}`, 1);
            movedHexUnit.set(unit, hexVisits);
        } else {
            const unitHexVisits = movedHexUnit.get(unit);
            const currentHexKey = `${nextR},${nextC}`;

            if (unitHexVisits.has(currentHexKey)) {
                let visitCount = unitHexVisits.get(currentHexKey);
                visitCount++;
                unitHexVisits.set(currentHexKey, visitCount);

                if (visitCount >= 3) {
                    originalConsoleLog(`[moveUnitStep] Unit type ${getUnitTypeName(unit.type)} ID ${unit.id} detected loop. Stopping movement.`);
                    movedHexUnit.delete(unit);
                    unit.targetRow = null;
                    unit.targetCol = null;
                    unit.movementProgress = 0;
                    unit.previousRow = unit.row;
                    unit.previousCol = unit.col;
                    if (unitMovementTimers.has(unit.id)) {
                        clearTimeout(unitMovementTimers.get(unit.id));
                        unitMovementTimers.delete(unit.id);
                    }
                    return; // Arrêter le mouvement en cas de boucle
                }
            } else {
                unitHexVisits.set(currentHexKey, 1);
            }
        }

        // Mise à jour de la visibilité car l'unité a bougé
        // Note: updateVisibility() devrait être appelé une seule fois par tick globalement,
        // mais pour l'instant, nous le mettons ici pour réactivité si une unité individuelle bouge.
        // Une meilleure approche serait de stocker un drapeau global 'movedThisTick' et de l'appeler à la fin de gameLoop.
        updateVisibility();

        // Si l'unité est arrivée à destination après ce pas
        if (unit.row === targetR && unit.col === targetC) {
            console.log(`${getUnitTypeName(unit.type)} of the ${unit.armyColor === playerArmyColor ? 'Blue' : 'Red'} army has arrived at destination (${unit.row}, ${unit.col}).`);
            originalConsoleLog(`[moveUnitStep] Unit type ${getUnitTypeName(unit.type)} ID ${unit.id} arrived at final destination (${unit.row}, ${unit.col}) after step.`);
            movedHexUnit.delete(unit);
            unit.targetRow = null;
            unit.targetCol = null;
            unit.movementProgress = 0;
            unit.previousRow = unit.row;
            unit.previousCol = unit.col;
            if (unitMovementTimers.has(unit.id)) {
                clearTimeout(unitMovementTimers.get(unit.id));
                unitMovementTimers.delete(unit.id);
            }
            return; // L'unité est arrivée
        }

        // L'unité doit continuer à bouger : démarrer le timer pour le prochain pas
        const realTimeForNextStep = gameMinutesNeededForStep * MILLISECONDS_PER_GAME_MINUTE;
        const timerId = setTimeout(() => moveUnitStep(unit), realTimeForNextStep);
        unitMovementTimers.set(unit.id, timerId);
        //originalConsoleLog(`[moveUnitStep] Unit ID ${unit.id} moved to (${unit.row}, ${unit.col}). Next step in ${realTimeForNextStep.toFixed(0)} ms.`);
    } else {
        // Fallback si aucun meilleur hexagone n'est trouvé (ne devrait pas arriver si viableNeighbors n'est pas vide)
        console.log(`${getUnitTypeName(unit.type)} of the ${unit.armyColor === playerArmyColor ? 'Blue' : 'Red'} army is blocked at (${unit.row}, ${unit.col}) towards (${targetR}, ${targetC}) - fallback block.`);
        originalConsoleLog(`[moveUnitStep] Unit type ${getUnitTypeName(unit.type)} ID ${unit.id} is blocked at (${unit.row}, ${unit.col}). Fallback block.`);
        movedHexUnit.delete(unit);
        unit.targetRow = null;
        unit.targetCol = null;
        unit.movementProgress = 0;
        unit.previousRow = unit.row;
        unit.previousCol = unit.col;
        if (unitMovementTimers.has(unit.id)) {
            clearTimeout(unitMovementTimers.get(unit.id));
            unitMovementTimers.delete(unit.id);
        }
    }
}

/**
 * The main game loop: updates time, manages unit movement, detects combat (Blue only), and redraws.
 * Movement is now processed incrementally within this loop based on accumulated game time.
 * Depends on MILLISECONDS_PER_GAME_MINUTE, UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR, ARMY_COLOR_BLUE, ARMY_COLOR_RED, Terrain, UnitType, UNIT_HEALTH from constants.js.
 * Depends on COMBAT_INTERVAL_GAME_MINUTES from constants.js.
 * Depends on calculateMoveDurationGameMinutes from constants.js.
 * Depends on getMovementCost, getUnitAt, getUnitTypeName, getHexDistance, isValid, getNeighbors from utils.js.
 * Depends on drawMapAndUnits, updateVisibility, getCombatRange, getUnitsInvolvedInCombat, calculateTotalStat, resolveCombat, distributeDamage, getHexesInRange, getEffectiveGroupCombatRange.
 * Access global map, currentUnits, currentMapRows, currentMapCols, HEX_SIZE, TerrainColors, selectedUnit, gameTimeInMinutes, lastRealTime, gameLoopInterval, visibleHexes, ARMY_COLOR_BLUE, ARMY_COLOR_RED, UNIT_COMBAT_STATS, UnitType.
 * Access global lastCombatGameTimeInMinutes, combatHexes, playerArmyColor, ws.
 * Utilise originalConsoleLog, cancelAnimationFrame, requestAnimationFrame, performance.now.
 */
function gameLoop(currentTime) {
    // If gameLoopInterval is null, it means the loop has been cancelled
    if (gameLoopInterval === null) {
        originalConsoleLog("[gameLoop] Loop interval is null, cancelling frame.");
        return;
    }
    // *** NEW : Stop the loop if the game is over ***
    if (gameOver) {
        originalConsoleLog("[gameLoop] Game is over, cancelling frame.");
        // Ensure the final game over state is drawn
        drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors);
        return;
    }
    // *** END NEW ***


    // Ensure game state is sufficiently loaded before processing game logic.
    // If map or units are missing, just skip the game logic for this tick but keep drawing (or drawing blank).
    // Check if playerArmyColor is set AND (map and currentUnits are not null/empty) OR playerArmyColor is null (single player)
    if (!map || !currentUnits || currentUnits.length === 0 || currentMapRows === 0 || currentMapCols === 0) { // Added dimension check
        // In multiplayer and state is not ready (e.g., Red waiting for sync)
        drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Draw placeholder or partial state
        gameLoopInterval = requestAnimationFrame(gameLoop);
        return; // Skip game logic
    } else if (!map || !currentUnits || currentUnits.length === 0 || currentMapRows === 0 || currentMapCols === 0) { // Added dimension check
        // In single player and state is not ready (e.g., before first regeneration)
        drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Draw placeholder or partial state
        gameLoopInterval = requestAnimationFrame(gameLoop);
        return; // Skip game logic
    }
    // If we reach here, either playerArmyColor is null and map/units are ready (single player)
    // OR playerArmyColor is not null and map/units are ready (multiplayer, both clients)


    const realTimeElapsed = currentTime - lastRealTime;
    lastRealTime = currentTime;

    // Update game time in minutes based on real time elapsed
    const gameMinutesToAdd = (realTimeElapsed / MILLISECONDS_PER_GAME_MINUTE);
    gameTimeInMinutes += gameMinutesToAdd;

    // --- Unit Movement Processing (Event-driven via Timers) ---
    // Cette partie est responsable de DÉMARRER le mouvement des unités
    // qui ont une cible et n'ont pas encore de timer actif.
    // Le mouvement pas-par-pas est géré par la fonction moveUnitStep et ses timers.
    const unitsEligibleForMovementStart = currentUnits.filter(unit =>
        unit !== null && unit !== undefined && unit.health > 0 && // Unité vivante
        unit.targetRow !== null && unit.targetCol !== null && // A une cible
        !(unit.row === unit.targetRow && unit.col === unit.targetCol) && // N'est pas déjà à la cible
        !unitMovementTimers.has(unit.id) // N'a pas de timer de mouvement déjà actif
    );

    unitsEligibleForMovementStart.forEach(unit => {
        // Démarrer le premier pas pour cette unité.
        // La fonction moveUnitStep s'occupera d'enchaîner les pas suivants.
        // On l'appelle directement une première fois pour initier le processus.
        originalConsoleLog(`[gameLoop] Initiating movement for Unit ID ${unit.id} towards (${unit.targetRow}, ${unit.targetCol}).`);
        moveUnitStep(unit);
    });

    // --- Combat Time Tracking and Resolution ---
    // This section runs ONLY on the Blue client, as it is the combat authority.
    // Only process combat if the game is NOT over
    

    if (!gameOver && playerArmyColor === ARMY_COLOR_BLUE) {
        if (gameTimeInMinutes >= lastCombatGameTimeInMinutes + COMBAT_INTERVAL_GAME_MINUTES) {
            originalConsoleLog(`[gameLoop] ${COMBAT_INTERVAL_GAME_MINUTES} game minutes elapsed. Initiating combat checks (Blue Client).`);
            // Clear previous combat highlights at the start of a new combat interval
            combatHexes.clear();

            lastCombatGameTimeInMinutes = gameTimeInMinutes; // Update last combat time *before* resolving combat

            const engagementsProcessedBleu = new Set();
            const engagementsProcessedRouge = new Set();
            // Filter units to only include living ones for combat checks
            const unitsForCombatCheck = currentUnits.filter(unit => unit !== null && unit !== undefined && unit.health > 0);

            const lesBleus = unitsForCombatCheck.filter(unit =>
                //const unitAStillExistsAndAlive = unitsForCombatCheck.find(u => u.id === unit.id);
                (unit.armyColor === ARMY_COLOR_BLUE)
            );

            const lesRouges = unitsForCombatCheck.filter(unit =>
                //const unitAStillExistsAndAlive = unitsForCombatCheck.find(u => u.id === unit.id);
                (unit.armyColor === ARMY_COLOR_RED)
            );

            let oneCombat = false;
            if (lesBleus && lesRouges) {
                // Iterate through all living units to check for engagements FROM them
                lesBleus.forEach(unitBlue => {
                    const unitAStillExistsAndAlive = unitsForCombatCheck.find(u => u.id === unitBlue.id);
                    if (!unitAStillExistsAndAlive)
                        return;

                    // Only initiate checks FROM our units (Blue) towards enemies (Red)
                    // This simplifies the N^2 check, only need to check Blue units vs Red units.
                    // Combat logic is symmetric and calculates attack/defense for both sides regardless of who initiates.

                    let attackerParticipatingUnits = new Set();                    

                    let firstDefender = null;
                    //First, we look for all enemy units within firing range
                    let defenderParticipatingUnits = new Set();
                    const hexvoisins = getHexesInRange(unitBlue.row, unitBlue.col, MAX_RANGE); // Check current hex and neighbors for range 1 // Uses game function
                    voisins = new Set();
                    voisins.add(unitBlue);
                    hexvoisins.forEach(pos => {
                        lesBleus.forEach(unitBlue => {                        
                            if (unitBlue.row == pos[0] && unitBlue.col == pos[1])
                                voisins.add(unitBlue);
                        });
                    });                    
                    voisins.forEach(unitBlue => {
                        const rangeBlue = getEffectiveCombatRange(unitBlue, UNIT_COMBAT_STATS, UnitType);
                        lesRouges.forEach(unitRed => {
                            const unitRedStillExistsAndAlive = unitsForCombatCheck.find(u => u.id === unitRed.id);
                            if (unitRedStillExistsAndAlive) {
                                const dst = getHexDistance(unitBlue.row, unitBlue.col, unitRed.row, unitRed.col);
                                //Unit B is in range, we keep it
                                if (dst <= rangeBlue) {
                                    defenderParticipatingUnits.add(unitRed);
                                    attackerParticipatingUnits.add(unitBlue);
                                    if (firstDefender == null) {
                                        firstDefender = unitRed;
                                    }
                                }
                                else {
                                    //We still check if our unit is threatened by unitRed
                                    const rangeRed = getEffectiveCombatRange(unitRed, UNIT_COMBAT_STATS, UnitType);
                                    if (dst <= rangeRed) {
                                        defenderParticipatingUnits.add(unitRed);
                                        attackerParticipatingUnits.add(unitBlue);
                                        if (firstDefender == null) {
                                            firstDefender = unitRed;
                                        }
                                    }
                                }
                            }
                        });
                    });

                    //No threat to this unit
                    if (defenderParticipatingUnits.size == 0) {                        
                        return;
                    }
                    
                    oneCombat = true;

                    //We then check for these potential targets, if there other units involved
                    let loopunit = true;
                    let newDefenders = defenderParticipatingUnits;
                    while (loopunit) {           
                        let newAttackers = new Set();             
                        newDefenders.forEach(unitRed => {
                            const rangeRed = getEffectiveCombatRange(unitRed, UNIT_COMBAT_STATS, UnitType);
                            lesBleus.forEach(unitBlue => {
                                const unitStillExistsAndAlive = unitsForCombatCheck.find(u => u.id === unitBlue.id);
                                if (unitStillExistsAndAlive && !attackerParticipatingUnits.has(unitBlue)) {
                                    const dst = getHexDistance(unitBlue.row, unitBlue.col, unitRed.row, unitRed.col);
                                    //The unit is in range, we keep it
                                    if (dst <= rangeRed) {
                                        attackerParticipatingUnits.add(unitBlue);
                                        newAttackers.add(unitBlue);
                                    }
                                }
                            });
                        });
                        if (!newAttackers.size)
                            loopunit = false;
                        else {
                            newDefenders = new Set();
                            newAttackers.forEach(unitBlue => {
                                const rangeBlue = getEffectiveCombatRange(unitBlue, UNIT_COMBAT_STATS, UnitType);
                                lesRouges.forEach(unitRed => {
                                    const unitStillExistsAndAlive = unitsForCombatCheck.find(u => u.id === unitRed.id);
                                    if (unitStillExistsAndAlive && !defenderParticipatingUnits.has(unitRed)) {
                                        const dst = getHexDistance(unitBlue.row, unitBlue.col, unitRed.row, unitRed.col);
                                        //The unit is in range, we keep it
                                        if (dst <= rangeBlue) {
                                            defenderParticipatingUnits.add(unitRed);
                                            newDefenders.add(unitRed);
                                        }
                                    }
                                });
                            });
                        }
                        if (!newDefenders)
                            loopunit = false;
                    }

                    skip = false;
                    attackerParticipatingUnits.forEach(unit => {
                        if (engagementsProcessedBleu.has(unit)) {
                            skip = true;
                        }
                        else {
                            engagementsProcessedBleu.add(unit);
                            allUnitInvolvedCombat.add(unit);
                        }
                    });
                    if (skip)
                        return;

                    const nb = allUnitInvolvedCombat.size; 
                    defenderParticipatingUnits.forEach(unit => {
                        if (engagementsProcessedRouge.has(unit)) {
                            skip = true;
                        }
                        else {
                            engagementsProcessedRouge.add(unit);
                            allUnitInvolvedCombat.add(unit);
                        }
                    });
                    if (skip)
                        return;

                    if (nb < allUnitInvolvedCombat.size) {
                        playTrumpetSound();
                        ws.send(JSON.stringify({ type: 'PLAY_SOUND' }));
                    }
                    
                    //If the red are in the blue camp
                    //The red are then the attacker...
                    let firstAttacker;
                    if (firstDefender.row < currentMapRows/2) {
                        const attack = attackerParticipatingUnits;
                        attackerParticipatingUnits = defenderParticipatingUnits;
                        defenderParticipatingUnits = attack;
                        firstAttacker = firstDefender;
                        firstDefender = unitBlue;
                    }
                    else
                        firstAttacker = unitBlue;

                    // Combat Engagement! Mutual engagement confirmed.

                    // --- Mark hexes for combat highlighting (local display on Blue) ---
                    // Add all hexes occupied by participating units to the combatHexes set
                    attackerParticipatingUnits.forEach(unit => {
                        combatHexes.add(`${unit.row},${unit.col}`);
                    });
                    defenderParticipatingUnits.forEach(unit => {
                        combatHexes.add(`${unit.row},${unit.col}`);
                    });
                    // --- END Highlighting ---


                    // --- Resolve Combat for this Engagement ---
                    // originalConsoleLog(`[gameLoop] RESOLVING COMBAT! Engagement between Unit ID ${unitA.id} (${getUnitTypeName(unitA.type)} ${unitA.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'}) at (${unitA.row}, ${unitA.col}) and Unit ID ${unitB.id} (${getUnitTypeName(unitB.type)} ${unitB.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'}) at (${unitB.row}, ${unitB.col}).`);

                    const stats = evaluateAttackDefense(attackerParticipatingUnits, defenderParticipatingUnits);

                    const totalAttackerAttack = stats.totalStatAttacker;
                    const totalDefenderDefense = stats.totalStatDefender;

                    // --- Aggregation of Stats ---
                    originalConsoleLog(`[gameLoop] Aggregated Stats: Total Attacker Attack = ${totalAttackerAttack.toFixed(2)}, Total Defender Defense = ${totalDefenderDefense.toFixed(2)}.`);
                    // --- END Aggregation of Stats ---

                    // --- Resolve combat and apply damage (locally on Blue) ---
                    const combatResult = resolveCombat(totalAttackerAttack, totalDefenderDefense); // Uses game function, constants
                    originalConsoleLog(`[gameLoop] Combat Result: ${combatResult.outcome}. Damage: ${combatResult.damage.toFixed(2)}. Target: ${combatResult.targetSide}.`);

                    // Display combat outcome message to the console div (synced via wrapped console)
                    const attackerArmyColor = firstAttacker.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'; // Uses constant
                    const defenderArmyColor = firstDefender.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'; // Uses constant
                    let outcomeMessage = `Combat at (${firstAttacker.row}, ${firstAttacker.col}) vs (${firstDefender.row}, ${firstDefender.col}): `; // Base message

                    if (combatResult.outcome === 'attacker') {
                        outcomeMessage += `Victory for the ${attackerArmyColor} army.`;
                    } else if (combatResult.outcome === 'defender') {
                        outcomeMessage += `Victory for the ${defenderArmyColor} army.`;
                    } else {
                        outcomeMessage += `Draw.`;
                    }
                    outcomeMessage += ` Damage applied (${combatResult.targetSide}) : ${combatResult.damage.toFixed(1)}`;
                    console.log(outcomeMessage); // This goes to console div (synced)


                    let unitsEliminatedThisCombatInstance = [];
                    if (combatResult.damage > 0) {
                        // Apply damage to the units in the relevant group(s)
                        if (combatResult.targetSide === 'defender' || combatResult.targetSide === 'both') {
                            originalConsoleLog(`[gameLoop] Applying ${combatResult.damage.toFixed(2)} damage to units in the Defender camp.`);
                            const eliminatedDefender = distributeDamage(stats.defenseInBattle, combatResult.damage); // Uses game function
                            unitsEliminatedThisCombatInstance.push(...eliminatedDefender);
                        }
                        if (combatResult.targetSide === 'attacker' || combatResult.targetSide === 'both') {
                            originalConsoleLog(`[gameLoop] Applying ${combatResult.damage.toFixed(2)} damage to units in the Attacker camp.`);
                            const eliminatedAttacker = distributeDamage(stats.attackInBattle, combatResult.damage); // Uses game function
                            unitsEliminatedThisCombatInstance.push(...eliminatedAttacker);
                        }
                    }
                    // --- END Resolve combat and apply damage ---


                    // *** NEW : Check for General elimination after this combat instance ***
                    if (!gameOver && unitsEliminatedThisCombatInstance.length > 0) { // Check if game is not already over by a previous instance
                        const eliminatedGeneral = unitsEliminatedThisCombatInstance.find(unit => unit && unit.type === UnitType.GENERAL); // Uses constant

                        if (eliminatedGeneral) {
                            originalConsoleLog(`[gameLoop] Blue Client: General eliminated during combat instance! Unit ID: ${eliminatedGeneral.id}, Army: ${eliminatedGeneral.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'}`);

                            if (eliminatedGeneral.armyColor === ARMY_COLOR_BLUE) { // Blue's General eliminated
                                if (playerArmyColor === ARMY_COLOR_BLUE)
                                    console.log("The Blue General has been eliminated! You lost");
                                else
                                    console.log("The Blue General has been eliminated! You won");

                                endGame(ARMY_COLOR_RED); // Trigger game over state for losing on Blue side

                                // Send GAME_OVER message to Red client via server
                                if (ws && ws.readyState === WebSocket.OPEN) {
                                    ws.send(JSON.stringify({ type: 'GAME_OVER', outcome: 'red' }));
                                    originalConsoleLog("[gameLoop] Blue Client: Sent GAME_OVER (lose) message to server.");
                                }

                            } else if (eliminatedGeneral.armyColor === ARMY_COLOR_RED) { // Red's General eliminated
                                if (playerArmyColor === ARMY_COLOR_RED)
                                    console.log("The Red General has been eliminated! You lost");
                                else
                                    console.log("The Red General has been eliminated! You won");

                                endGame(ARMY_COLOR_BLUE); // Trigger game over state for winning on Blue side

                                // Send GAME_OVER message to Red client via server
                                if (ws && ws.readyState === WebSocket.OPEN) {
                                    ws.send(JSON.stringify({ type: 'GAME_OVER', outcome: 'blue' }));
                                    originalConsoleLog("[gameLoop] Blue Client: Sent GAME_OVER (win) message to server.");
                                }
                            }                            
                            // If a general was eliminated and game is over, no need to process more combat instances in this interval
                            return; // Exit the forEach for unitB
                        }
                    }
                    // *** END NEW : Check for General elimination ***


                    // *** Send combat results to the server/Red ***
                    // Send state of all participating units and IDs of eliminated units
                    const affectedUnits = new Set([...attackerParticipatingUnits, ...defenderParticipatingUnits]);
                    const combatUpdate = {
                        type: 'COMBAT_RESULT',
                        // Send just essential state for affected units that are STILL ALIVE locally
                        updatedUnits: Array.from(affectedUnits).filter(u => u && u.health > 0).map(unit => ({
                            id: unit.id,
                            health: unit.health,
                            row: unit.row, // Include position
                            col: unit.col
                        })),
                        eliminatedUnitIds: unitsEliminatedThisCombatInstance.map(u => u.id) // Send the IDs of units eliminated by this combat instance
                    };

                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(combatUpdate));
                        // originalConsoleLog("[gameLoop] Sent COMBAT_RESULT update to server."); // Chatty
                    } else {
                        console.warn("Server connection not established. Combat results not synchronized.");
                    }
                    // *** END Sending results ***


                    // *** Immediate elimination of units after combat instance (Blue side) ***
                    // Filter the main currentUnits list to remove units that now have health <= 0
                    // This happens AFTER checking for General elimination within this instance
                    const unitsBeforeFilter = currentUnits.length;
                    currentUnits = currentUnits.filter(unit => unit && unit.health > 0);

                    if (unitsBeforeFilter !== currentUnits.length) {
                        originalConsoleLog(`[gameLoop] Eliminated ${unitsBeforeFilter - currentUnits.length} units locally after combat instance. Total remaining: ${currentUnits.length}.`);
                    }
                    // *** END Immediate elimination ***



                    // If game is over (checked within the General elimination block), break out of further combat checks
                    if (gameOver) return; // Exit the forEach for unitA
                });
            }
            if (oneCombat == false)
                allUnitInvolvedCombat.clear();
        } //else if (!gameOver) { // Not in a combat interval AND game not over
            // Not in a combat interval, ensure combat highlights are cleared on Blue's side
            //if (combatHexes.size > 0) {
            //    combatHexes.clear();
                // originalConsoleLog("[gameLoop] Cleared combat highlights (not in combat interval).");
            //}
        //}

    }
    // Red client does NOT perform combat detection or resolution here.
    // It only executes unit movement based on received orders/syncs and handles local supply healing.
    // Combat results and eliminations are applied when receiving 'COMBAT_RESULT' messages.
    // Red relies on Blue's sync to know about combat hexes. combatHexes is updated in handleReceivedStateSync.
    // No need to clear combatHexes here on Red.


    // *** Final HP Recovery Phase by Supply (End of Tick) ***
    // This runs on BOTH clients, but only if game is NOT over
    if (!gameOver) {
        const unitsForSupplyCheck = currentUnits.filter(unit => unit !== null && unit !== undefined && unit.health > 0);

        unitsForSupplyCheck.forEach(unit => {
            if (!unit || unit.health <= 0) return;

            const maxHealth = UNIT_HEALTH[unit.type] !== undefined ? UNIT_HEALTH[unit.type] : 1; // Uses constant
            if (unit.health >= maxHealth) {
                // originalConsoleLog(`[gameLoop] Unit ID ${unit.id} is already at full health.`); // Chatty
                return; // Skip if already at full health
            }

            // Find if there is a SUPPLY unit *of the same army* in the same hex or adjacent hexes
            const hexesToCheckForSupply = getHexesInRange(unit.row, unit.col, 1); // Check current hex and neighbors for range 1 // Uses game function

            let supplyUnitFound = false;
            for (const hex of hexesToCheckForSupply) {
                const [supplyR, supplyC] = hex;
                // Ensure hex is valid before checking units
                if (!isValid(supplyR, supplyC, currentMapRows, currentMapCols)) continue;

                const unitsAtSupplyHex = unitsForSupplyCheck.filter(u => u.row === supplyR && u.col === supplyC && u.armyColor === unit.armyColor);

                if (unitsAtSupplyHex.find(u => u.type === UnitType.SUPPLY)) { // Uses constant
                    supplyUnitFound = true;
                    break; // Found a supply unit in range, no need to check further hexes
                }
            }

            if (supplyUnitFound && unit.type !== UnitType.SUPPLY) {
                // Healing amount scaled by game minutes elapsed
                const healingRatePerGameMinute = maxHealth * 0.005; // Example: heal 0.5% of max HP per game minute
                const healingAmount = healingRatePerGameMinute * gameMinutesToAdd; // Scale by actual elapsed game minutes

                unit.health = Math.min(maxHealth, unit.health + healingAmount);
            }
        });
    }
    // *** END Final HP Recovery Phase ***


    // Redraw the entire map and units based on their current positions and visibility.
    // This redraw happens every frame (tick).
    drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors);


    // Request the next frame using requestAnimationFrame, only if game is NOT over
    if (!gameOver) {
        gameLoopInterval = requestAnimationFrame(gameLoop);
    } else {
        originalConsoleLog("[gameLoop] Game is over, not requesting next frame.");
        // The final draw with the game over message is handled in endGame/handleGameOver.
    }
}

function loadGameStateFromJson(state) {
    originalConsoleLog("[loadGameStateFromJson] Loading game state from JSON.");
    if (!state) {
        originalConsoleError("[loadGameStateFromJson] Received empty state data.");
        return;
    }

    // Update the global variables of the Red client (or Blue during a local load)
    map = state.map; // The map object
    currentMapRows = state.currentMapRows; // Map height
    currentMapCols = state.currentMapCols; // Map width
    currentUnits = state.currentUnits; // The list of units

    // Ensure loaded units have necessary properties for movement/sync
    if (currentUnits) {
        currentUnits.forEach(unit => {
            // These properties are sent by Blue in GAME_STATE, but this loop
            // serves as a safety net in case the received unit object doesn't have all properties.
            if (unit.previousRow === undefined || unit.previousRow === null) unit.previousRow = unit.row;
            if (unit.previousCol === undefined || unit.previousCol === null) unit.previousCol = unit.col;
            if (unit.movementProgress === undefined || unit.movementProgress === null) unit.movementProgress = 0;
            if (unit.targetRow === undefined) unit.targetRow = null;
            if (unit.targetCol === undefined) unit.targetCol = null;
            // ID is critical for sync and commands. Ensure it is sent and received.
            if (unit.id === undefined || unit.id === null) {
                originalConsoleError(`Unit loaded from state is missing ID! This is a critical sync issue.`);
                // In production, you might handle this differently, but for now, log the error.
            }
            // Ensure unit health is a number
            if (typeof unit.health !== 'number') {
                originalConsoleWarn(`Loaded unit ID ${unit.id} has non-numeric health: ${unit.health}. Setting to max health.`);
                unit.health = UNIT_HEALTH[unit.type] !== undefined ? UNIT_HEALTH[unit.type] : 1; // Use max health from constants
            }
            // Ensure unit type is a number
            if (typeof unit.type !== 'number') {
                originalConsoleWarn(`Loaded unit ID ${unit.id} has non-numeric type: ${unit.type}. This may cause issues.`);
                // Attempt to parse or log error
            }
        });
    }


    gameTimeInMinutes = state.gameTimeInMinutes; // Game time
    // You might also want to load lastCombatGameTimeInMinutes if Blue sends it
    if (state.lastCombatGameTimeInMinutes !== undefined) {
        lastCombatGameTimeInMinutes = state.lastCombatGameTimeInMinutes;
    } else {
        lastCombatGameTimeInMinutes = gameTimeInMinutes; // Default if not sent
    }


    // Resize the canvas to match the loaded map size
    if (canvas && ctx && map) {
        const canvasWidth = (currentMapCols + 10) * HEX_SIZE * 1.5 + HEX_SIZE * 0.5;
        const canvasHeight = (currentMapRows + 3) * HEX_SIZE * Math.sqrt(3) * 0.75 + HEX_SIZE * Math.sqrt(3) * 0.25 + CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2 + 20;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Update console width
        if (consoleOutputDiv) {
            consoleOutputDiv.style.width = canvasWidth + 'px';
            consoleOutputDiv.style.margin = '10px auto';
            consoleOutputDiv.innerHTML = ''; // Clear the old console
            console.log("Game state loaded."); // Log success
        }
    } else {
        originalConsoleError("[loadGameStateFromJson] Canvas, context, or map not available during state load.");
    }

    // Recalculate local visibility after loading state
    updateVisibility();

    originalConsoleLog("[loadGameStateFromJson] Game state loaded successfully. Visibility updated.");

    // The gameLoop will be started right after this call in the ws.onmessage handler ('GAME_STATE').
}

// Assume selectedUnits is declared globally and initialized as an empty array:
// let selectedUnits = [];
// The global variable selectedUnit is no longer used for tracking selection state.

// ============================================================================
// Input Handling (Canvas Click)
// Depends on getHexFromCoordinates from utils.js
// Depends on HEX_SIZE, ARMY_COLOR_BLUE, ARMY_COLOR_RED from constants.js.
// Depends on getUnitAt, getUnitTypeName, getHexDistance, isValid, getMovementCost from utils.js.
// Depends on updateVisibility from this file.
// Accesses global canvas, map, currentUnits, selectedUnits, currentMapRows, currentMapCols, playerArmyColor, ws, visibleHexes.
// Uses originalConsoleLog, originalConsoleWarn.
// ============================================================================
/**
 * Handles clicks on the canvas for unit selection and movement orders, supporting multi-selection with Shift.
 * Sends move orders via WebSocket if in multiplayer.
 *
 * If no units are selected:
 * - Click (no Shift) on a friendly unit (on a visible hex in multiplayer): Selects the unit.
 * - Shift+Click on a friendly unit (on a visible hex in multiplayer): Selects the unit.
 * - Click/Shift+Click on empty hex, enemy unit, or invisible hex: Does nothing.
 *
 * If units are selected:
 * - Shift+Click on a friendly unit (on a visible hex in multiplayer): Toggles selection of that unit (adds if not selected, removes if selected).
 * - Shift+Click on empty hex, enemy unit, or invisible hex: Does nothing to the selection.
 * - Click (no Shift) on a selected unit (on a visible hex in multiplayer): Deselects that specific unit and stops its movement.
 * - Click (no Shift) on an unselected friendly unit (on a visible hex in multiplayer): Clears current selection and selects the clicked unit.
 * - Click (no Shift) on empty hex, enemy unit, or invisible hex (on a visible hex in multiplayer):
 * Attempts to issue a group move order to the clicked hex and adjacent columns for all selected units.
 * Units whose target hex is invalid (out of bounds, impassable, occupied) do not move.
 * Clears the selection after attempting the order.
 * - Click (no Shift) outside valid map bounds: Deselects all units and stops their movement.
 *
 * Depends on getHexFromCoordinates from utils.js
 * Depends on HEX_SIZE, ARMY_COLOR_BLUE, ARMY_COLOR_RED from constants.js.
 * Depends on getUnitAt, getUnitTypeName, getHexDistance, isValid, getMovementCost from utils.js.
 * Depends on updateVisibility from this file.
 * Accesses global canvas, map, currentUnits, selectedUnits, currentMapRows, currentMapCols, playerArmyColor, ws, visibleHexes.
 * Uses originalConsoleLog, originalConsoleWarn.
 */

// Add this function to handle keyboard input
function handleKeyDown(event) {
    if (event.key === "Escape") {
        if (selectedUnits.length > 0) {
            selectedUnits = []; // Clear the array of selected units
            selectedUnit = null;
            // You might want to redraw here to immediately show units as deselected
            drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors);
        }
    }
    // Add other key handling logic here if needed
}

// NOUVELLE FONCTION POUR SÉLECTIONNER DES UNITÉS DANS UNE ZONE
function selectUnitsInArea(rectX, rectY, rectEndX, rectEndY) {
    const selectedUnitsInArea = [];

    rectX = Math.max(0, rectX);
    rectY = Math.max(0, rectY);
    rectEndX = Math.max(0, rectEndX);
    rectEndY = Math.max(0, rectEndY);

    rectX = Math.min(rectX, currentMapRows - 1);
    rectY = Math.min(rectY, currentMapCols - 1);
    rectEndX = Math.min(rectEndX, currentMapRows - 1);
    rectEndY = Math.min(rectEndY, currentMapCols - 1);

    // Calculer les bords du rectangle de sélection
    const rectLeft = Math.min(rectX, rectEndX);
    const rectRight = Math.max(rectX, rectEndX);
    const rectTop = Math.min(rectY, rectEndY);
    const rectBottom = Math.max(rectY, rectEndY);

    currentUnits.forEach(unit => {
        // Calculer les bords de l'unité

        // Vérifier si l'unité chevauche le rectangle de sélection
        if (unit.row >= rectLeft &&
            unit.row <= rectRight &&
            unit.col >= rectTop &&
            unit.col <= rectBottom &&
            unit.armyColor === playerArmyColor) {
            selectedUnitsInArea.push(unit);
        }
    });

    return selectedUnitsInArea;
}


// MODIFICATION DE handleCanvasClick POUR GÉRER LE DÉBUT DU GLISSER-DÉPOSER
function handleCanvasMouseDown(event) {
    const mouseX = event.offsetX;
    const mouseY = event.offsetY;

    // Commencez la sélection de zone
    isDragging = true;
    dragStartX = mouseX;
    dragStartY = mouseY;
    dragCurrentX = mouseX;
    dragCurrentY = mouseY;
}

// NOUVEAU GESTIONNAIRE D'ÉVÉNEMENTS POUR LE DÉPLACEMENT DE LA SOURIS PENDANT LE GLISSER-DÉPOSER
function handleCanvasMouseMove(event) {
    if (isDragging) {
        dragCurrentX = event.offsetX;
        dragCurrentY = event.offsetY;
        // Redessine le jeu pour montrer le rectangle de sélection en temps réel
        drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors);
    }
}

// MODIFICATION DE handleCanvasClick POUR GÉRER LA FIN DU GLISSER-DÉPOSER ET LA SÉLECTION D'UNITÉS
function handleCanvasMouseUp(event) {
    if (isDragging) {
        isDragging = false;

        const mouseX = event.offsetX;
        const mouseY = event.offsetY;

        // Déterminez les coordonnées finales du rectangle de sélection
        const rectX = Math.min(dragStartX, mouseX);
        const rectY = Math.min(dragStartY, mouseY);
        const rectWidth = Math.abs(dragStartX - mouseX);
        const rectHeight = Math.abs(dragStartY - mouseY);


        // Si le rectangle est trop petit (juste un clic), traitez-le comme un clic unique
        if (rectWidth < 5 && rectHeight < 5) { // Un seuil pour distinguer un clic d'un drag
            handleCanvasClick(event); // Appeler l'ancienne fonction de clic unique
        } else {
            // Sélectionner les unités dans la zone
            const clickedHex = getHexFromCoordinates(rectX, rectY, HEX_SIZE); // Uses utils function, global HEX_SIZE
            const clickedEnd = getHexFromCoordinates(rectX + rectWidth, rectY + rectHeight, HEX_SIZE); // Uses utils function, global HEX_SIZE
            selectedUnits = selectUnitsInArea(clickedHex.r, clickedHex.c, clickedEnd.r, clickedEnd.c);
            if (selectedUnits.length > 0) {
                // Pour l'instant, sélectionnez la première unité trouvée pour simplifier.
                // Vous pouvez adapter cela pour sélectionner plusieurs unités ou des groupes.
                // Par exemple, vous pouvez vouloir stocker toutes les unités sélectionnées
                // dans un tableau 'selectedUnits' au lieu de 'selectedUnit'.
                selectedUnit = selectedUnits[0]; // Sélectionnez la première unité du groupe
                console.log(`Selected ${selectedUnits.length} units.`);
            } else {
                selectedUnit = null; // Désélectionner si aucune unité n'est trouvée
                selectedUnits = [];
            }
            // Mettre à jour l'affichage après la sélection
            drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors);
        }
    }
}

// NOUVELLE FONCTION D'INITIALISATION DES ÉVÉNEMENTS (ou modification de votre initGame s'il existe)
// Assurez-vous que ces écouteurs d'événements sont ajoutés au bon moment (probablement dans initGame)
function setupCanvasEventListeners() {
    //canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);    
}

function handleCanvasClick(event) {
    // Ensure game state is ready for interaction (multiplayer check is now inside for placing orders)
    if (!canvas || !map || !currentUnits || currentMapRows === 0 || currentMapCols === 0 || !visibleHexes) { // Added map and visibleHexes check
        originalConsoleLog("[handleCanvasClick] Ignoring click: Game state not fully ready (missing map/units/dimensions/visibility data).");
        return; // Ignore clicks if game state isn't ready
    }

    // Get the click coordinates relative to the canvas
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Convert pixel coordinates to hex coordinates
    const clickedHex = getHexFromCoordinates(clickX, clickY, HEX_SIZE); // Uses utils function, global HEX_SIZE
    const clickedR = clickedHex.r;
    const clickedC = clickedHex.c;

    // Check if the clicked hex is within valid map bounds
    const isValidClickLocation = isValid(clickedR, clickedC, currentMapRows, currentMapCols); // Uses utils function, global dims

    // Filter units to only include living ones
    const livingUnits = currentUnits.filter(unit => unit && unit.health > 0);

    // Get the unit at the clicked location, if any (check against living units)
    const unitAtClickedHex = isValidClickLocation ? getUnitAt(clickedR, clickedC, livingUnits, "handleCanvasClick - unit check") : null; // Use filtered list, check isValid first

    // Check if the clicked hex is visible to the local player (only relevant in multiplayer with fog)
    // If playerArmyColor is null (single player), isVisible will be true for all valid hexes due to updateVisibility logic.
    const isVisible = isValidClickLocation && visibleHexes[clickedR] && visibleHexes[clickedR][clickedC]; // Uses global visibleHexes[row][col]

    // Check if Shift key was pressed
    const shiftKey = event.shiftKey;

    // --- Handle Unit Selection / Interaction ---

    if (selectedUnits.length === 0) {
        // No units are currently selected.
        // Simple Click or Shift+Click on a friendly unit selects it.
        // Clicking elsewhere does nothing.
        const canSelect = isValidClickLocation && unitAtClickedHex && unitAtClickedHex.armyColor === playerArmyColor && isVisible;

        if (canSelect) {
            selectedUnit = unitAtClickedHex;
            selectedUnits.push(unitAtClickedHex); // Select the clicked unit
            console.log(`${getUnitTypeName(unitAtClickedHex.type)} of the ${unitAtClickedHex.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army at (${unitAtClickedHex.row}, ${unitAtClickedHex.col}) selected (health:${unitAtClickedHex.health}).`);
            originalConsoleLog(`[handleCanvasClick] ${shiftKey ? 'Shift+Click' : 'Click'}: Selected unit ID ${unitAtClickedHex.id} at (${clickedR}, ${clickedC}).`);
        } else if (isValidClickLocation && unitAtClickedHex && !isVisible) {
            originalConsoleLog(`[handleCanvasClick] ${shiftKey ? 'Shift+Click' : 'Click'}: Clicked on unit ID ${unitAtClickedHex.id} at (${clickedR}, ${clickedC}), but hex is not visible. Cannot select/interact.`);
        } else if (isValidClickLocation && unitAtClickedHex && unitAtClickedHex.armyColor !== playerArmyColor) {
            originalConsoleLog(`[handleCanvasClick] ${shiftKey ? 'Shift+Click' : 'Click'}: Clicked on enemy unit ID ${unitAtClickedHex.id} at (${clickedR}, ${clickedC}). Cannot select.`);
        } else if (isValidClickLocation) {
            originalConsoleLog(`[handleCanvasClick] ${shiftKey ? 'Shift+Click' : 'Click'}: Clicked on empty hex (${clickedR}, ${clickedC}). No unit selected.`);
        } else {
            originalConsoleLog(`[handleCanvasClick] ${shiftKey ? 'Shift+Click' : 'Click'}: Clicked outside valid map bounds. No unit selected.`);
        }

    } else {
        // One or more units are currently selected.
        if (shiftKey) {
            // Shift + Click when units are selected.
            // Toggle selection of a friendly unit. Ignore clicks elsewhere.
            const canToggleSelect = isValidClickLocation && unitAtClickedHex && unitAtClickedHex.armyColor === playerArmyColor && isVisible;

            if (canToggleSelect) {
                const index = selectedUnits.findIndex(unit => unit.id === unitAtClickedHex.id);
                if (index > -1) {
                    // Unit is already selected, remove it
                    selectedUnits.splice(index, 1);
                    if (selectedUnits.length == 0)
                        selectedUnit = null;
                    console.log(`${getUnitTypeName(unitAtClickedHex.type)} of the ${unitAtClickedHex.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army at (${unitAtClickedHex.row}, ${unitAtClickedHex.col}) deselected.`);
                    originalConsoleLog(`[handleCanvasClick] Shift+Click: Removed unit ID ${unitAtClickedHex.id} from selection.`);
                } else {
                    // Unit is not selected, add it
                    selectedUnits.push(unitAtClickedHex);
                    console.log(`${getUnitTypeName(unitAtClickedHex.type)} of the ${unitAtClickedHex.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army at (${unitAtClickedHex.row}, ${unitAtClickedHex.col}) added to selection.`);
                    originalConsoleLog(`[handleCanvasClick] Shift+Click: Added unit ID ${unitAtClickedHex.id} to selection.`);
                }
            } else if (isValidClickLocation && unitAtClickedHex && !isVisible) {
                originalConsoleLog(`[handleCanvasClick] Shift+Click: Clicked on unit ID ${unitAtClickedHex.id} at (${clickedR}, ${clickedC}), but hex is not visible. Cannot toggle selection.`);
            } else if (isValidClickLocation && unitAtClickedHex && unitAtClickedHex.armyColor !== playerArmyColor) {
                originalConsoleLog(`[handleCanvasClick] Shift+Click: Clicked on enemy unit ID ${unitAtClickedHex.id} at (${clickedR}, ${clickedC}). Cannot toggle selection.`);
            } else if (isValidClickLocation) {
                originalConsoleLog(`[handleCanvasClick] Shift+Click: Clicked on empty hex (${clickedR}, ${clickedC}). Selection unchanged.`);
            } else {
                originalConsoleLog("[handleCanvasClick] Shift+Click: Clicked outside valid map bounds. Selection unchanged.");
            }


        } else {
            // Simple Click when units are selected.
            // This is either a deselect action or a move order for the selected group.

            if (isValidClickLocation) {
                // Find if the clicked unit is one of the currently selected units.
                const clickedSelectedUnit = selectedUnits.find(unit => unit.id === (unitAtClickedHex ? unitAtClickedHex.id : null));

                if (clickedSelectedUnit) {
                    // Clicked on a unit that is currently selected.
                    // Deselect only this unit and stop its movement.
                    const index = selectedUnits.findIndex(unit => unit.id === clickedSelectedUnit.id);
                    if (index > -1) {
                        selectedUnits.splice(index, 1); // Remove from selection array

                        // *** Apply the target update locally to stop movement ***
                        clickedSelectedUnit.targetRow = clickedSelectedUnit.row;
                        clickedSelectedUnit.targetCol = clickedSelectedUnit.col;
                        clickedSelectedUnit.movementProgress = 0; // Also reset movement progress when stopping

                        // *** Send a move order to the current location to stop movement (only in multiplayer) ***
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            const moveOrder = {
                                type: 'MOVE_ORDER',
                                unitId: clickedSelectedUnit.id,
                                targetR: clickedSelectedUnit.row, // Target is current location to stop
                                targetC: clickedSelectedUnit.col
                            };
                            ws.send(JSON.stringify(moveOrder));
                            originalConsoleLog(`[handleCanvasClick] Click: Sent MOVE_ORDER to stop unit ID ${clickedSelectedUnit.id} at (${clickedSelectedUnit.row}, ${clickedSelectedUnit.col}).`);
                        }
                        console.log(`${getUnitTypeName(clickedSelectedUnit.type)} of the ${clickedSelectedUnit.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army deselected.`);
                        originalConsoleLog(`[handleCanvasClick] Click: Deselected unit ID ${clickedSelectedUnit.id} by clicking on it.`);
                    }

                } else if (unitAtClickedHex && unitAtClickedHex.armyColor === playerArmyColor && isVisible) {
                    // Clicked on an unselected friendly unit (on a visible hex).
                    // Clear current selection and select this new unit.
                    originalConsoleLog(`[handleCanvasClick] Click: Clicked on new friendly unit ID ${unitAtClickedHex.id}. Clearing selection and selecting new unit.`);
                    // Stop movement for all previously selected units before clearing?
                    // For simplicity, let's assume clicking a new unit just changes selection,
                    // previous units continue their last order (if any).
                    selectedUnits = [unitAtClickedHex]; // Select the new unit
                    console.log(`${getUnitTypeName(unitAtClickedHex.type)} of the ${unitAtClickedHex.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army at (${unitAtClickedHex.row}, ${unitAtClickedHex.col}) selected (health:${unitAtClickedHex.health}).`);

                } else {
                    // Clicked on an empty hex, an enemy unit's hex, or an invisible hex with a unit.
                    // This is a move order for the selected group (if friendly units are selected).
                    // This action is only valid if the selected units belong to the local player's army (in multiplayer).
                    const areSelectedUnitsFriendly = selectedUnits.every(unit => unit.armyColor === playerArmyColor);

                    if (areSelectedUnitsFriendly) { // Check if it's the local player's units or single player

                        const baseTargetR = clickedR;
                        const baseTargetC = clickedC;
                        originalConsoleLog(`[handleCanvasClick] Click: Processing group move order to (${baseTargetR}, ${baseTargetC}) for ${selectedUnits.length} units.`);

                        // Create a copy of the selectedUnits array to iterate, as we might modify the original
                        const unitsToOrder = [...selectedUnits];
                        const unitsSuccessfullyOrdered = [];
                        let indexRow = 0;
                        let indexCol = 0; 
                        unitsToOrder.forEach((unit) => {
                            // Calculate the individual target hex with simple column displacement
                            const targetR = baseTargetR + indexRow;
                            const targetC = baseTargetC + indexCol;
                            if (indexCol == 3) {
                                indexCol = 0;
                                indexRow++;
                            }
                            else
                                indexCol++;

                            // Check validity of the individual target hex
                            const isTargetValidLocation = isValid(targetR, targetC, currentMapRows, currentMapCols);
                            const targetTerrain = isTargetValidLocation ? map[targetR][targetC] : null;
                            const movementCost = isTargetValidLocation ? getMovementCost(targetTerrain, unit.type) : Infinity;
                            // Check if the target hex is occupied by *any* unit (excluding the current unit itself)
                            const isOccupiedByAnyUnit = isTargetValidLocation ? getUnitAt(targetR, targetC, livingUnits.filter(u => u.id !== unit.id), `handleCanvasClick - target occupied check for unit ${unit.id}`) !== null : true; // Exclude the unit itself from the check

                            if (!isTargetValidLocation || movementCost === Infinity || isOccupiedByAnyUnit) {
                                // Target hex is invalid for this unit
                                console.warn(`Destination hex (${targetR}, ${targetC}) is invalid for unit ${getUnitTypeName(unit.type)} ID ${unit.id}. Movement cancelled.`);
                                originalConsoleWarn(`[handleCanvasClick] Target hex (${targetR}, ${targetC}) is invalid (out of bounds, impassable, or occupied) for unit ID ${unit.id}. Movement cancelled.`);

                                // Stop the unit locally (it won't get a new target)
                                unit.targetRow = null;
                                unit.targetCol = null;
                                unit.movementProgress = 0;

                            } else {
                                // Valid target hex - Set the target for this unit (locally)
                                originalConsoleLog(`[handleCanvasClick] Setting target for unit ID ${unit.id} to (${targetR}, ${targetC}).`);
                                unit.targetRow = targetR;
                                unit.targetCol = targetC;
                                unitsSuccessfullyOrdered.push(unit); // Add to list of units that got an order

                                // *** Send a MOVE_ORDER message to the server (only in multiplayer) ***
                                if (ws && ws.readyState === WebSocket.OPEN) {
                                    const moveOrder = {
                                        type: 'MOVE_ORDER',
                                        unitId: unit.id,
                                        targetR: targetR,
                                        targetC: targetC
                                    };
                                    ws.send(JSON.stringify(moveOrder));
                                    originalConsoleLog(`[handleCanvasClick] Sent MOVE_ORDER for unit ID ${unit.id} to (${targetR}, ${targetC}).`);
                                }
                            }
                        });

                        if (unitsSuccessfullyOrdered.length > 0) {
                            console.log(`${unitsSuccessfullyOrdered.length} unit(s) of the ${playerArmyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army is/are moving towards the area (${baseTargetR}, ${baseTargetC}).`);
                        } else {
                            console.warn("No selected units could receive a valid move order.");
                        }

                        // *** IMPORTANT: Deselect all units after processing the group order ***
                        selectedUnits = []; // Clear the selection
                        selectedUnit = null;


                    } else {
                        // Clicked on empty/enemy hex while enemy units were selected (shouldn't happen with current selection logic)
                        originalConsoleWarn(`[handleCanvasClick] Clicked on hex (${clickedR}, ${clickedC}) while enemy units were selected. This scenario should not occur.`);
                        // Deselect the units as a fallback
                        selectedUnits = [];
                        selectedUnit = null;
                    }
                }

            } else {
                // Clicked outside the valid map area while units are selected -> Deselect all and stop movement
                console.log(`${selectedUnits.length} unit(s) deselected (click outside map).`);
                originalConsoleLog("[handleCanvasClick] Clicked outside valid map bounds while units selected. Deselecting all and stopping movement.");

                // *** Apply the target update locally to stop movement for all selected units ***
                selectedUnits.forEach(unit => {
                    if (unit) { // Ensure unit exists
                        unit.targetRow = unit.row;
                        unit.targetCol = unit.col;
                        unit.movementProgress = 0; // Also reset movement progress
                    }
                });


                // *** Send move orders to the current location to stop movement for all selected units (only in multiplayer) ***
                if (ws && ws.readyState === WebSocket.OPEN) {
                    selectedUnits.forEach(unit => {
                        if (unit) { // Ensure unit exists
                            const moveOrder = {
                                type: 'MOVE_ORDER',
                                unitId: unit.id,
                                targetR: unit.row, // Target is current location to stop
                                targetC: unit.col
                            };
                            ws.send(JSON.stringify(moveOrder));
                            originalConsoleLog(`[handleCanvasClick] Sent MOVE_ORDER to stop unit ID ${unit.id} at (${unit.row}, ${unit.col}) (click outside map).`);
                        }
                    });
                }

                // *** IMPORTANT: Deselect after processing the stop order ***
                selectedUnits = []; // Clear the selection
                selectedUnit = null;
            }
        }
    }

    // Update visibility after selection/movement changes (if multiplayer)
    // This is typically handled by the main game loop after processing all updates,
    // but calling it here provides more immediate feedback on selection changes.
    // If updateVisibility is expensive, it might be better to rely on the game loop.
    updateVisibility(); // Needs access to currentUnits and playerArmyColor

    // Note: The gameLoop should be responsible for drawing the highlight for all units in the selectedUnits array.
}

// Assume you have a global variable playerArmyColor ('blue' or 'red')
// and that the constants ARMY_COLOR_BLUE and ARMY_COLOR_RED are defined.
// Example: const playerArmyColor = ARMY_COLOR_RED; // or ARMY_COLOR_BLUE
// Example: const ARMY_COLOR_BLUE = 'blue';
// Example: const ARMY_COLOR_RED = 'red';


// ============================================================================
// Game End Logic
// ============================================================================
/**
 * Triggers the end of the game and displays the outcome based on whose general died.
 * Stops the game loop and disables controls.
 * Called by the Blue client when it detects a win/loss condition.
 * @param {string} winningArmyColor - The color of the army whose general was killed ('blue' or 'red').
 */
function endGame(winningArmyColor) {
    if (gameOver) return; // Prevent triggering multiple times
    gameOver = true; // Set game over flag

    // Determine local outcome based on the winning army color and this client's army color
    // If the winningArmyColor is the same as playerArmyColor, the local outcome is win. Otherwise, it's lose.
    const localOutcome = (winningArmyColor === playerArmyColor) ? 'win' : 'lose';

    originalConsoleLog(`[endGame] Game over! Winning army: ${winningArmyColor}. Local Outcome: ${localOutcome}`);

    if (ctx && canvas) {
         // Clear previous combat highlights before drawing game over message
         // Redraw once to show final state and clear highlights
         if (winningArmyColor === playerArmyColor)
            messageEndGame = 'VICTORY FOR THE BLUE ARMY !';
        else
            messageEndGame = 'DEFEAT FOR THE BLUE ARMY !';
         drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Uses global variables
    }

    // Stop the game loop
    if (gameLoopInterval !== null) {
        cancelAnimationFrame(gameLoopInterval);
        gameLoopInterval = null;
        originalConsoleLog("[endGame] Game loop cancelled.");
    }

    // Stop multiplayer sync if running (only relevant for Blue)
    if (playerArmyColor === ARMY_COLOR_BLUE) {
        stopSyncInterval(); // Uses global stopSyncInterval
    }
  }

/**
 * Handles the game over state received by the Red client from the Blue client.
 * Displays the outcome based on whose general died and stops the game.
 * @param {string} winningArmyColor - The color of the army whose general was killed ('blue' or 'red').
 */
function handleGameOver(winningArmyColor) {
    if (gameOver) return; // Prevent triggering multiple times if somehow received twice
    gameOver = true; // Set game over flag

    // Determine local outcome based on the winning army color and this client's army color
    // If the winningArmyColor is the same as playerArmyColor, the local outcome is win. Otherwise, it's lose.
    const localOutcome = (winningArmyColor === "red") ? 'win' : 'lose';

    // Display message in console for Red client based on local outcome
    if (localOutcome === 'win') {
        console.log("The enemy General has been eliminated! You won the game.");
    } else if (localOutcome === 'lose') {
        console.log("Your General has been eliminated! You lost the game.");
    } else {
        console.log("The game is over."); // Should not happen with 'blue'/'red' input
    }

    originalConsoleLog(`[handleGameOver] Game over received from Blue. Winning army: ${winningArmyColor}. Local Outcome: ${localOutcome}. Ending game locally.`);


    // Stop the game loop for Red client
    if (gameLoopInterval !== null) {
        cancelAnimationFrame(gameLoopInterval);
        gameLoopInterval = null;
        originalConsoleLog("[handleGameOver] Game loop cancelled.");
    }

     //Display game over message on canvas (same as endGame function's display part)
     if (ctx && canvas) {
         // Clear previous combat highlights before drawing game over message
         // Redraw once to show final state and clear highlights
        if (winningArmyColor === "red")
            messageEndGame = 'VICTORY FOR THE RED ARMY !';
        else
            messageEndGame = 'DEFEAT FOR THE RED ARMY !';

         drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Uses global variables
     }
}

// ============================================================================
// Save and Load Game Logic (Local Save/Load - less priority in MP)
// Depends on global map, currentUnits, currentMapRows, currentMapCols, gameTimeInMinutes, visibleHexes, combatHexes.
// Depends on updateVisibility, drawMap, drawMapAndUnits.
// Uses JSON.stringify, JSON.parse, Blob, URL.createObjectURL, URL.revokeObjectURL, FileReader.
// Uses originalConsoleLog, originalConsoleError.
// Accesses filenameInput, loadFileInput.
// ============================================================================

/**
 * Saves the current game state to a JSON file downloaded by the browser.
 * Gathers all relevant global variables needed to restore the game *locally*.
 * Generates a default filename if none is provided.
 * Uses originalConsoleLog, originalConsoleError.
 * Accesses filenameInput.
 */
function saveGame() {

    if (gameOver) {
        originalConsoleWarn("[saveGame] Cannot save game: Game is over.");
        console.warn("Cannot save: game is over.");
        if (settingsModal) {
            settingsModal.style.display = "none";
        }
        return;
    }

    originalConsoleLog("[saveGame] Preparing to save local game state.");

    // In multiplayer, saving locally might only save your client's current view/state,
    // which might not be the true game state if sync messages haven't all been processed.
    // Saving the 'official' state would require getting it from the Blue player.
    // For now, save the state as it exists on the client.
    // Check if map and units exist before trying to save
    if (!map || !currentUnits || currentMapRows === 0 || currentMapCols === 0) {
        originalConsoleWarn("[saveGame] No game state to save (map or units missing).");
        console.warn("Cannot save: no game in progress.");
        // Close the settings modal
        if (settingsModal) {
            settingsModal.style.display = "none";
        }
        return;
    }


    const gameState = {
        map: map,
        currentMapRows: currentMapRows,
        currentMapCols: currentMapCols,
        // Save dynamic and static unit properties, including the ID
        currentUnits: currentUnits.map(unit => ({ ...unit })), // Save a copy
        gameTimeInMinutes: gameTimeInMinutes,
        lastCombatGameTimeInMinutes: lastCombatGameTimeInMinutes, // Save combat time
        combatHexes: Array.from(combatHexes), // Save combat hexes for local reload display
        // Do NOT save playerArmyColor, ws connection, sync/game loop IDs etc.
        // visibility is derived.
    };
    originalConsoleLog("[saveGame] Local game state object created.");


    // Convert the game state object to a JSON string
    let gameStateJson;
    try {
        gameStateJson = JSON.stringify(gameState, null, 2); // Use 2 spaces for indentation
        originalConsoleLog("[saveGame] Local game state serialized to JSON.");
    } catch (error) {
        originalConsoleError("[saveGame] Failed to serialize local game state to JSON:", error);
        console.error("Error while saving: failed to serialize game state.");
        return;
    }

    // Determine the filename
    let filename = filenameInput.value.trim(); // Uses global filenameInput
    if (filename === "" || filename === filenameInput.placeholder) { // Check against placeholder text too
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        filename = `krieg-local-${year}-${month}-${day}-${hours}-${minutes}.json`; // Add '-local'
        originalConsoleLog(`[saveGame] No filename provided, using default local: ${filename}`);
    } else {
        if (!filename.toLowerCase().endsWith('.json')) {
            filename += '.json';
        }
        originalConsoleLog(`[saveGame] Using provided filename for local save: ${filename}`);
    }


    // Create a Blob from the JSON string
    const blob = new Blob([gameStateJson], { type: 'application/json' });

    // Create a link element to trigger the download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    originalConsoleLog(`[saveGame] Local game state saved as "${filename}".`);
    console.log(`Game saved LOCALLY as: ${filename}`);

    if (settingsModal) {
        settingsModal.style.display = "none";
    }
}

/**
 * Loads game state from a selected JSON file (local load).
 * Reads the file, parses the JSON, and restores global game variables.
 * Restarts the game loop and redraws the scene.
 * WARNING: Loading a local save will put the client into a single-player like state,
 * potentially disconnecting from multiplayer or causing sync issues.
 * Uses originalConsoleLog, originalConsoleError.
 * Accesses loadFileInput.
 */
function loadGame() {
    originalConsoleLog("[loadGame] Triggering file input for LOCAL loading game state.");
    // Simulate a click on the hidden file input
    loadFileInput.click();

    // Optional: Close modal immediately if you prefer
    // if (settingsModal) { settingsModal.style.display = "none"; }
}

/**
 * Handles the change event on the hidden file input, triggered after a file is selected.
 * Reads the selected file and attempts to load the game state LOCALLY.
 * Depends on updateVisibility, drawMap, drawMapAndUnits.
 * Uses FileReader, JSON.parse, originalConsoleLog, originalConsoleError.
 * Accesses global gameLoopInterval, selectedUnit, combatHexes, ws, playerArmyColor, syncIntervalId.
 */
function handleFileSelect(event) {
    originalConsoleLog("[handleFileSelect] File(s) selected for LOCAL loading.");
    const files = event.target.files;

    if (files.length === 0) {
        originalConsoleLog("[handleFileSelect] No file selected.");
        console.log("No file selected for loading.");
        // Close the settings modal
        if (settingsModal) {
            settingsModal.style.display = "none";
        }
        return;
    }

    const file = files[0];
    originalConsoleLog(`[handleFileSelect] Selected file: ${file.name}`);

    if (file.type !== 'application/json') {
        originalConsoleError(`[handleFileSelect] Selected file "${file.name}" is not a JSON file. Type: ${file.type}`);
        console.error(`Loading error: Selected file "${file.name}" is not a JSON file.`);
        // Close the settings modal
        if (settingsModal) {
            settingsModal.style.display = "none";
        }
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        originalConsoleLog("[handleFileSelect] File read successfully. Attempting to parse JSON.");
        const fileContent = e.target.result;
        let gameState;

        try {
            gameState = JSON.parse(fileContent);
            originalConsoleLog("[handleFileSelect] JSON parsed successfully for local load.");
        } catch (error) {
            originalConsoleError("[handleFileSelect] Failed to parse JSON from file:", error);
            console.error(`Loading error: Failed to read file content "${file.name}".`);
            // Close the settings modal
            if (settingsModal) {
                settingsModal.style.display = "none";
            }
            return;
        }

        // --- Restore Game State LOCALLY ---
        originalConsoleLog("[handleFileSelect] Restoring local game state from parsed data.");

        // Stop any existing multiplayer connection and timers
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, "Loading local game"); // Close connection cleanly
        }
        ws = null; // Clear WebSocket variable
        playerArmyColor = null; // Reset player color (back to single player logic)
        stopSyncInterval(); // Stop sync interval if it was running

        // Stop the current game loop
        if (gameLoopInterval !== null) {
            cancelAnimationFrame(gameLoopInterval);
            gameLoopInterval = null;
            originalConsoleLog("[handleFileSelect] Existing game loop cancelled.");
        }

        // Restore global variables from the loaded state
        map = gameState.map;
        currentMapRows = gameState.currentMapRows;
        currentMapCols = gameState.currentMapCols; // Assuming this matches the save structure
        currentUnits = gameState.currentUnits; // Units should have IDs from save

        // Ensure units loaded from save have necessary properties for movement/sync
        if (currentUnits) {
            currentUnits.forEach(unit => {
                if (unit.previousRow === undefined || unit.previousRow === null) unit.previousRow = unit.row;
                if (unit.previousCol === undefined || unit.previousCol === null) unit.previousCol = unit.col;
                if (unit.movementProgress === undefined || unit.movementProgress === null) unit.movementProgress = 0;
                if (unit.targetRow === undefined) unit.targetRow = null;
                if (unit.targetCol === undefined) unit.targetCol = null;
                // Ensure ID exists if loading an older save format without IDs? Or require IDs.
                if (unit.id === undefined || unit.id === null) {
                    originalConsoleWarn(`Unit loaded from save file is missing ID! Assigning temporary ID. Save format might be old.`);
                    unit.id = unitIdCounter++; // Assign a new unique ID (might conflict if not careful)
                }
                // Ensure unit health is a number
                if (typeof unit.health !== 'number') {
                    originalConsoleWarn(`Loaded unit ID ${unit.id} has non-numeric health: ${unit.health}. Setting to max health.`);
                    unit.health = UNIT_HEALTH[unit.type] !== undefined ? UNIT_HEALTH[unit.type] : 1; // Use max health from constants
                }
                // Ensure unit type is a number
                if (typeof unit.type !== 'number') {
                    originalConsoleWarn(`Loaded unit ID ${unit.id} has non-numeric type: ${unit.type}. This may cause issues.`);
                    // Attempt to parse or log error
                }
            });
        }


        gameTimeInMinutes = gameState.gameTimeInMinutes;
        lastRealTime = performance.now(); // Reset lastRealTime
        lastCombatGameTimeInMinutes = gameState.lastCombatGameTimeInMinutes !== undefined ? gameState.lastCombatGameTimeInMinutes : gameTimeInMinutes; // Restore or initialize

        /*
        // Combat hexes are not part of the local save state sync logic, clear on load.
        combatHexes.clear(); // Clear any existing combat highlights
        // Load combat hexes if saved locally (for display on the loaded state)
        if (gameState.combatHexes && Array.isArray(gameState.combatHexes)) {
            gameState.combatHexes.forEach(hexKey => combatHexes.add(hexKey));
            originalConsoleLog(`[handleFileSelect] Loaded ${combatHexes.size} combat hexes from save.`);
        } else {
            originalConsoleLog("[handleFileSelect] No combat hexes in save data. Cleared local combat highlights.");
        }
        */

        // Derived state that needs recalculation
        // In local mode, updateVisibility will now assume full visibility (playerArmyColor is null)
        updateVisibility();
        selectedUnit = null; // Clear selected unit

        // Ensure canvas dimensions are correct for the loaded map size
        const canvasWidth = (currentMapCols + 10) * HEX_SIZE * 1.5 + HEX_SIZE * 0.5; // Hex grid width calculation
        const canvasHeight = (currentMapRows + 3) * HEX_SIZE * Math.sqrt(3) * 0.75 + HEX_SIZE * Math.sqrt(3) * 0.25 + CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2 + 20; // Height including clock and padding

        if (canvas) { // Check if canvas element exists
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;

            // Ensure console width is updated
            if (consoleOutputDiv) {
                consoleOutputDiv.style.width = canvasWidth + 'px';
                consoleOutputDiv.style.margin = '10px auto';
                consoleOutputDiv.innerHTML = ''; // Clear the old console messages
                console.log(`Game loaded LOCALLY from: ${file.name}`); // Log success to new console
            }
        } else {
            originalConsoleError("[handleFileSelect] Canvas element not found during load!");
            // Cannot draw without canvas, but state is loaded.
            // Need to ensure the state is still valid for drawing placeholder.
            drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Attempt redraw with loaded state
            return;
        }


        // Draw the initial state of the loaded map and units
        drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Redraw units


        gameOver = false;
        // Re-enable UI controls relevant to local game
        document.getElementById('connectButton').disabled = false;
        document.getElementById('serverAddressInput').disabled = false;
        document.getElementById('regenerateButton').disabled = false;
        document.getElementById('mapHeightSelect').disabled = false;

        // Hide the Start button when loading a local save
        if (startButton) startButton.style.display = 'none';


        // Restart the game loop
        gameLoopInterval = requestAnimationFrame(gameLoop);
        originalConsoleLog("[handleFileSelect] Local game state loaded successfully. New game loop started.");


        if (settingsModal) {
            settingsModal.style.display = "none";
        }

    };

    reader.onerror = () => {
        originalConsoleError(`[handleFileSelect] Error reading file: "${file.name}"`, reader.error);
        console.error(`Error reading file: "${file.name}".`);
        // Close the settings modal
        if (settingsModal) {
            settingsModal.style.display = "none";
        }
    };

    reader.readAsText(file);
}


// ============================================================================
// Helper function to append messages to the console output div
// Accesses global consoleOutputDiv
// Uses Date
// ============================================================================
/**
 * Appends a message to the console output div.
 */
function appendMessageToConsoleDiv(messageArgs, type) {
    if (consoleOutputDiv) {
        const messageString = messageArgs.join(' ');
        const messageElement = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString(); // Get current time

        // Basic styling based on message type
        let color = '#333'; // Default color
        if (type === 'warn') {
            color = '#FFA500'; // Orange for warnings
        } else if (type === 'error') {
            color = '#FF0000'; // Red for errors
        }

        messageElement.style.color = color;
        messageElement.textContent = `[${timestamp}] ${messageString}`; // Add timestamp
        consoleOutputDiv.appendChild(messageElement);

        // Auto-scroll to the bottom
        consoleOutputDiv.scrollTop = consoleOutputDiv.scrollHeight;
    }
}


// ============================================================================
// Help Function (NEW)
// Uses console.log (wrapped).
// ============================================================================

/**
 * Displays help information in the console output div.
 */
function displayHelp() {
    console.log("--- GAME HELP ---");
    console.log("Objective: Move your units to explore the map and engage the enemy.");
    console.log("");
    console.log("Commands:");
    console.log("- Left click on a visible unit (of your color): Select the unit.");
    console.log("- A unit is selected: Left click on a visible or fogged hex: The unit will move to that hex.");
    console.log("- Left click on the selected unit or outside the map/hexes: Deselects the unit and stops its movement.");
    console.log("- Game time advances automatically.");
    console.log("");
    console.log("Units and Terrain:");
    console.log("- Each unit has different movement costs depending on the terrain (Plains, Hill, Forest, Swamp). Mountains and Lakes are impassable.");
    console.log("- Units have HP, a vision range, and a combat range/strength.");
    console.log("- Supply units heal friendly units in friendly adjacent hexes.");
    console.log("- Spy units have a large vision range and ignore terrain costs.");
    console.log("");
    console.log("Combat:");
    console.log("- Combat is resolved automatically when enemy units are within mutual range.");
    console.log("- The outcome depends on the aggregated strength of the units involved in the engagement.");
    console.log("- Units with 0 HP are eliminated.");
    console.log("");
    console.log("Multiplayer:");
    console.log("- Connect to a server to play against another player (Blue vs Red).");
    console.log("- Each player sees their own fog of war.");
    console.log("- Movements and combat results are synchronized via the server.");
    console.log("--- END HELP ---");
}


// ============================================================================
// Helper Function to Generate Default Filename
// Uses originalConsoleLog.
// Accesses filenameInput.
// ============================================================================
/**
 * Generates the default filename (krieg-local-yy-mm-dd-hh-mm) and sets it as the placeholder
 * or value in the filename input.
 * Uses originalConsoleLog.
 * Accesses filenameInput.
 */
function generateDefaultFilename() {
    if (filenameInput) { // Ensure the input element exists
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        // Add '-local' to distinguish from potential network save formats later
        const defaultName = `krieg-local-${year}-${month}-${day}-${hours}-${minutes}`;
        filenameInput.placeholder = defaultName; // Set as placeholder initially
        // Optional: Set value if you want it to be the default on load
        // filenameInput.value = defaultName;
        originalConsoleLog(`[generateDefaultFilename] Generated default filename: ${defaultName}`);
    } else {
        originalConsoleWarn("[generateDefaultFilename] filenameInput element not found.");
    }
}


// ============================================================================
// Initialization
// ============================================================================

// Wait for the DOM to be fully loaded before setting up
// Wait for the DOM to be fully loaded before setting up
window.addEventListener('DOMContentLoaded', () => {
    originalConsoleLog("[DOMContentLoaded] DOM fully loaded. Initializing game.");
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    const regenerateButton = document.getElementById('regenerateButton');
    const mapHeightSelect = document.getElementById('mapHeightSelect');
    consoleOutputDiv = document.getElementById('consoleOutput'); // Get reference to the console output div

    // *** Get modal elements ***
    settingsModal = document.getElementById('settingsModal');
    hamburgerButton = document.getElementById('hamburgerButton');
    closeModalButton = document.getElementById('closeModalButton');
    // *** END NEW ***

    // *** Get save/load elements ***
    filenameInput = document.getElementById('filenameInput');
    saveGameButton = document.getElementById('saveGameButton');
    loadGameButton = document.getElementById('loadGameButton');
    loadFileInput = document.getElementById('loadFileInput');
    // *** END NEW ***

    // *** NEW : Get help button element ***
    helpButton = document.getElementById('helpButton');
    // *** END NEW ***

    // *** NEW : Get network connection elements ***
    const connectButton = document.getElementById('connectButton');
    const serverAddressInput = document.getElementById('serverAddressInput');
    startButton = document.getElementById('startButton'); // *** NEW : Get Start button ***

    // *** NEW: Get chat input and send button elements ***
    const chatInput = document.getElementById('chatInput'); // Assuming your input has ID 'chatInput'
    const sendButton = document.getElementById('sendButton'); // Assuming your button has ID 'sendButton')
    // *** END NEW ***


    // Initially hide the Start button
    if (startButton) {
        startButton.style.display = 'none';
        originalConsoleLog("[DOMContentLoaded] Start button element found and hidden.");
    } else {
        originalConsoleWarn("[DOMContentLoaded] Start button element not found.");
    }
    // *** END NEW ***


    originalConsoleLog("[DOMContentLoaded] Canvas, context, controls, console div referenced.");


    // Redirect console outputs to the consoleOutputDiv and original console
    if (consoleOutputDiv) {
        console.log = function (...args) {
            originalConsoleLog.apply(console, args);
            // Check if the message should be appended to the div to avoid excessive logs
            const messageString = args.join(' ');
            if (messageString.includes("game.") || messageString.includes("has arrived") || messageString.includes("has been eliminated.") || messageString.includes("Combat at") || messageString.includes("is blocked.") || messageString.includes("impassable terrain.") || messageString.includes("Combat Result") || messageString.includes("selected") || messageString.includes("Game saved") || messageString.includes("Game loaded") || messageString.includes("GAME HELP") || messageString.includes("WebSocket connection") || messageString.includes("Attempting connection") || messageString.includes("Assigned as player") || messageString.includes("Waiting for initial state") || messageString.includes("Game ended due to disconnection") || messageString.includes("Waiting for the Red player to connect") || messageString.includes("The Red player is connected") || messageString.includes("New game generated") || messageString.includes("The game begins!") || messageString.includes("Player:")) { // Added "Player:" to include chat messages
                appendMessageToConsoleDiv(args, 'log');
            }
        };
        console.warn = function (...args) {
            originalConsoleWarn.apply(console, args);
            // Optionally append warnings to div
            // appendMessageToConsoleDiv(args, 'warn'); // Let's keep warnings out of the console div for now unless critical
        };
        console.error = function (...args) {
            originalConsoleError.apply(console, args);
            // Optionally append errors to div
            // appendMessageToConsoleDiv(args, 'error'); // Let's keep errors out of the console div for now unless critical
        };
        originalConsoleLog("[DOMContentLoaded] Console functions wrapped.");
    }

    // --- Initial Setup ---
    // Load unit images first
    loadUnitImages(() => { // Ensure loadUnitImages is defined
        originalConsoleLog("[DOMContentLoaded] Unit images loaded callback.");

        // *** Initial map display (before connection) - maybe a default empty map or a simple terrain? ***
        // For now, let's start in a state ready for connection.
        // The map will be generated/loaded upon successful connection and role assignment.
        console.log("Connect to the server to start a multiplayer game.");
        // Draw an empty canvas or a placeholder?
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 800; // Default size before map load
            canvas.height = 600;
            ctx.fillStyle = '#F0F0F0';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '20px sans-serif';
            ctx.fillStyle = '#333';
            ctx.fillText("Connect to the server to start", canvas.width / 2, canvas.height / 2);
        }


        // --- Add event listeners for the modal ---
        if (hamburgerButton && settingsModal && closeModalButton) {
            hamburgerButton.onclick = function () {
                settingsModal.style.display = "block";
                generateDefaultFilename();
                originalConsoleLog("[DOMContentLoaded] Hamburger button clicked, showing settings modal and generating default filename.");
            }

            closeModalButton.onclick = function () {
                settingsModal.style.display = "none";
                originalConsoleLog("[DOMContentLoaded] Close button clicked, hiding settings modal.");
            }

            window.onclick = function (event) {
                if (event.target == settingsModal) {
                    settingsModal.style.display = "none";
                    originalConsoleLog("[DOMContentLoaded] Clicked outside modal content, hiding settings modal.");
                }
            }
        }
        // --- END Modal Event Listeners ---

        // --- Add event listeners for save/load ---
        if (saveGameButton && loadGameButton && loadFileInput) {
            saveGameButton.addEventListener('click', saveGame); // Local save
            loadGameButton.addEventListener('click', loadGame); // Local load
            loadFileInput.addEventListener('change', handleFileSelect); // Handles local file select
        }
        // --- END NEW ---

        // *** NEW : Add event listener for the help button ***
        if (helpButton) {
            helpButton.addEventListener('click', displayHelp); // Ensure displayHelp is defined
            originalConsoleLog("[DOMContentLoaded] Help button event listener attached.");
        }
        // *** END NEW ---

        // *** NEW: Add event listeners for chat input and send button ***
        if (chatInput && sendButton) {
            sendButton.addEventListener('click', sendChatMessage);
            chatInput.addEventListener('keypress', (event) => {
                // Check if the Enter key was pressed (key code 13) and the Shift key was NOT pressed
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault(); // Prevent the default newline behavior
                    sendChatMessage(); // Call the send function
                }
            });
            originalConsoleLog("[DOMContentLoaded] Chat input and send button event listeners attached.");
        } else {
             originalConsoleWarn("[DOMContentLoaded] Chat input or send button element not found. Chat functionality disabled.");
        }
        // *** END NEW ***


        // Regeneration and map height select listeners remain, but their function
        // updateDimensionsAndDraw will be blocked in multiplayer for the Red player.
        // For the Blue player, regenerateButton will still work *after* Red connects
        // AND the Start button is pressed.
        // Note: mapHeightSelect also triggers updateDimensionsAndDraw. Red will send a request.
        regenerateButton.addEventListener('click', updateDimensionsAndDraw); // This should only trigger state SENDING for Blue after Start
        mapHeightSelect.addEventListener('change', updateDimensionsAndDraw); // This should only trigger state SENDING for Blue after Start (Red sends request)

        // *** NEW : Add event listener for the Start button ***
        if (startButton) {
            startButton.addEventListener('click', () => {
                // This button should ONLY trigger map generation and game start
                // if the client is Blue AND Red is connected.
                if (playerArmyColor === ARMY_COLOR_BLUE && ws && ws.readyState === WebSocket.OPEN) {
                    // Trigger the game start logic which includes map generation and state sending
                    originalConsoleLog("[addEvent] Start button clicked. Triggering map generation and game start for Blue.");
                    updateDimensionsAndDraw(); // This function will now handle the actual start for Blue (generation, state send, loop start)
                    console.log("The game begins!");
                } else {
                    console.warn("Cannot start the game: Not Blue player or not connected.");
                    originalConsoleWarn("[addEvent] Start button clicked but conditions not met (Not Blue player or not connected).");
                }
            });
            originalConsoleLog("[DOMContentLoaded] Start button event listener attached.");
        }
        // *** END NEW ***


        // *** NEW : Add event listener for the connect button ***
        if (connectButton) {
            connectButton.addEventListener('click', connectToServer);
            originalConsoleLog("[DOMContentLoaded] Connect button event listener attached.");
        }
        // *** END NEW ***


        document.addEventListener('keydown', handleKeyDown);
        // Canvas click handler for selection and movement orders        
        setupCanvasEventListeners();
        originalConsoleLog("[DOMContentLoaded] Canvas click event listener attached.");

        // The game loop is now started when the player is assigned a color and state is ready.
        // Do NOT start requestAnimationFrame here.
        // lastRealTime = performance.now(); // Will be set when game loop starts.
        // gameLoopInterval = requestAnimationFrame(gameLoop); // Moved to relevant message handlers


        // *** Initial state or prompt for connection ***
        // The game state (map, units) is not generated or loaded until the player connects
        // and receives their role and initial state.
        // The canvas is initially blank or shows a message.

    });
});

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

