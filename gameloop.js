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

/**
 * Calculates the effective combat range for a group of units involved in a single engagement.
 * The group's range is the minimum combat range of all non-Cavalry units in the group,
 * unless a Cavalry unit is present, in which case the range is always 1 (melee).
 * Depends on getCombatRange from this file (which depends on constants/utils).
 * Depends on UnitType from constants.js.
 * Access global UNIT_COMBAT_STATS.
 * Uses originalConsoleWarn.
 */

function getEffectiveCombatRange(unit, unitCombatStats) {
    let factualBaseRange = 0;

    // Ensure unit and its type/stats are valid
    if (unit && unitCombatStats[unit.type]) {

        const terrainAtUnitHex = map[unit.row][unit.col];

        // Get the base range defined in UNIT_COMBAT_STATS
        const baseRange = unitCombatStats[unit.type].range.base; 
        if (terrainAtUnitHex === Terrain.HILL) {
            const hillRange = unitCombatStats[unit.type].range?.hill; // Use optional chaining
            if (hillRange !== undefined && hillRange !== null && hillRange !== Infinity)
                factualBaseRange = hillRange;
            else
                factualBaseRange = baseRange;
        } else {
            if (terrainAtUnitHex === Terrain.MOUNTAIN) {
                const mountainRange = unitCombatStats[unit.type].range?.mountain; // Use optional chaining
                if (mountainRange !== undefined && mountainRange !== null && mountainRange !== Infinity)
                    factualBaseRange = mountainRange;
                else
                    factualBaseRange = baseRange;
            }
            else
                factualBaseRange = baseRange;
        }
    }
    return factualBaseRange;
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

    if (firstDraw && playerArmyColor == ARMY_COLOR_RED) {
        firstDraw = false;
        window.scrollTo(0, document.body.scrollHeight);
    }
    // Draw the game clock (always visible)
    //drawClock(ctx, gameTimeInMinutes); // Use global gameTimeInMinutes, drawing function
}

