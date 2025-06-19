import asyncio
import websockets
import json
import random
import math # For math.floor
import collections # For deque, which is efficient for queue operations
import sys

FILE_NAME = ""
# --- Constants (mirroring JavaScript constants for logic consistency) ---
# Terrain types
TERRAIN_FLAT = 0
TERRAIN_MOUNTAIN = 1
TERRAIN_HILL = 2
TERRAIN_SWAMP = 3
TERRAIN_LAKE = 4
TERRAIN_FOREST = 5
TERRAIN_BASE = 6
TERRAIN_UNASSIGNED = -1

# Unit types
UNIT_INFANTERY = 0
UNIT_ARTILLERY = 1
UNIT_CAVALRY = 2
UNIT_SUPPLY = 3
UNIT_SCOUT = 4
UNIT_GENERAL = 5

# Army colors (using simple strings for Python, match JS for logic)
ARMY_COLOR_BLUE = '#0000FF'
ARMY_COLOR_RED = '#FF0000'

ARMY_BLUE_NUMBER = -1
ARMY_BLUE_VALUE = 0
REFERENCE_SCORE = 0
VISIBLE_RED_MAP = []
VISIBLE_UNITS = []
INITIAL_UNIT_POSITION = {}

# Movement Costs per hex terrain type for each unit type
# Infinity means impassable. This should match constants.js
TERRAIN_MOVEMENT_COSTS = {
    UNIT_INFANTERY: {
        TERRAIN_FLAT: 1, TERRAIN_MOUNTAIN: 3, TERRAIN_HILL: 2, TERRAIN_SWAMP: 2,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    },
    UNIT_ARTILLERY: {
        TERRAIN_FLAT: 1.5, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 3, TERRAIN_SWAMP: 3,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    },
    UNIT_CAVALRY: {
        TERRAIN_FLAT: 0.8, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 1.5, TERRAIN_SWAMP: 2,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 1.5
    },
    UNIT_SUPPLY: {
        TERRAIN_FLAT: 1, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 2, TERRAIN_SWAMP: 3,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    },
    UNIT_SCOUT: {
        TERRAIN_FLAT: 0.7, TERRAIN_MOUNTAIN: 1, TERRAIN_HILL: 1, TERRAIN_SWAMP: 1,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 1
    },
    UNIT_GENERAL: {
        TERRAIN_FLAT: 1, TERRAIN_MOUNTAIN: 3, TERRAIN_HILL: 2, TERRAIN_SWAMP: 2,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    }
}

# Vision Ranges per unit type (distance in hexes)
VISION_RANGES = {
    UNIT_ARTILLERY: { TERRAIN_BASE: 4, TERRAIN_HILL: 6}, 
    UNIT_INFANTERY: { TERRAIN_BASE: 4, TERRAIN_HILL: 6, TERRAIN_MOUNTAIN: 8 }, 
    UNIT_CAVALRY: { TERRAIN_BASE: 4, TERRAIN_HILL: 6 },
    UNIT_SUPPLY: { TERRAIN_BASE: 2 }, 
    UNIT_SCOUT: { TERRAIN_BASE: 5, TERRAIN_HILL: 10, TERRAIN_MOUNTAIN: 15 },
    UNIT_GENERAL: { TERRAIN_BASE: 7, TERRAIN_HILL: 12, TERRAIN_MOUNTAIN: 17 } 
}

UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR = {
    UNIT_INFANTERY: 4,
    UNIT_ARTILLERY: 3,
    UNIT_CAVALRY: 6,
    UNIT_SUPPLY: 3,
    UNIT_SCOUT: 7,
    UNIT_GENERAL: 5
}

visible_hexes = []

# --- AI Configuration ---
# Maximum number of move orders to send per batch/interval
MAX_ORDERS_PER_INTERVAL = 10
MOVE_ORDER_INTERVAL_SECONDS = 2

# --- Global Game State Variables ---
game_map = []
current_units = []
player_army_color = None # Will be set to ARMY_COLOR_RED
game_time_in_minutes = 0
current_map_rows = 0
current_map_cols = 0
last_received_sync_sequence_number = -1
game_over = False
combat_hexes = set() # Store keys of hexes in combat: "r,c"
unit_code_indexing = {}

