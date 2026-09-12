from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=ROOT/'supabase'/'migrations'/'20260912_chat_ai_product_parser.sql'
KEYS_SQL=ROOT/'supabase'/'migrations'/'20260912_chat_ai_product_keys.sql'
assert SQL.exists(), 'chat AI migration is missing'
assert KEYS_SQL.exists(), 'chat AI product-key migration is missing'
text=SQL.read_text(encoding='utf-8')
keys_text=KEYS_SQL.read_text(encoding='utf-8')

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

for required in [
    'chat_ai_product_keys',
    'product_name',
    'c1',
    'c2',
    'size',
    'label2',
    'form',
    'color',
    'volume',
    'variant',
]:
    assert required in keys_text, required

assert 'getlink_' not in text
assert 'getlink_' not in keys_text
assert 'getlink_ai_' not in text
assert 'getlink_sales_orders' not in text
print('chat-owned AI DB isolation contract PASS')