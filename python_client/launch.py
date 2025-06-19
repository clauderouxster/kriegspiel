import openai
import json
import os
import asyncio
import time
import datetime
import subprocess
import re
import ast # Importation du module AST pour la validation de syntaxe
import types # Pour créer un nouveau module
from unittest.mock import AsyncMock, MagicMock # Pour simuler les objets asynchrones et autres dépendances
import traceback # Pour imprimer le traceback complet en cas d'erreur
import random # Pour les fonctions random utilisées par le LLM
import collections # Pour deque si la stratégie l'utilise
import math # math est nécessaire pour float('inf') et d'autres opérations

# --- Configuration pour LM Studio ---
# Assurez-vous que LM Studio est en cours d'exécution et sert le modèle spécifié sur ce port.
LM_STUDIO_API_BASE = "http://localhost:1234/v1" # URL de base de l'API LM Studio par défaut
#LM_STUDIO_API_BASE = "http://192.168.1.125:1234/v1" # URL de base de l'API LM Studio par défaut
LM_STUDIO_MODEL_NAME = "codestral-22b-v0.1-mlx-3" # Nom du modèle exposé par LM Studio

# --- Nom du fichier de sortie et du fichier des scores ---
# Génère un nom de fichier horodaté pour la fonction de mouvement.
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
OUTPUT_FUNCTION_FILE = f"generated_send_move_orders_{timestamp}.py"
SCORES_FILE = "scores.txt" # Nom du fichier où les scores sont enregistrés.

# --- Prompt LLM de base ---
# Ce prompt définit la tâche principale pour le LLM, c'est la base de toute génération.
BASE_LLM_PROMPT = """You are an AI tasked with generating Python code for the `send_move_orders` function within a game client. This function controls the movement of units for the 'Red' player on a hexagonal map. Your goal is to propose various strategies for unit movement.

The `send_move_orders` function will be integrated into an existing Python game client (`red_player.py`). You need to provide **only the complete Python code for the `send_move_orders` function**, including its signature and any necessary imports if they are specific to this function and not already globally available (though assume common ones like `random`, `collections`, `math` are). Do not include any other parts of the `red_player.py` file.

**Global Game State Information Available to `send_move_orders`:**

The `send_move_orders` function has access to the following global variables, which are updated by the `handle_messages` function:

* `game_map`: A 2D list (list of lists) representing the terrain of each hex. `game_map[r][c]` gives the terrain type of the hex at row `r` and column `c`.
* `current_units`: A list of dictionaries, where each dictionary represents a unit. A unit dictionary typically contains:
    * `'id'`: Unique identifier for the unit.
    * `'row'`, `'col'`: Current position of the unit.
    * `'type'`: Unit type (e.g., `UNIT_INFANTERY`, `UNIT_CAVALRY`).
    * `'armyColor'`: The color of the army the unit belongs to (e.g., `ARMY_COLOR_RED`, `ARMY_COLOR_BLUE`).
    * `'health'`: Current health of the unit.
    * `'currentMovePoints'`: Remaining movement points for the current turn.
    * `'lastMoveOrder'`: Information about the unit's last move order, if any.
* `player_army_color`: The color assigned to this player (will be `ARMY_COLOR_RED`).
* `game_time_in_minutes`: Current game time.
* `current_map_rows`, `current_map_cols`: Dimensions of the map.
* `combat_hexes`: A `set` of strings, where each string is a key `"{r},{c}"` representing a hex currently in combat.
* `visible_hexes`: A 2D list of booleans indicating which hexes are currently visible to the player's units. `visible_hexes[r][c]` is `True` if the hex at `(r,c)` is visible, `False` otherwise.
* `unit_code_indexing`: A dictionary mapping encoded unit strings (e.g., "HR110C5F") to their `(r,c)` coordinates. This is primarily for the `generate_map_encoding` function and might not be directly useful for movement decisions.

**Constants and Helper Functions Available:**

You can also use the following constants and helper functions defined in `red_player.py`:

* **Terrain Types:** `TERRAIN_FLAT`, `TERRAIN_MOUNTAIN`, `TERRAIN_HILL`, `TERRAIN_SWAMP`, `TERRAIN_LAKE`, `TERRAIN_FOREST`, `TERRAIN_BASE`, `TERRAIN_UNASSIGNED`.
* **Unit Types:** `UNIT_INFANTERY`, `UNIT_ARTILLERY`, `UNIT_CAVALRY`, `UNIT_SUPPLY`, `UNIT_SCOUT`, `UNIT_GENERAL`.
* **Army Colors:** `ARMY_COLOR_BLUE`, `ARMY_COLOR_RED`.
* `TERRAIN_MOVEMENT_COSTS`: Dictionary defining movement costs for units on different terrains.
* `VISION_RANGES`: Dictionary defining vision ranges for units on different terrains.
* `UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR`: Dictionary defining base movement capabilities.
* `calculate_move_duration_game_minutes(unit_type, terrain_type)`: Calculates move duration.
* `get_neighbors(r, c, rows, cols)`: Returns valid neighboring hex coordinates.
* `is_valid(r, c, rows, cols)`: Checks if coordinates are within map boundaries.
* `MAX_ORDERS_PER_INTERVAL`: Maximum orders to send per interval.
* `MOVE_ORDER_INTERVAL_SECONDS`: Delay between sending batches of orders.

**Your Task:**

Generate the Python code for the `send_move_orders` async function. Each version should implement a distinct movement strategy. Focus on how units decide *where* to move.

**Considerations for your strategies:**

* **Aggression:** Should units prioritize attacking visible enemy units or objectives?
* **Defense/Retreat:** Should damaged units retreat? Should units defend key positions (like the base if visible)?
* **Exploration:** Should units prioritize exploring unknown parts of the map?
* **Unit Roles:** Should different unit types (e.g., Scouts, Cavalry, Infantry, Artillery) have different movement priorities?
* **Terrain:** How should units consider terrain movement costs and benefits (e.g., hills for vision, mountains as barriers)?
* **Combat Avoidance/Engagement:** How should units react to `combat_hexes`?
* **Objective-based play:** While no explicit objectives are given, you can infer or create simple ones (e.g., move towards the center of the map, or towards areas with less visibility).
* **Pathfinding:** Simple adjacency is currently used; more complex pathfinding (e.g., A* to a target) could be considered but keep the output concise.
* **Randomness vs. Determinism:** The current implementation uses random moves. Can you introduce more strategic, less random movements?

**Output Format:**

Provide **only the complete Python code for the `send_move_orders` function**. Do not include any explanation, comments (unless they are within the function itself for clarity), or surrounding code. The code must be valid Python and directly usable to replace the existing `send_move_orders` function.
Make sure EVERY SINGLE FUNCTION is fully fleshed in.
---
"""

