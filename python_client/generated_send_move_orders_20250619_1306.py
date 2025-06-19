async def send_move_orders(websocket):
    global game_over

    while not game_over:
        if current_units and game_map:
            # Find only units belonging to this player (Red)
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]
            red_general = next((unit for unit in red_units if unit.get('type') == 'UNIT_GENERAL'), None)
            enemy_units = [unit for unit in current_units if unit.get('armyColor') != player_army_color]
            enemy_general = next((unit for unit in enemy_units if unit.get('type') == 'UNIT_GENERAL'), None)

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

                # Prioritize attacking enemy units if they are visible and the unit is offensive
                target_r, target_c = get_target(unit_to_move, red_general, enemy_units)

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

def get_target(unit, red_general, enemy_units):
    # If the unit is not a general and there are visible enemy units, engage them if the unit is offensive
    if unit.get('type') != 'UNIT_GENERAL' and enemy_units:
        target = engage_enemy(unit, enemy_units) if is_offensive_unit(unit.get('type')) else None
    # Otherwise, prioritize protecting the general
    else:
        target = protect_general(unit, red_general)

    # If a valid target was found, return its coordinates
    if target:
        return target.get('row'), target.get('col')
    # Otherwise, return None, indicating that the unit should explore unknown areas
    else:
        return None, None

def is_offensive_unit(unit_type):
    # Check if a unit can deal damage to Blue's units
    return unit_type in ['UNIT_INFANTERY', 'UNIT_ARTILLERY', 'UNIT_CAVALRY', 'UNIT_GENERAL']

def engage_enemy(unit, enemy_units):
    # Find the nearest visible enemy unit and return it as a target
    return min(enemy_units, key=lambda u: distance((unit.get('row'), unit.get('col')), (u.get('row'), u.get('col'))))

def protect_general(unit, red_general):
    # If the unit is not the general, it should prioritize moving towards the general
    if unit != red_general:
        return red_general
    # Otherwise, it should hold its position to protect itself
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