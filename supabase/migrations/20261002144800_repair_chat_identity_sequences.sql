-- Re-align identity counters after the Supabase cutover restore.
-- Restored rows keep their original IDs, so identity sequences must be advanced to MAX(id).

do $$
declare
  v_max bigint;
begin
  select max(id) into v_max from public.chat_ai_scan_lines;
  if v_max is not null then perform setval('public.chat_ai_scan_lines_id_seq'::regclass,v_max,true); end if;

  select max(source_seq) into v_max from public.chat_ai_scan_sources;
  if v_max is not null then perform setval('public.chat_ai_scan_sources_source_seq_seq'::regclass,v_max,true); end if;

  select max(id) into v_max from public.chat_call_media_diagnostics;
  if v_max is not null then perform setval('public.chat_call_media_diagnostics_id_seq'::regclass,v_max,true); end if;

  select max(id) into v_max from public.v21_session_events;
  if v_max is not null then perform setval('public.v21_session_events_id_seq'::regclass,v_max,true); end if;
end $$;
