# Auld World: playtest reviews

Independent reviews by the playtester agent (`.claude/agents/playtester.md`). Newest first. Scores are 1 to 10; 7 means good, 9 to 10 is reserved for genuinely excellent. Each review scores the game before any change, then again after its own fixes.

---

## 2026-10-14/15: "A handsome, deep valley that kills newcomers by minute 17"

Played on `grok` at becc642 in a real browser (Chromium, 1600x900 and 1366x768), with real mouse clicks and keys: splash, painted menu, Continue, New Game, Skirmish setup, two matches (Mid, 8 houses, Egyptians, followed the guide step by step; Hard, 8 houses, Vikings, played as an experienced player), the Council, the campaign map, letters, a sack, a war and a defeat. Scripted full matches with `tools/play.js` for the late game. Screenshots in the playtester's scratchpad (`pw/play/*.png`).

### 1. Verdict

Auld World looks the part: the painted menus, the valley at play zoom and the Council of Houses are the best things in it, and the rival houses feel alive, writing letters in character, sacking villages and turning them with spies. But a newcomer who does exactly what the guide says is raided at minute 12 and loses at minute 17, and before this review the game hid most of the reasons. After the fixes it is fairer and clearer; the pace of the early AI is still the thing most likely to make a new player quit.

### 2. Scorecard

