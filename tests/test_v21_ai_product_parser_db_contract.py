from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=ROOT/'supabase'/'migrations'/'20260912_chat_ai_product_parser.sql'
assert SQL.exists(), 'chat AI migration is missing'
text=SQL.read_text(encoding='utf-8')
assert 'getlink_ai_enqueue_chat_message' in text
assert 'getlink_ai_message_inbox' in text
assert 'getlink_ai_order_sessions' not in text
assert 'getlink_ai_order_draft_lines' not in text
assert 'getlink_sales_orders' not in text
print('chat AI DB isolation contract PASS')
