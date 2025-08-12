/*
  # Fix users table RLS policies for registration

  1. Security Changes
    - Drop existing problematic policies
    - Create proper INSERT policy for authenticated users
    - Allow users to insert their own profile data using auth.uid()
    - Maintain existing SELECT and UPDATE policies for user data access

  This resolves the RLS violation error during user registration by ensuring
  authenticated users can create their profile entry in the users table.
*/

-- Drop existing policies that might be causing conflicts
DROP POLICY IF EXISTS "users_can_insert_own_profile" ON users;
DROP POLICY IF EXISTS "users_signup_insert" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to insert own profile" ON users;
DROP POLICY IF EXISTS "Allow anonymous inserts during signup" ON users;

-- Create a proper INSERT policy for authenticated users
CREATE POLICY "Users can insert own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Ensure SELECT policy exists for users to read their own data
DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "Users can read own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Ensure UPDATE policy exists for users to update their own data
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);