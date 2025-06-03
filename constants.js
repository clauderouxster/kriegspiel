/*
 * constants.js
 * Contient toutes les constantes utilisées dans le jeu Kriegspiel Map.
 *
 * Copyright 2025-present Claude ROUX
 * The 3-Clause BSD License
 */

// Constants for terrain types
const Terrain = {
    FLAT: 0,       // Terrain plat
    MOUNTAIN: 1,   // Montagne
    HILL: 2,       // Colline
    SWAMP: 3,      // Marais
    LAKE: 4,       // Lac
    FOREST: 5,     // Forêt
    UNASSIGNED: -1 // For generation process
};

// Special states during generation passes
const HILL_CANDIDATE = -2;
const SWAMP_CANDIDATE = -3;

// Colors for each terrain type
const TerrainColors = {
    [Terrain.FLAT]: '#8FBC8F',   // Dark Sea Green (Flat)
    [Terrain.MOUNTAIN]: '#8B4513', // Saddle Brown (Mountain)
    [Terrain.HILL]: '#A0522D',   // Sienna (Hill)
    [Terrain.SWAMP]: '#556B2F',   // Dark Olive Green (Swamp)
    [Terrain.LAKE]: '#4682B4',    // Steel Blue (Lake)
    [Terrain.FOREST]: '#228B22'  // Forest Green (Forest)
};

// Constants for Unit Types
const UnitType = {
    INFANTERY: 0,   // Infanterie
    ARTILLERY: 1,  // Artillerie
    CAVALRY: 2,    // Cavalerie
    SUPPLY: 3,     // Intendance
    SCOUT: 4,         // Espion
    GENERAL: 5      // Général
};

SOUND_TRUMPET_PATH = 'resources/trumpet.mp3';
SOUND_VICTORY_PATH = 'resources/victoire.mp3';
SOUND_DEFEAT_PATH = 'resources/defaite.mp3';

// File paths for unit images
const UNIT_IMAGE_PATHS = {
    [UnitType.INFANTERY]: 'resources/infanterie.png',
    [UnitType.ARTILLERY]: 'resources/artillerie.png',
    [UnitType.CAVALRY]: 'resources/cavalerie.png',
    [UnitType.SUPPLY]: 'resources/intendance.png',
    [UnitType.SCOUT]: 'resources/espion.png',
    [UnitType.GENERAL]: 'resources/general.png' // Nouveau : Fichier pour le général
};

// Colors for armies (for visual distinction)
const ARMY_COLOR_BLUE = '#0000FF'; // Blue Army
const ARMY_COLOR_RED = '#FF0000';   // Red Army

// Base aspect ratio for the map (cols / rows) - determines map shape
const BASE_ASPECT_RATIO = 1.5;

// Probability of a hex initially being a mountain (0 to 1)
const MOUNTAIN_PROBABILITY = 0.05;

// Percentage of the map's center area to exclude from initial mountain/water placement
const CENTER_AREA_PERCENT = 0.5; // 50% of the map center

// Base height used for scaling lake and forest generation parameters
const BASE_HEIGHT_FOR_LAKE_SCALING = 40; // For a 40-row map, these are the base values
const BASE_LAKE_SIZE_MIN = 5; // Updated: Smaller minimum radius for lakes
const BASE_LAKE_SIZE_MAX = 15; // Updated: Smaller maximum radius for lakes
const BASE_MAX_LAKES_FACTOR = 1.2; // Updated: Higher factor to reduce max lakes (e.g., rows / 2.0)

const BASE_HEIGHT_FOR_FOREST_SCALING = 40; // For a 40-row map, these are the base values
const BASE_FOREST_SIZE_MIN = 5; // Minimum radius for forests at base height
const BASE_FOREST_SIZE_MAX = 15; // Maximum radius for forests at base height
const BASE_MAX_FOREST_FACTOR = 1; // Max number of forests as a factor of total hexes (at base height)

// Rendering constants
const HEX_SIZE = 20; // Size of each hexagon from center to vertex

// UI Constants
const CLOCK_MARGIN_TOP = 20; // Space from the top of the canvas to the clock
const CLOCK_RADIUS = 30; // Radius of the analog clock circle
const CLOCK_HEIGHT = CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2; // Total vertical space for the clock