# --- WebSocket Connection ---
URI = "ws://localhost:6060" # Or "ws://your_ngrok_address.ngrok.io" if using ngrok


def to_axial(r, c):
    """
    Convertit les coordonnées de grille (r, c) en coordonnées axiales (q, r).
    Pointy-top, odd-row staggering:
    q = c - floor(r / 2)
    r = r (axial 'r' est le même que array 'r')
    """
    q = c - math.floor(r / 2)
    axial_r = r
    
    return {"q": q, "r": axial_r}

def to_cube(q, r):
    """
    Calcule les coordonnées "cube" x, y, z pour des coordonnées axiales q, r données.
    Utile pour les calculs de distance. Somme des coordonnées cube x + y + z = 0.
    """
    # x = q
    # z = r
    # y = -x - z = -q - r
    x = q
    z = r
    y = -x - z
    
    return {"x": x, "y": y, "z": z}

def get_hex_distance(r1, c1, r2, c2):
    """
    Calcule la distance hexagonale entre deux hexagones (r1, c1) et (r2, c2).
    Convertit en coordonnées cube et utilise la formule de distance cube.
    Basé sur https://www.redblobgames.com/grids/hexagons/
    """
    # Conversion en coordonnées axiales
    axial1 = to_axial(r1, c1)
    axial2 = to_axial(r2, c2)
    
    q1, axial_r1 = axial1["q"], axial1["r"]
    q2, axial_r2 = axial2["q"], axial2["r"]
    
    # Conversion en coordonnées cube
    cube1 = to_cube(q1, axial_r1)
    cube2 = to_cube(q2, axial_r2)
    
    x1, y1, z1 = cube1["x"], cube1["y"], cube1["z"]
    x2, y2, z2 = cube2["x"], cube2["y"], cube2["z"]
    
    # Distance cube = max(abs(x1-x2), abs(y1-y2), abs(z1-z2))
    distance = max(abs(x1 - x2), abs(y1 - y2), abs(z1 - z2))
    return distance

# --- Helper Functions (mirroring game logic where necessary) ---

def calculate_move_duration_game_minutes(unit_type, terrain_type):
    """
    Calculates the game minutes needed for a unit to move into a specific hex.
    This is a direct port from the JavaScript constants.js.
    """
    movement_cost = TERRAIN_MOVEMENT_COSTS.get(unit_type, {}).get(terrain_type, float('inf'))

    if movement_cost == float('inf') or movement_cost <= 0:
        return float('inf')

    base_movement_capability_per_hour = UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR.get(unit_type)

    if base_movement_capability_per_hour is None or base_movement_capability_per_hour <= 0:
        return float('inf')

    game_hours = movement_cost / base_movement_capability_per_hour
    game_minutes = game_hours * 60
    return game_minutes

def get_neighbors(r, c, rows, cols):
    """Returns a list of valid neighboring hex coordinates (axial coordinates logic)."""
    neighbors = []
    # Your coordinate system seems to be (row, col) with an offset for odd rows.
    # A hex at (r, c) has 6 neighbors. The offsets depend on whether the row 'r' is even or odd.
    if r % 2 == 0: # Even row (col - 1, col, col + 1)
        potential_neighbors = [
            (r, c + 1), (r, c - 1),        # East, West
            (r - 1, c), (r - 1, c - 1),    # North-East, North-West
            (r + 1, c), (r + 1, c - 1)     # South-East, South-West
        ]
    else: # Odd row (col, col + 1)
        potential_neighbors = [
            (r, c + 1), (r, c - 1),        # East, West
            (r - 1, c + 1), (r - 1, c),    # North-East, North-West
            (r + 1, c + 1), (r + 1, c)     # South-East, South-West
        ]

    for nr, nc in potential_neighbors:
        if 0 <= nr < rows and 0 <= nc < cols:
            neighbors.append((nr, nc))
    return neighbors


# --- New Function: Map Encoding ---

TERRAIN_INITIALS = {
    TERRAIN_FLAT: 'F',
    TERRAIN_MOUNTAIN: 'M',
    TERRAIN_HILL: 'H',
    TERRAIN_SWAMP: 'S',
    TERRAIN_LAKE: 'L',
    TERRAIN_FOREST: 'R', # Using R for Forest as F is taken by Flat
    TERRAIN_UNASSIGNED: 'X' # For unassigned or unknown terrain
}

