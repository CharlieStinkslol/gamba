// /src/lib/supabase.ts
import { createClient, type AuthError } from '@supabase/supabase-js';

// Read from Vite env (update these in your .env if needed)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surface a clear error early during local dev
  // (prevents confusing "request failed" errors later)
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Remove zero-width characters and trim spaces, then lowercase.
 */
function cleanEmail(input: string): string {
  // Remove zero-width chars (ZWSP, ZWNBSP, ZWNJ, ZWJ)
  const stripped = input.replace(/[\u200B-\u200D\uFEFF]/g, '');
  return stripped.trim().toLowerCase();
}

/**
 * Lightweight email format guard before we even hit Supabase.
 * (Supabase will still validate server-side.)
 */
function looksLikeEmail(input: string): boolean {
  // Simple, permissive check: no spaces, has one "@", has a dot in the domain part
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input);
}

export async function registerUser(rawEmail: string, password: string) {
  const email = cleanEmail(rawEmail);

  if (!looksLikeEmail(email)) {
    const error = new Error('Please enter a valid email address.') as AuthError;
    (error as any).status = 400;
    (error as any).name = 'AuthApiError';
    throw error;
  }

  // Optional: guard for short passwords to avoid a round trip
  if (!password || password.length < 6) {
    const error = new Error('Password must be at least 6 characters.') as AuthError;
    (error as any).status = 400;
    (error as any).name = 'AuthApiError';
    throw error;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // If you’re using email confirmations, you can set a redirect:
    // options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });

  if (error) {
    // Normalise Supabase's "email_address_invalid" into something clearer
    if ((error as any).code === 'email_address_invalid') {
      const pretty = new Error('Please enter a valid email address.') as AuthError;
      (pretty as any).status = error.status ?? 400;
      (pretty as any).name = error.name ?? 'AuthApiError';
      throw pretty;
    }
    throw error;
  }

  return data; // { user, session } (session may be null if email confirmation is on)
}

export async function signInUser(rawEmail: string, password: string) {
  const email = cleanEmail(rawEmail);

  if (!looksLikeEmail(email)) {
    const error = new Error('Please enter a valid email address.') as AuthError;
    (error as any).status = 400;
    (error as any).name = 'AuthApiError';
    throw error;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data; // { user, session }
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}
