/*
  # Fix Personnel Tracking RLS Policies

  1. Changes
    - Add INSERT policy for personnel_tracking table
    - Add UPDATE policy for personnel_tracking table
    - Allow authenticated users to insert and update personnel tracking data

  2. Security
    - Maintains RLS protection
    - Only authenticated users can modify data
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can insert personnel tracking" ON personnel_tracking;
DROP POLICY IF EXISTS "Authenticated users can update personnel tracking" ON personnel_tracking;

-- Add INSERT policy
CREATE POLICY "Authenticated users can insert personnel tracking"
  ON personnel_tracking FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add UPDATE policy
CREATE POLICY "Authenticated users can update personnel tracking"
  ON personnel_tracking FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
