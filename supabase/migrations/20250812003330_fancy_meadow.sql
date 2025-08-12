/*
  # Complete Supabase Reset and Setup

  This migration completely resets and sets up the database with proper RLS policies
  to ensure user registration and all functionality works correctly.

  ## What this migration does:
  1. Drops and recreates all tables with proper structure
  2. Sets up correct RLS policies for user registration
  3. Creates all necessary tables for full site functionality
  4. Ensures proper relationships and constraints
  5. Sets up triggers for automatic updates
*/

-- Drop all existing tables and policies to start fresh
DROP TABLE IF EXISTS user_task_progress CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS admin_game_config CASCADE;
DROP TABLE IF EXISTS game_settings CASCADE;
DROP TABLE IF EXISTS suggestion_votes CASCADE;
DROP TABLE IF EXISTS suggestions CASCADE;
DROP TABLE IF EXISTS bets CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop the update function if it exists
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Create the update function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create users table
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  balance numeric DEFAULT 1000 CHECK (balance >= 0),
  is_admin boolean DEFAULT false,
  level integer DEFAULT 1 CHECK (level >= 1),
  experience integer DEFAULT 0 CHECK (experience >= 0),
  last_daily_bonus date,
  currency text DEFAULT 'USD' CHECK (currency IN ('USD', 'GBP', 'EUR', 'BTC', 'ETH', 'LTC')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
CREATE POLICY "Users can insert own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create trigger for users updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create user_stats table
CREATE TABLE user_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_bets integer DEFAULT 0 CHECK (total_bets >= 0),
  total_wins integer DEFAULT 0 CHECK (total_wins >= 0),
  total_losses integer DEFAULT 0 CHECK (total_losses >= 0),
  total_wagered numeric DEFAULT 0 CHECK (total_wagered >= 0),
  total_won numeric DEFAULT 0 CHECK (total_won >= 0),
  biggest_win numeric DEFAULT 0,
  biggest_loss numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on user_stats table
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_stats table
CREATE POLICY "Users can insert own stats"
  ON user_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own stats"
  ON user_stats
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own stats"
  ON user_stats
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all stats"
  ON user_stats
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.is_admin = true
  ));

-- Create trigger for user_stats updated_at
CREATE TRIGGER update_user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create bets table
CREATE TABLE bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game text NOT NULL CHECK (game IN ('Dice', 'Limbo', 'Crash', 'Blackjack', 'Plinko', 'Spin Wheel')),
  bet_amount numeric NOT NULL CHECK (bet_amount > 0),
  win_amount numeric DEFAULT 0 CHECK (win_amount >= 0),
  multiplier numeric DEFAULT 0 CHECK (multiplier >= 0),
  result jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for bets table
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_game ON bets(game);
CREATE INDEX idx_bets_user_game ON bets(user_id, game);
CREATE INDEX idx_bets_created_at ON bets(created_at DESC);

-- Enable RLS on bets table
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for bets table
CREATE POLICY "bets_insert_own"
  ON bets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bets_select_own"
  ON bets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "bets_update_own"
  ON bets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bets_delete_own"
  ON bets
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create suggestions table
CREATE TABLE suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  category text DEFAULT 'feature' CHECK (category IN ('feature', 'bug', 'improvement', 'other')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status text DEFAULT 'open' CHECK (status IN ('open', 'under-review', 'planned', 'in-progress', 'completed', 'rejected')),
  upvotes integer DEFAULT 0 CHECK (upvotes >= 0),
  downvotes integer DEFAULT 0 CHECK (downvotes >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for suggestions table
CREATE INDEX idx_suggestions_user_id ON suggestions(user_id);
CREATE INDEX idx_suggestions_category ON suggestions(category);
CREATE INDEX idx_suggestions_status ON suggestions(status);

-- Enable RLS on suggestions table
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for suggestions table
CREATE POLICY "Users can create suggestions"
  ON suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can read suggestions"
  ON suggestions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own suggestions"
  ON suggestions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update suggestions"
  ON suggestions
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.is_admin = true
  ));

-- Create trigger for suggestions updated_at
CREATE TRIGGER update_suggestions_updated_at
  BEFORE UPDATE ON suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create suggestion_votes table
