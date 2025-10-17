create unique index if not exists user_messages_external_id_unique
  on public.user_messages (external_id)
  where external_id is not null;
