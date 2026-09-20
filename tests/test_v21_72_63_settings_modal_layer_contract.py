from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'zalo-admin-link.js').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

c=compact(js)

# Settings modal has explicit outer/inner layer ownership and focus return.
assert 'letaccountModalReturnFocus=null;' in c
assert 'letaccountPanelReturnFocus=null;' in c
assert 'functionaccountPanelNode()' in c
assert 'functioncloseAccountPanel({restoreFocus=true}={})' in c
assert 'functioncloseAccountAdmin({restoreFocus=true}={})' in c

# Nested picker/create/device panels are modal dialogs and remember their opener.
assert "box.setAttribute('role','dialog');" in js
assert "box.setAttribute('aria-modal','true');" in js
assert "form.setAttribute('role','dialog');" in js
assert "form.setAttribute('aria-modal','true');" in js
assert 'accountPanelReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;' in js

# Escape closes the nearest nested layer first, then the outer Settings modal.
key=js[js.index("document.addEventListener('keydown',event=>{"):][:1200]
assert "if(event.key==='Escape')" in key
assert 'if(closeAccountPanel({restoreFocus:true}))return;' in key
assert 'closeAccountAdmin({restoreFocus:true});' in key

# Tab focus is trapped in the active nested dialog, otherwise in the outer card.
assert "constscope=accountPanelNode()||accountModal.querySelector('.zalo-account-card')||accountModal;" in c
assert "if(event.key!=='Tab')return;" in js
assert 'constfocusable=accountModalFocusable();' in c

# Clicking nested backdrop dismisses only nested layer; outer close restores opener focus.
assert "if(event.target===submodal)closeAccountPanel({restoreFocus:true});" in js
assert 'returnFocus.focus({preventScroll:true})' in c

print('V21.72.63 settings modal layer contract PASS')
