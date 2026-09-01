update public.chat_call_config
set ring_timeout_seconds = 60
where singleton = true
  and ring_timeout_seconds <> 60;
