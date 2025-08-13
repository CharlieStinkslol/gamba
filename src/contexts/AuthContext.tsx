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
  role?: 'user' | 'admin';
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function hydrateProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,role')
      .eq('id', userId)
      .single();

    if (error || !data) {
      const { data: authData } = await supabase.auth.getUser();
      const u = authData.user;
      setUser(u ? { id: u.id, email: u.email ?? null } : null);
      return;
    }

    setUser({
      id: data.id,
      email: data.email ?? null,
      role: (data.role as 'user' | 'admin') ?? 'user',
    });
  }

  // Initial session + listener (memory only; no localStorage)
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const u = authData.user;

      if (!mounted) return;

      if (u) {
        await hydrateProfile(u.id);
      } else {
        setUser(null);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        await hydrateProfile(session.user.id);
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Use helpers that clean/validate the email BEFORE calling Supabase
  const register = async (email: string, password: string) => {
    setError(null);
    try {
      await registerUser(email, password);
      // session may be null if email confirmations are enabled; hydration happens via auth listener
    } catch (e: any) {
      setError(e?.message ?? 'Could not register.');
      throw e;
    }
  };

  const login = async (username: string, password: string) => {
    setError(null);
    try {
      // Generate dummy email for Supabase auth
      const dummyEmail = `${username}@test.com`;
      
      // First check if username exists in our users table
      const { data: userCheck, error: userCheckError } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', username)
        .single();

      if (userCheckError) {
        // User doesn't exist, create new user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: dummyEmail,
          password,
        });

        if (authError) {
          if (authError.message.includes('email_address_invalid')) {
            throw new Error('Invalid username or password');
          }
          throw authError;
        }

        // Create user record
        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            username,
            balance: 1000,
            level: 1,
            experience: 0,
            currency: 'USD',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastDailyBonus: null,
            stats: {
              totalBets: 0,
              totalWins: 0,
              totalLosses: 0,
              totalWagered: 0,
              totalWon: 0,
              biggestWin: 0,
              biggestLoss: 0
            }
          });

        if (userError) {
          throw userError;
        }

        // Create initial user stats record
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
      } else {
        // User exists, try to sign in
        const { data, error } = await supabase.auth.signInWithPassword({
          email: dummyEmail,
          password,
        });

        if (error) {
          throw new Error('Invalid username or password');
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign in.');
      throw e;
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

  const value = useMemo<AuthContextType>(
    () => ({ user, loading, error, register, login, logout, refreshProfile }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
