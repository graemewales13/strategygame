# Seven Holds - troubleshooting log

How this works: `node tools/soak.js [minutes] [seeds] [houses]` plays headless matches with **every** house (the player's too) under the AI,
checks invariants every 10 s and writes `logs/soak-latest.log`. Findings are triaged here: **ID, symptom, cause, fix, how it is guarded**.
`npm test` holds the regression tests; `tools/soak.js` is the wide net. Newest cycle at the bottom.

Status: OPEN, FIXED, WONTFIX (with reason), HARNESS (the detector was wrong, not the game).

## Cycle 1 - first soak (20 min x 3 seeds, 4 houses)

| ID | Status | Symptom | Cause | Fix / guard |
|----|--------|---------|-------|-------------|
| T-001 | FIXED | Serfs froze for minutes carrying coin ("return" with no path), builders froze beside a site | A unit standing off-centre on the tile diagonal to a building's corner picked its **own tile** as the goal; `findPath` returned `[]` (same tile), distance stayed 1.36 > 1.35 reach, so it never arrived and never repathed to anything else | `setPathToEntity` now ranks free tiles by working reach first, then ring, then closeness, and tries up to 8 until one is reachable; `setPath` walks to the exact point when the goal is the same tile. Soak: `stuck serf` anomalies gone |
| T-002 | FIXED | Tavern never paid its coin trickle | Two `case 'tavern'` labels in `updateBuildings`; the second was dead code | Merged into one case |
| T-003 | HARNESS | "stuck serf while gather/mine", "stuck footman/spy/bowman while attack/infiltrate" (hundreds) | Digging, hitting a target in range and a spy waiting at a village all stand still by design | Detector now treats "near the target / within weapon range" as working |
| T-004 | HARNESS | "mine with no diggers", "task on vanished target" | Stone mines are released on purpose when stone > 120; targets vanish between `cleanup` and the next unit update | Exempt glutted ores; a target must stay vanished for 5 s to count |
