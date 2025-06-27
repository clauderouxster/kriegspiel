import openai
import json
import os
import asyncio
import time
import datetime
import subprocess
import re
import ast  # Importation du module AST pour la validation de syntaxe
import types  # Pour créer un nouveau module
from unittest.mock import AsyncMock, MagicMock  # Pour simuler les objets asynchrones et autres dépendances
import traceback  # Pour imprimer le traceback complet en cas d'erreur
import random  # Pour les fonctions random utilisées par le LLM
import collections  # Pour deque si la stratégie l'utilise
import math  # math est nécessaire pour float('inf') et d'autres opérations

# --- Configuration pour LM Studio ---
# Assurez-vous que LM Studio est en cours d'exécution et sert le modèle spécifié sur ce port.
LM_STUDIO_API_BASE = "http://localhost:1234/v1"  # URL de base de l'API LM Studio par défaut
LM_STUDIO_MODEL_NAME = "codestral-22b-v0.1-mlx-3"  # Nom du modèle exposé par LM Studio

# --- Nom du fichier de sortie et du fichier des scores ---
# Génère un nom de fichier horodaté pour la fonction de mouvement.
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
OUTPUT_FUNCTION_FILE = f"generated_send_move_orders_{timestamp}.py"
SCORES_FILE = "scores.txt"  # Nom du fichier où les scores sont enregistrés.

# --- Prompt LLM de base ---
# Ce prompt définit la tâche principale pour le LLM, c'est la base de toute génération.
BASE_LLM_PROMPT = """You are an AI tasked with generating Python code for the `send_move_orders` async function.
This function controls the movement strategy for 'Red' player units in a real-time strategy game.
The goal is to defeat the 'Blue' player by capturing their bases or eliminating all their units.
The game state information (units, map, visible hexes, combat hexes) is available globally.

The `send_move_orders` function will be executed repeatedly in a loop.
Your code needs to generate movement orders for Red units, considering:
- Unit types (Infantry, Artillery, Cavalry, Supply, Scout, General) and their specific movement costs on different terrains.
- Terrain types (Flat, Mountain, Hill, Swamp, Lake, Forest, Base, Unassigned) and their impact on vision and movement.
- Visibility of enemy units and bases.
- Unit health and combat engagement.
- Prioritize attacking visible enemy units when advantageous, capturing bases, exploring unknown map areas, and retreating if needed.
- Utilize the provided A* pathfinding algorithm (`astar`) for efficient movement towards targets.
- Ensure units do not move into impassable terrain (Lake for most units).

Constraints and requirements:
- The function must be named `send_move_orders` and be `async`.
- It must take one argument: `websocket`.
- It must not import any modules that are not already imported in `red_player.py` or defined in the provided context (e.g., `random`, `heapq`, `collections`, `math`).
- Do NOT use `input()` or `print()` statements directly in the generated function, as it runs in a game loop.
- Focus on strategic decision-making for unit movement.
- When attacking, units should prioritize weaker or more valuable targets.
- Scouting units should prioritize exploring unknown areas or gaining high ground (hills) for vision.
- Supply units should follow other units or move towards bases.
- General should be protected.
- Consider defending friendly bases.
- The A* function (`astar`) is available. You can use it as `astar((start_r, start_c), (target_r, target_c))`.
- The `get_neighbors` function is available.
- Global variables available: `game_over`, `current_units`, `game_map`, `visible_hexes`, `combat_hexes`, `player_army_color`, `current_map_rows`, `current_map_cols`.
- Constants for unit types, terrain types, and movement costs are globally available (e.g., `UNIT_INFANTERY`, `TERRAIN_MOUNTAIN`, `TERRAIN_MOVEMENT_COSTS`).

Your code should be robust and avoid errors during execution.
Focus on clear, readable, and efficient Python code.

---
**Feedback from previous games:**
"""

