/*
  # Insert Showcase Correlation Rules - Batch 1: ML Anomaly, ML Classification, Vector Similarity

  Adds 75 showcase rules (25 per type) with detailed pseudo_code demonstrating
  sophisticated detection pipelines including ML model invocations, vector
  embedding searches, and advanced feature engineering.
*/

DO $body$
DECLARE
  i int;
  pc text;
  rname text;
  rdesc text;
  rcat text;
  rsub text;
  rsev text;
  rconf int;
  rcomp int;
  sevs text[] := ARRAY['critical','high','high','medium','medium'];
  cats text[] := ARRAY['APT & State-Sponsored','Data Exfiltration','Credential Attacks','Lateral Movement','Ransomware','Network Anomaly','Insider Threat','Defense Evasion','Cloud Security','Malware Analysis'];
  auths text[] := ARRAY['ML Pipeline','Detection Engineering','Threat Intel Team','Red Team','SOC Automation'];

  -- ML Anomaly model names
  ml_models text[] := ARRAY['Isolation Forest v3.2','Deep Autoencoder LSTM v2.4','One-Class SVM (RBF Kernel)','Local Outlier Factor (LOF)','Variational Autoencoder v1.8','DBSCAN Density Estimator','Gaussian Mixture Model v2.1','Extended Isolation Forest v4.0','Kernel PCA Anomaly v1.3','Robust Random Cut Forest'];
  -- ML Anomaly feature sets
  ml_feats text[] := ARRAY[
    'bytes_out_zscore, session_duration, unique_dests, hour_of_day, geo_distance',
    'process_count, cpu_delta, memory_delta, disk_io_ratio, thread_spawn_rate',
    'login_frequency, auth_failures, privilege_changes, session_count, mfa_skips',
    'dns_query_entropy, nxdomain_ratio, query_volume, ttl_variance, rare_tld_count',
    'file_access_rate, write_volume, extension_diversity, path_depth, archive_ratio'
  ];
  -- ML Anomaly thresholds
  ml_thresh text[] := ARRAY['0.87','0.92','0.85','0.78','0.91'];

  -- ML Classification model names
  clf_models text[] := ARRAY['XGBoost Ensemble v5.1','Random Forest (500 trees)','Deep Neural Net (4-layer)','LightGBM v3.3','CatBoost Gradient v2.0','Logistic Regression + L2','Support Vector Classifier','AdaBoost Meta-Learner','TabNet Deep Tabular v1.2','Multi-Layer Perceptron v3.0'];
  clf_classes text[] := ARRAY[
    'benign, suspicious, malicious, apt_related, insider_threat',
    'legitimate, credential_abuse, brute_force, spray_attack, token_theft',
    'clean_url, phishing, malware_delivery, c2_beacon, data_exfil',
    'normal_process, fileless_attack, living_off_land, packed_binary, injection',
    'standard_query, sqli_attempt, xss_probe, ssrf_attack, path_traversal'
  ];

  -- Vector embedding models
  vec_models text[] := ARRAY['security-codebert-768d','threat-sentence-bert-512d','malware-bytepair-256d','ttp-doc2vec-384d','log-anomaly-bert-1024d'];
  vec_indexes text[] := ARRAY['apt_ttp_embeddings_v4','malware_family_clusters','attack_chain_sequences','lateral_movement_patterns','exfiltration_signatures'];
  vec_thresh text[] := ARRAY['0.89','0.91','0.86','0.88','0.93'];

