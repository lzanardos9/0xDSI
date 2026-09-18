/*
# Aviation live feed cache

Stores the most recent successful ADS-B response per region so the Live Sky
panel can keep showing data even when the upstream open feed briefly rate-limits
the shared server address.

1. New Tables
   - `aviation_live_cache`
     - `region` (text, primary key) — region key such as europe, usa, mideast, asia
     - `payload` (jsonb, not null) — the full serialized feed response
     - `updated_at` (timestamptz, not null) — when this cache row was last refreshed

2. Security
   - Enable RLS. No anon/authenticated policies are added: this table is written
     and read only by the edge function using the service role, which bypasses
     RLS. The browser never touches it directly.
*/

CREATE TABLE IF NOT EXISTS aviation_live_cache (
  region text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aviation_live_cache ENABLE ROW LEVEL SECURITY;
