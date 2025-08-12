import React, { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';

export default function SuggestionsPage() {
  const { suggestions, addSuggestion } = useGame();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setMsg(null);
    try {
      await addSuggestion(text.trim());
      setText('');
      setMsg('Thanks for your idea!');
    } catch (err: any) {
      setMsg(err?.message ?? 'Could not send your idea.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Suggestions</h1>

      <form onSubmit={submit} className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Drop a feature idea or feedback"
          className="w-full border rounded p-3"
          rows={3}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
          <span className="text-sm text-gray-600">
            {user ? `Posting as ${user.email ?? 'you'}` : 'Posting anonymously'}
          </span>
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </form>

      <ul className="space-y-3">
        {suggestions.map((s) => (
          <li key={s.id} className="border rounded p-3">
            <div className="text-sm text-gray-600">{new Date(s.created_at).toLocaleString()}</div>
            <div className="mt-1">{s.text}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
