async def send_move_orders(websocket):
    global game_over

    while not game_over:
        if current_units and game_map:
            # Find only units belonging to this player (Red)
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]

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

                # Get valid neighbors
                possible_targets = []
                for nr, nc in get_neighbors(current_r, current_c, current_map_rows, current_map_cols):
                    try:
                        terrain_type = game_map[nr][nc]
                        # Check if terrain is passable for the unit type
                        if calculate_move_duration_game_minutes(unit_type, terrain_type) != float('inf'):
                            possible_targets.append((nr, nc))
                    except IndexError:
                        pass # Ignore out-of-bounds neighbors

                if possible_targets:
                    # Choose a random valid adjacent target hex
                    target_r, target_c = random.choice(possible_targets)

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
                    # print(f"Unit {unit_id} at ({current_r}, {current_c}) has no valid adjacent moves.")
                    pass # This unit cannot move right now
        else:
            # print("Waiting for initial game state and units...")
            pass # No map or units yet

        await asyncio.sleep(MOVE_ORDER_INTERVAL_SECONDS) # Wait for the next batch
