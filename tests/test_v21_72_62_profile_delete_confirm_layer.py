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

# One shell-owned key dispatcher closes confirmation before the outer profile.
# Do not reintroduce a second document Escape listener just to satisfy this test.
start=shell.index('function handleShellOverlayKeydown(event){')
end=shell.index("document.addEventListener('keydown',handleShellOverlayKeydown);",start)
key=shell[start:end]
assert "if(event.key==='Escape')" in key
assert 'if(closeProfileDeleteConfirmation({restoreFocus:true}))return;' in key
assert 'closeProfileEditor();' in key
assert key.index('closeProfileDeleteConfirmation({restoreFocus:true})')<key.index('closeProfileEditor();')
assert 'event.stopImmediatePropagation();' in key
assert "if(event.defaultPrevented)return;" in key
assert shell.count("document.addEventListener('keydown',handleShellOverlayKeydown);")==1

# Focus trap scopes itself to the alertdialog while confirmation is visible.
assert 'constscope=profileDeleteConfirmation()||profileOverlay;' in c
assert "scope.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex=\"-1\"])')" in c

# Confirmation advertises modal semantics and backdrop/cancel dismiss only that layer first.
assert 'role="alertdialog" aria-modal="true"' in shell
assert "wrap.querySelector('.shell-profile-backdrop').addEventListener('click',()=>{" in shell
assert "deleteCancel?.addEventListener('click',()=>{closeProfileDeleteConfirmation({restoreFocus:true});});" in shell

print('V21.72.62 profile delete confirm layer PASS')
