/*
  # Insert Showcase Correlation Rules - Batch 2: Graph, Temporal, Behavioral, Bayesian

  Adds 100 showcase rules (25 per type) with graph traversal queries,
  temporal sequence matching, behavioral baseline deviation, and
  Bayesian probabilistic inference.
*/

DO $body$
DECLARE
  i int;
  pc text;
  rname text;
  rdesc text;
  rcat text;
  rsev text;
  rconf int;
  rcomp int;
  sevs text[] := ARRAY['critical','high','high','medium','critical'];
  cats text[] := ARRAY['Lateral Movement','APT & State-Sponsored','Insider Threat','Credential Attacks','Data Exfiltration','Privilege Escalation','Command & Control','Cloud Security','Supply Chain','Defense Evasion'];
  auths text[] := ARRAY['Detection Engineering','Threat Intel Team','Red Team','Purple Team','SOC Automation'];
  graph_types text[] := ARRAY['Entity-Relationship','Temporal Knowledge','Attack Surface','Identity Trust','Data Flow'];
  temporal_methods text[] := ARRAY['Ordered Stage Matching','Dynamic Time Warping','Fourier Spectral Analysis','Change Point Detection','Markov Chain Transition'];
  behavior_targets text[] := ARRAY['User Authentication Profile','Process Execution Fingerprint','Network Communication Baseline','Database Access Pattern','Application Usage Signature'];
  bayes_methods text[] := ARRAY['Bayesian Network DAG','Naive Bayes + Prior Enrichment','Bayesian Change Point','Monte Carlo Risk Simulation','Hidden Markov Model'];
