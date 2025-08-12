import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

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

  // Pull a lightweight profile row (for role, etc.)
  async function hydrateProfile(userId: string) {
    // if you keep a "profiles" table with role
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,role')
      .eq('id', userId)
      .single();

    if (error) {
      // fall back to auth user only
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

  // Initial session + listener (no localStorage — this only lives in memory)
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

  const register = async (email: string, password: string) => {
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      throw error;
    }
    // user may be null if confirmation is on — profile hydrate runs via listener
  };

  const login = async (email: string, password: string) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      throw error;
    }
  };

  const logout = async () => {
    setError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      throw error;
    }
    setUser(null);
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