SCORE_FUNCTION = '''
```python
def current_score(frontier, current_units, player_army_color):
    """
    Calcule le score de la partie pour le joueur Rouge, en incluant un bonus pour les unités bleues détruites.

    Args:
        fontier: The middle line that separates the Blue camp from the Red camp, 
        current_units (list): Liste des dictionnaires d'unités présentes sur la carte à la fin de la partie.
                              Chaque dictionnaire d'unité contient au moins 'type', 'armyColor', 'health'.
        player_army_color (str): La couleur de l'armée du joueur (doit être ARMY_COLOR_RED).

    Returns:
        int: Le score calculé.
    """
    global UNIT_SCORE_VALUES, ARMY_BLUE_VALUE, INITIAL_UNIT_POSITION

    red_crossing = 0
    blue_crossing = 0
    distance = frontier * 2
    moved = 0
    remaining_blue_units_score = 0
    remaining_red_units_score = 0
    row_gen = 0
    col_gen = 0
    for unit in current_units:
        unit_type = unit.get('type')
        if unit and unit.get('armyColor') != player_army_color and unit.get(unit_type) == UNIT_GENERAL:
            row_gen = unit.get("row")
            col_gen = unit.get("col")
            break

    for unit in current_units:
        # Vérifier si l'unité appartient à l'armée du joueur et a une santé supérieure à 0
        if unit and unit.get('armyColor') == player_army_color and unit.get('health', 0) > 0:
            unit_type = unit.get('type')
            # Ajouter la valeur de l'unité au score, 0 si le type d'unité est inconnu
            remaining_red_units_score += UNIT_SCORE_VALUES.get(unit_type, 0)
            row = unit.get("row")
            col = unit.get("col")
            id = unit.get("id")
            if row <= frontier:
                red_crossing += 10
            distance = min(distance, get_hex_distance(row_gen, col_gen, row, col))
            r_row = INITIAL_UNIT_POSITION[id][0]
            r_col = INITIAL_UNIT_POSITION[id][1]
            moved += get_hex_distance(r_row, r_col, row, col)
        else:
            remaining_blue_units_score += UNIT_SCORE_VALUES.get(unit_type, 0) 
            if unit.get("row") > frontier:
                blue_crossing += 10
    
    final_score = 1000 + remaining_red_units_score + (ARMY_BLUE_VALUE - remaining_blue_units_score)
    final_score += (frontier*2) - distance + red_crossing - blue_crossing + moved
    return final_score
```
'''

