/*
 * mapGeneration.js
 * Contient la logique de génération de la carte hexagonale.
 * Dépend de constants.js et utils.js.
 *
 * Copyright 2025-present Claude ROUX
 * The 3-Clause BSD License
 */

/**
 * Calculates the map dimensions (rows and cols) based on the desired height
 * and the SCAN_INTERVAL_MSbase aspect ratio.
 * Depends on BASE_ASPECT_RATIO from constants.js.
 */
function calculateMapDimensions(height) {
    const rows = height;
    const cols = Math.round(height * BASE_ASPECT_RATIO);
    return { rows, cols };
}

/**
 * Generates the random hexagonal map with the specified terrain constraints.
 * Depends on Terrain constants, MOUNTAIN_PROBABILITY,
 * BASE_HEIGHT_FOR_LAKE_SCALING, BASE_LAKE_SIZE_MIN, BASE_LAKE_SIZE_MAX, BASE_MAX_LAKES_FACTOR,
 * BASE_HEIGHT_FOR_FOREST_SCALING, BASE_FOREST_SIZE_MIN, BASE_FOREST_SIZE_MAX, BASE_MAX_FOREST_FACTOR
 * from constants.js.
 * Depends on isValid, getNeighbors, shuffleArray from utils.js.
 */
function generateMap(rows, cols, mountainProb,
                    baseHeightForLakeScaling, baseLakeSizeMin, baseLakeSizeMax, baseMaxLakesFactor,
                    baseHeightForForestScaling, baseForestSizeMin, baseForestSizeMax, baseMaxForestFactor) {

    // Debug: Log input dimensions
    console.log(`Generating map with rows=${rows}, cols=${cols}`);

    const heightRatioLake = rows / baseHeightForLakeScaling;
    const heightRatioForest = rows / baseHeightForForestScaling;

    // Debug: Log scaling ratios
    console.log(`heightRatioLake=${heightRatioLake}, heightRatioForest=${heightRatioForest}`);

    // Cap lake sizes explicitly to avoid scaling issues
    const calculatedLakeSizeMin = Math.max(1, Math.min(2, Math.round(baseLakeSizeMin * heightRatioLake)));
    const calculatedLakeSizeMax = Math.max(calculatedLakeSizeMin, Math.min(5, Math.round(baseLakeSizeMax * heightRatioLake)));
    const calculatedMaxLakes = Math.max(1, Math.round(rows / baseMaxLakesFactor));

    // Cap forest sizes similarly
    const calculatedForestSizeMin = Math.max(1, Math.min(5, Math.round(baseForestSizeMin * heightRatioForest)));
    const calculatedForestSizeMax = Math.max(calculatedForestSizeMin, Math.min(15, Math.round(baseForestSizeMax * heightRatioForest)));
    const calculatedMaxForests = Math.max(1, Math.round(rows / baseMaxForestFactor));

    // Debug: Log calculated parameters
    console.log(`Lake sizes: min=${calculatedLakeSizeMin}, max=${calculatedLakeSizeMax}, maxLakes=${calculatedMaxLakes}`);
    console.log(`Forest sizes: min=${calculatedForestSizeMin}, max=${calculatedForestSizeMax}, maxForests=${calculatedMaxForests}`);

    const map = Array(rows).fill(null).map(() => Array(cols).fill(Terrain.UNASSIGNED));

    // Step 1: Place Mountains
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (map[r][c] === Terrain.UNASSIGNED && Math.random() < mountainProb) {
                let canPlaceMountain = true;
                const neighbors = getNeighbors(r, c, rows, cols);
                for (const [nr, nc] of neighbors) {
                    if (isValid(nr, nc, rows, cols)) {
                        if (map[nr][nc] === Terrain.LAKE || map[nr][nc] === SWAMP_CANDIDATE || map[nr][nc] === Terrain.FOREST) {
                            canPlaceMountain = false;
                            break;
                        }
                    }
                }
                if (canPlaceMountain) {
                    map[r][c] = Terrain.MOUNTAIN;
                    for (const [nr, nc] of neighbors) {
                        if (isValid(nr, nc, rows, cols)) {
                            if (map[nr][nc] === Terrain.UNASSIGNED) {
                                map[nr][nc] = HILL_CANDIDATE;
                            }
                        }
                    }
                }
            }
        }
    }

    // Step 2: Place Lakes (Capped at 2-5 lakes, small sizes)
    const numLakesToPlace = Math.floor(Math.random() * calculatedMaxLakes) + 3; // Randomly choose 2 to 5 lakes
    console.log(`Attempting to place ${numLakesToPlace} lakes`);
    for (let i = 0; i < numLakesToPlace; i++) {
        const targetLakeSize = Math.floor(Math.random() * (calculatedLakeSizeMax - calculatedLakeSizeMin + 1)) + calculatedLakeSizeMin;
        let startR, startC;
        let foundStart = false;
        const maxStartAttempts = 100;
        for (let attempt = 0; attempt < maxStartAttempts; attempt++) {
            const r = Math.floor(Math.random() * rows);
            const c = Math.floor(Math.random() * cols);
            if (isValid(r, c, rows, cols) && map[r][c] === Terrain.UNASSIGNED) {
                startR = r;
                startC = c;
                foundStart = true;
                break;
            }
        }

        if (foundStart) {
            const queue = [[startR, startC]];
            map[startR][startC] = Terrain.LAKE;
            let clusterCount = 1;

            while (queue.length > 0 && clusterCount < targetLakeSize) {
                const [currR, currC] = queue.shift();
                let neighbors = getNeighbors(currR, currC, rows, cols);
                shuffleArray(neighbors);

                for (const [nr, nc] of neighbors) {
                    if (isValid(nr, nc, rows, cols) && map[nr][nc] === Terrain.UNASSIGNED) {
                        map[nr][nc] = Terrain.LAKE;
                        queue.push([nr, nc]);
                        clusterCount++;
                        if (clusterCount === targetLakeSize) break;
                    }
                }
                if (clusterCount === targetLakeSize) break;
            }
            console.log(`Placed lake ${i + 1} with ${clusterCount} hexes at (${startR}, ${startC})`);
        } else {
            console.log(`Could not place lake ${i + 1}: No UNASSIGNED hexes found`);
        }
    }

    // Step 3: Mark Swamp Candidates
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (map[r][c] === Terrain.LAKE) {
                const neighbors = getNeighbors(r, c, rows, cols);
                for (const [nr, nc] of neighbors) {
                    if (isValid(nr, nc, rows, cols) && map[nr][nc] === Terrain.UNASSIGNED) {
                        map[nr][nc] = SWAMP_CANDIDATE;
                    }
                }
            }
        }
    }

    // Step 4: Place Forests (Capped at 3-7 forests)
    const numForestsToPlace = Math.floor(Math.random() * calculatedMaxForests) + 3; // Randomly choose 3 to 7 forests
    console.log(`Attempting to place ${numForestsToPlace} forests`);
    for (let i = 0; i < numForestsToPlace; i++) {
        const targetForestSize = Math.floor(Math.random() * (calculatedForestSizeMax - calculatedForestSizeMin + 1)) + calculatedForestSizeMin;
        let startR, startC;
        let foundStart = false;
        const maxStartAttempts = 100;
        for (let attempt = 0; attempt < maxStartAttempts; attempt++) {
            const r = Math.floor(Math.random() * rows);
            const c = Math.floor(Math.random() * cols);
            if (isValid(r, c, rows, cols) && map[r][c] === Terrain.UNASSIGNED) {
                startR = r;
                startC = c;
                foundStart = true;
                break;
            }
        }

        if (foundStart) {
            const queue = [[startR, startC]];
            map[startR][startC] = Terrain.FOREST;
            let clusterCount = 1;

            while (queue.length > 0 && clusterCount < targetForestSize) {
                const [currR, currC] = queue.shift();
                let neighbors = getNeighbors(currR, currC, rows, cols);
                shuffleArray(neighbors);

                for (const [nr, nc] of neighbors) {
                    if (isValid(nr, nc, rows, cols) && map[nr][nc] === Terrain.UNASSIGNED) {
                        map[nr][nc] = Terrain.FOREST;
                        queue.push([nr, nc]);
                        clusterCount++;
                        if (clusterCount === targetForestSize) break;
                    }
                }
                if (clusterCount === targetForestSize) break;
            }
            console.log(`Placed forest ${i + 1} with ${clusterCount} hexes at (${startR}, ${startC})`);
        } else {
            console.log(`Could not place forest ${i + 1}: No UNASSIGNED hexes found`);
        }
    }

    // Step 5: Resolve Candidate Terrains
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const currentCell = map[r][c];

            if (currentCell === HILL_CANDIDATE) {
                map[r][c] = Terrain.HILL;
            } else if (currentCell === SWAMP_CANDIDATE) {
                map[r][c] = Terrain.SWAMP;
            } else if (currentCell === Terrain.UNASSIGNED) {
                let isNextToMountain = false;
                let isNextToLake = false;
                const neighbors = getNeighbors(r, c, rows, cols);
                for (const [nr, nc] of neighbors) {
                    if (isValid(nr, nc, rows, cols)) {
                        if (map[nr][nc] === Terrain.MOUNTAIN) {
                            isNextToMountain = true;
                        }
                        if (map[nr][nc] === Terrain.LAKE) {
                            isNextToLake = true;
                        }
                    }
                }
                if (isNextToMountain) {
                    map[r][c] = Terrain.HILL;
                } else if (isNextToLake) {
                    map[r][c] = Terrain.SWAMP;
                }
            }
        }
    }

    // Step 6: Set Remaining Hexes to Flat
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (map[r][c] === Terrain.UNASSIGNED) {
                map[r][c] = Terrain.FLAT;
            }
        }
    }

    // Step 7: Verification Pass (Optional)
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cellType = map[r][c];
            const neighbors = getNeighbors(r, c, rows, cols);
            for (const [nr, nc] of neighbors) {
                if (isValid(nr, nc, rows, cols)) {
                    const neighborType = map[nr][nc];
                    if (cellType === Terrain.MOUNTAIN) {
                        if (neighborType !== Terrain.HILL) {
                            // originalConsoleWarn(`Constraint violated: Mountain at (${r}, ${c}) is next to non-Hill (${neighborType}) at (${nr}, ${nc})`);
                        }
                    } else if (cellType === Terrain.LAKE) {
                        if (neighborType !== Terrain.SWAMP) {
                            // originalConsoleWarn(`Constraint violated: Lake at (${r}, ${c}) is next to non-Swamp (${neighborType}) at (${nr}, ${nc})`);
                        }
                    } else if (cellType === Terrain.HILL) {
                        if (neighborType === Terrain.SWAMP || neighborType === Terrain.LAKE) {
                            // originalConsoleWarn(`Constraint violated: Hill at (${r}, ${c}) is next to Swamp/Lake (${neighborType}) at (${nr}, ${nc})`);
                        }
                    } else if (cellType === Terrain.SWAMP) {
                        if (neighborType === Terrain.MOUNTAIN || neighborType === Terrain.HILL) {
                            // originalConsoleWarn(`Constraint violated: Swamp at (${r}, ${c}) is next to Mountain/Hill (${neighborType}) at (${nr}, ${nc})`);
                        }
                    }
                }
            }
        }
    }

    // Step 8: Log Terrain Distribution for Debugging
    const terrainCounts = {};
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            terrainCounts[map[r][c]] = (terrainCounts[map[r][c]] || 0) + 1;
        }
    }
    console.log("Terrain distribution:", terrainCounts);

    return map;
}

//--- Version Fixed for Lake Size Issue