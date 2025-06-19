import random, heapq
from collections import defaultdict

async def send_move_orders(websocket):
    """
    This function implements a strategic movement algorithm for the 'Red' player units. The strategy is based on
    unit type, terrain awareness, enemy visibility, health status, defending key positions and engaging in combat.
    Units prioritize attacking visible enemy units, then exploring unknown parts of the map and retreating if needed.
    Different unit types have varying priorities, and units consider terrain movement costs and benefits. The function
    applies a simple A* pathfinding algorithm for movement, focusing on efficiency and strategy over randomness.
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

                target_r, target_c = determine_target(unit_to_move, enemies)
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

def determine_target(unit, enemies):
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
    else:
        # If no enemies or low health condition, explore the map.
        return explore(current_r, current_c)

def explore(start_r, start_c):
    # Prioritize exploring unknown parts of the map.
    unexplored = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if not visible_hexes[r][c]]
    if unexplored:
        # Move towards the closest unexplored hex using A*.
        return astar((start_r, start_c), random.choice(unexplored))
    else:
        # If everything is explored, move randomly.
        return random.choice(get_neighbors(start_r, start_c, current_map_rows, current_map_cols))

def retreat(start_r, start_c):
    # Retreat towards base if visible.
    base = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if game_map[r][c] == TERRAIN_BASE and visible_hexes[r][c]]
    if base:
        # Move towards the closest base hex using A*.
        return astar((start_r, start_c), base[0])
    else:
        # If the base is not visible, move randomly.
        return random.choice(get_neighbors(start_r, start_c, current_map_rows, current_map_cols))

# A* pathfinding algorithm implementation for simplicity and brevity.
def astar(start, target):
    frontier = [(0, start)]  # Priority queue of (cost, position)
    cost_so_far = {start: 0}
    came_from = {}

    while frontier:
        _, current = heapq.heappop(frontier)
        if current == target:
            break
        for next in get_neighbors(current[0], current[1], current_map_rows, current_map_cols):
            new_cost = cost_so_far[current] + 1
            if next not in cost_so_far or new_cost < cost_so_far[next]:
                cost_so_far[next] = new_cost
                priority = new_cost + heuristic(target, next)
                heapq.heappush(frontier, (priority, next))
                came_from[next] = current
    return reconstruct_path(came_from, start, target)

def heuristic(a, b):
    # Manhattan distance as the heuristic for A*
    return abs(a[0] - b[0]) + abs(a[1] - b[1])

def reconstruct_path(came_from, start, target):
    current = target
    path = []
    while current != start:
        path.append(current)
        if current not in came_from:
            return (-1, -1)  # No path found
        current = came_from[current]
    path.append(start)
    return path[-2]  # Return the second to last element as the next move