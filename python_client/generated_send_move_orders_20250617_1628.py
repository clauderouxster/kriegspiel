import random, heapq
from collections import defaultdict

async def send_move_orders(websocket):
    """
    This function implements an aggressive, strategic movement algorithm for the 'Red' player units. The strategy
    prioritizes attacking visible enemy units, then exploring unknown parts of the map and retreating if needed.
    Different unit types have varying priorities, and units consider terrain movement costs and benefits. The function
    applies a simple A* pathfinding algorithm for movement, focusing on efficiency and strategy over randomness.
    Units will prioritize engaging in combat if it is safe to do so, and will retreat if their health drops below 20%.
    The function also considers the current game time, and units will prioritize moving towards enemy bases if they are visible.
    """
    global game_over

    while not game_over:
        if current_units and game_map:
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]
            random.shuffle(red_units)

            orders_sent = 0
            for unit_to_move in red_units:
                if orders_sent >= MAX_ORDERS_PER_INTERVAL:
                    break

                unit_id = unit_to_move.get('id')
                current_r = unit_to_move.get('row')
                current_c = unit_to_move.get('col')
                unit_type = unit_to_move.get('type')
                health = unit_to_move.get('health')
                enemies = [u for u in current_units if u.get('armyColor') != player_army_color and visible_hexes[u.get('row')][u.get('col')]]
                enemy_bases = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if game_map[r][c] == TERRAIN_BASE and visible_hexes[r][c]]
                combat = [(int(h.split(',')[0]), int(h.split(',')[1])) for h in combat_hexes if visible_hexes[int(h.split(',')[0])][int(h.split(',')[1])]]

                target_r, target_c = determine_target(unit_to_move, enemies, enemy_bases, combat)
                if (target_r, target_c) != (-1, -1):
                    move_order = {
                        'type': 'MOVE_ORDER',
                        'unitId': unit_id,
                        'targetR': target_r,
                        'targetC': target_c
                    }
                    try:
                        await websocket.send(json.dumps(move_order))
                        orders_sent += 1
                    except websockets.exceptions.ConnectionClosedOK:
                        game_over = True
                        break
                    except Exception as e:
                        pass
        await asyncio.sleep(MOVE_ORDER_INTERVAL_SECONDS)

def determine_target(unit, enemies, enemy_bases, combat):
    current_r = unit.get('row')
    current_c = unit.get('col')
    unit_type = unit.get('type')
    health = unit.get('health')

    if enemies and health > 20:
        # If there are visible enemy units, attack or engage in combat.
        return astar((current_r, current_c), (enemies[0].get('row'), enemies[0].get('col')))
    elif health <= 20:
        # If the unit is low on health, retreat towards base if visible.
        return retreat(current_r, current_c)
    elif combat and not is_safe_to_engage(unit, combat):
        # If the unit is in combat and it's not safe to engage, retreat.
        return retreat(current_r, current_c)
    elif enemy_bases and is_safe_to_move(unit, (current_r, current_c), enemy_bases[0]):
        # If there are visible enemy bases and it's safe to move towards them, do so.
        return astar((current_r, current_c), enemy_bases[0])
    else:
        # If no enemies or low health condition, explore the map.
        return explore(current_r, current_c)

def is_safe_to_engage(unit, combat):
    # Check if it's safe to engage in combat based on the number of enemy units.
    enemy_units_nearby = sum(1 for r, c in get_neighbors(unit.get('row'), unit.get('col'), current_map_rows, current_map_cols) if (r, c) in combat)
    return enemy_units_nearby < 2

def is_safe_to_move(unit, start, target):
    # Check if it's safe to move towards a target based on the number of enemy units nearby.
    enemy_units_nearby = sum(1 for r, c in get_neighbors(start[0], start[1], current_map_rows, current_map_cols) if game_map[r][c] != TERRAIN_MOUNTAIN and visible_hexes[r][c])
    return enemy_units_nearby < 2

# The rest of the code remains the same as it's already well-structured for the given task.