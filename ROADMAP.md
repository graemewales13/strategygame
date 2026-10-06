# Auld World – Roadmap to a shippable game

What exists on `grok` today, and what still stands between it and a commercial release. Rules in DEMANDS.md always apply (conquest/forfeit-only victory, etc.).

## Done on `grok`
- Reliable startup with visible errors, versioned module cache, Copy-report button, CI (`.github/workflows/ci.yml`), 320 and 112 board tests.
- Save / load: autosave, manual slot (F5 / F9), versioned format, size-checked.
- Sound: synthesised effects and a quiet score, volume sliders, mute.
- Guided first-match objectives (ten steps, foldable, can be hidden).
- Economy visibility: market community pips, district ring and link lines (select a market, or press **E**).
- Board size: Small 160, Standard 320, Huge 400 (Options in the skirmish menu; reloads the page; saves record their size).

## Not built yet (needs more than a code session)
| Area | Why it matters | Notes |
|---|---|---|
| Campaign | Gives a reason to keep playing past the skirmish | Scripted maps, starting conditions and win text per scenario; the objectives system is the base |
| Multiplayer | The biggest retention driver for RTS | `Game` is already host-authoritative with intents; needs a transport (WebSocket relay), lockstep or snapshot sync, lobby |
| Faction mechanics | Peoples differ mostly by name/colour | Unique units, buildings, one economy twist each |
| AI personalities | Rivals feel alike | Aggressive, trader, turtle; difficulty beyond purse scaling |
| Art and animation | Placeholder and generated art limits first impressions | Commissioned unit/building sets, UI polish, trailer-ready screenshots |
| Real audio | Synth sound is serviceable only | Recorded effects and composed score |
| Distribution | Players need a download or store page | Package with Electron or Tauri; Steam page, achievements, cloud saves |
| Accessibility and localisation | Wider audience | Colour-blind palettes, key rebinding, string table |
| Performance on weak machines | Huge board is heavy | Worker-thread simulation, spatial culling audits |
| Playtesting | Balance is unproven | Telemetry-free playtest sessions, tune start resources and pacing |
