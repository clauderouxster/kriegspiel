import openai
import json
import os
import asyncio
import time
import datetime
import subprocess
import re # Importation pour les expressions régulières, pour une extraction robuste du code

# --- Configuration pour LM Studio ---
# Assurez-vous que LM Studio est en cours d'exécution et sert le modèle spécifié sur ce port.
LM_STUDIO_API_BASE = "http://localhost:1234/v1" # URL de base de l'API LM Studio par défaut
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

---

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

    with open(scores_file, 'r') as f:
        lines = f.readlines()
        for line in reversed(lines): # Parcours en sens inverse pour trouver la dernière ligne valide.
            line = line.strip()
            if line:
                try:
                    filename, score_str = line.split(':')
                    return filename.strip(), float(score_str.strip())
                except ValueError:
                    print(f"Avertissement: Ligne de score mal formatée ignorée: '{line}'")
                    continue
    return None, None

def load_function_from_file(filepath):
    """
    Charge le contenu d'un fichier Python spécifié.
    Retourne le contenu du fichier sous forme de chaîne de caractères, ou None si le fichier n'est pas trouvé.
    """
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return f.read()
    return None

async def generate_and_save_move_orders_function():
    """
    Se connecte à LM Studio, génère la fonction send_move_orders, et la sauvegarde dans un fichier.
    Inclut une logique de réessai pour la génération LLM et d'amélioration itérative basée sur les scores précédents.
    """
    client = openai.OpenAI(base_url=LM_STUDIO_API_BASE, api_key="lm-studio")

    max_llm_retries = 3
    retry_count = 0
    generated_code = "" # Initialise à une chaîne vide pour concaténation
    
    # Le prompt LLM actuel commence avec le prompt de base.
    current_llm_prompt = BASE_LLM_PROMPT

    # --- Tente de charger la meilleure fonction précédente pour l'amélioration itérative ---
    last_file, last_score = get_last_score_entry(SCORES_FILE)
    if last_file and last_score is not None:
        old_function_code = load_function_from_file(last_file)
        if old_function_code:
            # Construit le message de guidage pour le LLM, incluant l'ancienne fonction et son score.
            improvement_guidance = (
                f"The previous version of the `send_move_orders` function from `{last_file}` achieved a score of {last_score:.2f}.\n"
                f"Here is the code for that function:\n```python\n{old_function_code}\n```\n"
                f"Please analyze this function and generate a **new, improved version** of `send_move_orders` "
                f"that aims to achieve a higher score. Focus on refining its strategy based on potential weaknesses "
                f"or new ideas for unit movement. The goal is to make the Red player more effective."
            )
            # Prépend le guidage d'amélioration au prompt de base.
            current_llm_prompt = improvement_guidance + "\n\n" + BASE_LLM_PROMPT
            print(f"\n--- Amélioration itérative ---")
            print(f"La fonction précédente '{last_file}' a obtenu un score de {last_score:.2f}.")
            print("Le LLM sera invité à améliorer cette fonction.")
        else:
            print(f"Avertissement: Le fichier de la fonction précédente '{last_file}' n'a pas pu être lu. Génération à partir de zéro.")
    else:
        print("\n--- Première génération ---")
        print("Aucun score précédent trouvé. Génération d'une nouvelle fonction de base.")

    # Boucle de réessai pour la génération LLM.
    while retry_count < max_llm_retries:
        print(f"Connexion à LM Studio à {LM_STUDIO_API_BASE} pour générer la fonction send_move_orders (Tentative {retry_count + 1}/{max_llm_retries})...")
        print("Génération en cours (streaming)...")
        try:
            stream = client.chat.completions.create(
                model=LM_STUDIO_MODEL_NAME,
                messages=[
                    {"role": "user", "content": current_llm_prompt}
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
            # print("\nStreaming terminé.") # Nouvelle ligne après l'affichage du stream

            # Utilise une expression régulière pour extraire le bloc de code Python de manière robuste.
            match = re.search(r"```python\s*(.*?)\s*```", full_content_from_stream, re.DOTALL | re.IGNORECASE)
            
            if match:
                extracted_code = match.group(1).strip()
                # Vérifie si le code extrait correspond à la signature attendue de la fonction.
                if "async def send_move_orders(websocket):" in extracted_code:
                    generated_code = extracted_code
                    break # Code valide généré et extrait, sortir de la boucle de réessai.
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

    if generated_code:
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
        print(f"\nÉchec de la génération d'une fonction 'send_move_orders' valide après {max_llm_retries} tentatives.")
        print("Veuillez vérifier le serveur et le modèle LM Studio, ou ajuster le prompt/la température.")

if __name__ == "__main__":
    # Point d'entrée principal : lance la fonction asynchrone.
    asyncio.run(generate_and_save_move_orders_function())

