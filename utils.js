/*
 * utils.js
 * Contient des fonctions utilitaires générales pour la grille et les unités.
 * Dépend de constants.js.
 * Accède aux variables globales currentMapRows, currentMapCols (définies dans game.js).
 * Accède aux fonctions originales de la console (définies dans game.js).
 *
 * Copyright 2025-present Claude ROUX
 * The 3-Clause BSD License
 */

// *** NEW: Mapping of UnitType enum values to human-readable names ***
/*
 * utils.js
 * Contient des fonctions utilitaires générales pour la grille et les unités.
 * Dépend de constants.js.
 * Accède aux variables globales currentMapRows, currentMapCols (définies dans game.js).
 * Accède aux fonctions originales de la console (définies dans game.js).
 */

// *** NEW: Mapping of UnitType enum values to human-readable names ***
const UNIT_TYPE_NAMES = {
    [UnitType.INFANTERY]: "Infantery",
    [UnitType.ARTILLERY]: "Artillery",
    [UnitType.CAVALRY]: "Cavalry",
    [UnitType.SUPPLY]: "Supplies",
    [UnitType.SPY]: "Spy",
    [UnitType.GENERAL]: "General" // Nouveau : Nom pour le général
};

/**
 * Checks if coordinates are within the map bounds.
 */
function isValid(r, c, rows, cols) {
    return r >= 0 && r < rows && c >= 0 && c < cols;
}

/**
 * Gets the grid coordinates [row, col] of all valid neighbors for a hex at [r, c].
 * Assumes a pointy-top hexagonal grid with odd-row staggering (row/column array).
 * Depends on isValid function to check coordinate validity.
 * @param {number} r - Row of the hex.
 * @param {number} c - Column of the hex.
 * @param {number} rows - Total number of rows in the grid.
 * @param {number} cols - Total number of columns in the grid.
 * @returns {number[][]} Array of [row, col] coordinates for valid neighbors.
 */
function getNeighbors(r, c, rows, cols) {
    const neighbors = [];
    
    // Offsets for pointy-top hexes with odd-row staggering
    //The direction depends on whether the row is an odd or an even number.
    const dr = [[[-1,-1], [-1,0], [0,-1], [0,1], [1,-1], [1,0]], [[-1,0], [-1,1], [0,-1], [0,1], [1,0], [1,1]]];
    const idx = r % 2;

    for (let i = 0; i < 6; i++) {
        const neighborR = r + dr[idx][i][0];
        const neighborC = c + dr[idx][i][1];
        if (isValid(neighborR, neighborC, rows, cols)) {
            neighbors.push([neighborR, neighborC]);
        }
    }
    
    return neighbors;
}

/**
 * Gets the pixel center coordinates (x, y) of a hex at grid coordinates (r, c).
 * Assumes a pointy-top hex layout with odd-row staggering.
 * Depends on HEX_SIZE from constants.js.
 * Source: https://www.redblobgames.com/grids/hexagons/#hex-to-pixel-axial
 * Adjusted for odd-row array coordinates.
 *
 * MODIFIED: Added offset to center the grid and prevent edge clipping.
 */
