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
let unitOnId = new Map();
let initialScrollDownForRed = false;
// Ajoutez cette variable globale en haut de votre script, près de unitMovementTimers
const combatTimers = new Map(); // Stocke les timers pour les engagements de combat en cours
const nbUnitCentered = new Map();

// Global variables for double-click detection
let lastClickTime = 0;
let lastClickedHexR = -1;
let lastClickedHexC = -1;
const DOUBLE_CLICK_THRESHOLD = 300; // milliseconds

let audioContext;
let trumpetBuffer;
let musicDefeat;
let musicVictory;
let allUnitInvolvedCombat = new Set();

let messageEndGame = null;

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
let newGameButton = null;

// *** END NEW ***


// *** Variable to track combat hexes for display ***
let combatHexes = new Set(); // Stores "r,c" keys of hexes involved in the current combat

// Store original console functions
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;


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

        // Add this at the beginning of the drawMapAndUnits function, or where you define global variables
        let combatRangeHexes = new Set();

        for (const unit of selectedUnits) {
            // Check if the current unit in the loop belongs to the player's army (or playerArmyColor is null)
            // AND if the unit's hex is visible (checking for row and column existence in visibleHexes)
            // AND if the unit's hex is NOT currently in combat
            if (unit.armyColor === playerArmyColor &&
                visibleHexes[unit.row] &&
                visibleHexes[unit.row][unit.col] &&
                !combatHexes.has(`${unit.row},${unit.col}`)) {

                // Uses utils function, current 'unit' from loop, size from parameter
                const { x: selectedX, y: selectedY } = getHexCenter(unit.row, unit.col, size);

                ctx.fillStyle = 'rgba(255, 255, 0, 0.5)'; // Semi-transparent yellow highlight

                // Uses drawing function
                drawHex(ctx, selectedX, selectedY, size, ctx.fillStyle);

                // --- NEW: Draw reachable hexes for selected unit ---
                // Ensure UNIT_COMBAT_STATS is accessible globally or passed as argument
                if (typeof UNIT_COMBAT_STATS !== 'undefined') {
                    const unitCombatRange = getEffectiveCombatRange(unit, UNIT_COMBAT_STATS);
                    const reachableHexes = getHexesInRange(unit.row, unit.col, unitCombatRange);

                    // Add reachable hexes to the set
                    reachableHexes.forEach(hex => {
                        const [r, c] = hex;
                        // Only add to combatRangeHexes if it's visible and not already in combatHexes
                        if (visibleHexes[r] && visibleHexes[r][c] && !combatHexes.has(`${r},${c}`)) {
                            combatRangeHexes.add(`${r},${c}`);
                        }
                    });
                }
                // --- END NEW ---
            }
        }
        // --- NEW: Draw the combat range indication for all selected units ---
        // After iterating through all selected units and populating combatRangeHexes
        combatRangeHexes.forEach(hexKey => {
            const [r, c] = hexKey.split(',').map(Number);
            if (visibleHexes[r] && visibleHexes[r][c]) { // Ensure it's still visible
                const { x, y } = getHexCenter(r, c, size);
                const dotRadius = size * 0.1; // Small dot in the center of the hex

                ctx.fillStyle = 'rgba(0, 255, 255, 0.6)'; // Semi-transparent cyan color for range indication
                ctx.beginPath();
                ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        // --- END NEW ---
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

    if (!initialScrollDownForRed && playerArmyColor == ARMY_COLOR_RED) {
        initialScrollDownForRed = true;
        window.scrollTo(0, document.body.scrollHeight);
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
// Depends on drawMapAndUnits, updateVisibility from this file.
// Accesses global canvas, ctx, map, currentMapRows, currentMapCols, currentUnits, gameTimeInMinutes, lastCombatGameTimeInMinutes, playerArmyColor, ws.
// Uses originalConsoleLog, originalConsoleError.
// Accesses mapHeightSelect, unit type count inputs.
// Calls createInitialUnits, drawMapAndUnits, updateVisibility, startSyncInterval.
// ============================================================================
/**
 * Reads desired map dimensions from UI, generates a new map, places units, and redraws.
 * This function is triggered by UI changes (like map height select or regenerate button)
 * OR by the Start button click for the Blue player in multiplayer.
 * In multiplayer (playerArmyColor is set), this only generates/sends state for Blue.
 * Depends on calculateMapDimensions, generateMap from mapGeneration.js.
 * Depends on createInitialUnits, unitIdCounter (global counter) from unitManagement.js.
 * Depends on HEX_SIZE, TerrainColors, UnitType, ARMY_COLOR_BLUE, ARMY_COLOR_RED from constants.js.
 * Depends on drawMapAndUnits, updateVisibility from this file.
 * Accesses global canvas, ctx, map, currentMapRows, currentMapCols, currentUnits, gameTimeInMinutes, lastCombatGameTimeInMinutes, playerArmyColor, ws.
 * Uses originalConsoleLog, originalConsoleError.
 * Accesses mapHeightSelect, unit type count inputs.
 * Calls createInitialUnits, drawMapAndUnits, updateVisibility, startSyncInterval.
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
    const canvasWidth = (currentMapCols + currentMapCols/6) * HEX_SIZE * 1.5 + HEX_SIZE * 0.5; // Hex grid width calculation
    const canvasHeight = (currentMapRows + currentMapRows/7) * HEX_SIZE * Math.sqrt(3) * 0.75 + HEX_SIZE * Math.sqrt(3) * 0.25 + CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2 + 20; // Height including clock and padding

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

    unitCounts[UnitType.SCOUT] = spyInput ? parseInt(spyInput.value) || 0 : 0;
    unitCounts[UnitType.CAVALRY] = cavalryInput ? parseInt(cavalryInput.value) || 0 : 0;
    unitCounts[UnitType.INFANTERY] = infantryInput ? parseInt(infantryInput.value) || 0 : 0;
    unitCounts[UnitType.ARTILLERY] = artilleryInput ? parseInt(artilleryInput.value) || 0 : 0;
    unitCounts[UnitType.SUPPLY] = supplyInput ? parseInt(supplyInput.value) || 0 : 0;

    unitCounts[UnitType.GENERAL] = 1;

    // Reset the unit ID counter for a new game (Defined in unitManagement.js)
    unitIdCounter = 0; // Ensure unitIdCounter is accessible here or reset in unitManagement.js function


    currentUnits = createInitialUnits(map, currentMapRows, currentMapCols, unitCounts); // Uses unitManagement function
    unitOnId.clear();
    currentUnits.forEach(unit => {unitOnId.set(unit.id, unit);});

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
            // Assuming VISION_RANGES structure has hill or mountain for these types
            if (terrainAtUnitHex === Terrain.HILL) { // Uses constants
                // Check if hill_mountain range is defined, otherwise use base
                visionRange = VISION_RANGES[unitType]?.hill !== undefined ? VISION_RANGES[unitType].hill : visionRange;
            }
            if (terrainAtUnitHex === Terrain.MOUNTAIN) { // Uses constants
                // Check if hill_mountain range is defined, otherwise use base
                visionRange = VISION_RANGES[unitType]?.mountain !== undefined ? VISION_RANGES[unitType].mountain : visionRange;
            }

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

// ============================================================================
// Game Loop and Time Management
// This is where movement is now processed incrementally each tick.
// ============================================================================

/**
 * Clears an unit's movement state and stops its movement timer.
 * @param {object} unit - The unit to clear.
 */
function stopUnitMovement(unit) {
    movedHexUnit.delete(unit); // Remove from loop detection list
    unit.targetRow = null;
    unit.targetCol = null;
    unit.movementProgress = 0; // Reset progress
    unit.previousRow = unit.row;
    unit.previousCol = unit.col;
    if (unitMovementTimers.has(unit.id)) {
        clearTimeout(unitMovementTimers.get(unit.id));
        unitMovementTimers.delete(unit.id);
    }
}

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
        stopUnitMovement(unit);
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
        const currentHexKey = `${neighborR},${neighborC}`;
        if (movedHexUnit.has(unit) && movedHexUnit.get(unit).has(currentHexKey)) {
            let visitCount = movedHexUnit.get(unit).get(currentHexKey);
            if (visitCount > 7) {
                viableNeighbors = [];
                break;
            }
            visitCount++;
            movedHexUnit.get(unit).set(currentHexKey, visitCount);            
            if (visitCount > 4)
                continue;
        }

        const neighborTerrain = map[neighborR][neighborC];
        const gameMinutesNeededForStep = calculateMoveDurationGameMinutes(unit.type, neighborTerrain);

        if (gameMinutesNeededForStep === Infinity) continue;

        const unitAtNeighbor = getUnitAt(neighborR, neighborC, validLivingCurrentUnits, "moveUnitStep - movement blocking check neighbor");
        const isOccupied = (unitAtNeighbor !== null && unitAtNeighbor.id !== unit.id);

        if (isOccupied) continue;

        if (neighborR == targetR && neighborC == targetC) {
            viableNeighbors = [{ r: neighborR, c: neighborC, gameMinutesCost: gameMinutesNeededForStep }];
            break;
        }

        viableNeighbors.push({ r: neighborR, c: neighborC, gameMinutesCost: gameMinutesNeededForStep });
    }

    if (viableNeighbors.length === 0) {
        stopUnitMovement(unit);
        return; // Unité bloquée, arrêter le mouvement
    }

    let onlyPreviousHexIsViable = viableNeighbors.length === 1 && viableNeighbors[0].r === unit.previousRow && viableNeighbors[0].c === unit.previousCol;

    for (const neighbor of viableNeighbors) {
        const { r: neighborR, c: neighborC, gameMinutesCost: gameMinutesNeededForStep } = neighbor;
        const targetDistance = getHexDistance(neighborR, neighborC, targetR, targetC);

        const currentHexKey = `${neighborR},${neighborC}`;
        let penaltyVisit = 0;
        if (movedHexUnit.has(unit) && movedHexUnit.get(unit).has(currentHexKey))
            penaltyVisit = movedHexUnit.get(unit).get(currentHexKey) * 20;

        let previousHexPenalty = 0;
        if (neighborR === unit.previousRow && neighborC === unit.previousCol && !onlyPreviousHexIsViable) {
            previousHexPenalty = 60 * 5;
        }

        // Garder le facteur aléatoire pour la cohérence des tests locaux, mais
        // noter le risque de désynchro sans un PRNG avec seed synchronisée pour le multijoueur.
        const randomFactor = (Math.random() * 0.01) - 0.005;

        const combinedMetric = targetDistance * 1000 + (gameMinutesNeededForStep + previousHexPenalty) + randomFactor + penaltyVisit;

        if (neighborR == targetR && neighborC == targetC) {
            minCombinedMetric = combinedMetric;
            bestNextHex = { r: neighborR, c: neighborC, gameMinutesCost: gameMinutesNeededForStep };
            break;
        }

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

        const currentHexKey = `${nextR},${nextC}`;
        // Mise à jour de movedHexUnit pour la détection de boucle
        if (!movedHexUnit.has(unit)) {
            const hexVisits = new Map();
            hexVisits.set(currentHexKey, 1);
            movedHexUnit.set(unit, hexVisits);
        } else {
            const unitHexVisits = movedHexUnit.get(unit);
            if (unitHexVisits.has(currentHexKey)) {
                let visitCount = unitHexVisits.get(currentHexKey);
                visitCount++;
                unitHexVisits.set(currentHexKey, visitCount);
            }
            else
                unitHexVisits.set(currentHexKey, 1);

        }
        
        // Mise à jour de la visibilité car l'unité a bougé
        // Note: updateVisibility() devrait être appelé une seule fois par tick globalement,
        // mais pour l'instant, nous le mettons ici pour réactivité si une unité individuelle bouge.
        // Une meilleure approche serait de stocker un drapeau global 'movedThisTick' et de l'appeler à la fin de gameLoop.
        updateVisibility();

        // Si l'unité est arrivée à destination après ce pas
        if (unit.row === targetR && unit.col === targetC) {
            stopUnitMovement(unit);
            return; // L'unité est arrivée
        }

        // L'unité doit continuer à bouger : démarrer le timer pour le prochain pas
        const realTimeForNextStep = gameMinutesNeededForStep * MILLISECONDS_PER_GAME_MINUTE;
        const timerId = setTimeout(() => moveUnitStep(unit), realTimeForNextStep);
        unitMovementTimers.set(unit.id, timerId);
        //originalConsoleLog(`[moveUnitStep] Unit ID ${unit.id} moved to (${unit.row}, ${unit.col}). Next step in ${realTimeForNextStep.toFixed(0)} ms.`);
    } else {
        stopUnitMovement(unit);
        // Fallback si aucun meilleur hexagone n'est trouvé (ne devrait pas arriver si viableNeighbors n'est pas vide)
    }
}

/**
 * Résout une seule étape/tick d'un engagement de combat entre deux groupes d'unités.
 * Cette fonction est appelée par un timer et se reprogrammera si le combat continue.
 * @param {string} combatId - Un identifiant unique pour cet engagement de combat spécifique.
 * @param {Array<object>} initialAttackerUnits - La liste initiale des unités considérées comme attaquantes pour cet engagement.
 * @param {Array<object>} initialDefenderUnits - La liste initiale des unités considérées comme défenseurs pour cet engagement.
 */
async function resolveCombatEngagement(combatId, initialAttackerUnits, initialDefenderUnits) {
    // Filtrer les unités qui pourraient avoir été éliminées depuis le dernier tick de combat ou qui ne sont plus valides.
    let livingAttackerUnits = initialAttackerUnits.filter(u => u && u.health > 0);
    let livingDefenderUnits = initialDefenderUnits.filter(u => u && u.health > 0);

    // Si un côté n'a plus d'unités vivantes, le combat se termine.
    if (livingAttackerUnits.length === 0 || livingDefenderUnits.length === 0) {
        originalConsoleLog(`[resolveCombatEngagement] Combat ID ${combatId} terminé : un côté éliminé.`);
        if (combatTimers.has(combatId)) {
            clearTimeout(combatTimers.get(combatId));
            combatTimers.delete(combatId);
        }
        return;
    }

    // Déterminer l'attaquant et le défenseur réels en se basant sur la logique originale (par exemple, camp Bleu vs camp Rouge ou position initiale de l'unité).
    // Ceci suppose que nous avons un moyen de définir qui est "attaquant" et qui est "défenseur" pour le résultat du combat.
    // La fonction `evaluateAttackDefense` gère déjà cela en prenant deux groupes.

    const stats = evaluateAttackDefense(livingAttackerUnits, livingDefenderUnits);

    // Si aucune unité n'est activement engagée, le combat se termine.
    if (stats.defenseInBattle.size === 0 && stats.attackInBattle.size === 0) {
        originalConsoleLog(`[resolveCombatEngagement] Combat ID ${combatId} terminé : plus d'unités à portée.`);
        if (combatTimers.has(combatId)) {
            clearTimeout(combatTimers.get(combatId));
            combatTimers.delete(combatId);
        }
        return;
    }

    const totalAttackerAttack = stats.totalStatAttacker;
    const totalDefenderDefense = stats.totalStatDefender;

    originalConsoleLog(`[resolveCombatEngagement] Combat ID ${combatId}: Stats agrégées : Attaque totale de l'attaquant = ${totalAttackerAttack.toFixed(2)}, Défense totale du défenseur = ${totalDefenderDefense.toFixed(2)}.`);

    const combatResult = resolveCombat(totalAttackerAttack, totalDefenderDefense);
    originalConsoleLog(`[resolveCombatEngagement] Combat ID ${combatId}: Résultat du combat : ${combatResult.outcome}. Dégâts : ${combatResult.damage.toFixed(2)}. Cible : ${combatResult.targetSide}.`);

    // Trouvez une unité représentative pour l'affichage du message (par exemple, la première unité de chaque côté)
    const firstAttackerUnit = Array.from(livingAttackerUnits)[0];
    const firstEnemyUnitInContactUnit = Array.from(livingDefenderUnits)[0];


    let unitsEliminatedThisCombatInstance = [];
    if (combatResult.damage > 0) {
        if (combatResult.targetSide === 'defender' || combatResult.targetSide === 'both') {
            originalConsoleLog(`[resolveCombatEngagement] Appliquer ${combatResult.damage.toFixed(2)} dégâts aux unités du camp Défenseur.`);
            const eliminatedDefender = distributeDamage(stats.defenseInBattle, combatResult.damage);
            unitsEliminatedThisCombatInstance.push(...eliminatedDefender);
        }
        if (combatResult.targetSide === 'attacker' || combatResult.targetSide === 'both') {
            originalConsoleLog(`[resolveCombatEngagement] Appliquer ${combatResult.damage.toFixed(2)} dégâts aux unités du camp Attaquant.`);
            const eliminatedAttacker = distributeDamage(stats.attackInBattle, combatResult.damage);
            unitsEliminatedThisCombatInstance.push(...eliminatedAttacker);
        }
    }

    // Vérifier l'élimination du Général
    if (!gameOver && unitsEliminatedThisCombatInstance.length > 0) {
        const eliminatedGeneral = unitsEliminatedThisCombatInstance.find(unit => unit && unit.type === UnitType.GENERAL);

        if (eliminatedGeneral) {
            originalConsoleLog(`[resolveCombatEngagement] Général éliminé pendant le combat ! ID de l'unité : ${eliminatedGeneral.id}, Armée : ${eliminatedGeneral.armyColor === ARMY_COLOR_BLUE ? 'Bleue' : 'Rouge'}`);

            if (eliminatedGeneral.armyColor === ARMY_COLOR_BLUE) {
                if (playerArmyColor === ARMY_COLOR_BLUE)
                    console.log("Le Général Bleu a été éliminé ! Vous avez perdu.");
                else
                    console.log("Le Général Bleu a été éliminé ! Vous avez gagné.");
                endGame(ARMY_COLOR_RED);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'GAME_OVER', outcome: 'red' }));
                }
            } else if (eliminatedGeneral.armyColor === ARMY_COLOR_RED) {
                if (playerArmyColor === ARMY_COLOR_RED)
                    console.log("Le Général Rouge a été éliminé ! Vous avez perdu.");
                else
                    console.log("Le Général Rouge a été éliminé ! Vous avez gagné.");
                endGame(ARMY_COLOR_BLUE);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'GAME_OVER', outcome: 'blue' }));
                }
            }
            // Jeu terminé, annuler ce timer de combat
            if (combatTimers.has(combatId)) {
                clearTimeout(combatTimers.get(combatId));
                combatTimers.delete(combatId);
            }
            return;
        }
    }

    // Filtrer la liste principale currentUnits pour supprimer les unités dont la santé est maintenant <= 0
    // Cela se produit APRÈS la vérification de l'élimination du Général dans cette instance
    const unitsBeforeFilter = currentUnits.length;
    unitOnId.clear(); // Effacer et reconstruire la map unitOnId
    currentUnits = currentUnits.filter(unit => unit && unit.health > 0 && unitOnId.set(unit.id, unit));

    if (unitsBeforeFilter !== currentUnits.length) {
        originalConsoleLog(`[resolveCombatEngagement] Éliminé ${unitsBeforeFilter - currentUnits.length} unités localement après l'instance de combat. Total restant : ${currentUnits.length}.`);
    }

    // Envoyer les résultats du combat au serveur/Rouge
    const affectedUnits = new Set([...Array.from(stats.attackInBattle), ...Array.from(stats.defenseInBattle)]);
    const combatUpdate = {
        type: 'COMBAT_RESULT',
        updatedUnits: Array.from(affectedUnits).filter(u => u && u.health > 0).map(unit => ({
            id: unit.id,
            health: unit.health,
            row: unit.row,
            col: unit.col
        })),
        eliminatedUnitIds: unitsEliminatedThisCombatInstance.map(u => u.id)
    };

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(combatUpdate));
    } else {
        console.warn("Connexion au serveur non établie. Résultats du combat non synchronisés.");
    }

    // Re-vérifier si le combat doit continuer (c'est-à-dire si les deux camps ont encore des unités à portée)
    // Nous devons re-filtrer `currentUnits` car certaines pourraient avoir été éliminées.
    const allLivingUnits = currentUnits.filter(u => u && u.health > 0);
    const stillLivingAttackers = allLivingUnits.filter(u => initialAttackerUnits.some(au => au.id === u.id));
    const stillLivingDefenders = allLivingUnits.filter(u => initialDefenderUnits.some(du => du.id === u.id));

    // Fonction d'aide pour vérifier si une unité est à portée de toute unité de l'armée adverse dans cet engagement
    const isInRangeOfOpponent = (unit, opposingUnits) => {
        const unitRange = getEffectiveCombatRange(unit, UNIT_COMBAT_STATS);
        for (const opponent of opposingUnits) {
            if (getHexDistance(unit.row, unit.col, opponent.row, opponent.col) <= unitRange) {
                return true;
            }
        }
        return false;
    };

    // Vérifier s'il y a encore des unités des deux côtés qui sont à portée l'une de l'autre
    let combatStillActive = false;
    if (stillLivingAttackers.length > 0 && stillLivingDefenders.length > 0) {
        for (const attacker of stillLivingAttackers) {
            if (isInRangeOfOpponent(attacker, stillLivingDefenders)) {
                combatStillActive = true;
                break;
            }
        }
        if (!combatStillActive) { // Si les attaquants ne peuvent pas atteindre les défenseurs, vérifier si les défenseurs peuvent atteindre les attaquants
             for (const defender of stillLivingDefenders) {
                if (isInRangeOfOpponent(defender, stillLivingAttackers)) {
                    combatStillActive = true;
                    break;
                }
            }
        }
    }

    if (combatStillActive && !gameOver) { // Ne reprogrammer que si le jeu n'est pas terminé
        originalConsoleLog(`[resolveCombatEngagement] Combat ID ${combatId} continue. Reprogrammation du prochain tick.`);
        const realTimeForNextCombatTick = COMBAT_INTERVAL_GAME_MINUTES * MILLISECONDS_PER_GAME_MINUTE;
        const timerId = setTimeout(() => resolveCombatEngagement(combatId, stillLivingAttackers, stillLivingDefenders), realTimeForNextCombatTick);
        combatTimers.set(combatId, timerId);
    } else {
        originalConsoleLog(`[resolveCombatEngagement] Combat ID ${combatId} terminé.`);
        if (combatTimers.has(combatId)) {
            clearTimeout(combatTimers.get(combatId));
            combatTimers.delete(combatId);
        }
        updateVisibility();
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
        // --- Combat Time Tracking and Resolution ---
        // This section runs ONLY on the Blue client, as it is the combat authority.
        // Only process combat if the game is NOT over
        if (gameTimeInMinutes >= lastCombatGameTimeInMinutes + COMBAT_INTERVAL_GAME_MINUTES) {
            originalConsoleLog(`[gameLoop] ${COMBAT_INTERVAL_GAME_MINUTES} game minutes elapsed. Initiating combat detection (Blue Client).`);

            // Effacer les précédents surlignages de combat au début d'un nouvel intervalle de détection
            combatHexes.clear();
            allUnitInvolvedCombat.clear(); // Effacer le set global pour le nouveau cycle de détection

            lastCombatGameTimeInMinutes = gameTimeInMinutes; // Mettre à jour la dernière heure de combat *avant* de résoudre le combat

            const lesBleus = currentUnits.filter(u => u && u.health > 0 && u.armyColor === ARMY_COLOR_BLUE);
            const lesRouges = currentUnits.filter(u => u && u.health > 0 && u.armyColor === ARMY_COLOR_RED);

            // Garder une trace des unités déjà assignées à un engagement de combat dans ce cycle de détection
            const unitsAlreadyInEngagement = new Set();
            let newCombatDetectedThisCycle = false;

            if (lesBleus.length > 0 && lesRouges.length > 0) {
                // Itérer sur toutes les unités Bleues vivantes pour vérifier les engagements
                lesBleus.forEach(unitBlue => {
                    if (unitBlue.health <= 0 || unitsAlreadyInEngagement.has(unitBlue.id)) return;

                    let potentialAttackerUnits = new Set();
                    let potentialDefenderUnits = new Set();
                    let firstEnemyUnitInContact = null;
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
                        const rangeBlue = getEffectiveCombatRange(unitBlue, UNIT_COMBAT_STATS);
                        lesRouges.forEach(unitRed => {
                            if (unitRed !== null && unitRed !== undefined && unitRed.health > 0) {
                                const dst = getHexDistance(unitBlue.row, unitBlue.col, unitRed.row, unitRed.col);
                                //Unit B is in range, we keep it
                                if (dst <= rangeBlue) {
                                    potentialDefenderUnits.add(unitRed);
                                    potentialAttackerUnits.add(unitBlue);
                                    if (firstEnemyUnitInContact == null) {
                                        firstEnemyUnitInContact = unitRed;
                                    }
                                }
                                else {
                                    //We still check if our unit is threatened by unitRed
                                    const rangeRed = getEffectiveCombatRange(unitRed, UNIT_COMBAT_STATS);
                                    if (dst <= rangeRed) {
                                        potentialDefenderUnits.add(unitRed);
                                        potentialAttackerUnits.add(unitBlue);
                                        if (firstEnemyUnitInContact == null) {
                                            firstEnemyUnitInContact = unitRed;
                                        }
                                    }
                                }
                            }
                        });
                    });

                    //No threat to this unit
                    if (potentialDefenderUnits.size == 0) {                        
                        return;
                    }
                    
                    //We then check for these potential targets, if there other units involved
                    let loopunit = true;
                    let newDefenders = potentialDefenderUnits;
                    while (loopunit) {           
                        let newAttackers = new Set();             
                        newDefenders.forEach(unitRed => {
                            const rangeRed = getEffectiveCombatRange(unitRed, UNIT_COMBAT_STATS);
                            lesBleus.forEach(unitBlue => {
                                const unitStillExistsAndAlive = (unitBlue !== null && unitBlue !== undefined && unitBlue.health > 0);
                                if (unitStillExistsAndAlive && !potentialAttackerUnits.has(unitBlue)) {
                                    const dst = getHexDistance(unitBlue.row, unitBlue.col, unitRed.row, unitRed.col);
                                    //The unit is in range, we keep it
                                    if (dst <= rangeRed) {
                                        potentialAttackerUnits.add(unitBlue);
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
                                const rangeBlue = getEffectiveCombatRange(unitBlue, UNIT_COMBAT_STATS);
                                lesRouges.forEach(unitRed => {
                                    const unitStillExistsAndAlive = (unitRed !== null && unitRed !== undefined && unitRed.health > 0);
                                    if (unitStillExistsAndAlive && !potentialDefenderUnits.has(unitRed)) {
                                        const dst = getHexDistance(unitBlue.row, unitBlue.col, unitRed.row, unitRed.col);
                                        //The unit is in range, we keep it
                                        if (dst <= rangeBlue) {
                                            potentialDefenderUnits.add(unitRed);
                                            newDefenders.add(unitRed);
                                        }
                                    }
                                });
                            });
                        }
                        if (!newDefenders)
                            loopunit = false;
                    }
                  
                    if (potentialAttackerUnits.size === 0) {
                        return; // Pas de contact pour cette unité Bleue
                    }


                    // À ce stade, potentialAttackerUnits et potentialDefenderUnits contiennent toutes les unités dans cet engagement distinct.
                    // Créer un ID de combat unique pour cet engagement. Une façon simple est d'utiliser les IDs des unités impliquées, triés.
                    const allInvolvedIds = [...Array.from(potentialAttackerUnits).map(u => u.id), ...Array.from(potentialDefenderUnits).map(u => u.id)].sort().join('-');
                    const combatId = `combat-${allInvolvedIds}`;

                    // Si cet engagement de combat n'est pas déjà actif, démarrer son timer
                    if (!combatTimers.has(combatId)) {
                        originalConsoleLog(`[gameLoop] Nouvel engagement de combat détecté : ${combatId}. Initialisation du premier tick.`);
                        newCombatDetectedThisCycle = true;
                        playTrumpetSound(); // Jouer le son uniquement pour les nouveaux engagements
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'PLAY_SOUND' }));
                        }

                        // Marquer les unités comme impliquées afin qu'elles ne fassent pas partie d'un autre nouvel engagement dans ce cycle
                        Array.from(potentialAttackerUnits).forEach(u => unitsAlreadyInEngagement.add(u.id));
                        Array.from(potentialDefenderUnits).forEach(u => unitsAlreadyInEngagement.add(u.id));

                        // Ajouter les hexagones à combatHexes pour le surlignage
                        Array.from(potentialAttackerUnits).forEach(unit => {
                            combatHexes.add(`${unit.row},${unit.col}`);
                        });
                        Array.from(potentialDefenderUnits).forEach(unit => {
                            combatHexes.add(`${unit.row},${unit.col}`);
                        });

                        // Déterminer l'attaquant et le défenseur réels pour la fonction resolveCombatEngagement
                        // en se basant sur la logique originale (par exemple, position du camp).
                        let actualAttackerUnits = Array.from(potentialAttackerUnits);
                        let actualDefenderUnits = Array.from(potentialDefenderUnits);

                        // Si les rouges sont dans le camp bleu, les rouges sont alors l'attaquant...
                        if (firstEnemyUnitInContact && firstEnemyUnitInContact.row < currentMapRows / 2) {
                            actualAttackerUnits = Array.from(potentialDefenderUnits);
                            actualDefenderUnits = Array.from(potentialAttackerUnits);
                        }

                        // Démarrer le premier tick de cet engagement de combat
                        const realTimeForNextCombatTick = COMBAT_INTERVAL_GAME_MINUTES * MILLISECONDS_PER_GAME_MINUTE;
                        const timerId = setTimeout(() => resolveCombatEngagement(combatId, actualAttackerUnits, actualDefenderUnits), realTimeForNextCombatTick);
                        combatTimers.set(combatId, timerId);
                    } else {
                        // Si le combat est déjà en cours, assurez-vous simplement que ses hexagones sont surlignés pour ce tick
                        Array.from(potentialAttackerUnits).forEach(unit => {
                            combatHexes.add(`${unit.row},${unit.col}`);
                        });
                        Array.from(potentialDefenderUnits).forEach(unit => {
                            combatHexes.add(`${unit.row},${unit.col}`);
                        });
                    }
                });
            }

            // Si aucun nouveau combat n'a été détecté dans ce cycle, effacer le global allUnitInvolvedCombat (utilisé pour le son)
            if (!newCombatDetectedThisCycle) {
                allUnitInvolvedCombat.clear();
            }
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
    unitOnId.clear();
    currentUnits.forEach(unit => {unitOnId.set(unit.id, unit);});

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
        const canvasWidth = (currentMapCols + currentMapCols/6) * HEX_SIZE * 1.5 + HEX_SIZE * 0.5;
        const canvasHeight = (currentMapRows + currentMapRows/7) * HEX_SIZE * Math.sqrt(3) * 0.75 + HEX_SIZE * Math.sqrt(3) * 0.25 + CLOCK_MARGIN_TOP + CLOCK_RADIUS * 2 + 20;
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
    
    updateNewGameButtonVisibility();
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

    updateNewGameButtonVisibility();
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
    console.log("- Scout units have a large vision range and ignore terrain costs.");
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
    startButton = document.getElementById('startButton'); // *** NEW : Get Start button ***
    newGameButton = document.getElementById('newGameButton');

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

    if (newGameButton) {
        newGameButton.style.display = 'none';
        originalConsoleLog("[DOMContentLoaded] newGameButton button element found and hidden.");
    } else {
        originalConsoleWarn("[DOMContentLoaded] newGameButton button element not found.");
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

        // *** NEW : Get reference to the new game button and add event listener ***
        
        if (newGameButton) {
            newGameButton.addEventListener('click', () => {
                originalConsoleLog("[newGameButton] New Game button clicked. Reloading page...");
                window.location.reload(); // Recharge la page
            });
            originalConsoleLog("[DOMContentLoaded] New Game button event listener attached.");
        } else {
            originalConsoleWarn("[DOMContentLoaded] New Game button not found.");
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

// *** NEW : Fonction pour mettre à jour la visibilité du bouton "Nouvelle Partie" ***
/**
 * Updates the visibility of the new game button based on the gameOver state.
 */
function updateNewGameButtonVisibility() {
if (newGameButton) {
        newGameButton.style.display = 'inline-block'; // Affiche le bouton
        originalConsoleLog("[updateNewGameButtonVisibility] New Game button displayed.");
    } else {
        newGameButton.style.display = 'none'; // Cache le bouton
        originalConsoleLog("[updateNewGameButtonVisibility] New Game button hidden.");
    }
}
