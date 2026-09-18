from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
zalo=(ROOT/'zalo-admin-link.js').read_text('utf-8')
work=(ROOT/'work-customer-summary.js').read_text('utf-8')
workflow=(ROOT/'.github/workflows/verify-v21.yml').read_text('utf-8')
migration=(ROOT/'supabase/migrations/20260918090000_work_realtime_ui_consistency.sql').read_text('utf-8')

assert "ACCOUNT_SETTINGS:'ACCOUNT_SETTINGS'" in app
assert "ACCOUNT_SETTINGS_OWNER='zalo-account-settings'" in zalo
assert "lockBaseUi:true" in zalo
assert 'Cài đặt tài khoản' in zalo
assert 'Nhóm Zalo' in zalo and 'Zalo cá nhân' in zalo
assert 'data-picker-title' in zalo and 'data-create-title' in zalo
assert 'Tạo tài khoản từ ${String(contact.display_name' not in zalo

assert 'chat_customer_summary_state' in work
assert ".on('postgres_changes'" in work
assert 'realtime-summary' in work
assert 'REFRESH_MS=60000' in work
assert 'stopRealtimeSubscription' in work

assert 'chat_customer_summary_state_admin_realtime' in migration
assert 'v21_private.is_current_admin()' in migration
assert 'alter publication supabase_realtime add table public.chat_customer_summary_state' in migration

assert workflow.count('      - main')==1
assert 'v21-72-16-audio-pwa' not in workflow
print('project consistency cleanup contract PASS')