function getHexCenter(r, c, hexSize) {
    // For pointy-top hexes:
    // The width of a hex (distance between opposite flat sides) is size * sqrt(3)
    const hexWidth = hexSize * Math.sqrt(3);
    // The height of a hex (distance between opposite vertices) is size * 2
    const hexHeight = hexSize * 2;

    // Pixel coordinates based on pointy-top, odd-row staggering:
    // x = width * (c + 0.5 * (r % 2))
    // y = height * 0.75 * r
    // Source confirms this logic structure, using hexSize.
    // x = hex_size * Math.sqrt(3) * (col + 0.5 * (row % 2))
    // y = hex_size * 1.5 * row

    const x = hexSize * Math.sqrt(3) * (c + 0.5 * (r % 2));
    const y = hexSize * 1.5 * r;


    // Add an overall offset to position the grid on the canvas and prevent edge clipping.
    // Offset by half a hex width and half a hex height.
    const offsetX = hexSize * Math.sqrt(3) / 2; // Half hex width
    const offsetY = hexSize; // Half hex height (distance from center to vertex for pointy top)

    return { x: x + offsetX, y: y + offsetY };

    // The original code added hexWidth/2 and hexHeight/2 offsets, which seems incorrect
    // for mapping the grid's (0,0) hex center to (0,0) pixel or a small padding.
    // The standard formulas above already give the center of the hex.

    // Remove the original offsets:
    // const xOffset = hexWidth / 2 + 5; // Original offset
    // const yOffset = hexHeight / 2 + 5; // Original offset
    // return { x: x + xOffset, y: y + yOffset }; // Original return

    // Return the precise coordinates based on standard formulas
    // return { x, y }; // Original return without offset
}


/**
 * Converts pixel coordinates (x, y) on the canvas to hex grid coordinates (row, col).
 * Assumes a pointy-top hex layout and odd-row staggering.
 * Depends on HEX_SIZE from constants.js.
 * Source: https://www.redblobgames.com/grids/hexagons/#pixel-to-hex
 * Uses axial coordinates and hex rounding.
 *
 * MODIFIED: Account for the offset added in getHexCenter.
 */
function getHexFromCoordinates(x, y, hexSize) {
     // Account for the offset added in getHexCenter by subtracting it from pixel coordinates
     const offsetX = hexSize * Math.sqrt(3) / 2; // Must match offset in getHexCenter
     const offsetY = hexSize; // Must match offset in getHexCenter

     const adjustedX = x - offsetX;
     const adjustedY = y - offsetY;


    // Convert adjusted pixel (adjustedX, adjustedY) to floating-point axial (q, r_axial) for pointy-top
    // q = (x * sqrt(3)/3 - y / 3) / size
    // r_axial = y * 2 / 3 / size
    // Source: https://www.redblobgames.com/grids/hexagons/#pixel-to-hex-axial
    // Need to account for potential global canvas offset if getHexCenter uses one.
    // Assuming getHexCenter maps grid (0,0) to pixel (0,0), so no pixel offset needed here.

    const q = (adjustedX * Math.sqrt(3)/3 - adjustedY / 3) / hexSize;
    const r_axial = adjustedY * 2 / 3 / hexSize;

    // Now, convert the floating-point axial coordinates to integer axial coordinates
    // using hexagonal rounding.
    // Source: https://www.redblobgames.com/grids/hexagons/#rounding

    const float_q = q;
    const float_r = r_axial; // Using 'r' for axial coordinate name here for rounding formula consistency
    const float_s = -float_q - float_r; // s for cube coordinate x+y+z=0

    let rounded_q = Math.round(float_q);
    let rounded_r = Math.round(float_r);
    let rounded_s = Math.round(float_s);

    // Check if the rounding introduced an inconsistency (sum not zero)
    const q_diff = Math.abs(float_q - rounded_q);
    const r_diff = Math.abs(float_r - rounded_r);
    const s_diff = Math.abs(float_s - rounded_s);

    // If the sum is non-zero due to rounding, adjust the component with the largest change
    if (Math.round(rounded_q + rounded_r + rounded_s) !== 0) {
         if (q_diff > r_diff && q_diff > s_diff) {
             rounded_q = -rounded_r - rounded_s;
         } else if (r_diff > s_diff) {
             rounded_r = -rounded_q - rounded_s;
         } else {
             rounded_s = -rounded_q - rounded_r;
         }
    }

    // The rounded axial coordinates are (rounded_q, rounded_r)
    const final_axial_q = rounded_q;
    const final_axial_r = rounded_r; // This is the row in the axial system

    // Convert rounded axial (final_axial_q, final_axial_r) to pointy-top, odd-row array (r, c)
    // r = r_axial
    // c = q + r / 2 (integer division, or Math.floor)
    // Source: https://www.redblobgames.com/grids/hexagons/#conversions-array
    const final_r = final_axial_r; // Row in array coordinates is the axial 'r'
    const final_c = final_axial_q + Math.floor(final_r / 2); // Column in array coordinates

    // Return the final integer grid coordinates
    // It's also good practice to check if these coordinates are within the actual map bounds
    if (isValid(final_r, final_c, currentMapRows, currentMapCols)) { // Use actual map dimensions
         return { r: final_r, c: final_c };
    }

    // If the calculated hex is outside map bounds, return invalid coordinates
    return { r: -1, c: -1 };
}