| Area | Before | After | Why (evidence) |
|---|---|---|---|
| Playability | 5 | 6 | Before: serfs sent into the home village (an easy mis-click near it) took every later order and did nothing, for ever; sites stayed unbuilt with no message. "Not enough goods" and "Blocked" never said what was wrong. After: orders bring them out; refusals name what is missing |
| Fun | 6 | 6 | Sacking Redscar with five footmen, the Council's readings and letters in character are a real pleasure. The early collapse (three tribute demands at once at minute 7, a 19-man army at minute 12) is not fun yet; the fixes make it fairer, not more fun |
| Replay value | 6 | 6 | Eight peoples with their own colours, crests, kings and buildings; seeded valleys; an AI that learns from you. But every match opens the same way and conquest is the only goal (the owner's rule) |
| Graphics and art | 8 | 8 | The splash, the painted menu, terrain, rivers and buildings are lovely and consistent. Serfs are small dark figures beside the king's chariot, hard to find in the first minute; stone, iron and coal deposits look alike |
| Sound and music | 5 | 5 | Synthesised effects and pentatonic plucks: serviceable, not atmospheric. Letters arrived in silence and a declaration of war on you had no horn (both added now; still synth). T20 (real audio) is the fix |
| Interface (UI/UX) | 5 | 6 | Before: every AI trade-offer card was broken (text squeezed into a column, Decline and Intel off the screen); the Skirmish setup cut "Egyptians", "Medium", "Standard" short; news of distant sacks with full spoils lists filled the middle of the screen and could push your own alarm off it. All fixed. Still: at 1366x768 the rivals bar shows five of seven rivals and a serf's orders need scrolling (T34) |
| Learning curve | 5 | 6 | The step-by-step guide is good and well written, but its "Raise an army" step was ninth, after camels and villages, while the first demand comes at minute 7 and the first army at minute 12. Now it comes straight after the barracks and says why; demand cards say what refusing risks; the defeat card gives one lesson |
| Challenge and balance | 4 | 5 | Mid felt like Hard for a new player: by minute 15 rivals held 11 to 19 villages and 20 to 39 soldiers against my 1 village and 5 soldiers. Heirs were crowned at the seat while the raiders stood on it and died at once, twice: the house fell 5 minutes after the first raid. Heirs now crown away from raiders. The early pace itself is left to the owner (T32) |
| AI | 7 | 7 | The best part of the simulation: rivals expand, trade with each other, send spies, demand tribute in character ("My armies stand at your gates, Maximus"), declare war on a refusal and raid with real armies |
| Pacing | 5 | 5 | Minutes 0 to 7 are a pleasant build-up; 7 to 12 is a pile of letters; 12 onwards was a collapse. 2,000+ grain piles up with nothing to spend it on (T33) |
| Performance | 6 | 6 | Loads in under a second and opens the menu at once on an idle machine (9 s under heavy load); no console errors, no 404s. With 8 houses the browser managed about 1.6x when set to 4x on a busy 4-core PC; `big.test.js` measured 4.6 s per simulated minute under load (budget 2.5) |
| Depth | 8 | 8 | Villages with loyalty and influence, spies, mines worked by villagers, markets and camel routes, science and an armoury, ranks and captains, kings and heirs, a diplomacy model with reasons. Rich and interlocking |
| Polish and stability | 6 | 7 | No crashes or console errors in two hours. The bugs found were real (stuck serfs, broken treaty cards, heirs crowned into raiders) and are fixed; the game now explains itself better at the moments that matter |
| **Overall** | **6** | **6.5** | A deep, beautiful game whose first match is too punishing and, until today, too quiet about why |
| **Likelihood to play again** | **5** | **6** | I wanted to try again after the defeat because the valley and the Council are compelling; I would have been more likely to if the game had told me what killed me, which it now does |

### 3. The best thing and the worst thing

- **Best:** the Council of Houses. Eight ranked cards with a painted ruler, temper, villages, army, money, learning, and a reading of you with reasons ("Hostile toward you (-34): defied our demand"). It makes the rivals people, not counters.
- **Worst:** the first match on Mid. Following the guide exactly, I was asked for tribute by three houses at minute 7, raided by 19 soldiers at minute 12 (my keep site, mines, market and tavern destroyed, my king killed), and lost at minute 17 as each new heir was crowned in the middle of the raiders.

### 4. What I changed, and what it moved

| Change | Score moved |
|---|---|
| **Treaty cards fixed**: a trade offer's card class collided with the Council's `.treaty` row (a flex row), squeezing the text and pushing Decline and Intel off the screen | Interface +, Polish + |
| **Orders bring sheltering folk out**: any move, gather, build, attack, sack, infiltrate or place order to someone inside a keep or village brings them out to obey; before, they took the order and sat inside for ever (test added) | Playability + |
| **Heirs crowned away from raiders**: at the first holding with no hostile soldier within 12 tiles, else the seat as before (test added) | Challenge +, Fun (fairness) |
| **The king's alarm**: never swallowed by another alarm's quiet time; says how many heirs are left and to get him inside (test added) | Learning +, Challenge + |
| **Demand cards say the stakes**: "Refuse or let it lapse and Komnenos may march on you. Their army 18, yours 0." | Learning +, Interface + |
| **"Not enough goods" names the shortfall**: "you need 50 coin and 5 stone more" for building, training, hiring, drilling and crafting (test added) | Playability + |
| **The guide's army step moved** to straight after the keep and barracks, with a warning about tribute demands from minute 7 and the king | Learning + |
| **News of other houses is one quiet line** (first sentence, smaller, one at a time, and it gives way first so your own alarms stay on screen) | Interface + |
| **Letter and war sounds**: a chime when a letter arrives, the horn for a demand or a war declared on you | Sound (small) |
| **Deposits name themselves under the cursor**: "Iron deposit, 717 left, raise a Mine on it" (I raised my first mine on iron thinking it was stone) | Interface +, Learning + |
| **A chronicle on the end card**: who ended your line, kings lost, villages, coin, rivals standing, and one tip after a defeat | Replay +, Learning + |
| **Skirmish setup labels** no longer cut short; the "8" houses button fits the panel | Polish + |

### 5. Recommended next (ranked by impact; not done, and why)

1. **T32: early pressure on Mid.** Rivals out-expand a guided player 10 to 1 by minute 15 and the first army comes at minute 12. Slow the AI's early sacking and the first demand on Easy and Mid (for example: demands from minute 10 on Mid, 14 on Easy; a cap on villages an AI may sack before minute 15). *A balance call for the owner, and it needs `learn.test.js` and soak runs to stay green, so I did not change it.*
2. **Protect the king by default.** Today he stands outside the village in his chariot. A "Shelter king" button (and key), and the king stepping inside his village on his own when raiders come within a few tiles, would stop most first-match defeats. *Touches the owner's rule that characters must not simply run away, so it is his call.*
3. **T34: laptop screens.** At 1366x768 the rivals bar loses two rivals and the command panel scrolls.
4. **T33: a use for grain.** Feasts for loyalty or mercenaries; ties to T12's late-game sinks.
5. **T20: real audio.** The synth is the weakest part of the presentation next to the painted art.
6. **Find your serfs.** In the first seconds the serfs are small dark figures beside the king's chariot. Select them at the start, or pulse a ring under them until the first order.
7. **T35: a timeline on the end card** (villages, army, wealth per house over time).

### Scripted matches (`tools/play.js`, 8 houses, 20 minutes, after the fixes)

- **Mid, economic script:** survives; 7 villages and 14 soldiers at minute 20 against rivals' 12 to 21 villages and 20 to 31 soldiers. An experienced player can hold on; a newcomer who follows the guide could not.
- **Hard, rush script:** survives but stalls at 14 soldiers and 6 villages; rivals reach 38 to 51 soldiers. No house fell in 20 minutes on either run: conquest is a long road.
- Both scripts end with 4,000 to 5,000 grain and timber unspent (T33).

### Tests

| Test | Baseline (origin/grok becc642) | After |
|---|---|---|
| `node --check js/*.js` | clean | clean |
| `test/rules.test.js` | 69 passed | 73 passed (4 new) |
| `AULD_MAP=112 test/sim.test.js` | 52 passed | 52 passed |
| `test/learn.test.js` | 7 passed | 7 passed |
| `test/big.test.js` (alone) | 4 passed | 4 passed |
| `tools/boot-test.cjs`, `stance-smoke.cjs`, `combat-smoke.cjs` | pass | pass |
| `tools/ui-smoke.cjs` | pass on one run | fails on its fixed 2.5 s wait (the game takes about 7 s to start on this PC with either version; see bugs) |

### 6. Bugs found

| Bug | Status |
|---|---|
| Trade-offer cards squeezed into a column, Decline and Intel off screen (class collision with `.treaty`) | Fixed (T-056) |
| Serfs inside a village take a gather order and sit inside for ever; build and attack orders to them silently ignored | Fixed (T-056) |
| Heir crowned at a seat occupied by raiders and killed at once | Fixed (T-056) |
| King's alarm suppressed for 8 s after any other alarm | Fixed (T-056) |
| Skirmish setup buttons cut short; "8" houses outside the panel | Fixed (T-056) |
| "Not enough goods" / "Blocked" do not say what is wrong | "Not enough goods" fixed; "Blocked" (something already on the ground) left as is |
| `tools/ui-smoke.cjs` waits a fixed 2.5 s, but on the owner's PC the game object appears after about 7 s (old and new code alike), so it fails by timing alone | Not fixed: it should wait for `window.__seven` |
| `big.test.js` speed budget (2.5 s per simulated minute) fails under load (4.6 s) | Passes when run alone, before and after the changes; T18 is the real fix |
| Continue on the painted menu at first launch starts the valley generated behind the menu (same as New Game) | Left: harmless |
