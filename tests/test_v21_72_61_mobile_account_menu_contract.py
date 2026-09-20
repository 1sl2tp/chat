from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'work-customer-summary.js').read_text('utf-8')
css=(ROOT/'work-customer-summary.css').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

jc=compact(js)
cc=compact(css)

# Mobile hamburger is the one trigger owner for a contextual account menu.
assert 'functionmobileAccountMenuTrigger()' in jc
assert "trigger.setAttribute('aria-haspopup','menu');" in js
assert "trigger.setAttribute('aria-controls','mobileAccountMenuPanel');" in js
assert "trigger.setAttribute('aria-expanded',String(Boolean(open)));" in js
assert 'id="mobileAccountMenuPanel"' in js

# Open moves focus into the menu; button toggles; backdrop/Escape close and restore focus.
assert 'functiontoggleMobileAccountMenu()' in jc
assert "menu.querySelector('[role=\"menuitem\"]')?.focus?.({preventScroll:true});" in js
assert 'closeMobileAccountMenu({restoreFocus:true});' in js
assert "if(event.key!=='Escape'||mobileAccountMenu?.dataset.open!=='true')return;" in js
assert 'toggleMobileAccountMenu();' in js

# Menu rows expose hover/focus/pressed states without changing action semantics.
assert '.mobile-account-menu-row:hover,.mobile-account-menu-row:focus-visible{' in cc
assert 'background:var(--theme-action-ghost-surface-hover);' in css
assert '.mobile-account-menu-row:active{' in css

print('V21.72.61 mobile account menu contract PASS')
