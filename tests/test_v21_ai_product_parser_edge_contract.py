from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EDGE=ROOT/'supabase'/'functions'/'v21-ai-product-parser'/'index.ts'
CATALOG=ROOT/'supabase'/'functions'/'v21-ai-product-parser'/'catalog-search.mjs'

assert EDGE.exists(), 'v21-ai-product-parser edge function is missing'
assert CATALOG.exists(), 'chat catalog search module is missing'
text=EDGE.read_text(encoding='utf-8')
catalog_text=CATALOG.read_text(encoding='utf-8')

for required in [
    'chat_ai_claim_turn',
    'chat_ai_runtime_config',
    'chat_ai_message_inbox',
    'v21_messages',
    '.eq("active",true)',
    'from("chat_ai_product_keys")',
    'product_code,product_name,source,level1,level2,level3,level4,level5,level6,level7,level8,level9',
    'parseCustomerTextDetailed',
    'resolveParsedLinesWithCatalog',
    'catalog_sync:true',
    'catalog_source:"chat_ai_product_keys"',
    'external_api:false',
]:
    assert required in text, required

for required in [
    "const LEVEL_FIELDS=['level1','level2','level3','level4','level5','level6','level7','level8','level9']",
    'findCatalogProductInContext',
    'rootScopeGroups',
    'pathLength:path.length',
]:
    assert required in catalog_text, required

for forbidden in [
    'from("products")',
    'catalog_source:"products"',
    'getlink_',
    'api.groq.com',
    'generativelanguage.googleapis.com',
    'groq_api_key',
    'gemini_api_key',
    'resolveTobaccoConfirmation',
    'findPendingTobaccoConfirmation',
    '1 = thùng, 0 = cây',
    'order_workflow:true',
    'product_name,type,c1,c2,size,label2,form,color,volume,variant',
]:
    assert forbidden not in text, forbidden

print('chat-owned deterministic 1..9 latest-product-key search edge contract PASS')
