from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'work-customer-summary.js').read_text('utf-8')
shell=(ROOT/'shell.js').read_text('utf-8')

def fn(text,name):
    m=re.search(rf"function {re.escape(name)}\([^)]*\)\{{",text)
    assert m,name
    start=m.start()
    depth=0
    seen=False
    for i in range(m.end()-1,len(text)):
        c=text[i]
        if c=='{':
            depth+=1
            seen=True
        elif c=='}':
            depth-=1
            if seen and depth==0:
                return text[start:i+1]
    raise AssertionError(name)

# Desktop remains the reference contract: Settings is Admin-only.
desktop=fn(shell,'renderAccountFooter')
assert "settingsItem.hidden=!(authenticated&&authAccount?.role==='admin');" in desktop

# Mobile menu mirrors the same role rule.
items=fn(js,'syncMobileAccountMenuItems')
assert "const settings=menu.querySelector('[data-mobile-account-action=\"settings\"]');" in items
assert "settings.hidden=!(auth.state==='AUTHENTICATED'&&auth.account?.role==='admin');" in items

# Menu creation and trigger re-sync both refresh current role visibility.
ensure=fn(js,'ensureMobileAccountMenu')
sync=fn(js,'syncMobileAccountMenuTrigger')
assert 'syncMobileAccountMenuItems(wrap);' in ensure
assert 'syncMobileAccountMenuItems();' in sync

# Hidden UI is backed by the same role guard on the action path.
assert "if(action==='settings'){" in js
assert "if(snapshot().account?.role!=='admin')return;" in js
assert "void window.V21ZaloAccountAdmin?.open?.();" in js

print('V21.72.69 mobile Settings Admin parity PASS')
