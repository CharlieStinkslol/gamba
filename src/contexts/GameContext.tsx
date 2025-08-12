import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type GameSettings = {
  minBet: number;
  maxBet: number;
  houseEdge: number;
};

type Suggestion = {
  id: string;
  user_id: string | null;
  text: string;
  created_at: string;
};

type GameContextType = {
  settings: GameSettings;
  setSettings: (s: GameSettings) => void;
  suggestions: Suggestion[];
  addSuggestion: (text: string) => Promise<void>;
  reloadSuggestions: () => Promise<void>;
};

const defaultSettings: GameSettings = {
  minBet: 1,
  maxBet: 1000,
  houseEdge: 0.01,
};

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Pull game settings from DB (single row table e.g., "game_settings" with id=1)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.from('game_settings').select('*').limit(1).single();
      if (!mounted) return;
      if (!error && data) {
        setSettings({
          minBet: data.min_bet ?? defaultSettings.minBet,
          maxBet: data.max_bet ?? defaultSettings.maxBet,
          houseEdge: data.house_edge ?? defaultSettings.houseEdge,
        });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const reloadSuggestions = async () => {
    const { data, error } = await supabase
      .from('suggestions')
      .select('id,user_id,text,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) setSuggestions(data as Suggestion[]);
  };

  useEffect(() => {
    reloadSuggestions();
  }, []);

  const addSuggestion = async (text: string) => {
    const payload = {
      text,
      user_id: user?.id ?? null,
    };
    const { error } = await supabase.from('suggestions').insert(payload);
    if (error) throw error;
    await reloadSuggestions();
  };

  const value = useMemo<GameContextType>(
    () => ({ settings, setSettings, suggestions, addSuggestion, reloadSuggestions }),
    [settings, suggestions]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
