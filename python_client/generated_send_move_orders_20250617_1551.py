async def send_move_orders(websocket):
    """
    This function implements a strategic movement strategy for the Red player's units.
    The strategy focuses on prioritizing exploration, retreating for damaged units and avoiding combat if possible.
    The movement is also considered based on the terrain type, unit type and visibility of enemy units.
    """
    global game_over

    while not game_over:
        if current_units and game_map:
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]

            for unit_to_move in red_units:
                unit_id = unit_to_move.get('id')
                current_r = unit_to_move.get('row')
                current_c = unit_to_move.get('col')
                unit_type = unit_to_move.get('type')
                current_health = unit_to_move.get('health')

                # If the unit is damaged, it retreats
                if current_health < UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR[unit_type]:
                    target = (current_r - unit_to_move.get('lastMoveOrder')['targetR'],
                              current_c - unit_to_move.get('lastMoveOrder')['targetC'])
                else:
                    # If the unit is not damaged, it explores or moves towards unknown areas
                    possible_targets = []
                    for nr, nc in get_neighbors(current_r, current_c, current_map_rows, current_map_cols):
                        if not is_valid(nr, nc, visible_hexes) or (nr, nc) in combat_hexes:
                            continue  # Avoids combat and unknown areas
                        terrain_type = game_map[nr][nc]
                        movement_cost = TERRAIN_MOVEMENT_COSTS[unit_type][terrain_type]
                        if movement_cost != float('inf'):
                            # Prioritizes flat terrain and vision
                            priority = (terrain_type == TERRAIN_FLAT) + (VISION_RANGES[unit_type][terrain_type] > 0)
                            possible_targets.append((-priority, movement_cost, nr, nc))

                    # If there are possible targets, move to the one with the highest priority and lowest movement cost
                    if possible_targets:
                        _, _, target_r, target_c = min(possible_targets)
                    else:  # If there are no possible targets, stay in place
                        target_r = current_r
                        target_c = current_c

                move_order = {
                    'type': 'MOVE_ORDER',
                    'unitId': unit_id,
                    'targetR': target_r,
                    'targetC': target_c
                }
                try:
                    await websocket.send(json.dumps(move_order))
                except Exception as e:
                    pass
        await asyncio.sleep(MOVE_ORDER_INTERVAL_SECONDS)