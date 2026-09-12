from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=ROOT/'supabase'/'migrations'/'20260912_chat_ai_product_parser.sql'
assert SQL.exists(), 'chat AI migration is missing'
text=SQL.read_text(encoding='utf-8')

for required in [
    'chat_ai_message_inbox',
    'chat_ai_runtime_settings',
    'chat_ai_pilot_customers',
    'chat_ai_claim_turn',
    'chat_ai_runtime_config',
    'chat_ai_enqueue_message',
    'chat_ai_dispatch_inbox',
]:
    assert required in text, required

assert 'getlink_' not in text
assert 'getlink_ai_' not in text
assert 'getlink_sales_orders' not in text
print('chat-owned AI DB isolation contract PASS')
