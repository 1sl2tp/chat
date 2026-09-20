from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'work-customer-summary.js').read_text('utf-8')

def fn(name):
    marker=f"function {name}"
    start=js.find(marker)
    assert start>=0,name
    open_paren=js.find('(',start)
    assert open_paren>=0,name
    paren_depth=0
    close_paren=-1
    for i in range(open_paren,len(js)):
        c=js[i]
        if c=='(':
            paren_depth+=1
        elif c==')':
            paren_depth-=1
            if paren_depth==0:
                close_paren=i
                break
    assert close_paren>=0,name
    brace=js.find('{',close_paren)
    assert brace>=0,name
    depth=0
    for i in range(brace,len(js)):
        c=js[i]
        if c=='{':
            depth+=1
        elif c=='}':
            depth-=1
            if depth==0:
                return js[start:i+1]
    raise AssertionError(name)

show=fn('showMobileDirectory')
hide=fn('hideMobileDirectory')
focus=fn('focusMobileDirectory')
restore=fn('restoreMobileDirectoryTriggerFocus')
bind=fn('bindMobileNavigationClicks')

# Opening the mobile directory owns visible state and transfers keyboard focus
# to the visible in-panel close control, not the backdrop.
assert "layer.dataset.mobileDirectory='true';" in show
assert "layer.dataset.open='true';" in show
assert "layer.setAttribute('aria-hidden','false');" in show
assert "window.setTimeout(()=>focusMobileDirectory(layer),0);" in show
assert ".shell-navigation-panel [data-shell-command=\"sidebar.close\"]" in js
assert "close.focus({preventScroll:true});" in focus

# Closing returns all mobile-directory state to hidden; focus restoration is
# explicit and only happens for user-driven close paths.
assert "const wasOpen=mobileDirectoryOpen();" in hide
assert "app.dataset.mobileDirectory='false';" in hide
assert "layer.dataset.mobileDirectory='false';" in hide
assert "layer.dataset.open='false';" in hide
assert "layer.setAttribute('aria-hidden','true');" in hide
assert "if(restoreFocus&&wasOpen)restoreMobileDirectoryTriggerFocus();" in hide
assert "trigger.focus({preventScroll:true});" in restore

# Escape respects an already-consumed higher overlay event, then closes the
# mobile directory through its own owner and restores the hamburger trigger.
assert "if(event.defaultPrevented)return;" in bind
assert "if(event.key==='Escape'&&mobileDirectoryOpen())" in bind
assert "hideMobileDirectory('escape',{restoreFocus:true});" in bind

# Backdrop and explicit close button are intercepted in capture phase so the
# shell's old sidebar state cannot desynchronise mobileDirectory.
assert "target.closest('#shellNavigationLayer [data-shell-command=\"sidebar.close\"]')" in bind
assert "if(directoryClose&&mobileDirectoryOpen())" in bind
assert "event.stopImmediatePropagation();" in bind
assert "hideMobileDirectory('directory-close',{restoreFocus:true});" in bind
assert "},true);" in bind

print('V21.72.71 mobile directory close/focus contract PASS')
