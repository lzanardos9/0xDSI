/*
  # Add Typing Biometrics / Keystroke Dynamics to Credential Selling Cases

  Adds deep keystroke dynamics analysis per detected operator on each credential
  selling case. This provides:

  1. Keystroke timing signatures (dwell time, flight time, digraph latencies)
  2. Typing rhythm consistency metrics
  3. Error rate and correction patterns
  4. Emotional state inference from typing patterns
  5. Cross-operator similarity matrix (proves different people)
  6. Temporal drift analysis (how typing changes over sessions)

  These biometrics serve dual purpose:
  - IDENTIFICATION: Confirm multiple distinct operators on the same account
  - PSYCHOLOGICAL: Infer stress, anxiety, coaching, and emotional state from typing rhythm

  1. Modified Tables
    - `credential_selling_cases` - Added `typing_biometrics` (jsonb)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'credential_selling_cases' AND column_name = 'typing_biometrics'
  ) THEN
    ALTER TABLE credential_selling_cases ADD COLUMN typing_biometrics jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Case 1: Vanessa - 3 operators, very distinct typing signatures
UPDATE credential_selling_cases SET typing_biometrics = '{
  "analysis_version": "keystroke-v2.4",
  "total_keystrokes_analyzed": 48520,
  "analysis_period_days": 30,
  "operators": [
    {
      "operator_id": "OP-A",
      "label": "Original Owner (Vanessa)",
      "keystrokes_analyzed": 32100,
      "sessions_analyzed": 45,
      "metrics": {
        "avg_wpm": 55,
        "wpm_std_dev": 4.2,
        "avg_dwell_time_ms": 98,
        "dwell_time_std_dev": 12,
        "avg_flight_time_ms": 145,
        "flight_time_std_dev": 22,
        "avg_digraph_latency_ms": 178,
        "key_hold_consistency": 0.88,
        "rhythm_regularity": 0.82,
        "error_rate_pct": 4.2,
        "backspace_frequency": 0.038,
        "correction_speed_ms": 280,
        "shift_hold_duration_ms": 125,
        "space_bar_duration_ms": 72,
        "pause_frequency_per_min": 3.2,
        "avg_pause_duration_ms": 1200,
        "burst_typing_ratio": 0.65,
        "fatigue_slope": -0.02
      },
      "digraph_signature": {
        "th": 112, "he": 98, "in": 105, "er": 118, "an": 132, "re": 125,
        "on": 140, "at": 95, "en": 108, "nd": 145, "ti": 115, "es": 122,
        "or": 138, "te": 102, "of": 88, "ed": 128, "is": 95, "it": 108,
        "al": 135, "ar": 142, "st": 118, "to": 92, "nt": 155, "ng": 148
      },
      "emotional_inference": {
        "baseline_stress": 0.22,
        "current_stress": 0.35,
        "stress_trend": "slightly_elevated",
        "anxiety_markers": 0.28,
        "confidence_in_typing": 0.85,
        "fatigue_detected": false,
        "coaching_indicators": 0.05,
        "emotional_state": "mildly_anxious",
        "detail": "Baseline typing is relaxed and consistent. Recent sessions show slight stress elevation: 15% increase in error rate, 8% decrease in rhythm regularity. Consistent with awareness of criminal activity and mild anxiety about detection."
      },
      "temporal_drift": {
        "wpm_30d_trend": [56, 55, 54, 55, 57, 53, 52, 48, 50, 52],
        "error_rate_30d_trend": [3.8, 4.0, 3.9, 4.1, 4.5, 4.8, 5.2, 5.5, 5.0, 4.8],
        "rhythm_30d_trend": [0.84, 0.83, 0.85, 0.82, 0.80, 0.78, 0.75, 0.72, 0.76, 0.78],
        "interpretation": "Gradual typing degradation over 30 days suggests increasing psychological burden. Peak stress around day 22 (highest error rate, lowest rhythm) correlates with second buyer detection."
      }
    },
    {
      "operator_id": "OP-B",
      "label": "Buyer 1",
      "keystrokes_analyzed": 11200,
      "sessions_analyzed": 8,
      "metrics": {
        "avg_wpm": 82,
        "wpm_std_dev": 8.5,
        "avg_dwell_time_ms": 68,
        "dwell_time_std_dev": 18,
        "avg_flight_time_ms": 95,
        "flight_time_std_dev": 35,
        "avg_digraph_latency_ms": 125,
        "key_hold_consistency": 0.52,
        "rhythm_regularity": 0.45,
        "error_rate_pct": 8.8,
        "backspace_frequency": 0.075,
        "correction_speed_ms": 150,
        "shift_hold_duration_ms": 82,
        "space_bar_duration_ms": 45,
        "pause_frequency_per_min": 8.5,
        "avg_pause_duration_ms": 600,
        "burst_typing_ratio": 0.88,
        "fatigue_slope": 0.0
      },
      "digraph_signature": {
        "th": 82, "he": 75, "in": 88, "er": 92, "an": 98, "re": 105,
        "on": 110, "at": 72, "en": 85, "nd": 118, "ti": 78, "es": 95,
        "or": 108, "te": 80, "of": 65, "ed": 102, "is": 70, "it": 82,
        "al": 112, "ar": 115, "st": 88, "to": 68, "nt": 125, "ng": 120
      },
      "emotional_inference": {
        "baseline_stress": null,
        "current_stress": 0.62,
        "stress_trend": "consistently_elevated",
        "anxiety_markers": 0.55,
        "confidence_in_typing": 0.48,
        "fatigue_detected": false,
        "coaching_indicators": 0.15,
        "emotional_state": "rushed_and_unfamiliar",
        "detail": "Typing pattern shows high urgency: fast but inconsistent bursts with frequent pauses (navigation uncertainty). High error rate (8.8%) despite fast WPM suggests unfamiliarity with the banking interface. Pause patterns indicate reading/scanning rather than practiced navigation."
      },
      "temporal_drift": {
        "wpm_30d_trend": [78, 80, 85, 82, 84, 80, 82, 85],
        "error_rate_30d_trend": [10.2, 9.5, 8.2, 8.8, 8.5, 9.0, 8.5, 8.2],
        "rhythm_30d_trend": [0.38, 0.42, 0.48, 0.45, 0.47, 0.44, 0.46, 0.48],
        "interpretation": "Slight improvement over sessions indicates the buyer is learning the interface. Error rate declining from 10.2% to 8.2%. This learning curve is a strong indicator of a new operator rather than the account holder."
      }
    },
    {
      "operator_id": "OP-C",
      "label": "Buyer 2",
      "keystrokes_analyzed": 5220,
      "sessions_analyzed": 5,
      "metrics": {
        "avg_wpm": 68,
        "wpm_std_dev": 6.8,
        "avg_dwell_time_ms": 82,
        "dwell_time_std_dev": 15,
        "avg_flight_time_ms": 118,
        "flight_time_std_dev": 28,
        "avg_digraph_latency_ms": 152,
        "key_hold_consistency": 0.62,
        "rhythm_regularity": 0.58,
        "error_rate_pct": 6.5,
        "backspace_frequency": 0.058,
        "correction_speed_ms": 210,
        "shift_hold_duration_ms": 105,
        "space_bar_duration_ms": 58,
        "pause_frequency_per_min": 6.2,
        "avg_pause_duration_ms": 850,
        "burst_typing_ratio": 0.72,
        "fatigue_slope": -0.01
      },
      "digraph_signature": {
        "th": 95, "he": 88, "in": 100, "er": 108, "an": 115, "re": 112,
        "on": 125, "at": 85, "en": 98, "nd": 132, "ti": 92, "es": 108,
        "or": 122, "te": 88, "of": 78, "ed": 115, "is": 82, "it": 95,
        "al": 125, "ar": 128, "st": 102, "to": 82, "nt": 138, "ng": 135
      },
      "emotional_inference": {
        "baseline_stress": null,
        "current_stress": 0.48,
        "stress_trend": "moderate",
        "anxiety_markers": 0.42,
        "confidence_in_typing": 0.60,
        "fatigue_detected": false,
        "coaching_indicators": 0.08,
        "emotional_state": "cautious_and_methodical",
        "detail": "More careful than Buyer 1. Moderate pace with deliberate pauses suggesting reading confirmation screens carefully. Lower error rate indicates more experience with banking interfaces generally, though still unfamiliar with this specific accounts layout."
      },
      "temporal_drift": {
        "wpm_30d_trend": [65, 68, 70, 68, 72],
        "error_rate_30d_trend": [7.2, 6.5, 6.0, 6.5, 5.8],
        "rhythm_30d_trend": [0.52, 0.55, 0.60, 0.58, 0.62],
        "interpretation": "Steady improvement curve. This operator is becoming comfortable with the interface faster than Buyer 1, suggesting more general banking experience."
      }
    }
  ],
  "cross_operator_similarity_matrix": {
    "OP-A_vs_OP-B": {"similarity": 0.12, "confidence": 0.96, "verdict": "DIFFERENT_PERSON", "key_differences": ["WPM delta: 27", "Dwell time delta: 30ms", "Rhythm regularity delta: 0.37", "Error rate delta: 4.6%", "Digraph correlation: 0.35"]},
    "OP-A_vs_OP-C": {"similarity": 0.28, "confidence": 0.92, "verdict": "DIFFERENT_PERSON", "key_differences": ["WPM delta: 13", "Dwell time delta: 16ms", "Rhythm regularity delta: 0.24", "Digraph correlation: 0.52"]},
    "OP-B_vs_OP-C": {"similarity": 0.31, "confidence": 0.90, "verdict": "DIFFERENT_PERSON", "key_differences": ["WPM delta: 14", "Flight time delta: 23ms", "Pause pattern delta: 2.3/min", "Digraph correlation: 0.58"]}
  },
  "aggregate_insights": {
    "multi_operator_confirmed": true,
    "distinct_operators": 3,
    "detection_confidence": 0.96,
    "primary_evidence": "Three completely distinct keystroke timing signatures with cross-pair similarity scores of 0.12, 0.28, and 0.31 (threshold for same-person: >0.75). Digraph latency patterns are unique to each operator, confirming three different muscle memory profiles.",
    "psychological_insight": "Original owner shows escalating stress markers over 30 days -- typing degradation, increased errors, and reduced rhythm regularity. This stress trajectory correlates with the timeline of credential selling activity and likely reflects guilt/anxiety. Buyer 1 shows urgency-driven typing (fast but sloppy), while Buyer 2 is more methodical, suggesting different criminal experience levels."
  }
}'::jsonb WHERE case_id = 'CS-001';

-- Case 2: Ricardo - API seller, 2 operators
UPDATE credential_selling_cases SET typing_biometrics = '{
  "analysis_version": "keystroke-v2.4",
  "total_keystrokes_analyzed": 28400,
  "analysis_period_days": 14,
  "operators": [
    {
      "operator_id": "OP-LEGIT",
      "label": "Employee (Ricardo)",
      "keystrokes_analyzed": 22000,
      "sessions_analyzed": 60,
      "metrics": {
        "avg_wpm": 62,
        "wpm_std_dev": 3.8,
        "avg_dwell_time_ms": 88,
        "dwell_time_std_dev": 10,
        "avg_flight_time_ms": 132,
        "flight_time_std_dev": 18,
        "avg_digraph_latency_ms": 165,
        "key_hold_consistency": 0.90,
        "rhythm_regularity": 0.86,
        "error_rate_pct": 2.8,
        "backspace_frequency": 0.025,
        "correction_speed_ms": 320,
        "shift_hold_duration_ms": 118,
        "space_bar_duration_ms": 65,
        "pause_frequency_per_min": 2.5,
        "avg_pause_duration_ms": 1500,
        "burst_typing_ratio": 0.58,
        "fatigue_slope": -0.015
      },
      "digraph_signature": {
        "th": 108, "he": 95, "in": 102, "er": 115, "an": 128, "re": 120,
        "on": 135, "at": 90, "en": 105, "nd": 142, "ti": 110, "es": 118
      },
      "emotional_inference": {
        "baseline_stress": 0.18,
        "current_stress": 0.25,
        "stress_trend": "stable",
        "anxiety_markers": 0.15,
        "confidence_in_typing": 0.92,
        "fatigue_detected": false,
        "coaching_indicators": 0.0,
        "emotional_state": "confident_and_practiced",
        "detail": "Highly consistent typing signature of a practiced developer. Very low error rate and high rhythm regularity. Minimal stress elevation despite selling activity -- consistent with the calculated, entitled personality profile. This person is not anxious about what they are doing."
      },
      "temporal_drift": {
        "wpm_30d_trend": [63, 62, 61, 62, 63, 62, 60, 62, 63, 61],
        "error_rate_30d_trend": [2.5, 2.8, 2.7, 3.0, 2.8, 2.9, 3.1, 2.8, 2.6, 2.8],
        "rhythm_30d_trend": [0.88, 0.87, 0.86, 0.85, 0.86, 0.87, 0.85, 0.86, 0.87, 0.86],
        "interpretation": "Remarkably stable typing pattern. No stress-related degradation detected, which aligns with the cold, calculated psychological profile. This seller is emotionally detached from their criminal activity."
      }
    },
    {
      "operator_id": "OP-EXTERNAL",
      "label": "External Operator (API Buyer)",
      "keystrokes_analyzed": 6400,
      "sessions_analyzed": 15,
      "metrics": {
        "avg_wpm": 45,
        "wpm_std_dev": 12.5,
        "avg_dwell_time_ms": 110,
        "dwell_time_std_dev": 28,
        "avg_flight_time_ms": 185,
        "flight_time_std_dev": 45,
        "avg_digraph_latency_ms": 225,
        "key_hold_consistency": 0.38,
        "rhythm_regularity": 0.32,
        "error_rate_pct": 12.5,
        "backspace_frequency": 0.11,
        "correction_speed_ms": 185,
        "shift_hold_duration_ms": 145,
        "space_bar_duration_ms": 88,
        "pause_frequency_per_min": 12.0,
        "avg_pause_duration_ms": 2800,
        "burst_typing_ratio": 0.92,
        "fatigue_slope": 0.0
      },
      "digraph_signature": {
        "th": 155, "he": 142, "in": 160, "er": 175, "an": 185, "re": 178,
        "on": 195, "at": 138, "en": 162, "nd": 205, "ti": 148, "es": 172
      },
      "emotional_inference": {
        "baseline_stress": null,
        "current_stress": 0.72,
        "stress_trend": "high",
        "anxiety_markers": 0.65,
        "confidence_in_typing": 0.28,
        "fatigue_detected": false,
        "coaching_indicators": 0.45,
        "emotional_state": "coached_and_uncertain",
        "detail": "Very high pause frequency (12/min) with long pause durations (2.8s) strongly suggests this operator is being guided -- either reading instructions or receiving real-time coaching via another channel. The burst-then-pause pattern (type quickly, stop, read, type again) is a classic coaching signature. High error rate despite slow overall WPM indicates unfamiliarity with the system."
      },
      "temporal_drift": {
        "wpm_30d_trend": [38, 42, 45, 48, 45, 48, 50, 45, 42, 48, 50, 45, 48, 42, 45],
        "error_rate_30d_trend": [15.0, 14.2, 12.8, 11.5, 12.0, 11.8, 10.5, 12.5, 13.0, 11.0, 10.2, 12.0, 11.5, 13.5, 12.5],
        "rhythm_30d_trend": [0.25, 0.28, 0.32, 0.35, 0.33, 0.35, 0.38, 0.30, 0.28, 0.35, 0.38, 0.32, 0.35, 0.28, 0.32],
        "interpretation": "Inconsistent improvement -- WPM and error rate oscillate rather than steadily improving. This suggests multiple people may be sharing the bought credentials, or the same person uses them intermittently without building muscle memory."
      }
    }
  ],
  "cross_operator_similarity_matrix": {
    "OP-LEGIT_vs_OP-EXTERNAL": {"similarity": 0.08, "confidence": 0.98, "verdict": "DIFFERENT_PERSON", "key_differences": ["WPM delta: 17", "Dwell time delta: 22ms", "Key hold consistency delta: 0.52", "Pause frequency delta: 9.5/min", "Coaching signature in OP-EXTERNAL"]}
  },
  "aggregate_insights": {
    "multi_operator_confirmed": true,
    "distinct_operators": 2,
    "detection_confidence": 0.98,
    "primary_evidence": "Extremely low similarity score (0.08) between operators. The external operator shows a distinctive coaching signature (burst-pause-burst pattern) that is absent from Ricardos consistent developer typing. Key hold consistency delta of 0.52 is the largest single differentiator.",
    "psychological_insight": "Ricardos stable, unstressed typing despite active credential selling is a red flag -- it indicates emotional detachment and moral disengagement. The external operators coaching pattern suggests they purchased access with some instructions but are not technically proficient, which aligns with a non-technical criminal buying technical access."
  }
}'::jsonb WHERE case_id = 'CS-002';

-- Case 3: Camila - recruited seller
UPDATE credential_selling_cases SET typing_biometrics = '{
  "analysis_version": "keystroke-v2.4",
  "total_keystrokes_analyzed": 31800,
  "analysis_period_days": 25,
  "operators": [
    {
      "operator_id": "OP-CAMILA",
      "label": "Account Holder (Camila)",
      "keystrokes_analyzed": 21500,
      "sessions_analyzed": 35,
      "metrics": {
        "avg_wpm": 48,
        "wpm_std_dev": 5.5,
        "avg_dwell_time_ms": 105,
        "dwell_time_std_dev": 15,
        "avg_flight_time_ms": 155,
        "flight_time_std_dev": 25,
        "avg_digraph_latency_ms": 192,
        "key_hold_consistency": 0.78,
        "rhythm_regularity": 0.72,
        "error_rate_pct": 5.5,
        "backspace_frequency": 0.048,
        "correction_speed_ms": 310,
        "shift_hold_duration_ms": 135,
        "space_bar_duration_ms": 78,
        "pause_frequency_per_min": 4.0,
        "avg_pause_duration_ms": 1100,
        "burst_typing_ratio": 0.55,
        "fatigue_slope": -0.025
      },
      "digraph_signature": {
        "th": 125, "he": 112, "in": 118, "er": 132, "an": 145, "re": 138
      },
      "emotional_inference": {
        "baseline_stress": 0.30,
        "current_stress": 0.58,
        "stress_trend": "escalating",
        "anxiety_markers": 0.52,
        "confidence_in_typing": 0.72,
        "fatigue_detected": true,
        "coaching_indicators": 0.12,
        "emotional_state": "stressed_and_conflicted",
        "detail": "Significant stress escalation over 25 days. Camilas typing shows increasing anxiety markers: error rate up 45%, rhythm regularity down 18%, and fatigue slope steepening. This pattern is consistent with someone experiencing moral conflict about their criminal involvement. Unlike Ricardo (emotionally detached), Camila is psychologically affected by the selling activity."
      },
      "temporal_drift": {
        "wpm_30d_trend": [52, 50, 48, 46, 48, 45, 44, 46, 42, 45],
        "error_rate_30d_trend": [3.8, 4.2, 4.8, 5.5, 5.2, 6.0, 6.5, 6.2, 7.0, 5.8],
        "rhythm_30d_trend": [0.82, 0.78, 0.75, 0.70, 0.72, 0.68, 0.65, 0.68, 0.62, 0.68],
        "interpretation": "Clear deterioration pattern. WPM declining, errors increasing, rhythm degrading. This is the typing signature of increasing psychological distress. Supports the psychological assessment that Camila is a recruited participant experiencing guilt rather than a calculating criminal."
      }
    },
    {
      "operator_id": "OP-RECRUITER",
      "label": "Mule Network Operator",
      "keystrokes_analyzed": 10300,
      "sessions_analyzed": 18,
      "metrics": {
        "avg_wpm": 75,
        "wpm_std_dev": 3.2,
        "avg_dwell_time_ms": 72,
        "dwell_time_std_dev": 8,
        "avg_flight_time_ms": 98,
        "flight_time_std_dev": 12,
        "avg_digraph_latency_ms": 128,
        "key_hold_consistency": 0.92,
        "rhythm_regularity": 0.90,
        "error_rate_pct": 1.8,
        "backspace_frequency": 0.015,
        "correction_speed_ms": 120,
        "shift_hold_duration_ms": 65,
        "space_bar_duration_ms": 38,
        "pause_frequency_per_min": 1.5,
        "avg_pause_duration_ms": 400,
        "burst_typing_ratio": 0.95,
        "fatigue_slope": 0.0
      },
      "digraph_signature": {
        "th": 78, "he": 68, "in": 82, "er": 88, "an": 92, "re": 85
      },
      "emotional_inference": {
        "baseline_stress": null,
        "current_stress": 0.08,
        "stress_trend": "minimal",
        "anxiety_markers": 0.05,
        "confidence_in_typing": 0.95,
        "fatigue_detected": false,
        "coaching_indicators": 0.0,
        "emotional_state": "professional_and_practiced",
        "detail": "Extremely efficient, zero-stress typing. This operator has done this hundreds of times across many accounts. Near-zero error rate, perfectly consistent rhythm, minimal pauses. This is a professional mule operator who navigates banking interfaces with expert-level muscle memory. The contrast with Camilas stressed, deteriorating typing is stark."
      },
      "temporal_drift": {
        "wpm_30d_trend": [75, 76, 75, 74, 75, 76, 75, 75, 76, 75, 74, 75, 76, 75, 75, 74, 75, 76],
        "error_rate_30d_trend": [1.8, 1.5, 2.0, 1.8, 1.5, 1.8, 2.0, 1.5, 1.8, 1.5, 2.0, 1.8, 1.5, 1.8, 2.0, 1.5, 1.8, 1.5],
        "rhythm_30d_trend": [0.90, 0.91, 0.90, 0.89, 0.90, 0.91, 0.90, 0.90, 0.91, 0.90, 0.89, 0.90, 0.91, 0.90, 0.90, 0.91, 0.90, 0.89],
        "interpretation": "Perfectly flat temporal profile. Zero learning curve, zero stress variation, zero fatigue. This operator has fully automated muscle memory for banking PIX operations. Strong evidence of a professional criminal operator."
      }
    }
  ],
  "cross_operator_similarity_matrix": {
    "OP-CAMILA_vs_OP-RECRUITER": {"similarity": 0.15, "confidence": 0.95, "verdict": "DIFFERENT_PERSON", "key_differences": ["WPM delta: 27", "Error rate delta: 3.7%", "Rhythm regularity delta: 0.18", "Stress markers: polar opposites", "Professional vs amateur typing pattern"]}
  },
  "aggregate_insights": {
    "multi_operator_confirmed": true,
    "distinct_operators": 2,
    "detection_confidence": 0.95,
    "primary_evidence": "The psychological contrast in typing patterns is the strongest evidence: Camila shows escalating stress (deteriorating metrics over 25 days), while the mule operator shows zero stress and professional-grade consistency. These are fundamentally different psychological states being expressed through keystroke dynamics.",
    "psychological_insight": "The typing biometrics tell a story of two very different people: a stressed, conflicted account holder being progressively burdened by guilt, and a cold professional who treats banking fraud as routine work. This supports intervention strategies that leverage Camilas psychological distress to encourage cooperation."
  }
}'::jsonb WHERE case_id = 'CS-003';

-- Case 5: Adriana - bank employee, cold and calculated
UPDATE credential_selling_cases SET typing_biometrics = '{
  "analysis_version": "keystroke-v2.4",
  "total_keystrokes_analyzed": 52000,
  "analysis_period_days": 40,
  "operators": [
    {
      "operator_id": "OP-ADRIANA",
      "label": "Bank Employee (Adriana)",
      "keystrokes_analyzed": 52000,
      "sessions_analyzed": 80,
      "metrics": {
        "avg_wpm": 72,
        "wpm_std_dev": 2.8,
        "avg_dwell_time_ms": 78,
        "dwell_time_std_dev": 8,
        "avg_flight_time_ms": 108,
        "flight_time_std_dev": 14,
        "avg_digraph_latency_ms": 142,
        "key_hold_consistency": 0.94,
        "rhythm_regularity": 0.92,
        "error_rate_pct": 1.5,
        "backspace_frequency": 0.012,
        "correction_speed_ms": 105,
        "shift_hold_duration_ms": 95,
        "space_bar_duration_ms": 52,
        "pause_frequency_per_min": 1.8,
        "avg_pause_duration_ms": 800,
        "burst_typing_ratio": 0.78,
        "fatigue_slope": -0.008
      },
      "digraph_signature": {
        "th": 92, "he": 82, "in": 88, "er": 98, "an": 105, "re": 100
      },
      "emotional_inference": {
        "baseline_stress": 0.12,
        "current_stress": 0.14,
        "stress_trend": "flat",
        "anxiety_markers": 0.08,
        "confidence_in_typing": 0.96,
        "fatigue_detected": false,
        "coaching_indicators": 0.0,
        "emotional_state": "cold_and_detached",
        "detail": "The most psychologically alarming typing profile in this case set. Adriana shows ZERO stress elevation across 40 days of credential selling that compromised 200+ customer accounts. Her typing metrics during lunch-hour extraction sessions are indistinguishable from her normal work sessions. This emotional flatness in the face of large-scale criminal activity is consistent with the clinical psychological assessment (psychopathy 65, agreeableness 22). She experiences no guilt, anxiety, or psychological burden from her actions."
      },
      "temporal_drift": {
        "wpm_30d_trend": [72, 73, 72, 71, 72, 73, 72, 72, 73, 72],
        "error_rate_30d_trend": [1.5, 1.4, 1.6, 1.5, 1.4, 1.5, 1.6, 1.5, 1.4, 1.5],
        "rhythm_30d_trend": [0.92, 0.93, 0.92, 0.91, 0.92, 0.93, 0.92, 0.92, 0.93, 0.92],
        "interpretation": "Perfectly stable over 40 days. No stress signature, no fatigue, no guilt markers. The typing pattern during credential extraction is identical to normal customer service work. This is the biometric signature of psychopathic detachment."
      }
    }
  ],
  "cross_operator_similarity_matrix": {},
  "aggregate_insights": {
    "multi_operator_confirmed": false,
    "distinct_operators": 1,
    "detection_confidence": 0.99,
    "primary_evidence": "Single operator with zero stress variation across criminal activity period. The ABSENCE of stress markers is itself the most important finding -- it confirms the psychological assessment of cold, calculated exploitation.",
    "psychological_insight": "Adrianas typing biometrics provide the clearest example of how keystroke dynamics can reveal psychological state. The complete absence of stress markers during sustained criminal activity is a powerful indicator of psychopathic traits. Normal people who commit crimes show typing degradation; Adriana shows none. This finding was used to support the full criminal prosecution recommendation."
  }
}'::jsonb WHERE case_id = 'CS-005';

-- Case 11: Daniel (contractor) - also cold
UPDATE credential_selling_cases SET typing_biometrics = '{
  "analysis_version": "keystroke-v2.4",
  "total_keystrokes_analyzed": 38000,
  "analysis_period_days": 60,
  "operators": [
    {
      "operator_id": "OP-DANIEL",
      "label": "Contractor (Daniel)",
      "keystrokes_analyzed": 25000,
      "sessions_analyzed": 50,
      "metrics": {
        "avg_wpm": 58,
        "wpm_std_dev": 3.5,
        "avg_dwell_time_ms": 92,
        "dwell_time_std_dev": 11,
        "avg_flight_time_ms": 138,
        "flight_time_std_dev": 20,
        "avg_digraph_latency_ms": 172,
        "key_hold_consistency": 0.88,
        "rhythm_regularity": 0.85,
        "error_rate_pct": 2.2,
        "backspace_frequency": 0.02,
        "correction_speed_ms": 260,
        "shift_hold_duration_ms": 110,
        "space_bar_duration_ms": 62,
        "pause_frequency_per_min": 2.8,
        "avg_pause_duration_ms": 1400,
        "burst_typing_ratio": 0.62,
        "fatigue_slope": -0.01
      },
      "digraph_signature": {
        "th": 115, "he": 102, "in": 108, "er": 122, "an": 135
      },
      "emotional_inference": {
        "baseline_stress": 0.15,
        "current_stress": 0.18,
        "stress_trend": "minimal_elevation",
        "anxiety_markers": 0.12,
        "confidence_in_typing": 0.90,
        "coaching_indicators": 0.0,
        "emotional_state": "calculated_professional",
        "detail": "Like Adriana, Daniel shows minimal stress elevation during credential selling. Slight uptick (0.03) possibly related to managing multiple buyer relationships simultaneously. The calculated typing profile supports the professional criminal assessment."
      },
      "temporal_drift": {
        "wpm_30d_trend": [58, 59, 58, 57, 58, 59, 58, 58, 57, 58],
        "error_rate_30d_trend": [2.0, 2.2, 2.1, 2.3, 2.2, 2.0, 2.3, 2.2, 2.1, 2.2],
        "rhythm_30d_trend": [0.86, 0.85, 0.86, 0.84, 0.85, 0.86, 0.84, 0.85, 0.86, 0.85],
        "interpretation": "Stable profile. No stress markers despite selling database access for $25,000. Professional criminal behavior confirmed through biometrics."
      }
    },
    {
      "operator_id": "OP-BUYER-1",
      "label": "First Buyer (Data Broker)",
      "keystrokes_analyzed": 8200,
      "sessions_analyzed": 12,
      "metrics": {
        "avg_wpm": 42,
        "wpm_std_dev": 8.2,
        "avg_dwell_time_ms": 118,
        "dwell_time_std_dev": 25,
        "avg_flight_time_ms": 195,
        "flight_time_std_dev": 42,
        "avg_digraph_latency_ms": 238,
        "key_hold_consistency": 0.42,
        "rhythm_regularity": 0.35,
        "error_rate_pct": 9.8,
        "backspace_frequency": 0.085,
        "correction_speed_ms": 175,
        "shift_hold_duration_ms": 155,
        "space_bar_duration_ms": 92,
        "pause_frequency_per_min": 15.0,
        "avg_pause_duration_ms": 3200,
        "burst_typing_ratio": 0.95,
        "fatigue_slope": 0.0
      },
      "digraph_signature": {
        "th": 165, "he": 148, "in": 158, "er": 175, "an": 190
      },
      "emotional_inference": {
        "baseline_stress": null,
        "current_stress": 0.78,
        "anxiety_markers": 0.70,
        "confidence_in_typing": 0.22,
        "coaching_indicators": 0.72,
        "emotional_state": "heavily_coached",
        "detail": "Extreme coaching signature: 15 pauses/min with 3.2s average duration. This operator is clearly following step-by-step instructions, likely provided by Daniel. The typing-pause-typing pattern is consistent with reading from a separate screen or chat window. Very high stress markers indicate a non-technical buyer performing technical database operations for the first time."
      }
    },
    {
      "operator_id": "OP-BUYER-2",
      "label": "Second Buyer (Cybercrime Syndicate)",
      "keystrokes_analyzed": 4800,
      "sessions_analyzed": 8,
      "metrics": {
        "avg_wpm": 65,
        "wpm_std_dev": 4.5,
        "avg_dwell_time_ms": 82,
        "dwell_time_std_dev": 12,
        "avg_flight_time_ms": 120,
        "flight_time_std_dev": 18,
        "avg_digraph_latency_ms": 155,
        "key_hold_consistency": 0.82,
        "rhythm_regularity": 0.78,
        "error_rate_pct": 3.2,
        "backspace_frequency": 0.028,
        "correction_speed_ms": 145,
        "shift_hold_duration_ms": 88,
        "space_bar_duration_ms": 52,
        "pause_frequency_per_min": 3.5,
        "avg_pause_duration_ms": 900,
        "burst_typing_ratio": 0.72,
        "fatigue_slope": 0.0
      },
      "digraph_signature": {
        "th": 100, "he": 88, "in": 95, "er": 108, "an": 118
      },
      "emotional_inference": {
        "baseline_stress": null,
        "current_stress": 0.22,
        "anxiety_markers": 0.15,
        "confidence_in_typing": 0.82,
        "coaching_indicators": 0.05,
        "emotional_state": "experienced_operator",
        "detail": "Technically proficient operator. Low stress, low error rate, minimal coaching indicators. This buyer has experience with database systems -- likely a professional from a cybercrime syndicate rather than a casual buyer. The confident, efficient typing contrasts sharply with Buyer 1."
      }
    }
  ],
  "cross_operator_similarity_matrix": {
    "OP-DANIEL_vs_OP-BUYER-1": {"similarity": 0.10, "confidence": 0.97, "verdict": "DIFFERENT_PERSON", "key_differences": ["Coaching signature delta: 0.72", "Pause frequency delta: 12.2/min", "Rhythm delta: 0.50"]},
    "OP-DANIEL_vs_OP-BUYER-2": {"similarity": 0.35, "confidence": 0.88, "verdict": "DIFFERENT_PERSON", "key_differences": ["WPM delta: 7", "Digraph correlation: 0.62", "Flight time delta: 18ms"]},
    "OP-BUYER-1_vs_OP-BUYER-2": {"similarity": 0.08, "confidence": 0.98, "verdict": "DIFFERENT_PERSON", "key_differences": ["WPM delta: 23", "Coaching vs experienced", "Error rate delta: 6.6%"]}
  },
  "aggregate_insights": {
    "multi_operator_confirmed": true,
    "distinct_operators": 3,
    "detection_confidence": 0.97,
    "primary_evidence": "Three distinct typing profiles with very different skill levels: (1) Daniel - steady professional, (2) Buyer 1 - heavily coached novice, (3) Buyer 2 - experienced technical operator. The coaching signature in Buyer 1 is particularly valuable as evidence.",
    "psychological_insight": "The contrast between buyers is informative: Buyer 1 is likely a data broker who purchases access but lacks technical skills (hence heavy coaching), while Buyer 2 is from a technical cybercrime syndicate. Daniels zero-stress typing during 60 days of criminal activity confirms the professional criminal assessment. His typing was used as a reference baseline for the honeypot canary account that confirmed the selling operation."
  }
}'::jsonb WHERE case_id = 'CS-011';
