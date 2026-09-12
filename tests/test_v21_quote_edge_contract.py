from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / "supabase" / "functions" / "v21-quote" / "index.ts"
CORE = ROOT / "supabase" / "functions" / "v21-quote" / "quote-core.mjs"

assert EDGE.exists(), "quotation edge function must exist"
assert CORE.exists(), "quotation core helper must exist"

src = EDGE.read_text(encoding="utf-8")
low = src.lower()

required = [
    'authorization',
    'bearer ',
    'db.auth.getuser',
    'from("v21_accounts")',
    '.eq("role","admin")',
    '.is("deleted_at",null)',
    '.is("locked_at",null)',
    'from("getlink_supplier_sources")',
    'from("getlink_supplier_products")',
    '.eq("is_active",true)',
    '.is("deleted_at",null)',
    'display_price_vnd',
    'from("chat_quote_snapshots")',
    'crypto.getrandomvalues',
    'https://chat.taphoa.xyz/b/?k=',
    '.eq("token",token)',
    '.is("revoked_at",null)',
    'public, max-age=60',
    'access-control-allow-origin',
]
for needle in required:
    assert needle in low, f"missing quotation edge behavior: {needle}"

for forbidden in [
    'input_price_vnd,', 'margin_thousand,', 'actual_profit_vnd,',
    'expected_profit_vnd,', 'supplier_price_history', 'service_role_key" + '"',
]:
    assert forbidden not in low, f"public quotation source must not select/expose internal field: {forbidden}"

assert "req.method===\"post\"" in low or "req.method==='post'" in low
assert "req.method===\"get\"" in low or "req.method==='get'" in low
assert "req.method===\"options\"" in low or "req.method==='options'" in low

print("chat quote edge contract PASS")
