"""ZFR-203: Admin's phone number sends an actual Zalo friend request via the bridge."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MIG=(ROOT/"supabase/migrations/20261024110000_zfr203_phone_friend_actions.sql").read_text()
ADMIN=(ROOT/"supabase/functions/v21-zalo-admin/index.ts").read_text()
BRIDGE=(ROOT/"supabase/functions/v21-zalo-contacts/index.ts").read_text()
SERVER=(ROOT/"bridge/zalo/src/server.mjs").read_text()
WORKER=(ROOT/"bridge/zalo/src/friend-action-worker.mjs").read_text()
UI=(ROOT/"zalo-admin-link.js").read_text()

def test_admin_pressed_button_enqueues_once_not_auto_chat_signup():
    assert 'action === "zalo_friend_request"' in ADMIN
    assert 'action === "zalo_friend_status"' in ADMIN
    assert 'caller.role !== "admin"' in ADMIN
    assert ADMIN.index('caller.role !== "admin"') < ADMIN.index('action === "zalo_friend_request"')
    assert '.from("v21_zalo_friend_actions")' in ADMIN
    assert 'requested_by:caller.id' in ADMIN
    assert 'status:"queued"' in ADMIN
    assert 'action === "create_phone_account"' in ADMIN
    assert 'Tạo tài khoản Chat' in UI
    assert 'Kết bạn Zalo' in UI
    assert "action:'zalo_friend_request'" in UI
    assert "action:'zalo_friend_status'" in UI
    assert "window.open('https://zalo.me/'" not in UI

def test_bridge_real_zalo_api_and_no_automatic_retries():
    for method in ('api.findUser(phone)','api.getFriendRequestStatus(zaloId)',
                   'api.sendFriendRequest(', 'api.acceptFriendRequest('):
        assert method in WORKER
    assert "Number(flags?.is_friend)===1" in WORKER
    assert "Number(flags?.is_requesting)===1" in WORKER
    assert "Number(flags?.is_requested)===1" in WORKER
    assert "status:'unknown',error_code:'zalo_send_unconfirmed'" in WORKER
    assert "10_000" in SERVER
    assert "friend_action_next" in WORKER
    assert "friend_action_complete" in WORKER
    assert "x-bridge-token" in WORKER

def test_row_lock_one_claim_audited_and_private():
    assert "phone text NOT NULL UNIQUE" in MIG
    assert "attempt_count BETWEEN 0 AND 1" in MIG
    assert "FOR UPDATE SKIP LOCKED" in MIG
    assert "attempt_count=1" in MIG
    assert "status='queued' AND attempt_count=0" in MIG
    assert "WHERE id=p_id AND status='processing'" in MIG
    assert "ENABLE ROW LEVEL SECURITY" in MIG
    assert "REVOKE ALL ON FUNCTION public.chat_zalo_friend_claim()" in MIG
    assert "FROM PUBLIC,anon,authenticated" in MIG
    assert "TO service_role" in MIG
    assert 'payload.kind==="friend_action_next"' in BRIDGE
    assert 'payload.kind==="friend_action_complete"' in BRIDGE
    assert BRIDGE.index('payload.kind==="friend_action_next"')>BRIDGE.index('cachedBridgeAuthAt = now;')
    assert 'chat_zalo_friend_claim' in BRIDGE
    assert 'chat_zalo_friend_complete' in BRIDGE
