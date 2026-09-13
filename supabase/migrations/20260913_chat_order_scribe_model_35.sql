begin;

update public.chat_order_scribe_runtime_settings
set model_name='gemini-3.5-flash-lite',
    updated_at=now()
where singleton=true
  and model_name is distinct from 'gemini-3.5-flash-lite';

commit;
