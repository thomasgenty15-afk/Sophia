-- Add scoped conversations to avoid cross-channel / cross-module bleed.
-- Scopes:
-- - web: default in-app chat
-- - whatsapp: WhatsApp conversation
-- - module:<moduleId>: isolated module chats (weeks/forge/etc)

-- 1) chat_messages: add scope and backfill
alter table public.chat_messages
  add column if not exists scope text not null default 'web';

-- WhatsApp messages (identified via jsonb metadata)
update public.chat_messages
set scope = 'whatsapp'
where (metadata->>'channel') = 'whatsapp';

-- Module conversations (identified via metadata injected by frontend)
update public.chat_messages
set scope = ('module:' || (metadata->>'moduleId'))
where (metadata->>'source') = 'module_conversation'
  and coalesce(metadata->>'moduleId','') <> '';

-- Safety: no empty scopes
update public.chat_messages
set scope = 'web'
where scope is null or scope = '';

create index if not exists idx_chat_messages_user_scope_created
  on public.chat_messages (user_id, scope, created_at desc);

-- 2) user_chat_states: add scope and turn PK into (user_id, scope)
alter table public.user_chat_states
  add column if not exists scope text not null default 'web';

update public.user_chat_states
set scope = 'web'
where scope is null or scope = '';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_chat_states_pkey'
      and conrelid = 'public.user_chat_states'::regclass
  ) then
    alter table public.user_chat_states drop constraint user_chat_states_pkey;
  end if;
end $$;

alter table public.user_chat_states
  add constraint user_chat_states_pkey primary key (user_id, scope);

create index if not exists idx_user_chat_states_user_scope
  on public.user_chat_states (user_id, scope);




