from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_admin_push_edge_contract():
    edge_path=ROOT/'supabase/functions/v21-admin-push/index.ts'
    assert edge_path.exists(), 'v21-admin-push Edge Function is required'
    EDGE=edge_path.read_text('utf-8')
    for token in [
        'npm:web-push@3.6.7',
        'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
        'action === "public_key"', 'action === "subscribe"',
        'action === "unsubscribe"', 'action === "status"', 'action === "drain"',
        'admin_required', 'v21_push_subscriptions', 'v21_admin_push_claim',
        'v21_admin_push_result'
    ]:
        assert token in EDGE, token
    public_key_block=EDGE.split('action === "public_key"',1)[1].split('if(action ===',1)[0]
    assert 'VAPID_PRIVATE_KEY' not in public_key_block


def test_admin_push_drain_wake_auth_and_delivery_contract():
    EDGE=(ROOT/'supabase/functions/v21-admin-push/index.ts').read_text('utf-8')
    for token in [
        'x-push-wake-token',
        'v21_admin_push_auth',
        'sha256Hex',
        'webpush.sendNotification',
        'TTL:60',
        'urgency:"normal"',
        'isGoneStatus',
        'v21_push_subscriptions',
    ]:
        assert token in EDGE, token
    drain=EDGE.split('action === "drain"',1)[1].split('const authHeader',1)[0]
    assert drain.index('x-push-wake-token') < drain.index('v21_admin_push_claim')