UNIT_INITIALS = {
    UNIT_CAVALRY: 'C',
    UNIT_INFANTERY: 'I',
    UNIT_ARTILLERY: 'A',
    UNIT_SCOUT: 'S',
    UNIT_SUPPLY: 'U', # Using U for Supply as S is taken by Scout
    UNIT_GENERAL: 'G'
}

COLOR_INITIALS = {
    ARMY_COLOR_BLUE: 'B',
    ARMY_COLOR_RED: 'R'
}

def is_valid(r, c, rows, cols):
    """Checks if the given row and column are within the map boundaries."""
    return 0 <= r < rows and 0 <= c < cols

def update_visibility(game_map, current_units, current_map_rows, current_map_cols, player_army_color):
    """
    Calculates and updates the visible hexes based on unit positions and vision ranges
    for the *local player's army*.
    """
    global visible_hexes

    # Initialize visible_hexes array
    if current_map_rows == 0 or current_map_cols == 0:
        print("[update_visibility] Map dimensions not initialized. Cannot calculate visibility.")
        return

    visible_hexes = [[False for _ in range(current_map_cols)] for _ in range(current_map_rows)]

    if not game_map or not current_units:
        print(f"[update_visibility] Map or units not initialized. No visibility calculated via BFS.")
    else:
        player_units = [unit for unit in current_units if unit and unit.get('armyColor') == player_army_color and unit.get('health', 0) > 0]

        for unit in player_units:
            if not unit:
                continue

            unit_r = unit['row']
            unit_c = unit['col']
            unit_type = unit['type']

            if not is_valid(unit_r, unit_c, current_map_rows, current_map_cols):
                print(f"[update_visibility] Skipping visibility for invalid unit position at ({unit_r}, {unit_c}) for unit ID {unit.get('id')}.")
                continue

            terrain_at_unit_hex = game_map[unit_r][unit_c]

            # --- MODIFIED PART FOR VISION_RANGES ---
            vision_range_info = VISION_RANGES.get(unit_type)
            # Start with the base vision range
            vision_range = vision_range_info.get(TERRAIN_BASE, 0) if vision_range_info else 0

            # Apply terrain bonus based on specific terrain keys
            if terrain_at_unit_hex == TERRAIN_HILL:
                # Use TERRAIN_HILL as the key
                vision_range = vision_range_info.get(TERRAIN_HILL, vision_range) if vision_range_info else vision_range
            elif terrain_at_unit_hex == TERRAIN_MOUNTAIN:
                # Use TERRAIN_MOUNTAIN as the key
                vision_range = vision_range_info.get(TERRAIN_MOUNTAIN, vision_range) if vision_range_info else vision_range
            # --- END MODIFIED PART ---

            # Use BFS to mark all hexes within the calculated vision range as visible
            queue = collections.deque([(unit_r, unit_c, 0)])
            visited = set()
            visited.add(f"{unit_r},{unit_c}")

            while queue:
                r, c, dist = queue.popleft()

                if is_valid(r, c, current_map_rows, current_map_cols):
                    visible_hexes[r][c] = True
                else:
                    continue

                if dist < vision_range:
                    neighbors = get_neighbors(r, c, current_map_rows, current_map_cols)
                    for nr, nc in neighbors:
                        neighbor_key = f"{nr},{nc}"
                        if neighbor_key not in visited and is_valid(nr, nc, current_map_rows, current_map_cols):
                            visited.add(neighbor_key)
                            queue.append((nr, nc, dist + 1))

    # Ensure hexes with player units are visible
    if current_units:
        for unit in current_units:
            if unit and unit.get('armyColor') == player_army_color and unit.get('health', 0) > 0:
                if is_valid(unit['row'], unit['col'], current_map_rows, current_map_cols):
                    visible_hexes[unit['row']][unit['col']] = True
                else:
                    print(f"[update_visibility] Unit ID {unit.get('id')} at invalid position ({unit['row']}, {unit['col']}) while ensuring visibility.")

