from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'supabase/migrations/20261004220000_platform_account_context.sql').read_text('utf-8')

assert 'create or replace function public.platform_account_context()' in SQL
assert "when a.role='admin' then 'admin'" in SQL
assert "when a.contact_group='customer' then 'customer'" in SQL
assert "else 'contact'" in SQL
assert "'login_enabled',a.auth_user_id is not null" in SQL
assert "'taphoa_admin',v_class='admin'" in SQL
assert "'getlink_admin',v_class='admin'" in SQL
assert "create or replace function public.taphoa_access_context()" in SQL
assert "ctx jsonb:=public.platform_account_context()" in SQL
assert "create or replace function public.v21_auth_bootstrap(" in SQL
assert "v_ctx:=public.platform_account_context()" in SQL

# New canonical classification must not require role='user' anywhere.
assert "role='user'" not in SQL
assert 'role = \'user\'' not in SQL

print('Platform account context contract PASS')
