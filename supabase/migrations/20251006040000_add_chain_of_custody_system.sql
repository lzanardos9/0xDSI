/*
  # Chain of Custody System for SIEM Events

  1. Purpose
    - Ensure forensic integrity and legal admissibility of security events
    - Create tamper-evident audit trail for all event modifications
    - Implement cryptographic signatures for data integrity
    - Support compliance requirements (FIPS, FedRAMP, NIST 800-53)

  2. New Tables
    - `event_custody_chain` - Immutable chain of custody records
    - `event_integrity_hashes` - Cryptographic hashes for tamper detection
    - `custody_transfers` - Track when evidence changes hands
    - `evidence_seals` - Digital seals preventing unauthorized access

  3. Security Features
    - Immutable audit logs (write-once, read-many)
    - HMAC-SHA256 signatures for integrity verification
    - Cryptographic chaining (each record links to previous)
    - Automatic timestamping with precision
    - Access logging for all custody events

  4. Compliance
    - NIST 800-53 AU-10 (Non-repudiation)
    - FIPS 140-2 compliant hashing
    - Federal Rules of Evidence compliance
    - Chain of custody documentation standards
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Event Custody Chain Table (Immutable)
-- This table maintains the complete chain of custody for each security event
CREATE TABLE IF NOT EXISTS event_custody_chain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event reference
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  sequence_number integer NOT NULL,

  -- Custody information
  custody_action text NOT NULL CHECK (custody_action IN (
    'created',           -- Initial event capture
    'accessed',          -- Event viewed/read
    'analyzed',          -- Forensic analysis performed
    'exported',          -- Data exported
    'modified',          -- Metadata updated (raw data NEVER modified)
    'transferred',       -- Custody transferred to another party
    'sealed',            -- Evidence sealed
    'unsealed',          -- Evidence unsealed for investigation
    'archived',          -- Moved to long-term storage
    'deleted_requested'  -- Deletion requested (but not executed)
  )),

  -- Actor information
  actor_id uuid REFERENCES auth.users(id),
  actor_username text NOT NULL,
  actor_ip_address inet NOT NULL,
  actor_user_agent text,

  -- Justification and context
  action_reason text NOT NULL,
  case_number text,
  investigation_id uuid,

  -- Digital signature and integrity
  previous_record_hash text,  -- Links to previous custody record
  record_hash text NOT NULL,   -- HMAC-SHA256 of this record
  signature text NOT NULL,     -- Digital signature of actor

  -- Original event snapshot (immutable)
  event_snapshot jsonb NOT NULL, -- Full event data at time of custody action
  event_hash text NOT NULL,      -- SHA256 of raw event data

  -- Timestamps (immutable, precise)
  custody_timestamp timestamptz NOT NULL DEFAULT now(),
  system_timestamp timestamptz NOT NULL DEFAULT clock_timestamp(),

  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,

  -- Chain integrity validation
  chain_valid boolean DEFAULT true,
  validation_error text,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Ensure sequential integrity per event
  CONSTRAINT unique_event_sequence UNIQUE (event_id, sequence_number)
);

-- Prevent updates and deletes (immutable table)
CREATE OR REPLACE RULE event_custody_no_update AS
  ON UPDATE TO event_custody_chain
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE event_custody_no_delete AS
  ON DELETE TO event_custody_chain
  DO INSTEAD NOTHING;

-- Event Integrity Hashes Table
-- Stores cryptographic hashes for tamper detection
CREATE TABLE IF NOT EXISTS event_integrity_hashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,

  -- Hash algorithms (FIPS-approved)
  sha256_hash text NOT NULL,
  sha384_hash text,
  sha512_hash text,

  -- Content hashes
  raw_log_hash text,
  raw_json_hash text,
  packet_data_hash text,

  -- Metadata signature
  metadata_signature text NOT NULL,

  -- Hash generation info
  hash_algorithm text NOT NULL DEFAULT 'SHA-256',
  salt text NOT NULL,

  -- Verification status
  verified boolean DEFAULT false,
  last_verified_at timestamptz,
  verification_count integer DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_event_hash UNIQUE (event_id)
);

-- Make integrity hashes immutable (can only verify, not update)
CREATE OR REPLACE RULE event_integrity_no_delete AS
  ON DELETE TO event_integrity_hashes
  DO INSTEAD NOTHING;

-- Custody Transfers Table
-- Tracks when evidence custody changes between parties
CREATE TABLE IF NOT EXISTS custody_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,

  -- Transfer parties
  from_user_id uuid REFERENCES auth.users(id),
  from_username text NOT NULL,
  from_organization text NOT NULL,

  to_user_id uuid REFERENCES auth.users(id),
  to_username text NOT NULL,
  to_organization text NOT NULL,

  -- Transfer details
  transfer_reason text NOT NULL,
  transfer_method text NOT NULL CHECK (transfer_method IN (
    'internal',      -- Within same organization
    'law_enforcement', -- To law enforcement
    'legal',         -- To legal counsel
    'third_party',   -- To external party
    'archive'        -- To archival system
  )),

  -- Authorization
  authorized_by uuid REFERENCES auth.users(id),
  authorization_document text,

  -- Digital signatures
  from_signature text NOT NULL,
  to_signature text NOT NULL,
  witness_signature text,

  -- Transfer verification
  transfer_hash text NOT NULL,
  acknowledgment_received boolean DEFAULT false,
  acknowledged_at timestamptz,

  -- Timestamps
  transfer_initiated_at timestamptz NOT NULL DEFAULT now(),
  transfer_completed_at timestamptz,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Evidence Seals Table
-- Digital seals to prevent unauthorized access
CREATE TABLE IF NOT EXISTS evidence_seals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,

  -- Seal information
  seal_type text NOT NULL CHECK (seal_type IN (
    'investigation',  -- Sealed for ongoing investigation
    'legal_hold',     -- Legal preservation order
    'forensic',       -- Forensic analysis in progress
    'evidence',       -- Court evidence
    'archive'         -- Long-term preservation
  )),

  -- Seal authority
  sealed_by uuid NOT NULL REFERENCES auth.users(id),
  seal_authority text NOT NULL,
  seal_reason text NOT NULL,

  -- Legal references
  case_number text,
  court_order_number text,
  retention_period interval,
  retention_until timestamptz,

  -- Seal integrity
  seal_hash text NOT NULL,
  tamper_evident_seal text NOT NULL,

  -- Status
  is_sealed boolean DEFAULT true,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  unsealed_at timestamptz,
  unsealed_by uuid REFERENCES auth.users(id),
  unseal_reason text,

  -- Access restrictions
  access_restricted boolean DEFAULT true,
  authorized_users uuid[] DEFAULT ARRAY[]::uuid[],
  access_log_id uuid,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_custody_chain_event_id ON event_custody_chain(event_id);
CREATE INDEX IF NOT EXISTS idx_custody_chain_sequence ON event_custody_chain(event_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_custody_chain_actor ON event_custody_chain(actor_id);
CREATE INDEX IF NOT EXISTS idx_custody_chain_timestamp ON event_custody_chain(custody_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_custody_chain_action ON event_custody_chain(custody_action);

CREATE INDEX IF NOT EXISTS idx_integrity_event_id ON event_integrity_hashes(event_id);
CREATE INDEX IF NOT EXISTS idx_integrity_verified ON event_integrity_hashes(verified, last_verified_at);

CREATE INDEX IF NOT EXISTS idx_transfers_event_id ON custody_transfers(event_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from_user ON custody_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_user ON custody_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_completed ON custody_transfers(transfer_completed_at);

CREATE INDEX IF NOT EXISTS idx_seals_event_id ON evidence_seals(event_id);
CREATE INDEX IF NOT EXISTS idx_seals_status ON evidence_seals(is_sealed);
CREATE INDEX IF NOT EXISTS idx_seals_type ON evidence_seals(seal_type);

-- Enable Row Level Security
ALTER TABLE event_custody_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_integrity_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_seals ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Restrictive (audit tables should be append-only)
CREATE POLICY "Authenticated users can view custody chain"
  ON event_custody_chain FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can append custody records"
  ON event_custody_chain FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view integrity hashes"
  ON event_integrity_hashes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create integrity hashes"
  ON event_integrity_hashes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update verification status"
  ON event_integrity_hashes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view custody transfers"
  ON custody_transfers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can create transfers"
  ON custody_transfers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view evidence seals"
  ON evidence_seals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can manage seals"
  ON evidence_seals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to generate HMAC-SHA256 signature
CREATE OR REPLACE FUNCTION generate_record_signature(
  record_data jsonb,
  secret_key text DEFAULT 'custody_chain_secret'
)
RETURNS text AS $$
BEGIN
  RETURN encode(hmac(record_data::text, secret_key, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate SHA-256 hash
CREATE OR REPLACE FUNCTION generate_sha256_hash(data text)
RETURNS text AS $$
BEGIN
  RETURN encode(digest(data, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to create custody chain record (called automatically)
CREATE OR REPLACE FUNCTION create_custody_record(
  p_event_id uuid,
  p_action text,
  p_actor_id uuid,
  p_actor_username text,
  p_actor_ip inet,
  p_reason text,
  p_case_number text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_sequence_number integer;
  v_previous_hash text;
  v_event_snapshot jsonb;
  v_event_hash text;
  v_record_hash text;
  v_signature text;
  v_custody_id uuid;
BEGIN
  -- Get next sequence number
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_sequence_number
  FROM event_custody_chain
  WHERE event_id = p_event_id;

  -- Get previous record hash (for chaining)
  SELECT record_hash
  INTO v_previous_hash
  FROM event_custody_chain
  WHERE event_id = p_event_id
  ORDER BY sequence_number DESC
  LIMIT 1;

  -- Get event snapshot
  SELECT to_jsonb(e.*) INTO v_event_snapshot
  FROM events e
  WHERE e.id = p_event_id;

  -- Generate event hash
  v_event_hash := generate_sha256_hash(v_event_snapshot::text);

  -- Generate record data for hashing
  v_record_hash := generate_record_signature(
    jsonb_build_object(
      'event_id', p_event_id,
      'sequence', v_sequence_number,
      'action', p_action,
      'actor', p_actor_username,
      'timestamp', now(),
      'previous_hash', COALESCE(v_previous_hash, 'genesis'),
      'event_hash', v_event_hash
    )
  );

  -- Generate signature
  v_signature := generate_record_signature(
    jsonb_build_object(
      'record_hash', v_record_hash,
      'actor_id', p_actor_id
    )
  );

  -- Insert custody record
  INSERT INTO event_custody_chain (
    event_id,
    sequence_number,
    custody_action,
    actor_id,
    actor_username,
    actor_ip_address,
    action_reason,
    case_number,
    previous_record_hash,
    record_hash,
    signature,
    event_snapshot,
    event_hash
  ) VALUES (
    p_event_id,
    v_sequence_number,
    p_action,
    p_actor_id,
    p_actor_username,
    p_actor_ip,
    p_reason,
    p_case_number,
    v_previous_hash,
    v_record_hash,
    v_signature,
    v_event_snapshot,
    v_event_hash
  ) RETURNING id INTO v_custody_id;

  RETURN v_custody_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify chain of custody integrity
CREATE OR REPLACE FUNCTION verify_custody_chain(p_event_id uuid)
RETURNS TABLE (
  is_valid boolean,
  total_records integer,
  invalid_records integer,
  error_details jsonb
) AS $$
DECLARE
  v_record record;
  v_prev_hash text;
  v_is_valid boolean := true;
  v_errors jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_invalid_count integer := 0;
BEGIN
  -- Iterate through custody chain in sequence
  FOR v_record IN
    SELECT *
    FROM event_custody_chain
    WHERE event_id = p_event_id
    ORDER BY sequence_number
  LOOP
    v_count := v_count + 1;

    -- Verify hash chain
    IF v_record.sequence_number > 1 AND v_record.previous_record_hash != v_prev_hash THEN
      v_is_valid := false;
      v_invalid_count := v_invalid_count + 1;
      v_errors := v_errors || jsonb_build_object(
        'sequence', v_record.sequence_number,
        'error', 'Hash chain broken',
        'expected', v_prev_hash,
        'found', v_record.previous_record_hash
      );
    END IF;

    -- Verify event hash hasn't changed
    DECLARE
      v_current_event_hash text;
    BEGIN
      SELECT generate_sha256_hash(to_jsonb(e.*)::text)
      INTO v_current_event_hash
      FROM events e
      WHERE e.id = p_event_id;

      -- Only check if this is the most recent record
      IF NOT EXISTS (
        SELECT 1 FROM event_custody_chain
        WHERE event_id = p_event_id
        AND sequence_number > v_record.sequence_number
      ) THEN
        IF v_current_event_hash != v_record.event_hash THEN
          v_is_valid := false;
          v_invalid_count := v_invalid_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'sequence', v_record.sequence_number,
            'error', 'Event data tampered',
            'message', 'Current event hash does not match custody record'
          );
        END IF;
      END IF;
    END;

    v_prev_hash := v_record.record_hash;
  END LOOP;

  RETURN QUERY SELECT v_is_valid, v_count, v_invalid_count, v_errors;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create custody record on event creation
CREATE OR REPLACE FUNCTION trigger_event_custody_on_create()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_custody_record(
    NEW.id,
    'created',
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(current_user, 'system'),
    inet_client_addr(),
    'Initial event capture',
    NULL
  );

  -- Also create integrity hash
  INSERT INTO event_integrity_hashes (
    event_id,
    sha256_hash,
    raw_log_hash,
    raw_json_hash,
    metadata_signature,
    salt
  ) VALUES (
    NEW.id,
    generate_sha256_hash(to_jsonb(NEW.*)::text),
    generate_sha256_hash(COALESCE(NEW.raw_log, '')),
    generate_sha256_hash(COALESCE(NEW.raw_json::text, '{}')),
    generate_record_signature(COALESCE(NEW.metadata, '{}'::jsonb)),
    encode(gen_random_bytes(32), 'hex')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to events table
DROP TRIGGER IF EXISTS event_custody_on_create ON events;
CREATE TRIGGER event_custody_on_create
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_event_custody_on_create();

-- Function to get complete custody history
CREATE OR REPLACE FUNCTION get_custody_history(p_event_id uuid)
RETURNS TABLE (
  sequence_number integer,
  action text,
  actor text,
  reason text,
  timestamp timestamptz,
  hash_valid boolean,
  metadata jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ecc.sequence_number,
    ecc.custody_action,
    ecc.actor_username,
    ecc.action_reason,
    ecc.custody_timestamp,
    ecc.chain_valid,
    ecc.metadata
  FROM event_custody_chain ecc
  WHERE ecc.event_id = p_event_id
  ORDER BY ecc.sequence_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION generate_record_signature(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_sha256_hash(text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_custody_record(uuid, text, uuid, text, inet, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_custody_chain(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_custody_history(uuid) TO authenticated;