EXAMPLE_FUNCTION = """
**Example of a simple (but not necessarily good) `send_move_orders` function (do NOT replicate this, provide a new one):**

```python
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

                possible_targets = []
                for nr, nc in get_neighbors(current_r, current_c, current_map_rows, current_map_cols):
                    try:
                        terrain_type = game_map[nr][nc]
                        if calculate_move_duration_game_minutes(unit_type, terrain_type) != float('inf'):
                            possible_targets.append((nr, nc))
                    except IndexError:
                        pass

                if possible_targets:
                    # Move towards the hex with the lowest row number (simple bias)
                    target_r, target_c = min(possible_targets, key=lambda x: x[0])

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
```

**Now, generate your version of the `send_move_orders` function, implementing a new movement strategy.**
**IMPORTANT:** Provides a precise docstring to explain your strategy.

"""

def get_last_score_entry(scores_file):
    """
    Lit la dernière ligne non vide du fichier des scores et en extrait le nom du fichier et le score.
    Retourne (nom_fichier, score) ou (None, None) si le fichier est vide ou introuvable.
    """
    if not os.path.exists(scores_file):
        return None, None

    best_score = 0.0
    filename = None
    with open(scores_file, 'r') as f:
        lines = f.readlines()
        for line in lines: # Parcours en sens inverse pour trouver la dernière ligne valide.
            line = line.strip()
            if line:
                try:
                    filename, score_str = line.split(':')
                    filename = filename.strip()
                    score = float(score_str.strip())
                    if best_score < score:
                        best_score = score
                        best_file = filename
                except ValueError:
                    print(f"Avertissement: Ligne de score mal formatée ignorée: '{line}'")
                    continue
    if filename == None:
        return None, None, None, None
    return filename, score, best_file, best_score

    

def load_function_from_file(filepath):
    """
    Charge le contenu d'un fichier Python spécifié.
    Retourne le contenu du fichier sous forme de chaîne de caractères, ou None si le fichier n'est pas trouvé.
    """
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return f.read()
    return None

def read_previous_map_data(filename="maps.txt"):
    """Reads the content of maps.txt if it exists."""
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            return f.read()
    return None

# --- Fonctions et constantes de red_player.py pour le pseudo-environnement ---
# Ces éléments sont dupliqués ici pour permettre l'exécution isolée de send_move_orders
# sans importer directement red_player.py (ce qui créerait une dépendance circulaire ou des effets de bord).

# Terrain types
TERRAIN_FLAT = 0
TERRAIN_MOUNTAIN = 1
TERRAIN_HILL = 2
TERRAIN_SWAMP = 3
TERRAIN_LAKE = 4
TERRAIN_FOREST = 5
TERRAIN_BASE = 6
TERRAIN_UNASSIGNED = -1

# Unit types
UNIT_INFANTERY = 0
UNIT_ARTILLERY = 1
UNIT_CAVALRY = 2
UNIT_SUPPLY = 3
UNIT_SCOUT = 4
UNIT_GENERAL = 5

# Army colors
ARMY_COLOR_BLUE = '#0000FF'
ARMY_COLOR_RED = '#FF0000'

