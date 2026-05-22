alter table public.user_plan_review_requests
  add column if not exists adjustment_scope text null
    check (
      adjustment_scope is null or adjustment_scope in (
        'current_level_only',
        'future_levels_only',
        'current_plus_future',
        'full_plan'
      )
    ),
  add column if not exists control_mode text null
    check (
      control_mode is null or control_mode in (
        'clarify_only',
        'adjust_current_level',
        'adjust_future_levels',
        'advance_ready'
      )
    ),
  add column if not exists resistance_note text null,
  add column if not exists principle_reminder text null,
  add column if not exists offer_complete_level boolean not null default false,
  add column if not exists conversation_mode text null
    check (
      conversation_mode is null or conversation_mode in (
        'level_adjustment',
        'plan_adjustment',
        'explanation_chat',
        'guardrail_chat'
      )
    ),
  add column if not exists assistant_message text null,
  add column if not exists conversation_thread jsonb not null default '[]'::jsonb,
  add column if not exists session_status text not null default 'active'
    check (
      session_status in (
        'active',
        'preview_ready',
        'completed',
        'expired',
        'restarted'
      )
    ),
  add column if not exists message_count integer not null default 0
    check (message_count >= 0),
  add column if not exists precision_count integer not null default 0
    check (precision_count >= 0),
  add column if not exists preview_plan_id uuid null references public.user_plans_v2(id) on delete set null,
  add column if not exists finalized_plan_id uuid null references public.user_plans_v2(id) on delete set null,
  add column if not exists effective_start_date date null,
  add column if not exists session_expires_at timestamptz null,
  add column if not exists completed_at timestamptz null;

create index if not exists user_plan_review_requests_transformation_status_idx
  on public.user_plan_review_requests(transformation_id, session_status, updated_at desc);

alter table public.user_plans_v2
  drop constraint if exists user_plans_v2_generation_attempts_check;

alter table public.user_plans_v2
  add constraint user_plans_v2_generation_attempts_check
  check (generation_attempts between 0 and 50);
