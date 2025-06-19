async def send_move_orders(websocket):
    global game_over

    while not game_over:
        if current_units and game_map:
            # Find only units belonging to this player (Red)
            red_units = [unit for unit in current_units if unit.get('armyColor') == player_army_color]
            red_general = next((unit for unit in red_units if unit.get('type') == 'UNIT_GENERAL'), None)
            enemy_units = [unit for unit in current_units if unit.get('armyColor') != player_army_color]
            enemy_general = next((unit for unit in enemy_units if unit.get('type') == 'UNIT_GENERAL'), None)

            # Prioritize protecting the general
            if red_general:
                protect_general(red_units, red_general)

            # Engage enemy units if they are visible and within range
            engage_enemy(red_units, enemy_units)

            # Explore unknown areas if no enemy units are near
            explore_unknown(red_units, enemy_units)

            for unit in red_units:
                if 'targetR' in unit and 'targetC' in unit:
                    # Send move order to the target location if it exists
                    try:
                        await send_move_order(websocket, unit)
                    except websockets.exceptions.ConnectionClosedOK:
                        print("Connection closed, cannot send move order.")
                        game_over = True
                        break
                    except Exception as e:
                        print(f"Error sending move order for unit {unit.get('id')}: {e}")
                else:
                    # Unit has no target, so it holds its position
                    pass
        else:
            # No map or units yet, wait for the game to start
            pass

        await asyncio.sleep(MOVE_ORDER_INTERVAL_SECONDS) # Wait for the next batch

def protect_general(red_units, general):
    # Prioritize protecting the general by positioning friendly units around it
    # This can be done by calculating a target location for each unit to move towards and updating their 'targetR' and 'targetC' properties
    # The exact implementation of this function will depend on the specific game rules and unit capabilities, but it could involve considering unit types, movement costs, and threat levels
    pass  # Implement this function according to your strategy

def engage_enemy(red_units, enemy_units):
    # Engage enemy units if they are visible and within range by prioritizing movement towards them
    # This could involve calculating the shortest path to each enemy unit and updating the 'targetR' and 'targetC' properties of friendly units
    # The exact implementation of this function will depend on the specific game rules and unit capabilities, but it could involve considering unit types, movement costs, and threat levels
    pass  # Implement this function according to your strategy

def explore_unknown(red_units, enemy_units):
    # Explore unknown areas if no enemy units are near by prioritizing movement towards unexplored hexes
    # This could involve using a map exploration algorithm to determine the best unexplored hexes to move towards and updating the 'targetR' and 'targetC' properties of friendly units
    # The exact implementation of this function will depend on the specific game rules and unit capabilities, but it could involve considering unit types, movement costs, and threat levels
    pass  # Implement this function according to your strategy

async def send_move_order(websocket, unit):
    move_order = {
        'type': 'MOVE_ORDER',
        'unitId': unit.get('id'),
        'targetR': unit.get('targetR'),
        'targetC': unit.get('targetC')
    }
    await websocket.send(json.dumps(move_order))
    print(f"Sent MOVE_ORDER for unit {unit.get('id')} to ({unit.get('targetR')}, {unit.get('targetC')})")