TERRAIN_MOVEMENT_COSTS = {
    UNIT_INFANTERY: {
        TERRAIN_FLAT: 1, TERRAIN_MOUNTAIN: 3, TERRAIN_HILL: 2, TERRAIN_SWAMP: 2,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    },
    UNIT_ARTILLERY: {
        TERRAIN_FLAT: 1.5, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 3, TERRAIN_SWAMP: 3,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    },
    UNIT_CAVALRY: {
        TERRAIN_FLAT: 0.8, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 1.5, TERRAIN_SWAMP: 2,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 1.5
    },
    UNIT_SUPPLY: {
        TERRAIN_FLAT: 1, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 2, TERRAIN_SWAMP: 3,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    },
    UNIT_SCOUT: {
        TERRAIN_FLAT: 0.7, TERRAIN_MOUNTAIN: 1, TERRAIN_HILL: 1, TERRAIN_SWAMP: 1,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 1
    },
    UNIT_GENERAL: {
        TERRAIN_FLAT: 1, TERRAIN_MOUNTAIN: 3, TERRAIN_HILL: 2, TERRAIN_SWAMP: 2,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    }
}

UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR = {
    UNIT_INFANTERY: 4,
    UNIT_ARTILLERY: 3,
    UNIT_CAVALRY: 6,
    UNIT_SUPPLY: 3,
    UNIT_SCOUT: 7,
    UNIT_GENERAL: 5
}

VISION_RANGES = {
    UNIT_ARTILLERY: { TERRAIN_BASE: 4, TERRAIN_HILL: 6},
    UNIT_INFANTERY: { TERRAIN_BASE: 4, TERRAIN_HILL: 6, TERRAIN_MOUNTAIN: 8 },
    UNIT_CAVALRY: { TERRAIN_BASE: 4, TERRAIN_HILL: 6 },
    UNIT_SUPPLY: { TERRAIN_BASE: 2 },
    UNIT_SCOUT: { TERRAIN_BASE: 5, TERRAIN_HILL: 10, TERRAIN_MOUNTAIN: 15 },
    UNIT_GENERAL: { TERRAIN_BASE: 7, TERRAIN_HILL: 12, TERRAIN_MOUNTAIN: 17 }
}

MAX_ORDERS_PER_INTERVAL = 10
MOVE_ORDER_INTERVAL_SECONDS = 2

def calculate_move_duration_game_minutes(unit_type, terrain_type):
    """
    Calculates the game minutes needed for a unit to move into a specific hex.
    This is a direct port from the JavaScript constants.js.
    """
    movement_cost = TERRAIN_MOVEMENT_COSTS.get(unit_type, {}).get(terrain_type, float('inf'))

    if movement_cost == float('inf') or movement_cost <= 0:
        return float('inf')

    base_movement_capability_per_hour = UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR.get(unit_type)

    if base_movement_capability_per_hour is None or base_movement_capability_per_hour <= 0:
        return float('inf')

    game_hours = movement_cost / base_movement_capability_per_hour
    game_minutes = game_hours * 60
    return game_minutes

def get_neighbors(r, c, rows, cols):
    """Returns a list of valid neighboring hex coordinates (axial coordinates logic)."""
    neighbors = []
    # Votre système de coordonnées semble être (row, col) avec un décalage pour les lignes impaires.
    # Un hex à (r, c) a 6 voisins. Les décalages dépendent si la ligne 'r' est paire ou impaire.
    if r % 2 == 0: # Ligne paire (col - 1, col, col + 1)
        potential_neighbors = [
            (r, c + 1), (r, c - 1),        # Est, Ouest
            (r - 1, c), (r - 1, c - 1),    # Nord-Est, Nord-Ouest
            (r + 1, c), (r + 1, c - 1)     # Sud-Est, Sud-Ouest
        ]
    else: # Ligne impaire (col, col + 1)
        potential_neighbors = [
            (r, c + 1), (r, c - 1),        # Est, Ouest
            (r - 1, c + 1), (r - 1, c),    # Nord-Est, Nord-Ouest
            (r + 1, c + 1), (r + 1, c)     # Sud-Est, Sud-Ouest
        ]

    for nr, nc in potential_neighbors:
        if 0 <= nr < rows and 0 <= nc < cols:
            neighbors.append((nr, nc))
    return neighbors

def is_valid(r, c, rows, cols):
    """Checks if the given row and column are within the map boundaries."""
    return 0 <= r < rows and 0 <= c < cols

# --- Fin des fonctions et constantes de red_player.py pour le pseudo-environnement ---

