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
export function useGameAccess() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user) {
        if (!mounted) return;
        setIsAdmin(false);
        setCanPlay(false);
        setChecking(false);
        return;
      }

      // Example flags table: profiles(id, role, banned, kyc_passed)
      const { data, error } = await supabase
        .from('profiles')
        .select('role,banned,kyc_passed')
        .eq('id', user.id)
        .single();

      if (!mounted) return;

      if (error || !data) {
        setIsAdmin(Boolean(user.role === 'admin'));
        setCanPlay(true);
      } else {
        setIsAdmin(data.role === 'admin');
        setCanPlay(!data.banned && Boolean(data.kyc_passed ?? true));
      }
      setChecking(false);
    };

    if (!loading) run();

    return () => {
      mounted = false;
    };
  }, [user, loading]);

  return {
    isLoggedIn: Boolean(user),
    isAdmin,
    canPlay,
    checking,
  };
}
