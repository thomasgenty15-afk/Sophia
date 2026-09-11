import { useEffect, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isPrelaunchLockdownEnabled } from '../security/prelaunch';
import { normalizeAccessTierValue } from '../lib/entitlements';
import { reconcileUiLocaleWithProfile } from '../keel/i18n/reconcile';
import { touchLastSeen } from '../keel/api/presence';
import {
  chosenUiLocale,
  forgetUiLocaleDecision,
  setUiLocaleAndReload,
  uiLocaleDecisionOwner,
} from '../keel/i18n/runtime';
import {
  AuthContext,
  type AccessTier,
  type AccountStatus,
  type AuthSubscription,
} from './AuthContext';

type AuthProviderProps = {
  children: ReactNode;
};

type ProfileAccessRow = {
  trial_end: string | null;
  access_tier: string | null;
  account_status: string | null;
  purge_at: string | null;
  /**
   * La langue DÉCLARÉE du compte — celle que l'agent parle.
   *
   * Elle voyage dans ce `select` plutôt que dans une lecture à elle: la requête
   * existait déjà, sur la même ligne, à chaque événement d'auth. Un mot de plus
   * dans la liste de colonnes coûte zéro aller-retour, là où un second `select`
   * en coûterait un à chaque connexion.
   */
  locale: string | null;
};

type SubscriptionRow = {
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_price_id: string | null;
  interval?: string | null;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) {
    return String((err as { message?: unknown }).message);
  }
  return String(err ?? '');
}

function isLikelyNetworkError(err: unknown) {
  const msg = getErrorMessage(err);
  // Browser fetch errors (Chrome/Firefox/Safari) + Supabase retryable wrapper.
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ERR_CONNECTION_REFUSED') ||
    msg.includes('TypeError: Failed to fetch') ||
    msg.includes('AuthRetryableFetchError')
  );
}

// KEEL W10 — one normalizer, in lib/entitlements.ts. The local copy that used
// to live here did not know 'coach' or 'student', so a KEEL student whose
// profile said 'student' arrived in the app as 'none' — MEGA_REVIEW B6, on the
// client side.
const normalizeAccessTier = normalizeAccessTierValue;

/**
 * LA LANGUE DU COMPTE REPREND LA MAIN SUR CELLE DU NAVIGATEUR.
 *
 * ── POURQUOI ICI ET PAS DANS `initUiLocale` ───────────────────────────────
 * `initUiLocale` tourne AVANT le premier rendu, et la session met deux
 * allers-retours à se résoudre: l'attendre donnerait une vitrine blanche au
 * visiteur anonyme, c'est-à-dire à l'acheteur. La langue du compte n'est donc
 * connaissable qu'ici, une fois la ligne `profiles` lue — et elle l'est dans la
 * requête qui existait déjà.
 *
 * ── POURQUOI UN RECHARGEMENT ──────────────────────────────────────────────
 * `t()` lit une variable de module, et plusieurs constantes de module
 * l'appellent à l'IMPORT (données structurées SEO, table des refus
 * d'invitation). Les repeindre à chaud les laisserait figées à la langue du
 * premier chargement. Le rechargement rend la bascule totale et sans cas
 * particulier — au prix d'un seul, gardé pour qu'il ne se répète jamais.
 */
function adoptProfileLocale(accountId: string, profileLocale: string | null): void {
  const decision = reconcileUiLocaleWithProfile({
    profileLocale,
    chosen: chosenUiLocale(),
    decisionOwner: uiLocaleDecisionOwner(),
    accountId,
  });
  if (decision.kind === "keep") return;
  // `setUiLocaleAndReload` pose le garde AVANT de recharger, sans quoi la page
  // qui revient reprendrait exactement la même décision. Il est posé au nom de
  // CE compte: c'est lui qui vient de décider, et lui seul que ça engage.
  setUiLocaleAndReload(decision.locale, accountId);
}

