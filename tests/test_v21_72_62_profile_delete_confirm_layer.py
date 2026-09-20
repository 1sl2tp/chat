from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
shell=(ROOT/'shell.js').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

c=compact(shell)

# Delete confirmation is the nearest interaction layer inside the profile modal.
assert 'functionprofileDeleteConfirmation()' in c
assert 'functioncloseProfileDeleteConfirmation({restoreFocus=true}={})' in c
assert 'if(closeProfileDeleteConfirmation({restoreFocus:true}))return;' in c

# Escape closes confirmation first; only the next Escape closes the outer profile.
key=shell[shell.index("document.addEventListener('keydown',event=>{"):][:900]
assert "if(event.key==='Escape')" in key
assert 'closeProfileDeleteConfirmation({restoreFocus:true})' in key
assert 'closeProfileEditor();' in key

# Focus trap scopes itself to the alertdialog while confirmation is visible.
assert 'constscope=profileDeleteConfirmation()||profileOverlay;' in c
assert "scope.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex=\"-1\"])')" in c

# Confirmation advertises modal semantics and backdrop/cancel dismiss only that layer first.
assert 'role="alertdialog" aria-modal="true"' in shell
assert "wrap.querySelector('.shell-profile-backdrop').addEventListener('click',()=>{" in shell
assert "deleteCancel?.addEventListener('click',()=>{closeProfileDeleteConfirmation({restoreFocus:true});});" in shell

print('V21.72.62 profile delete confirm layer PASS')
