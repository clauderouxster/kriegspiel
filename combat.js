
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

function getEffectiveCombatRange(unit, unitCombatStats) {
    let minBaseRange = 0;

    // Ensure unit and its type/stats are valid
    if (unit && unitCombatStats[unit.type]) {

        const terrainAtUnitHex = map[unit.row][unit.col];

        // Get the base range defined in UNIT_COMBAT_STATS
        const baseRange = unitCombatStats[unit.type].range.base; 
        if (terrainAtUnitHex === Terrain.HILL) {
            const hillRange = unitCombatStats[unit.type].range?.hill; // Use optional chaining
            if (hillRange !== undefined && hillRange !== null && hillRange !== Infinity)
                minBaseRange = hillRange;
            else
                minBaseRange = baseRange;
        } else {
            if (terrainAtUnitHex === Terrain.MOUNTAIN) {
                const mountainRange = unitCombatStats[unit.type].range?.mountain; // Use optional chaining
                if (mountainRange !== undefined && mountainRange !== null && mountainRange !== Infinity)
                    minBaseRange = mountainRange;
                else
                    minBaseRange = baseRange;
            }
            else
                minBaseRange = baseRange;
        }
    }
    return minBaseRange;
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
        const rangeA = getEffectiveCombatRange(unitA, UNIT_COMBAT_STATS);
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
        const rangeB = getEffectiveCombatRange(unitB, UNIT_COMBAT_STATS);
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

    // --- Introduce Randomness (Symmetric) ---
    const R = COMBAT_RANDOMNESS_FACTOR;

    // Generate independent random multipliers for attacker and defender.
    // Each multiplier will be between (1 - R) and (1 + R), centered around 1.
    // This removes the inherent bias towards the attacker.
    const attackerRandomMultiplier = 1 + (Math.random() * 2 - 1) * R; // (Math.random() * 2 - 1) gives a value between -1 and 1
    const defenderRandomMultiplier = 1 + (Math.random() * 2 - 1) * R;

    // Calculate effective power after applying randomness
    // Ensure power does not become negative
    const effectiveAttackerPower = Math.max(0, totalAttackerAttack * attackerRandomMultiplier);
    const effectiveDefenderPower = Math.max(0, totalDefenderDefense * defenderRandomMultiplier);
    // --- End Randomness (Symmetric) ---

    // --- Apply Diminishing Returns Formula ---
    // This formula gives smaller forces a better chance
    // while still giving an advantage to superior forces
    const applyDiminishingReturns = (value) => {
        // Square root is a good way to get diminishing returns
        // Could also use Math.pow(value, 0.7) or another exponent between 0 and 1
        return Math.pow(value, 0.7);
    };

    // Combat Power for comparison is now based on effective stats after randomness AND diminishing returns
    const attackerCombatPower = applyDiminishingReturns(effectiveAttackerPower);
    const defenderCombatPower = applyDiminishingReturns(effectiveDefenderPower);
    // --- End Diminishing Returns ---

    // Increase the threshold difference required for a decisive victory
    const victoryThreshold = 1.10; // 15% minimum difference for a decisive victory

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
        // In a draw, both sides take damage, so the damage is split or applied to both.
        // Here, it's a total damage value that would be applied to 'both' sides.
        damage = (effectiveAttackerPower + effectiveDefenderPower) * COMBAT_DAMAGE_SCALE * 0.25; // Adjusted for draw to be less severe
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
