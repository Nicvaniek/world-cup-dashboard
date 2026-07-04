# WC26 Bracket Lab

Interactive FIFA World Cup 2026 knockout dashboard: predict every remaining
match (win / draw-after-90 / loss), follow your picks through an animated
bracket to the final, and browse attack/defence form charts.

- **Live results**: a GitHub Action refreshes `feed.json` from
  fixturedownload.com every 20 minutes and redeploys; the page also polls for
  new scores every 3 minutes while open.
- **Probabilities**: World Football Elo model with a host-nation venue boost;
  draw share calibrated to 90-minute knockout draw rates.
- **Predictions** are stored in your browser (localStorage) — no accounts, no backend.

Build locally: `python3 build.py` then open `site/index.html`.
