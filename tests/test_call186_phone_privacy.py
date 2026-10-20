from pathlib import Path
root=Path(__file__).resolve().parents[1]
sql=(root/'supabase/migrations/20261021062000_call186_ios_phone_missed_push.sql').read_text()
edge=(root/'supabase/functions/v21-admin-push/index.ts').read_text()
client=(root/'contact-phone-admin.js').read_text()
def test_admin_phone_privacy():
    for token in ['v21_contact_private_phones','ENABLE ROW LEVEL SECURITY','REVOKE ALL ON public.v21_contact_private_phones',
                  'require_active_account(p_app_session_id)',"a.role='admin'",'v21_admin_contact_phone']:
        assert token in sql,token
    assert "window.location.href='tel:'" in client
    assert 'navigator.contacts' not in client
def test_missed_calls_push_only_real_chat_records():
    for token in ['v21_missed_call_push_outbox','UNIQUE(source_kind,source_id,recipient_account_id)',
                  'v21_missed_chat_call_trg','v21_missed_guest_invite_trg','v21_missed_push_signal_trg',
                  'v21_private.admin_push_signal()','v21_missed_call_push_claim','v21_missed_call_push_result',
                  "old.status<>'RINGING'",'new.accepted_at IS NOT NULL']:
        assert token in sql,token
    for token in ['buildMissedChatCallPayload','v21_missed_call_push_claim','v21_missed_call_push_result',
                  'source?.accepted_at','deliverToSubscriptions']:
        assert token in edge,token
    assert 'INSERT INTO public.v21_messages' not in sql