# --- Variables globales pour le contexte du jeu (simulées pour la validation) ---
# Ces variables sont normalement définies dans red_player.py et mises à jour par les messages du serveur.
# Elles sont nécessaires ici pour la validation syntaxique et l'exécution simulée.
game_over = False
current_units = []
game_map = []
visible_hexes = set()
combat_hexes = set()
player_army_color = '#FF0000' # Rouge par défaut
current_map_rows = 0
current_map_cols = 0

# --- Fonctions utilitaires (doivent correspondre à celles de red_player.py) ---
# Nécessaire pour la validation du code généré qui pourrait les appeler.
# Implémentations simplifiées pour permettre la validation AST.
def get_neighbors(r, c, rows, cols):
    neighbors = []
    for dr in [-1, 0, 1]:
        for dc in [-1, 0, 1]:
            if dr == 0 and dc == 0:
                continue
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                neighbors.append((nr, nc))
    return neighbors

def astar(start, target):
    # Ceci est une implémentation simplifiée/mock pour permettre la validation.
    # L'implémentation réelle est dans red_player.py.
    # Pour la validation, on peut retourner un chemin direct ou vide.
    if start == target:
        return [start]
    # Simple chemin direct pour la simulation
    path = []
    curr = list(start)
    while curr != list(target):
        if curr[0] < target[0]:
            curr[0] += 1
        elif curr[0] > target[0]:
            curr[0] -= 1
        if curr[1] < target[1]:
            curr[1] += 1
        elif curr[1] > target[1]:
            curr[1] -= 1
        path.append(tuple(curr))
        if len(path) > 100: # Éviter les boucles infinies pour les mocks
            return []
    return path

def heuristic(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])

# Définition des constantes pour que le code généré puisse être validé
TERRAIN_FLAT = 0
TERRAIN_MOUNTAIN = 1
TERRAIN_HILL = 2
TERRAIN_SWAMP = 3
TERRAIN_LAKE = 4
TERRAIN_FOREST = 5
TERRAIN_BASE = 6
TERRAIN_UNASSIGNED = -1

UNIT_INFANTERY = 0
UNIT_ARTILLERY = 1
UNIT_CAVALRY = 2
UNIT_SUPPLY = 3
UNIT_SCOUT = 4
UNIT_GENERAL = 5

ARMY_COLOR_BLUE = '#0000FF'
ARMY_COLOR_RED = '#FF0000'

TERRAIN_MOVEMENT_COSTS = {
    UNIT_INFANTERY: {
        TERRAIN_FLAT: 1, TERRAIN_MOUNTAIN: 3, TERRAIN_HILL: 2, TERRAIN_SWAMP: 2,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    },
    UNIT_ARTILLERY: {
        TERRAIN_FLAT: 1.5, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 2.5, TERRAIN_SWAMP: 3,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2.5
    },
    UNIT_CAVALRY: {
        TERRAIN_FLAT: 0.8, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 1.5, TERRAIN_SWAMP: 3,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 1.5
    },
    UNIT_SUPPLY: {
        TERRAIN_FLAT: 1.2, TERRAIN_MOUNTAIN: float('inf'), TERRAIN_HILL: 2.2, TERRAIN_SWAMP: 2.5,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2.2
    },
    UNIT_SCOUT: {
        TERRAIN_FLAT: 0.7, TERRAIN_MOUNTAIN: 2, TERRAIN_HILL: 1, TERRAIN_SWAMP: 1.5,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 1
    },
    UNIT_GENERAL: {
        TERRAIN_FLAT: 1, TERRAIN_MOUNTAIN: 3, TERRAIN_HILL: 2, TERRAIN_SWAMP: 2,
        TERRAIN_LAKE: float('inf'), TERRAIN_FOREST: 2
    }
}


# --- Fonctions pour la gestion des scores ---

def read_scores():
    """Lit les scores du fichier SCORES_FILE et retourne un dictionnaire."""
    scores = {}
    if os.path.exists(SCORES_FILE):
        with open(SCORES_FILE, 'r') as f:
            for line in f:
                parts = line.strip().split(': ')
                if len(parts) == 2:
                    try:
                        scores[parts[0]] = float(parts[1])
                    except ValueError:
                        print(f"Warning: Could not parse score from line: {line.strip()}")
    return scores