/**
 * Calculates the "axial" coordinates q, r for a given row and column.
 * Useful for distance calculations in hexagonal grids.
 * Based on https://www.redblobgames.com/grids/hexagons/
 * Assumes pointy-top orientation, odd-row staggering.
 */
function toAxial(r, c) {
    // Pointy-top, odd-row staggering:
    // q = c - floor(r / 2)
    // r = r (axial 'r' is the same as array 'r')
    const q = c - Math.floor(r / 2);
    const axialR = r;

    return { q, r: axialR };
}

/**
 * Calculates the "cube" coordinates x, y, z for given axial coordinates q, r.
 * Useful for distance calculations. Sum of cube coordinates x + y + z = 0.
 */
function toCube(q, r) {
    // x = q
    // z = r
    // y = -x - z = -q - r
    const x = q;
    const z = r;
    const y = -x - z;
    return { x, y, z };
}

/**
 * Calculates the hexagonal distance between two hexes (r1, c1) and (r2, c2).
 * Converts to cube coordinates and uses the cube distance formula.
 * Based on https://www.redblobgames.com/grids/hexagons/
 */
function getHexDistance(r1, c1, r2, c2) {
    const { q: q1, r: axialR1 } = toAxial(r1, c1);
    const { q: q2, r: axialR2 } = toAxial(r2, c2);

    const { x: x1, y: y1, z: z1 } = toCube(q1, axialR1);
    const { x: x2, y: y2, z: z2 } = toCube(q2, axialR2);

    // Cube distance is max(abs(x1-x2), abs(y1-y2), abs(z1-z2))
    const distance = Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
    return distance;
}


/**
 * Gets the movement cost for a specific unit type on a given terrain type.
 * Depends on MOVEMENT_COSTS from constants.js.
 * Returns Infinity if movement is impossible.
 */
function getMovementCost(terrainType, unitType) {
    // Check if the terrain type exists in the movement costs mapping
    if (MOVEMENT_COSTS[terrainType] !== undefined) { // Uses constant
        // Check if the unit type exists for that terrain
        if (MOVEMENT_COSTS[terrainType][unitType] !== undefined) { // Uses constant
            return MOVEMENT_COSTS[terrainType][unitType]; // Uses constant
        } else {
            // If a unit type has no specific cost for a terrain, assume impassable (or a default very high cost?)
            // Returning Infinity makes it impassable.
             originalConsoleWarn(`[getMovementCost] No specific movement cost defined for UnitType ${unitType} on Terrain ${terrainType}. Assuming impassable (Infinity).`); // Uses original console
            return Infinity;
        }
    } else {
        // If a terrain type is not in the mapping, it's likely an error or should be impassable.
         originalConsoleWarn(`[getMovementCost] No movement costs defined for Terrain ${terrainType}. Assuming impassable (Infinity).`); // Uses original console
        return Infinity;
    }
}

/**
 * Finds the unit object at a specific grid location (row, col).
 * Returns the unit object if found, otherwise null.
 * Iterates through the global currentUnits array.
 * Note: This function performs a linear scan. For very large numbers of units,
 * a spatial index or a hex-to-unit map might be more performant.
 */
