import { describe, expect, it } from 'vitest';
import {
  billingStatusKind,
  countBilling,
  trialDaysLeft,
} from './coachBilling';

/**
 * KEEL W10.3 — the arithmetic of the coach's billing screen.
 *
 * The rule this file defends: what the coach SEES and what the coach is BILLED
 * are the same two numbers, derived from the same rows, and they are never
 * merged into one.
 */

type Row = {
  coach_client_id: string;
  student_user_id: string | null;
  seat_state: string | null;
  link_status: string | null;
  interaction_count: number | null;
  is_active_seat: boolean | null;
};

let n = 0;
function row(p: Partial<Row>): Row {
  n += 1;
  return {
    coach_client_id: `cc_${n}`,
    student_user_id: `u_${n}`,
    seat_state: 'billed',
    link_status: 'active',
    interaction_count: 0,
    is_active_seat: false,
    ...p,
  };
}

describe('countBilling', () => {
  it('reports billed and followed as two separate numbers', () => {
    expect(
      countBilling([
        row({ is_active_seat: true, interaction_count: 8 }),
        row({ is_active_seat: true, interaction_count: 3 }),
        row({ is_active_seat: false, interaction_count: 2 }),
        row({ is_active_seat: false, interaction_count: 0 }),
      ]),
    ).toEqual({ billed: 2, followed: 4 });
  });

  it('an idle roster is billed at zero but still shown as followed', () => {
    // The failure mode this closes: showing only "0" and letting the coach
    // conclude their students vanished.
    expect(
      countBilling([
        row({ is_active_seat: false, interaction_count: 1 }),
        row({ is_active_seat: false, interaction_count: 2 }),
      ]),
    ).toEqual({ billed: 0, followed: 2 });
  });

  it('invited and paused links count as neither', () => {
    expect(
      countBilling([
        row({ link_status: 'invited', is_active_seat: false }),
        row({ link_status: 'paused', is_active_seat: true }),
        row({ link_status: 'ended', is_active_seat: true }),
        row({ link_status: 'active', is_active_seat: true }),
      ]),
    ).toEqual({ billed: 1, followed: 1 });
  });

  it('an invitation nobody accepted is not a followed student', () => {
    expect(
      countBilling([row({ student_user_id: null, is_active_seat: true })]),
    ).toEqual({ billed: 0, followed: 0 });
  });

  it('an empty roster is zero, not NaN', () => {
    expect(countBilling([])).toEqual({ billed: 0, followed: 0 });
  });
});

describe('billingStatusKind', () => {
  const now = new Date('2026-07-27T12:00:00Z');

  it('paying wins over a still-running trial', () => {
    expect(
      billingStatusKind(
        {
          subscription_status: 'active',
          current_period_end: '2026-08-27T12:00:00Z',
          trial_ends_at: '2026-08-05T12:00:00Z',
        },
        now,
      ),
    ).toBe('subscribed');
  });

  it('an elapsed period is not solvency, it falls back to the trial', () => {
    expect(
      billingStatusKind(
        {
          subscription_status: 'active',
          current_period_end: '2026-07-01T12:00:00Z',
          trial_ends_at: '2026-08-05T12:00:00Z',
        },
        now,
      ),
    ).toBe('trialing');
  });

  it('an elapsed trial with no subscription is expired', () => {
    expect(
      billingStatusKind(
        {
          subscription_status: null,
          current_period_end: null,
          trial_ends_at: '2026-07-01T12:00:00Z',
        },
        now,
      ),
    ).toBe('expired');
  });

  it('a canceled subscription does not read as subscribed', () => {
    expect(
      billingStatusKind(
        {
          subscription_status: 'canceled',
          current_period_end: '2026-08-27T12:00:00Z',
          trial_ends_at: '2026-08-05T12:00:00Z',
        },
        now,
      ),
    ).toBe('trialing');
  });

  it('no dates at all is unknown, never "subscribed"', () => {
    expect(
      billingStatusKind(
        { subscription_status: null, current_period_end: null, trial_ends_at: null },
        now,
      ),
    ).toBe('unknown');
  });
});

describe('trialDaysLeft', () => {
  const now = new Date('2026-07-27T12:00:00Z');

  it('rounds up: 36 hours left is 2 days, never 1', () => {
    expect(trialDaysLeft('2026-07-29T00:00:00Z', now)).toBe(2);
  });

  it('never goes negative', () => {
    expect(trialDaysLeft('2026-07-01T00:00:00Z', now)).toBe(0);
  });

  it('a missing or unparseable date is 0, not NaN on screen', () => {
    expect(trialDaysLeft(null, now)).toBe(0);
    expect(trialDaysLeft('tomorrow', now)).toBe(0);
  });
});