// Game Simulation Constants
// Real-world milliseconds that equal one game minute
const MILLISECONDS_PER_GAME_MINUTE = 50; // 50 real ms = 1 game minute (e.g., 1 sec real = 20 game min)
const MILLISECONDS_PER_GAME_HOUR = MILLISECONDS_PER_GAME_MINUTE * 60;


// Movement Costs per hex terrain type for each unit type
// Infinity means impassable
const TERRAIN_MOVEMENT_COSTS = {
    [UnitType.INFANTERY]: { // Infanterie
        [Terrain.FLAT]: 1,
        [Terrain.MOUNTAIN]: 3, 
        [Terrain.HILL]: 2,
        [Terrain.SWAMP]: 2,
        [Terrain.LAKE]: Infinity, // Cannot cross lakes
        [Terrain.FOREST]: 2
    },
    [UnitType.ARTILLERY]: { // Artillerie
        [Terrain.FLAT]: 1.5,
        [Terrain.MOUNTAIN]: Infinity, // Cannot cross mountains
        [Terrain.HILL]: 3,
        [Terrain.SWAMP]: 3, // Cannot cross swamps
        [Terrain.LAKE]: Infinity, // Cannot cross lakes
        [Terrain.FOREST]: 2
    },
    [UnitType.CAVALRY]: { // Cavalerie
        [Terrain.FLAT]: 0.8, // Faster on flat
        [Terrain.MOUNTAIN]: Infinity, // Cannot cross mountains
        [Terrain.HILL]: 1.5,
        [Terrain.SWAMP]: 2, // Slowed by swamps
        [Terrain.LAKE]: Infinity, // Cannot cross lakes
        [Terrain.FOREST]: 1.5 // Slowed by forests
    },
    [UnitType.SUPPLY]: { // Intendance
        [Terrain.FLAT]: 1,
        [Terrain.MOUNTAIN]: Infinity, // Cannot cross mountains
        [Terrain.HILL]: 2,
        [Terrain.SWAMP]: 3,
        [Terrain.LAKE]: Infinity, // Cannot cross lakes
        [Terrain.FOREST]: 2
    },
    [UnitType.SCOUT]: { // Espion - ignores most terrain costs except impassable
        [Terrain.FLAT]: 0.7,
        [Terrain.MOUNTAIN]: 1,
        [Terrain.HILL]: 1,
        [Terrain.SWAMP]: 1,
        [Terrain.LAKE]: Infinity,
        [Terrain.FOREST]: 1
    },
    [UnitType.GENERAL]: { // Nouveau : Général - vitesse environ 10 (similaire infanterie)
        [Terrain.FLAT]: 1, // Légèrement plus lent que l'infanterie sur plat, peut-être?
        [Terrain.MOUNTAIN]: 3,
        [Terrain.HILL]: 2, // Similaire à l'infanterie sur colline
        [Terrain.SWAMP]: 2, // Un peu ralenti par les marais
        [Terrain.LAKE]: Infinity, // Ne peut pas traverser les lacs
        [Terrain.FOREST]: 2 // Un peu ralenti par les forêts
    }
};

// Base movement capability per game hour (number of "movement cost units" covered per game hour)
// Higher values mean faster movement
const UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR = {
    [UnitType.INFANTERY]: 3, // 10 cost units per game hour
    [UnitType.ARTILLERY]: 2,
    [UnitType.CAVALRY]: 5,
    [UnitType.SUPPLY]: 2,
    [UnitType.SCOUT]: 6, // Spy is fastest
    [UnitType.GENERAL]: 4 // Nouveau : Général - Vitesse base (pour atteindre environ 10 de vitesse)
};

/**
 * Calculates the game minutes needed for a unit to move *into* a specific hex.
 * Depends on UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR, TERRAIN_MOVEMENT_COSTS from constants.js.
 * Access global map (implicit via passed map).
 * Returns game minutes, or Infinity if impassable or 0 capability.
 */
