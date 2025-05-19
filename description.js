/*
 * Kriegspiel Map Game Description
 *
 * This is a hexagonal map-based strategy game with two opposing armies, Blue and Red.
 * The game simulates unit movement and combat over various terrain types.
 *
 * Map:
 * - The map is a hexagonal grid with variable dimensions based on user selection.
 * - Terrain types include Flat, Mountain, Hill, Swamp, Lake, and Forest.
 * - Terrain affects unit movement costs. Mountains and Lakes are generally impassable.
 * - The map is generated randomly with constraints to ensure plausible terrain distribution,
 * including avoiding mountains next to lakes and vice-versa.
 * - Lakes and forests are clustered in the center area of the map, while mountains and hills
 * are more likely to be placed initially.
 *
 * Units:
 * - There are five unit types: Infantry, Artillery, Cavalry, Supply, and Spy.
 * - Each unit type has specific movement costs for different terrains.
 * - Units have health points (HP).
 * - Units have different vision and combat ranges and combat stats (attack and defense).
 * - Units belong to either the Blue or Red army.
 * - Initial units are placed in designated starting areas on the map.
 *
 * Gameplay:
 * - The game runs on a loop that simulates the passage of time.
 * - Unit movement is processed incrementally based on accumulated game time and terrain costs.
 * - Players (currently only the Blue Army) can select units and set a target destination by clicking on a hex.
 * - Units will attempt to pathfind and move towards their target, dynamically adjusting their path.
 * - Fog of War is implemented, limiting the player's visibility to the areas around their units.
 * - Combat is resolved periodically between opposing units that are within range.
 * - Combat outcome is based on the aggregated attack and defense stats of participating units in a hex and its neighbors.
 * - Damage is distributed among the units in the engagement, and units with 0 HP are eliminated.
 * - Supply units heal friendly units in adjacent hexes over time.
 * - The game includes a visual analog clock displaying the in-game time.
 * - Console output displays key game events like unit movement orders, arrivals, combat, and eliminations.
 *
 * User Interface:
 * - The game is displayed on an HTML canvas.
 * - Users can select a map height and regenerate the map and units.
 * - Clicking on a visible friendly unit selects it.
 * - Clicking on a hex while a unit is selected sets that hex as the unit's target destination (even in fog).
 * - A console output area displays game messages.
 *
 * Dependencies:
 * - constants.js: Defines game constants for terrain, units, colors, movement costs, combat stats, etc.
 * - utils.js: Provides utility functions for hex grid calculations, unit lookups, movement cost retrieval, etc.
 * - mapGeneration.js: Handles the creation of the random game map.
 * - unitManagement.js: Manages the creation and initial placement of units.
 * - game.js: Contains the main game loop, rendering, user interaction handling, and initialization logic.
 *
 */