function normalizeSubscription(
  row: SubscriptionRow | null,
  effectiveTier: AccessTier,
): AuthSubscription | null {
  if (!row) return null;
  return {
    status: row.status,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
    stripe_price_id: row.stripe_price_id,
    interval: row.interval === "monthly" || row.interval === "yearly"
      ? row.interval
      : null,
    effective_tier: effectiveTier === "trial" ? "none" : effectiveTier,
  };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [subscription, setSubscription] = useState<AuthSubscription | null>(
    null,
  );
  const [trialEnd, setTrialEnd] = useState<string | null>(null);
  const [accessTier, setAccessTier] = useState<AccessTier>("none");
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("active");
  const [purgeAt, setPurgeAt] = useState<string | null>(null);
  const prelaunchLockdown = isPrelaunchLockdownEnabled();

  const clearLocalSession = async () => {
    // 1) Best effort: stop auto refresh to avoid repeated noisy retries when backend is down.
    try {
      await supabase.auth.stopAutoRefresh();
    } catch {
      // ignore
    }
    // 2) Clear locally persisted session without making any network request.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore
    }
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setSubscription(null);
    setTrialEnd(null);
    setAccessTier("none");
    setAccountStatus("active");
    setPurgeAt(null);
  };

  const refreshAdmin = async (u: User | null) => {
    if (!u) {
      setIsAdmin(false);
      return;
    }
    setIsAdmin(null);
    try {
      const { data, error } = await supabase
        .from('internal_admins')
        .select('user_id')
        .eq('user_id', u.id)
        .maybeSingle();
      if (error) {
        console.warn('Admin check error', error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(Boolean(data));
    } catch (err) {
      console.warn('Admin check error', err);
      setIsAdmin(false);
    }
  };

  const refreshSubscription = async (u: User | null) => {
    if (!u) {
      setSubscription(null);
      setTrialEnd(null);
      setAccessTier("none");
      setAccountStatus("active");
      setPurgeAt(null);
      return;
    }
    try {
      // Safety net: if time has passed (e.g. end of period) but a webhook was delayed,
      // recompute the user's access tier server-side before we read it.
      try {
        await supabase.rpc("recompute_my_access_tier");
      } catch {
        // non-blocking
      }

      // Fetch profile for trial_end + access_tier (DB computed) + deletion state
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('trial_end,access_tier,account_status,purge_at,locale')
        .eq('id', u.id)
        .single();

      // Transient read error (network hiccup, cold start): don't downgrade a
      // possibly-good tier to "none". Leave access as-is and let the next auth
      // event retry, rather than wrongly showing the "no subscription" panel.
      if (profileError) {
        console.warn('Profile access read error', profileError);
        return;
      }

      const profile = profileData as ProfileAccessRow | null;
      const accessTierNormalized = normalizeAccessTier(profile?.access_tier);
      setTrialEnd(profile?.trial_end ?? null);
      setAccessTier(accessTierNormalized);
      setAccountStatus(
        profile?.account_status === "deletion_pending" ? "deletion_pending" : "active",
      );
      setPurgeAt(profile?.purge_at ?? null);
      adoptProfileLocale(u.id, profile?.locale ?? null);

      // Fetch subscription (DB mirror); we attach `effective_tier` from profiles.access_tier
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('status, current_period_end, cancel_at_period_end, stripe_price_id, interval')
        .eq('user_id', u.id)
        .maybeSingle();

      setSubscription(
        normalizeSubscription(subData as SubscriptionRow | null, accessTierNormalized),
      );
    } catch (err) {
      console.warn('Subscription check error', err);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Auth init session error', error);
          // If the auth server is unreachable (common when Supabase local is stopped),
          // clear any stale refresh token to avoid an infinite refresh retry loop.
          if (isLikelyNetworkError(error)) {
            await clearLocalSession();
            return;
          }
        }
        setSession(data?.session ?? null);
        const currentUser = data?.session?.user ?? null;
        setUser(currentUser);
        await Promise.all([
          refreshAdmin(currentUser),
          refreshSubscription(currentUser)
        ]);
      } catch (err) {
        console.warn('Auth init error', err);
        if (isLikelyNetworkError(err)) {
          await clearLocalSession();
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const { data } = supabase.auth.onAuthStateChange(
      // IMPORTANT: this callback must stay synchronous and must never `await`
      // other supabase.* calls directly. It runs while supabase-js holds the
      // auth lock (Web Locks API); any awaited supabase call inside needs the
      // same lock and deadlocks — `loading` then never clears and every
      // authenticated route renders blank (the white-screen-after-login bug).
      // Defer all supabase work with setTimeout(0) so it runs off the lock.
      (event: AuthChangeEvent, nextSession: Session | null) => {
        const eventName = event as unknown as string;
        // If refresh fails (often due to backend offline), clear local tokens to stop retry spam.
        // Note: some supabase-js versions don't include TOKEN_REFRESH_FAILED in AuthChangeEvent typing.
        // We still handle it defensively if it occurs at runtime.
        if (eventName === 'TOKEN_REFRESH_FAILED') {
          setTimeout(() => {
            void (async () => {
              await clearLocalSession();
              setLoading(false);
            })();
          }, 0);
          return;
        }
        setSession(nextSession);
        const nextUser = nextSession?.user ?? null;

        // LA DÉCISION DE LANGUE DE CET ONGLET MEURT AVEC LA SESSION QUI L'A
        // PRISE. `SIGNED_OUT` est le seul point qui couvre les DEUX sorties —
        // `signOut()` et `clearLocalSession()`, qui appelle
        // `signOut({ scope: 'local' })` — donc le seul endroit où l'écrire une
        // fois. Synchrone, et c'est obligatoire ici: ce rappel tourne sous le
        // verrou d'auth et ne doit jamais attendre (voir la note ci-dessus).
        if (eventName === "SIGNED_OUT") forgetUiLocaleDecision();

        if (eventName === "TOKEN_REFRESHED") {
          setUser((currentUser) =>
            currentUser?.id === nextUser?.id ? currentUser : nextUser
          );
          setLoading(false);
          return;
        }

        setUser((currentUser) =>
          currentUser?.id === nextUser?.id ? currentUser : nextUser
        );
        // Resolve tier/admin before clearing loading (otherwise `loading` flips
        // false while accessTier is still its initial "none", flashing the
        // "no subscription" panel before the real tier resolves). Deferred so
        // the awaited supabase reads run off the auth lock — see note above.
        setTimeout(() => {
          void (async () => {
            await Promise.all([
              refreshAdmin(nextUser),
              refreshSubscription(nextUser),
            ]);
            setLoading(false);
          })();
        }, 0);
      }
    );

    return () => data.subscription.unsubscribe();
  }, []);

  // FF-063 — LE TÉMOIN DE PRÉSENCE.
  //
  // Un effet À PART, et surtout PAS un appel dans le rappel de
  // `onAuthStateChange`: celui-ci tourne pendant que supabase-js tient le
  // verrou d'auth, et tout appel `supabase.*` attendu dedans se bloque (c'est
  // le bug d'écran blanc après connexion, documenté au-dessus). Ici on est
  // hors du verrou, déclenché par le seul changement qui compte — l'identité.
  //
  // `touchLastSeen` se freine lui-même à une fois par jour et par navigateur,
  // et n'attend jamais: rien de ce que rend cette page ne dépend du résultat.
  useEffect(() => {
    if (!user?.id) return;
    touchLastSeen();
  }, [user?.id]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // If backend is down, still clear local state so the UI can recover.
      if (isLikelyNetworkError(err)) {
        await clearLocalSession();
        return;
      }
      throw err;
    }
  };

  const refreshAccountStatus = async () => {
    await refreshSubscription(user);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isAdmin,
        prelaunchLockdown,
        subscription,
        trialEnd,
        accessTier,
        accountStatus,
        purgeAt,
        refreshAccountStatus,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
