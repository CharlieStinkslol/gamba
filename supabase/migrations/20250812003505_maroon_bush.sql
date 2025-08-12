/*
  # Complete Database Reset and Setup

  1. New Tables
    - `users` - User profiles with authentication integration
    - `user_stats` - Comprehensive user statistics
    - `bets` - All game betting history
    - `suggestions` - Community feedback system
    - `suggestion_votes` - Voting on suggestions
    - `game_settings` - User game preferences
    - `admin_game_config` - Admin game configuration
    - `tasks` - Achievement/task system
    - `user_task_progress` - User progress on tasks

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users to manage their own data
    - Admin policies for management functions

  3. Functions
    - Auto-update timestamps
    - User stats aggregation
*/

-- Drop all existing tables to start fresh
DROP TABLE IF EXISTS user_task_progress CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS suggestion_votes CASCADE;
DROP TABLE IF EXISTS suggestions CASCADE;
DROP TABLE IF EXISTS game_settings CASCADE;
DROP TABLE IF EXISTS admin_game_config CASCADE;
DROP TABLE IF EXISTS bets CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Users table (linked to auth.users)
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

-- User statistics table
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

-- Bets table
CREATE TABLE bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game text NOT NULL CHECK (game IN ('Dice', 'Limbo', 'Crash', 'Blackjack', 'Plinko', 'Spin Wheel')),
  bet_amount numeric NOT NULL CHECK (bet_amount > 0),
  win_amount numeric DEFAULT 0 CHECK (win_amount >= 0),
  multiplier numeric DEFAULT 0 CHECK (multiplier >= 0),
  result jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Game settings table
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

-- Admin game configuration
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

-- Suggestions table
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

-- Suggestion votes table
CREATE TABLE suggestion_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(suggestion_id, user_id)
);

-- Tasks table
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

-- User task progress table
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

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_game_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_task_progress ENABLE ROW LEVEL SECURITY;

-- Users table policies
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

-- User stats policies
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

-- Bets table policies
CREATE POLICY "Users can insert own bets"
  ON bets
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own bets"
  ON bets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Game settings policies
CREATE POLICY "Users can manage own game settings"
  ON game_settings
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin game config policies
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

-- Suggestions policies
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

-- Suggestion votes policies
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

-- Tasks policies
CREATE POLICY "Anyone can read active tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- User task progress policies
CREATE POLICY "Users can manage own task progress"
  ON user_task_progress
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_game ON bets(game);
CREATE INDEX idx_bets_created_at ON bets(created_at DESC);
CREATE INDEX idx_bets_user_game ON bets(user_id, game);
CREATE INDEX idx_game_settings_user_id ON game_settings(user_id);
CREATE INDEX idx_game_settings_game_name ON game_settings(game_name);
CREATE INDEX idx_suggestions_user_id ON suggestions(user_id);
CREATE INDEX idx_suggestions_status ON suggestions(status);
CREATE INDEX idx_suggestions_category ON suggestions(category);
CREATE INDEX idx_suggestion_votes_suggestion_id ON suggestion_votes(suggestion_id);
CREATE INDEX idx_suggestion_votes_user_id ON suggestion_votes(user_id);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_user_task_progress_user_id ON user_task_progress(user_id);
CREATE INDEX idx_user_task_progress_task_id ON user_task_progress(task_id);

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_settings_updated_at
  BEFORE UPDATE ON game_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_game_config_updated_at
  BEFORE UPDATE ON admin_game_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suggestions_updated_at
  BEFORE UPDATE ON suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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

-- Insert default tasks
INSERT INTO tasks (title, description, category, reward, icon, cooldown_hours, max_progress) VALUES
  ('Daily Login Bonus', 'Log in to CharliesOdds every day', 'daily', 25, 'Calendar', 24, 1),
  ('Daily Wheel Spin', 'Spin the wheel once per day for free money', 'daily', 0, 'RotateCcw', 24, 1),
  ('Play 10 Games', 'Play any 10 games across the platform', 'daily', 15, 'Play', 24, 10),
  ('Dice Master', 'Win 5 dice games in a row', 'gaming', 50, 'Target', 0, 5),
  ('Crash Survivor', 'Cash out at 10x multiplier in Crash', 'gaming', 75, 'Zap', 0, 1),
  ('Blackjack Pro', 'Get 3 blackjacks in one session', 'gaming', 40, 'Trophy', 0, 3),
  ('Plinko Lucky', 'Hit a 1000x multiplier in Plinko', 'gaming', 100, 'Star', 0, 1),
  ('Limbo High Roller', 'Win with a 50x target multiplier', 'gaming', 80, 'Award', 0, 1),
  ('Spin Winner', 'Win 10 spins on the Spin Wheel', 'gaming', 35, 'RotateCcw', 0, 10),
  ('Auto-Bet Master', 'Run 100 auto-bets without going broke', 'gaming', 60, 'Gamepad2', 0, 100),
  ('Complete Your Profile', 'Fill out all profile information', 'social', 20, 'Users', 0, 1),
  ('Submit a Suggestion', 'Help improve the platform with feedback', 'social', 30, 'Heart', 0, 1),
  ('Strategy Tester', 'Test 3 different betting strategies', 'social', 45, 'Target', 0, 3),
  ('First Week Milestone', 'Play for 7 consecutive days', 'special', 150, 'Trophy', 0, 7),
  ('Big Winner', 'Win $500 in a single session', 'special', 200, 'Coins', 0, 1),
  ('Analytics Enthusiast', 'View your analytics page 5 times', 'special', 25, 'Star', 0, 5),
  ('Settings Saver', 'Save 3 different game configurations', 'special', 35, 'Gift', 0, 3),
  ('Balance Manager', 'Maintain positive balance for 24 hours', 'special', 75, 'CheckCircle', 0, 1),
  ('Platform Explorer', 'Visit all 6 games and 5 strategy pages', 'special', 90, 'Zap', 0, 11),
  ('Community Helper', 'Vote on 10 community suggestions', 'special', 40, 'Heart', 0, 10);