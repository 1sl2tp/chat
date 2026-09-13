from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = (ROOT / 'supabase/functions/v21-order-scribe/index.ts').read_text(encoding='utf-8').lower()

assert '____' in EDGE, 'Vision prompt must preserve/canonicalize handwritten repeat-name marks as ____'
assert 'gạch' in EDGE, 'Vision prompt must explain the handwritten horizontal repeat mark'
assert 'lặp' in EDGE or 'lap' in EDGE, 'Vision prompt must identify the mark as repeating the previous name/prefix'
assert 'không suy diễn' in EDGE, 'Vision must still transcribe literally instead of inventing product names'

print('handwritten repeat-marker Edge contract PASS')
