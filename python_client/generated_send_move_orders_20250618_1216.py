import random, heapq
from collections import defaultdict

async def send_move_orders(websocket):
    global game_over, VISIBLE_UNITS, combat_hexes

    while not game_over:
        if current_units and game_map:
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]
            random.shuffle(red_units)

            orders_sent = 0
            for unit in red_units:
                if orders_sent >= MAX_ORDERS_PER_INTERVAL:
                    break

                target = determine_target(unit, [u for u in VISIBLE_UNITS if u.get('armyColor') != player_army_color])
                if target is not None:
                    move_order = {
                        'type': 'MOVE_ORDER',
                        'unitId': unit.get('id'),
                        'targetR': target[0],
                        'targetC': target[1]
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
    if unit.get('health') <= 20:
        # Retreat if health is low
        return retreat(unit)
    elif enemies and not any(hex in combat_hexes for hex in get_neighbors(unit.get('row'), unit.get('col'), current_map_rows, current_map_cols)):
        # Attack enemy if visible and not in combat
        return astar((unit.get('row'), unit.get('col')), (enemies[0].get('row'), enemies[0].get('col')))
    elif not all(visible_hexes[r][c] for r in range(current_map_rows) for c in range(current_map_cols)):
        # Explore if there are unexplored hexes
        return explore(unit)
    else:
        # Move towards the center of the map if no enemies or unexplored hexes
        return astar((unit.get('row'), unit.get('col')), (current_map_rows // 2, current_map_cols // 2))

def explore(unit):
    unexplored = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if not visible_hexes[r][c]]
    if unexplored:
        return astar((unit.get('row'), unit.get('col')), random.choice(unexplored))
    else:
        return None

def retreat(unit):
    base = [(r, c) for r in range(current_map_rows) for c in range(current_map_cols) if game_map[r][c] == TERRAIN_BASE and visible_hexes[r][c]]
    if base:
        return astar((unit.get('row'), unit.get('col')), base[0])
    else:
        return None

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
            return None
        current = came_from[current]
    path.append(start)
    return path[-2]