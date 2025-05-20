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
- Spy units have a large vision range and ignore terrain costs.

Combat:
- Combat is resolved automatically when enemy units are within mutual range.
- The outcome depends on the aggregated strength of the units involved in the engagement.
- Units with 0 HP are eliminated.

Multiplayer:
- Connect to a server to play against another player (Blue vs Red).
- Each player sees their own fog of war.
- Movements and combat results are synchronized via the server.


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
