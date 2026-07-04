#!/usr/bin/env python3
"""Assemble the static dashboard (docs/index.html for GitHub Pages)."""
import json, pathlib, datetime

ROOT = pathlib.Path(__file__).parent
meta = json.load(open(ROOT / 'team_meta.json'))

for fname, key in [('elo.json', 'elo'), ('notes.json', 'note'), ('pre.json', 'pre')]:
    p = ROOT / fname
    if p.exists():
        for team, val in json.load(open(p)).items():
            if team in meta:
                meta[team][key] = val
            else:
                print(f'WARN: {fname} team not in meta: {team}')

feed = json.load(open(ROOT / 'feed.json'))

data_js = (
    'const TEAM_META = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    'const SNAPSHOT_EMBED = ' + json.dumps(feed, ensure_ascii=False, separators=(',', ':')) + ';'
)

html = open(ROOT / 'template.html').read()
html = html.replace('{{STYLES}}', open(ROOT / 'styles.css').read())
html = html.replace('<script src="data.js"></script>', '<script>\n' + data_js + '\n</script>')
html = html.replace('{{APP}}', open(ROOT / 'app.js').read())
html = html.replace('{{UPDATED}}', datetime.date.today().strftime('%B %-d, %Y'))

out = ROOT / 'docs' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' + html + '\n</html>')
print('built', out, f'{out.stat().st_size/1024:.0f} KB')
