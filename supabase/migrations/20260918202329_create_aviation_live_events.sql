/*
# Live Aviation Threat Events

Stores notable "potential threat" events detected from the live OpenSky open
flight feed (emergency transponder squawks and flight anomalies), so the
dashboard keeps a rolling history that survives page reloads.

1. New Tables
   - `aviation_live_events`
     - `id` (uuid, primary key)
     - `icao24` (text) - aircraft transponder hex id
     - `callsign` (text) - flight callsign if broadcast
     - `origin_country` (text) - registration country
     - `category` (text) - threat category (hijack, radio_failure, emergency, rapid_descent, no_squawk, no_callsign)
     - `severity` (text) - critical | high | medium | low
     - `squawk` (text) - transponder code
     - `latitude` (double precision)
     - `longitude` (double precision)
     - `altitude_m` (double precision) - barometric altitude in meters
     - `velocity_ms` (double precision) - ground speed in m/s
     - `vertical_rate_ms` (double precision)
     - `detail` (text) - human-readable description
     - `detected_at` (timestamptz) - when the event was observed
     - `created_at` (timestamptz)

2. Security
   - Enable RLS on `aviation_live_events`.
   - Public read (anon + authenticated): this is non-sensitive, aggregated
     open-data derived intelligence displayed to all dashboard viewers.
   - No client insert/update/delete policies: rows are written ONLY by the
     `aviation-live` edge function using the service role, so viewers cannot
     spoof threat events.

3. Notes
   1. Data is derived from the public OpenSky Network feed.
   2. An index on `detected_at` keeps the "recent events" query fast.
*/

CREATE TABLE IF NOT EXISTS aviation_live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icao24 text NOT NULL,
  callsign text,
  origin_country text,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  squawk text,
  latitude double precision,
  longitude double precision,
  altitude_m double precision,
  velocity_ms double precision,
  vertical_rate_ms double precision,
  detail text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aviation_live_events_detected_at
  ON aviation_live_events (detected_at DESC);

ALTER TABLE aviation_live_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_aviation_live_events" ON aviation_live_events;
CREATE POLICY "public_read_aviation_live_events" ON aviation_live_events FOR SELECT
  TO anon, authenticated USING (true);