def generate_map_encoding_old(current_map, units, rows, cols, combat_hex_set, unit_indexes):
    """
    Generates a list of strings, where each string represents a row
    and tiles are separated by a space.
    Encoding for each tile: TCIUHF
    T: Terrain initial (F, M, H, S, L, R)
    C: Color initial (B, R)
    I: Unit Numerical Id over 3 digits
    U: Unit initial (C, I, A, S, U, G)
    H: Health (1-9)
    F: Fight ('F' or '')
    Example: "HR110C5F" for Red Cavalry on Hill with 5 health in fight.
             "M" for Mountain terrain with no unit or fight.
    """

    global unit_code_indexing, visible_hexes, VISIBLE_UNITS

    encoded_map_rows = []
    unit_positions = {(unit['row'], unit['col']): unit for unit in units}

    unit_code_indexing = {}

    VISIBLE_UNITS = []

    for r in range(rows):
        current_row_hexes = []
        for c in range(cols):
            hex_string = ""
            if visible_hexes[r][c] == False:
                hex_string = "0"
            else:
                terrain_type = current_map[r][c] if 0 <= r < len(current_map) and 0 <= c < len(current_map[r]) else TERRAIN_UNASSIGNED
                
                # T: Terrain Initial
                terrain = TERRAIN_INITIALS.get(terrain_type, 'X') # Default to 'X' for unknown
                hex_string += terrain

                # Check for Unit at this hex
                unit_on_hex = unit_positions.get((r, c))

                if unit_on_hex:
                    VISIBLE_UNITS.append(unit_on_hex)

                    # C: Color Initial
                    unit_on_tile = COLOR_INITIALS.get(unit_on_hex['armyColor'], '?')

                    #I: Id as one character
                    id = unit_on_hex["id"]
                    unit_on_tile += f"{id:03d}"

                    # U: Unit Initial
                    unit_on_tile += UNIT_INITIALS.get(unit_on_hex['type'], '?')

                    # H: Health (1-9)
                    health = math.floor(unit_on_hex['health'])
                    health_char = str(min(max(1, health), 9)) # Cap health between 1 and 9
                    unit_on_tile += health_char
                    
                    # F: Fight
                    if f"{r},{c}" in combat_hex_set:
                        unit_on_tile += 'F'                
                    hex_string += unit_on_tile

                    unit_on_tile = terrain + unit_on_tile
                    if id in unit_indexes:
                        unit_code_indexing[unit_on_tile] = (r,c)

            current_row_hexes.append(hex_string)
        encoded_map_rows.append(" ".join(current_row_hexes)) # Join hexes in the row with a space
    return encoded_map_rows

def generate_map_encoding(current_map, units, rows, cols, combat_hex_set, unit_indexes):
    """
    Generates a list of strings, where each string represents a row
    and tiles are separated by a space.
    Encoding for each tile: TCIUHF
    T: Terrain initial (F, M, H, S, L, R)
    C: Color initial (B, R)
    U: Unit initial (C, I, A, S, U, G)
    H: Health (1-9)
    F: Fight ('F' or '')
    Example: "HRC5F" for Red Cavalry on Hill with 5 health in fight.
             "M" for Mountain terrain with no unit or fight.
    """

    global unit_code_indexing, visible_hexes, VISIBLE_UNITS

    encoded_map_rows = []
    unit_positions = {(unit['row'], unit['col']): unit for unit in units}

    unit_code_indexing = {}

    VISIBLE_UNITS = []

    for r in range(rows):
        current_row_hexes = []
        for c in range(cols):
            hex_string = ""
            if visible_hexes[r][c] == False:
                hex_string = "0"
            else:
                terrain_type = current_map[r][c] if 0 <= r < len(current_map) and 0 <= c < len(current_map[r]) else TERRAIN_UNASSIGNED
                
                # T: Terrain Initial
                terrain = TERRAIN_INITIALS.get(terrain_type, 'X') # Default to 'X' for unknown
                hex_string += terrain

                # Check for Unit at this hex
                unit_on_hex = unit_positions.get((r, c))

                if unit_on_hex:
                    VISIBLE_UNITS.append(unit_on_hex)

                    # C: Color Initial
                    unit_on_tile = COLOR_INITIALS.get(unit_on_hex['armyColor'], '?')

                    # U: Unit Initial
                    unit_on_tile += UNIT_INITIALS.get(unit_on_hex['type'], '?')

                    # H: Health (1-9)
                    health = math.floor(unit_on_hex['health'])
                    health_char = str(min(max(1, health), 9)) # Cap health between 1 and 9
                    unit_on_tile += health_char
                    
                    # F: Fight
                    if f"{r},{c}" in combat_hex_set:
                        unit_on_tile += 'F'                
                    hex_string += unit_on_tile

                    unit_on_tile = terrain + unit_on_tile
                    if id in unit_indexes:
                        unit_code_indexing[unit_on_tile] = (r,c)

            current_row_hexes.append(hex_string)
        encoded_map_rows.append(" ".join(current_row_hexes)) # Join hexes in the row with a space
    return encoded_map_rows

