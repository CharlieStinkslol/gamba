// /src/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { registerUser, signInUser, signOutUser } from '../lib/supabase';

type AuthUser = {
  id: string;
  email: string | null;
  username: string;
  balance: number;
  level: number;
  experience: number;
  currency: string;
  stats: {
    totalBets: number;
    totalWins: number;
    totalLosses: number;
    totalWagered: number;
    totalWon: number;
    biggestWin: number;
    biggestLoss: number;
  };
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  register: (email: string, username: string, password: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  formatCurrency: (amount: number) => string;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

async function fetchProfile(userId: string) {
  // Fetch user profile
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id, username, balance, level, experience, currency')
    .eq('id', userId)
    .single();

  if (userErr) throw userErr;

  // Fetch user stats
  const { data: statsRow, error: statsErr } = await supabase
    .from('user_stats')
    .select(
      'total_bets, total_wins, total_losses, total_wagered, total_won, biggest_win, biggest_loss'
    )
    .eq('user_id', userId)
    .single();

  if (statsErr) throw statsErr;

  const profile: AuthUser = {
    id: userRow.id,
    email: null, // you can load from auth if needed
    username: userRow.username,
    balance: userRow.balance,
    level: userRow.level,
    experience: userRow.experience,
    currency: userRow.currency,
    stats: {
      totalBets: statsRow?.total_bets ?? 0,
      totalWins: statsRow?.total_wins ?? 0,
      totalLosses: statsRow?.total_losses ?? 0,
      totalWagered: statsRow?.total_wagered ?? 0,
      totalWon: statsRow?.total_won ?? 0,
      biggestWin: statsRow?.biggest_win ?? 0,
      biggestLoss: statsRow?.biggest_loss ?? 0,
    },
  };

  return profile;
}

type ProviderProps = { children: ReactNode };

export const AuthProvider = ({ children }: ProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hydrateProfile = async (userId: string) => {
    const profile = await fetchProfile(userId);
    setUser(profile);
  };

  // On mount, try to load the current auth user and profile
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { data, error: getErr } = await supabase.auth.getUser();
        if (getErr) {
          // eslint-disable-next-line no-console
          console.error('getUser error:', getErr);
          return;
        }
        const authUser = data?.user;
        if (authUser && isMounted) {
          await hydrateProfile(authUser.id);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Auth init failed', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    // Listen to auth state changes to keep context in sync
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        return;
      }
      // Signed in / token refreshed
      try {
        await hydrateProfile(session.user.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Hydrate on auth change failed:', e);
      }
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const register = async (email: string, username: string, password: string) => {
    setError(null);
    try {
      const authData = await registerUser(email, password);
      
      if (authData?.user) {
        // Create user profile in users table
        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            username,
            balance: 1000,
            level: 1,
            experience: 0,
            currency: 'USD'
          });

        if (userError) {
          // eslint-disable-next-line no-console
          console.error('Error creating user profile:', userError);
          throw userError;
        }

        // Create initial stats row
        const { error: statsError } = await supabase
          .from('user_stats')
          .insert({
            user_id: authData.user.id,
            total_bets: 0,
            total_wins: 0,
            total_losses: 0,
            total_wagered: 0,
            total_won: 0,
            biggest_win: 0,
            biggest_loss: 0
          });

        if (statsError) {
          console.error('Error creating user stats:', statsError);
        }

        // Load the complete user profile after creation
        await hydrateProfile(authData.user.id);
      } else {
        setError('Registration failed.');
        return false;
      }

      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Registration failed.');
      return false;
    }
  };

  const login = async (username: string, password: string) => {
    setError(null);
    try {
      // Sign in first using the derived email (no pre-query against RLS-protected tables)
      const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const userEmail = `${sanitizedUsername}@test.com`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });

      if (error || !data?.user) {
        return false;
      }

      // Now that we're authenticated, fetch the profile by auth user id
      await hydrateProfile(data.user.id);

      // At this point, `user` state is populated. Your UI can redirect.
      // Return true so the login form can navigate, e.g., to "/account".
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Login failed.');
      return false;
    }
  };

  const logout = async () => {
    setError(null);
    try {
      await signOutUser();
      setUser(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign out.');
      throw e;
    }
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (u) await hydrateProfile(u.id);
  };

  const formatCurrency = (amount: number) => {
    if (!user) return '$0.00';
    
    const currency = user.currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      error,
      register,
      login,
      logout,
      refreshProfile,
      formatCurrency
    }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
