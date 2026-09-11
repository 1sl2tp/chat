from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
source_path=ROOT/'index.source.html'
source=source_path.read_text('utf-8')
new='<meta name="app-release-version" content="V21.73.0">'
old='<meta name="app-release-version" content="V21.72.39">'
if new in source:
    source=source.replace(new,old,1)
elif old not in source:
    raise SystemExit('unexpected release marker')
source_path.write_text(source,'utf-8')
subprocess.run([sys.executable,str(ROOT/'tools'/'build_current_preview.py')],check=True,cwd=ROOT)
