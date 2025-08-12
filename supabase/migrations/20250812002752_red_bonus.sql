/*
  # Fix RLS policies for users table

  1. Security Changes
    - Drop all existing conflicting policies
    - Create proper INSERT policy for authenticated users
    - Create proper SELECT policy for users to read their own data
    - Create proper UPDATE policy for users to update their own data

  This ensures that:
  - Authenticated users can insert their own profile data
  - Users can only read and update their own data
  - RLS violations are prevented during registration
*/

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Allow signup profile creation" ON users;
DROP POLICY IF EXISTS "users_insert_own" ON users;
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;

-- Create clean, working policies
CREATE POLICY "users_can_insert_own_profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_can_read_own_profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users_can_update_own_profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);