from pathlib import Path

ROOT = Path(__file__).parents[1]
AUDIO_SQL = ROOT / "supabase/migrations/20260911_zalo_audio_bridge.sql"
MEDIA_API = ROOT / "supabase/functions/v21-zalo-bridge/index.ts"
SERVER = ROOT / "bridge/zalo/src/server.mjs"


def test_zalo_audio_migration_extends_existing_canonical_media_bridge():
    assert AUDIO_SQL.exists(), "additive Zalo audio migration is required"
    sql = AUDIO_SQL.read_text("utf-8").lower()
    for token in [
        "v21_zalo_ingress_media",
        "enqueue_zalo_media_outbound",
        "v21_zalo_outbound_due_media",
        "'audio'",
        "v21_media_assets",
        "service_role",
    ]:
        assert token in sql, token
    assert "new.kind not in ('image','audio','file')" in sql
    assert "a.kind in ('image','audio','file')" in sql


def test_zalo_edge_accepts_audio_but_keeps_audio_out_of_generic_file_validation():
    source = MEDIA_API.read_text("utf-8").lower()
    assert "['image','audio','file']" in source
    assert "kind===\"audio\"" in source or "kind==='audio'" in source
    assert "startswith(\"audio/\")" in source or "startswith('audio/')" in source
    assert "mimeType.startsWith(\"audio/\")".lower() in source or "mimetype.startswith('audio/')" in source


def test_zalo_runtime_sends_audio_with_sendvoice():
    source = SERVER.read_text("utf-8")
    assert "api.sendVoice" in source
    assert "voiceUrl" in source