async def validate_and_run_generated_function(generated_code):
    """
    Valide la syntaxe et tente d'exécuter la fonction générée dans un pseudo-environnement.
    Retourne True si la fonction est valide et exécutable sans erreur, False sinon.
    """
    print("\n--- Validation de la fonction générée ---")
    try:
        # 1. Vérification de la syntaxe
        print("1. Vérification de la syntaxe...")
        ast.parse(generated_code)
        print("   Syntaxe valide.")

        # 2. Préparation du pseudo-environnement
        print("2. Préparation du pseudo-environnement...")
        # Créer un nouvel espace de noms pour exécuter le code
        pseudo_globals = {
            'asyncio': asyncio,
            'json': json,
            'random': random,
            'math': math, # math est nécessaire pour float('inf') et d'autres opérations
            'collections': collections, # Pour deque si la stratégie l'utilise
            'float': float, # float('inf') est utilisé
            # Constantes du jeu
            'TERRAIN_FLAT': TERRAIN_FLAT, 'TERRAIN_MOUNTAIN': TERRAIN_MOUNTAIN, 'TERRAIN_HILL': TERRAIN_HILL,
            'TERRAIN_SWAMP': TERRAIN_SWAMP, 'TERRAIN_LAKE': TERRAIN_LAKE, 'TERRAIN_FOREST': TERRAIN_FOREST,
            'TERRAIN_BASE': TERRAIN_BASE, 'TERRAIN_UNASSIGNED': TERRAIN_UNASSIGNED,
            'UNIT_INFANTERY': UNIT_INFANTERY, 'UNIT_ARTILLERY': UNIT_ARTILLERY, 'UNIT_CAVALRY': UNIT_CAVALRY,
            'UNIT_SUPPLY': UNIT_SUPPLY, 'UNIT_SCOUT': UNIT_SCOUT, 'UNIT_GENERAL': UNIT_GENERAL,
            'ARMY_COLOR_BLUE': ARMY_COLOR_BLUE, 'ARMY_COLOR_RED': ARMY_COLOR_RED,
            'TERRAIN_MOVEMENT_COSTS': TERRAIN_MOVEMENT_COSTS,
            'VISION_RANGES': VISION_RANGES,
            'UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR': UNIT_BASE_MOVEMENT_CAPABILITY_PER_HOUR,
            'MAX_ORDERS_PER_INTERVAL': MAX_ORDERS_PER_INTERVAL,
            'MOVE_ORDER_INTERVAL_SECONDS': MOVE_ORDER_INTERVAL_SECONDS,
            # Fonctions utilitaires du jeu
            'calculate_move_duration_game_minutes': calculate_move_duration_game_minutes,
            'get_neighbors': get_neighbors,
            'is_valid': is_valid,
            # Variables d'état global (mockées ou avec des valeurs par défaut)
            'game_map': [[TERRAIN_FLAT for _ in range(10)] for _ in range(10)], # Carte 10x10 simple
            'current_units': [ # Unités factices pour les tests
                {'id': 'u1', 'row': 0, 'col': 0, 'type': UNIT_INFANTERY, 'armyColor': ARMY_COLOR_RED, 'health': 100, 'currentMovePoints': 5, 'lastMoveOrder': None},
                {'id': 'u2', 'row': 1, 'col': 1, 'type': UNIT_CAVALRY, 'armyColor': ARMY_COLOR_RED, 'health': 80, 'currentMovePoints': 8, 'lastMoveOrder': None},
                {'id': 'u3', 'row': 5, 'col': 5, 'type': UNIT_ARTILLERY, 'armyColor': ARMY_COLOR_BLUE, 'health': 120, 'currentMovePoints': 0, 'lastMoveOrder': None}
            ],
            'player_army_color': ARMY_COLOR_RED,
            'game_time_in_minutes': 0,
            'current_map_rows': 10,
            'current_map_cols': 10,
            'VISIBLE_UNITS':[],
            'combat_hexes': set(),
            'visible_hexes': [[True for _ in range(10)] for _ in range(10)], # Tout visible pour le test
            'game_over': False, # Important pour la boucle `while not game_over`
            'unit_code_indexing': {} # Peut être vide pour la validation simple
        }

        # Créer un module temporaire pour contenir la fonction et ses dépendances
        # Cela simule l'environnement de red_player.py sans l'importer directement.
        temp_module = types.ModuleType("temp_game_logic")
        for name, value in pseudo_globals.items():
            setattr(temp_module, name, value)

        # Exécuter le code généré dans l'espace de noms du module temporaire
        # Cela permettra au code généré d'accéder aux "variables globales" définies.
        exec(generated_code, temp_module.__dict__)
        print("   Code exécuté dans le pseudo-environnement.")

        # Vérifier si la fonction send_move_orders a été définie
        if not hasattr(temp_module, 'send_move_orders'):
            print("Erreur: La fonction 'send_move_orders' n'a pas été trouvée dans le code généré.")
            return False

        send_move_orders_func = temp_module.send_move_orders

        # Vérifier si c'est une fonction async
        if not asyncio.iscoroutinefunction(send_move_orders_func):
            print("Erreur: 'send_move_orders' doit être une fonction asynchrone (async def).")
            return False

        # 3. Exécution simulée de la fonction
        print("3. Exécution simulée de la fonction 'send_move_orders'...")
        # Mocking de l'objet websocket
        mock_websocket = AsyncMock() # Simule un websocket asynchrone

        # Temporairement, remplacer asyncio.sleep pour ne pas bloquer les tests.
        original_sleep = asyncio.sleep
        async def mock_sleep(delay):
            if delay > 0.1: # Ne pas simuler de longs sleeps
                print(f"   (Simulation: skipping long sleep of {delay}s)")
            await original_sleep(0.001) # Un très court sleep pour laisser le contrôle

        temp_module.asyncio.sleep = mock_sleep # Injecter le mock dans le pseudo-environnement

        # Créez une instance de l'objet game_over comme un objet mutable.
        # On ne peut pas mocker `global game_over` directement.
        # Le moyen le plus simple est de s'assurer que `game_over` est accessible et modifiable
        # dans l'espace de noms du module temporaire.
        temp_module.game_over = False

        # Exécuter la coroutine. `asyncio.wait_for` est utile pour les timeouts.
        # On va laisser la fonction s'exécuter pendant un court instant.
        # Si elle entre dans une boucle infinie ou lève une erreur, le timeout ou l'exception nous le dira.
        try:
            # Créer une tâche pour la fonction
            task = asyncio.create_task(send_move_orders_func(mock_websocket))
            # Attendre un court instant. Si elle se termine naturellement, c'est bien.
            # Sinon, le timeout lèvera une exception.
            await asyncio.wait_for(task, timeout=0.5) # Attendre 0.5 seconde maximum
            print("   Exécution simulée terminée (possiblement bouclée, mais sans erreur immédiate).")
        except asyncio.TimeoutError:
            print("   L'exécution simulée a dépassé le délai imparti (boucle probable). C'est normal pour cette fonction.")
            task.cancel() # Annuler la tâche
            await asyncio.gather(task, return_exceptions=True) # Attendre l'annulation
        except Exception as e:
            print(f"   Erreur d'exécution détectée: {e}")
            print(f"   Traceback:\n{traceback.format_exc()}") # Imprimer le traceback complet
            return False

        # Restaurer asyncio.sleep
        temp_module.asyncio.sleep = original_sleep

        print("   La fonction semble fonctionnelle dans le pseudo-environnement.")
        return True

    except SyntaxError as e:
        print(f"Erreur de syntaxe dans le code généré:\n{e}")
        print(f"Code généré incriminé:\n{generated_code}")
        return False
    except Exception as e:
        print(f"Une erreur inattendue est survenue lors de la validation:\n{e}")
        print(f"Code généré:\n{generated_code}")
        return False

