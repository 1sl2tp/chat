from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261005111750_split_zalo_text_media_delivery.sql"


def test_zalo_text_and_media_have_independent_delivery_parts():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "delivery_part text not null default 'message'" in sql
    assert "check (delivery_part in ('message','text','media'))" in sql
    assert "on public.zalo_message_links(chat_message_id,delivery_part)" in sql
    assert "'text',now(),now()" in sql
    assert "'media',now(),now()" in sql


def test_media_enqueue_no_longer_drops_messages_that_also_have_text():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "btrim(coalesce(v_message.body,''))<>''" not in sql
    assert "new.kind not in ('image','audio','file')" in sql


def test_outbound_contract_never_lets_text_success_mask_media_delivery():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "case when d.delivery_part='media' then ''::text else m.body end" in sql
    assert "when d.delivery_part='text' then '[]'::jsonb" in sql
    assert "a.kind in ('image','audio','file')" in sql


def test_split_delivery_rpc_remains_service_role_only():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "revoke all on function public.v21_zalo_outbound_due_media(integer) from public,anon,authenticated" in sql
    assert "grant execute on function public.v21_zalo_outbound_due_media(integer) to service_role" in sql
