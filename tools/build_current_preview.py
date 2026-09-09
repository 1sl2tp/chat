from pathlib import Path
import re, hashlib, json
ROOT=Path(__file__).resolve().parents[1]
src=(ROOT/'index.source.html').read_text('utf-8')
BUILD_PLACEHOLDER='__APP_BUILD_ID__'

def link(m):
    p=m.group('path')
    b=(ROOT/p).read_text('utf-8')
    return f'<style data-inlined-source="{p}">\n{b}\n</style>'

def script(m):
    p=m.group('path')
    b=(ROOT/p).read_text('utf-8')
    return f'<script data-inlined-source="{p}">\n{b}\n</script>'

out=re.sub(
    r'<link rel="stylesheet" href="\./(?P<path>[^"]+)" data-build-source="(?P=path)">',
    link, src
)
out=re.sub(
    r'<script src="\./(?P<path>[^"]+)" data-build-source="(?P=path)"></script>',
    script, out
)
assert out.count(BUILD_PLACEHOLDER)==1, 'missing or duplicate app build placeholder'
canonical=(
    out.encode('utf-8')
    + b'\0manifest\0' + (ROOT/'manifest.webmanifest').read_bytes()
    + b'\0sw\0' + (ROOT/'sw.js').read_bytes()
)
build_id=hashlib.sha256(canonical).hexdigest()
out=out.replace(BUILD_PLACEHOLDER,build_id)
index_bytes=out.encode('utf-8')
(ROOT/'index.html').write_bytes(index_bytes)

m=re.search(r'<meta name="app-release-version" content="([^"]+)">',src)
assert m, 'missing release version meta'
release=m.group(1)
version_path=ROOT/'version.json'
try:
    previous=json.loads(version_path.read_text('utf-8'))
except Exception:
    previous={}
payload={
    'version':release,
    'build_id':build_id,
    'channel':str(previous.get('channel') or 'candidate'),
    'update_policy':'auto-when-safe',
    'published_from':'github-main',
    'index_sha256':hashlib.sha256(index_bytes).hexdigest(),
}
version_path.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n','utf-8')
print(f'index.html {len(index_bytes)} bytes build_id={build_id} sha256={payload["index_sha256"]}')
