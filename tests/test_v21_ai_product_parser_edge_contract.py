from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EDGE=ROOT/'supabase'/'functions'/'v21-ai-product-parser'/'index.ts'

assert EDGE.exists(), 'v21-ai-product-parser edge function is missing'
text=EDGE.read_text(encoding='utf-8')

for required in [
    'getlink_ai_claim_turn',
    'v21_messages',
    'getlink_ai_runtime_config',
    'parseCustomerText',
    'ai:product:',
    'external_api:false',
]:
    assert required in text, required

for forbidden in [
    'api.groq.com',
    'generativelanguage.googleapis.com',
    'groq_api_key',
    'gemini_api_key',
    'getlink_supplier_products',
    'getlink_ai_knowledge_rules',
    'getlink_ai_product_aliases',
    'getlink_ai_training_examples',
    'getlink_ai_order_sessions',
    'getlink_ai_order_draft_lines',
    'getlink_ai_reply_outbox',
    'getlink_sales_orders',
    'getlink-orders',
]:
    assert forbidden not in text, forbidden

print('chat local SL + name parser isolation contract PASS')
