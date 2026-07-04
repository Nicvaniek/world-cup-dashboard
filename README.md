# WC26 Bracket Lab

A live FIFA World Cup 2026 knockout dashboard: the full bracket from the
Round of 32 to the MetLife final, win / draw / win probabilities for every
upcoming fixture, and per-match form + insights — plus attack and defence
form charts for all 48 teams.

- **Live scores**: the page ships with a baked-in snapshot and pulls fresh
  scores straight from ESPN's public scoreboard in your browser — on load and
  whenever you hit **Refresh scores**. No backend, no cron.
- **Probabilities**: World Football Elo model with a host-nation venue boost;
  the draw share is calibrated to 90-minute knockout draw rates.
- Read-only by design: make your actual picks wherever you like — this is the
  scouting report.

Build: `python3 build.py` regenerates `docs/index.html` (served by GitHub Pages).
Data inputs: `feed.json` (schedule/results snapshot), `team_meta.json` (flags,
colours, codes), `elo.json`, `pre.json` (pre-tournament form), `notes.json`
(optional storylines).
