#!/usr/bin/env python3
"""Validate the offline copy and completed loopback QA, then create bounded artifacts."""
import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path

SOURCE = 'e34456219cbeaa2679625f7e109b10d1377b2706'
CONTENT_HASH = '399cd7a68812f00dde12c49cbc257fe75cb640254feb36c058b7b36a4baa640b'
ORIGINAL_ZIP_HASH = 'b5d97d506917187e6341bfd04196e241b0ab1341a9c70b7c5f1235c27fe2897b'
PART_SIZE = 24 * 1024 * 1024
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--bundle', type=Path, required=True)
parser.add_argument('--qa', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--commit', required=True)
args = parser.parse_args()
assert re.fullmatch(r'[0-9a-f]{40}', args.commit)
bundle, qa, output = args.bundle.resolve(), args.qa.resolve(), args.output.resolve()
digest = lambda data: hashlib.sha256(data).hexdigest()
manifest_bytes = (bundle / 'contents-manifest.json').read_bytes()
assert digest(manifest_bytes) == CONTENT_HASH, 'Bundle contents differ from validated source'
manifest = json.loads(manifest_bytes)
assert manifest['sourceCommit'] == SOURCE
expected_paths = {f['path'] for f in manifest['files']} | {'contents-manifest.json'}
assert {p.relative_to(bundle).as_posix() for p in bundle.rglob('*') if p.is_file()} == expected_paths
for entry in manifest['files']:
    path = bundle / entry['path']; data = path.read_bytes()
    assert not path.is_symlink() and path.resolve().is_relative_to(bundle)
    assert len(data) == entry['bytes'] and digest(data) == entry['sha256'], entry['path']
    assert not any(p.startswith('.') or p in ('node_modules', '__pycache__') for p in path.relative_to(bundle).parts)
    if entry['path'].startswith('assets/immutable/'):
        assert digest(data).startswith(path.stem), entry['path']
    if path.suffix in ('.js', '.json', '.html', '.css'):
        for pattern in [rb'AIza[0-9A-Za-z_-]{35}', rb'-----BEGIN [A-Z ]*PRIVATE KEY-----', rb'(?:firebaseio\.com|firebasedatabase\.app|yurika-online\.web\.app|www\.gstatic\.com|fonts\.googleapis\.com|cdn\.jsdelivr\.net)']:
            assert not re.search(pattern, data), 'Forbidden configuration/endpoint in ' + entry['path']
classes = json.loads((qa / 'classes' / 'bundle-report.json').read_text())
gameplay = json.loads((qa / 'gameplay' / 'report.json').read_text())
assert classes['status'] == 'passed' and {c['id'] for c in classes['classes']} == {'wizard', 'witch', 'warrior', 'archer'}
assert not classes['pageErrors'] and not classes['externalRequests'] and all(classes['networkGuards'].values())
assert {c['layout'] for c in gameplay['cases']} == {'desktop', 'portrait', 'landscape'}
assert all(c['roundtrip'] for c in gameplay['cases']) and not gameplay['errors'] and not gameplay['external']
output.mkdir(parents=True, exist_ok=True)
assert not any(output.iterdir()), 'Do not overwrite an existing delivery'
archive = output / 'yurika-offline-e344562.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
    for relative in sorted(expected_paths):
        info = zipfile.ZipInfo('yurika-offline-e344562/' + relative, date_time=(2026, 10, 10, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o100644 << 16
        zipped.writestr(info, (bundle / relative).read_bytes())
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    assert len(zipped.infolist()) == len(expected_paths)
    for entry in manifest['files']:
        assert digest(zipped.read('yurika-offline-e344562/' + entry['path'])) == entry['sha256']
full_hash = digest(archive.read_bytes())
parts = []; combined = hashlib.sha256()
with archive.open('rb') as source:
    while chunk := source.read(PART_SIZE):
        number = len(parts) + 1; name = archive.name + f'.part{number:02d}'
        (output / name).write_bytes(chunk); combined.update(chunk)
        parts.append({'order': number, 'file': name, 'bytes': len(chunk), 'sha256': digest(chunk),
                      'artifactName': f'yurika-offline-{args.commit}-part{number:02d}'})
assert len(parts) == 4 and combined.hexdigest() == full_hash
assert sum(p['bytes'] for p in parts) == archive.stat().st_size
manifest_dir = output / 'manifest'; manifest_dir.mkdir()
delivery = {'format': 1, 'sourceCommit': SOURCE, 'buildCommit': args.commit, 'testBranch': 'test/offline-e344562',
    'archive': {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': full_hash, 'entries': len(expected_paths)},
    'validatedOriginalZipSha256': ORIGINAL_ZIP_HASH, 'identicalToOriginalZip': full_hash == ORIGINAL_ZIP_HASH,
    'contentsManifestSha256': CONTENT_HASH, 'contentsIdenticalToValidatedBundle': True,
    'note': 'Compression libraries may vary ZIP bytes; the exact validated inner-file manifest is mandatory. Reassemble and verify against archive.sha256 in this manifest.',
    'parts': parts, 'partLimitBytes': PART_SIZE, 'retentionDays': 1,
    'validation': {'classes': 4, 'layouts': 3, 'externalAppRequests': 0, 'pageErrors': 0, 'networkGuards': classes['networkGuards']},
    'reassembly': 'Download and extract each artifact first. Concatenate the four .partNN files in numeric order. Verify the combined ZIP SHA-256 before extracting it.',
    'run': 'cd yurika-offline-e344562 && python3 serve.py', 'localUrl': 'http://127.0.0.1:8183/',
    'scope': 'Browser-local solo test; no Firebase SDK, online account, multiplayer, deployment, public hosting or tunnel.'}
(manifest_dir / 'delivery-manifest.json').write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + '\n')
shutil.copyfile(bundle / 'contents-manifest.json', manifest_dir / 'contents-manifest.json')
(manifest_dir / 'SHA256SUMS.txt').write_text('\n'.join(f"{p['sha256']}  {p['file']}" for p in parts) + '\n' + full_hash + '  ' + archive.name + '\n')
print(json.dumps(delivery, ensure_ascii=False, indent=2))
