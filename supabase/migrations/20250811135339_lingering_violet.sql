/*
  # Fix authentication functions to use correct table name

  1. Updates
    - Update register_user function to reference 'users' table instead of 'profiles'
    - Update authenticate_user function to reference 'users' table instead of 'profiles'
    - Ensure all column references match the actual users table schema

  2. Security
    - Maintains existing security policies
    - Preserves function permissions
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS register_user(text, text);
DROP FUNCTION IF EXISTS authenticate_user(text, text);

-- Create register_user function with correct table reference
CREATE OR REPLACE FUNCTION register_user(
  username_input text,
  password_input text
)
RETURNS TABLE(
  success boolean,
  message text,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id uuid;
  auth_user_id uuid;
BEGIN
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM users WHERE username = username_input) THEN
    RETURN QUERY SELECT false, 'Username already exists'::text, null::uuid;
    RETURN;
  END IF;

  -- Create auth user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    username_input || '@demo.local',
    crypt(password_input, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO auth_user_id;

  -- Create user profile
  INSERT INTO users (
    id,
    username,
    email,
    balance,
    is_admin,
    level,
    experience,
    currency
  ) VALUES (
    auth_user_id,
    username_input,
    username_input || '@demo.local',
    1000,
    false,
    1,
    0,
    'USD'
  ) RETURNING id INTO new_user_id;

  -- Create initial user stats
  INSERT INTO user_stats (
    user_id,
    total_bets,
    total_wins,
    total_losses,
    total_wagered,
    total_won,
    biggest_win,
    biggest_loss
  ) VALUES (
    new_user_id,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  );

  RETURN QUERY SELECT true, 'User registered successfully'::text, new_user_id;
END;
$$;

-- Create authenticate_user function with correct table reference
CREATE OR REPLACE FUNCTION authenticate_user(
  username_input text,
  password_input text
)
RETURNS TABLE(
  user_id uuid,
  username text,
  balance numeric,
  is_admin boolean,
  level integer,
  experience integer,
  last_daily_bonus date,
  currency text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    u.balance,
    u.is_admin,
    u.level,
    u.experience,
    u.last_daily_bonus,
    u.currency,
    u.created_at
  FROM users u
  JOIN auth.users au ON u.id = au.id
  WHERE u.username = username_input 
    AND au.encrypted_password = crypt(password_input, au.encrypted_password);
END;
$$;