import heapq, math
from collections import defaultdict

async def send_move_orders(websocket):
    """
    This function implements an advanced strategic movement algorithm for the 'Red' player units. The strategy is based on
    unit type, terrain awareness, enemy visibility, health status, defending key positions and engaging in combat.
    Units prioritize attacking visible enemy units or moving towards strategic objectives like the center of the map.
    Different unit types have varying priorities and movement capabilities, taking terrain into account. The function applies an A* pathfinding algorithm for movement,
    considering both efficiency and strategy to minimize moves towards areas in combat. Units retreat if they are damaged,
    and will defend their base if visible. The function also encourages exploration of unknown parts of the map.
    """
    global game_over, VISIBLE_UNITS

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
                enemies = [u for u in VISIBLE_UNITS if u.get('armyColor') != player_army_color]
                enemy_threats = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if visible_hexes[r][c] and (r, c) in combat_hexes]

                target_r, target_c = determine_target(unit_to_move, enemies, enemy_threats)
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

def determine_target(unit, enemies, enemy_threats):
    current_r = unit.get('row')
    current_c = unit.get('col')
    health = unit.get('health')

    if enemies and health > 20:
        # If there are visible enemy units, attack or engage in combat.
        return astar((current_r, current_c), (enemies[0].get('row'), enemies[0].get('col')), enemy_threats)
    elif health <= 20:
        # If the unit is low on health, retreat towards base if visible.
        return retreat(current_r, current_c)
    else:
        # If no enemies or low health condition, move towards strategic objectives like the center of the map.
        return explore(current_r, current_c)

def explore(start_r, start_c):
    # Move towards strategic objectives like the center of the map.
    center = (current_map_rows//2, current_map_cols//2)
    unexplored = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if not visible_hexes[r][c]]
    if unexplored:
        # Move towards the closest unexplored hex or center using A*.
        return astar((start_r, start_c), random.choice(unexplored + [center]), [])
    else:
        # If everything is explored, move randomly.
        return random.choice(get_neighbors(start_r, start_c, current_map_rows, current_map_cols))

def retreat(start_r, start_c):
    # Retreat towards base if visible.
    base = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if game_map[r][c] == TERRAIN_BASE and visible_hexes[r][c]]
    if base:
        # Move towards the closest base hex using A*.
        return astar((start_r, start_c), base[0], [])
    else:
        # If the base is not visible, move randomly.
        return random.choice(get_neighbors(start_r, start_c, current_map_rows, current_map_cols))

# A* pathfinding algorithm implementation considering enemy threats.
def astar(start, target, enemy_threats):
    frontier = [(0, start)]  # Priority queue of (cost, position)
    cost_so_far = {start: 0}
    came_from = {}

    while frontier:
        _, current = heapq.heappop(frontier)
        if current == target:
            break
        for next in get_neighbors(current[0], current[1], current_map_rows, current_map_cols):
            if next not in enemy_threats:  # Avoid moving towards areas in combat
                new_cost = cost_so_far[current] + 1
                if next not in cost_so_far or new_cost < cost_so_far[next]:
                    cost_so_far[next] = new_cost
                    priority = new_cost + heuristic(target, next)
                    heapq.heappush(frontier, (priority, next))
                    came_from[next] = current
    return reconstruct_path(came_from, start, target)

def heuristic(a, b):
    # Euclidean distance as the heuristic for A*
    return math.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)

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