-- Remove email from users table
-- This migration removes the email column from the users table since we're moving to username-only authentication

ALTER TABLE users DROP COLUMN IF EXISTS email;