def get_best_score(scores_data):
    """Retourne le meilleur score absolu."""
    if not scores_data:
        return 0.0
    return max(scores_data.values())

def get_last_score_info(scores_data, last_file_name):
    """Retourne le score et le statut (win/loss) de la dernière partie."""
    if last_file_name and last_file_name in scores_data:
        score = scores_data[last_file_name]
        outcome = "victory" if score >= 10000 else "defeat"
        return score, outcome
    return None, None

# --- Fonctions pour l'interaction avec LM Studio ---

async def generate_python_function(llm_prompt, max_retries=5):
    client = openai.OpenAI(base_url=LM_STUDIO_API_BASE, api_key="lm-studio")

    for attempt in range(max_retries):
        try:
            print(f"\n--- Requête LLM (tentative {attempt + 1}/{max_retries}) ---")
            stream = client.chat.completions.create(
                model=LM_STUDIO_MODEL_NAME,
                messages=[
                    {"role": "system", "content": "You are a helpful AI assistant that generates Python code."},
                    {"role": "user", "content": llm_prompt}
                ],
                temperature=0.7, # Ajustez la température pour des stratégies plus ou moins créatives.
                stream=True # Activer le mode streaming
            )

            full_content_from_stream = ""
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    achunk = chunk.choices[0].delta.content
                    full_content_from_stream += achunk
                    # Optionnel: afficher le contenu au fur et à mesure pour un feedback immédiat
                    print(achunk, end='', flush=True)

            generated_code = full_content_from_stream
            print("--- Réponse LLM reçue ---")
            # print(generated_code) # Décommenter pour voir le code brut du LLM

            # Extraire le bloc de code Python
            match = re.search(r"```python\n(.*?)\n```", generated_code, re.DOTALL)
            if match:
                extracted_code = match.group(1)
                # print("--- Code Python extrait ---")
                # print(extracted_code) # Décommenter pour voir le code extrait

                # Valider la syntaxe Python
                try:
                    tree = ast.parse(extracted_code)
                    # Vérifier si la fonction send_move_orders est présente
                    for node in tree.body:
                        if isinstance(node, ast.AsyncFunctionDef) and node.name == "send_move_orders":
                            return extracted_code
                    print("Validation échouée: La fonction 'send_move_orders' n'a pas été trouvée dans le code généré.")
                except SyntaxError as e:
                    print(f"Validation échouée: Erreur de syntaxe dans le code généré: {e}")
                except Exception as e:
                    print(f"Validation échouée: Erreur inattendue lors de l'analyse AST: {e}")
            else:
                print("Validation échouée: Aucun bloc de code Python trouvé dans la réponse LLM (attendu ```python\\n...\\n```).")

        except openai.APIConnectionError as e:
            print(f"Échec de la connexion à l'API LM Studio: {e}")
            print("Assurez-vous que LM Studio est en cours d'exécution et que le serveur est accessible.")
        except openai.RateLimitError as e:
            print(f"Limite de taux atteinte avec l'API LM Studio: {e}")
            print("Veuillez attendre avant de réessayer ou ajuster les paramètres de taux.")
        except openai.APIStatusError as e:
            print(f"Erreur de statut de l'API LM Studio: {e}")
            print(f"Code d'état: {e.status_code}, Message: {e.response}")
        except Exception as e:
            print(f"Une erreur inattendue est survenue lors de l'appel LLM: {e}")
            traceback.print_exc() # Imprimer le traceback complet pour le débogage

        await asyncio.sleep(2) # Attendre avant de réessayer

    return None

