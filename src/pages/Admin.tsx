import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { useGameAccess } from '../hooks/useGameAccess';
import { supabase } from '../lib/supabase';

const MIN_KEYS = ['min_bet', 'minBet', 'minimum', 'min'] as const;
const MAX_KEYS = ['max_bet', 'maxBet', 'maximum', 'max'] as const;
const EDGE_KEYS = ['house_edge', 'houseEdge', 'edge', 'rake', 'fee'] as const;

type ColMap = {
  min: string;
  max: string;
  edge?: string; // optional if your schema has no edge column
};

async function detectSettingsColumns(): Promise<ColMap | null> {
  const { data, error } = await supabase.from('game_settings').select('*').limit(1);
  if (error) return null;
  const row = (data?.[0] ?? {}) as Record<string, any>;
  const find = (cands: readonly string[]) => cands.find((k) => k in row);
  const min = find(MIN_KEYS);
  const max = find(MAX_KEYS);
  const edge = find(EDGE_KEYS);

  if (min && max) {
    return { min, max, edge: edge ?? undefined };
  }
  // Not enough info from rows
  return null;
}

async function tryUpsert(form: { minBet: number; maxBet: number; houseEdge: number }, cols?: ColMap) {
  // Build a set of attempts: discovered columns (if any), then fallbacks
  const attempts: ColMap[] = [];

  if (cols) attempts.push(cols);

  // snake_case default
  attempts.push({ min: 'min_bet', max: 'max_bet', edge: 'house_edge' });
  // camelCase
  attempts.push({ min: 'minBet', max: 'maxBet', edge: 'houseEdge' });
  // some schemas don’t track edge at all
  attempts.push({ min: 'min_bet', max: 'max_bet' });
  attempts.push({ min: 'minBet', max: 'maxBet' });
  // other common variants
  attempts.push({ min: 'minimum', max: 'maximum', edge: 'edge' });
  attempts.push({ min: 'min', max: 'max', edge: 'edge' });
  attempts.push({ min: 'minimum', max: 'maximum' });
  attempts.push({ min: 'min', max: 'max' });

  // de-duplicate attempts by JSON key
  const uniqueAttempts = attempts.filter(
    (a, idx, arr) => arr.findIndex((b) => JSON.stringify(b) === JSON.stringify(a)) === idx
  );

  let lastErr: any = null;

  for (const a of uniqueAttempts) {
    const payload: Record<string, any> = { id: 1 };
    payload[a.min] = form.minBet;
    payload[a.max] = form.maxBet;
    if (a.edge) payload[a.edge] = form.houseEdge;

    const { error } = await supabase.from('game_settings').upsert(payload, { onConflict: 'id' });

    if (!error) {
      return a; // success with this column map
    }

    lastErr = error;

    // If error is about missing column (PGRST204), try next map
    if ((error as any).code !== 'PGRST204' && (error as any).code !== '42703') {
      // different failure (RLS etc.), stop early
      break;
    }
  }

  throw lastErr ?? new Error('Failed to save settings.');
}

export default function Admin() {
  const { user } = useAuth();
  const { settings, setSettings, reloadSuggestions } = useGame();
  const { isAdmin, checking } = useGameAccess();

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    minBet: settings.minBet,
    maxBet: settings.maxBet,
    houseEdge: settings.houseEdge,
  });

  if (checking) {
    return <div className="p-6">Checking access…</div>;
  }

  if (!user || !isAdmin) {
    return <div className="p-6">You need admin rights to view this page.</div>;
  }

  const onChangeNum =
    (key: 'minBet' | 'maxBet' | 'houseEdge') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      setForm((s) => ({ ...s, [key]: v }));
    };

  const onSave = async () => {
    setSaving(true);
    setMsg(null);

    try {
      // Try to discover columns from existing row (if any)
      const discovered = await detectSettingsColumns();
      const usedMap = await tryUpsert(form, discovered);

      // Reflect saved values in context
      setSettings({
        minBet: form.minBet,
        maxBet: form.maxBet,
        houseEdge: usedMap.edge ? form.houseEdge : settings.houseEdge, // if schema has no edge, keep prior in-memory value
      });
      setMsg('Saved.');
    } catch (err: any) {
      setMsg(err?.message ?? 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const onClearSuggestions = async () => {
    const { error } = await supabase.from('suggestions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      setMsg(error.message);
      return;
    }
    await reloadSuggestions();
    setMsg
