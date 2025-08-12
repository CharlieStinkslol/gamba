// /src/pages/Admin.tsx
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
  return null;
}

async function tryUpsert(
  form: { minBet: number; maxBet: number; houseEdge: number },
  cols?: ColMap
) {
  const attempts: ColMap[] = [];

  if (cols) attempts.push(cols);

  // common layouts to try
  attempts.push({ min: 'min_bet', max: 'max_bet', edge: 'house_edge' });
  attempts.push({ min: 'minBet', max: 'maxBet', edge: 'houseEdge' });
  attempts.push({ min: 'min_bet', max: 'max_bet' });
  attempts.push({ min: 'minBet', max: 'maxBet' });
  attempts.push({ min: 'minimum', max: 'maximum', edge: 'edge' });
  attempts.push({ min: 'min', max: 'max', edge: 'edge' });
  attempts.push({ min: 'minimum', max: 'maximum' });
  attempts.push({ min: 'min', max: 'max' });

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
      return a; // success
    }

    lastErr = error;

    const code = (error as any).code;
    if (code !== 'PGRST204' && code !== '42703') {
      break; // different failure (e.g., RLS)
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
      const discovered = await detectSettingsColumns();
      const usedMap = await tryUpsert(form, discovered);

      setSettings({
        minBet: form.minBet,
        maxBet: form.maxBet,
        houseEdge: usedMap.edge ? form.houseEdge : settings.houseEdge,
      });
      setMsg('Saved.');
    } catch (err: any) {
      setMsg(err?.message ?? 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const onClearSuggestions = async () => {
    const { error } = await supabase
      .from('suggestions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      setMsg(error.message);
      return;
    }
    await reloadSuggestions();
    setMsg('Suggestions cleared.'); // <-- this line was previously dangling
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Game Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex flex-col">
            <span className="text-sm">Min Bet</span>
            <input
              type="number"
              value={form.minBet}
              onChange={onChangeNum('minBet')}
              className="border rounded px-3 py-2"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm">Max Bet</span>
            <input
              type="number"
              value={form.maxBet}
              onChange={onChangeNum('maxBet')}
              className="border rounded px-3 py-2"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm">House Edge</span>
            <input
              type="number"
              step="0.001"
              value={form.houseEdge}
              onChange={onChangeNum('houseEdge')}
              className="border rounded px-3 py-2"
            />
          </label>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Suggestions</h2>
        <button onClick={onClearSuggestions} className="px-4 py-2 rounded border">
          Clear All Suggestions
        </button>
      </section>
    </div>
  );
}
