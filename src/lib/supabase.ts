// /src/lib/supabase.ts
import { createClient, type AuthError } from '@supabase/supabase-js';

// Read from Vite env (update these in your .env if needed)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
}

// No browser storage: session stays in memory only (no localStorage)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: undefined,
    detectSessionInUrl: true,
  },
});

/**
 * Strip zero-width chars and spaces, then lowercase.
 */
function cleanEmail(input: string): string {
  const stripped = input.replace(/[\u200B-\u200D\uFEFF]/g, '');
  return stripped.trim().toLowerCase();
}

/**
 * Lightweight email format guard before we call Supabase.
 */
function looksLikeEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input);
}

export async function registerUser(rawEmail: string, password: string) {
  const email = rawEmail; // Use the dummy email directly without validation

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  return data; // { user, session }
}

/**
 * Sign in with email/password. You can pass either a real email,
 * or your app’s derived email (e.g., username@test.com).
 */
export async function signInUser(rawEmail: string, password: string) {
  const email = cleanEmail(rawEmail);
  if (!looksLikeEmail(email)) {
    const e = new Error('Email format looks wrong.') as AuthError;
    // @ts-ignore
    e.status = 422;
    throw e;
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