BEGIN

  -- ═══════════════════════════════════════════
  -- GRAPH CORRELATION RULES (25)
  -- ═══════════════════════════════════════════
  FOR i IN 1..25 LOOP
    rcat := cats[((i-1) % 10) + 1];
    rsev := sevs[((i-1) % 5) + 1];
    rconf := 80 + (i % 18);
    rcomp := 7 + (i % 3);

    pc := CASE (i-1) % 5
      WHEN 0 THEN format(E'# Entity-Relationship Graph: Lateral Movement Path Analysis\n# Graph: %s | Traversal Depth: 6 | Time Window: 2h\n\nGRAPH_QUERY lateral_path_detect {\n  MATCH (attacker:Entity)-[r1:AUTHENTICATED]->(host1:Asset)\n        -[r2:SPAWNED_PROCESS]->(proc:Process)\n        -[r3:NETWORK_CONNECT]->(host2:Asset)\n        -[r4:ACCESSED]->(resource:DataStore)\n  WHERE r1.timestamp < r2.timestamp < r3.timestamp < r4.timestamp\n    AND TIMESPAN(r1, r4) < 2 hours\n    AND NOT EXISTS authorized_path(attacker, resource)\n    AND hop_count(attacker, resource) > 3\n\n  LET risk_score = SUM(edge.anomaly_score) * resource.criticality_weight\n\n  WHEN risk_score > 85\n    AND resource.classification IN ["confidential", "restricted"]\n  THEN\n    ALERT("Unauthorized Lateral Access Path Detected")\n    VISUALIZE(full_attack_path_graph)\n    ISOLATE(compromised_hosts, mode="soft_quarantine")\n    CREATE_CASE(evidence=COLLECT(edges), timeline=true)\n}',
        graph_types[1])
      WHEN 1 THEN format(E'# Knowledge Graph: CVE-to-Asset Attack Surface Mapping\n# Graph: %s | Refresh: Real-time | Sources: Vuln Scanner + Asset DB + Exploit DB\n\nGRAPH_QUERY attack_surface_map {\n  MATCH (vuln:CVE)-[:AFFECTS]->(software:Package)\n        -[:INSTALLED_ON]->(asset:Asset)\n        -[:EXPOSES]->(service:NetworkService)\n  OPTIONAL MATCH (vuln)-[:HAS_EXPLOIT]->(exploit:PublicExploit)\n  OPTIONAL MATCH (asset)-[:REACHABLE_FROM]->(internet:ExternalNetwork)\n\n  LET exploitability = CASE\n    WHEN exploit IS NOT NULL AND internet IS NOT NULL THEN 10\n    WHEN exploit IS NOT NULL THEN 7\n    WHEN vuln.cvss >= 9.0 THEN 8\n    ELSE vuln.cvss * 0.6\n  END\n\n  WHEN exploitability > 7\n    AND asset.business_criticality >= "high"\n    AND vuln.published_date > NOW() - 7 days\n  THEN\n    ALERT("Critical Attack Surface: " + vuln.cve_id + " on " + asset.hostname)\n    PRIORITIZE_PATCH(asset, vuln, sla=24h)\n    VIRTUAL_PATCH(service, waf_rule=AUTO_GENERATE)\n}',
        graph_types[2])
      WHEN 2 THEN format(E'# Temporal Graph: Authentication Chain Anomaly\n# Graph: %s | Window: Rolling 4h | Resolution: Per-second\n\nGRAPH_QUERY auth_chain_anomaly {\n  TEMPORAL_MATCH SEQUENCE {\n    (user:Identity)-[a1:AUTH_SUCCESS]->(src1:Asset) AT t1\n    (user)-[a2:AUTH_SUCCESS]->(src2:Asset) AT t2\n    (user)-[a3:AUTH_SUCCESS]->(src3:Asset) AT t3\n    WHERE t1 < t2 < t3\n      AND t3 - t1 < 30 minutes\n      AND src1 != src2 != src3\n  }\n\n  LET velocity = COUNT(DISTINCT assets) / TIMESPAN(t1, t3)\n  LET geo_spread = MAX_DISTANCE(asset_locations)\n\n  WHEN velocity > BASELINE(user, p95) * 2.0\n    AND geo_spread > 100 km\n    AND ANY(auth WHERE auth.method = "pass_the_hash")\n  THEN\n    ALERT("Rapid Auth Chain: Possible Credential Replay")\n    INVALIDATE_SESSIONS(user, all_hosts=true)\n    FORCE_MFA_REAUTHENTICATION(user)\n}',
        graph_types[3])
      WHEN 3 THEN format(E'# Identity Trust Graph: Privilege Escalation Detection\n# Graph: %s | Trust Model: Zero Trust Adaptive\n\nGRAPH_QUERY privilege_escalation_detect {\n  MATCH (user:Identity)-[:MEMBER_OF]->(group:SecurityGroup)\n        -[:HAS_PERMISSION]->(permission:Privilege)\n        -[:GRANTS_ACCESS]->(resource:CriticalAsset)\n  WHERE permission.level IN ["admin", "root", "domain_admin"]\n\n  LET trust_score = COMPUTE_TRUST(\n    auth_history = user.auth_events(30d),\n    behavior_score = user.ueba_score,\n    device_posture = user.current_device.compliance,\n    time_context = IS_BUSINESS_HOURS(now()),\n    peer_comparison = DEVIATION(user.access, peer_group.avg_access)\n  )\n\n  WHEN trust_score < 0.4\n    AND permission.recently_granted = true\n    AND user.previous_privilege_level < permission.level\n  THEN\n    ALERT("Privilege Escalation via Trust Graph Anomaly")\n    REVOKE_TEMPORARY(permission, pending_review=true)\n    NOTIFY(resource.owner, security_team)\n}',
        graph_types[4])
      ELSE format(E'# Data Flow Graph: Exfiltration Path Detection\n# Graph: %s | Tracking: Source-to-Sink | Taint Analysis\n\nGRAPH_QUERY data_flow_exfil {\n  MATCH path = (source:DataStore {classification:"confidential"})\n        -[:READ_BY]->(proc1:Process)\n        -[:WRITES_TO|PIPES_TO|SENDS_VIA*1..5]->(sink:ExternalEndpoint)\n  WHERE NONE(node IN path WHERE node IN approved_data_flows)\n\n  LET data_volume = SUM(edge.bytes_transferred)\n  LET encoding_suspicious = ANY(edge WHERE edge.encoding IN ["base64","xor","custom"])\n  LET timing_suspicious = STDDEV(edge.inter_packet_delay) < 0.01\n\n  WHEN data_volume > 10 MB\n    AND (encoding_suspicious OR timing_suspicious)\n    AND sink.reputation_score < 30\n  THEN\n    ALERT("Data Exfiltration Path: " + source.name + " -> " + sink.address)\n    BLOCK(sink.address, all_protocols=true)\n    FORENSIC_SNAPSHOT(proc1.host)\n    TAINT_TRACE(source, full_lineage=true)\n}',
        graph_types[5])
    END;

    rname := 'GRAPH-' || lpad(i::text, 3, '0') || ' ' || graph_types[((i-1)%5)+1] || ' Graph ' || rcat || ' Detection';
    rdesc := graph_types[((i-1)%5)+1] || ' graph correlation rule analyzing entity relationships, authentication chains, and data flow paths. Uses graph traversal algorithms to detect attack patterns that are invisible to traditional rule-based detection.';

    INSERT INTO correlation_rules_library (rule_name, rule_description, category, subcategory, severity, confidence_score, mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author, rule_type, complexity_score, trigger_count, false_positive_rate, created_at, updated_at)
    VALUES (
      rname, rdesc, rcat, 'Graph Correlation', rsev, rconf,
      ARRAY['Lateral Movement','Privilege Escalation','Exfiltration'],
      ARRAY['T1021','T1078','T1068','T1048'],
      ARRAY['Active Directory','Network Flow','Auth Logs','Asset Registry','Vulnerability Scanner'],
      jsonb_build_object('pseudo_code', pc, 'graph_type', graph_types[((i-1)%5)+1], 'traversal_depth', 4 + (i%4), 'time_window', (1 + (i%4))::text || 'h', 'detection_type', 'graph_correlation'),
      random() < 0.3, ARRAY['graph','correlation','entity-relationship','knowledge-graph','attack-path'], auths[((i-1)%5)+1],
      'graph_correlation', rcomp, floor(random()*1800)::int, round((random()*3)::numeric, 2),
      now() - (random()*180||' days')::interval, now() - (random()*30||' days')::interval
    );
  END LOOP;

  -- ═══════════════════════════════════════════
  -- TEMPORAL SEQUENCE RULES (25)
  -- ═══════════════════════════════════════════
  FOR i IN 1..25 LOOP
    rcat := cats[((i-1) % 10) + 1];
    rsev := sevs[((i-1) % 5) + 1];
    rconf := 79 + (i % 19);
    rcomp := 6 + (i % 4);

    pc := CASE (i-1) % 5
      WHEN 0 THEN E'# MITRE ATT&CK Kill Chain Stage Progression Detection\n# Method: Ordered Stage Matching | Window: 4h sliding\n\nTEMPORAL_SEQUENCE kill_chain_progression {\n  DEFINE STAGES {\n    S1: event.mitre_tactic = "Reconnaissance"     [min: 1, max: 50]\n    S2: event.mitre_tactic = "Initial Access"      [min: 1, max: 5]\n    S3: event.mitre_tactic = "Execution"            [min: 1, max: 20]\n    S4: event.mitre_tactic = "Persistence"          [min: 1, max: 10]\n    S5: event.mitre_tactic = "Privilege Escalation"  [min: 1, max: 5]\n    S6: event.mitre_tactic = "Lateral Movement"     [min: 1, max: 15]\n    S7: event.mitre_tactic = "Collection"           [min: 1, max: 30]\n    S8: event.mitre_tactic = "Exfiltration"         [min: 1, max: 10]\n  }\n\n  MATCH ORDERED(S1 -> S2 -> S3 -> ... -> S8)\n    WITHIN 4 hours\n    GROUP BY entity.id\n    ALLOW_GAPS max=2 stages\n    ALLOW_PARALLEL stages=[S4,S5]\n\n  WHEN STAGES_MATCHED >= 5\n    AND DISTINCT_TECHNIQUES >= 8\n  THEN\n    ALERT("Kill Chain Progression: " + STAGES_MATCHED + "/8 stages")\n    TIMELINE_BUILD(entity, all_stages, with_evidence=true)\n    ESCALATE(INCIDENT_COMMANDER, priority="P1")\n}'
      WHEN 1 THEN E'# Dynamic Time Warping: Process Execution Sequence Matching\n# Method: DTW with Sakoe-Chiba Band | Reference: Known Attack Patterns\n\nTEMPORAL_SEQUENCE dtw_process_match {\n  OBSERVED := EXTRACT_SEQUENCE(\n    source = endpoint.process_events,\n    features = [process_name, parent_hash, command_args_hash],\n    window = 30 minutes,\n    resolution = per_event\n  )\n\n  FOR EACH reference IN attack_pattern_library {\n    DTW_DISTANCE := DYNAMIC_TIME_WARP(\n      observed = OBSERVED,\n      reference = reference.sequence,\n      band_width = 0.2,\n      distance_fn = "levenshtein_on_features"\n    )\n    NORMALIZED := DTW_DISTANCE / MAX(LEN(OBSERVED), LEN(reference))\n  }\n\n  BEST_MATCH := MIN(NORMALIZED)\n  WHEN BEST_MATCH < 0.15\n  THEN\n    ALERT("Process Sequence Match: " + BEST_MATCH.reference.name)\n    ATTACH(dtw_alignment_visualization, warping_path)\n    COLLECT_ARTIFACTS(process_tree, command_history)\n}'
      WHEN 2 THEN E'# Fourier Spectral Analysis: Periodic Beaconing Detection\n# Method: FFT + Peak Detection | Resolution: 1s bins\n\nTEMPORAL_SEQUENCE beacon_spectral_detect {\n  TIMESERIES := AGGREGATE(\n    source = network.connections,\n    field = connection_count,\n    interval = 1 second,\n    window = 2 hours,\n    group_by = [src_ip, dst_ip]\n  )\n\n  FFT := FOURIER_TRANSFORM(TIMESERIES)\n  PEAKS := DETECT_PEAKS(FFT.power_spectrum, prominence=3.0)\n  DOMINANT_FREQ := PEAKS[0].frequency\n  JITTER := COEFFICIENT_OF_VARIATION(inter_arrival_times)\n\n  WHEN COUNT(PEAKS) >= 1\n    AND DOMINANT_FREQ BETWEEN 0.001 AND 0.1 Hz\n    AND PEAKS[0].power > NOISE_FLOOR * 10\n    AND JITTER < 0.15\n  THEN\n    ALERT("Periodic Beaconing: " + DOMINANT_FREQ + " Hz")\n    BEACON_PERIOD := 1.0 / DOMINANT_FREQ\n    ENRICH(dst_ip, threat_intel, ja3_fingerprint)\n    IF dst_ip.reputation < 40 THEN BLOCK(dst_ip)\n}'
      WHEN 3 THEN E'# Change Point Detection: Behavioral Regime Shift\n# Method: Bayesian Online Change Point (BOCPD) | Hazard: 1/250\n\nTEMPORAL_SEQUENCE regime_shift_detect {\n  STREAMS := [\n    TIMESERIES(auth.events, COUNT, 5m bins, BY user),\n    TIMESERIES(network.bytes_out, SUM, 5m bins, BY user),\n    TIMESERIES(file.access, COUNT, 5m bins, BY user),\n    TIMESERIES(process.starts, COUNT, 5m bins, BY user)\n  ]\n\n  FOR EACH stream IN STREAMS {\n    BOCPD := BAYESIAN_CHANGEPOINT(\n      data = stream,\n      hazard_function = CONSTANT(1/250),\n      observation_model = GAUSSIAN\n    )\n    CHANGE_PROB := BOCPD.run_length_posterior\n  }\n\n  JOINT_CHANGE := PRODUCT(stream.CHANGE_PROB for stream in STREAMS)\n\n  WHEN JOINT_CHANGE > 0.85\n    AND COUNT(streams WHERE CHANGE_PROB > 0.7) >= 3\n  THEN\n    ALERT("Multi-Stream Behavioral Regime Shift")\n    COMPARE(pre_change_baseline, post_change_behavior)\n    RISK_SCORE_UPDATE(user, delta=+35)\n}'
      ELSE E'# Hidden Markov Model: Attacker State Transition Detection\n# Method: Viterbi Decoding | States: 7 attack phases\n\nTEMPORAL_SEQUENCE hmm_attack_phases {\n  DEFINE HIDDEN_STATES {\n    NORMAL, RECON, INITIAL_COMPROMISE, ESTABLISH_FOOTHOLD,\n    ESCALATE_PRIVILEGES, INTERNAL_RECON, LATERAL_MOVE, EXFILTRATE\n  }\n\n  OBSERVATIONS := EXTRACT(\n    source = unified_security_events,\n    features = [event_type_embedding, severity, src_entity, dst_entity],\n    window = 6 hours\n  )\n\n  HMM := LOAD_MODEL("attack_phase_hmm_v3")\n  STATE_SEQUENCE := VITERBI_DECODE(HMM, OBSERVATIONS)\n  FORWARD_PROB := FORWARD_ALGORITHM(HMM, OBSERVATIONS)\n\n  CURRENT_STATE := STATE_SEQUENCE[-1]\n  TRANSITION_PROB := HMM.transition_matrix[CURRENT_STATE]\n\n  WHEN CURRENT_STATE IN [ESCALATE_PRIVILEGES, LATERAL_MOVE, EXFILTRATE]\n    AND FORWARD_PROB > 0.75\n    AND TRANSITION_PROB[EXFILTRATE] > 0.3\n  THEN\n    ALERT("HMM Attack Phase: " + CURRENT_STATE)\n    PREDICT_NEXT := ARGMAX(TRANSITION_PROB)\n    PREEMPTIVE_BLOCK(predicted_targets)\n    ATTACH(state_transition_diagram, probability_timeline)\n}'
    END;

    rname := 'TEMP-' || lpad(i::text, 3, '0') || ' ' || temporal_methods[((i-1)%5)+1] || ' ' || rcat || ' Sequence Detection';
    rdesc := 'Temporal sequence detection using ' || temporal_methods[((i-1)%5)+1] || '. Analyzes ordered event sequences over sliding time windows to detect multi-stage attack progressions, periodic beaconing patterns, and behavioral regime shifts that evade point-in-time detection.';

    INSERT INTO correlation_rules_library (rule_name, rule_description, category, subcategory, severity, confidence_score, mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author, rule_type, complexity_score, trigger_count, false_positive_rate, created_at, updated_at)
    VALUES (
      rname, rdesc, rcat, 'Temporal Sequence', rsev, rconf,
      ARRAY['Initial Access','Execution','Persistence','Lateral Movement','Exfiltration'],
      ARRAY['T1566','T1059','T1547','T1021','T1048'],
      ARRAY['EDR Telemetry','Network Flow','Auth Logs','SIEM Events','Process Monitor'],
      jsonb_build_object('pseudo_code', pc, 'temporal_method', temporal_methods[((i-1)%5)+1], 'window_size', (2 + (i%6))::text || 'h', 'detection_type', 'temporal_sequence'),
      random() < 0.35, ARRAY['temporal','sequence','time-series','kill-chain','multi-stage'], auths[((i-1)%5)+1],
      'temporal_sequence', rcomp, floor(random()*2200)::int, round((random()*4)::numeric, 2),
      now() - (random()*180||' days')::interval, now() - (random()*30||' days')::interval
    );
  END LOOP;

  -- ═══════════════════════════════════════════
  -- BEHAVIORAL BASELINE RULES (25)
  -- ═══════════════════════════════════════════
  FOR i IN 1..25 LOOP
    rcat := cats[((i-1) % 10) + 1];
    rsev := sevs[((i-1) % 5) + 1];
    rconf := 76 + (i % 22);
    rcomp := 7 + (i % 3);

    pc := CASE (i-1) % 5
      WHEN 0 THEN E'# User Authentication Behavioral Fingerprint\n# Baseline: 30-day rolling | Dimensions: 24 behavioral features\n\nBEHAVIOR_BASELINE auth_fingerprint(entity: user) {\n  PROFILE := BUILD_PROFILE(\n    login_times_distribution = HISTOGRAM(auth.timestamp.hour, bins=24),\n    login_locations = GEO_CLUSTER(auth.source_ip, eps=50km),\n    device_fingerprints = SET(auth.device_hash),\n    auth_methods = FREQUENCY(auth.method),\n    session_durations = DISTRIBUTION(session.duration),\n    concurrent_sessions = MAX_ROLLING(session.count, 1h),\n    typing_cadence = KEYSTROKE_DYNAMICS(auth.password_entry),\n    failure_patterns = SEQUENCE(auth.failures, 24h)\n  )\n\n  CURRENT := SNAPSHOT(entity, window=1h)\n  DEVIATION := MAHALANOBIS_DISTANCE(CURRENT, PROFILE)\n  ANOMALOUS_DIMS := DIMENSIONS_ABOVE_THRESHOLD(CURRENT, PROFILE, z=3.0)\n\n  WHEN DEVIATION > 4.5\n    AND COUNT(ANOMALOUS_DIMS) >= 3\n    AND entity.privilege_level >= "elevated"\n  THEN\n    ALERT("Auth Behavioral Deviation: " + entity.username)\n    CHALLENGE(entity, step_up_auth="hardware_token")\n    ATTACH(deviation_radar_chart, historical_comparison)\n}'
      WHEN 1 THEN E'# Process Execution Fingerprint: Syscall Distribution Drift\n# Baseline: Per-process 14d profile | Method: KL-Divergence\n\nBEHAVIOR_BASELINE process_fingerprint(entity: process_family) {\n  PROFILE := BUILD_PROFILE(\n    syscall_distribution = HISTOGRAM(process.syscalls, bins=400),\n    memory_access_pattern = DISTRIBUTION(process.page_faults),\n    file_io_pattern = TIMESERIES(process.file_ops, 1m),\n    network_behavior = DISTRIBUTION(process.connections),\n    child_spawn_rate = RATE(process.fork_events),\n    loaded_libraries = SET(process.loaded_dlls),\n    cpu_usage_pattern = TIMESERIES(process.cpu_percent, 1m)\n  )\n\n  CURRENT := SNAPSHOT(entity, window=15m)\n  KL_DIV := KL_DIVERGENCE(CURRENT.syscall_distribution, PROFILE.syscall_distribution)\n  LIB_DIFF := SET_DIFFERENCE(CURRENT.loaded_libraries, PROFILE.loaded_libraries)\n\n  WHEN KL_DIV > 0.8\n    AND (COUNT(LIB_DIFF) > 0 OR CURRENT.child_spawn_rate > PROFILE.p99)\n  THEN\n    ALERT("Process Behavior Drift: " + entity.process_name)\n    MEMORY_DUMP(entity.pid)\n    YARA_SCAN(entity.memory, ruleset="injection_patterns")\n}'
      WHEN 2 THEN E'# Network Communication Baseline: Peer Group Comparison\n# Baseline: Role-based peer groups | Method: Z-Score + IQR\n\nBEHAVIOR_BASELINE network_baseline(entity: user_role_group) {\n  PEER_GROUP := IDENTIFY_PEERS(\n    criteria = [department, job_title, access_level],\n    min_peers = 10, max_peers = 50\n  )\n\n  FOR EACH member IN entity.members {\n    METRICS := COMPUTE(\n      external_domains = COUNT_DISTINCT(dns.queries.domain, 24h),\n      upload_volume = SUM(network.bytes_out, 24h),\n      new_destinations = COUNT(network.dst_ip NOT IN history(30d)),\n      encrypted_ratio = RATIO(tls.connections / total.connections),\n      after_hours_activity = COUNT(events WHERE NOT business_hours)\n    )\n    PEER_ZSCORE := ZSCORE(METRICS, PEER_GROUP.distribution)\n  }\n\n  WHEN ANY(PEER_ZSCORE > 3.5)\n    AND member.upload_volume > PEER_GROUP.p95 * 2\n  THEN\n    ALERT("Peer Group Outlier: " + member.username)\n    DLP_SCAN(member.recent_transfers)\n    MANAGER_NOTIFY(member.reporting_manager)\n}'
      WHEN 3 THEN E'# Database Access Pattern Deviation\n# Baseline: Per-application 30d | Method: Jaccard + Volume\n\nBEHAVIOR_BASELINE db_access_pattern(entity: application_identity) {\n  PROFILE := BUILD_PROFILE(\n    tables_accessed = FREQUENCY_SET(query.table_names),\n    query_complexity = DISTRIBUTION(query.explain_cost),\n    result_set_sizes = DISTRIBUTION(query.rows_returned),\n    access_times = HISTOGRAM(query.timestamp.hour, bins=24),\n    query_types = FREQUENCY(query.type), -- SELECT/INSERT/UPDATE/DELETE\n    join_depth = DISTRIBUTION(query.join_count),\n    where_clause_patterns = SET(query.predicate_hash)\n  )\n\n  CURRENT := SNAPSHOT(entity, window=1h)\n  TABLE_NOVELTY := 1.0 - JACCARD(CURRENT.tables, PROFILE.tables)\n  VOLUME_RATIO := CURRENT.rows_returned / PROFILE.avg_rows\n\n  WHEN TABLE_NOVELTY > 0.5\n    AND VOLUME_RATIO > 10\n    AND CURRENT.query_types.DELETE > 0\n  THEN\n    ALERT("Database Access Anomaly: " + entity.app_name)\n    QUERY_LOG_FORENSICS(entity, detailed=true)\n    SNAPSHOT_AUDIT_TRAIL(entity.db_connections)\n}'
      ELSE E'# Application Usage Fingerprint: Feature Navigation Analysis\n# Baseline: Per-user 60d | Method: Markov Chain Deviation\n\nBEHAVIOR_BASELINE app_usage_fingerprint(entity: user_session) {\n  PROFILE := BUILD_PROFILE(\n    page_transition_matrix = MARKOV_CHAIN(session.page_sequence),\n    feature_frequency = FREQUENCY(session.features_used),\n    avg_time_per_feature = DISTRIBUTION(session.dwell_time),\n    data_export_patterns = RATE(session.export_events),\n    search_query_patterns = EMBEDDING_CENTROID(session.search_queries),\n    api_call_patterns = SEQUENCE_MODEL(session.api_calls)\n  )\n\n  CURRENT := SNAPSHOT(entity, window=session)\n  MARKOV_SURPRISE := -LOG_PROB(CURRENT.page_sequence, PROFILE.transition_matrix)\n  FEATURE_NOVELTY := SET_DIFF(CURRENT.features, PROFILE.top_features)\n  EXPORT_SPIKE := CURRENT.exports / PROFILE.avg_exports\n\n  WHEN MARKOV_SURPRISE > PERCENTILE(history, 0.99)\n    AND (COUNT(FEATURE_NOVELTY) > 3 OR EXPORT_SPIKE > 5)\n  THEN\n    ALERT("Unusual Application Navigation Pattern")\n    SESSION_RECORD(entity, replay_enabled=true)\n    COMPARE_WITH_PEER_GROUP(entity.role)\n}'
    END;

    rname := 'BEHAV-' || lpad(i::text, 3, '0') || ' ' || behavior_targets[((i-1)%5)+1] || ' ' || rcat || ' Baseline';
    rdesc := 'Behavioral baseline deviation rule monitoring ' || behavior_targets[((i-1)%5)+1] || '. Builds per-entity behavioral profiles from 30-60 day rolling windows and detects statistically significant deviations using Mahalanobis distance, KL-divergence, and peer group comparison.';

    INSERT INTO correlation_rules_library (rule_name, rule_description, category, subcategory, severity, confidence_score, mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author, rule_type, complexity_score, trigger_count, false_positive_rate, created_at, updated_at)
    VALUES (
      rname, rdesc, rcat, 'Behavioral Baseline', rsev, rconf,
      ARRAY['Collection','Defense Evasion','Credential Access'],
      ARRAY['T1074','T1036','T1110','T1078'],
      ARRAY['UEBA','Auth Logs','EDR Telemetry','Database Audit','Application Logs'],
      jsonb_build_object('pseudo_code', pc, 'baseline_target', behavior_targets[((i-1)%5)+1], 'baseline_window', '30d', 'deviation_method', 'mahalanobis+zscore', 'detection_type', 'behavioral_baseline'),
      random() < 0.35, ARRAY['behavioral','baseline','ueba','deviation','per-entity-profile'], auths[((i-1)%5)+1],
      'behavioral_baseline', rcomp, floor(random()*2800)::int, round((random()*5)::numeric, 2),
      now() - (random()*180||' days')::interval, now() - (random()*30||' days')::interval
    );
  END LOOP;

  -- ═══════════════════════════════════════════
  -- BAYESIAN PROBABILISTIC RULES (25)
  -- ═══════════════════════════════════════════
  FOR i IN 1..25 LOOP
    rcat := cats[((i-1) % 10) + 1];
    rsev := sevs[((i-1) % 5) + 1];
    rconf := 81 + (i % 17);
    rcomp := 8 + (i % 2);

    pc := CASE (i-1) % 5
      WHEN 0 THEN E'# Bayesian Network: Multi-Factor Compromise Probability\n# DAG: 12 nodes | Inference: Variable Elimination\n\nBAYESIAN_NET compromise_probability {\n  DEFINE NETWORK {\n    auth_anomaly -> compromise_state [CPT: learned_from_incidents]\n    network_anomaly -> compromise_state [CPT: learned_from_incidents]\n    endpoint_anomaly -> compromise_state [CPT: learned_from_incidents]\n    threat_intel_match -> compromise_state [CPT: 0.85|match, 0.02|no_match]\n    vuln_exposed -> compromise_state [CPT: severity_weighted]\n    user_risk_score -> compromise_state [CPT: continuous_discretized]\n    compromise_state -> data_at_risk [CPT: asset_criticality_weighted]\n    compromise_state -> lateral_spread [CPT: network_topology_weighted]\n  }\n\n  EVIDENCE := OBSERVE(\n    auth_anomaly = UEBA_SCORE(entity) > 75,\n    network_anomaly = NDR_ALERT(entity.ip) = true,\n    threat_intel_match = IOC_MATCH(entity.indicators),\n    vuln_exposed = VULN_SCAN(entity.host).critical_count > 0\n  )\n\n  POSTERIOR := INFER(compromise_state | EVIDENCE)\n\n  WHEN POSTERIOR.probability > 0.78\n  THEN\n    ALERT("Bayesian Compromise Probability: " + ROUND(POSTERIOR * 100) + "%")\n    ATTACH(bayesian_network_visualization, evidence_contribution)\n    RISK_SCORE := POSTERIOR * asset.criticality * data.sensitivity\n    ESCALATE(tier=CEIL(RISK_SCORE/33))\n}'
      WHEN 1 THEN E'# Naive Bayes with Enriched Priors: Threat Classification\n# Prior Source: Historical incidents + Threat Intel + MITRE ATT&CK\n\nBAYESIAN_CLASSIFY enriched_threat_classify(event: security.alert) {\n  PRIORS := COMPUTE_PRIORS(\n    base_rate = incident_history.class_frequency(365d),\n    seasonal_adjustment = SEASONAL_FACTOR(current_month),\n    threat_landscape = THREAT_INTEL_FEED.current_campaign_probs,\n    industry_adjustment = SECTOR_RISK_FACTOR("financial_services"),\n    geo_adjustment = GEO_RISK_FACTOR(entity.country)\n  )\n\n  LIKELIHOODS := COMPUTE(\n    P(features | apt) = PRODUCT(feature_distributions["apt"]),\n    P(features | insider) = PRODUCT(feature_distributions["insider"]),\n    P(features | ransomware) = PRODUCT(feature_distributions["ransomware"]),\n    P(features | benign) = PRODUCT(feature_distributions["benign"])\n  )\n\n  POSTERIORS := NORMALIZE(PRIORS * LIKELIHOODS)\n  MAP_ESTIMATE := ARGMAX(POSTERIORS)\n  CREDIBLE_INTERVAL := HDI(POSTERIORS[MAP_ESTIMATE], 0.95)\n\n  WHEN MAP_ESTIMATE != "benign"\n    AND POSTERIORS[MAP_ESTIMATE] > 0.7\n    AND CREDIBLE_INTERVAL.width < 0.3\n  THEN\n    ALERT("Bayesian Classification: " + MAP_ESTIMATE)\n    ATTACH(posterior_distribution_chart, prior_vs_posterior)\n}'
      WHEN 2 THEN E'# Bayesian Online Change Point Detection\n# Model: BOCPD | Hazard: Constant(1/500) | Obs: Gaussian\n\nBAYESIAN_CHANGEPOINT behavioral_shift(stream: entity.activity_metrics) {\n  MODEL := BOCPD(\n    hazard_function = CONSTANT(1/500),\n    observation_model = STUDENT_T(mu0=0, kappa0=1, alpha0=1, beta0=1)\n  )\n\n  FOR EACH observation IN stream {\n    MODEL.update(observation)\n    RUN_LENGTH_DIST := MODEL.run_length_posterior()\n    CHANGE_PROB := RUN_LENGTH_DIST[0]  -- prob of run_length = 0\n\n    IF CHANGE_PROB > 0.7 THEN\n      REGIME_BEFORE := MODEL.sufficient_stats(before_changepoint)\n      REGIME_AFTER := MODEL.sufficient_stats(after_changepoint)\n      EFFECT_SIZE := COHENS_D(REGIME_BEFORE, REGIME_AFTER)\n    END IF\n  }\n\n  WHEN CHANGE_PROB > 0.85\n    AND EFFECT_SIZE > 1.5\n    AND stream.name IN ["auth_frequency","data_access","privilege_usage"]\n  THEN\n    ALERT("Bayesian Change Point: " + stream.name)\n    ANNOTATE(timeline, changepoint_location, confidence_interval)\n}'
      WHEN 3 THEN E'# Monte Carlo Attack Surface Risk Simulation\n# Simulations: 10,000 | Model: Attack Tree + Asset Graph\n\nBAYESIAN_SIMULATION risk_monte_carlo {\n  ATTACK_TREE := LOAD("attack_tree_" + threat_scenario)\n  ASSET_GRAPH := LOAD("asset_dependency_graph")\n\n  SIMULATIONS := 10000\n  RESULTS := []\n\n  FOR sim IN 1..SIMULATIONS {\n    -- Sample attack parameters from distributions\n    attacker_skill = SAMPLE(BETA(2, 5))\n    exploit_availability = SAMPLE(BERNOULLI(cve.exploit_prob))\n    detection_probability = SAMPLE(BETA(detection_alpha, detection_beta))\n\n    -- Simulate attack progression\n    outcome = SIMULATE_ATTACK(\n      tree = ATTACK_TREE,\n      graph = ASSET_GRAPH,\n      params = {attacker_skill, exploit_availability, detection_probability}\n    )\n    RESULTS.append(outcome)\n  }\n\n  P_BREACH := COUNT(RESULTS WHERE success=true) / SIMULATIONS\n  EXPECTED_LOSS := MEAN(RESULTS.financial_impact)\n  VAR_95 := PERCENTILE(RESULTS.financial_impact, 0.95)\n\n  WHEN P_BREACH > 0.15 AND VAR_95 > 1000000\n  THEN\n    ALERT("Monte Carlo Risk: P(breach)=" + P_BREACH + " VaR=$" + VAR_95)\n    ATTACH(loss_distribution_histogram, attack_path_heatmap)\n}'
      ELSE E'# Hidden Markov Model: Insider Threat State Estimation\n# States: 5 latent | Emissions: 12 observable features\n\nBAYESIAN_HMM insider_threat_hmm {\n  DEFINE STATES {\n    NORMAL, DISGRUNTLED, PLANNING, EXECUTING, COVERING_TRACKS\n  }\n\n  EMISSIONS := OBSERVE(\n    work_hours_deviation, email_sentiment_score,\n    data_access_volume, external_device_usage,\n    job_search_indicators, policy_violations,\n    peer_communication_change, manager_escalations,\n    resignation_indicators, bulk_download_events,\n    encryption_tool_usage, log_deletion_attempts\n  )\n\n  HMM := LOAD_MODEL("insider_threat_hmm_v4")\n  ALPHA := FORWARD_ALGORITHM(HMM, EMISSIONS)\n  BETA := BACKWARD_ALGORITHM(HMM, EMISSIONS)\n  GAMMA := COMPUTE_GAMMA(ALPHA, BETA)\n  VITERBI_PATH := VITERBI_DECODE(HMM, EMISSIONS)\n\n  CURRENT_STATE_PROB := GAMMA[-1]\n  MOST_LIKELY_STATE := VITERBI_PATH[-1]\n\n  WHEN MOST_LIKELY_STATE IN [EXECUTING, COVERING_TRACKS]\n    AND CURRENT_STATE_PROB[MOST_LIKELY_STATE] > 0.7\n  THEN\n    ALERT("Insider Threat HMM: State=" + MOST_LIKELY_STATE)\n    MONITOR_ELEVATED(entity, all_channels=true)\n    HR_NOTIFY(entity.manager, confidential=true)\n}'
    END;

    rname := 'BAYES-' || lpad(i::text, 3, '0') || ' ' || bayes_methods[((i-1)%5)+1] || ' ' || rcat || ' Inference';
    rdesc := 'Bayesian probabilistic inference rule using ' || bayes_methods[((i-1)%5)+1] || '. Computes posterior probabilities from observed evidence with enriched priors from historical incidents, threat intelligence, and seasonal factors. Provides calibrated confidence intervals and uncertainty quantification.';

    INSERT INTO correlation_rules_library (rule_name, rule_description, category, subcategory, severity, confidence_score, mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author, rule_type, complexity_score, trigger_count, false_positive_rate, created_at, updated_at)
    VALUES (
      rname, rdesc, rcat, 'Bayesian Inference', rsev, rconf,
      ARRAY['Discovery','Collection','Exfiltration','Impact'],
      ARRAY['T1082','T1074','T1048','T1486'],
      ARRAY['UEBA','Threat Intel','Vulnerability Scanner','Auth Logs','HR Systems','EDR Telemetry'],
      jsonb_build_object('pseudo_code', pc, 'bayesian_method', bayes_methods[((i-1)%5)+1], 'inference_type', 'posterior_computation', 'detection_type', 'bayesian_probabilistic'),
      random() < 0.25, ARRAY['bayesian','probabilistic','inference','uncertainty','posterior','prior-enrichment'], auths[((i-1)%5)+1],
      'bayesian_probabilistic', rcomp, floor(random()*1500)::int, round((random()*3)::numeric, 2),
      now() - (random()*180||' days')::interval, now() - (random()*30||' days')::interval
    );
  END LOOP;

END $body$;
