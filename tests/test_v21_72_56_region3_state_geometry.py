from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'work-customer-summary.js').read_text('utf-8')
css=(ROOT/'work-customer-summary.css').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

jc=compact(js)
cc=compact(css)

# Empty/loading/error states occupy only the remaining flex lane below a Work header.
state=css[css.index('.work-summary-state{'):css.index('.work-summary-state-title{')]
assert 'flex:1 1 auto;' in state
assert 'min-height:0;' in state
assert 'height:100%' not in state
assert 'padding:18px 16px 22px;' in state

# Status/error surfaces announce themselves without introducing modal behavior.
assert "shell.setAttribute('role',kind==='error'?'alert':'status');" in js
assert "shell.setAttribute('aria-live',kind==='error'?'assertive':'polite');" in js
assert "empty.setAttribute('role','status');" in js
assert "empty.setAttribute('aria-live','polite');" in js

# Overview/detail empty states remain inline children of the Work root.
assert "host.append(empty);" in js
assert 'window.alert(' not in js

print('V21.72.56 Region 3 state geometry PASS')
