import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isPrelaunchLockdownEnabled } from '../security/prelaunch';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean | null;
  prelaunchLockdown: boolean;
  subscription: {
    status: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
    stripe_price_id: string | null;
  } | null;
  trialEnd: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: false,
  isAdmin: null,
  prelaunchLockdown: false,
  subscription: null,
  trialEnd: null,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [subscription, setSubscription] = useState<AuthContextType['subscription']>(null);
  const [trialEnd, setTrialEnd] = useState<string | null>(null);
  const prelaunchLockdown = isPrelaunchLockdownEnabled();

  const isLikelyNetworkError = (err: unknown) => {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'message' in err
          ? String((err as any).message)
          : String(err ?? '');
    // Browser fetch errors (Chrome/Firefox/Safari) + Supabase retryable wrapper.
    return (
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('ERR_CONNECTION_REFUSED') ||
      msg.includes('TypeError: Failed to fetch') ||
      msg.includes('AuthRetryableFetchError')
    );
  };

  const clearLocalSession = async () => {
    // 1) Best effort: stop auto refresh to avoid repeated noisy retries when backend is down.
    try {
      (supabase.auth as any)?.stopAutoRefresh?.();
    } catch {
      // ignore
    }
    // 2) Clear locally persisted session without making any network request.
    try {
      await supabase.auth.signOut({ scope: 'local' as any });
    } catch {
      // ignore
    }
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setSubscription(null);
    setTrialEnd(null);
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
      return;
    }
    try {
      // Fetch profile for trial_end
      const { data: profileData } = await supabase
        .from('profiles')
        .select('trial_end')
        .eq('id', u.id)
        .single();
      
      setTrialEnd((profileData as any)?.trial_end ?? null);

      // Fetch subscription
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('status, current_period_end, cancel_at_period_end, stripe_price_id')
        .eq('user_id', u.id)
        .maybeSingle();
      
      setSubscription((subData as any) ?? null);
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
        // If refresh fails (often due to backend offline), clear local tokens to stop retry spam.
        // Note: some supabase-js versions don't include TOKEN_REFRESH_FAILED in AuthChangeEvent typing.
        // We still handle it defensively if it occurs at runtime.
        if ((event as unknown as string) === 'TOKEN_REFRESH_FAILED') {
          await clearLocalSession();
          setLoading(false);
          return;
        }
        setSession(nextSession);
        const nextUser = nextSession?.user ?? null;
        setUser(nextUser);
        refreshAdmin(nextUser);
        refreshSubscription(nextUser);
        setLoading(false);
      }
    );
    
    // @ts-ignore
    return () => data?.subscription?.unsubscribe();
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
    <AuthContext.Provider value={{ session, user, loading, isAdmin, prelaunchLockdown, subscription, trialEnd, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);