#!/usr/bin/env python3
"""Assemble index.html from template + fonts + styles + data + app."""
import json, pathlib, datetime

ROOT = pathlib.Path(__file__).parent
meta = json.load(open(ROOT / 'team_meta.json'))

# merge optional enrichment files
for fname, key in [('elo.json', 'elo'), ('notes.json', 'note'), ('pre.json', 'pre')]:
    p = ROOT / fname
    if p.exists():
        extra = json.load(open(p))
        for team, val in extra.items():
            if team in meta:
                meta[team][key] = val
            else:
                print(f'WARN: {fname} team not in meta: {team}')

missing_elo = [t for t in meta if 'elo' not in meta[t]]
if missing_elo:
    print('WARN: no elo for', missing_elo)

feed = json.load(open(ROOT / 'feed.json'))

data_js = (
    'const TEAM_META = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n' +
    'const SNAPSHOT = ' + json.dumps(feed, ensure_ascii=False, separators=(',', ':')) + ';'
)

html = open(ROOT / 'template.html').read()
html = html.replace('{{FONTS}}', open(ROOT / 'fonts/fontface.css').read())
html = html.replace('{{STYLES}}', open(ROOT / 'styles.css').read())
html = html.replace('{{DATA}}', data_js)
html = html.replace('{{APP}}', open(ROOT / 'app.js').read())
html = html.replace('{{UPDATED}}', datetime.date.today().strftime('%B %-d, %Y'))

out = ROOT / 'site' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' + html + '\n</html>')
# live feed copy served alongside
(ROOT / 'site' / 'feed.json').write_text(json.dumps(feed, ensure_ascii=False))
print('built', out, f'{out.stat().st_size/1024:.0f} KB')
