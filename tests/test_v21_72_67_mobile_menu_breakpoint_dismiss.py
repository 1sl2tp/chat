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

# One breakpoint query is shared by geometry checks and the transition listener.
assert "const DESKTOP_PERSISTENT_MEDIA='(min-width:64rem) and (hover:hover) and (pointer:fine)';" in js
assert "const desktopPersistentMedia=window.matchMedia?.(DESKTOP_PERSISTENT_MEDIA)||null;" in js
allowed=fn('mobileDirectoryAllowed')
assert 'return !desktopPersistentMedia?.matches;' in allowed

# Crossing into the persistent desktop owner dismisses only the mobile account overlay.
body=fn('bindMobileViewportTransition')
assert 'if(!event.matches)return;' in body
assert 'closeMobileAccountMenu({restoreFocus:false});' in body
assert "media.addEventListener('change',onChange)" in body
assert "media.addListener(onChange)" in body
assert 'hideMobileDirectory(' not in body
assert 'navigation()?.openChat?.()' not in body

# The listener is installed with the existing mobile hierarchy behavior.
assert 'bindMobileHierarchySwipe();\nbindMobileNavigationClicks();\nbindMobileViewportTransition();\nschedule();' in js

print('V21.72.67 mobile account menu breakpoint dismiss PASS')
