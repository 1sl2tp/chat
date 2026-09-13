from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = (ROOT / 'supabase/functions/v21-order-scribe/index.ts').read_text(encoding='utf-8').lower()

assert 'dấu gạch lặp' in EDGE, 'Vision prompt must preserve handwritten repeat-name marks as structural marks'
assert 'giữ thứ tự dòng' in EDGE, 'Vision must keep handwritten line order so inheritance uses the line directly above'
assert 'không suy diễn' in EDGE, 'Vision must still transcribe literally instead of inventing product names'

print('handwritten repeat-marker Edge contract PASS')
