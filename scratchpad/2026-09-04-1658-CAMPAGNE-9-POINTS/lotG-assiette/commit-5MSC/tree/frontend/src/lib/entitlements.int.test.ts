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

/**
 * LE FOYER — les deux jetons (chantier 1; migration 20260811030000).
 *
 * C'est le versant NAVIGATEUR du site 4/4. Le versant SQL + Deno est prouvé
 * par `supabase/functions/_shared/tier_vocabulary_test.ts`, qui lit les quatre
 * fichiers et échoue si l'un d'eux ne porte pas les jetons.
 *
 * Ce que ces cas empêchent concrètement: un palier inconnu s'effondre sur
 * 'none' (c'est la règle, et elle est bonne), et 'none' déclenche le tunnel de
 * vente grand public. Sans ces lignes, un foyer QUI PAIE se verrait proposer
 * de s'abonner — la version foyer du « ton essai est terminé » de B6.
 */
describe('le foyer — household et household_member', () => {
  const live = {
    status: 'active',
    current_period_end: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
    stripe_price_id: null,
  };

  it('les deux jetons traversent le normaliseur', () => {
    expect(normalizeAccessTierValue('household')).toBe('household');
    expect(normalizeAccessTierValue('household_member')).toBe('household_member');
    expect(normalizeAccessTierValue(' HOUSEHOLD_MEMBER ')).toBe('household_member');
  });

  it('les deux exécutent — ils viennent d’acheter ces chemins', () => {
    expect(tierGrantsProtocolExecution('household')).toBe(true);
    expect(tierGrantsProtocolExecution('household_member')).toBe(true);
  });

  it('un profil réclamé n’a RIEN à acheter: le maître paie', () => {
    // 2 € par profil sont portés par l'abonnement du compte maître. Demander
    // sa carte au réclamant est disproportionné, et il n'y a rien à lui vendre.
    expect(isInheritedEntitlement('household_member')).toBe(true);
    expect(shouldOfferSelfServeUpgrade('household_member')).toBe(false);
  });

  it('le compte maître non plus: il paie déjà', () => {
    // Son palier est acheté, pas hérité — les deux affirmations ensemble sont
    // ce qui distingue les deux jetons.
    expect(isInheritedEntitlement('household')).toBe(false);
    expect(shouldOfferSelfServeUpgrade('household')).toBe(false);
  });

  it('getEffectiveTier laisse passer le palier calculé par le serveur', () => {
    expect(getEffectiveTier({ ...live, effective_tier: 'household' })).toBe('household');
    expect(getEffectiveTier({ ...live, effective_tier: 'household_member' }))
      .toBe('household_member');
  });
});
