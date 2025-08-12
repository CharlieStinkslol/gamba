/*
  # Fix User Registration RLS Policy

  1. Security Changes
    - Drop existing problematic RLS policies on users table
    - Create proper RLS policy that allows authenticated users to insert their own profiles
    - Ensure the policy uses auth.uid() correctly for new user registration
    - Add policy to allow users to read their own profile data
    - Add policy to allow users to update their own profile data

  2. Notes
    - The key fix is ensuring the INSERT policy allows auth.uid() = id
    - This allows newly authenticated users to create their profile row
    - The policy must be permissive and use WITH CHECK for inserts
*/

-- Drop existing policies that might be causing issues
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Create proper RLS policies for user registration and access
CREATE POLICY "Enable insert for authenticated users"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable select for own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Enable update for own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Ensure RLS is enabled on the users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;