import { useEffect, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isPrelaunchLockdownEnabled } from '../security/prelaunch';
import {
  AuthContext,
  type AccessTier,
  type AuthSubscription,
} from './AuthContext';

type AuthProviderProps = {
  children: ReactNode;
};

type ProfileAccessRow = {
  trial_end: string | null;
  access_tier: string | null;
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

function normalizeAccessTier(value: unknown): AccessTier {
  const raw = String(value ?? "none").trim().toLowerCase();
  if (
    raw === "trial" ||
    raw === "system" ||
    raw === "alliance" ||
    raw === "architecte"
  ) {
    return raw;
  }
  return "none";
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

      // Fetch profile for trial_end + access_tier (DB computed)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('trial_end,access_tier')
        .eq('id', u.id)
        .single();

      const profile = profileData as ProfileAccessRow | null;
      const accessTierNormalized = normalizeAccessTier(profile?.access_tier);
      setTrialEnd(profile?.trial_end ?? null);
      setAccessTier(accessTierNormalized);

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
      async (event: AuthChangeEvent, nextSession: Session | null) => {
        const eventName = event as unknown as string;
        // If refresh fails (often due to backend offline), clear local tokens to stop retry spam.
        // Note: some supabase-js versions don't include TOKEN_REFRESH_FAILED in AuthChangeEvent typing.
        // We still handle it defensively if it occurs at runtime.
        if (eventName === 'TOKEN_REFRESH_FAILED') {
          await clearLocalSession();
          setLoading(false);
          return;
        }
        setSession(nextSession);
        const nextUser = nextSession?.user ?? null;

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
        refreshAdmin(nextUser);
        refreshSubscription(nextUser);
        setLoading(false);
      }
    );

    return () => data.subscription.unsubscribe();
  }, []);

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
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
