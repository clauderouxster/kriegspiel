/*
 * mapGeneration.js
 * Contient la logique de génération de la carte hexagonale.
 * Dépend de constants.js et utils.js.
 */

/**
 * Calculates the map dimensions (rows and cols) based on the desired height
 * and the base aspect ratio.
 * Depends on BASE_ASPECT_RATIO from constants.js.
 */
function calculateMapDimensions(height) {
    const rows = height;
    const cols = Math.round(height * BASE_ASPECT_RATIO);
    return { rows, cols };
}


/**
 * Generates the random hexagonal map with the specified terrain constraints.
 * Depends on Terrain constants, MOUNTAIN_PROBABILITY, CENTER_AREA_PERCENT,
 * BASE_HEIGHT_FOR_LAKE_SCALING, BASE_LAKE_SIZE_MIN, BASE_LAKE_SIZE_MAX, BASE_MAX_LAKES_FACTOR,
 * BASE_HEIGHT_FOR_FOREST_SCALING, BASE_FOREST_SIZE_MIN, BASE_FOREST_SIZE_MAX, BASE_MAX_FOREST_FACTOR
 * from constants.js.
 * Depends on isValid, getNeighbors, shuffleArray from utils.js.
 */
function generateMap(rows, cols, mountainProb, centerAreaPercent,
                     baseHeightForLakeScaling, baseLakeSizeMin, baseLakeSizeMax, baseMaxLakesFactor,
                     baseHeightForForestScaling, baseForestSizeMin, baseForestSizeMax, baseMaxForestFactor) {

    const heightRatioLake = rows / baseHeightForLakeScaling;
    const heightRatioForest = rows / baseHeightForForestScaling;

    const calculatedLakeSizeMin = Math.max(1, Math.round(baseLakeSizeMin * heightRatioLake));
    const calculatedLakeSizeMax = Math.max(calculatedLakeSizeMin, Math.round(baseLakeSizeMax * heightRatioLake));
    const calculatedMaxLakes = Math.max(1, Math.round(rows / baseMaxLakesFactor));

    const calculatedForestSizeMin = Math.max(1, Math.round(baseForestSizeMin * heightRatioForest));
    const calculatedForestSizeMax = Math.max(calculatedForestSizeMin, Math.round(baseForestSizeMax * heightRatioForest));
    const calculatedMaxForests = Math.max(1, Math.round(rows / baseMaxForestFactor));

    const map = Array(rows).fill(null).map(() => Array(cols).fill(Terrain.UNASSIGNED));

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (map[r][c] === Terrain.UNASSIGNED && Math.random() < mountainProb) {
                let canPlaceMountain = true;
                const neighbors = getNeighbors(r, c, rows, cols);
                for (const [nr, nc] of neighbors) {
                    if(isValid(nr, nc, rows, cols)) {
                        if (map[nr][nc] === Terrain.LAKE || map[nr][nr] === SWAMP_CANDIDATE || map[nr][nc] === Terrain.FOREST) {
                             canPlaceMountain = false;
                             break;
                         }
                    }
                }
                if (canPlaceMountain) {
                    map[r][c] = Terrain.MOUNTAIN;
                    for (const [nr, nc] of neighbors) {
                         if(isValid(nr, nc, rows, cols)) {
                             if (map[nr][nc] === Terrain.UNASSIGNED) {
                                 map[nr][nc] = HILL_CANDIDATE;
                             }
                         }
                    }
                }
            }
        }
    }

    const centerRowStart = Math.floor(rows * centerAreaPercent);
    const centerRowEnd = rows - centerRowStart;
    const centerColStart = Math.floor(cols * centerAreaPercent);
    const centerColEnd = cols - centerColStart;

    const numLakesToPlace = Math.floor(Math.random() * calculatedMaxLakes) + 1;
    for (let i = 0; i < numLakesToPlace; i++) {
        const targetLakeSize = Math.floor(Math.random() * (calculatedLakeSizeMax - calculatedLakeSizeMin + 1)) + calculatedLakeSizeMin;
        let startR, startC;
        let foundStart = false;
        const maxStartAttempts = 100;
        for (let attempt = 0; attempt < maxStartAttempts; attempt++) {
            const r = Math.floor(Math.random() * (centerRowEnd - centerRowStart)) + centerRowStart;
            const c = Math.floor(Math.random() * (centerColEnd - centerColStart)) + centerColStart;
            if (isValid(r, c, rows, cols) && map[r][c] === Terrain.UNASSIGNED) {
                 let isAdjacentToForbidden = false;
                 const neighbors = getNeighbors(r, c, rows, cols);
                 for (const [nr, nc] of neighbors) {
                      if(isValid(nr, nc, rows, cols)) {
                         if (map[nr][nc] === Terrain.MOUNTAIN || map[nr][nc] === HILL_CANDIDATE ||
                             map[nr][nc] === Terrain.FOREST) {
                             isAdjacentToForbidden = true;
                             break;
                         }
                     }
                 }
                 if (!isAdjacentToForbidden) {
                    startR = r;
                    startC = c;
                    foundStart = true;
                    break;
                 }
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
                        let canGrowHere = true;
                        const subNeighbors = getNeighbors(nr, nc, rows, cols);
                        for (const [snr, snc] of subNeighbors) {
                             if(isValid(snr, snc, rows, cols)) {
                                if (map[snr][snc] === Terrain.MOUNTAIN || map[snr][snc] === HILL_CANDIDATE ||
                                    map[snr][snc] === Terrain.LAKE || map[snr][snc] === SWAMP_CANDIDATE) {
                                    canGrowHere = false;
                                    break;
                                }
                            }
                        }
                        if (canGrowHere) {
                            map[nr][nc] = Terrain.LAKE;
                            queue.push([nr, nc]);
                            clusterCount++;
                            if (clusterCount === targetLakeSize) break;
                        }
                    }
                }
                 if (clusterCount === targetLakeSize) break;
            }
        }
    }

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

    const numForestsToPlace = Math.floor(Math.random() * calculatedMaxForests) + 1;
    for (let i = 0; i < numForestsToPlace; i++) {
        const targetForestSize = Math.floor(Math.random() * (calculatedForestSizeMax - calculatedForestSizeMin + 1)) + calculatedForestSizeMin;
        let startR, startC;
        let foundStart = false;
        const maxStartAttempts = 100;
        for (let attempt = 0; attempt < maxStartAttempts; attempt++) {
            const r = Math.floor(Math.random() * (centerRowEnd - centerRowStart)) + centerRowStart;
            const c = Math.floor(Math.random() * (centerColEnd - centerColStart)) + centerColStart;
            if (isValid(r, c, rows, cols) && map[r][c] === Terrain.UNASSIGNED) {
                 let isAdjacentToForbidden = false;
                 const neighbors = getNeighbors(r, c, rows, cols);
                 for (const [nr, nc] of neighbors) {
                      if(isValid(nr, nc, rows, cols)) {
                         if (map[nr][nc] === Terrain.MOUNTAIN || map[nr][nc] === HILL_CANDIDATE ||
                             map[nr][nc] === Terrain.LAKE || map[nr][nc] === SWAMP_CANDIDATE) {
                             isAdjacentToForbidden = true;
                             break;
                         }
                     }
                 }
                 if (!isAdjacentToForbidden) {
                    startR = r;
                    startC = c;
                    foundStart = true;
                    break;
                 }
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
                        let canGrowHere = true;
                        const subNeighbors = getNeighbors(nr, nc, rows, cols);
                        for (const [snr, snc] of subNeighbors) {
                             if(isValid(snr, snc, rows, cols)) {
                                if (map[snr][snc] === Terrain.MOUNTAIN || map[snr][snc] === HILL_CANDIDATE ||
                                    map[snr][snc] === Terrain.LAKE || map[snr][snc] === SWAMP_CANDIDATE) {
                                    canGrowHere = false;
                                    break;
                                }
                            }
                        }
                        if (canGrowHere) {
                            map[nr][nc] = Terrain.FOREST;
                            queue.push([nr, nc]);
                            clusterCount++;
                            if (clusterCount === targetForestSize) break;
                        }
                    }
                }
                 if (clusterCount === targetForestSize) break;
            }
        }
    }

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
                 for(const [nr, nc] of neighbors) {
                     if(isValid(nr, nc, rows, cols)) {
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

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (map[r][c] === Terrain.UNASSIGNED) {
                 map[r][c] = Terrain.FLAT;
            }
        }
    }

    // Verification Pass (Optional)
     for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cellType = map[r][c];
            const neighbors = getNeighbors(r, c, rows, cols);
            for (const [nr, nc] of neighbors) {
                 if(isValid(nr, nc, rows, cols)) {
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

    return map;
}

//--- Version Finale
