/*
  # Expand Active Lists Categories
  
  Adds more category types to support comprehensive threat tracking.
*/

-- Drop the old constraint
ALTER TABLE active_lists DROP CONSTRAINT IF EXISTS valid_category;

-- Add new constraint with expanded categories
ALTER TABLE active_lists ADD CONSTRAINT valid_category 
  CHECK (category IN (
    'ip', 'domain', 'user', 'hash',
    'host', 'counter', 'access', 'transfer', 
    'incident', 'exclusion', 'ioc', 'asset', 
    'network'
  ));