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
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function hydrateProfile(userId: string) {
    // Get user data from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    // Get user stats
    const { data: statsData } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (userError || !userData) {
      console.error('Error loading user profile:', userError);
      setUser(null);
      return;
    }

    // Set complete user object
    const userObject = {
      id: userData.id,
      email: userData.email || null,
      username: userData.username,
      balance: userData.balance || 1000,
      level: userData.level || 1,
      experience: userData.experience || 0,
      currency: userData.currency || 'USD',
      isAdmin: userData.is_admin || false,
      createdAt: userData.created_at,
      updatedAt: userData.updated_at,
      lastDailyBonus: userData.last_daily_bonus,
      stats: statsData ? {
        totalBets: statsData.total_bets || 0,
        totalWins: statsData.total_wins || 0,
        totalLosses: statsData.total_losses || 0,
        totalWagered: statsData.total_wagered || 0,
        totalWon: statsData.total_won || 0,
        biggestWin: statsData.biggest_win || 0,
        biggestLoss: statsData.biggest_loss || 0
      } : {
        totalBets: 0,
        totalWins: 0,
        totalLosses: 0,
        totalWagered: 0,
        totalWon: 0,
        biggestWin: 0,
        biggestLoss: 0
      }
    };

    setUser(userObject);
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
  const register = async (email: string, username: string, password: string) => {
    setError(null);
    try {
      const { data: authData } = await registerUser(email, password);
      
      if (authData.user) {
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

        // Load the complete user profile after creation
        await hydrateProfile(authData.user.id);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not register.');
      throw e;
    }
  };

  const login = async (username: string, password: string) => {
    setError(null);
    try {
      // Get user by username to find their email
      const { data: userCheck, error: userCheckError } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', username)
        .single();

      if (userCheckError) {
        throw new Error('Username does not exist');
      }
      
      // Get the auth user's email to sign in
      const { data: authUser, error: authError } = await supabase.auth.getUser();
      
      // We need to get the email from the auth.users table
      // For now, we'll generate the same email format used during registration
      const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const userEmail = `${sanitizedUsername}@test.com`;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });

      if (error) {
        throw new Error('Invalid username or password');
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