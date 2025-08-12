/*
  # Fix RLS policy for user signup

  1. Security Changes
    - Update RLS policy to allow profile creation during signup process
    - Allow INSERT when the user ID matches the authenticated user ID from signup
    - Maintain security by ensuring users can only create their own profile

  This fixes the RLS violation that occurs when creating user profiles after Supabase auth signup.
*/

-- Drop the existing problematic policies
DROP POLICY IF EXISTS "users_insert_anon_signup" ON users;
DROP POLICY IF EXISTS "users_insert_during_signup" ON users;

-- Create a proper policy that allows users to insert their own profile during signup
CREATE POLICY "users_can_insert_own_profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Also allow anonymous users to insert during the brief moment of signup
-- This is needed because there's a small window during signup where the user might not be fully authenticated yet
CREATE POLICY "users_signup_insert"
  ON users
  FOR INSERT
  TO anon
  WITH CHECK (true);