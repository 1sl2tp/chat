from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = (ROOT / 'supabase/functions/v21-order-scribe/order-ai-prompts.mjs').read_text(encoding='utf-8')

assert 'ĐƯỜNG KẺ NGANG DÀI (______): Đây là ký hiệu LẶP LẠI.' in PROMPTS
assert 'Xử lý LẦN LƯỢT TỪNG DÒNG MỘT từ trên xuống dưới.' in PROMPTS
assert 'KHÔNG tự ý sửa chính tả.' in PROMPTS

print('handwritten repeat-marker Edge contract PASS')
