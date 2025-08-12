import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
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

const SUGGESTION_TEXT_CANDIDATES = ['text', 'content', 'message', 'body', 'suggestion', 'description'] as const;

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // remember which column name actually holds the suggestion text
  const textColRef = useRef<string | null>(null);

  // --- Game settings load/seed (no 406 when table is empty)
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.from('game_settings').select('*').maybeSingle();

      if (!mounted) return;

      if (error) {
        // silent: keep defaults if schema differs
        return;
      }

      if (!data) {
        // seed a single row with id=1
        const { error: seedErr } = await supabase
          .from('game_settings')
          .insert({ id: 1, min_bet: defaultSettings.minBet, max_bet: defaultSettings.maxBet, house_edge: defaultSettings.houseEdge });

        if (!seedErr) {
          setSettings(defaultSettings);
        }
        return;
      }

      setSettings({
        minBet: Number((data as any).min_bet ?? defaultSettings.minBet),
        maxBet: Number((data as any).max_bet ?? defaultSettings.maxBet),
        houseEdge: Number((data as any).house_edge ?? defaultSettings.houseEdge),
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
      let textVal: string = '';
      if (k && typeof r[k] === 'string') {
        textVal = r[k];
      } else {
        // scan common keys as a fallback
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
    // fetch all columns to avoid 400 on unknown 'text' column
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
    // 1) if we already detected a column, try that first
    const already = textColRef.current ? [textColRef.current] : [];
    // 2) then try the common candidates in order, without duplicates
    const tryOrder = Array.from(new Set([...already, ...SUGGESTION_TEXT_CANDIDATES]));

    for (const col of tryOrder) {
      const payload: Record<string, any> = { user_id: userId };
      payload[col] = text;

      const { error } = await supabase.from('suggestions').insert(payload);
      if (!error) {
        textColRef.current = col;
        return true;
      }

      // If the error is "column does not exist" (42703), try next candidate
      const code = (error as any).code;
      if (code && String(code) !== '42703') {
        // some other error, stop
        throw error;
      }
    }

    // If all attempts failed with 42703, surface a clear error
    throw new Error(
      'Could not find a compatible text column in "suggestions". Tried: ' + tryOrder.join(', ')
    );
  }

  const addSuggestion = async (text: string) => {
    const t = text.trim();
    if (!t) return;

    const userId = user?.id ?? null;

    // If we can detect the column by peeking, do it once
    if (!textColRef.current) {
      await detectSuggestionTextColumn();
    }

    await insertSuggestionRow(t, userId);
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
