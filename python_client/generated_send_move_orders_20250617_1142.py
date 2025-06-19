async def send_move_orders(websocket):
    """
    This function implements a strategic movement strategy for the Red player's units. The units will prioritize
    moving towards areas of lower visibility and avoid combat, while also defending the base if visible.
    Units will also consider terrain movement costs and benefits, with a preference for moving towards the center
    of the map.
    """

    global game_over

    while not game_over:
        if current_units and game_map:
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]
            #red_units = sorted(red_units, key=lambda unit: VISION_RANGES[unit.get('type')], reverse=True)

            orders_sent = 0
            for unit_to_move in red_units:
                if orders_sent >= MAX_ORDERS_PER_INTERVAL:
                    break

                unit_id = unit_to_move.get('id')
                current_r = unit_to_move.get('row')
                current_c = unit_to_move.get('col')
                unit_type = unit_to_move.get('type')

                possible_targets = []
                for nr, nc in get_neighbors(current_r, current_c, current_map_rows, current_map_cols):
                    try:
                        terrain_type = game_map[nr][nc]
                        if (calculate_move_duration_game_minutes(unit_type, terrain_type) != float('inf') and
                                f"{nr},{nc}" not in combat_hexes):
                            visibility = visible_hexes[nr][nc]
                            distance_from_center = abs(nr - current_map_rows / 2) + abs(nc - current_map_cols / 2)
                            cost = TERRAIN_MOVEMENT_COSTS[unit_type][terrain_type]
                            possible_targets.append((nr, nc, visibility, distance_from_center, cost))
                    except IndexError:
                        pass

                if possible_targets:
                    # Move towards the hex with the lowest visibility, closest to center, and least costly
                    target_r, target_c, _, _, _ = min(possible_targets, key=lambda x: (x[1], x[2], x[4]))

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
                        game_over = True
                        break
                    except Exception as e:
                        pass
        await asyncio.sleep(MOVE_ORDER_INTERVAL_SECONDS)