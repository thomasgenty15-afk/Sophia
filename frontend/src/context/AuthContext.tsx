import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type AccessTier = "none" | "trial" | "system" | "alliance" | "architecte";

export type AuthSubscription = {
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_price_id: string | null;
  interval?: "monthly" | "yearly" | null;
  effective_tier?: "system" | "alliance" | "architecte" | "none" | null;
};

export type AccountStatus = "active" | "deletion_pending";

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean | null;
  prelaunchLockdown: boolean;
  subscription: AuthSubscription | null;
  trialEnd: string | null;
  accessTier: AccessTier;
  accountStatus: AccountStatus;
  purgeAt: string | null;
  refreshAccountStatus: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: false,
  isAdmin: null,
  prelaunchLockdown: false,
  subscription: null,
  trialEnd: null,
  accessTier: "none",
  accountStatus: "active",
  purgeAt: null,
  refreshAccountStatus: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);
