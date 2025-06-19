import random
import asyncio
import json
import websockets

async def send_move_orders(websocket):
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

                enemies_in_sight = [unit for unit in current_units if unit.get('armyColor') != player_army_color and visible_hexes[unit.get('row')][unit.get('col')]]
                potential_targets = []

                # Aggressive strategy: Prioritize attacking visible enemies
                if enemies_in_sight:
                    for enemy in enemies_in_sight:
                        neighbors = get_neighbors(enemy.get('row'), enemy.get('col'), current_map_rows, current_map_cols)
                        for nr, nc in neighbors:
                            terrain_type = game_map[nr][nc]
                            if calculate_move_duration_game_minutes(unit_type, terrain_type) != float('inf') and (nr, nc) not in combat_hexes:
                                potential_targets.append((nr, nc))

                # If no enemy in sight or potential targets, explore unknown regions
                if not potential_targets:
                    for nr, nc in get_neighbors(current_r, current_c, current_map_rows, current_map_cols):
                        if not visible_hexes[nr][nc] and calculate_move_duration_game_minutes(unit_type, game_map[nr][nc]) != float('inf') and (nr, nc) not in combat_hexes:
                            potential_targets.append((nr, nc))

                # If still no potential targets and unit is not a scout, retreat back to a safe location
                if not potential_targets and unit_type != UNIT_SCOUT:
                    for nr, nc in get_neighbors(current_r, current_c, current_map_rows, current_map_cols):
                        if visible_hexes[nr][nc] and calculate_move_duration_game_minutes(unit_type, game_map[nr][nc]) != float('inf') and (nr, nc) not in combat_hexes:
                            potential_targets.append((nr, nc))

                # Finally, if still no potential targets, stay put and explore the current hex
                if not potential_targets:
                    potential_targets.append((current_r, current_c))

                # Move towards the target with the least movement cost and not in combat
                target_r, target_c = min(potential_targets, key=lambda x: TERRAIN_MOVEMENT_COSTS[game_map[x[0]][x[1]]])

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