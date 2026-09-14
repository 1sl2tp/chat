from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = (ROOT / 'supabase/functions/v21-order-scribe/order-ai-prompts.mjs').read_text(encoding='utf-8')

assert 'Dấu gạch ngang (______), ngoặc ("), cộng (+), hoặc dòng trống: Kế thừa Tên thương hiệu/Loại sản phẩm từ dòng trên.' in PROMPTS
assert 'A là SỐ LƯỢNG' in PROMPTS
assert 'KHÔNG thực hiện phép tính nhân.' in PROMPTS

print('master inheritance/order parsing Edge contract PASS')