function calculateMoveDurationGameMinutes(unitType, terrainType) {
    const movementCost = TERRAIN_MOVEMENT_COSTS[unitType] && TERRAIN_MOVEMENT_COSTS[unitType][terrainType] !== undefined ? TERRAIN_MOVEMENT_COSTS[unitType][terrainType] : Infinity;

    if (movementCost === Infinity || movementCost <= 0) {
        return Infinity; // Cannot enter this hex or zero cost (instantaneous implies issue)
    }

    const baseMovementCapabilityPerHour = UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR[unitType];

    if (baseMovementCapabilityPerHour === undefined || baseMovementCapabilityPerHour <= 0) {
        return Infinity; // Cannot move if capability is zero or undefined
    }

    // Time in game hours = Movement Cost / Capability (Cost Units / Cost Units per Hour)
    const gameHours = movementCost / baseMovementCapabilityPerHour;

    // Time in game minutes = game hours * 60
    const gameMinutes = gameHours * 60;

    return gameMinutes;
}

// Vision Ranges per unit type (distance in hexes)
const VISION_RANGES = {
    [UnitType.ARTILLERY]: { base: 3, hill: 5}, 
    [UnitType.INFANTERY]: { base: 3, hill: 5, mountain: 7 }, 
    [UnitType.CAVALRY]: { base: 3, hill: 5 },
    [UnitType.SUPPLY]: { base: 2 }, // 2 cases
    [UnitType.SCOUT]: { base: 5, hill: 7, mountain: 9 },
    [UnitType.GENERAL]: { base: 5, hill: 9, mountain: 13 } // Nouveau : Général - Portée de vision 2 cases
};

const MAX_RANGE = 4;
// Combat Stats and Ranges per unit type
const UNIT_COMBAT_STATS = {
    [UnitType.ARTILLERY]: { attack: 12, defense: 12, range: { base: 3, hill: MAX_RANGE } }, 
    [UnitType.INFANTERY]: { attack: 7, defense: 7, range: { base: 2, hill: 3, mountain: MAX_RANGE }}, 
    [UnitType.CAVALRY]: { attack: 15, defense: 15, range: { base: 1 } }, // 1 case partout (contact)
    [UnitType.SUPPLY]: { attack: 1, defense: 2, range: { base: 1 } }, // 1 case partout
    [UnitType.SCOUT]: { attack: 1, defense: 1, range: { base: 1 } }, // 1 case partout
    [UnitType.GENERAL]: { attack: 1, defense: 5, range: { base: 2 } } // Nouveau : Général - Attaque 1, Défense 5, Portée 2
};

// Note on Artillery range: The prompt says "7 cases sur une colline et de 4 cases dans tous les autres cas".
// I've updated to align with Infantry vision range including mountain bonus, assuming this was an oversight.
// If Artillery combat range should *only* get a bonus on Hills, revert Artillery range definition to { base: 4, hill: 7 }.

// *** Unit Health Points (HP) ***
const UNIT_HEALTH = {
    [UnitType.ARTILLERY]: 10,
    [UnitType.INFANTERY]: 12,
    [UnitType.CAVALRY]: 15,
    [UnitType.SUPPLY]: 5, // Supply units are very fragile
    [UnitType.SCOUT]: 5, // Spy units are fragile
    [UnitType.GENERAL]: 10 // Nouveau : Général - PV à 10
};
// Combat Damage Scaling Factor
// Multiplier for the damage calculated in combat resolution
const COMBAT_DAMAGE_SCALE = 0.1; // Example: winner's total attack/defense * 0.1 = damage dealt
const COMBAT_RANDOMNESS_FACTOR = 0.4;

// Combat Resolution Interval (in game minutes)
// How often the game loop checks for and resolves combat engagements
const COMBAT_INTERVAL_GAME_MINUTES = 25; // Example: every 10 game minutes
const TRUMPET_INTERVAL_GAME_MINUTES = 500; // Example: every 10 game minutes

// Fog of War Color (used for drawing unseen hexes)
const FOG_COLOR = '#A9A9A9'; // Dark Grey

// Unit Indicator Constants (for drawing army color dot and movement dot)
const UNIT_ARMY_INDICATOR_OFFSET_X = -HEX_SIZE * 0.7; // X offset relative to hex center (left)
const UNIT_ARMY_INDICATOR_OFFSET_Y = -HEX_SIZE * 0.4; // Y offset relative to hex center (top)
const UNIT_ARMY_INDICATOR_RADIUS = HEX_SIZE * 0.2;   // Radius of the army color dot

