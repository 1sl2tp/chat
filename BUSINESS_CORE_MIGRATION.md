# BUSINESS CORE Supabase migration

Current production target: `chat-bh-get` (`vtqhbhrkdxirqeqkgylo`, Singapore).

Scope:
- Chat / Zalo
- Bán hàng
- Getlink hot/current data
- Auth, Business Storage, Realtime, Edge Functions and cron

Isolation:
- YouTube / TikTok remain on the old Supabase project.
- Getlink raw/history are not copied into the hot Business Core database.
- Getlink scheduled refresh runs once per day at 06:00 VN; the worker window only drains the same daily batch.

Cutover safety:
- Old business data is retained temporarily for rollback.
- Runtime endpoints have been switched to the new project before old business cron jobs are disabled.
