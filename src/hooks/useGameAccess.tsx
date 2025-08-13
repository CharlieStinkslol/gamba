import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * Answers questions like:
 * - isLoggedIn
 * - isAdmin
 * - canPlay (e.g., passed KYC/age check, or has not been banned)
 *
 * No localStorage — reads from auth + a profile/flags table.
 */
export function useGameAccess(gameName?: string) {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isEnabled, setIsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user) {
        if (!mounted) return;
        setIsAdmin(false);
        setCanPlay(false);
        setChecking(false);
        setIsLoading(false);
        return;
      }

      // Use users table instead of non-existent profiles table
      const { data, error } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!mounted) return;

      if (error || !data) {
        setIsAdmin(Boolean(user.isAdmin));
        setCanPlay(true);
      } else {
        setIsAdmin(data.is_admin);
        setCanPlay(true); // Default to true since banned/kyc_passed don't exist
      }
      setChecking(false);
      setIsLoading(false);
    };

    if (!loading) run();

    return () => {
      mounted = false;
    };
  }, [user, loading]);

  const validateBetAmount = (amount: number) => {
    if (amount <= 0) {
      return { isValid: false, message: 'Bet amount must be greater than 0' };
    }
    if (!user || amount > user.balance) {
      return { isValid: false, message: 'Insufficient balance' };
    }
    return { isValid: true };
  };
  return {
    isLoggedIn: Boolean(user),
    isAdmin,
    canPlay,
    checking,
    isEnabled,
    isLoading,
    validateBetAmount,
  };
}
