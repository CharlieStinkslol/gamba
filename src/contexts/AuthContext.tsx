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
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastDailyBonus: string | null;
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
  register: (email: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  formatCurrency: (amount: number) => string;
  updateBalance: (amount: number) => void;
  updateStats: (betAmount: number, winAmount: number) => void;
  setCurrency: (currency: string) => void;
  claimDailyBonus: () => number;
  getNextLevelRequirement: () => number;
  getLevelRewards: (level: number) => { title: string; dailyBonus: number };
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
      // Get user by username
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (userError || !userData) {
        return false;
      }
      
      // Generate the same email format used during registration
      const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const userEmail = `${sanitizedUsername}@test.com`;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });

      if (error) {
        return false;
      }
      
      // Load user profile after successful login
      await hydrateProfile(userData.id);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign in.');
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
    
    const currencySymbols = {
      USD: '$',
      BTC: '₿',
      ETH: 'Ξ',
      LTC: 'Ł',
      GBP: '£',
      EUR: '€'
    };
    
    const symbol = currencySymbols[user.currency as keyof typeof currencySymbols] || '$';
    return `${symbol}${amount.toFixed(2)}`;
  };

  const updateBalance = (amount: number) => {
    if (!user) return;
    
    const newBalance = user.balance + amount;
    setUser(prev => prev ? { ...prev, balance: newBalance } : null);
    
    // Update in database
    supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', user.id);
  };

  const updateStats = (betAmount: number, winAmount: number) => {
    if (!user) return;
    
    const isWin = winAmount > betAmount;
    const profit = winAmount - betAmount;
    
    const newStats = {
      totalBets: user.stats.totalBets + 1,
      totalWins: user.stats.totalWins + (isWin ? 1 : 0),
      totalLosses: user.stats.totalLosses + (isWin ? 0 : 1),
      totalWagered: user.stats.totalWagered + betAmount,
      totalWon: user.stats.totalWon + winAmount,
      biggestWin: Math.max(user.stats.biggestWin, profit),
      biggestLoss: Math.min(user.stats.biggestLoss, profit)
    };
    
    setUser(prev => prev ? { ...prev, stats: newStats } : null);
    
    // Update in database
    supabase
      .from('user_stats')
      .update({
        total_bets: newStats.totalBets,
        total_wins: newStats.totalWins,
        total_losses: newStats.totalLosses,
        total_wagered: newStats.totalWagered,
        total_won: newStats.totalWon,
        biggest_win: newStats.biggestWin,
        biggest_loss: newStats.biggestLoss
      })
      .eq('user_id', user.id);
  };

  const setCurrency = (currency: string) => {
    if (!user) return;
    
    setUser(prev => prev ? { ...prev, currency } : null);
    
    // Update in database
    supabase
      .from('users')
      .update({ currency })
      .eq('id', user.id);
  };

  const claimDailyBonus = () => {
    if (!user) return 0;
    
    const today = new Date().toDateString();
    if (user.lastDailyBonus === today) return 0;
    
    const levelRewards = getLevelRewards(user.level);
    const bonusAmount = levelRewards.dailyBonus;
    
    updateBalance(bonusAmount);
    setUser(prev => prev ? { ...prev, lastDailyBonus: today } : null);
    
    // Update in database
    supabase
      .from('users')
      .update({ last_daily_bonus: today })
      .eq('id', user.id);
    
    return bonusAmount;
  };

  const getNextLevelRequirement = () => {
    if (!user) return 100;
    return user.level * 100;
  };

  const getLevelRewards = (level: number) => {
    const baseBonus = 25;
    const bonusIncrease = 20;
    const dailyBonus = baseBonus + (level - 1) * bonusIncrease;
    
    const titles = [
      'Novice Gambler',
      'Casual Player', 
      'Regular Gambler',
      'Experienced Player',
      'Skilled Gambler',
      'Expert Player',
      'Professional Gambler',
      'High Roller',
      'VIP Player',
      'Elite Gambler',
      'Master Player',
      'Legendary Gambler',
      'Casino Legend',
      'Gambling Guru',
      'Fortune Master',
      'Luck Legend'
    ];
    
    const titleIndex = Math.min(Math.floor((level - 1) / 3), titles.length - 1);
    
    return {
      title: titles[titleIndex],
      dailyBonus
    };
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
      formatCurrency,
      updateBalance,
      updateStats,
      setCurrency,
      claimDailyBonus,
      getNextLevelRequirement,
      getLevelRewards
    }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}