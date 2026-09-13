from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EDGE=ROOT/'supabase'/'functions'/'v21-ai-product-parser'/'index.ts'
PARSER=ROOT/'supabase'/'functions'/'v21-ai-product-parser'/'parser-core.mjs'
SHARED=ROOT/'supabase'/'functions'/'_shared'/'customer-order-parser.mjs'
CATALOG=ROOT/'supabase'/'functions'/'v21-ai-product-parser'/'catalog-search.mjs'
SUMMARY=ROOT/'supabase'/'functions'/'v21-ai-product-parser'/'order-summary.mjs'

assert EDGE.exists(), 'v21-ai-product-parser edge function is missing'
assert PARSER.exists(), 'chat parser facade is missing'
assert SHARED.exists(), 'Chat and Tách nhanh must share one customer-order parser core'
assert CATALOG.exists(), 'chat catalog search module is missing'
assert SUMMARY.exists(), 'chat order summary module is missing'
text=EDGE.read_text(encoding='utf-8')
parser_text=PARSER.read_text(encoding='utf-8')
shared_text=SHARED.read_text(encoding='utf-8')
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
    'formatOrderSummary',
    'const body=[...output,formatOrderSummary(resolved,catalog)].join("\\n")',
    'catalog_sync:true',
    'catalog_source:"chat_ai_product_keys"',
    'external_api:false',
]:
    assert required in text, required

assert '../_shared/customer-order-parser.mjs' in parser_text
assert 'parseCustomerTextDetailed' in parser_text
assert 'parseCustomerTextPartial' in parser_text
assert 'splitCustomerSegments' in parser_text
assert 'export function parseCustomerTextPartial' in shared_text

for required in [
    "const LEVEL_FIELDS=['level1','level2','level3','level4','level5','level6','level7','level8','level9']",
    'buildCatalogIndex',
    'lowerBound',
    'upperBound',
    'binaryLookup',
    'activeAnchor',
]:
    assert required in catalog_text, required

for forbidden in [
    'findCatalogProductInContext',
    'rootScopeGroups',
    'rowFormulaMatch',
    'findStructuredProduct',
    'buildLooseAliasIndex',
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

print('chat-owned binary exact-window edge isolation contract PASS')
