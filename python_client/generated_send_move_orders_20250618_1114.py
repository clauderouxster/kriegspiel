import random, heapq
from collections import defaultdict

async def send_move_orders(websocket):
    global game_over, current_units, game_map, visible_hexes, combat_hexes, player_army_color, current_map_rows, current_map_cols
    while not game_over:
        if current_units and game_map:
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]
            random.shuffle(red_units)

            orders_sent = 0
            for unit in red_units:
                if orders_sent >= MAX_ORDERS_PER_INTERVAL:
                    break
                unit_id = unit.get('id')
                current_r = unit.get('row')
                current_c = unit.get('col')
                unit_type = unit.get('type')
                health = unit.get('health')
                currentMovePoints = unit.get('currentMovePoints')
                enemies = [u for u in current_units if u.get('armyColor') != player_army_color]
                enemy_threat = sum(enemy['health'] for enemy in enemies if visible_hexes[enemy.get('row')][enemy.get('col')])
                target_r, target_c = determine_target(unit, enemies, enemy_threat)
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

def determine_target(unit, enemies, enemy_threat):
    current_r = unit.get('row')
    current_c = unit.get('col')
    health = unit.get('health')

    # If there are visible enemies and the sum of their health is greater than our unit's health, retreat.
    if enemies and enemy_threat > health:
        return retreat(current_r, current_c)
    # If there are visible enemies and our unit's health is at least 50, attack the nearest enemy.
    elif enemies and health >= 50:
        return astar((current_r, current_c), (enemies[0].get('row'), enemies[0].get('col')))
    # If our unit's health is less than 50, retreat.
    elif enemies and health < 50:
        return retreat(current_r, current_c)
    # If there are no visible enemies or our unit's health is not in danger, explore the map.
    else:
        return explore(current_r, current_c)

def explore(start_r, start_c):
    # Prioritize exploring unknown parts of the map with more visibility.
    unexplored = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if not visible_hexes[r][c]]
    if unexplored:
        # Prioritize areas with more visibility and move towards them using A*.
        unexplored.sort(key=lambda x: sum(visible_hexes[r][c] for r in range(max(0, x[0]-1), min(current_map_rows, x[0]+2)) for c in range(max(0, x[1]-1), min(current_map_cols, x[1]+2))), reverse=True)
        return astar((start_r, start_c), unexplored[0])
    else:
        # If everything is explored, move randomly.
        return random_move(start_r, start_c)

def retreat(start_r, start_c):
    # Retreat towards base if visible.
    base = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if game_map[r][c] == TERRAIN_BASE and visible_hexes[r][c]]
    if base:
        # Move towards the closest base hex using A*.
        return astar((start_r, start_c), base[0])
    else:
        # If the base is not visible, move randomly.
        return random_move(start_r, start_c)

def random_move(current_r, current_c):
    # Move randomly to explore the map.
    return random.choice(get_neighbors(current_r, current_c, current_map_rows, current_map_cols))

# A* pathfinding algorithm implementation.
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