from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = (ROOT / 'supabase/functions/v21-order-scribe/order-ai-prompts.mjs').read_text(encoding='utf-8')

assert 'Nét gạch ngắn đầu dòng (-): chỉ là bullet; bỏ dấu gạch, KHÔNG tự kế thừa tên dòng trên.' in PROMPTS
assert 'Đường kẻ ngang dài (______), dấu nháy lặp (\") hoặc dấu + dùng rõ ràng như ký hiệu lặp: được phép kế thừa tên mặt hàng gần nhất phía trên.' in PROMPTS
assert 'Dòng trống tự nó KHÔNG phải bằng chứng kế thừa.' in PROMPTS
assert 'nếu xuất hiện tên hàng mới thì ngắt kế thừa ngay.' in PROMPTS

print('master safe inheritance/geometry Edge contract PASS')
