/*
  # Fix user_stats RLS insert policy

  1. Security Updates
    - Update the INSERT policy for user_stats table to allow authenticated users to insert their own stats
    - Ensure users can create their initial stats record during registration

  2. Changes
    - Modify existing INSERT policy to use proper RLS conditions
    - Allow users to insert records where user_id matches their auth.uid()
*/

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can insert own stats" ON user_stats;

-- Create new INSERT policy that allows users to insert their own stats
CREATE POLICY "Users can insert own stats"
  ON user_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());