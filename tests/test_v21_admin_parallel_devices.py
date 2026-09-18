from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
auth=(ROOT/'auth-session-store.js').read_text('utf-8')
shell=(ROOT/'shell.js').read_text('utf-8')
source=(ROOT/'index.source.html').read_text('utf-8')
zalo=(ROOT/'zalo-admin-link.js').read_text('utf-8')
migration=(ROOT/'supabase/migrations/20260918072000_admin_parallel_approved_devices.sql').read_text('utf-8')

assert "device_approval_required" in auth
assert "lastBootstrapError" in auth
assert "data?.device_approval_required" in auth
assert "Thiết bị này đang chờ Admin duyệt" in shell
assert "data-auth-status" in source

assert "v21_admin_devices_list" in zalo
assert "v21_admin_device_approve" in zalo
assert "v21_admin_device_revoke" in zalo
assert "Thiết bị Admin" in zalo
assert "Duyệt" in zalo and "Thu hồi" in zalo
assert "data-admin-device-setting" in zalo

assert "v21_sessions_one_active_per_device" in migration
assert "v21_sessions_one_active_per_account" in migration
assert "approved_at" in migration
print("admin parallel approved devices contract PASS")
