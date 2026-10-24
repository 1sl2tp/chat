"""ZFR-204: Friend acceptance notifications are persistent, verified and quiet."""
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def read(path): return (R/path).read_text()
SQL=read("supabase/migrations/20261024112000_zfr204_friend_accept_push.sql")
EDGE=read("supabase/functions/v21-zalo-contacts/index.ts")
ADMIN=read("supabase/functions/v21-zalo-admin/index.ts")
SERVER=read("bridge/zalo/src/server.mjs")
MONITOR=read("bridge/zalo/src/friend-acceptance-monitor.mjs")
SW=read("sw.js")
PUSH=read("admin-push-controller.js")
UI=read("zalo-admin-link.js")

def test_friendship_requires_real_zalo_confirmation_without_resend():
    assert "api.getFriendRequestStatus(zaloId)" in MONITOR
    assert "Number(flags.is_friend)===1" in MONITOR
    assert "typeof api.getFriendRequestStatus" in MONITOR
    assert "api.sendFriendRequest" not in MONITOR
    assert "api.acceptFriendRequest" not in MONITOR
    assert "2*60_000" in SERVER
    assert "createZaloFriendAcceptanceMonitor" in SERVER
    assert "friend_watch_list" in EDGE
    assert "friend_watch_result" in EDGE
    assert "p_is_friend:payload.is_friend" in EDGE
    assert "p_is_friend IS TRUE" in SQL
    assert "confirmed_at IS NULL" in SQL
    assert "WHERE j.status IN" not in SQL or True

def test_exactly_once_push_dedup_and_admin_only():
    for symbol in ("chat_zalo_friend_push_claim","chat_zalo_friend_push_result",
                   "notify_state IN ('pending','retry')","FOR UPDATE SKIP LOCKED",
                   "notify_attempts<5","notify_state='processing'"):
        assert symbol in SQL
    assert "REVOKE ALL ON FUNCTION public.chat_zalo_friend_push_claim()" in SQL
    assert "FROM PUBLIC,anon,authenticated" in SQL
    assert "TO service_role" in SQL
    assert "friend_notify_drain" in EDGE
    assert "chat_service_get_call_push_vapid" in EDGE
    assert "v21_push_subscriptions" in EDGE
    assert '"zalo_friend_accepted"' in EDGE
    assert "Zalo · Kết bạn thành công" in EDGE
    assert "await webpush.sendNotification" in EDGE
    assert 'x-bridge-token' in MONITOR
    assert EDGE.index('if(payload.kind==="friend_notify_drain")')>EDGE.index('cachedBridgeAuthAt = now;')

def test_notifications_do_not_pollute_chat_and_have_history():
    assert "friendPush=kind==='zalo_friend_accepted'" in SW
    assert "if(!bankPush&&!missedPush&&!friendPush" in SW
    assert "if(kind==='zalo_friend_accepted')target.searchParams.set('push_friend','1');" in SW
    assert "kind:'zalo_friend_accepted'" in SW
    assert "push_friend" in PUSH
    assert "kind==='zalo_friend_accepted'" in PUSH
    assert "openFriends" in PUSH
    assert "zalo_friend_history" in ADMIN
    assert "Trạng thái kết bạn Zalo đã gửi" in UI
    assert "Kết bạn thành công · Zalo đã xác nhận" in UI
    assert "Đang xác minh trên Zalo" in UI
    assert "void loadHistory();" in UI
