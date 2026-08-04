-- Atomic idempotency for subscription WhatsApp notifications.
--
-- A single subscription change in Stripe emits several
-- `customer.subscription.updated` events. The webhook used to guard against a
-- duplicate confirmation with a non-atomic "does a confirmation message already
-- exist?" read, so two near-simultaneous events both passed the check and both
-- sent a message (observed: two identical "abonnement activé" messages on a
-- plan modification).
--
-- This table lets the webhook claim a notification atomically (unique
-- `dedup_key`): the first event to insert wins, the rest are no-ops. The key
-- collapses one change to one message while still allowing a genuinely later
-- change to notify again:
--   - new:      "<sub_id>:new"                       (once per subscription)
--   - modified: "<sub_id>:modified:<tier>:<interval>" (once per resulting plan)

create table if not exists public.subscription_notifications (
  dedup_key text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_subscription_id text,
  kind text not null,
  created_at timestamptz not null default now()
);

alter table public.subscription_notifications owner to postgres;

create index if not exists subscription_notifications_user_id_idx
  on public.subscription_notifications using btree (user_id);

-- Service-role only (the webhook uses the service role, which bypasses RLS).
-- Mirror stripe_webhook_events: RLS enabled, no policies for anon/authenticated.
alter table public.subscription_notifications enable row level security;

grant all on table public.subscription_notifications to anon;
grant all on table public.subscription_notifications to authenticated;
grant all on table public.subscription_notifications to service_role;
