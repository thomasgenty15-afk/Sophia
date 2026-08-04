#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# THE CLOCK SHIM — harness compensation, timestamps ONLY.
#
# Why it exists: the inbound path has NO injectable clock. `extractMessages()`
# drops Meta's `messages[].timestamp` (wa_parse.ts:104-187 — it is read only for
# STATUSES), and `keelLocalDateForUser()` (whatsapp-webhook/index.ts:309) calls
# `new Date()`. So every row a webhook injection creates is stamped with the
# real wall clock. Without this shim a seven-day week collapses onto one real
# date: the second evening tap would UPSERT over the first
# (`student_daily_checkins` is unique on (user_id, local_date)), and the 72h
# silence threshold could never be crossed on purpose.
#
# WHAT IT TOUCHES: created_at / occurred_at / local_date, for THIS run's user
# only. It never writes content, never creates or deletes a row, never changes
# a decision. Every call is echoed into the report.
# ---------------------------------------------------------------------------
set -uo pipefail
JULIE="a1600000-0000-4000-8000-000000000011"

# REAL_MAX bounds every predicate to rows still carrying a REAL-clock stamp.
# Without it a second call re-shifts rows a previous call already moved into the
# simulated future (they satisfy `created_at > mark` too) — which is exactly how
# Monday's tap landed on Tuesday's local_date on the first run of this harness.
REAL_MAX="2026-08-06T00:00:00Z"

shim() { # $1 = mark (rows created after this), $2 = simulated instant
  local mark="$1" sim="$2"
  docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -qAt -c "
    -- chat: keep intra-turn ordering, 1 second apart, anchored on the sim instant
    with ordered as (
      select id, row_number() over (order by created_at) - 1 as rk
      from chat_messages where user_id='$JULIE' and created_at > timestamptz '$mark' and created_at < timestamptz '$REAL_MAX'
    )
    update chat_messages m set created_at = timestamptz '$sim' + (o.rk * interval '1 second')
    from ordered o where m.id = o.id;

    update whatsapp_outbound_messages set created_at = timestamptz '$sim'
     where user_id='$JULIE' and created_at > timestamptz '$mark' and created_at < timestamptz '$REAL_MAX';

    update student_daily_checkins set created_at = timestamptz '$sim',
           local_date = (timestamptz '$sim' at time zone 'Europe/Paris')::date
     where user_id='$JULIE' and created_at > timestamptz '$mark' and created_at < timestamptz '$REAL_MAX';

    update protocol_events set created_at = timestamptz '$sim', occurred_at = timestamptz '$sim',
           local_date = (timestamptz '$sim' at time zone 'Europe/Paris')::date
     where user_id='$JULIE' and created_at > timestamptz '$mark' and created_at < timestamptz '$REAL_MAX';

    update weekly_reviews set created_at = timestamptz '$sim', updated_at = timestamptz '$sim'
     where user_id='$JULIE' and created_at > timestamptz '$mark' and created_at < timestamptz '$REAL_MAX';

    update profiles set whatsapp_last_inbound_at = timestamptz '$sim'
     where id='$JULIE' and whatsapp_last_inbound_at > timestamptz '$mark' and whatsapp_last_inbound_at < timestamptz '$REAL_MAX';
    update profiles set whatsapp_last_outbound_at = timestamptz '$sim'
     where id='$JULIE' and whatsapp_last_outbound_at > timestamptz '$mark' and whatsapp_last_outbound_at < timestamptz '$REAL_MAX';
  " > /dev/null
  echo "[shim] rows created after $mark -> simulated $sim"
}
