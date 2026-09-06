from pathlib import Path
import re, hashlib
ROOT=Path(__file__).resolve().parents[1]
src=(ROOT/'index.source.html').read_text('utf-8')
def link(m):
    p=m.group('path'); b=(ROOT/p).read_text('utf-8')
    return f'<style data-inlined-source="{p}">\n{b}\n</style>'
def script(m):
    p=m.group('path'); b=(ROOT/p).read_text('utf-8')
    return f'<script data-inlined-source="{p}">\n{b}\n</script>'
out=re.sub(r'<link rel="stylesheet" href="\\./(?P<path>[^"]+)" data-build-source="(?P=path)">',link,src)
out=re.sub(r'<script src="\\./(?P<path>[^"]+)" data-build-source="(?P=path)"></script>',script,out)
(ROOT/'index.html').write_text(out,'utf-8')
print(f'index.html {len(out.encode("utf-8"))} bytes sha256={hashlib.sha256(out.encode("utf-8")).hexdigest()}')
