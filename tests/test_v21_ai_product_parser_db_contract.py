from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=ROOT/'supabase'/'migrations'/'20260912_chat_ai_product_parser.sql'
KEYS_SQL=ROOT/'supabase'/'migrations'/'20260912_chat_ai_product_keys.sql'
LEVELS_SQL=ROOT/'supabase'/'migrations'/'20260912_chat_ai_product_levels.sql'
IDENTITY_SQL=ROOT/'supabase'/'migrations'/'20260913_chat_ai_product_code_identity.sql'
assert SQL.exists(), 'chat AI migration is missing'
assert KEYS_SQL.exists(), 'chat AI product-key migration is missing'
assert LEVELS_SQL.exists(), 'chat AI explicit level migration is missing'
assert IDENTITY_SQL.exists(), 'chat AI product-code identity migration is missing'
text=SQL.read_text(encoding='utf-8')
keys_text=KEYS_SQL.read_text(encoding='utf-8')
levels_text=LEVELS_SQL.read_text(encoding='utf-8')
identity_text=IDENTITY_SQL.read_text(encoding='utf-8')

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
]:
    assert required in keys_text, required

for required in [
    'alter table public.chat_ai_product_keys',
    'source text',
    'level1 text',
    'level2 text',
    'level3 text',
    'level4 text',
    'level5 text',
    'level6 text',
    'level7 text',
    'level8 text',
    'level9 text',
    'array_remove',
]:
    assert required in levels_text, required

for required in [
    'alter column product_code set not null',
    'drop constraint chat_ai_product_keys_pkey',
    'primary key (product_code)',
]:
    assert required in identity_text.lower(), required

assert 'primary key (product_name)' not in identity_text.lower()
assert 'getlink_' not in text
assert 'getlink_' not in keys_text
assert 'getlink_' not in levels_text
assert 'getlink_' not in identity_text
assert 'getlink_ai_' not in text
assert 'getlink_sales_orders' not in text
print('chat-owned deterministic 1..9 DB isolation contract PASS')
