create table if not exists public.whatsapp_link_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'consumed', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_phone_e164 text
);

create index if not exists whatsapp_link_tokens_user_id_idx
  on public.whatsapp_link_tokens(user_id);

create index if not exists whatsapp_link_tokens_expires_at_idx
  on public.whatsapp_link_tokens(expires_at);

alter table public.whatsapp_link_tokens enable row level security;
-- No public policies: service role only.


