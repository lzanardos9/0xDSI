/*
  # Add Psychological Risk Assessment to Credential Selling Detection

  Adds a `psychological_assessment` JSONB column to credential_selling_cases that stores
  LLM-generated psychological risk analysis for each suspected credential seller.

  This integrates data from the existing psychological profiling engine (Big Five, Dark Triad,
  behavioral risk indicators, cross-platform patterns) to provide a holistic insider risk view.

  The assessment includes:
  - Psychological risk score (0-100)
  - Key personality risk factors (Dark Triad indicators, impulsivity, etc.)
  - Behavioral pattern correlations (financial stress, disgruntlement, lifestyle changes)
  - LLM-generated narrative explaining WHY this person is likely to sell credentials
  - Predictive risk factors (what might push them further)
  - Recommended interventions

  1. Modified Tables
    - `credential_selling_cases` - Added `psychological_assessment` (jsonb)

  2. No security changes - existing RLS policies cover the new column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'credential_selling_cases' AND column_name = 'psychological_assessment'
  ) THEN
    ALTER TABLE credential_selling_cases ADD COLUMN psychological_assessment jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Now populate psychological assessments for each case
-- Case 1: Vanessa - confirmed seller, financial motivation
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 82,
  "risk_label": "High Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 55,
      "conscientiousness": 32,
      "extraversion": 68,
      "agreeableness": 28,
      "neuroticism": 72
    },
    "dark_triad": {
      "narcissism": 45,
      "machiavellianism": 78,
      "psychopathy": 38
    },
    "risk_indicators": {
      "insider_threat": 85,
      "manipulation_tendency": 72,
      "deception_likelihood": 80,
      "impulsivity": 58,
      "financial_desperation": 88
    }
  },
  "behavioral_signals": [
    {"signal": "Financial Stress Indicators", "severity": "critical", "detail": "Cross-platform analysis reveals escalating financial complaints in personal communications. Mentions of debt, late payments, and loan applications detected across 3 platforms over 45 days.", "confidence": 0.91},
    {"signal": "Moral Disengagement Pattern", "severity": "high", "detail": "Progressive rationalization language detected: went from I would never to everyone does it to the bank can afford it over 60 days. Classic moral disengagement trajectory.", "confidence": 0.85},
    {"signal": "Authority Resentment", "severity": "medium", "detail": "Increasing negative sentiment toward employer and financial institutions. Linguistic analysis shows growing cynicism and blame externalization.", "confidence": 0.78},
    {"signal": "Risk Tolerance Escalation", "severity": "high", "detail": "Behavioral patterns show increasing comfort with rule-bending. Started with small policy violations, escalated to data sharing, then credential selling.", "confidence": 0.82}
  ],
  "llm_narrative": "Vanessa presents a textbook financially-motivated insider threat profile. Her psychological assessment reveals high Machiavellianism (78/100) combined with low conscientiousness (32/100), indicating a pragmatic, rules-flexible personality willing to exploit opportunities for personal gain. The critical factor is financial desperation (88/100) -- cross-platform behavioral analysis detected escalating financial stress signals over the past 60 days, including discussions about unpaid debts and failed loan applications. Her moral disengagement trajectory is well-documented: linguistic analysis tracked her progression from moral objection to rationalization to active participation over approximately 8 weeks. The high deception likelihood score (80/100) aligns with her ability to maintain normal banking behavior while simultaneously operating a dark web credential selling operation. Her neuroticism score (72/100) suggests ongoing anxiety about detection, which paradoxically makes her more careful but also more likely to escalate if she feels cornered.",
  "predictive_factors": [
    {"factor": "Escalation Risk", "level": "high", "detail": "Likely to recruit others into selling if not intercepted. Already showing recruitment-adjacent behavior."},
    {"factor": "Detection Avoidance", "level": "medium", "detail": "May attempt to destroy evidence or create alibi if she suspects investigation."},
    {"factor": "Cooperation Potential", "level": "medium", "detail": "Financial motivation suggests she may cooperate if offered reduced consequences in exchange for network intelligence."}
  ],
  "recommended_interventions": [
    "Immediate credential revocation and account freeze",
    "Discreet financial wellness outreach (pre-termination intelligence gathering)",
    "Law enforcement coordination for dark web seller identification",
    "Psychological interview by trained insider threat analyst",
    "Monitor for evidence destruction attempts"
  ],
  "cross_platform_patterns": [
    {"pattern": "After-Hours Dark Web Activity", "source": "network_logs", "correlation": 0.92},
    {"pattern": "Declining Work Performance", "source": "hr_metrics", "correlation": 0.75},
    {"pattern": "Social Media Lifestyle Inconsistency", "source": "osint", "correlation": 0.68}
  ],
  "confidence": 0.89,
  "assessed_at": "2024-12-14T10:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-001';

-- Case 2: Ricardo - corporate API selling, technical sophistication
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 74,
  "risk_label": "Elevated Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 82,
      "conscientiousness": 45,
      "extraversion": 38,
      "agreeableness": 35,
      "neuroticism": 55
    },
    "dark_triad": {
      "narcissism": 62,
      "machiavellianism": 71,
      "psychopathy": 42
    },
    "risk_indicators": {
      "insider_threat": 78,
      "manipulation_tendency": 55,
      "deception_likelihood": 72,
      "impulsivity": 35,
      "entitlement_score": 82
    }
  },
  "behavioral_signals": [
    {"signal": "Technical Entitlement Complex", "severity": "high", "detail": "Communication analysis reveals strong I built this, I deserve more narrative. Ricardo frequently references his technical contributions as undervalued. This entitlement pattern is a key predictor for IP theft and credential selling.", "confidence": 0.88},
    {"signal": "Compensation Grievance", "severity": "high", "detail": "Repeated salary complaints detected across Slack DMs, email, and meeting transcripts. Compared his compensation unfavorably to market rates 14 times in 30 days.", "confidence": 0.92},
    {"signal": "Low Organizational Loyalty", "severity": "medium", "detail": "Declining engagement metrics: 40% fewer Slack messages, stopped attending optional meetings, reduced code review participation. Classic pre-departure indicators.", "confidence": 0.79},
    {"signal": "Calculated Risk-Taking", "severity": "high", "detail": "Low impulsivity (35) + high Machiavellianism (71) = careful, planned exploitation rather than impulsive theft. This makes his selling operation more sophisticated and harder to detect.", "confidence": 0.85}
  ],
  "llm_narrative": "Ricardo represents the technically sophisticated insider threat -- an employee who believes his skills entitle him to greater compensation and is willing to monetize his access when the organization fails to meet his expectations. His high openness (82/100) and technical competence, combined with low agreeableness (35/100) and elevated narcissism (62/100), create a profile that views credential selling not as a crime but as market correction. The compensation grievance signal is the primary trigger: 14 documented complaints about salary in 30 days suggests this has been building for months. His low impulsivity (35/100) is noteworthy -- this is not an impulsive act but a calculated decision, which explains the sophisticated operational security (Telegram channels, Monero payments, credential rotation). His Machiavellianism score (71/100) indicates comfort with strategic deception and long-term planning.",
  "predictive_factors": [
    {"factor": "Data Exfiltration Expansion", "level": "high", "detail": "Likely already exfiltrating source code and documentation in addition to API credentials."},
    {"factor": "Competitive Intelligence Selling", "level": "medium", "detail": "May escalate to selling proprietary information to competitors."},
    {"factor": "Retention Intervention Window", "level": "low", "detail": "If caught early, compensation adjustment + role recognition could potentially redirect. However, damage may already be irreversible."}
  ],
  "recommended_interventions": [
    "Immediate API key revocation for all keys generated by Ricardo",
    "Forensic analysis of all data accessed in past 90 days",
    "Technical interview disguised as architecture review to assess knowledge leak",
    "Parallel HR investigation into compensation grievance pattern",
    "Monitor personal devices for exfiltrated data"
  ],
  "cross_platform_patterns": [
    {"pattern": "Compensation Complaint Escalation", "source": "slack,email,meetings", "correlation": 0.92},
    {"pattern": "Declining Code Contribution", "source": "gitlab_metrics", "correlation": 0.78},
    {"pattern": "After-Hours API Key Generation", "source": "audit_logs", "correlation": 0.95}
  ],
  "confidence": 0.84,
  "assessed_at": "2024-12-12T14:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-002';

-- Case 3: Camila - mule recruiter, social manipulation
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 71,
  "risk_label": "Elevated Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 48,
      "conscientiousness": 38,
      "extraversion": 78,
      "agreeableness": 62,
      "neuroticism": 65
    },
    "dark_triad": {
      "narcissism": 35,
      "machiavellianism": 55,
      "psychopathy": 22
    },
    "risk_indicators": {
      "insider_threat": 65,
      "manipulation_tendency": 42,
      "deception_likelihood": 58,
      "impulsivity": 72,
      "susceptibility_to_recruitment": 88
    }
  },
  "behavioral_signals": [
    {"signal": "Recruitment Susceptibility", "severity": "critical", "detail": "High extraversion (78) + financial vulnerability + high impulsivity (72) = ideal recruitment target for criminal networks. Camila was likely recruited rather than self-initiating.", "confidence": 0.90},
    {"signal": "Social Influence Vulnerability", "severity": "high", "detail": "High agreeableness (62) combined with financial pressure makes her susceptible to social proof arguments (everyone is doing it, its easy money).", "confidence": 0.85},
    {"signal": "Financial Naivety", "severity": "medium", "detail": "Communication patterns suggest poor understanding of legal consequences. Uses language indicating she views this as a grey area rather than criminal activity.", "confidence": 0.78},
    {"signal": "Escalating Involvement", "severity": "high", "detail": "Started as passive account lender, now actively showing new recruits how the system works. Transition from recruited to recruiter indicates deepening criminal commitment.", "confidence": 0.88}
  ],
  "llm_narrative": "Camilas profile is distinct from the self-motivated seller -- she represents the recruited insider. Her high extraversion (78/100) and agreeableness (62/100) made her an ideal target for the Renda Extra Facil WhatsApp recruitment group. The initial pitch likely leveraged social proof and her financial vulnerability. Her relatively low Machiavellianism (55/100) and psychopathy (22/100) suggest she did not conceive this scheme but was drawn into it. However, her transition from passive participant to active recruiter (now demonstrating the process to new sellers) indicates progressive criminal socialization. Her high impulsivity (72/100) explains the speed of her involvement -- she likely did not carefully consider consequences before agreeing. The key intervention insight is that her low psychopathy score suggests she may be more responsive to understanding the human impact of fraud on victims, making rehabilitation-oriented approaches potentially effective alongside legal consequences.",
  "predictive_factors": [
    {"factor": "Recruitment Expansion", "level": "high", "detail": "Actively recruiting others, which amplifies organizational exposure exponentially."},
    {"factor": "Cooperative Witness Potential", "level": "high", "detail": "Psychological profile suggests high cooperation likelihood if shown victim impact and offered reduced consequences."},
    {"factor": "Recidivism Risk", "level": "medium", "detail": "Without addressing underlying financial vulnerability, she may return to similar schemes even after intervention."}
  ],
  "recommended_interventions": [
    "Controlled arrest with immediate interview (high cooperation probability)",
    "Present victim impact statements during interview to leverage agreeableness",
    "Offer cooperation deal for intelligence on recruitment network leadership",
    "Financial counseling referral as part of rehabilitation",
    "Monitor social circle for additional recruited sellers"
  ],
  "cross_platform_patterns": [
    {"pattern": "WhatsApp Group Participation Spike", "source": "device_analysis", "correlation": 0.95},
    {"pattern": "Lifestyle Spending Increase", "source": "transaction_analysis", "correlation": 0.82},
    {"pattern": "Social Media Posts About Easy Money", "source": "osint", "correlation": 0.72}
  ],
  "confidence": 0.86,
  "assessed_at": "2024-12-10T08:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-003';

-- Case 4: Lucas (VPN seller) - moderate psychological risk
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 68,
  "risk_label": "Moderate-High Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 72,
      "conscientiousness": 42,
      "extraversion": 45,
      "agreeableness": 38,
      "neuroticism": 62
    },
    "dark_triad": {
      "narcissism": 48,
      "machiavellianism": 65,
      "psychopathy": 35
    },
    "risk_indicators": {
      "insider_threat": 72,
      "manipulation_tendency": 48,
      "deception_likelihood": 65,
      "impulsivity": 55,
      "organizational_disillusionment": 78
    }
  },
  "behavioral_signals": [
    {"signal": "Organizational Disillusionment", "severity": "high", "detail": "Strong negative sentiment toward company culture and management detected across email and Slack. Phrases like this place doesnt deserve loyalty appear 6 times in 30 days.", "confidence": 0.88},
    {"signal": "IT Knowledge Weaponization", "severity": "high", "detail": "As IT staff, Lucas understands exactly what access VPN + AD credentials provide. His technical knowledge makes the selling operation more dangerous than average.", "confidence": 0.85},
    {"signal": "Rationalization Through Anonymity", "severity": "medium", "detail": "Communication patterns suggest Lucas believes crypto payments and Telegram channels provide sufficient anonymity. Overconfidence in operational security.", "confidence": 0.72}
  ],
  "llm_narrative": "Lucas represents the disillusioned IT insider -- technically capable, organizationally resentful, and willing to monetize access he views as underprotected. His organizational disillusionment score (78/100) is the primary driver, reinforced by moderate Machiavellianism (65/100) and low agreeableness (38/100). He likely rationalizes the selling as the companys fault for poor security practices and inadequate compensation.",
  "predictive_factors": [
    {"factor": "Access Escalation", "level": "high", "detail": "May attempt to escalate privileges before access is revoked."},
    {"factor": "Evidence Destruction", "level": "medium", "detail": "IT knowledge means he knows where logs are stored and may attempt cleanup."}
  ],
  "recommended_interventions": [
    "Immediate credential revocation with zero advance warning",
    "Preserve all access logs before notification",
    "Forensic imaging of workstation and personal devices",
    "Interview with focus on organizational grievances (may reveal additional compromised employees)"
  ],
  "cross_platform_patterns": [
    {"pattern": "Negative Sentiment Escalation", "source": "slack,email", "correlation": 0.88},
    {"pattern": "After-Hours VPN Config Access", "source": "audit_logs", "correlation": 0.94}
  ],
  "confidence": 0.81,
  "assessed_at": "2024-12-13T09:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-004';

-- Case 5: Adriana - bank employee, high psychopathy
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 91,
  "risk_label": "Critical Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 45,
      "conscientiousness": 72,
      "extraversion": 55,
      "agreeableness": 22,
      "neuroticism": 35
    },
    "dark_triad": {
      "narcissism": 72,
      "machiavellianism": 88,
      "psychopathy": 65
    },
    "risk_indicators": {
      "insider_threat": 92,
      "manipulation_tendency": 82,
      "deception_likelihood": 90,
      "impulsivity": 28,
      "cold_calculation": 92
    }
  },
  "behavioral_signals": [
    {"signal": "Systematic Exploitation Pattern", "severity": "critical", "detail": "High conscientiousness (72) + high Machiavellianism (88) = methodical, systematic exploitation. Adriana ran her credential selling like a business -- scheduled extraction during lunch, consistent volume, repeat customers.", "confidence": 0.95},
    {"signal": "Low Empathy for Victims", "severity": "critical", "detail": "Low agreeableness (22) + elevated psychopathy (65) = minimal concern for the 200+ customers whose credentials she sold. No signs of guilt or hesitation in communication patterns.", "confidence": 0.90},
    {"signal": "Dual-Life Maintenance", "severity": "high", "detail": "Maintained perfect work performance ratings while operating dark web selling operation. High deception likelihood (90/100) enabled seamless dual-life management.", "confidence": 0.92},
    {"signal": "Financial Greed vs Need", "severity": "high", "detail": "Unlike Vanessa (financial desperation), Adrianas financial situation shows no distress. This is greed-motivated, not need-motivated -- a more dangerous and persistent threat profile.", "confidence": 0.88}
  ],
  "llm_narrative": "Adriana is the most dangerous profile in this case set -- a cold, calculated insider driven by greed rather than desperation. Her extremely high Machiavellianism (88/100) combined with elevated psychopathy (65/100) and low agreeableness (22/100) create a profile with near-zero empathy for victims and high tolerance for sustained deception. Unlike financially desperate sellers, Adrianas motivation is purely profit-maximizing -- she had no financial pressures, adequate salary, and stable employment. Her high conscientiousness (72/100) is the twist: she applied the same organizational skills to her criminal operation that made her a good employee. The lunch-hour exploitation pattern was systematic, scheduled, and volume-optimized. The low neuroticism (35/100) indicates she experienced minimal anxiety about detection, which allowed the operation to run for weeks. This profile has the highest recidivism risk: without genuine psychological intervention, she would likely find new exploitation opportunities in any trust-based role.",
  "predictive_factors": [
    {"factor": "Recidivism", "level": "critical", "detail": "Greed-motivated with low guilt -- very high likelihood of reoffending in any future role with access."},
    {"factor": "Cooperation", "level": "low", "detail": "Low agreeableness and high Machiavellianism suggest she will attempt to negotiate rather than cooperate genuinely."},
    {"factor": "Network Leadership", "level": "medium", "detail": "May have been coordinating with dark web marketplace operators beyond what is currently known."}
  ],
  "recommended_interventions": [
    "Criminal prosecution recommended (greed-motivated, large-scale, no mitigating factors)",
    "Do NOT offer cooperation deal without substantial evidence of network intelligence",
    "Flag for financial industry blacklist",
    "Psychological evaluation for any future employment requiring trust-based access"
  ],
  "cross_platform_patterns": [
    {"pattern": "Perfect Performance Mask", "source": "hr_metrics", "correlation": 0.95},
    {"pattern": "Lunch Hour Data Anomaly", "source": "system_logs", "correlation": 0.98},
    {"pattern": "Dark Web Forum Activity Timing", "source": "network_logs", "correlation": 0.90}
  ],
  "confidence": 0.94,
  "assessed_at": "2024-12-04T16:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-005';

-- Case 6: Aline - monitoring, low confidence
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 35,
  "risk_label": "Low-Moderate Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 58,
      "conscientiousness": 55,
      "extraversion": 62,
      "agreeableness": 65,
      "neuroticism": 48
    },
    "dark_triad": {
      "narcissism": 28,
      "machiavellianism": 32,
      "psychopathy": 18
    },
    "risk_indicators": {
      "insider_threat": 30,
      "manipulation_tendency": 25,
      "deception_likelihood": 35,
      "impulsivity": 52,
      "financial_desperation": 42
    }
  },
  "behavioral_signals": [
    {"signal": "Mild Financial Pressure", "severity": "low", "detail": "Some indicators of financial strain but within normal population range. Not sufficient to predict credential selling on its own.", "confidence": 0.55},
    {"signal": "Behavioral Anomaly Inconclusive", "severity": "low", "detail": "The off-hours second operator fingerprint could have multiple explanations including shared device with family member, VPN artifact, or legitimate late-night usage.", "confidence": 0.45}
  ],
  "llm_narrative": "Alines psychological profile does not strongly support the credential selling hypothesis. Her low Dark Triad scores (Machiavellianism 32, psychopathy 18) and high agreeableness (65) are not consistent with willful credential selling. The behavioral anomaly detected could have innocent explanations. However, the incoming payment before the anomalous session is worth monitoring. Current assessment: more likely a victim of credential theft than a willing seller. Continue monitoring with focus on distinguishing theft from selling indicators.",
  "predictive_factors": [
    {"factor": "False Positive Likelihood", "level": "medium", "detail": "Psychological profile suggests this may be a false positive. 60% probability of innocent explanation."}
  ],
  "recommended_interventions": [
    "Continue passive monitoring without alerting the account holder",
    "Deploy enhanced session fingerprinting to differentiate operators",
    "If selling confirmed, psychological profile suggests high cooperation and low recidivism"
  ],
  "cross_platform_patterns": [],
  "confidence": 0.52,
  "assessed_at": "2024-12-14T08:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-006';

-- Case 7: Marcelo - corporate email seller
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 76,
  "risk_label": "High Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 68,
      "conscientiousness": 48,
      "extraversion": 42,
      "agreeableness": 30,
      "neuroticism": 58
    },
    "dark_triad": {
      "narcissism": 55,
      "machiavellianism": 72,
      "psychopathy": 40
    },
    "risk_indicators": {
      "insider_threat": 80,
      "manipulation_tendency": 62,
      "deception_likelihood": 75,
      "impulsivity": 42,
      "revenge_motivation": 72
    }
  },
  "behavioral_signals": [
    {"signal": "Revenge Motivation Detected", "severity": "high", "detail": "Analysis of communication patterns reveals strong resentment following a denied promotion 3 months ago. Revenge motivation score 72/100 -- selling credentials may be retaliatory.", "confidence": 0.85},
    {"signal": "Strategic Information Gathering", "severity": "high", "detail": "Accessing architecture documentation and source code beyond role requirements. Building a comprehensive package for sale.", "confidence": 0.82},
    {"signal": "Departure Preparation Signals", "severity": "medium", "detail": "Resume updates detected on LinkedIn. Likely planning to leave and selling credentials as a final act.", "confidence": 0.70}
  ],
  "llm_narrative": "Marcelo is a revenge-motivated insider threat. The denied promotion 3 months ago was the trigger event, and his subsequent behavior shows classic retaliatory escalation. His Machiavellianism (72/100) enables careful planning of the selling operation, while his revenge motivation (72/100) provides the emotional fuel. The weekly credential refresh promise in his dark web listing suggests he plans to maintain the operation for as long as he remains employed -- maximizing both financial return and organizational damage. His departure preparation signals suggest a timeline: he will likely sell as much access as possible before leaving, then walk away.",
  "predictive_factors": [
    {"factor": "Exit Timing", "level": "high", "detail": "Likely to escalate credential selling velocity as departure approaches."},
    {"factor": "Scorched Earth Risk", "level": "medium", "detail": "May attempt data destruction or sabotage as a parting action."}
  ],
  "recommended_interventions": [
    "Immediate SSO credential revocation",
    "Forensic preservation of all accessed systems",
    "Interview with focus on denied promotion grievance",
    "Monitor for data destruction attempts"
  ],
  "cross_platform_patterns": [
    {"pattern": "Post-Promotion-Denial Sentiment Shift", "source": "email,slack", "correlation": 0.90},
    {"pattern": "LinkedIn Activity Spike", "source": "osint", "correlation": 0.78}
  ],
  "confidence": 0.83,
  "assessed_at": "2024-12-11T11:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-007';

-- Case 9: API integration - N/A for psychological assessment (it is a system, not person)
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 0,
  "risk_label": "Not Applicable - System Entity",
  "personality_profile": {},
  "behavioral_signals": [
    {"signal": "Non-Human Entity", "severity": "info", "detail": "This case involves an API integration, not a human actor. Psychological profiling is not applicable. The investigation should focus on the human who manages this API credential.", "confidence": 1.0}
  ],
  "llm_narrative": "Psychological assessment not applicable for API integration entities. The investigation should identify the human administrator or developer responsible for these API credentials and assess their psychological risk profile. Recommend cross-referencing with employee access logs to identify who had access to generate, rotate, or distribute the API keys that appeared on the dark web.",
  "predictive_factors": [],
  "recommended_interventions": ["Identify human administrator and perform psychological assessment on that individual"],
  "cross_platform_patterns": [],
  "confidence": 1.0,
  "assessed_at": "2024-12-08T10:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-009';

-- Case 11: Daniel (contractor) - highest risk profile
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 95,
  "risk_label": "Critical Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 55,
      "conscientiousness": 65,
      "extraversion": 42,
      "agreeableness": 18,
      "neuroticism": 28
    },
    "dark_triad": {
      "narcissism": 78,
      "machiavellianism": 92,
      "psychopathy": 72
    },
    "risk_indicators": {
      "insider_threat": 95,
      "manipulation_tendency": 85,
      "deception_likelihood": 92,
      "impulsivity": 22,
      "cold_calculation": 95,
      "profit_maximization": 98
    }
  },
  "behavioral_signals": [
    {"signal": "Professional Criminal Behavior", "severity": "critical", "detail": "Extremely low impulsivity (22) + highest Machiavellianism (92) = professional-grade criminal operation. Multiple buyers, pricing tiers, credential maintenance service. This is not a one-off -- it is a business.", "confidence": 0.96},
    {"signal": "Zero Loyalty Indicators", "severity": "critical", "detail": "As a contractor, Daniel had no organizational loyalty bonds. Agreeableness score of 18/100 is the lowest in all tracked profiles. Combined with contractor transience, exploitation was predictable.", "confidence": 0.93},
    {"signal": "Sophisticated Operational Security", "severity": "high", "detail": "Multi-marketplace distribution, cryptocurrency payments, credential rotation schedule, and persistence mechanisms (secondary admin account) indicate professional training or experience in cybercrime.", "confidence": 0.90},
    {"signal": "Scale Maximization", "severity": "critical", "detail": "Sold to TWO separate buyers, maximizing both revenue and damage. 570GB exfiltrated. Profit-maximization score 98/100 -- he extracted every possible dollar from his access.", "confidence": 0.95}
  ],
  "llm_narrative": "Daniel represents the apex predator of insider threats -- a professional criminal who obtained a contractor role specifically (or opportunistically) to monetize access. His Dark Triad profile is the most extreme in this case set: Machiavellianism 92/100, narcissism 78/100, psychopathy 72/100. This is not an employee who went bad; this is a criminal who got a job. His contractor status provided both access and psychological distance from the organization. The scale of his operation ($25,000 per buyer, 570GB exfiltrated, persistence mechanisms, credential maintenance) indicates either prior experience in credential selling or professional criminal mentorship. His low neuroticism (28/100) means he operated without anxiety, and his low impulsivity (22/100) means every action was calculated. The secondary admin account he created shows forward planning for persistent access even if his primary credentials were discovered. This profile should inform all future contractor vetting processes.",
  "predictive_factors": [
    {"factor": "Repeat Offender", "level": "critical", "detail": "Near-certain to attempt similar operations in future roles. Must be flagged in industry databases."},
    {"factor": "Criminal Network", "level": "high", "detail": "Likely has established relationships with data brokers and cybercrime syndicates."},
    {"factor": "Counter-Investigation", "level": "medium", "detail": "May have prepared dead-man switch or contingency plans for if caught."}
  ],
  "recommended_interventions": [
    "Criminal prosecution with maximum charges (scale and sophistication justify aggressive approach)",
    "Industry-wide alert via CISO community channels",
    "Deep forensic analysis of all systems he accessed over entire contract period",
    "Contractor vetting process overhaul including psychological screening",
    "Dark web monitoring for any remaining access he may have sold but not yet been used"
  ],
  "cross_platform_patterns": [
    {"pattern": "Credential Hoarding Pre-Termination", "source": "audit_logs", "correlation": 0.97},
    {"pattern": "Off-Hours Production Database Access", "source": "db_logs", "correlation": 0.96},
    {"pattern": "Multi-Platform Listing Strategy", "source": "dark_web_monitoring", "correlation": 0.94}
  ],
  "confidence": 0.96,
  "assessed_at": "2024-12-01T12:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-011';

-- Case 12: Rodrigo - very early monitoring, minimal data
UPDATE credential_selling_cases SET psychological_assessment = '{
  "risk_score": 22,
  "risk_label": "Low Insider Risk",
  "personality_profile": {
    "big_five": {
      "openness": 52,
      "conscientiousness": 62,
      "extraversion": 55,
      "agreeableness": 68,
      "neuroticism": 45
    },
    "dark_triad": {
      "narcissism": 22,
      "machiavellianism": 25,
      "psychopathy": 12
    },
    "risk_indicators": {
      "insider_threat": 18,
      "manipulation_tendency": 20,
      "deception_likelihood": 22,
      "impulsivity": 45,
      "financial_desperation": 35
    }
  },
  "behavioral_signals": [
    {"signal": "Low Risk Profile", "severity": "low", "detail": "Rodrigos psychological profile is well within normal range. Low Dark Triad, high agreeableness, adequate conscientiousness. The social engineering call he received is more consistent with victimization than complicity.", "confidence": 0.75}
  ],
  "llm_narrative": "Rodrigos psychological profile provides minimal support for the credential selling hypothesis. His low Dark Triad scores, high agreeableness (68/100), and low insider threat indicators (18/100) strongly suggest he is more likely a social engineering victim than a willing participant. The small incoming payment before the spoofed call could be coincidental. Recommendation: reclassify as social engineering victim investigation unless new evidence emerges.",
  "predictive_factors": [
    {"factor": "Victim Rather Than Seller", "level": "high", "detail": "85% probability this is genuine social engineering victimization, not complicit credential selling."}
  ],
  "recommended_interventions": [
    "Treat as potential victim rather than suspect",
    "Customer outreach with fraud awareness education",
    "Continue monitoring at lowest priority"
  ],
  "cross_platform_patterns": [],
  "confidence": 0.72,
  "assessed_at": "2024-12-15T06:00:00Z",
  "model_version": "psych-risk-v3.2"
}'::jsonb WHERE case_id = 'CS-012';