CREATE TABLE suggestion_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(suggestion_id, user_id)
);

-- Create indexes for suggestion_votes table
CREATE INDEX idx_suggestion_votes_suggestion_id ON suggestion_votes(suggestion_id);
CREATE INDEX idx_suggestion_votes_user_id ON suggestion_votes(user_id);

-- Enable RLS on suggestion_votes table
ALTER TABLE suggestion_votes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for suggestion_votes table
CREATE POLICY "Users can vote"
  ON suggestion_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read votes"
  ON suggestion_votes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own votes"
  ON suggestion_votes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own votes"
  ON suggestion_votes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create game_settings table
CREATE TABLE game_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_name text NOT NULL,
  setting_name text NOT NULL,
  settings jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, game_name, setting_name)
);

-- Create indexes for game_settings table
CREATE INDEX idx_game_settings_user_id ON game_settings(user_id);
CREATE INDEX idx_game_settings_game_name ON game_settings(game_name);

-- Enable RLS on game_settings table
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for game_settings table
CREATE POLICY "Users can read own game settings"
  ON game_settings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own game settings"
  ON game_settings
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create trigger for game_settings updated_at
CREATE TRIGGER update_game_settings_updated_at
  BEFORE UPDATE ON game_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create admin_game_config table
CREATE TABLE admin_game_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_name text UNIQUE NOT NULL CHECK (game_name IN ('dice', 'limbo', 'crash', 'blackjack', 'plinko', 'spin-wheel')),
  enabled boolean DEFAULT true,
  min_bet numeric DEFAULT 0.01 CHECK (min_bet > 0),
  max_bet numeric DEFAULT 1000 CHECK (max_bet >= min_bet),
  house_edge numeric DEFAULT 1 CHECK (house_edge >= 0 AND house_edge <= 100),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on admin_game_config table
ALTER TABLE admin_game_config ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for admin_game_config table
CREATE POLICY "Anyone can read game config"
  ON admin_game_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage game config"
  ON admin_game_config
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.is_admin = true
  ));

-- Create trigger for admin_game_config updated_at
CREATE TRIGGER update_admin_game_config_updated_at
  BEFORE UPDATE ON admin_game_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create tasks table
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('daily', 'gaming', 'social', 'special')),
  reward numeric DEFAULT 0 CHECK (reward >= 0),
  icon text DEFAULT 'Star',
  cooldown_hours integer DEFAULT 0 CHECK (cooldown_hours >= 0),
  max_progress integer DEFAULT 1 CHECK (max_progress >= 1),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for tasks table
CREATE INDEX idx_tasks_category ON tasks(category);

-- Enable RLS on tasks table
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tasks table
CREATE POLICY "Anyone can read active tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage tasks"
  ON tasks
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.is_admin = true
  ));

-- Create user_task_progress table
CREATE TABLE user_task_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  progress integer DEFAULT 0 CHECK (progress >= 0),
  completed boolean DEFAULT false,
  last_completed timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, task_id)
);

-- Create indexes for user_task_progress table
CREATE INDEX idx_user_task_progress_user_id ON user_task_progress(user_id);
CREATE INDEX idx_user_task_progress_task_id ON user_task_progress(task_id);

-- Enable RLS on user_task_progress table
ALTER TABLE user_task_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_task_progress table
CREATE POLICY "Users can read own task progress"
  ON user_task_progress
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own task progress"
  ON user_task_progress
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all task progress"
  ON user_task_progress
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.is_admin = true
  ));

-- Create trigger for user_task_progress updated_at
CREATE TRIGGER update_user_task_progress_updated_at
  BEFORE UPDATE ON user_task_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default game configuration
INSERT INTO admin_game_config (game_name, enabled, min_bet, max_bet, house_edge) VALUES
  ('dice', true, 0.01, 1000, 1),
  ('limbo', true, 0.01, 1000, 1),
  ('crash', true, 0.01, 1000, 1),
  ('blackjack', true, 0.01, 1000, 0.5),
  ('plinko', true, 0.01, 1000, 2),
  ('spin-wheel', true, 0.01, 1000, 5);