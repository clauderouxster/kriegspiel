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
            console.log(`${getUnitTypeName(unit.type)} of the ${unit.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army has arrived at destination (${unit.row}, ${unit.col}).`);
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
        console.log(`${getUnitTypeName(unit.type)} of the ${unit.armyColor === ARMY_COLOR_BLUE ? 'Blue' : 'Red'} army is blocked at (${unit.row}, ${unit.col}) towards (${targetR}, ${targetC}) - fallback block.`);
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

    // Red client does NOT perform combat detection or resolution here nor movement detection
    // It only executes unit movement based on received orders/syncs and handles local supply healing.
    // Combat results and eliminations are applied when receiving 'COMBAT_RESULT' messages.
    // Red relies on Blue's sync to know about combat hexes. combatHexes is updated in handleReceivedStateSync.
    // No need to clear combatHexes here on Red.

    if (!gameOver && playerArmyColor === ARMY_COLOR_BLUE) {
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
        if (gameTimeInMinutes >= lastCombatGameTimeInMinutes + COMBAT_INTERVAL_GAME_MINUTES) {
            originalConsoleLog(`[gameLoop] ${COMBAT_INTERVAL_GAME_MINUTES} game minutes elapsed. Initiating combat checks (Blue Client).`);
            // Clear previous combat highlights at the start of a new combat interval
            combatHexes.clear();

            lastCombatGameTimeInMinutes = gameTimeInMinutes; // Update last combat time *before* resolving combat

            const engagementsProcessedBleu = new Set();
            const engagementsProcessedRouge = new Set();
            // Filter units to only include living ones for combat checks
            let lesBleus = [];
            let lesRouges = [];
            currentUnits.forEach(unit => {
                if (unit !== null && unit !== undefined && unit.health > 0) {
                    if (unit.armyColor === ARMY_COLOR_BLUE)
                        lesBleus.push(unit);
                    else
                        lesRouges.push(unit);
                }
            })
            
            let oneCombat = false;
            if (lesBleus && lesRouges) {
                // Iterate through all living units to check for engagements FROM them
                lesBleus.forEach(unitBlue => {
                    if (unitBlue === null || unitBlue === undefined || unitBlue.health <= 0)
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
                            if (unitRed !== null && unitRed !== undefined && unitRed.health > 0) {
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
                                const unitStillExistsAndAlive = (unitBlue !== null && unitBlue !== undefined && unitBlue.health > 0);
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
                                    const unitStillExistsAndAlive = (unitRed !== null && unitRed !== undefined && unitRed.health > 0);
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
                        updateVisibility();
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
                    unitOnId.clear();
                    currentUnits = currentUnits.filter(unit => unit && unit.health > 0 && unitOnId.set(unit.id, unit));

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
        }

        // *** Final HP Recovery Phase by Supply (End of Tick) ***
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
