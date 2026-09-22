from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / "supabase" / "functions" / "v21-quote" / "index.ts"
CORE = ROOT / "supabase" / "functions" / "v21-quote" / "quote-core.mjs"

assert EDGE.exists(), "quotation edge function must exist"
assert CORE.exists(), "quotation core helper must exist"

src = EDGE.read_text(encoding="utf-8")
low = src.lower()

required = [
    'authorization','apikey','x-client-info','bearer ','db.auth.getuser',
    'from("v21_accounts")','.eq("role","admin")','.is("deleted_at",null)','.is("locked_at",null)',
    'from("taphoa_sources")','from("taphoa_products")','.eq("is_active",true)','.eq("sync_status","active")',
    'sale_price_vnd',"body?.action","sources",'from("chat_quote_snapshots")','crypto.getrandomvalues',
    'https://app.taphoa.xyz/kh/?kh=','&tab=hang','&tab=no',
    'v21_customer_public_links','public_slug',"url.searchparams.get('kh')","url.searchparams.get('nguon')",
    "url.searchparams.get('mini')",'taphoa_public_customer_product_signals',
    'purchase_orders','market_customers','customer-mini',
    'v21_customer_public_link_info_get_or_create','customer_account_id','customer-links',
    '.is("revoked_at",null)','generated_at',"'cache-control':'no-store'",'access-control-allow-origin',
]
for needle in required:
    assert needle in low, f"missing quotation edge behavior: {needle}"

for forbidden in [
    'input_price_vnd,','margin_thousand,','actual_profit_vnd,','expected_profit_vnd,',
    'supplier_price_history','service_role_key"',
]:
    assert forbidden not in low, f"public quotation source must not expose internal field: {forbidden}"

assert "req.method===\"post\"" in low or "req.method==='post'" in low
assert "req.method===\"get\"" in low or "req.method==='get'" in low
assert "req.method===\"options\"" in low or "req.method==='options'" in low
assert low.count('from("taphoa_products")') >= 3
assert "select('scope,source_key,source_name,created_at')" in low
assert ".gt('sale_price_vnd',0)" not in src
assert '.gt("sale_price_vnd",0)' not in src
assert "url.searchparams.get('k')" not in low
assert '.eq("token",' not in low

# Legacy source-specific public links remain stable while the mini app reads one unified catalog.
assert ".eq('scope','source')" in src
assert ".eq('source_key',requestedSourceKey)" in src
assert "scope=requestedSourceKey?'source'" in src

print("chat quote edge contract PASS")
