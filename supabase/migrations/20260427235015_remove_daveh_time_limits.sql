/*
  # Remove time limits for daveh admin user

  1. Changes
    - Set `password_expires_at` to 100 years out (effectively never)
    - Set `session_timeout_minutes` to a very large value (effectively never times out)
    - Confirm `access_days_of_week` covers all 7 days (no day restrictions)
    - Keep `max_concurrent_sessions` generous

  2. Notes
    - Uses safe UPDATE that only affects the daveh user
*/

UPDATE user_profiles
SET
  password_expires_at = NOW() + INTERVAL '100 years',
  session_timeout_minutes = 525600,
  max_concurrent_sessions = 100,
  access_days_of_week = ARRAY[1,2,3,4,5,6,7]::integer[],
  updated_at = NOW()
WHERE username = 'daveh';
