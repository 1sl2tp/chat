from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "b" / "index.html"
assert PAGE.exists(), "public quotation page must exist"

html = PAGE.read_text(encoding="utf-8")
low = html.lower()

required = [
    '<meta name="viewport"',
    '<title>báo giá taphoa</title>',
    'property="og:title" content="báo giá taphoa"',
    'new urlsearchparams(location.search)',
    ".get('k')",
    'v21-quote?k=',
    'id="quote-search"',
    'id="quote-source-filters"',
    'id="quote-scroll"',
    'quote-card',
    'quote-table',
    '@media (min-width:760px)',
    'trong zalo: chọn ⋯ → mở bằng trình duyệt',
    'sao chép liên kết',
    'navigator.clipboard',
    "['all','tất cả']",
    "['hang-thuong','hàng thường']",
    "['hang-u','hàng u']",
    "['masan','masan']",
    "['sua','sữa']",
    "['thuoc-la','thuốc lá']",
    "let activesource='all'",
    "snapshot.scope==='all'",
    "item.source_key===activesource",
    'overflow-y:auto',
    'height:100dvh',
]
for needle in required:
    assert needle in low, f"missing public quote page contract: {needle}"

for forbidden in [
    'cdn.',
    'tailwind',
    'localstorage',
    'document.cookie',
    'window.open(',
    'location.href=',
    'location.replace(',
    'signIn',
    'login',
]:
    assert forbidden.lower() not in low, f"Zalo-safe quote page must not depend on {forbidden}"

assert '<script src=' not in low, "public quote page must not load external scripts"
assert low.count('fetch(') == 1, "public quote page must make exactly one network fetch"
assert 'body{margin:0' in low and 'overflow:hidden' in low, "page shell must stay fixed while only quote results scroll"

print("chat quote public page contract PASS")
