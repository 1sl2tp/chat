-- Keep PostgREST schema metadata aligned after the historical zalo_contacts.thread_type DDL.
notify pgrst, 'reload schema';
