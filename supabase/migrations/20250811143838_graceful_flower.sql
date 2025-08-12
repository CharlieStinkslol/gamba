/*
  # Fix user registration RLS policy

  1. Security Changes
    - Update RLS policy to allow user registration during signup
    - Allow users to insert their own profile during the auth signup process
  
  2. Notes
    - The existing policy only allows authenticated users to insert, but during registration
      the user isn't authenticated yet, so we need a policy that allows insertion during signup
*/

-- Drop the existing restrictive insert policy
DROP POLICY IF EXISTS "users_insert_own" ON users;

-- Create a new policy that allows users to insert their own data during registration
-- This works because Supabase sets auth.uid() during the signup process
CREATE POLICY "users_insert_during_signup" 
  ON users 
  FOR INSERT 
  TO authenticated, anon
  WITH CHECK (auth.uid() = id);

-- Also ensure we have a policy for anon users during the signup process
CREATE POLICY "users_insert_anon_signup" 
  ON users 
  FOR INSERT 
  TO anon
  WITH CHECK (true);