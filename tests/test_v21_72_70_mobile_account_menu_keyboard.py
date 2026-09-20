from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'work-customer-summary.js').read_text('utf-8')

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

items=fn(js,'visibleMobileAccountMenuItems')
move=fn(js,'moveMobileAccountMenuFocus')
bind=fn(js,'bindMobileNavigationClicks')

# role=menu keyboard navigation only targets visible, enabled menu items.
assert "querySelectorAll('[role=\"menuitem\"]')" in items
assert '!item.hidden' in items
assert '!item.disabled' in items

# Arrow keys wrap; Home/End jump to the menu edges.
for key in ['ArrowDown','ArrowUp','Home','End']:
    assert key in move
assert "current=items.indexOf(document.activeElement)" in move
assert "(current+1)%items.length" in move
assert "(current-1+items.length)%items.length" in move
assert "next=items.length-1" in move
assert "next=0" in move
assert "event.preventDefault();" in move
assert "focus({preventScroll:true})" in move

# Existing Escape close/restore contract remains the outer owner.
assert "if(mobileAccountMenu?.dataset.open!=='true')return;" in bind
assert "if(event.key==='Escape')" in bind
assert "closeMobileAccountMenu({restoreFocus:true});" in bind
assert "moveMobileAccountMenuFocus(event);" in bind

print('V21.72.70 mobile account menu keyboard navigation PASS')
