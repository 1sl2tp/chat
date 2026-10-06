from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SERVER=(ROOT/'bridge/zalo/src/server.mjs').read_text('utf-8')
GATEWAY=(ROOT/'bridge/zalo/src/message-gateway.mjs').read_text('utf-8')
EDGE=(ROOT/'supabase/functions/v21-zalo-bridge/index.ts').read_text('utf-8')
MIGRATION=ROOT/'supabase/migrations/20261006203000_zalo_link_event_signal.sql'

def test_bridge_reads_link_snapshot_only_when_started_or_link_state_changes():
    assert "action:'linked_ids'" in GATEWAY
    assert 'action==="linked_ids"' in EDGE
    assert '.from("zalo_user_links").select("zalo_id")' in EDGE
    assert 'refreshLinkedZaloIds' in SERVER
    assert 'ZALO_FALLBACK_POLL_MS' not in SERVER

def test_link_table_change_signals_render_to_refresh_local_route_cache():
    assert MIGRATION.exists()
    sql=MIGRATION.read_text('utf-8').lower()
    assert 'zalo_link_routes_signal' in sql
    assert "after insert or update or delete on public.zalo_user_links" in sql
    assert "https://taphoa-zalo.onrender.com/links-refresh" in sql
    assert "x-bridge-token-sha256" in sql

def test_database_remains_defense_in_depth_for_unlinked_inbound():
    sql='\n'.join(
        p.read_text('utf-8').lower()
        for p in (ROOT/'supabase/migrations').glob('*.sql')
        if 'zalo' in p.name.lower()
    )
    assert 'from public.zalo_user_links' in sql
    assert 'v21_zalo_ingress' in sql
