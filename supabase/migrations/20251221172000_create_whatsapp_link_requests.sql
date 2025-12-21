create table if not exists public.whatsapp_link_requests (
  phone_e164 text primary key,
  status text not null default 'pending' check (status in ('pending', 'linked', 'blocked')),
  last_prompted_at timestamptz,
  attempts int not null default 0,
  linked_user_id uuid references public.profiles(id) on delete set null,
  last_email_attempt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_link_requests_status_idx
  on public.whatsapp_link_requests(status);

alter table public.whatsapp_link_requests enable row level security;

-- No public policies: only service role can read/write (service role bypasses RLS).


