import asyncio
import websockets
import json
import random
import math # For math.floor
import collections # For deque, which is efficient for queue operations

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

def generate_map_encoding(current_map, units, rows, cols, combat_hex_set, unit_indexes):
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

    global unit_code_indexing, visible_hexes

    encoded_map_rows = []
    unit_positions = {(unit['row'], unit['col']): unit for unit in units}

    unit_code_indexing = {}

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

# --- Main WebSocket Client Logic ---

async def handle_messages(websocket):
    global game_map, current_units, player_army_color, game_time_in_minutes, \
           current_map_rows, current_map_cols, last_received_sync_sequence_number, game_over, combat_hexes

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
                    for unit_data in units_data:
                        id  = unit_data["id"]
                        if unit_data.get('armyColor') == player_army_color:
                            units_indexes[id] = f"{id:03d}"

                    current_units = units_data

                    update_visibility(game_map, current_units, current_map_rows, current_map_cols, player_army_color)
                    # Call the encoding function and print the result
                    encoded_map_rows = generate_map_encoding(game_map, current_units, current_map_rows, current_map_cols, combat_hexes, units_indexes)
                    print(f"--- Map State (Seq: {received_sequence_number}, Time: {game_time_in_minutes} min) --- {len(current_units)} ---")
                    for row_string in encoded_map_rows:
                        print(row_string)
                    print("--- End Map State ---")
                    print(unit_code_indexing)


            elif message_type == 'COMBAT_RESULT':
                if player_army_color == ARMY_COLOR_RED:
                    # For Red player, combat results are just informative; Blue is authoritative.
                    # The STATE_SYNC should eventually sync the actual unit health/elimination.
                    print("Received COMBAT_RESULT message (Blue is authoritative for combat).")
                    # No need to explicitly remove/update, STATE_SYNC handles it.

            elif message_type == 'GAME_OVER':
                outcome = data.get('outcome')
                print(f"GAME OVER! Outcome: {outcome}")
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

async def send_move_orders(websocket):
    global game_over

    while not game_over:
        if current_units and game_map:
            # Find only units belonging to this player (Red)
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]

            # Shuffle the units to ensure a different set might move each interval
            random.shuffle(red_units)

            orders_sent = 0
            for unit_to_move in red_units:
                if orders_sent >= MAX_ORDERS_PER_INTERVAL:
                    break # Stop if we've sent enough orders for this interval

                unit_id = unit_to_move.get('id')
                current_r = unit_to_move.get('row')
                current_c = unit_to_move.get('col')
                unit_type = unit_to_move.get('type')

                # Get valid neighbors
                possible_targets = []
                for nr, nc in get_neighbors(current_r, current_c, current_map_rows, current_map_cols):
                    try:
                        terrain_type = game_map[nr][nc]
                        # Check if terrain is passable for the unit type
                        if calculate_move_duration_game_minutes(unit_type, terrain_type) != float('inf'):
                            possible_targets.append((nr, nc))
                    except IndexError:
                        pass # Ignore out-of-bounds neighbors

                if possible_targets:
                    # Choose a random valid adjacent target hex
                    target_r, target_c = random.choice(possible_targets)

                    move_order = {
                        'type': 'MOVE_ORDER',
                        'unitId': unit_id,
                        'targetR': target_r,
                        'targetC': target_c
                    }
                    try:
                        await websocket.send(json.dumps(move_order))
                        print(f"Sent MOVE_ORDER for unit {unit_id} to ({target_r}, {target_c})")
                        orders_sent += 1
                    except websockets.exceptions.ConnectionClosedOK:
                        print("Connection closed, cannot send move order.")
                        game_over = True
                        break
                    except Exception as e:
                        print(f"Error sending move order for unit {unit_id}: {e}")
                else:
                    # print(f"Unit {unit_id} at ({current_r}, {current_c}) has no valid adjacent moves.")
                    pass # This unit cannot move right now
        else:
            # print("Waiting for initial game state and units...")
            pass # No map or units yet

        await asyncio.sleep(MOVE_ORDER_INTERVAL_SECONDS) # Wait for the next batch

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
    asyncio.run(main())
