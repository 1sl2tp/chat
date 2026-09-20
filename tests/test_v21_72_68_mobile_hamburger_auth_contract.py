from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'work-customer-summary.js').read_text('utf-8')

def fn(name):
    m=re.search(rf"function {re.escape(name)}\([^)]*\)\{{",js)
    assert m,name
    start=m.start()
    depth=0
    seen=False
    for i in range(m.end()-1,len(js)):
        c=js[i]
        if c=='{':
            depth+=1
            seen=True
        elif c=='}':
            depth-=1
            if seen and depth==0:
                return js[start:i+1]
    raise AssertionError(name)

owned=fn('mobileAccountMenuOwnedByTrigger')
assert "mobileDirectoryAllowed()&&snapshot().state==='AUTHENTICATED'" in owned

sync=fn('syncMobileAccountMenuTrigger')
# Authenticated mobile owns an actual contextual menu.
assert "if(mobileAccountMenuOwnedByTrigger())" in sync
assert "ensureMobileAccountMenu();" in sync
assert "trigger.setAttribute('aria-haspopup','menu');" in sync
assert "trigger.setAttribute('aria-controls','mobileAccountMenuPanel');" in sync
assert "trigger.setAttribute('aria-expanded',String(Boolean(open)));" in sync
assert "trigger.setAttribute('aria-label',open?'Đóng menu':'Mở menu');" in sync

# Guest mobile is a login action, not a fake menu owner.
assert "trigger.removeAttribute('aria-haspopup');" in sync
assert "if(mobileDirectoryAllowed()&&!authenticated)" in sync
assert "trigger.setAttribute('aria-controls','guestAuthThread');" in sync
assert "trigger.removeAttribute('aria-expanded');" in sync
assert "trigger.setAttribute('aria-label','Đăng nhập');" in sync

# Desktop falls back to the original sidebar disclosure contract.
assert "trigger.setAttribute('aria-controls','shellNavigationLayer');" in sync
assert "trigger.setAttribute('aria-expanded','false');" in sync

# Returning from desktop to mobile re-syncs the correct auth contract.
contract=fn('bindMobileAccountMenuContractSync')
assert "syncMobileAccountMenuTrigger(false);" in contract
assert "if(event.matches)return;" in contract
assert "syncMobileAccountMenuTrigger(false);" in contract
assert "media.addEventListener('change',onChange)" in contract
assert "media.addListener(onChange)" in contract

# Keep the previously locked init sequence intact.
assert 'bindMobileHierarchySwipe();\nbindMobileNavigationClicks();\nbindMobileViewportTransition();\nschedule();' in js
assert 'bindMobileAccountMenuContractSync();\nbindMobileHierarchySwipe();' in js

print('V21.72.68 mobile hamburger auth contract PASS')
