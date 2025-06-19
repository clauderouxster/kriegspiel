async def send_move_orders(websocket):
    global game_over

    while not game_over:
        if current_units and game_map:
            # Find only units belonging to this player (Red)
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]
            red_general = next((unit for unit in red_units if unit.get('type') == 'UNIT_GENERAL'), None)
            enemy_units = [unit for unit in current_units if unit.get('armyColor') != player_army_color]
            enemy_general = next((unit for unit in enemy_units if unit.get('type') == 'UNIT_GENERAL'), None)
            enemy_base = next((unit for unit in enemy_units if unit.get('type') == 'UNIT_BASE'), None)
            frontier_line = (current_map_rows // 2, current_map_cols) # Assume frontier line is horizontal middle of the map

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
                health = unit_to_move.get('health')

                # Prioritize protecting the general and engaging enemy units if they are visible
                target_r, target_c = get_target(unit_to_move, red_general, enemy_units, enemy_general, frontier_line)

                # If there is no target from the above function, explore unknown areas by finding unexplored hexes
                if target_r is None or target_c is None:
                    target_r, target_c = explore_unknown(current_r, current_c)
                if target_r is None or target_c is None:
                    continue # This unit cannot move right now

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
            pass # No map or units yet

        await asyncio.sleep(MOVE_ORDER_INTERVAL_SECONDS) # Wait for the next batch

def get_target(unit, red_general, enemy_units, enemy_general, frontier_line):
    # If the unit is not a general and there are visible enemy units, engage them
    if unit.get('type') != 'UNIT_GENERAL' and enemy_units:
        target = engage_enemy(unit, enemy_units)
    # Otherwise, prioritize protecting the general and moving towards the frontier line
    else:
        target = protect_general(unit, red_general) or move_towards_frontier(unit, frontier_line)
        if not target:
            target = engage_enemy(unit, enemy_units) # If general is not under threat and no enemies visible, engage nearby enemy base

    # If a valid target was found, return its coordinates
    if target:
        return target.get('row'), target.get('col')
    # Otherwise, return None, indicating that the unit should explore unknown areas
    else:
        return None, None

def engage_enemy(unit, enemy_units):
    # Find the nearest visible enemy unit and return it as a target
    if unit.get('type') in ['UNIT_INFANTERY', 'UNIT_ARTILLERY']:
        return min(enemy_units, key=lambda u: distance((unit.get('row'), unit.get('col')), (u.get('row'), u.get('col'))))
    elif unit.get('type') in ['UNIT_CAVALRY', 'UNIT_SCOUT']:
        return min(enemy_units, key=lambda u: 0.5 * distance((unit.get('row'), unit.get('col')), (u.get('row'), u.get('col'))) + 0.5 * u.get('health'))
    else:
        return None

def protect_general(unit, red_general):
    # If the unit is not the general, it should prioritize moving towards the general if its health is low
    if unit != red_general and red_general.get('health') < 100:
        return red_general
    # Otherwise, it should hold its position to protect itself
    else:
        return None

def move_towards_frontier(unit, frontier_line):
    # Prioritize moving towards the frontier line
    if distance((unit.get('row'), unit.get('col')), frontier_line) > 3:
        return {'row': frontier_line[0], 'col': frontier_line[1]}
    else:
        return None

def explore_unknown(current_r, current_c):
    # Find the nearest unexplored hex and return its coordinates
    min_distance = float('inf')
    target_r, target_c = None, None
    for r in range(current_map_rows):
        for c in range(current_map_cols):
            if not visible_hexes[r][c]:
                distance = abs(r - current_r) + abs(c - current_c)
                if distance < min_distance:
                    min_distance = distance
                    target_r, target_c = r, c
    return target_r, target_c

def distance(a, b):
    # Calculate the Manhattan distance between two points
    return abs(a[0] - b[0]) + abs(a[1] - b[1])