BEGIN

  -- ═══════════════════════════════════════════
  -- ML ANOMALY DETECTION RULES (25)
  -- ═══════════════════════════════════════════
  FOR i IN 1..25 LOOP
    rcat := cats[((i-1) % 10) + 1];
    rsev := sevs[((i-1) % 5) + 1];
    rconf := 78 + (i % 20);
    rcomp := 6 + (i % 4);

    pc := CASE (i-1) % 5
      WHEN 0 THEN format(E'# ML Anomaly Detection Pipeline\n# Model: %s | Training: 30d rolling | Contamination: 0.01\n\nPIPELINE anomaly_detect(stream: network.sessions) {\n  FEATURES := EXTRACT(\n    %s,\n    historical_baseline_ratio = CURRENT / AVG(OVER 30d BY entity)\n  )\n  ANOMALY_SCORE := MODEL("%s").predict(FEATURES)\n\n  WHEN ANOMALY_SCORE > %s\n    AND entity.risk_score > 65\n    AND NOT IN WHITELIST("approved_transfers")\n  THEN\n    ALERT(severity=DYNAMIC(ANOMALY_SCORE))\n    INVOKE secondary_model("transfer_intent_classifier")\n    ENRICH(geo_ip, threat_intel, dlp_context)\n    IF secondary_model.confidence > 0.8 THEN ESCALATE(SOC_T2)\n}',
        ml_models[((i-1)%10)+1], ml_feats[((i-1)%5)+1], ml_models[((i-1)%10)+1], ml_thresh[((i-1)%5)+1])
      WHEN 1 THEN format(E'# Reconstruction Error Anomaly Detection\n# Model: %s | Latent Dim: 32 | Reconstruction Loss: MSE\n\nPIPELINE reconstruction_anomaly(stream: endpoint.processes) {\n  SEQUENCE := WINDOW(events, 10 minutes, SLIDE 30 seconds)\n  ENCODED := MODEL("%s").encode(SEQUENCE)\n  RECONSTRUCTED := MODEL("%s").decode(ENCODED)\n  RECON_ERROR := MSE(SEQUENCE, RECONSTRUCTED)\n  MAHALANOBIS_DIST := MAHALANOBIS(ENCODED, training_distribution)\n\n  WHEN RECON_ERROR > PERCENTILE(history, 0.99)\n    AND MAHALANOBIS_DIST > 3.5\n    AND SEQUENCE.contains_sensitive_ops = true\n  THEN\n    ALERT("Process Sequence Reconstruction Anomaly")\n    ATTACH(latent_space_visualization, anomaly_heatmap)\n    QUARANTINE(process_tree)\n}',
        ml_models[((i-1)%10)+1], ml_models[((i-1)%10)+1], ml_models[((i-1)%10)+1])
      WHEN 2 THEN format(E'# Density-Based Anomaly Detection\n# Model: %s | Neighbors: 20 | Metric: Mahalanobis\n\nPIPELINE density_anomaly(stream: auth.events) {\n  FEATURES := EXTRACT(\n    %s,\n    temporal_density = COUNT(OVER 5m BY user) / BASELINE.avg_density\n  )\n  LOF_SCORE := MODEL("%s").score(FEATURES, k=20)\n  CLUSTER_DIST := MIN_DISTANCE_TO_CENTROID(FEATURES)\n\n  WHEN LOF_SCORE > 2.5\n    AND CLUSTER_DIST > THRESHOLD_ADAPTIVE(user.history)\n    AND event.geo_location NOT IN user.known_locations\n  THEN\n    ALERT("Density Anomaly: Isolated Authentication Pattern")\n    CORRELATE(vpn_logs, badge_access, hr_travel_calendar)\n    RISK_SCORE_UPDATE(user, +25)\n}',
        ml_models[((i-1)%10)+1], ml_feats[((i-1)%5)+1], ml_models[((i-1)%10)+1])
      WHEN 3 THEN format(E'# Time-Series Decomposition Anomaly\n# Model: %s | Decomposition: STL + Prophet\n\nPIPELINE timeseries_anomaly(stream: network.flows) {\n  SERIES := AGGREGATE(bytes_total, 1m intervals, OVER 24h)\n  DECOMPOSED := STL_DECOMPOSE(SERIES, period=1440)\n  RESIDUAL := DECOMPOSED.residual\n  FORECAST := PROPHET_PREDICT(SERIES, horizon=60m)\n\n  DEVIATION := ABS(ACTUAL - FORECAST.yhat) / FORECAST.yhat_std\n\n  WHEN DEVIATION > 4.0\n    AND RESIDUAL.current > PERCENTILE(RESIDUAL.history, 0.995)\n    AND TREND.slope_change > 200%%\n  THEN\n    ALERT("Time-Series Break: Network Volume Anomaly")\n    ATTACH(decomposition_chart, forecast_vs_actual)\n    INVESTIGATE(top_talkers, protocol_distribution)\n}',
        ml_models[((i-1)%10)+1])
      ELSE format(E'# Variational Inference Anomaly Detection\n# Model: %s | Latent: 64d | KL Weight: 0.5\n\nPIPELINE vae_anomaly(stream: dns.queries) {\n  FEATURES := EXTRACT(\n    %s,\n    domain_embedding = CHAR_CNN(query.domain),\n    request_context = [src_ip, timestamp, resolver, record_type]\n  )\n  ELBO := MODEL("%s").evidence_lower_bound(FEATURES)\n  KL_DIV := MODEL("%s").kl_divergence(FEATURES)\n  POSTERIOR := MODEL("%s").posterior_sample(FEATURES, n=100)\n\n  WHEN ELBO < PERCENTILE(calibration_set, 0.01)\n    AND KL_DIV > 3.0 * BASELINE.avg_kl\n    AND POSTERIOR.variance > uncertainty_threshold\n  THEN\n    ALERT("DNS Query Distribution Anomaly")\n    DGA_CHECK := INVOKE("dga_classifier", query.domain)\n    IF DGA_CHECK.probability > 0.7 THEN BLOCK(domain)\n    ENRICH(passive_dns, whois_history)\n}',
        ml_models[((i-1)%10)+1], ml_feats[((i-1)%5)+1], ml_models[((i-1)%10)+1], ml_models[((i-1)%10)+1], ml_models[((i-1)%10)+1])
    END;

    rname := 'ML-AD-' || lpad(i::text, 3, '0') || ' ' || ml_models[((i-1)%10)+1] || ' ' || rcat || ' Anomaly Detection';
    rdesc := 'Non-deterministic ML anomaly detection rule using ' || ml_models[((i-1)%10)+1] || ' model trained on 30-day rolling window. Monitors ' || ml_feats[((i-1)%5)+1] || ' features with adaptive thresholds. Triggers secondary model validation on positive detection.';

    INSERT INTO correlation_rules_library (rule_name, rule_description, category, subcategory, severity, confidence_score, mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author, rule_type, complexity_score, trigger_count, false_positive_rate, created_at, updated_at)
    VALUES (
      rname, rdesc, rcat, 'ML Anomaly Detection', rsev, rconf,
      ARRAY['Collection','Exfiltration','Defense Evasion'],
      ARRAY['T1048','T1071','T1041'],
      ARRAY['EDR Telemetry','Network Flow','DNS Logs','UEBA'],
      jsonb_build_object('pseudo_code', pc, 'model_name', ml_models[((i-1)%10)+1], 'model_type', 'anomaly_detection', 'features', string_to_array(ml_feats[((i-1)%5)+1], ', '), 'threshold', ml_thresh[((i-1)%5)+1]::numeric, 'training_window', '30d', 'detection_type', 'non_deterministic'),
      random() < 0.4, ARRAY['ml','anomaly-detection','non-deterministic','adaptive-threshold'], auths[((i-1)%5)+1],
      'ml_anomaly', rcomp, floor(random()*3000)::int, round((random()*5)::numeric, 2),
      now() - (random()*180||' days')::interval, now() - (random()*30||' days')::interval
    );
  END LOOP;

  -- ═══════════════════════════════════════════
  -- ML CLASSIFICATION RULES (25)
  -- ═══════════════════════════════════════════
  FOR i IN 1..25 LOOP
    rcat := cats[((i-1) % 10) + 1];
    rsev := sevs[((i-1) % 5) + 1];
    rconf := 80 + (i % 18);
    rcomp := 6 + (i % 4);

    pc := CASE (i-1) % 5
      WHEN 0 THEN format(E'# Multi-Class Threat Classification Pipeline\n# Model: %s | Classes: [%s]\n# Feature Engineering: 47 features from raw telemetry\n\nPIPELINE threat_classify(event: security.alert) {\n  RAW_FEATURES := EXTRACT(\n    event_entropy, payload_size, timing_jitter,\n    src_reputation_score, dst_geo_risk, protocol_conformance,\n    tls_ja3_hash, user_agent_anomaly, header_entropy\n  )\n  ENGINEERED := FEATURE_CROSS(RAW_FEATURES) + POLYNOMIAL(RAW_FEATURES, degree=2)\n  SHAP_VALUES := EXPLAIN(MODEL("%s"), ENGINEERED)\n\n  PREDICTION := MODEL("%s").predict_proba(ENGINEERED)\n  TOP_CLASS := ARGMAX(PREDICTION)\n  CONFIDENCE := MAX(PREDICTION)\n\n  WHEN TOP_CLASS IN ["malicious", "apt_related"]\n    AND CONFIDENCE > 0.85\n  THEN\n    ALERT(class=TOP_CLASS, confidence=CONFIDENCE)\n    ATTACH(shap_explanation=SHAP_VALUES, feature_importance_chart)\n    ROUTE_TO(case_management, priority=DYNAMIC(CONFIDENCE))\n}',
        clf_models[((i-1)%10)+1], clf_classes[((i-1)%5)+1], clf_models[((i-1)%10)+1], clf_models[((i-1)%10)+1])
      WHEN 1 THEN format(E'# Hierarchical Classification with Rejection\n# Model: %s | Architecture: 2-stage cascade\n\nPIPELINE hierarchical_classify(event: endpoint.process_start) {\n  STAGE_1 := MODEL("fast_binary_filter").predict(event)\n  IF STAGE_1.malicious_prob < 0.3 THEN PASS  -- fast rejection\n\n  FEATURES := DEEP_EXTRACT(\n    process_tree_depth, parent_chain_hash,\n    command_line_tokens, loaded_dlls_hash,\n    memory_region_permissions, network_connections\n  )\n  STAGE_2 := MODEL("%s").predict_proba(FEATURES)\n  UNCERTAINTY := ENTROPY(STAGE_2.probabilities)\n\n  WHEN UNCERTAINTY < 0.5 AND MAX(STAGE_2) > 0.82\n  THEN\n    CLASSIFY(event, label=ARGMAX(STAGE_2))\n    IF label IN ["fileless_attack","injection"] THEN\n      MEMORY_SCAN(process.pid)\n      COLLECT_FORENSICS(process_memory_dump)\n}',
        clf_models[((i-1)%10)+1], clf_models[((i-1)%10)+1])
      WHEN 2 THEN format(E'# Gradient Boosted Alert Triage Prioritization\n# Model: %s | Objective: LambdaRank\n\nPIPELINE alert_triage(alert_queue: siem.alerts) {\n  FOR EACH alert IN alert_queue (BATCH 100) {\n    CONTEXT := FETCH(\n      asset_criticality, user_risk_score, vuln_exposure,\n      historical_alert_pattern, threat_intel_match,\n      business_hours_flag, change_window_active\n    )\n    FEATURES := CONCAT(alert.attributes, CONTEXT)\n    PRIORITY_SCORE := MODEL("%s").predict(FEATURES)\n    EXPLANATION := LIME_EXPLAIN(MODEL, FEATURES, top_k=5)\n\n    RANK(alert, score=PRIORITY_SCORE)\n    ANNOTATE(alert, explanation=EXPLANATION)\n  }\n  TOP_N := SELECT_TOP(ranked_alerts, n=10)\n  ROUTE(TOP_N, to=SOC_ANALYST, with_context=true)\n}',
        clf_models[((i-1)%10)+1], clf_models[((i-1)%10)+1])
      WHEN 3 THEN format(E'# Online Learning Classification with Concept Drift\n# Model: %s | Drift Detector: ADWIN\n\nPIPELINE adaptive_classify(stream: network.traffic) {\n  DRIFT_SCORE := ADWIN_DETECTOR.update(recent_error_rate)\n\n  IF DRIFT_SCORE > drift_threshold THEN\n    LOG("Concept drift detected, triggering model retrain")\n    RETRAIN(MODEL, on=BUFFER(last_24h), warm_start=true)\n    CALIBRATE(MODEL, on=validation_holdout)\n  END IF\n\n  FEATURES := EXTRACT(flow_features + statistical_features)\n  PRED := MODEL("%s").predict(FEATURES)\n  BUFFER.append(FEATURES, label=PRED, timestamp=now())\n\n  WHEN PRED.class = "c2_communication"\n    AND PRED.confidence > 0.78\n  THEN\n    ALERT("C2 Channel Detected - Adaptive Classifier")\n    NETWORK_ISOLATE(src_ip, soft_quarantine=true)\n    PCAP_CAPTURE(flow, duration=300s)\n}',
        clf_models[((i-1)%10)+1], clf_models[((i-1)%10)+1])
      ELSE format(E'# Federated Classification Across Data Sources\n# Model: %s | Federation: endpoint + network + identity\n\nPIPELINE federated_classify(entity: user_session) {\n  ENDPOINT_FEATURES := QUERY(edr, entity.host_id, window=1h)\n  NETWORK_FEATURES := QUERY(ndr, entity.ip, window=1h)\n  IDENTITY_FEATURES := QUERY(iam, entity.user_id, window=1h)\n\n  LOCAL_SCORES := [\n    MODEL("endpoint_classifier").predict(ENDPOINT_FEATURES),\n    MODEL("network_classifier").predict(NETWORK_FEATURES),\n    MODEL("identity_classifier").predict(IDENTITY_FEATURES)\n  ]\n\n  FUSED := MODEL("%s").aggregate(LOCAL_SCORES, weights=LEARNED)\n  WHEN FUSED.threat_score > 0.80\n    AND COUNT(LOCAL_SCORES WHERE score > 0.6) >= 2\n  THEN\n    ALERT("Multi-Domain Threat Classification")\n    CREATE_CASE(evidence=[endpoint, network, identity])\n    TIMELINE_BUILD(entity, lookback=24h)\n}',
        clf_models[((i-1)%10)+1], clf_models[((i-1)%10)+1])
    END;

    rname := 'ML-CL-' || lpad(i::text, 3, '0') || ' ' || clf_models[((i-1)%10)+1] || ' ' || rcat || ' Classifier';
    rdesc := 'Non-deterministic ML classification rule using ' || clf_models[((i-1)%10)+1] || '. Classifies events into [' || clf_classes[((i-1)%5)+1] || '] with SHAP/LIME explainability. Includes concept drift detection and automated model retraining triggers.';

    INSERT INTO correlation_rules_library (rule_name, rule_description, category, subcategory, severity, confidence_score, mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author, rule_type, complexity_score, trigger_count, false_positive_rate, created_at, updated_at)
    VALUES (
      rname, rdesc, rcat, 'ML Classification', rsev, rconf,
      ARRAY['Execution','Persistence','Command and Control'],
      ARRAY['T1059','T1547','T1071'],
      ARRAY['EDR Telemetry','Process Monitor','Network Flow','SIEM Alerts'],
      jsonb_build_object('pseudo_code', pc, 'model_name', clf_models[((i-1)%10)+1], 'model_type', 'classification', 'classes', string_to_array(clf_classes[((i-1)%5)+1], ', '), 'detection_type', 'non_deterministic'),
      random() < 0.35, ARRAY['ml','classification','non-deterministic','explainable-ai','shap'], auths[((i-1)%5)+1],
      'ml_classification', rcomp, floor(random()*2500)::int, round((random()*4)::numeric, 2),
      now() - (random()*180||' days')::interval, now() - (random()*30||' days')::interval
    );
  END LOOP;

  -- ═══════════════════════════════════════════
  -- VECTOR SIMILARITY / MICRO-PATTERN RULES (25)
  -- ═══════════════════════════════════════════
  FOR i IN 1..25 LOOP
    rcat := cats[((i-1) % 10) + 1];
    rsev := sevs[((i-1) % 5) + 1];
    rconf := 82 + (i % 16);
    rcomp := 7 + (i % 3);

    pc := CASE (i-1) % 5
      WHEN 0 THEN format(E'# Vector Embedding Micro-Pattern Detection\n# Model: %s | Index: %s\n# Similarity: Cosine | Threshold: %s\n\nVECTOR_PIPELINE ttp_pattern_match(stream: endpoint.commands) {\n  SEQUENCE := WINDOW(events, 15 minutes, SLIDE 1 minute)\n  EMBEDDING := ENCODE(\n    model = "%s",\n    input = CONCAT(SEQUENCE.commands, SEQUENCE.arguments),\n    pooling = "mean", normalize = true\n  )\n\n  MATCHES := VECTOR_SEARCH(\n    index = "%s",\n    query = EMBEDDING,\n    metric = "cosine", top_k = 5,\n    filter = { active: true, min_severity: "high" }\n  )\n\n  WHEN MATCHES[0].similarity > %s\n    AND MATCHES[0].cluster IN ["apt29","apt41","lazarus","volt_typhoon"]\n  THEN\n    ALERT("TTP Micro-Pattern: " + MATCHES[0].cluster_label)\n    ATTACH(similarity_heatmap, vector_explanation, nearest_neighbors)\n    CROSS_REF(threat_intel.iocs, MATCHES[0].related_iocs)\n    ESCALATE(THREAT_HUNT_TEAM)\n}',
        vec_models[((i-1)%5)+1], vec_indexes[((i-1)%5)+1], vec_thresh[((i-1)%5)+1], vec_models[((i-1)%5)+1], vec_indexes[((i-1)%5)+1], vec_thresh[((i-1)%5)+1])
      WHEN 1 THEN format(E'# Semantic Log Anomaly via Embedding Distance\n# Model: %s | Dimensions: 768\n\nVECTOR_PIPELINE log_semantic_anomaly(stream: syslog.entries) {\n  LOG_EMBEDDING := ENCODE(\n    model = "%s",\n    input = log.message,\n    context_window = [log.prev_5, log.next_5]\n  )\n\n  CENTROID_DIST := DISTANCE(\n    LOG_EMBEDDING,\n    CLUSTER_CENTROID(log.source, log.facility),\n    metric = "euclidean"\n  )\n  NOVELTY := 1.0 - MAX_SIMILARITY(LOG_EMBEDDING, RECENT_EMBEDDINGS(1h))\n\n  WHEN CENTROID_DIST > ADAPTIVE_THRESHOLD(source, p99)\n    AND NOVELTY > 0.7\n    AND log.facility IN ["auth","security","kernel"]\n  THEN\n    ALERT("Semantic Log Anomaly: Novel Pattern")\n    NEAREST := VECTOR_SEARCH(index="known_attack_logs", query=LOG_EMBEDDING, top_k=3)\n    ANNOTATE(alert, similar_attacks=NEAREST)\n}',
        vec_models[((i-1)%5)+1], vec_models[((i-1)%5)+1])
      WHEN 2 THEN format(E'# Malware Family Similarity Clustering\n# Model: %s | Index: %s\n\nVECTOR_PIPELINE malware_similarity(event: sandbox.analysis_complete) {\n  STATIC_FEATURES := EXTRACT(\n    pe_sections_hash, import_table_embedding,\n    string_ngram_embedding, opcode_sequence_embedding\n  )\n  DYNAMIC_FEATURES := EXTRACT(\n    api_call_sequence_embedding, network_behavior_embedding,\n    file_system_activity_embedding, registry_mutation_embedding\n  )\n  COMBINED := CONCATENATE(STATIC_FEATURES, DYNAMIC_FEATURES)\n  EMBEDDING := MODEL("%s").encode(COMBINED)\n\n  FAMILY_MATCH := VECTOR_SEARCH(\n    index = "%s", query = EMBEDDING,\n    metric = "cosine", top_k = 10\n  )\n\n  WHEN FAMILY_MATCH[0].similarity > 0.85\n  THEN\n    CLASSIFY(sample, family=FAMILY_MATCH[0].label)\n    EXTRACT_IOCS(sample)\n    UPDATE_BLOCKLISTS(extracted_iocs)\n    YARA_GENERATE(sample, auto_rule=true)\n}',
        vec_models[((i-1)%5)+1], vec_indexes[((i-1)%5)+1], vec_models[((i-1)%5)+1], vec_indexes[((i-1)%5)+1])
      WHEN 3 THEN format(E'# Alert Deduplication via Semantic Similarity\n# Model: %s | Dedup Threshold: 0.94\n\nVECTOR_PIPELINE alert_dedup(stream: siem.raw_alerts) {\n  ALERT_EMBEDDING := ENCODE(\n    model = "%s",\n    input = CONCAT(alert.title, alert.description, alert.observables),\n    max_tokens = 512\n  )\n\n  RECENT_ALERTS := VECTOR_SEARCH(\n    index = "active_alerts_embeddings",\n    query = ALERT_EMBEDDING,\n    metric = "cosine", top_k = 20,\n    filter = { created_after: NOW() - 4h }\n  )\n\n  DUPLICATES := FILTER(RECENT_ALERTS, similarity > 0.94)\n  RELATED := FILTER(RECENT_ALERTS, similarity BETWEEN 0.75 AND 0.94)\n\n  IF COUNT(DUPLICATES) > 0 THEN\n    MERGE(alert, into=DUPLICATES[0].alert_id)\n    INCREMENT(merged_alert.occurrence_count)\n  ELSE IF COUNT(RELATED) > 0 THEN\n    LINK(alert, related_to=RELATED.alert_ids)\n    CREATE_CLUSTER(alert, RELATED, label="attack_campaign")\n  END IF\n}',
        vec_models[((i-1)%5)+1], vec_models[((i-1)%5)+1])
      ELSE format(E'# Cross-Modal Embedding Fusion (Log + Network + File)\n# Models: %s + network-flow-encoder + file-behavior-encoder\n\nVECTOR_PIPELINE multimodal_fusion(entity: host_session) {\n  LOG_EMB := ENCODE(model="%s", input=session.log_sequence)\n  NET_EMB := ENCODE(model="network-flow-encoder", input=session.flows)\n  FILE_EMB := ENCODE(model="file-behavior-encoder", input=session.file_ops)\n\n  FUSED := ATTENTION_FUSION(\n    embeddings = [LOG_EMB, NET_EMB, FILE_EMB],\n    attention_heads = 8,\n    output_dim = 512\n  )\n\n  THREAT_CLUSTERS := VECTOR_SEARCH(\n    index = "multimodal_threat_atlas",\n    query = FUSED, metric = "cosine", top_k = 5\n  )\n\n  WHEN THREAT_CLUSTERS[0].similarity > %s\n    AND ATTENTION_WEIGHTS.max_modality = "network"\n  THEN\n    ALERT("Multi-Modal Threat Pattern: " + THREAT_CLUSTERS[0].label)\n    ATTACH(attention_map, modality_contribution_chart)\n    INVESTIGATE(session, full_packet_capture=true)\n}',
        vec_models[((i-1)%5)+1], vec_models[((i-1)%5)+1], vec_thresh[((i-1)%5)+1])
    END;

    rname := 'VEC-' || lpad(i::text, 3, '0') || ' ' || vec_models[((i-1)%5)+1] || ' Micro-Pattern ' || rcat;
    rdesc := 'Vector embedding micro-pattern rule using ' || vec_models[((i-1)%5)+1] || ' encoder with ' || vec_indexes[((i-1)%5)+1] || ' index. Performs cosine similarity search in high-dimensional embedding space to match incoming telemetry against known attack patterns and TTP clusters.';

    INSERT INTO correlation_rules_library (rule_name, rule_description, category, subcategory, severity, confidence_score, mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author, rule_type, complexity_score, trigger_count, false_positive_rate, created_at, updated_at)
    VALUES (
      rname, rdesc, rcat, 'Vector Similarity', rsev, rconf,
      ARRAY['Execution','Defense Evasion','Command and Control'],
      ARRAY['T1059','T1027','T1071','T1573'],
      ARRAY['EDR Telemetry','Sandbox Analysis','Syslog','Network Flow'],
      jsonb_build_object('pseudo_code', pc, 'embedding_model', vec_models[((i-1)%5)+1], 'vector_index', vec_indexes[((i-1)%5)+1], 'similarity_threshold', vec_thresh[((i-1)%5)+1]::numeric, 'dimensions', CASE ((i-1)%5) WHEN 0 THEN 768 WHEN 1 THEN 512 WHEN 2 THEN 256 WHEN 3 THEN 384 ELSE 1024 END, 'detection_type', 'micro_pattern'),
      random() < 0.3, ARRAY['vector','embedding','micro-pattern','semantic-search','cosine-similarity'], auths[((i-1)%5)+1],
      'vector_similarity', rcomp, floor(random()*2000)::int, round((random()*3)::numeric, 2),
      now() - (random()*180||' days')::interval, now() - (random()*30||' days')::interval
    );
  END LOOP;

END $body$;