# --- Main WebSocket Client Logic ---
# Ces constantes sont supposées être disponibles globalement ou définies ailleurs dans red_player.py
# Elles sont incluses ici pour la clarté du contexte de la fonction de score.
UNIT_INFANTERY = 0
UNIT_ARTILLERY = 1
UNIT_CAVALRY = 2
UNIT_SUPPLY = 3
UNIT_SCOUT = 4
UNIT_GENERAL = 5

ARMY_COLOR_RED = '#FF0000' # Couleur de l'armée Rouge (devrait correspondre à celle de red_player.py)
ARMY_COLOR_BLUE = '#0000FF' # Couleur de l'armée Bleue (devrait correspondre à celle de red_player.py)

# Valeurs des unités pour le calcul du score en cas de défaite, basées sur la hiérarchie fournie.
UNIT_SCORE_VALUES = {
    UNIT_SUPPLY: 10,
    UNIT_SCOUT: 20,
    UNIT_INFANTERY: 30,
    UNIT_CAVALRY: 40,
    UNIT_ARTILLERY: 50,
    UNIT_GENERAL: 100
}

def current_score(frontier, current_units, player_army_color):
    """
    Calcule le score de la partie pour le joueur Rouge, en incluant un bonus pour les unités bleues détruites.

    Args:
        fontier: The middle line that separates the Blue camp from the Red camp, 
        current_units (list): Liste des dictionnaires d'unités présentes sur la carte à la fin de la partie.
                              Chaque dictionnaire d'unité contient au moins 'type', 'armyColor', 'health'.
        player_army_color (str): La couleur de l'armée du joueur (doit être ARMY_COLOR_RED).

    Returns:
        int: Le score calculé.
    """
    global VISIBLE_RED_MAP, UNIT_SCORE_VALUES, ARMY_BLUE_NUMBER, ARMY_BLUE_VALUE, INITIAL_UNIT_POSITION

    red_crossing = 0
    blue_crossing = 0
    distance = frontier * 2
    moved = 0
    remaining_blue_units_score = 0
    remaining_red_units_score = 0
    row_gen = 0
    col_gen = 0
    for unit in current_units:
        unit_type = unit.get('type')
        if unit and unit.get('armyColor') != player_army_color and unit.get(unit_type) == UNIT_GENERAL:
            row_gen = unit.get("row")
            col_gen = unit.get("col")
            break

    for unit in current_units:
        # Vérifier si l'unité appartient à l'armée du joueur et a une santé supérieure à 0
        if unit and unit.get('armyColor') == player_army_color and unit.get('health', 0) > 0:
            unit_type = unit.get('type')
            # Ajouter la valeur de l'unité au score, 0 si le type d'unité est inconnu
            remaining_red_units_score += UNIT_SCORE_VALUES.get(unit_type, 0)
            row = unit.get("row")
            col = unit.get("col")
            id = unit.get("id")
            if row <= frontier:
                red_crossing += 10
            distance = min(distance, get_hex_distance(row_gen, col_gen, row, col))
            r_row = INITIAL_UNIT_POSITION[id][0]
            r_col = INITIAL_UNIT_POSITION[id][1]
            moved += get_hex_distance(r_row, r_col, row, col)
        else:
            remaining_blue_units_score += UNIT_SCORE_VALUES.get(unit_type, 0) 
            if unit.get("row") > frontier:
                blue_crossing += 10
    
    final_score = 1000 + remaining_red_units_score + (ARMY_BLUE_VALUE - remaining_blue_units_score)
    final_score += (frontier*2) - distance + red_crossing - blue_crossing + moved
    return final_score