def validate_and_save_function(generated_code, file_name):
    """
    Valide le code généré en tentant de le charger comme un module et de vérifier la présence
    de la fonction `send_move_orders`.
    """
    if not generated_code:
        print("Aucun code à valider/sauvegarder.")
        return False

    # Créer un module temporaire pour vérifier la fonction
    try:
        # Exécuter le code dans un espace de noms sûr
        module_code = types.ModuleType("temp_module")
        # Les globals nécessaires pour que le code généré puisse fonctionner pendant le test
        exec(generated_code, globals(), module_code.__dict__)

        if not hasattr(module_code, "send_move_orders"):
            print("Validation échouée: La fonction 'send_move_orders' est manquante dans le code généré.")
            return False

        # Si tout est bon, sauvegarder le code
        with open(file_name, 'w') as f:
            f.write(generated_code)
        print(f"Fonction 'send_move_orders' générée et sauvegardée dans '{file_name}'.")
        return True
    except Exception as e:
        print(f"Validation échouée: Erreur lors du chargement ou de l'exécution du code généré pour validation: {e}")
        traceback.print_exc()
        return False

async def run_llm_generation_and_game(max_llm_retries=3):
    """
    Gère le processus de génération du code par le LLM, la validation et le lancement du jeu.
    """
    print("\n--- Démarrage du processus de génération et de jeu ---")

    # 1. Lire les scores existants
    scores_data = read_scores()
    best_score_overall = get_best_score(scores_data)
    last_score, last_outcome = get_last_score_info(scores_data, OUTPUT_FUNCTION_FILE) # Initialement OUTPUT_FUNCTION_FILE est le nom du fichier actuel

    # Générer le prompt avec le feedback
    current_llm_prompt = BASE_LLM_PROMPT
    if last_score is not None:
        current_llm_prompt += f"\n\nLast game's score for Red player was: {last_score:.2f} (Outcome: {last_outcome})."
        current_llm_prompt += f"\nThe best score achieved so far is: {best_score_overall:.2f}."

        if last_outcome == "victory":
            current_llm_prompt += "\nCongratulations on the victory! Try to further optimize your strategy to win even more efficiently or against tougher opponents. Consider refining unit compositions, movement patterns, or focus fire tactics."
        elif last_score < (50 + 10 * 100) / 100: # Arbitrary threshold for a very low defeat score (e.g., base score + 10 units * unit_value)
            current_llm_prompt += "\nThis was a low-scoring defeat. Focus on improving unit survival, engaging enemies more effectively, and proactively capturing bases. Avoid unnecessary losses and prioritize strategic objectives."
        else: # Moderate defeat score
            current_llm_prompt += "\nThis was a moderate-scoring defeat. Your units showed some resilience. Focus on increasing enemy unit destruction and prolonging the game. Experiment with better defensive positions or coordinated attacks to turn the tide."
    else:
        current_llm_prompt += "\n\nThis is the first game or no previous score was found. Focus on a balanced strategy of exploration, and engaging visible enemies. Try to keep your units alive."

    print("\n--- Prompt LLM final pour cette itération ---")
    print(current_llm_prompt)
    print("---------------------------------------------")

    generated_function_code = await generate_python_function(current_llm_prompt, max_llm_retries)

    if generated_function_code:
        # Demander confirmation avant de sauvegarder et d'exécuter
        # user_input = input("\nCode généré et validé. Souhaitez-vous le sauvegarder et lancer le jeu? (oui/non): ").lower()
        # if user_input == 'oui': # Automatiser pour les tests
        if True: # Automatiser pour les tests
            # Sauvegarde le code généré dans le fichier de sortie
            generated_function_file_name = OUTPUT_FUNCTION_FILE
            if validate_and_save_function(generated_function_code, generated_function_file_name):
                # Le nom du script red_player.py
                user_input = input("\nAppuyez sur Entrée pour lancer red_player.py avec la stratégie générée, ou tapez 'q' pour quitter : ")

                if user_input.lower() != 'q':
                    red_player_script_name = "red_player.py"
                    
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
            else:
                print("Lancement annulé en raison d'un problème de validation ou de sauvegarde.")
    else:
        print(f"\nÉchec de la génération et de la validation d'une fonction 'send_move_orders' valide après {max_llm_retries} tentatives.")
        print("Veuillez vérifier le serveur et le modèle LM Studio, ou ajuster le prompt/la température.")

if __name__ == "__main__":
    # Point d'entrée principal : lance la fonction asynchrone.
    asyncio.run(run_llm_generation_and_game())

