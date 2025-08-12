import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { useGameAccess } from '../hooks/useGameAccess';
import { supabase } from '../lib/supabase';

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

    // upsert so it works whether the row exists or not
    const { error } = await supabase
      .from('game_settings')
      .upsert(
        {
          id: 1,
          min_bet: form.minBet,
          max_bet: form.maxBet,
          house_edge: form.houseEdge,
        },
        { onConflict: 'id' }
      );

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    setSettings({
      minBet: form.minBet,
      maxBet: form.maxBet,
      houseEdge: form.houseEdge,
    });
    setSaving(false);
    setMsg('Saved.');
  };

  const onClearSuggestions = async () => {
    // delete all rows; the neq guard avoids empty filter warnings
    const { error } = await supabase.from('suggestions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      setMsg(error.message);
      return;
    }
    await reloadSuggestions();
    setMsg('Suggestions cleared.');
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