function getUnitAt(r, c, unitsList, caller = "unknown") {
     // Add a check to ensure unitsList is a valid array before iterating
     if (!Array.isArray(unitsList)) {
          originalConsoleError(`[getUnitAt] Invalid unitsList provided by caller "${caller}". Cannot search for unit at (${r}, ${c}).`);
          return null;
     }
     // Add a check for valid r, c against map bounds? Or assume caller ensures this.
     // Let's assume caller provides valid r, c for the grid being checked against.

    for (const unit of unitsList) {
         // Add defensive checks for unit existence and properties
        if (unit && unit.row === r && unit.col === c) {
            return unit; // Found the unit
        }
    }
    return null; // No unit found at these coordinates
}

/**
 * Gets the human-readable name for a given unit type.
 * Depends on UNIT_TYPE_NAMES mapping.
 */
function getUnitTypeName(unitType) {
    // Use the mapping, with a fallback for unknown types
    return UNIT_TYPE_NAMES[unitType] || `UnknownUnitType(${unitType})`;
}


/**
 * Calculates the movement duration in game minutes required for a unit type
 * to move one hex onto a given terrain type.
 * Depends on UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR, MOVEMENT_COSTS, MILLISECONDS_PER_GAME_MINUTE from constants.js.
 * Depends on getMovementCost from this file.
 * Returns the duration in game minutes, or Infinity if movement is impossible.
 */
function calculateMoveDurationGameMinutes(unitType, terrainType) {
    // Get the movement cost multiplier for this terrain and unit type
    const movementCostMultiplier = getMovementCost(terrainType, unitType); // Uses utils function

    // If the movement cost is Infinity (impassable), the duration is also Infinity
    if (movementCostMultiplier === Infinity) {
        return Infinity;
    }

    // Get the base movement capability in hexes per game hour for this unit type
    // UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR maps UnitType to a number (e.g., 3 for Infantry)
     const baseCapabilityPerGameHour = UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR[unitType]; // Uses constant

    // If the base capability is not defined or is zero/negative, movement is impossible
     if (!baseCapabilityPerGameHour || baseCapabilityPerGameHour <= 0) {
         originalConsoleWarn(`[calculateMoveDurationGameMinutes] Base movement capability not defined or invalid for UnitType ${unitType}. Assuming impassable (Infinity).`);
        return Infinity;
    }


    // Calculate the time needed for one hex movement in game hours
    // Time per hex = 1 / capability (hexes per hour) * cost multiplier
    const gameHoursPerHex = (1 / baseCapabilityPerGameHour) * movementCostMultiplier;

    // Convert game hours to game minutes
    const gameMinutesPerHex = gameHoursPerHex * 60;

    return gameMinutesPerHex;
}


/**
 * Shuffles an array using the Fisher-Yates (Knuth) Algorithm.
 * Used for randomizing unit placement or map generation steps.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); // Random index from 0 to i
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
    return array; // Return the shuffled array
}

/**
 * Gets the effective combat range for a group of units.
 * This is a copy of the function from game.js, but placed here for completeness in utils.
 * Should ideally be in game.js as it relates to combat logic.
 * If it's needed elsewhere, a shared module or careful dependency management is required.
 * Let's keep the primary implementation in game.js and note this here.
 *
 * --- NOTE ---
 * The authoritative version of getEffectiveGroupCombatRange is in game.js.
 * This definition is a placeholder/copy for file completeness but should
 * be kept in sync or removed if not needed elsewhere.
 * ---
 */
// function getEffectiveGroupCombatRange(unitsList, unitCombatStats, unitTypeConstants) {
//      // ... (implementation from game.js) ...
//      // Removed the implementation here to avoid redundancy and potential sync issues.
//      // The function in game.js is the source of truth.
// }

//--- Version Corrigée (avec getHexFromCoordinates et getNeighbors précis)