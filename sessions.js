
// ============================================================================
// Save and Load Game Logic (Local Save/Load - less priority in MP)
// Depends on global map, currentUnits, currentMapRows, currentMapCols, gameTimeInMinutes, visibleHexes, combatHexes.
// Depends on updateVisibility, drawMapAndUnits.
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
 * Depends on updateVisibility, drawMapAndUnits.
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
        unitOnId.clear();
        currentUnits.forEach(unit => {unitOnId.set(unit.id, unit);});

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
        const canvasWidth = (currentMapCols + currentMapCols/6) * HEX_SIZE * 1.5 + HEX_SIZE * 0.5; // Hex grid width calculation
        const canvasHeight = (currentMapRows + currentMapRows/7) * HEX_SIZE * Math.sqrt(3) * 0.75 + HEX_SIZE * Math.sqrt(3) * 0.25 + CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2 + 20; // Height including clock and padding

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

