import { describe, expect, it } from 'vitest';
import {
  getEffectiveTier,
  isInheritedEntitlement,
  normalizeAccessTierValue,
  shouldOfferSelfServeUpgrade,
  tierGrantsProtocolExecution,
} from './entitlements';

/**
 * KEEL W10 — the client half of MEGA_REVIEW B6.
 *
 * The server can compute `access_tier='student'` perfectly and the app still
 * show "your trial is over", because the frontend had its OWN tier list and
 * that list did not contain 'student'. These cases pin the vocabulary on both
 * sides of the wire.
 */
describe('normalizeAccessTierValue', () => {
  it('accepts the two KEEL tiers', () => {
    expect(normalizeAccessTierValue('student')).toBe('student');
    expect(normalizeAccessTierValue('coach')).toBe('coach');
  });

  it('still accepts trial and the legacy B2C tiers', () => {
    expect(normalizeAccessTierValue('trial')).toBe('trial');
    expect(normalizeAccessTierValue('alliance')).toBe('alliance');
    expect(normalizeAccessTierValue('architecte')).toBe('architecte');
    expect(normalizeAccessTierValue('system')).toBe('system');
  });

  it('tolerates casing and whitespace from a DB read', () => {
    expect(normalizeAccessTierValue(' STUDENT ')).toBe('student');
    expect(normalizeAccessTierValue('Coach')).toBe('coach');
  });

  it('collapses anything unknown to none, never passes it through', () => {
    // An unrecognized tier must not become access. A typo in a migration is a
    // bug; a typo that grants entitlement is an incident.
    expect(normalizeAccessTierValue('keel_student')).toBe('none');
    expect(normalizeAccessTierValue('premium')).toBe('none');
    expect(normalizeAccessTierValue(null)).toBe('none');
    expect(normalizeAccessTierValue(undefined)).toBe('none');
    expect(normalizeAccessTierValue('')).toBe('none');
    expect(normalizeAccessTierValue(42)).toBe('none');
  });
});

describe('tierGrantsProtocolExecution — the B6 predicate', () => {
  it('a coach-paid student may execute their protocol', () => {
    expect(tierGrantsProtocolExecution('student')).toBe(true);
  });

  it('a coach may too', () => {
    expect(tierGrantsProtocolExecution('coach')).toBe(true);
  });

  it('only none is refused', () => {
    expect(tierGrantsProtocolExecution('none')).toBe(false);
    expect(tierGrantsProtocolExecution(null)).toBe(false);
    expect(tierGrantsProtocolExecution('trial')).toBe(true);
  });
});

describe('isInheritedEntitlement', () => {
  it('is true only for the inherited tier', () => {
    expect(isInheritedEntitlement('student')).toBe(true);
    expect(isInheritedEntitlement('coach')).toBe(false);
    expect(isInheritedEntitlement('trial')).toBe(false);
    expect(isInheritedEntitlement('none')).toBe(false);
  });
});

describe('shouldOfferSelfServeUpgrade', () => {
  it('never offers a student a subscription they cannot own', () => {
    // Their seat is paid by their coach. An upgrade CTA here is the exact
    // "your trial is over" screen B6 reports.
    expect(shouldOfferSelfServeUpgrade('student')).toBe(false);
  });

  it('never sends a coach to the B2C funnel', () => {
    expect(shouldOfferSelfServeUpgrade('coach')).toBe(false);
  });

  it('still offers it to an unbound account', () => {
    expect(shouldOfferSelfServeUpgrade('none')).toBe(true);
    expect(shouldOfferSelfServeUpgrade('trial')).toBe(true);
  });
});

describe('getEffectiveTier passes the KEEL tiers through', () => {
  const live = {
    status: 'active',
    current_period_end: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
    stripe_price_id: null,
  };

  it('returns coach when the server computed it', () => {
    expect(getEffectiveTier({ ...live, effective_tier: 'coach' })).toBe('coach');
  });

  it('returns student when the server computed it', () => {
    // 'student' can never come from a Stripe price id — it has no price. The
    // server-computed field is its ONLY source, which is why it must survive
    // this function unchanged.
    expect(getEffectiveTier({ ...live, effective_tier: 'student' })).toBe('student');
  });

  it('an expired period is still none whatever the tier says', () => {
    expect(
      getEffectiveTier({
        status: 'active',
        current_period_end: new Date(Date.now() - 1000).toISOString(),
        stripe_price_id: null,
        effective_tier: 'coach',
      }),
    ).toBe('none');
  });
});
