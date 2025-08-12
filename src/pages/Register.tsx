// /src/pages/Register.tsx
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const { register, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const validate = () => {
    const e = email.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) {
      return 'Please enter a valid email address.';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    if (password !== confirm) {
      return 'Passwords do not match.';
    }
    return null;
  };

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setMessage(null);
    setFieldError(null);

    const precheck = validate();
    if (precheck) {
      setFieldError(precheck);
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password);
      // If email confirmations are on, Supabase won’t return a session.
      setMessage('Registration successful. Check your email to confirm your account.');
      setEmail('');
      setPassword('');
      setConfirm('');
    } catch (err: any) {
      // Show the real message from our helpers / Supabase
      const msg =
        err?.message ??
        authError ??
        'Could not register. Please try again.';
      setFieldError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Create an account</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            className="mt-1 w-full border rounded px-3 py-2"
            inputMode="email"
            autoComplete="email"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            className="mt-1 w-full border rounded px-3 py-2"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>

        <label className="block">
          <span className="text-sm">Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            className="mt-1 w-full border rounded px-3 py-2"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>

        {fieldError && (
          <p className="text-red-600 text-sm">{fieldError}</p>
        )}
        {message && (
          <p className="text-green-700 text-sm">{message}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {submitting ? 'Registering…' : 'Register'}
        </button>
      </form>
    </div>
  );
}
