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



# Desktop persistent sidebar is already mounted. Contact navigation calls
# setSidebar(false); that path must not trigger an async contacts refresh after
# the click, otherwise a late full replace can reset the directory viewport.
sidebar_start=SHELL.index("function setSidebar(open){")
sidebar_end=SHELL.index("function renderTopTabs(){",sidebar_start)
sidebar=SHELL[sidebar_start:sidebar_end]
persistent_start=sidebar.index("if(desktopSidebarPersistent){")
persistent_end=sidebar.index("}",persistent_start)
persistent_branch=sidebar[persistent_start:persistent_end]
assert "ContactStore?.refresh" not in persistent_branch
assert "sidebarOpen=false;" in persistent_branch



# Admin directory extension must not force the sidebar to top when a contact
# patch arrives (opening a conversation can immediately mark it read).
DIRECTORY=(ROOT/'contact-directory-admin.js').read_text('utf-8')
assert "document.addEventListener('v21-contact-store-change',()=>scheduleSync());" in DIRECTORY
assert "scheduleSync({scrollToTop:true})" not in DIRECTORY

click_start=DIRECTORY.index("document.addEventListener('click',event=>{")
click_end=DIRECTORY.index("const overlayRoot=",click_start)
directory_click=DIRECTORY[click_start:click_end]
assert "const contact=target?.closest?.('[data-contact-select]');" in directory_click
assert "query='';" in directory_click
assert "if(input)input.value='';" in directory_click
assert "syncDirectoryRows();" in directory_click

# contact-directory-admin.js is dynamically imported rather than inlined, so
# tie its URL to the canonical build id to avoid serving a stale cached module.
ZALO=(ROOT/'zalo-admin-link.js').read_text('utf-8')
assert "contact-directory-admin.js?__build=" in ZALO
assert "meta[name=\"app-build-id\"]" in ZALO

print("V21 contact click position stability contract PASS")
