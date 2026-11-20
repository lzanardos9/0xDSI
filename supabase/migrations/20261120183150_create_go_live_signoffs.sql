/*
# Go-live readiness sign-offs

1. Plain-English summary
   Adds an append-only log of go-live decisions. A signed-in team member can sign a manual
   go-live check (for example "Security review completed") or waive an advisory check with a reason.
   The latest decision per check is what the Go-Live Readiness screen shows. Decisions are never edited
   or deleted; to undo one, a new "revoked" decision is added, so the history stays auditable.

2. New tables
   - `go_live_signoffs`
     - `id` (uuid, primary key)
     - `check_id` (text) which checklist item the decision is about
     - `decision` (text) one of signed / waived / revoked
     - `note` (text) evidence or reason, at least 10 characters for signed/waived
     - `decided_by` (uuid) the signed-in user, filled automatically
     - `decided_email` (text) the signed-in user's email, filled automatically from the session
     - `decided_at` (timestamptz)

3. Security
   - RLS enabled.
   - Signed-in users can read all decisions (it is a shared team checklist).
   - Signed-in users can add decisions only as themselves (decided_by must equal auth.uid()).
   - No UPDATE or DELETE grants or policies: the log is append-only by design.
   - No anon access.

4. Notes
   1. decided_by / decided_email default from the session so the app never supplies them.
   2. Index on (check_id, decided_at) for "latest decision per check".
*/

CREATE TABLE IF NOT EXISTS go_live_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id text NOT NULL CHECK (char_length(check_id) BETWEEN 1 AND 64),
  decision text NOT NULL CHECK (decision IN ('signed', 'waived', 'revoked')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  decided_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  decided_email text DEFAULT (auth.jwt() ->> 'email'),
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT go_live_note_required CHECK (decision = 'revoked' OR char_length(btrim(note)) >= 10)
);

CREATE INDEX IF NOT EXISTS go_live_signoffs_check_time_idx ON go_live_signoffs (check_id, decided_at DESC);

ALTER TABLE go_live_signoffs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON go_live_signoffs TO authenticated;
GRANT INSERT (check_id, decision, note) ON go_live_signoffs TO authenticated;

DROP POLICY IF EXISTS "Signed-in users can read go-live decisions" ON go_live_signoffs;
CREATE POLICY "Signed-in users can read go-live decisions" ON go_live_signoffs FOR SELECT
TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Signed-in users record decisions as themselves" ON go_live_signoffs;
CREATE POLICY "Signed-in users record decisions as themselves" ON go_live_signoffs FOR INSERT
TO authenticated WITH CHECK (auth.uid() = decided_by);