def calculate_score(outcome, frontier, current_units, player_army_color):
    """
    Calcule le score de la partie pour le joueur Rouge, en incluant un bonus pour les unités bleues détruites.

    Args:
        outcome (str): Le résultat de la partie ('red_wins', 'blue_wins', ou autre si défaite).
        fontier: The middle line that separates the Blue camp from the Red camp, 
        current_units (list): Liste des dictionnaires d'unités présentes sur la carte à la fin de la partie.
                              Chaque dictionnaire d'unité contient au moins 'type', 'armyColor', 'health'.
        player_army_color (str): La couleur de l'armée du joueur (doit être ARMY_COLOR_RED).

    Returns:
        int: Le score calculé.
    """
    global REFERENCE_SCORE

    try:
        with open('maps.txt', 'w') as f:
            for row_string in VISIBLE_RED_MAP:
                f.write(row_string + '\n')
        print("Final encoded map saved to maps.txt")
    except Exception as e:
        print(f"Error saving final map to maps.txt: {e}")    

    if outcome == 'red_wins':
        # Score maximum plus bonus pour les unités bleues détruites
        final_score = 10000
        return float(final_score)
    else: # Implique une défaite pour le joueur Rouge ou un autre résultat non gagnant
        final_score = current_score(frontier, current_units, player_army_color)
        print("Reference:", REFERENCE_SCORE, final_score)
        final_score = (final_score/REFERENCE_SCORE)*100
        return final_score