// *** Color for combat highlight ***
const COMBAT_HIGHLIGHT_COLOR = 'rgba(255, 0, 0, 0.5)'; // Red semi-transparent
const GENERAL_HEX_COLOR = 'rgba(0, 0, 255, 0.5)';

// *** Synchronization Interval ***
let SYNC_INTERVAL_MS = 100; // Sync state every 200 real-world milliseconds

const STARTING_AREA_PERCENT = 0.1;

// Movement Costs per hex for each Unit Type on different Terrains
// Uses a multiplier system: higher number means higher cost (slower movement)
// Infinity means impassable terrain
// Movement Costs per hex for each Unit Type on different Terrains
// Uses a multiplier system: higher number means higher cost (slower movement)
// Infinity means impassable terrain
// Movement Costs per hex for each Unit Type on different Terrains
// Uses a multiplier system: higher number means higher cost (slower movement)
// Infinity means impassable terrain
const MOVEMENT_COSTS = {
    [Terrain.FLAT]: {
        [UnitType.INFANTERY]: TERRAIN_MOVEMENT_COSTS[UnitType.INFANTERY][Terrain.FLAT],
        [UnitType.ARTILLERY]: TERRAIN_MOVEMENT_COSTS[UnitType.ARTILLERY][Terrain.FLAT],
        [UnitType.CAVALRY]: TERRAIN_MOVEMENT_COSTS[UnitType.CAVALRY][Terrain.FLAT],
        [UnitType.SUPPLY]: TERRAIN_MOVEMENT_COSTS[UnitType.SUPPLY][Terrain.FLAT],
        [UnitType.SCOUT]: TERRAIN_MOVEMENT_COSTS[UnitType.SCOUT][Terrain.FLAT],
        [UnitType.GENERAL]: TERRAIN_MOVEMENT_COSTS[UnitType.GENERAL][Terrain.FLAT]
    },
    [Terrain.MOUNTAIN]: {
        [UnitType.INFANTERY]: TERRAIN_MOVEMENT_COSTS[UnitType.INFANTERY][Terrain.MOUNTAIN],
        [UnitType.ARTILLERY]: TERRAIN_MOVEMENT_COSTS[UnitType.ARTILLERY][Terrain.MOUNTAIN],
        [UnitType.CAVALRY]: TERRAIN_MOVEMENT_COSTS[UnitType.CAVALRY][Terrain.MOUNTAIN],
        [UnitType.SUPPLY]: TERRAIN_MOVEMENT_COSTS[UnitType.SUPPLY][Terrain.MOUNTAIN],
        [UnitType.SCOUT]: TERRAIN_MOVEMENT_COSTS[UnitType.SCOUT][Terrain.MOUNTAIN],
        [UnitType.GENERAL]: TERRAIN_MOVEMENT_COSTS[UnitType.GENERAL][Terrain.MOUNTAIN]
    },
    [Terrain.HILL]: {
        [UnitType.INFANTERY]: TERRAIN_MOVEMENT_COSTS[UnitType.INFANTERY][Terrain.HILL],
        [UnitType.ARTILLERY]: TERRAIN_MOVEMENT_COSTS[UnitType.ARTILLERY][Terrain.HILL],
        [UnitType.CAVALRY]: TERRAIN_MOVEMENT_COSTS[UnitType.CAVALRY][Terrain.HILL],
        [UnitType.SUPPLY]: TERRAIN_MOVEMENT_COSTS[UnitType.SUPPLY][Terrain.HILL],
        [UnitType.SCOUT]: TERRAIN_MOVEMENT_COSTS[UnitType.SCOUT][Terrain.HILL],
        [UnitType.GENERAL]: TERRAIN_MOVEMENT_COSTS[UnitType.GENERAL][Terrain.HILL]
    },
    [Terrain.SWAMP]: {
        [UnitType.INFANTERY]: TERRAIN_MOVEMENT_COSTS[UnitType.INFANTERY][Terrain.SWAMP],
        [UnitType.ARTILLERY]: TERRAIN_MOVEMENT_COSTS[UnitType.ARTILLERY][Terrain.SWAMP],
        [UnitType.CAVALRY]: TERRAIN_MOVEMENT_COSTS[UnitType.CAVALRY][Terrain.SWAMP],
        [UnitType.SUPPLY]: TERRAIN_MOVEMENT_COSTS[UnitType.SUPPLY][Terrain.SWAMP],
        [UnitType.SCOUT]: TERRAIN_MOVEMENT_COSTS[UnitType.SCOUT][Terrain.SWAMP],
        [UnitType.GENERAL]: TERRAIN_MOVEMENT_COSTS[UnitType.GENERAL][Terrain.SWAMP]
    },
    [Terrain.LAKE]: {
        [UnitType.INFANTERY]: TERRAIN_MOVEMENT_COSTS[UnitType.INFANTERY][Terrain.LAKE],
        [UnitType.ARTILLERY]: TERRAIN_MOVEMENT_COSTS[UnitType.ARTILLERY][Terrain.LAKE],
        [UnitType.CAVALRY]: TERRAIN_MOVEMENT_COSTS[UnitType.CAVALRY][Terrain.LAKE],
        [UnitType.SUPPLY]: TERRAIN_MOVEMENT_COSTS[UnitType.SUPPLY][Terrain.LAKE],
        [UnitType.SCOUT]: TERRAIN_MOVEMENT_COSTS[UnitType.SCOUT][Terrain.LAKE],
        [UnitType.GENERAL]: TERRAIN_MOVEMENT_COSTS[UnitType.GENERAL][Terrain.LAKE]
    },
    [Terrain.FOREST]: {
        [UnitType.INFANTERY]: TERRAIN_MOVEMENT_COSTS[UnitType.INFANTERY][Terrain.FOREST],
        [UnitType.ARTILLERY]: TERRAIN_MOVEMENT_COSTS[UnitType.ARTILLERY][Terrain.FOREST],
        [UnitType.CAVALRY]: TERRAIN_MOVEMENT_COSTS[UnitType.CAVALRY][Terrain.FOREST],
        [UnitType.SUPPLY]: TERRAIN_MOVEMENT_COSTS[UnitType.SUPPLY][Terrain.FOREST],
        [UnitType.SCOUT]: TERRAIN_MOVEMENT_COSTS[UnitType.SCOUT][Terrain.FOREST],
        [UnitType.GENERAL]: TERRAIN_MOVEMENT_COSTS[UnitType.GENERAL][Terrain.FOREST]
    },
    // Add UNASSIGNED or other temporary states if needed, assuming they are impassable
    [Terrain.UNASSIGNED]: {
        [UnitType.INFANTERY]: Infinity,
        [UnitType.ARTILLERY]: Infinity,
        [UnitType.CAVALRY]: Infinity,
        [UnitType.SUPPLY]: Infinity,
        [UnitType.SCOUT]: Infinity,
        [UnitType.GENERAL]: Infinity
    },
    [HILL_CANDIDATE]: { // Assuming candidate states are also impassable
        [UnitType.INFANTERY]: Infinity,
        [UnitType.ARTILLERY]: Infinity,
        [UnitType.CAVALRY]: Infinity,
        [UnitType.SUPPLY]: Infinity,
        [UnitType.SCOUT]: Infinity,
        [UnitType.GENERAL]: Infinity
    },
    [SWAMP_CANDIDATE]: { // Assuming candidate states are also impassable
        [UnitType.INFANTERY]: Infinity,
        [UnitType.ARTILLERY]: Infinity,
        [UnitType.CAVALRY]: Infinity,
        [UnitType.SUPPLY]: Infinity,
        [UnitType.SCOUT]: Infinity,
        [UnitType.GENERAL]: Infinity
    },
};
// Ensure all UnitTypes are covered for all defined Terrains.
// This is a basic check, more robust validation could be added.
for (const terrainType in MOVEMENT_COSTS) {
    for (const unitType in UnitType) {
        if (UnitType.hasOwnProperty(unitType)) {
            const unitValue = UnitType[unitType];
            if (MOVEMENT_COSTS[terrainType][unitValue] === undefined) {
                console.warn(`Movement cost for Terrain ${terrainType} and UnitType ${unitValue} is undefined in MOVEMENT_COSTS. Defaulting to Infinity.`);
                // Optionally set it to Infinity here
                // MOVEMENT_COSTS[terrainType][unitValue] = Infinity;
            }
        }
    }
}
//--- Version Multijoueur