from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EDGE=ROOT/'supabase'/'functions'/'v21-ai-product-parser'/'index.ts'

assert EDGE.exists(), 'v21-ai-product-parser edge function is missing'
text=EDGE.read_text(encoding='utf-8')

for required in [
    'getlink_supplier_products',
    'getlink_ai_knowledge_rules',
    'getlink_ai_product_aliases',
    'getlink_ai_training_examples',
    'getlink_ai_claim_turn',
    'v21_messages',
    'generativelanguage.googleapis.com/v1beta/interactions',
    'finalizeProductLines',
    'splitCustomerSegments',
    'input_segments',
    'segment_index',
    'ai:product:',
]:
    assert required in text, required

for forbidden in [
    'getlink_ai_order_sessions',
    'getlink_ai_order_draft_lines',
    'getlink_ai_reply_outbox',
    'getlink_sales_orders',
    'getlink-orders',
]:
    assert forbidden not in text, forbidden

print('chat AI product parser edge isolation contract PASS')
