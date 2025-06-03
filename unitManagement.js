/*
 * unitManagement.js
 * Contient la logique de création et de placement initial des unités.
 * Dépend de constants.js, utils.js.
 * Accède aux variables globales map, currentMapRows, currentMapCols, ARMY_COLOR_BLUE, ARMY_COLOR_RED, UnitType, UNIT_HEALTH.
 * Accède aux fonctions originales de la console (définies dans game.js).
 *
 * Copyright 2025-present Claude ROUX
 * The 3-Clause BSD License
 */

// Counter for unique unit IDs
let unitIdCounter = 0;

/**
 * Creates the initial units for both armies and places them on the map
 * randomly in their respective quarters of the map, checking for existing units.
 * Assigns unique IDs to units.
 * Depends on UnitType, ARMY_COLOR_BLUE, ARMY_COLOR_RED, UNIT_HEALTH from constants.js.
 * Depends on isValid, getUnitTypeName from utils.js.
 * Accède aux variables globales originalConsoleLog, originalConsoleWarn, originalConsoleError.
 */
function createInitialUnits(map, rows, cols, unitCounts) {
    // Check if map, rows, or cols are invalid or too small for basic placement
    if (!map || rows < 4 || cols < 1) { // Minimum 4 rows needed for two quarters
        originalConsoleError("[createInitialUnits] Invalid map or dimensions provided. Cannot create units in quarters.");
        console.error("Error: Unable to place units (map too small for quarters).");
        return []; // Return empty array if map is invalid or too small
    }

    originalConsoleLog(`[createInitialUnits] Creating units for map size ${rows},${cols} with counts ${JSON.stringify(unitCounts)}.`);

    const initialUnits = [];
    unitIdCounter = 0; // Reset counter for a new game/placement

    // --- Prepare lists of units to place for each army, grouped by type ---
    const blueUnitsByType = {};
    const redUnitsByType = {};

    for(const typeKey in UnitType) {
        const type = UnitType[typeKey];
        // Initialize arrays, exclude GENERAL for now as it's placed separately
        if (type !== UnitType.GENERAL) {
             blueUnitsByType[type] = [];
             redUnitsByType[type] = [];
        }
    }

    let blueGeneralCount = 0;
    let redGeneralCount = 0;

    for (const unitTypeKey in unitCounts) {
        if (unitCounts.hasOwnProperty(unitTypeKey)) {
            const unitType = parseInt(unitTypeKey);
            const count = unitCounts[unitTypeKey] || 0; // Use 0 if count is null/undefined

            if (unitType === UnitType.GENERAL) {
                blueGeneralCount = count; // Assuming count is the number of generals per side
                redGeneralCount = count;
            } else {
                for (let i = 0; i < count; i++) {
                     // Push the unit type value (integer) into the array
                    blueUnitsByType[unitType]?.push(unitType);
                    redUnitsByType[unitType]?.push(unitType);
                }
            }
        }
    }

    // Define starting positions and row offsets for each army for line placement

    const mapHalf = Math.floor(rows / 2);
    const mapQuarter = Math.floor(rows / 4);

    // Function to check if a position is occupied
    const isOccupied = (r, c) => {
        return initialUnits.some(unit => unit.row === r && unit.col === c);
    };

    // --- Place Blue Army units (excluding General) randomly ---
    originalConsoleLog("Placing Blue Army units randomly in the top quarter...");
    let blueUnitsPlacedCount = 0;
    const totalInitialBlueUnits = Object.values(blueUnitsByType).flat().length;


    // Order of placement by type group: Spy/Supply, Cavalry, Artillery, Infantry
    let orderedUnitTypes = [
        UnitType.SCOUT, UnitType.SUPPLY,
        UnitType.CAVALRY,
        UnitType.ARTILLERY,
        UnitType.INFANTERY
    ];

    for (const unitType of orderedUnitTypes) {
        const unitsOfType = blueUnitsByType[unitType] || [];

        for (let i = 0; i < unitsOfType.length; i++) {
            let placed = false;
            let attempts = 0;
            const maxAttempts = rows * cols * 5; // Increase attempts for random placement

            while (!placed && attempts < maxAttempts) {
                const randomRow = Math.floor(Math.random() * mapQuarter); // Random row within blue quarter (0 to rows/4 - 1)
                const randomCol = Math.floor(Math.random() * cols);   // Random column anywhere

                if (isValid(randomRow, randomCol, rows, cols) && 
                    !isOccupied(randomRow, randomCol) &&
                    map[randomRow][randomCol] !== Terrain.LAKE) {
                    const initialHealth = UNIT_HEALTH[unitType] !== undefined ? UNIT_HEALTH[unitType] : 1;

                    initialUnits.push({
                        id: unitIdCounter++,
                        type: unitType,
                        armyColor: ARMY_COLOR_BLUE,
                        row: randomRow,
                        col: randomCol,
                        health: initialHealth,
                        targetRow: null,
                        targetCol: null,
                        previousRow: randomRow,
                        previousCol: randomCol,
                        movementProgress: 0
                    });
                    blueUnitsPlacedCount++;
                    originalConsoleLog(`[createInitialUnits] Placed Blue Army unit type ${getUnitTypeName(unitType)} ID ${initialUnits[initialUnits.length - 1].id} at (${randomRow}, ${randomCol}).`);
                    placed = true;
                }
                attempts++;
            }
            if (!placed) {
                 originalConsoleError(`[createInitialUnits] Failed to place Blue Army unit type ${getUnitTypeName(unitType)} after ${maxAttempts} attempts. No empty valid hex found in blue territory.`);
                 console.error(`Error: Unable to place a Blue unit (${getUnitTypeName(unitType)}) after several attempts. No empty hex found in Blue territory.`);
            }
        }
    }


    // Log if not all blue units (excluding generals) were placed
    if (blueUnitsPlacedCount < totalInitialBlueUnits) {
         originalConsoleWarn(`[createInitialUnits] Only placed ${blueUnitsPlacedCount} out of ${totalInitialBlueUnits} Blue Army units (excluding Generals). Insufficient space in blue territory.`);
         console.warn(`Warning: Only ${blueUnitsPlacedCount} Blue units (excluding Generals) out of ${totalInitialBlueUnits} could be placed. Not enough space in Blue territory.`);
    } else {
         originalConsoleLog(`[createInitialUnits] Successfully placed all ${blueUnitsPlacedCount} Blue Army units (excluding Generals).`);
    }


    // --- Place Red Army units (excluding General) randomly ---
    originalConsoleLog("Placing Red Army units randomly in the bottom quarter...");
    let redUnitsPlacedCount = 0;
     // Calculate total units excluding generals for this count
    const totalInitialRedUnits = Object.values(redUnitsByType).flat().length;

     orderedUnitTypes = [
        UnitType.INFANTERY,
        UnitType.ARTILLERY,
        UnitType.CAVALRY,
        UnitType.SCOUT, UnitType.SUPPLY,
    ];

     /*
     // Re-initialize next available columns for Red Army as units are placed independently of Blue
     for (const unitType in rowOffsetsRED) {
        const offset = rowOffsetsRED[unitType];
        const redRow = redArmyBaseRow + offset;
         if (redRow >= 0 && redRow < rows) {
            // Recalculate initial column for centering attempt
             const totalUnitsInRow = (redUnitsByType[UnitType.SCOUT]?.length || 0) + (redUnitsByType[UnitType.SUPPLY]?.length || 0) // Approx count for line 1
                                        + (redUnitsByType[UnitType.CAVALRY]?.length || 0) // Approx count for line 2
                                        + (redUnitsByType[UnitType.ARTILLERY]?.length || 0) // Approx count for line 3
                                        + (redUnitsByType[UnitType.INFANTERY]?.length || 0); // Approx count for line 4 (excluding general here)
             let calculatedStartCol = redArmyStartCol;
             if (totalUnitsInRow > 0 && cols > totalUnitsInRow) {
                 // Attempt to center the line if there's enough space
                 calculatedStartCol = Math.max(0, Math.floor((cols - totalUnitsInRow) / 2)); // Ensure col is not negative
             }
            nextRedCol[redRow] = calculatedStartCol;
         }
    }
    */

    for (const unitType of orderedUnitTypes) { // Use the same ordered list excluding General
        const unitsOfType = redUnitsByType[unitType] || [];

        for (let i = 0; i < unitsOfType.length; i++) {
            let placed = false;
            let attempts = 0;
            const maxAttempts = rows * cols * 5; // Increase attempts for random placement

            while (!placed && attempts < maxAttempts) {
                const randomRow = rows - mapQuarter + Math.floor(Math.random() * mapQuarter); // Random row within red quarter (rows - rows/4 to rows - 1)
                const randomCol = Math.floor(Math.random() * cols);   // Random column anywhere

                if (isValid(randomRow, randomCol, rows, cols) && 
                    !isOccupied(randomRow, randomCol) &&
                    map[randomRow][randomCol] !== Terrain.LAKE) {
                    const initialHealth = UNIT_HEALTH[unitType] !== undefined ? UNIT_HEALTH[unitType] : 1;

                    initialUnits.push({
                        id: unitIdCounter++,
                        type: unitType,
                        armyColor: ARMY_COLOR_RED,
                        row: randomRow,
                        col: randomCol,
                        health: initialHealth,
                        targetRow: null,
                        targetCol: null,
                        previousRow: randomRow,
                        previousCol: randomCol,
                        movementProgress: 0
                    });
                    redUnitsPlacedCount++;
                    originalConsoleLog(`[createInitialUnits] Placed Red Army unit type ${getUnitTypeName(unitType)} ID ${initialUnits[initialUnits.length - 1].id} at (${randomRow}, ${randomCol}).`);
                    placed = true;
                }
                attempts++;
            }
             if (!placed) {
                 originalConsoleError(`[createInitialUnits] Failed to place Red Army unit type ${getUnitTypeName(unitType)} after ${maxAttempts} attempts. No empty valid hex found in red territory.`);
                 console.error(`Error: Unable to place a Red unit (${getUnitTypeName(unitType)}) after several attempts. No empty hex found in Red territory.`);
            }
        }
    }


    // Log if not all red units (excluding generals) were placed
     if (redUnitsPlacedCount < totalInitialRedUnits) {
          originalConsoleWarn(`[createInitialUnits] Only placed ${redUnitsPlacedCount} out of ${totalInitialRedUnits} Red Army units (excluding Generals). Insufficient space in red territory.`);
          console.warn(`Warning: Only ${redUnitsPlacedCount} Red units (excluding Generals) out of ${totalInitialRedUnits} could be placed. Not enough space in Red territory.`);
     } else {
          originalConsoleLog(`[createInitialUnits] Successfully placed all ${redUnitsPlacedCount} Red Army units (excluding Generals).`);
     }

    // --- Place Generals randomly ---
    originalConsoleLog("Placing Generals randomly...");

    // Place Blue Generals
    for (let i = 0; i < blueGeneralCount; i++) {
        let placed = false;
        let attempts = 0;
        const maxAttempts = rows * cols * 5; // Increase attempts for random placement

        while (!placed && attempts < maxAttempts) {
            const randomRow = Math.floor(Math.random() * Math.max(0, mapQuarter - 3)); // Rows 0 to rows/4 - 4, with buffer
            const randomCol = Math.floor(Math.random() * cols);   // Columns 0 to cols - 1

            if (isValid(randomRow, randomCol, rows, cols) && 
                !isOccupied(randomRow, randomCol) &&
                map[randomRow][randomCol] !== Terrain.LAKE) {
                 const initialHealth = UNIT_HEALTH[UnitType.GENERAL] !== undefined ? UNIT_HEALTH[UnitType.GENERAL] : 1;
                initialUnits.push({
                    id: unitIdCounter++,
                    type: UnitType.GENERAL,
                    armyColor: ARMY_COLOR_BLUE,
                    row: randomRow,
                    col: randomCol,
                    health: initialHealth,
                    targetRow: null,
                    targetCol: null,
                    previousRow: randomRow,
                    previousCol: randomCol,
                    movementProgress: 0
                });
                originalConsoleLog(`[createInitialUnits] Placed Blue General ID ${initialUnits[initialUnits.length - 1].id} at (${randomRow}, ${randomCol}).`);
                placed = true;
            }
            attempts++;
        }
        if (!placed) {
             originalConsoleError(`[createInitialUnits] Failed to place Blue General after ${maxAttempts} attempts. No empty valid hex found in blue territory.`);
             console.error(`Error: Unable to place a Blue General after several attempts. No empty hex found in Blue territory.`);
        }
    }

    // Place Red Generals
    for (let i = 0; i < redGeneralCount; i++) {
        let placed = false;
        let attempts = 0;
        const maxAttempts = rows * cols * 5; // Increase attempts for random placement

        while (!placed && attempts < maxAttempts) {
            const randomRow = rows - mapQuarter + 3 + Math.floor(Math.random() * Math.max(0, mapQuarter - 3)); // Rows rows - rows/4 + 3 to rows - 1, with buffer
            const randomCol = Math.floor(Math.random() * cols);   // Columns 0 to cols - 1

            if (isValid(randomRow, randomCol, rows, cols) && 
                !isOccupied(randomRow, randomCol) &&
                map[randomRow][randomCol] !== Terrain.LAKE) {
                 const initialHealth = UNIT_HEALTH[UnitType.GENERAL] !== undefined ? UNIT_HEALTH[UnitType.GENERAL] : 1;
                initialUnits.push({
                    id: unitIdCounter++,
                    type: UnitType.GENERAL,
                    armyColor: ARMY_COLOR_RED,
                    row: randomRow,
                    col: randomCol,
                    health: initialHealth,
                    targetRow: null,
                    targetCol: null,
                    previousRow: randomRow,
                    previousCol: randomCol,
                    movementProgress: 0
                });
                originalConsoleLog(`[createInitialUnits] Placed Red General ID ${initialUnits[initialUnits.length - 1].id} at (${randomRow}, ${randomCol}).`);
                placed = true;
            }
            attempts++;
        }
         if (!placed) {
             originalConsoleError(`[createInitialUnits] Failed to place Red General after ${maxAttempts} attempts. No empty valid hex found in red territory.`);
             console.error(`Error: Unable to place a Red General after several attempts. No empty hex found in Red territory.`);
        }
    }


    originalConsoleLog(`[createInitialUnits] Finished placing units. Total units created: ${initialUnits.length}`);
    return initialUnits;
}

// Assuming UnitType, ARMY_COLOR_BLUE, ARMY_COLOR_RED, UNIT_HEALTH, isValid, getUnitTypeName,
// originalConsoleLog, originalConsoleWarn, originalConsoleError are defined elsewhere (e.g., constants.js, utils.js, game.js)