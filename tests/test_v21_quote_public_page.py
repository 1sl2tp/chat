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
    'quote-card',
    'quote-table',
    '@media (min-width:760px)',
    'trong zalo: chọn ⋯ → mở bằng trình duyệt',
    'sao chép liên kết',
    'navigator.clipboard',
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

print("chat quote public page contract PASS")
