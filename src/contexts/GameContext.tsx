import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface Bet {
  id: string;
  game: string;
  betAmount: number;
  winAmount: number;
  multiplier: number;
  timestamp: Date;
  result: any;
}

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
  bets: Bet[];
  addBet: (bet: Omit<Bet, 'id' | 'timestamp'>) => void;
  seed: string;
  setSeed: (seed: string) => void;
  generateSeededRandom: () => number;
};

const defaultSettings: GameSettings = {
  minBet: 1,
  maxBet: 1000,
  houseEdge: 0.01,
};

const SUGGESTION_TEXT_CANDIDATES = ['text', 'content', 'message', 'body', 'suggestion', 'description'] as const;

// Settings key candidates we’ll accept when reading rows
const MIN_CANDIDATES = ['min_bet', 'minBet', 'minimum', 'min'] as const;
const MAX_CANDIDATES = ['max_bet', 'maxBet', 'maximum', 'max'] as const;
const EDGE_CANDIDATES = ['house_edge', 'houseEdge', 'edge', 'rake', 'fee'] as const;

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [seed, setSeed] = useState<string>('default-seed');
  // remember which column name actually holds the suggestion text
  const textColRef = useRef<string | null>(null);

  const addBet = async (bet: Omit<Bet, 'id' | 'timestamp'>) => {
    const newBet: Bet = {
      ...bet,
      id: Math.random().toString(36).substring(2, 15),
      timestamp: new Date()
    };
    setBets(prev => [newBet, ...prev]);
    
    // Save bet to database if user is logged in
    if (user) {
      try {
        const { error } = await supabase
          .from('bets')
          .insert({
            user_id: user.id,
            game: bet.game,
            bet_amount: bet.betAmount,
            win_amount: bet.winAmount,
            multiplier: bet.multiplier,
            result: bet.result
          });
        
        if (error) {
          console.error('Error saving bet to database:', error);
        }
      } catch (error) {
        console.error('Error saving bet:', error);
      }
    }
  };

  const generateSeededRandom = (): number => {
    // Simple seeded random number generator
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) / 2147483647;
  };

  // --- Game settings load/seed (robust to different column names and empty table)
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.from('game_settings').select('*').maybeSingle();

      if (!mounted) return;

      // If table has zero rows, maybeSingle() => data=null, error=null
      if (error) {
        // keep defaults silently if schema differs
        return;
      }

      if (!data) {
        // No settings row yet — keep defaults in memory.
        return;
      }

      // Map any matching key
      const row = data as Record<string, any>;
      const findNum = (keys: readonly string[], fallback: number) => {
        for (const k of keys) {
          if (k in row && row[k] != null && !Number.isNaN(Number(row[k]))) return Number(row[k]);
        }
        return fallback;
      };

      setSettings({
        minBet: findNum(MIN_CANDIDATES, defaultSettings.minBet),
        maxBet: findNum(MAX_CANDIDATES, defaultSettings.maxBet),
        houseEdge: findNum(EDGE_CANDIDATES, defaultSettings.houseEdge),
      });
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // --- Suggestions helpers

  // Detect which column stores the text by peeking at one row
  async function detectSuggestionTextColumn(): Promise<string | null> {
    if (textColRef.current) return textColRef.current;

    const { data, error } = await supabase.from('suggestions').select('*').limit(1);
    if (error) return null;
    if (!data || data.length === 0) return null;

    const row = data[0] as Record<string, any>;
    for (const key of SUGGESTION_TEXT_CANDIDATES) {
      if (key in row && typeof row[key] === 'string') {
        textColRef.current = key;
        return key;
      }
    }
    return null;
  }

  function normalizeSuggestions(rows: any[], textKeyGuess?: string | null): Suggestion[] {
    const k = textKeyGuess ?? textColRef.current;
    return rows.map((r) => {
      let textVal = '';
      if (k && typeof r[k] === 'string') {
        textVal = r[k];
      } else {
        for (const cand of SUGGESTION_TEXT_CANDIDATES) {
          if (typeof r[cand] === 'string') {
            textVal = r[cand];
            break;
          }
        }
      }
      return {
        id: String(r.id),
        user_id: r.user_id ?? null,
        text: textVal ?? '',
        created_at: r.created_at ?? r.inserted_at ?? new Date().toISOString(),
      };
    });
  }

  const reloadSuggestions = async () => {
    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      const detected = await detectSuggestionTextColumn();
      setSuggestions(normalizeSuggestions(data as any[], detected));
    }
  };

  useEffect(() => {
    reloadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Try inserting using whichever column exists
  async function insertSuggestionRow(text: string, userId: string | null) {
    const already = textColRef.current ? [textColRef.current] : [];
    const tryOrder = Array.from(new Set([...already, ...SUGGESTION_TEXT_CANDIDATES]));

    for (const col of tryOrder) {
      const payload: Record<string, any> = { user_id: userId };
      payload[col] = text;

      const { error } = await supabase.from('suggestions').insert(payload);
      if (!error) {
        textColRef.current = col;
        return true;
      }

      const code = (error as any).code;
      if (code && String(code) !== '42703') {
        throw error;
      }
    }

    throw new Error('Could not find a compatible text column in "suggestions".');
  }

  const addSuggestion = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const userId = user?.id ?? null;

    if (!textColRef.current) {
      await detectSuggestionTextColumn();
    }

    await insertSuggestionRow(t, userId);
    await reloadSuggestions();
  };

  const value = useMemo<GameContextType>(
    () => ({ 
      settings, 
      setSettings, 
      suggestions, 
      addSuggestion, 
      reloadSuggestions,
      bets,
      addBet,
      seed,
      setSeed,
      generateSeededRandom
    }),
    [settings, suggestions, bets, seed]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
