/*
  # Fix user_stats RLS policy for INSERT operations

  1. Security Changes
    - Add INSERT policy for user_stats table to allow users to create their own stats records
    - This fixes the RLS violation error during user registration

  2. Notes
    - Users can only insert records where user_id matches their authenticated user ID
    - This maintains security while allowing proper user registration flow
*/

-- Add INSERT policy for user_stats table
CREATE POLICY "Users can insert own stats" ON user_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());