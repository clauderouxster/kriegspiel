/**
 * Gets all hexes within a specified range from a center hex.
 * Does NOT check for line-of-sight or terrain blocking vision.
 * Uses a BFS-like approach up to the max range.
 * Depends on getNeighbors, isValid from utils.js.
 * Access global currentMapRows, currentMapCols.
 */

function getHexesInRange(centerR, centerC, range) {
    const neighbors = getNeighbors(centerR, centerC, currentMapRows, currentMapCols);
    if (range == 1)
        return neighbors;

    const visited = new Set(`${centerR},${centerC}`);
    const hexes = [];
    let currentneighbors = neighbors;
    rg = 1;
    while (rg < range) {
        let allneighbors = [];
        for (const [nr, nc] of currentneighbors) {
            const newneighbors = getNeighbors(nr, nc, currentMapRows, currentMapCols);
            newneighbors.forEach(u => {
                const neighborKey = `${u[0]},${u[1]}`;
                if (visited.has(neighborKey) || !isValid(u[0], u[1], currentMapRows, currentMapCols))
                    return;
                visited.add(neighborKey);
                hexes.push(u);
                allneighbors.push(u);
            });
        }
        currentneighbors = allneighbors;
        rg++;
    }

    return hexes;
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
    } else if (event.ctrlKey && event.key === "a") { // Check for Ctrl+A
        event.preventDefault(); // Prevent default browser behavior (e.g., selecting all text)

        if (selectedUnits.length === 1) { // Only if exactly one unit is selected
            const unitType = selectedUnits[0].type;

            // --- NOUVELLE LOGIQUE POUR DÉTERMINER LES LIMITES DE L'ÉCRAN RÉELLEMENT VISIBLES ---

            const unitsToSelect = [];
            currentUnits.forEach(unit => {
                // Check if the unit is of the same type, friendly, within the calculated screen bounds, and alive
                if (unit.type === unitType &&
                    unit.armyColor === playerArmyColor &&
                    unit.health > 0) {
                    unitsToSelect.push(unit);
                }
            });

            selectedUnits = unitsToSelect; // Update the selection
            if (selectedUnits.length > 0) {
                selectedUnit = selectedUnits[0]; // Set selectedUnit to the first unit if any
            } else {
                selectedUnit = null;
            }
            console.log(`Selected ${selectedUnits.length} units of type ${unitType} visible on screen.`);
            drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Redraw to show new selection
        } else {
            console.log("Ctrl+A: Only works when exactly one unit is selected.");
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
    document.addEventListener('keydown', handleKeyDown); // Add this line to listen for keyboard events
}

function updateNbCentered() {
    if (nbUnitCentered.size == 0) {
        for (let i = 1; i < 10; i++) {
            const hexes = getHexesInRange(20, 20, i);
            nbUnitCentered.set(i, 1+hexes.length);
        }
    }
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

        // --- Double-Click Detection ---
    const currentTime = Date.now();
    const isDoubleClick = (currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD) &&
                          (clickedR === lastClickedHexR && clickedC === lastClickedHexC);

    lastClickTime = currentTime;
    lastClickedHexR = clickedR;
    lastClickedHexC = clickedC;

    if (isDoubleClick) {
        if (unitAtClickedHex && unitAtClickedHex.armyColor === playerArmyColor && isVisible) {
            // Double-clicked on a friendly unit
            const clickedUnitType = unitAtClickedHex.type;
            const selectionRadius = 10; // Define the radius for selection

            const hexesInRadius = getHexesInRange(unitAtClickedHex.row, unitAtClickedHex.col, selectionRadius);
            // Add the center hex itself to the list of hexes to check
            hexesInRadius.push([unitAtClickedHex.row, unitAtClickedHex.col]);

            const unitsToSelect = [];
            const hexesInRadiusSet = new Set(hexesInRadius.map(h => `${h[0]},${h[1]}`));

            livingUnits.forEach(unit => {
                const unitKey = `${unit.row},${unit.col}`;
                if (unit.type === clickedUnitType &&
                    unit.armyColor === playerArmyColor &&
                    hexesInRadiusSet.has(unitKey) &&
                    unit.health > 0) {
                    unitsToSelect.push(unit);
                }
            });

            selectedUnits = unitsToSelect; // Update the selection
            if (selectedUnits.length > 0) {
                selectedUnit = selectedUnits[0]; // Set selectedUnit to the first unit if any
            } else {
                selectedUnit = null;
            }
            console.log(`Double-clicked: Selected ${selectedUnits.length} units of type ${clickedUnitType} within ${selectionRadius} hexes.`);
            drawMapAndUnits(ctx, map, currentUnits, HEX_SIZE, TerrainColors); // Redraw to show new selection
            return; // Stop further processing for this double-click
        }
    }


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
                        unitsToOrder.sort((a, b) => {
                            // 1. Critère principal: Trier par 'type' (par ordre alphabétique par défaut)
                            if (a.armyColor == ARMY_COLOR_BLUE) {
                                if (a.type < b.type) {
                                    return 1; // 'a' vient avant 'b'
                                }
                                if (a.type > b.type) {
                                    return -1; // 'b' vient avant 'a'
                                }
                            }
                            else {
                                if (a.type < b.type) {
                                    return -1; // 'a' vient avant 'b'
                                }
                                if (a.type > b.type) {
                                    return 1; // 'b' vient avant 'a'
                                }
                            }

                            // Calculate Manhattan Distance for unit 'a'
                            const distA = Math.abs(a.row - baseTargetR) + Math.abs(a.col - baseTargetC);

                            // Calculate Manhattan Distance for unit 'b'
                            const distB = Math.abs(b.row - baseTargetR) + Math.abs(b.col - baseTargetC);

                            // Sort in ascending order of distance (closer units first)
                            if (distA !== distB) {
                                return distA - distB;
                            }

                            // If distances are equal, you might want a secondary sorting criterion.
                            // For example, if you want units with higher 'col' then higher 'row'
                            // among equally distant units (similar to your initial request),
                            // you can add those rules here.
                            // Otherwise, their relative order remains stable as per JavaScript's sort() behavior.

                            // Example secondary sorting for ties (optional):
                            // If distances are equal, sort by col (descending), then by row (descending)
                            if (b.col !== a.col) {
                                return b.col - a.col;
                            }
                            return b.row - a.row;
                        });

                        updateNbCentered();
                        let freehexes;
                        for (let i = 1; i < 10; i++) {
                            if (unitsToOrder.length <= nbUnitCentered.get(i)) {
                                freehexes = getHexesInRange(baseTargetR, baseTargetC, i);
                                freehexes.unshift([baseTargetR, baseTargetC]);
                                break;
                            }
                        }

                        const unitsSuccessfullyOrdered = [];
                        let index = 0;
                        unitsToOrder.forEach((unit) => {
                            // Calculate the individual target hex with simple column displacement
                            const [targetR, targetC] = freehexes[index];
                            index++;

                            // Check validity of the individual target hex
                            //const isTargetValidLocation = isValid(targetR, targetC, currentMapRows, currentMapCols);
                            //const targetTerrain = isTargetValidLocation ? map[targetR][targetC] : null;
                            //const movementCost = isTargetValidLocation ? getMovementCost(targetTerrain, unit.type) : Infinity;
                            // Check if the target hex is occupied by *any* unit (excluding the current unit itself)
                            //const isOccupiedByAnyUnit = isTargetValidLocation ? getUnitAt(targetR, targetC, livingUnits.filter(u => u.id !== unit.id), `handleCanvasClick - target occupied check for unit ${unit.id}`) !== null : true; // Exclude the unit itself from the check

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
