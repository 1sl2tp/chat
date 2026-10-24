"""ZFR-206: Zalo personal alias is the first choice for all link pickers."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
VIEW=(ROOT/"zalo-admin-link.js").read_text("utf-8")
EDGE=(ROOT/"supabase/functions/v21-zalo-admin/index.ts").read_text("utf-8")
BRIDGE=(ROOT/"bridge/zalo/src/server.mjs").read_text("utf-8")
CONTACT=(ROOT/"bridge/zalo/src/contact-sync.mjs").read_text("utf-8")
MONITOR=(ROOT/"bridge/zalo/src/friend-acceptance-monitor.mjs").read_text("utf-8")

def test_all_linking_pickers_prioritize_alias_but_offer_profile_check():
    assert "function zaloName(contact)" in VIEW
    assert "contact?.alias_name||contact?.display_name" in VIEW
    assert "function zaloProfileName(contact)" in VIEW
    assert "Tên hồ sơ: " in VIEW
    assert "function zaloMatch(contact,query)" in VIEW
    assert "contact?.alias_name,contact?.display_name" in VIEW
    assert "filter(contact=>zaloMatch(contact,query))" in VIEW
    assert "if(!zaloMatch(contact,query))continue" in VIEW
    assert "state.textContent=[zaloProfileName(contact)" in VIEW
    assert "title.textContent=contact?zaloName(contact)" in VIEW
    assert 'select("zalo_id,display_name,profile_name,alias_name,avatar_url,last_seen_at,thread_type")' in EDGE

def test_bridge_refreshes_new_friend_nickname_without_erasing_prior_aliases():
    assert "api.getAliasList(" in CONTACT
    assert "alias_name:hasAlias?aliasSnapshot.aliases.get(zaloId):null" in CONTACT
    assert "aliasSnapshotComplete:aliasSnapshot.complete" in CONTACT
    assert "if(!aliasSnapshot.complete&&!hasAlias)return friend;" in CONTACT
    assert "onConfirmed:()=>refreshContactDirectory()" in BRIDGE
    assert "contactAliasTimer=setInterval(()=>void refreshContactDirectory(),5*60_000)" in BRIDGE
    assert "if(contactDirectoryBusy||!api||!contactSync)return null;" in BRIDGE
    assert "typeof onConfirmed==='function'" in MONITOR
    assert "await onConfirmed()" in MONITOR

def test_no_duplicate_account_or_forced_auto_link():
    assert "openAccountPicker(account)" in VIEW
    assert "action:'link'" in VIEW
    assert "Tạo tài khoản" in VIEW
    assert "openCreateAccount(contact)" in VIEW
