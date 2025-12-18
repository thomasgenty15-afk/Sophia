import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isPrelaunchLockdownEnabled } from '../security/prelaunch';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean | null;
  prelaunchLockdown: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: false,
  isAdmin: null,
  prelaunchLockdown: false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const prelaunchLockdown = isPrelaunchLockdownEnabled();

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

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("Auth init session error", error);
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
        await refreshAdmin(data?.session?.user ?? null);
      } catch (err) {
        console.warn("Auth init error", err);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const { data } = supabase.auth.onAuthStateChange((_event: any, nextSession: any) => {
      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);
      refreshAdmin(nextUser);
      setLoading(false);
    });
    
    // @ts-ignore
    return () => data?.subscription?.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isAdmin, prelaunchLockdown, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);