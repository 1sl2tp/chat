from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = (ROOT / 'supabase/functions/v21-order-scribe/order-ai-prompts.mjs').read_text(encoding='utf-8')

assert 'Nét gạch ngắn đầu dòng (-) chỉ là bullet, KHÔNG kế thừa dòng trên.' in PROMPTS
assert 'Đường kẻ ngang dài (______) hoặc ký hiệu lặp rõ ràng mới cho phép kế thừa mặt hàng gần nhất phía trên.' in PROMPTS
assert 'KHÔNG kế thừa chỉ vì dòng hiện tại ngắn' in PROMPTS
assert 'inherited_from_line chỉ điền khi thực sự có ký hiệu lặp/kế thừa rõ ràng; bình thường để null.' in PROMPTS

print('master safe inheritance/geometry Edge contract PASS')
