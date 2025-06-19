import heapq
from collections import deque

def get_nearest_enemy(unit, enemy_units):
    return min((u for u in enemy_units if visible_hexes[u['row']][u['col']]),
               key=lambda u: distance((unit['row'], unit['col']), (u['row'], u['col'])))

def get_target(unit, red_general, enemy_units):
    if unit['health'] < 0.5:
        return retreat(unit) # Retreat if health is low
    elif enemy_units:
        return engage(unit, get_nearest_enemy(unit, enemy_units)) # Engage the nearest enemy
    elif not red_general or unit['type'] == UNIT_GENERAL:
        return protect(unit, red_general) # Protect the general if no enemies are visible
    else:
        return explore(unit) # Explore the map if there's no immediate threat

def engage(unit, target):
    return (target['row'], target['col'])

def retreat(unit):
    directions = get_neighbors(unit['row'], unit['col'])
    safe_spots = [(r, c) for r, c in directions if game_map[r][c] != TERRAIN_MOUNTAIN and not (r, c) in combat_hexes]
    if safe_spots:
        return min(safe_spots, key=lambda x: distance((unit['row'], unit['col']), x))
    else:
        return (unit['row'], unit['col']) # Stay in place if no safe spot is found

def protect(unit, red_general):
    if unit == red_general:
        return (red_general['row'], red_general['col']) # Stay in place if the unit is the general
    else:
        directions = get_neighbors(unit['row'], unit['col'])
        return min(directions, key=lambda x: distance((red_general['row'], red_general['col']), x))

def explore(unit):
    directions = get_neighbors(unit['row'], unit['col'])
    return min(directions, key=lambda x: (not visible_hexes[x[0]][x[1]], distance((unit['row'], unit['col']), x)))

def distance(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])

async def send_move_orders(websocket):
    global game_over
    while not game_over:
        if current_units and game_map and visible_hexes:
            red_units = [unit for unit in current_units if unit['armyColor'] == player_army_color]
            red_general = next((unit for unit in red_units if unit['type'] == UNIT_GENERAL), None)
            enemy_units = [unit for unit in current_units if unit['armyColor'] != player_army_color]
            enemy_general = next((unit for unit in enemy_units if unit['type'] == UNIT_GENERAL), None)
            random.shuffle(red_units)
            orders_sent = 0
            for unit_to_move in red_units:
                if orders_sent >= MAX_ORDERS_PER_INTERVAL:
                    break
                unit_id = unit_to_move['id']
                current_r = unit_to_move['row']
                current_c = unit_to_move['col']
                target_r, target_c = get_target(unit_to_move, red_general, enemy_units)
                if target_r is None or target_c is None:
                    continue
                move_order = {'type': 'MOVE_ORDER', 'unitId': unit_id, 'targetR': target_r, 'targetC': target_c}
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
            pass # No map or units yet
        await asyncio.sleep(MOVE_ORDER_INTERVAL_SECONDS) # Wait for the next batch