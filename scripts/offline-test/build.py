#!/usr/bin/env python3
"""Build an isolated local copy; never modifies the source checkout or publishes."""
import hashlib
import json
import re
import argparse
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORK = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
OUT = parser.parse_args().output.resolve()
EXPECTED = 'e34456219cbeaa2679625f7e109b10d1377b2706'
CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
sha = lambda data: hashlib.sha256(data).hexdigest()
# Exact source and copy bytes are checked against the validated bundle manifest below.
assert not OUT.is_relative_to(REPO), 'Build outside the checkout'
OUT.mkdir(exist_ok=True)
if any(OUT.iterdir()):
    raise SystemExit('Use a fresh output folder; existing bundle will not be overwritten')
sources = {}
public = set()
def put(relative, data, source=None, serve=True):
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data.encode() if isinstance(data, str) else data)
    if source: sources[relative] = {'path': source, 'sha256': sha((REPO / source).read_bytes())}
    if serve: public.add(relative)
def copy(relative):
    put(relative, (REPO / relative).read_bytes(), source=relative)

# Follow both static ESM and literal dynamic imports; do not package unused/old code.
pending = ['src/js/main.js']; visited = set()
while pending:
    relative = pending.pop()
    if relative in visited: continue
    visited.add(relative); file = REPO / relative
    code = file.read_text()
    for target in re.findall(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']''', code):
        assert target.startswith(('.', '/')), f'Unexpected external module: {relative}'
        dependency = ((REPO / target.lstrip('/')) if target.startswith('/') else file.parent / target).resolve()
        assert dependency.is_relative_to(REPO) and dependency.is_file(), f'Missing module from {relative}'
        pending.append(dependency.relative_to(REPO).as_posix())
    assert relative != 'src/js/firebaseConfig.js'
    copy(relative)
asset_map = json.loads(re.search(r'export default (\{.*\});', (REPO / 'src/js/core/AssetManifest.js').read_text(), re.S).group(1))
for relative in sorted({value.lstrip('/') for value in asset_map.values()}):
    assert relative.startswith('assets/immutable/')
    copy(relative)
for relative in ['src/css/style.css', 'src/css/camp.css', 'src/css/opening.css', 'src/css/combat-polish.css', 'version.txt']:
    copy(relative)

html = (REPO / 'index.html').read_text()
html = html.replace("window.YURIKA_LOCAL_MODE = new URLSearchParams(location.search).get('local') === '1';", '// Offline mode is fixed before the game bootstrap by offline-test.js.')
start = html.index('    <script>\n        if (!window.YURIKA_LOCAL_MODE) {\n            document.write(')
end = html.index('    </script>', start) + len('    </script>')
html = html[:start] + '    <!-- External SDK/font/markdown loaders removed from this offline copy. -->' + html[end:]
html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n    <meta http-equiv="Content-Security-Policy" content="' + CSP + '">\n    <script src="/offline/offline-test.js"></script>')
html = html.replace('</head>', '    <link rel="stylesheet" href="/offline/offline-test.css">\n</head>')
html = html.replace('Yurika Online ${displayVersion}', 'Yurika 오프라인 테스트 ${displayVersion}').replace('<title>Yurika Online v0.02.183</title>', '<title>Yurika 오프라인 테스트 v0.02.183</title>')
assert not re.search(r'https?://', html), 'External URL remains in bootstrap'
put('index.html', html, source='index.html')
manifest = json.loads((REPO / 'manifest.json').read_text())
manifest.update(name='Yurika 오프라인 테스트', short_name='Yurika Test', start_url='./index.html?local=1', id='./offline-e344562')
put('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', source='manifest.json')
local = 'src/js/local/LocalNetworkManager.js'
data = (OUT / local).read_text().replace("'yurika.local.profile.v1'", "'yurika.offline.e344562.profile.v1'")
assert data != (OUT / local).read_text()
put(local, data, source=local)
for name in ['offline-test.js', 'offline-test.css']:
    put('offline/' + name, (WORK / 'templates' / name).read_bytes())
put('README.md', (WORK / 'templates/README.md').read_bytes())
put('serve.py', (WORK / 'templates/serve.py').read_bytes(), serve=False)

# Vendor the exact validated open-license WOFF bytes; never download fonts or SDKs.
for name in ['noto-kr-regular.woff', 'noto-kr-bold.woff', 'LICENSE.txt']:
    put('offline/fonts/' + name, (WORK / 'templates/fonts' / name).read_bytes())

files = []
for file in sorted(OUT.rglob('*')):
    if not file.is_file(): continue
    relative = file.relative_to(OUT).as_posix(); data = file.read_bytes()
    entry = {'path': relative, 'bytes': len(data), 'sha256': sha(data)}
    if relative in sources:
        entry['source'] = sources[relative]
        entry['unchangedFromSource'] = entry['sha256'] == entry['source']['sha256']
    files.append(entry)
info = {'format': 1, 'purpose': 'Local-only offline playable test; not published or delivered', 'sourceCommit': EXPECTED,
    'sourceBranch': 'mmorpg_online', 'version': '0.02.183', 'contentSecurityPolicy': CSP,
    'localStorageKey': 'yurika.offline.e344562.profile.v1',
    'changesInCopy': ['Force local mode before bootstrap', 'Remove all external SDK/font/markdown loader URLs', 'Separate browser-local save namespace', 'Offline label and local Noto font fallback', 'Local manifest title/id', 'Loopback-only allowlist server'],
    'excluded': ['Firebase configuration, rules and credentials', 'node_modules', '.git', 'Source/review artwork duplicates', 'QA reports and scripts', 'Production service worker', 'Unreferenced runtime modules'],
    'publicPaths': sorted(public), 'files': files, 'fileCount': len(files), 'totalFileBytes': sum(f['bytes'] for f in files),
    'note': 'This manifest excludes its own hash; ZIP SHA-256 is recorded separately. Font appearance can differ from online webfonts.'}
(OUT / 'contents-manifest.json').write_text(json.dumps(info, ensure_ascii=False, indent=2)+'\n')
assert sha((OUT / 'contents-manifest.json').read_bytes()) == '399cd7a68812f00dde12c49cbc257fe75cb640254feb36c058b7b36a4baa640b', 'Bundle differs from validated e344562 copy'
print(json.dumps({'bundle': str(OUT), 'files': len(files), 'bytes': info['totalFileBytes'], 'modules': len(visited), 'assets': len(set(asset_map.values())), 'changedSourceFiles': [f['path'] for f in files if f.get('unchangedFromSource') is False]}, ensure_ascii=False))
