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

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      await signInUser(email, password);
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
