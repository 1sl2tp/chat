from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BRIDGE=(ROOT/"bridge/zalo/src/friend-requests-sync.mjs").read_text()
SERVER=(ROOT/"bridge/zalo/src/server.mjs").read_text()
EDGE=(ROOT/"supabase/functions/v21-zalo-contacts/index.ts").read_text()
DB=(ROOT/"supabase/migrations/20261024025000_zfr200_zalo_received_friend_requests.sql").read_text()
UI=(ROOT/"zalo-admin-link.js").read_text()

def test_verified_only_not_recommendations():
    assert "getFriendRecommendations()" in BRIDGE
    assert "getFriendRequestStatus(id)" in BRIDGE
    assert "Number(flags?.is_requested)!==1" in BRIDGE
    assert "Number(flags?.is_friend)===1" in BRIDGE
    assert "isPotentialRequest" in BRIDGE
    assert "syncIncomingFriendRequests" in SERVER
    assert "5*60_000" in SERVER
    assert "friendSyncBusy" in SERVER

def test_bridge_authenticated_source_and_admin_only_read():
    assert 'payload.kind === "incoming_friend_requests_snapshot"' in EDGE
    assert 'x-bridge-token' in EDGE
    assert EDGE.index('if (payload.kind === "incoming_friend_requests_snapshot")') > EDGE.index('cachedBridgeAuthAt = now;')
    assert 'v21_zalo_friend_requests' in EDGE
    assert 'friend_requests_status_failed' in EDGE
    assert "ENABLE ROW LEVEL SECURITY" in DB
    assert "role='admin'" in DB
    assert "v21_private.require_active_account" in DB
    assert "REVOKE ALL ON public.v21_zalo_friend_requests FROM PUBLIC,anon,authenticated" in DB

def test_chat_and_zalo_separate_and_stale_is_not_empty():
    assert "Lời mời từ tài khoản Chat" in UI
    assert "Lời mời kết bạn từ Zalo" in UI
    assert "v21_zalo_friend_requests_admin" in UI
    assert "Không thể xác nhận hiện có bao nhiêu lời mời." in UI
    assert "if(!freshness)return;" in UI
    assert "Zalo hiện không có lời mời đến đang chờ." in UI
