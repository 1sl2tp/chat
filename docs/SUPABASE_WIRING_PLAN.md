# Supabase wiring plan

Owner rule: Supabase is an adapter, not a new state owner.

- `src/session/` owns auth/session lifecycle.
- `src/network/` owns backend reachability.
- `src/supabase/` owns only client configuration and translation between Supabase events/results and the existing owners.
- `src/chat/` will consume RPC/realtime later; it must not own auth/session.
- `src/media/` will consume TURN credentials later; TURN remains separate from Supabase persistence.

Frontend uses only the Supabase project URL and publishable key. No service-role/secret key may be committed or exposed to the browser.
