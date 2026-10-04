from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
AUTH=(ROOT/'auth-session-store.js').read_text('utf-8')
SHELL=(ROOT/'shell.js').read_text('utf-8')

start=AUTH.index("  upsert(item){")
end=AUTH.index("  remove(id){",start)
upsert=AUTH[start:end]

assert "const activityChanged=!previous||contactActivityMs(previous)!==contactActivityMs(next);" in upsert
assert "if(activityChanged){" in upsert
assert "sortContactsByActivity(this.contacts);" in upsert
assert "authUI()?.renderContacts?.(this.contacts);" in upsert
assert "}else if(!authUI()?.patchContact?.(next)){" in upsert

# Read-state patches only has_unread; they must not change latest_at and therefore
# must use patchContact instead of a full reorder/render.
assert "await patchContactSummary(payload.conversation_id,{has_unread:false});" in (ROOT/'v21-sync-engine.js').read_text('utf-8')

# Full list renders still preserve the actual sidebar scroll owner when a real
# message changes activity order.
assert "const scrollHost=host.closest('.wm-sidebar-navigation');" in SHELL
assert "const previousScrollTop=scrollHost?.scrollTop||0;" in SHELL
assert "if(scrollHost)scrollHost.scrollTop=previousScrollTop;" in SHELL

print("V21 contact click position stability contract PASS")