async def handle_messages(websocket):
    global game_map, current_units, player_army_color, game_time_in_minutes, ARMY_BLUE_NUMBER, VISIBLE_RED_MAP, \
           current_map_rows, current_map_cols, last_received_sync_sequence_number, game_over, combat_hexes, \
            ARMY_BLUE_VALUE, REFERENCE_SCORE, INITIAL_UNIT_POSITION

    async for message in websocket:
        try:
            data = json.loads(message)
            message_type = data.get('type')
            # print(f"Received message type: {message_type}") # Too chatty for sync

            if message_type == 'ASSIGN_COLOR':
                assigned_color = data.get('color')
                player_army_color = ARMY_COLOR_RED if assigned_color == 'red' else ARMY_COLOR_BLUE
                print(f"Assigned as player: {assigned_color.capitalize()}")
                if player_army_color == ARMY_COLOR_RED:
                    print("Waiting for initial game state from Blue player...")
                else:
                    print("Error: This client is designed to be the Red player. Exiting.")
                    game_over = True # End if not red
                    await websocket.close()

            elif message_type == 'STATE_SYNC':
                # Only Red player needs to process this
                if player_army_color == ARMY_COLOR_RED:
                    received_state = data.get('state')
                    if not received_state:
                        # print("Received STATE_SYNC with no state data.") # Too chatty
                        continue

                    received_sequence_number = received_state.get('sequenceNumber', -1)
                    if received_sequence_number <= last_received_sync_sequence_number:
                        # print(f"Ignoring STATE_SYNC with sequence number {received_sequence_number} (last processed: {last_received_sync_sequence_number}). Out of order or duplicate.")
                        continue
                    last_received_sync_sequence_number = received_sequence_number
                    # print(f"Processing STATE_SYNC with sequence number {received_sequence_number}.")

                    game_time_in_minutes = received_state.get('gameTimeInMinutes', 0)
                    game_map = received_state.get('map', [])
                    current_map_rows = received_state.get('currentMapRows', 0)
                    current_map_cols = received_state.get('currentMapCols', 0)
                    units_data = received_state.get('units', [])
                    combat_hexes_list = received_state.get('combatHexes', [])
                    combat_hexes = set(combat_hexes_list) # Update global combat_hexes set

                    # Update local units list, filtering out units not belonging to Red player
                    # and ensuring health is above 0 if applicable (though Blue handles elimination)
                    units_indexes = {}
                    count_blue = 0
                    count_value_blue = 0
                    for unit_data in units_data:
                        id  = unit_data["id"]
                        INITIAL_UNIT_POSITION[id] = (unit_data["row"], unit_data["col"])
                        if unit_data.get('armyColor') == player_army_color:
                            units_indexes[id] = f"{id:03d}"
                        else:
                            count_blue += 1
                            count_value_blue += UNIT_SCORE_VALUES.get(unit_data.get('type'), 0)

                    current_units = units_data

                    if ARMY_BLUE_NUMBER == -1:
                        ARMY_BLUE_NUMBER = count_blue
                        ARMY_BLUE_VALUE = count_value_blue
                        REFERENCE_SCORE = current_score(current_map_rows//2, current_units, player_army_color)
                        print("REFERENCE:", REFERENCE_SCORE)

                    update_visibility(game_map, current_units, current_map_rows, current_map_cols, player_army_color)
                    # Call the encoding function and print the result
                    VISIBLE_RED_MAP = generate_map_encoding(game_map, current_units, current_map_rows, current_map_cols, combat_hexes, units_indexes)
                    print(f"--- Map State (Seq: {received_sequence_number}, Time: {game_time_in_minutes} min) --- {len(current_units)} ---")
                    #for row_string in encoded_map_rows:
                    #    print(row_string)
                    #print("--- End Map State ---")
                    #print(unit_code_indexing)

            elif message_type == 'COMBAT_RESULT':
                if player_army_color == ARMY_COLOR_RED:
                    # For Red player, combat results are just informative; Blue is authoritative.
                    # The STATE_SYNC should eventually sync the actual unit health/elimination.
                    print("Received COMBAT_RESULT message (Blue is authoritative for combat).")
                    # No need to explicitly remove/update, STATE_SYNC handles it.

            elif message_type == 'GAME_OVER':
                outcome = data.get('outcome')
                final_game_score = calculate_score(outcome, current_map_rows//2, current_units, player_army_color)
                print(f"GAME OVER! Outcome: {outcome}: {final_game_score}")
                with open('scores.txt', 'a') as f:
                    f.write(f"{FILE_NAME}: {final_game_score}\n")
                game_over = True
                await websocket.close()

            elif message_type == 'PLAYER_LEFT':
                player = data.get('army')
                print(f"The {player.capitalize()} player has left the game. Game ending.")
                game_over = True
                await websocket.close()

            elif message_type == 'CHAT_MESSAGE':
                sender = data.get('sender')
                text = data.get('text')
                print(f"CHAT from {sender}: {text}")

            else:
                print(f"Unknown message type: {message_type} with data: {data}")

        except json.JSONDecodeError:
            print(f"Received malformed JSON: {message}")
        except Exception as e:
            print(f"Error processing message: {e}")
         
async def main():
    max_retries = 5
    retries = 0
    while retries < max_retries and not game_over:
        try:
            print(f"Connecting to WebSocket server at {URI}...")
            async with websockets.connect(URI) as websocket:
                print("WebSocket connected.")
                # Run message handling and sending concurrently
                await asyncio.gather(
                    handle_messages(websocket),
                    send_move_orders(websocket)
                )
        except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError) as e:
            print(f"WebSocket connection closed: {e}")
            if not game_over: # Only retry if game isn't explicitly over
                retries += 1
                print(f"Retrying connection in 5 seconds... (Attempt {retries}/{max_retries})")
                await asyncio.sleep(5)
        except ConnectionRefusedError:
            print(f"Connection refused. Is the server running at {URI}? Retrying in 5 seconds...")
            retries += 1
            await asyncio.sleep(5)
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            if not game_over:
                retries += 1
                print(f"Retrying connection in 5 seconds... (Attempt {retries}/{max_retries})")
                await asyncio.sleep(5)

    if game_over:
        print("Game finished or client explicitly stopped. Exiting.")
    else:
        print(f"Failed to connect after {max_retries} retries. Please ensure the server is running.")

if __name__ == "__main__":
    # Charger et exécuter le code généré
    FILE_NAME = sys.argv[1]
    with open(FILE_NAME, 'r') as f:
        code_genere = f.read()

    # Exécuter dans l'espace de noms global actuel
    exec(code_genere, globals())
    asyncio.run(main())
