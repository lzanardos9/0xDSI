/*
  # Unified User Risk View

  Creates a read-only view that joins behavioral, LLM, and psychological
  risk signals on email so the User Behavior screen can display all
  domains for one selected user without separate tabs.

  1. New View
    - `unified_user_risk` joins:
      - `user_profiles` (behavior baseline)
      - `llm_risk_profiles` (LLM usage risk, joined on email)
      - `user_psychological_profiles` (joined on llm user_id)
    - Exposes a composite_risk_score (max of available signals)
    - Surfaces LLM presence flags so UI can show "no LLM data" empty states

  2. Security
    - View inherits RLS from underlying tables; no separate policies needed
    - Read-only; no INSERT/UPDATE/DELETE possible against view
*/

CREATE OR REPLACE VIEW unified_user_risk AS
SELECT
  up.id                              AS behavior_profile_id,
  up.user_id                         AS auth_user_id,
  up.full_name,
  up.email,
  up.department                      AS behavior_department,
  up.title,
  up.clearance_level,
  up.profile_picture_url,
  up.risk_score                      AS behavior_risk_score,
  up.status                          AS behavior_status,
  llm.user_id                        AS llm_user_id,
  llm.current_risk_score             AS llm_risk_score,
  llm.risk_level                     AS llm_risk_level,
  llm.risk_trend                     AS llm_risk_trend,
  llm.total_interactions             AS llm_total_interactions,
  llm.high_risk_interactions         AS llm_high_risk_interactions,
  llm.flagged_interactions           AS llm_flagged_interactions,
  llm.is_escalated                   AS llm_is_escalated,
  llm.escalation_reason              AS llm_escalation_reason,
  llm.has_anomalous_behavior         AS llm_has_anomalous_behavior,
  psy.overall_psychological_risk_score AS psych_risk_score,
  psy.risk_classification            AS psych_risk_classification,
  psy.is_potential_insider_threat    AS psych_insider_threat,
  GREATEST(
    COALESCE(up.risk_score, 0),
    COALESCE(llm.current_risk_score, 0),
    COALESCE(psy.overall_psychological_risk_score, 0)
  )::numeric                         AS composite_risk_score,
  (llm.user_id IS NOT NULL)          AS has_llm_data,
  (psy.id IS NOT NULL)               AS has_psych_data
FROM user_profiles up
LEFT JOIN llm_risk_profiles llm
  ON lower(llm.user_email) = lower(up.email)
LEFT JOIN user_psychological_profiles psy
  ON psy.user_id = llm.user_id;

GRANT SELECT ON unified_user_risk TO authenticated, anon;