def call_llm(client, current_prompt):
    stream = client.chat.completions.create(
        model=LM_STUDIO_MODEL_NAME,
        messages=[
            {"role": "user", "content": current_prompt}
        ],
        temperature=0.7, # Ajustez la température pour des stratégies plus ou moins créatives.
        stream=True # Activer le mode streaming
    )

    full_content_from_stream = ""
    for chunk in stream:
        if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
            full_content_from_stream += chunk.choices[0].delta.content
            # Optionnel: afficher le contenu au fur et à mesure pour un feedback immédiat
            print(chunk.choices[0].delta.content, end='', flush=True)
    return full_content_from_stream


async def generate_and_save_move_orders_function():
    """
    Se connecte à LM Studio, génère la fonction send_move_orders, et la sauvegarde dans un fichier.
    Inclut une logique de réessai pour la génération LLM et d'amélioration itérative basée sur les scores précédents.
    """
    client = openai.OpenAI(base_url=LM_STUDIO_API_BASE, api_key="lm-studio")

    max_llm_retries = 5
    retry_count = 0
    generated_code = "" # Initialise à une chaîne vide pour concaténation
    
    # Le prompt LLM actuel commence avec le prompt de base.
    current_llm_prompt = BASE_LLM_PROMPT
    previous_battle_status = ""
    # --- Tente de charger la meilleure fonction précédente pour l'amélioration itérative ---
    last_file, last_score, best_file, best_score = get_last_score_entry(SCORES_FILE)
    if last_file and last_score is not None:
        best_function_code = None
        old_function_code = load_function_from_file(last_file)
        if last_file != best_file:
            print("Meilleur:", best_file)
            best_function_code = load_function_from_file(best_file)
        the_last_map = read_previous_map_data("maps.txt")
        if old_function_code:
            # Construit le message de guidage pour le LLM, incluant l'ancienne fonction et son score.
            improvement_guidance = (
                f"The previous version of the `send_move_orders` function from `{last_file}` achieved a score of {last_score:.2f}.\n"
                f"Here is the code for that function:\n```python\n{old_function_code}\n```\n"
                f"Please analyze this function and generate a **new, improved version** of `send_move_orders` "
                f"that aims to achieve a higher score. Focus on refining its strategy based on potential weaknesses "
                f"or new ideas for unit movement. The goal is to make the Red player more effective."
            )
            best_guidance = ""
            if best_function_code:
                best_guidance = (
                    f"The last best version of the `send_move_orders` function from `{best_file}` achieved a score of {best_score:.2f}.\n"
                    f"Here is the code for that function:\n```python\n{best_function_code}\n```\n"
                    f"Please takes this function into account when generating a `send_move_orders` "
                )

            last_map = ""
            if the_last_map:
                pos = the_last_map.find("RG")
                general = the_last_map[pos-1:pos+4]
                last_map = (
                    f"This is the final encoded map from the previous game. Use this information to learn and adapt your strategy." 
                    f"Each line represents a row, with hexes encoded as 'TCUHF' (Terrain, Color, UnitType, Health, Fight)." 
                    f"The most important piece is the General: `{general}`."
                    f"'0' means not visible.\n\n```\n{the_last_map}\n```\n\n--- End Previous Game Map Data ---\n\n"                    
                )
                previous_battle_status = "Here is the last functions that were generated ```python{old_function_code}```, together with he final map, when RED lost."
                previous_battle_status += last_map + "\n\n"
                previous_battle_status += "Please provides an explanation of why RED lost here, and how it could be improved.\n"
                previous_battle_status += f"Takes into consideration the position of the most important piece, the general: `{general}`."
                previous_battle_status += f"Takes also into consideration whether your units were deployed enough and were aggressive enough to threaten the Blue General. \n\n"
                previous_battle_status += f"Here is the function that is used to compute the score: {SCORE_FUNCTION}\n"                
                previous_battle_status = call_llm(client, previous_battle_status)
                with open("report_on_map.md", "a") as f:
                    the_time = datetime.datetime.now().strftime("%Y%m%d_%H%M")
                    f.write("---------------------------------------------------------------\n")
                    f.write(the_time+"\n")
                    f.write(previous_battle_status+"\n")
            
            # Prépend le guidage d'amélioration au prompt de base.
            current_llm_prompt = improvement_guidance + "\n\n" + best_guidance + "\n\n" + BASE_LLM_PROMPT + "\n\n" + previous_battle_status
            print(current_llm_prompt)
            print(f"\n--- Amélioration itérative ---")
            print(f"La fonction précédente '{last_file}' a obtenu un score de {last_score:.2f}.")
            print("Le LLM sera invité à améliorer cette fonction.")
        else:
            print(f"Avertissement: Le fichier de la fonction précédente '{last_file}' n'a pas pu être lu. Génération à partir de zéro.")
    else:
        current_llm_prompt = BASE_LLM_PROMPT + EXAMPLE_FUNCTION
        print("\n--- Première génération ---")
        print("Aucun score précédent trouvé. Génération d'une nouvelle fonction de base.")

    # Boucle de réessai pour la génération LLM.
    while retry_count < max_llm_retries:
        print(f"Connexion à LM Studio à {LM_STUDIO_API_BASE} pour générer la fonction send_move_orders (Tentative {retry_count + 1}/{max_llm_retries})...")
        print("Génération en cours (streaming)...")
        try:
            full_content_from_stream = call_llm(client, current_llm_prompt)

            # Utilise une expression régulière pour extraire le bloc de code Python de manière robuste.
            match = re.search(r"```python\s*(.*?)\s*```", full_content_from_stream, re.DOTALL | re.IGNORECASE)
            
            if match:
                extracted_code = match.group(1).strip()
                # Vérifie si le code extrait correspond à la signature attendue de la fonction.
                if "async def send_move_orders(websocket):" in extracted_code:
                    generated_code = extracted_code
                    # --- Appel à la fonction de validation améliorée ---
                    if await validate_and_run_generated_function(generated_code):
                        break # Code valide et exécutable, sortir de la boucle de réessai.
                    else:
                        print("La fonction générée a échoué à la validation ou à l'exécution simulée. Nouvelle tentative de génération.")
                        retry_count += 1
                        time.sleep(1) # Petit délai avant de réessayer.
                else:
                    print("Avertissement : Bloc de code Python trouvé, mais il ne commence pas par la signature de fonction attendue.")
                    print("Nouvelle tentative de génération par le LLM...")
                    retry_count += 1
                    time.sleep(1) # Petit délai avant de réessayer.
            else:
                print("Avertissement : Aucun bloc de code '```python' trouvé dans la réponse du LLM. Nouvelle tentative de génération par le LLM...")
                retry_count += 1
                time.sleep(1) # Petit délai avant de réessayer.

        except openai.APIConnectionError as e:
            print(f"Impossible de se connecter à l'API LM Studio : {e}")
            print(f"Veuillez vous assurer que LM Studio est en cours d'exécution et que son serveur est accessible à {LM_STUDIO_API_BASE}")
            retry_count += 1
            time.sleep(5) # Délai plus long pour les problèmes de connexion.
        except Exception as e:
            print(f"Une erreur inattendue est survenue lors de la génération LLM : {e}")
            retry_count += 1
            time.sleep(1) # Petit délai pour les autres erreurs.

    if generated_code and await validate_and_run_generated_function(generated_code): # Double vérification pour le cas où la boucle a été brisée avant la validation finale
        # Sauvegarde le code généré dans le fichier de sortie.
        with open(OUTPUT_FUNCTION_FILE, "w") as f:
            f.write(generated_code)
        
        print(f"\nFonction 'send_move_orders' générée et sauvegardée avec succès dans {OUTPUT_FUNCTION_FILE}")
        
        # Attendre l'entrée de l'utilisateur avant de lancer red_player.py.
        user_input = input("\nAppuyez sur Entrée pour lancer red_player.py avec la stratégie générée, ou tapez 'q' pour quitter : ")

        if user_input.lower() != 'q':
            red_player_script_name = "red_player.py"
            generated_function_file_name = os.path.basename(OUTPUT_FUNCTION_FILE)
            
            # Construit la commande pour exécuter red_player.py avec le fichier de fonction généré.
            command = ["python", red_player_script_name, generated_function_file_name]
            print(f"\n--- Lancement de {red_player_script_name} avec {generated_function_file_name} ---")
            print(f"Exécuter la commande: {' '.join(command)}")
            
            try:
                # Exécute la commande en tant que sous-processus.
                subprocess.run(command, check=True)
                print(f"\n{red_player_script_name} a terminé son exécution.")
            except subprocess.CalledProcessError as e:
                print(f"Erreur lors de l'exécution de {red_player_script_name}: {e}")
            except FileNotFoundError:
                print(f"Erreur: '{red_player_script_name}' ou 'python' n'a pas été trouvé. Assurez-vous qu'ils sont dans le PATH ou le répertoire courant.")
        else:
            print("Lancement annulé par l'utilisateur.")

        print("\nAssurez-vous que votre serveur de jeu (Node.js) est également en cours d'exécution.")
    else:
        print(f"\nÉchec de la génération et de la validation d'une fonction 'send_move_orders' valide après {max_llm_retries} tentatives.")
        print("Veuillez vérifier le serveur et le modèle LM Studio, ou ajuster le prompt/la température.")

if __name__ == "__main__":
    # Point d'entrée principal : lance la fonction asynchrone.
    asyncio.run(generate_and_save_move_orders_function())
