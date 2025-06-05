# kriegspiel
![Battle](https://github.com/clauderouxster/kriegspiel/blob/main/resources/battle.png)
A war game in JavaScript that can be launched through node.js

Objective: Kill the General of your opponent
How: Move your units to explore the map and engage the enemy.

Commands:
- Left click on a visible unit (of your color): Select the unit.
- A unit is selected: Left click on a visible or fogged hex: The unit will move to that hex.
- Left click on the selected unit or outside the map/hexes: Deselects the unit and stops its movement.
- Game time advances automatically.

Units and Terrain:
- Each unit has different movement costs depending on the terrain (Plains, Hill, Forest, Swamp). Mountains and Lakes are impassable.
- Units have HP, a vision range, and a combat range/strength.
- Supply units heal friendly units in friendly adjacent hexes.
- Scout units have a large vision range and ignore terrain costs.

Combat:
- Combat is resolved automatically when enemy units are within mutual range.
- The outcome depends on the aggregated strength of the units involved in the engagement.
- Units with 0 HP are eliminated.

Multiplayer:
- Connect to a server to play against another player (Blue vs Red).
- Each player sees their own fog of war.
- Movements and combat results are synchronized via the server.


## Playing Kriegspiel Map Over a Network

Kriegspiel Map supports multiplayer gameplay, with one player acting as the "Blue" army and the other as the "Red" army. The game logic for movements and combat resolution is primarily handled by the **Blue player's client**.

To facilitate network play, you'll need to set up a server using Node.js and, for internet play, potentially Ngrok.

### Prerequisites: Node.js

Both methods (local network and internet) require Node.js to be installed on the machine hosting the server.

1.  **Download Node.js**: Visit the official Node.js website ([https://nodejs.org/](https://nodejs.org/)) and download the recommended LTS (Long Term Support) version for your operating system.
2.  **Install Node.js**: Follow the installation instructions for your system. This will also install `npm` (Node Package Manager).

### Playing Over a Local Network

To play over a local network (e.g., two computers connected to the same Wi-Fi or LAN), you will use the `localserver.js` file.

**Server Setup (Host Machine - e.g., Blue Player's machine or a dedicated server):**

1.  **Navigate to the game directory**: Open your terminal or command prompt and navigate to the directory where your Kriegspiel Map game files are located.
2.  **Start the local server**: Run the command:
    ```bash
    node localserver.js
    ```
    You should see output similar to: `Kriegspiel Map WebSocket server started on port 6060`.

**Client Connection (Both Players):**

1.  **Identify the Server's IP Address**: The host machine (where `localserver.js` is running) needs to find its local IP address.
    * **Windows**: Open Command Prompt and type `ipconfig`. Look for "IPv4 Address".
    * **macOS/Linux**: Open Terminal and type `ifconfig` or `ip a`. Look for the IP address associated with your active network interface (e.g., `en0`, `eth0`, `wlan0`).
2.  **Open the Game in a Web Browser**: On both the Blue and Red player's computers, open a web browser (e.g., Chrome, Firefox) and navigate to:
    ```
    http://[SERVER_IP_ADDRESS]:6060/index.html
    ```
    Replace `[SERVER_IP_ADDRESS]` with the actual local IP address of the server machine.

The first client to connect will be assigned the "Blue" army, and the second will be assigned the "Red" army. The `localserver.js` handles relaying messages between the two connected clients.

### Playing Over the Internet (Using Ngrok)

To play over the internet, you'll need to expose your local server to the public internet using a tool like Ngrok. This allows players outside your local network to connect. You will use the `server.js` file for this scenario, as it also serves the static game files directly.

**Server Setup (Host Machine - e.g., Blue Player's machine or a dedicated server):**

1.  **Download Ngrok**: Go to the Ngrok website ([https://ngrok.com/download](https://ngrok.com/download)) and download the appropriate version for your operating system.
2.  **Unzip Ngrok**: Extract the downloaded Ngrok zip file to a convenient location (e.g., your game directory).
3.  **Start the game server**: Open your terminal or command prompt, navigate to your game directory, and run:
    ```bash
    node server.js
    ```
    This server will serve the game files and handle WebSocket connections. You should see `Kriegspiel Map WebSocket server started on port 6060`.
4.  **Expose the server with Ngrok**: Open a *new* terminal or command prompt window in the directory where you unzipped Ngrok (or where the `ngrok` executable is located). Then, run the command:
    ```bash
    ./ngrok http 6060
    ```
    (On Windows, it might be `ngrok http 6060`).
    Ngrok will display a public URL (e.g., `https://xxxx-xxxx-xxxx-xxxx.ngrok-free.app`). This is the URL your friends will use to connect.

**Client Connection (Both Players):**

1.  **Open the Game in a Web Browser**: On both the Blue and Red player's computers, open a web browser and navigate to the public Ngrok URL provided in the previous step.

    ```
    [YOUR_NGROK_PUBLIC_URL]
    ```
    The `server.js` handles assigning roles and relaying messages between the clients.

**Important Notes for Internet Play:**

* **Ngrok Tunnel Lifetime**: The free Ngrok tunnel will typically expire after a few hours or upon closing the Ngrok terminal. You'll need to restart it and provide the new URL if you want to play again later.
* **Server Uptime**: The server (running `node server.js`) must remain active for players to stay connected.
* **Security**: Be mindful that exposing a local server to the internet can have security implications. For casual gaming, Ngrok is generally safe, but for production environments, more robust solutions are needed.

### Game Interaction and Logic

The game distinguishes between two types of messages for interaction:

* **Chat Messages**: When a player sends a chat message, the server relays it directly to the other connected client.
* **Game State Messages**: For other game-related messages (like `MOVE_ORDER` or `STATE_SYNC`), the server also acts as a relay, passing them from one client to the other.

Crucially, **movements and combat resolution are handled by the Blue player's client**. This means the Blue player's machine is responsible for calculating unit movements, resolving combat encounters, and updating the overall game state. The Red player's client receives these updates from the Blue client via the server.

## License

BSD 3-Clause License

```
KRIEGSPIEL
Copyright (c) 2025-present Claude ROUX

Redistribution and use in source and binary forms, with or without 
modification, are permitted provided that the following conditions 
are met:

1. Redistributions of source code must retain the above copyright 
notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright 
notice, this list of conditions and the following disclaimer in the 
documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its 
contributors may be used to endorse or promote products derived from 
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" 
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE 
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE 
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE 
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR 
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF 
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS 
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN 
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) 
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE 
POSSIBILITY OF SUCH DAMAGE.
```
