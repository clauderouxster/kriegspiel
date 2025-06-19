import random, heapq
from collections import defaultdict

async def send_move_orders(websocket):
    global game_over, current_units, visible_hexes, combat_hexes, player_army_color
    while not game_over:
        if current_units and visible_hexes:
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]
            random.shuffle(red_units)

            enemies = [unit for unit in current_units if unit.get('armyColor') != player_army_color]
            enemy_threat = sum(enemy['health'] for enemy in enemies if visible_hexes[enemy.get('row')][enemy.get('col')])

            orders_sent = 0
            for unit in red_units:
                if orders_sent >= MAX_ORDERS_PER_INTERVAL:
                    break
                unit_id = unit.get('id')
                current_r = unit.get('row')
                current_c = unit.get('col')
                unit_type = unit.get('type')
                health = unit.get('health')

                if enemies and enemy_threat > health:
                    target_r, target_c = retreat(current_r, current_c)
                elif enemies and health > 20:
                    target = get_nearest_enemy(current_r, current_c, enemies)
                    target_r, target_c = astar((current_r, current_c), (target.get('row'), target.get('col')))
                elif health <= 20:
                    target_r, target_c = retreat(current_r, current_c)
                else:
                    target_r, target_c = explore(current_r, current_c)

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

def get_nearest_enemy(start_r, start_c, enemies):
    nearest = None
    min_distance = float('inf')
    for enemy in enemies:
        distance = abs(start_r - enemy.get('row')) + abs(start_c - enemy.get('col'))
        if distance < min_distance:
            min_distance = distance
            nearest = enemy
    return nearest

def explore(start_r, start_c):
    unexplored = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if not visible_hexes[r][c]]
    if unexplored:
        return astar((start_r, start_c), random.choice(unexplored))
    else:
        return random.choice(get_neighbors(start_r, start_c, current_map_rows, current_map_cols))

def retreat(start_r, start_c):
    base = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if game_map[r][c] == TERRAIN_BASE and visible_hexes[r][c]]
    if base:
        return astar((start_r, start_c), base[0])
    else:
        return random.choice(get_neighbors(start_r, start_c, current_map_rows, current_map_cols))

def astar(start, target):
    frontier = [(0, start)]
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
    return abs(a[0] - b[0]) + abs(a[1] - b[1])

def reconstruct_path(came_from, start, target):
    current = target
    path = []
    while current != start:
        path.append(current)
        if current not in came_from:
            return (-1, -1)
        current = came_from[current]
    path.append(start)
    return path[-2]