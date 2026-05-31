export const generateMockEvents = () => {
  const eventTypes = [
    'SSH Login Attempt',
    'HTTP Request',
    'File Access',
    'Database Query',
    'API Call',
    'Network Scan',
    'SQL Injection Attempt',
    'XSS Attempt',
    'Brute Force Attack',
    'Port Scan',
    'Malware Detection',
    'Suspicious PowerShell',
  ];

  const sourceIPs = [
    '185.220.101.42',
    '192.168.1.100',
    '10.0.0.45',
    '172.16.254.1',
    '203.0.113.45',
    '198.51.100.23',
    '151.101.129.67',
  ];

  const destinationIPs = [
    '10.0.0.1',
    '192.168.1.1',
    '172.16.0.1',
    '8.8.8.8',
    '1.1.1.1',
  ];

  const userIds = [
    'admin',
    'john.doe',
    'jane.smith',
    'system',
    'service_account',
    'guest',
  ];

  const severities = ['low', 'medium', 'high', 'critical'];
  const results = ['success', 'failure', 'blocked'];
  const actions = ['login', 'query', 'read', 'write', 'execute', 'delete'];

  const events = [];
  for (let i = 0; i < 50; i++) {
    const timestamp = new Date(Date.now() - Math.random() * 3600000);
    events.push({
      id: `mock-event-${i}`,
      timestamp: timestamp.toISOString(),
      event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      severity: severities[Math.floor(Math.random() * severities.length)],
      source_ip: sourceIPs[Math.floor(Math.random() * sourceIPs.length)],
      destination_ip: destinationIPs[Math.floor(Math.random() * destinationIPs.length)],
      user_id: userIds[Math.floor(Math.random() * userIds.length)],
      action: actions[Math.floor(Math.random() * actions.length)],
      result: results[Math.floor(Math.random() * results.length)],
      created_at: timestamp.toISOString(),
    });
  }
  return events;
};

export const generateMockSessions = () => {
  const userIds = ['admin', 'john.doe', 'jane.smith', 'bob.wilson', 'alice.johnson'];
  const sourceIPs = ['192.168.1.100', '10.0.0.45', '172.16.254.1', '203.0.113.45', '198.51.100.23'];
  const statuses = ['active', 'active', 'active', 'suspicious', 'closed'];

  const sessions = [];
  for (let i = 0; i < 20; i++) {
    const startTime = new Date(Date.now() - Math.random() * 86400000);
    const isActive = Math.random() > 0.3;
    sessions.push({
      id: `mock-session-${i}`,
      user_id: userIds[Math.floor(Math.random() * userIds.length)],
      source_ip: sourceIPs[Math.floor(Math.random() * sourceIPs.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      start_time: startTime.toISOString(),
      end_time: isActive ? null : new Date(startTime.getTime() + Math.random() * 3600000).toISOString(),
      event_count: Math.floor(Math.random() * 500) + 10,
      risk_score: Math.floor(Math.random() * 100),
      created_at: startTime.toISOString(),
    });
  }
  return sessions;
};

export const generateMockAlerts = () => {
  const alertNames = [
    'Multiple Failed Login Attempts',
    'Suspicious Network Activity',
    'Lateral Movement Detected',
    'Data Exfiltration Attempt',
    'Privilege Escalation',
    'Malware Execution',
    'SQL Injection Detected',
    'Brute Force Attack',
  ];

  const descriptions = [
    'Multiple failed authentication attempts from single source',
    'Unusual traffic patterns detected',
    'Suspicious account activity across multiple systems',
    'Large data transfer to external destination',
    'Unauthorized elevation of privileges detected',
    'Known malware signature identified',
    'SQL injection attempt in web application',
    'Systematic login attempts detected',
  ];

  const severities = ['low', 'medium', 'high', 'critical'];
  const statuses = ['new', 'investigating', 'resolved', 'false_positive'];

  const alerts = [];
  for (let i = 0; i < 15; i++) {
    const createdAt = new Date(Date.now() - Math.random() * 86400000);
    alerts.push({
      id: `mock-alert-${i}`,
      alert_name: alertNames[Math.floor(Math.random() * alertNames.length)],
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      severity: severities[Math.floor(Math.random() * severities.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      event_ids: [`event-${i}-1`, `event-${i}-2`],
      assigned_to: Math.random() > 0.5 ? 'security_team' : null,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
    });
  }
  return alerts;
};

export const generateMockActiveLists = () => {
  const lists = [
    {
      id: 'mock-list-1',
      name: 'Known Malicious IPs',
      list_type: 'blocklist',
      category: 'ip',
      description: 'IP addresses identified as sources of malicious activity',
      entries: ['185.220.101.42', '203.0.113.45', '198.51.100.23', '151.101.129.67'],
      auto_update: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-list-2',
      name: 'Trusted Domains',
      list_type: 'allowlist',
      category: 'domain',
      description: 'Verified safe domains for organizational use',
      entries: ['example.com', 'trusted-site.org', 'company-portal.net'],
      auto_update: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-list-3',
      name: 'Suspicious Users',
      list_type: 'watchlist',
      category: 'user',
      description: 'User accounts requiring additional monitoring',
      entries: ['guest', 'temp_user', 'contractor_001'],
      auto_update: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-list-4',
      name: 'Malware Hashes',
      list_type: 'blocklist',
      category: 'hash',
      description: 'Known malware file hashes',
      entries: ['d41d8cd98f00b204e9800998ecf8427e', 'e99a18c428cb38d5f260853678922e03'],
      auto_update: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  return lists;
};

export const generateMockWorkflows = () => {
  const workflows = [
    {
      id: 'mock-workflow-1',
      name: 'Incident Response Automation',
      description: 'Automatically isolate compromised systems and notify security team',
      n8n_webhook_url: 'https://n8n.example.com/webhook/incident-response',
      workflow_type: 'response',
      enabled: true,
      auth_method: 'header',
      configuration: {},
      auth_credentials: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-workflow-2',
      name: 'Threat Investigation',
      description: 'Enrich threat data and gather additional context',
      n8n_webhook_url: 'https://n8n.example.com/webhook/investigation',
      workflow_type: 'investigation',
      enabled: true,
      auth_method: 'header',
      configuration: {},
      auth_credentials: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-workflow-3',
      name: 'Slack Notifications',
      description: 'Send critical alerts to Slack security channel',
      n8n_webhook_url: 'https://n8n.example.com/webhook/slack-notify',
      workflow_type: 'notification',
      enabled: true,
      auth_method: 'header',
      configuration: {},
      auth_credentials: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-workflow-4',
      name: 'Automated Remediation',
      description: 'Apply security patches and configuration fixes',
      n8n_webhook_url: 'https://n8n.example.com/webhook/remediation',
      workflow_type: 'remediation',
      enabled: false,
      auth_method: 'header',
      configuration: {},
      auth_credentials: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  return workflows;
};

export const generateMockWorkflowExecutions = () => {
  const executions = [];
  const workflowIds = ['mock-workflow-1', 'mock-workflow-2', 'mock-workflow-3'];
  const statuses = ['success', 'failed', 'running', 'success', 'success'];

  for (let i = 0; i < 12; i++) {
    const startedAt = new Date(Date.now() - Math.random() * 86400000);
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    executions.push({
      id: `mock-execution-${i}`,
      workflow_id: workflowIds[Math.floor(Math.random() * workflowIds.length)],
      execution_status: status,
      trigger_data: { type: 'automated' },
      response_data: status === 'success' ? { message: 'Completed successfully' } : null,
      error_message: status === 'failed' ? 'Connection timeout' : null,
      execution_time_ms: status === 'success' ? Math.floor(Math.random() * 5000) + 100 : null,
      started_at: startedAt.toISOString(),
      completed_at: status !== 'running' ? new Date(startedAt.getTime() + 5000).toISOString() : null,
    });
  }
  return executions;
};

export const generateMockResponseActions = () => {
  const actionTypes = ['block_ip', 'isolate_user', 'disable_account', 'send_notification', 'quarantine_file'];
  const targets = ['185.220.101.42', 'john.doe', 'guest', 'security_team', 'malware.exe'];
  const statuses = ['completed', 'pending', 'failed', 'completed', 'completed'];

  const actions = [];
  for (let i = 0; i < 20; i++) {
    const createdAt = new Date(Date.now() - Math.random() * 86400000);
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    actions.push({
      id: `mock-action-${i}`,
      action_type: actionTypes[Math.floor(Math.random() * actionTypes.length)],
      target_entity: targets[Math.floor(Math.random() * targets.length)],
      action_status: status,
      result_message: status === 'completed' ? 'Action completed successfully' : status === 'failed' ? 'Action failed to execute' : 'Action pending',
      rollback_possible: status === 'completed',
      rolled_back_at: null,
      created_at: createdAt.toISOString(),
    });
  }
  return actions;
};

export const generateMockThreatFeeds = () => {
  const feeds = [
    {
      id: 'mock-feed-1',
      feed_name: 'URLhaus Malware URLs',
      feed_source: 'abuse_ch_urlhaus',
      feed_type: 'url',
      feed_url: 'https://urlhaus.abuse.ch/downloads/json/',
      description: 'Malicious URLs used for malware distribution',
      enabled: true,
      sync_frequency_hours: 1,
      last_sync_at: new Date(Date.now() - 3600000).toISOString(),
      last_sync_status: 'success',
      total_indicators: 15432,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-feed-2',
      feed_name: 'ThreatFox IOCs',
      feed_source: 'abuse_ch_threatfox',
      feed_type: 'mixed',
      feed_url: 'https://threatfox.abuse.ch/export/json/recent/',
      description: 'Recent IOCs from ThreatFox database',
      enabled: true,
      sync_frequency_hours: 2,
      last_sync_at: new Date(Date.now() - 7200000).toISOString(),
      last_sync_status: 'success',
      total_indicators: 8765,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-feed-3',
      feed_name: 'AlienVault OTX',
      feed_source: 'alienvault_otx',
      feed_type: 'mixed',
      feed_url: 'https://otx.alienvault.com/api/v1/pulses/subscribed',
      description: 'Threat intelligence from AlienVault Open Threat Exchange',
      enabled: true,
      sync_frequency_hours: 6,
      last_sync_at: new Date(Date.now() - 21600000).toISOString(),
      last_sync_status: 'success',
      total_indicators: 23456,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-feed-4',
      feed_name: 'OpenPhish',
      feed_source: 'openphish',
      feed_type: 'url',
      feed_url: 'https://openphish.com/feed.txt',
      description: 'Phishing URLs detected by OpenPhish',
      enabled: false,
      sync_frequency_hours: 4,
      last_sync_at: null,
      last_sync_status: null,
      total_indicators: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  return feeds;
};

export const generateMockSyncLogs = () => {
  const logs = [];
  const feedIds = ['mock-feed-1', 'mock-feed-2', 'mock-feed-3'];
  const statuses = ['success', 'success', 'success', 'failed'];

  for (let i = 0; i < 10; i++) {
    const startedAt = new Date(Date.now() - Math.random() * 86400000);
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    logs.push({
      id: `mock-log-${i}`,
      feed_id: feedIds[Math.floor(Math.random() * feedIds.length)],
      sync_status: status,
      indicators_fetched: status === 'success' ? Math.floor(Math.random() * 1000) + 100 : 0,
      indicators_added: status === 'success' ? Math.floor(Math.random() * 50) : 0,
      indicators_updated: status === 'success' ? Math.floor(Math.random() * 20) : 0,
      indicators_removed: status === 'success' ? Math.floor(Math.random() * 10) : 0,
      sync_duration_ms: status === 'success' ? Math.floor(Math.random() * 5000) + 500 : null,
      error_message: status === 'failed' ? 'Connection timeout' : null,
      started_at: startedAt.toISOString(),
      completed_at: new Date(startedAt.getTime() + 5000).toISOString(),
    });
  }
  return logs;
};

export const generateMockIOCs = () => {
  const indicatorTypes = ['ip', 'domain', 'url', 'hash_md5', 'hash_sha256'];
  const threatTypes = ['malware', 'phishing', 'c2', 'exploit', 'ransomware'];
  const severities = ['low', 'medium', 'high', 'critical'];

  const iocs = [];
  for (let i = 0; i < 30; i++) {
    const type = indicatorTypes[Math.floor(Math.random() * indicatorTypes.length)];
    let indicator = '';

    switch (type) {
      case 'ip':
        indicator = `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
        break;
      case 'domain':
        indicator = `malicious${i}.example.com`;
        break;
      case 'url':
        indicator = `https://evil${i}.com/malware`;
        break;
      case 'hash_md5':
        indicator = Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        break;
      case 'hash_sha256':
        indicator = Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        break;
    }

    iocs.push({
      id: `mock-ioc-${i}`,
      indicator,
      indicator_type: type,
      threat_type: threatTypes[Math.floor(Math.random() * threatTypes.length)],
      severity: severities[Math.floor(Math.random() * severities.length)],
      confidence_score: Math.random() * 0.4 + 0.6,
      first_seen: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
      last_seen: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      tags: ['automated', 'threat_intel', threatTypes[Math.floor(Math.random() * threatTypes.length)]],
      match_count: Math.floor(Math.random() * 50),
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return iocs;
};

export const generateMockIOCMatches = () => {
  const matchTypes = ['exact', 'partial', 'fuzzy'];
  const fields = ['source_ip', 'destination_ip', 'url', 'file_hash', 'domain'];

  const matches = [];
  for (let i = 0; i < 15; i++) {
    matches.push({
      id: `mock-match-${i}`,
      ioc_id: `mock-ioc-${Math.floor(Math.random() * 30)}`,
      event_id: `mock-event-${Math.floor(Math.random() * 50)}`,
      match_type: matchTypes[Math.floor(Math.random() * matchTypes.length)],
      matched_field: fields[Math.floor(Math.random() * fields.length)],
      matched_value: `185.220.101.${Math.floor(Math.random() * 256)}`,
      similarity_score: Math.random() * 0.3 + 0.7,
      alert_generated: Math.random() > 0.3,
      matched_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    });
  }
  return matches;
};

export const generateMockCases = () => {
  const categories = ['malware', 'phishing', 'data_breach', 'unauthorized_access', 'ddos', 'insider_threat', 'ransomware'];
  const statuses = ['new', 'investigating', 'contained', 'resolved', 'closed'];
  const priorities = ['low', 'medium', 'high', 'critical'];
  const severities = ['low', 'medium', 'high', 'critical'];
  const assignees = ['security_team', 'john.doe', 'jane.smith', 'incident_response', null];

  const caseTitles = [
    'Suspicious file execution detected on workstation',
    'Multiple failed login attempts from external IP',
    'Potential data exfiltration via unauthorized USB device',
    'Phishing email campaign targeting finance department',
    'Unusual database access pattern detected',
    'Ransomware indicators found in network traffic',
    'Privilege escalation attempt by user account',
    'DDoS attack targeting public web services',
    'Unauthorized API access from foreign IP address',
    'Malware detected in email attachment',
    'Insider threat - sensitive data access after hours',
    'SQL injection attempt on customer portal',
    'Brute force attack on admin accounts',
    'Zero-day exploit attempt detected',
    'Compromised credentials found on dark web',
  ];

  const cases = [];
  for (let i = 0; i < 15; i++) {
    const createdAt = new Date(Date.now() - Math.random() * 86400000 * 7);
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const resolved = status === 'resolved' || status === 'closed';

    cases.push({
      id: `mock-case-${i}`,
      case_number: `CASE-2025-${String(i + 1).padStart(4, '0')}`,
      title: caseTitles[i % caseTitles.length],
      description: `Detailed investigation findings and analysis for this security incident. Multiple indicators suggest coordinated attack pattern requiring immediate attention.`,
      status,
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      severity: severities[Math.floor(Math.random() * severities.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      assigned_to: assignees[Math.floor(Math.random() * assignees.length)],
      created_by: 'security_analyst',
      resolution: resolved ? 'Issue resolved through containment and remediation procedures. System restored to secure state.' : null,
      related_event_ids: [`event-${i}-1`, `event-${i}-2`],
      related_alert_ids: [`alert-${i}-1`],
      tags: ['urgent', 'external', 'automated'].slice(0, Math.floor(Math.random() * 3) + 1),
      created_at: createdAt.toISOString(),
      updated_at: new Date(createdAt.getTime() + Math.random() * 86400000).toISOString(),
      resolved_at: resolved ? new Date(createdAt.getTime() + Math.random() * 86400000 * 2).toISOString() : null,
      closed_at: status === 'closed' ? new Date(createdAt.getTime() + Math.random() * 86400000 * 3).toISOString() : null,
    });
  }
  return cases;
};

export const generateMockSessionLists = () => {
  return [
    {
      id: 'sl-1',
      name: 'User Login/Logout Tracking',
      description: 'Tracks all user authentication events including login, logout, and session timeouts for security monitoring',
      list_category: 'login_logout' as const,
      tracking_attributes: ['user_id', 'source_ip', 'device_id', 'login_time', 'logout_time'],
      time_window_hours: 720,
      rule_driven: true,
      correlation_enabled: true,
      entry_count: 2847,
      created_by: 'security_admin',
      created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'sl-2',
      name: 'Suspicious IP Addresses',
      description: 'Monitors IP addresses flagged for suspicious activity, failed login attempts, or identified in threat intelligence feeds',
      list_category: 'ip_tracking' as const,
      tracking_attributes: ['source_ip', 'user_id', 'event_count', 'risk_score'],
      time_window_hours: 168,
      rule_driven: true,
      correlation_enabled: true,
      entry_count: 156,
      created_by: 'soc_analyst',
      created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
      updated_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'sl-3',
      name: 'Compromised Hosts',
      description: 'Tracks devices and hosts showing signs of compromise including malware infections, unauthorized access, or data exfiltration',
      list_category: 'hostile_activity' as const,
      tracking_attributes: ['device_id', 'user_id', 'source_ip', 'risk_score'],
      time_window_hours: 336,
      rule_driven: true,
      correlation_enabled: true,
      entry_count: 23,
      created_by: 'incident_response',
      created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'sl-4',
      name: 'Privileged Access Monitor',
      description: 'Monitors privileged user sessions and administrative access for compliance and security auditing',
      list_category: 'operational_monitoring' as const,
      tracking_attributes: ['user_id', 'source_ip', 'device_id', 'login_time'],
      time_window_hours: 2160,
      rule_driven: true,
      correlation_enabled: false,
      entry_count: 892,
      created_by: 'compliance_team',
      created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
      updated_at: new Date(Date.now() - 900000).toISOString(),
    },
    {
      id: 'sl-5',
      name: 'After-Hours Access',
      description: 'Tracks user sessions occurring outside normal business hours for anomaly detection',
      list_category: 'operational_monitoring' as const,
      tracking_attributes: ['user_id', 'source_ip', 'login_time', 'event_count'],
      time_window_hours: 720,
      rule_driven: true,
      correlation_enabled: true,
      entry_count: 445,
      created_by: 'security_analyst',
      created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      updated_at: new Date(Date.now() - 5400000).toISOString(),
    },
  ];
};

export const generateMockSessionListEntries = (listId: string) => {
  const users = ['admin', 'john.doe', 'jane.smith', 'system', 'service_account', 'contractor_1', 'developer_2'];
  const ips = ['192.168.1.100', '10.0.0.45', '172.16.254.1', '203.0.113.45', '185.220.101.42'];
  const devices = ['LAPTOP-WIN10-01', 'SERVER-DB-01', 'WORKSTATION-03', 'MOBILE-IOS-15', 'LAPTOP-MAC-07'];
  const statuses = ['active', 'closed', 'suspicious', 'compromised'];

  const entries = [];
  for (let i = 0; i < 20; i++) {
    const loginTime = new Date(Date.now() - Math.random() * 86400000 * 7);
    const logoutTime = Math.random() > 0.3 ? new Date(loginTime.getTime() + Math.random() * 28800000) : null;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const riskScore = status === 'compromised' ? 75 + Math.random() * 25 :
                     status === 'suspicious' ? 50 + Math.random() * 25 :
                     Math.random() * 30;

    entries.push({
      id: `sle-${listId}-${i}`,
      session_list_id: listId,
      session_id: `session-${i}-${Date.now()}`,
      user_id: users[Math.floor(Math.random() * users.length)],
      source_ip: ips[Math.floor(Math.random() * ips.length)],
      device_id: devices[Math.floor(Math.random() * devices.length)],
      login_time: loginTime.toISOString(),
      logout_time: logoutTime?.toISOString() || null,
      duration_seconds: logoutTime ? Math.floor((logoutTime.getTime() - loginTime.getTime()) / 1000) : null,
      event_count: Math.floor(Math.random() * 500),
      risk_score: Math.floor(riskScore),
      status,
      attributes: {},
      added_by_rule: Math.random() > 0.3 ? 'Login Detection Rule' : null,
      tags: ['automated', 'monitored'].slice(0, Math.floor(Math.random() * 2) + 1),
      created_at: loginTime.toISOString(),
      updated_at: new Date(loginTime.getTime() + Math.random() * 86400000).toISOString(),
      expires_at: new Date(loginTime.getTime() + 86400000 * 30).toISOString(),
    });
  }
  return entries;
};

export const generateMockSessionCorrelations = (listId: string) => {
  const correlationTypes = ['multiple_ips', 'suspicious_timing', 'anomalous_activity', 'compromised_host'];

  const descriptions = [
    'User account accessed from 5 different IP addresses within 2 hours',
    'Login attempts detected during non-business hours from unusual location',
    'Abnormal data access patterns detected across multiple sessions',
    'Device showing indicators of compromise based on session behavior',
    'Multiple failed authentication attempts followed by successful login',
    'Unusual file access patterns across multiple sessions',
  ];

  const correlations = [];
  for (let i = 0; i < 8; i++) {
    const correlationType = correlationTypes[Math.floor(Math.random() * correlationTypes.length)];
    const confidence = 60 + Math.random() * 40;

    correlations.push({
      id: `sc-${listId}-${i}`,
      session_list_id: listId,
      correlation_type: correlationType as 'multiple_ips' | 'suspicious_timing' | 'anomalous_activity' | 'compromised_host',
      involved_sessions: [`session-${i}-1`, `session-${i}-2`, `session-${i}-3`],
      confidence_score: Math.floor(confidence),
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      evidence: { flagged_events: Math.floor(Math.random() * 50), anomaly_score: Math.random() },
      alert_generated: Math.random() > 0.5,
      alert_id: Math.random() > 0.5 ? `alert-${i}` : undefined,
      reviewed: Math.random() > 0.6,
      reviewed_by: Math.random() > 0.6 ? 'security_analyst' : undefined,
      reviewed_at: Math.random() > 0.6 ? new Date(Date.now() - Math.random() * 86400000).toISOString() : undefined,
      created_at: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
    });
  }
  return correlations;
};

export const generateMockDiscoveryProfiles = () => {
  return [
    {
      id: 'dp-1',
      name: 'Unknown Threat Hunter',
      description: 'Identifies previously unknown attack patterns and zero-day threats',
      profile_type: 'unknown_threats' as const,
      event_criteria: {},
      sequence_length_min: 3,
      sequence_length_max: 8,
      occurrence_threshold: 5,
      time_window_hours: 24,
      enabled: true,
      last_run_at: new Date(Date.now() - 3600000).toISOString(),
      next_run_at: new Date(Date.now() + 82800000).toISOString(),
      run_frequency_hours: 24,
      created_by: 'security_admin',
      created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'dp-2',
      name: 'Baseline Analyzer',
      description: 'Establishes normal behavior patterns for network activity',
      profile_type: 'baseline_establishment' as const,
      event_criteria: {},
      sequence_length_min: 2,
      sequence_length_max: 6,
      occurrence_threshold: 10,
      time_window_hours: 168,
      enabled: true,
      last_run_at: new Date(Date.now() - 86400000).toISOString(),
      next_run_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      run_frequency_hours: 168,
      created_by: 'security_admin',
      created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
};

export const generateMockDiscoveredPatterns = () => {
  const advancedPatterns = [
    {
      name: 'Time-Dilated Privilege Escalation via Scheduled Task Manipulation',
      type: 'zero_day_indicator',
      level: 'critical',
      sequence: ['SCHTASKS_QUERY', 'WMI_EVENT_SUBSCRIPTION', 'REGISTRY_MODIFICATION_HKCU_RUN', 'DELAYED_PROCESS_HOLLOWING', 'TOKEN_IMPERSONATION', 'LSASS_MEMORY_READ', 'DCE/RPC_SAMR_ENUM'],
      description: 'Advanced APT technique: Attacker creates benign scheduled tasks months in advance, then weaponizes them through WMI event consumers. Uses token impersonation with a 72-hour delay between credential theft and usage to evade temporal correlation. Combines LSASS memory dumping with SAM enumeration spread across 15+ systems to remain undetected.',
      confidence: 94
    },
    {
      name: 'Polymorphic Lateral Movement with Steganographic C2',
      type: 'threat_sequence',
      level: 'critical',
      sequence: ['LEGIT_APP_PROCESS_INJECTION', 'DNS_OVER_HTTPS_LOOKUP', 'IMAGE_METADATA_EXFIL', 'SMB_NAMED_PIPE_LATERAL', 'WMI_PROCESS_CREATION_RANDOM_DELAY', 'KERBEROS_GOLDEN_TICKET_FORGED', 'RDP_SESSION_HIJACKING'],
      description: 'Nation-state actor technique: Injects into legitimate signed processes (explorer.exe, svchost.exe) and uses DNS-over-HTTPS to retrieve commands hidden in image EXIF metadata from compromised corporate websites. Lateral movement occurs via SMB named pipes with randomized 4-18 hour delays. Forges Kerberos golden tickets and hijacks existing RDP sessions to avoid new authentication logs.',
      confidence: 91
    },
    {
      name: 'ML-Evading Data Exfiltration via Legitimate Cloud APIs',
      type: 'baseline_deviation',
      level: 'high',
      sequence: ['OAUTH_TOKEN_REFRESH_ANOMALY', 'GRAPH_API_PERMISSION_ESCALATION', 'SHAREPOINT_BULK_DOWNLOAD_SMALL_FILES', 'ONEDRIVE_SYNC_PATTERN_SHIFT', 'TEAMS_FILE_SHARE_TIME_CORRELATION', 'AZURE_BLOB_COPY_CROSS_TENANT'],
      description: 'Sophisticated insider threat: Gradually escalates OAuth permissions over 6 months using legitimate Microsoft Graph API calls. Downloads sensitive documents as thousands of small files (under 100KB each) to evade DLP thresholds. Correlates OneDrive sync patterns with Teams meeting schedules to disguise bulk transfers as normal collaboration. Exfiltrates via Azure cross-tenant blob copies disguised as vendor data sharing.',
      confidence: 89
    },
    {
      name: 'Quantum-Resistant Crypto-Jacking with Supply Chain Backdoor',
      type: 'zero_day_indicator',
      level: 'critical',
      sequence: ['NPM_PACKAGE_TYPOSQUATTING', 'WEBPACK_BUILD_HOOK_INJECTION', 'WEBASSEMBLY_CRYPTO_MINER', 'BROWSER_EXTENSION_SIDELOAD', 'SERVICE_WORKER_PERSISTENCE', 'GPU_COMPUTE_SPIKE_FRAGMENTED', 'NETWORK_IDLE_TIME_MINING'],
      description: 'Advanced supply chain attack: Compromises npm packages via typosquatting, injects malicious webpack hooks during CI/CD. Deploys WebAssembly-based cryptocurrency miners that only activate during browser idle time and fragment GPU usage across multiple tabs. Uses service workers for persistence and implements quantum-resistant encryption for C2 to future-proof the operation. Mining occurs in 37-second bursts every 8-15 minutes to evade monitoring.',
      confidence: 96
    },
    {
      name: 'Living-off-the-Land Ransomware with Delayed Encryption',
      type: 'threat_sequence',
      level: 'critical',
      sequence: ['POWERSHELL_OBFUSCATION_LAYER_7', 'BITSADMIN_STAGED_DOWNLOAD', 'SHADOW_COPY_DELETION_VSS', 'FILE_ENUMERATION_SPREAD_90_DAYS', 'ENCRYPTION_KEY_DERIVATION_SLOW', 'MBRSAVE_BOOTLOADER_MODIFY', 'NETWORK_SHARE_ENCRYPTION_SYNCHRONIZED'],
      description: 'Devastating ransomware variant: Uses 7 layers of PowerShell obfuscation and BITS for fileless operation. Deletes shadow copies gradually over 90 days. Enumerates files slowly (3-5 files/hour) for 3 months to build encryption target list. Key derivation intentionally takes 18 hours per endpoint. Synchronizes network share encryption across 500+ systems within a 4-minute window using modified bootloader as trigger. Zero file writes until final encryption phase.',
      confidence: 97
    },
    {
      name: 'AI-Generated Spear Phishing with Behavioral Mimicry',
      type: 'anomaly',
      level: 'high',
      sequence: ['EMAIL_METADATA_CORRELATION', 'GPT_STYLE_TRANSFER_DETECTED', 'CALENDAR_SCHEDULE_RECONNAISSANCE', 'DEEPFAKE_VOICE_MEETING_REQUEST', 'MULTI_FACTOR_FATIGUE_PATTERN', 'SESSION_COOKIE_REPLAY_ATTACK'],
      description: 'Next-gen social engineering: AI analyzes 6+ months of executive email patterns, generates perfectly-mimicked phishing emails using GPT-based style transfer. Correlates target calendar availability with meeting requests. Uses deepfake voice in follow-up calls. Exploits MFA fatigue by timing push notifications during known busy periods (detected via calendar analysis). Replays stolen session cookies from different geographic locations gradually over 3-week period.',
      confidence: 88
    },
    {
      name: 'Memory-Only Rootkit with Hypervisor Escape',
      type: 'zero_day_indicator',
      level: 'critical',
      sequence: ['HYPERVISOR_CPUID_DETECTION_BYPASS', 'EPT_VIOLATION_EXPLOITATION', 'VMCS_SHADOWING_MANIPULATION', 'HOST_MEMORY_DIRECT_ACCESS', 'KERNEL_OBJECT_HOOKING_DKOM', 'INTERRUPT_DESCRIPTOR_TABLE_MODIFY', 'SMM_MODE_EXECUTION'],
      description: 'Extremely sophisticated rootkit: Bypasses hypervisor detection, exploits Extended Page Table violations to escape VM. Manipulates VMCS shadowing to gain host memory access. Implements Direct Kernel Object Manipulation to hide processes without file system presence. Modifies Interrupt Descriptor Tables and executes in System Management Mode to achieve ring -2 privileges. Entirely memory-resident with anti-forensics techniques that erase evidence during memory dumps.',
      confidence: 93
    },
    {
      name: 'Cross-Protocol Authentication Relay Attack Chain',
      type: 'threat_sequence',
      level: 'high',
      sequence: ['NTLM_RELAY_INITIATION', 'LDAP_SIGNING_DOWNGRADE', 'KERBEROS_BRONZE_BIT_EXPLOIT', 'SMB_SIGNING_BYPASS', 'CERTIFICATE_TEMPLATE_EXPLOITATION', 'AD_CS_ESC_ESCALATION', 'DCSYNC_CREDENTIAL_DUMP'],
      description: 'Complex authentication attack: Chains NTLM relay with LDAP signing downgrade and Kerberos Bronze Bit exploit. Bypasses SMB signing by manipulating authentication protocols across services. Exploits Active Directory Certificate Services ESC vulnerabilities to escalate privileges. Performs DCSync to dump all domain credentials. Attack chain spans 7 different protocols with 23 intermediate steps, each individually appearing benign.',
      confidence: 92
    },
    {
      name: 'Firmware Implant with Network Stack Persistence',
      type: 'zero_day_indicator',
      level: 'critical',
      sequence: ['UEFI_BOOT_SERVICES_MODIFICATION', 'PCI_ROM_OPTION_INJECTION', 'NETWORK_CARD_FIRMWARE_REFLASH', 'PREBOOT_NETWORK_STACK_HOOK', 'OS_AGNOSTIC_PERSISTENCE', 'BIOS_PASSWORD_BYPASS', 'TPM_PCR_MEASUREMENT_FORGE'],
      description: 'Nation-state implant: Modifies UEFI boot services to inject malicious PCI Option ROM. Reflashes network card firmware to create OS-agnostic persistence in the network stack itself. Hooks preboot execution environment to establish C2 before OS loads. Bypasses BIOS passwords and forges TPM PCR measurements to defeat secure boot. Survives OS reinstalls, disk formatting, and operates across Windows/Linux/macOS. Communicates via custom network protocols invisible to OS-level monitoring.',
      confidence: 98
    },
    {
      name: 'AI-Assisted Vulnerability Chaining with Auto-Exploitation',
      type: 'threat_sequence',
      level: 'critical',
      sequence: ['NETWORK_TOPOLOGY_ML_MAPPING', 'VULNERABILITY_SCANNER_EVASION', 'EXPLOIT_CHAIN_AUTOMATIC_GENERATION', 'DEFENSE_PREDICTION_ML_MODEL', 'ADAPTIVE_PAYLOAD_MORPHING', 'ZERO_DAY_COMBINATION_CVE_UNKNOWN', 'SELF_PROPAGATING_WORM_BEHAVIOR'],
      description: 'Autonomous AI attacker: Uses machine learning to map network topology while evading vulnerability scanners. Automatically generates exploit chains by combining 3-5 known CVEs in novel ways. Predicts defensive responses using trained ML models and morphs payloads in real-time. Discovers and exploits unknown vulnerability combinations (zero-days created from known bugs). Self-propagates as a worm with genetic algorithm-based evolution to bypass different security controls on each system.',
      confidence: 91
    },
    {
      name: 'Blockchain-Based C2 with Decentralized Coordination',
      type: 'anomaly',
      level: 'high',
      sequence: ['CRYPTOCURRENCY_TRANSACTION_METADATA', 'SMART_CONTRACT_INSTRUCTION_ENCODING', 'IPFS_PAYLOAD_DISTRIBUTION', 'TOR_HIDDEN_SERVICE_FALLBACK', 'DHT_PEER_COORDINATION', 'BITCOIN_BLOCKCHAIN_DEAD_DROP', 'MONERO_STEALTH_ADDRESSES_EXFIL'],
      description: 'Cutting-edge C2 infrastructure: Encodes commands in cryptocurrency transaction metadata and smart contract events. Distributes payloads via IPFS with Tor hidden services as fallback. Uses DHT for peer-to-peer botnet coordination without central server. Implements dead drop communication via Bitcoin blockchain annotations. Exfiltrates data by encoding it in Monero stealth addresses. Completely decentralized with no takedown-able infrastructure, resistant to sinkholing and domain seizure.',
      confidence: 87
    },
    {
      name: 'Timing-Channel Data Exfiltration via CPU Cache Side-Channel',
      type: 'baseline_deviation',
      level: 'medium',
      sequence: ['CACHE_TIMING_MEASUREMENT', 'SPECULATIVE_EXECUTION_PROBING', 'FLUSH_RELOAD_ATTACK', 'PRIME_PROBE_COVERT_CHANNEL', 'BRANCH_PREDICTOR_MANIPULATION', 'CROSS_VM_CACHE_INFERENCE', 'ERROR_CORRECTION_CODE_SIDE_CHANNEL'],
      description: 'Microarchitectural attack: Exfiltrates sensitive data using CPU cache timing side-channels and speculative execution. Implements Flush+Reload and Prime+Probe techniques to create covert channels. Manipulates branch predictors to leak cryptographic keys. Works across VM boundaries in cloud environments. Uses ECC memory side-channels to extract data at 1-3 bits/second. Nearly impossible to detect as it generates zero network traffic and leaves no file system artifacts. Attack executes entirely within normal program execution.',
      confidence: 84
    }
  ];

  const patterns = [];
  for (let i = 0; i < advancedPatterns.length; i++) {
    const pattern = advancedPatterns[i];
    const firstSeen = new Date(Date.now() - Math.random() * 86400000 * 14);
    const lastSeen = new Date(Date.now() - Math.random() * 86400000 * 2);
    const occurrenceCount = pattern.level === 'critical' ? Math.floor(Math.random() * 15) + 3 : Math.floor(Math.random() * 30) + 5;

    patterns.push({
      id: `pattern-${i}`,
      snapshot_id: `snapshot-${i}`,
      profile_id: 'dp-1',
      pattern_name: pattern.name,
      pattern_type: pattern.type as any,
      event_sequence: pattern.sequence,
      occurrence_count: occurrenceCount,
      confidence_score: pattern.confidence,
      threat_level: pattern.level as any,
      is_baseline: pattern.type === 'baseline_deviation',
      is_anomaly: pattern.type === 'anomaly' || pattern.type === 'baseline_deviation',
      description: pattern.description,
      event_ids: pattern.sequence.map((_, idx) => `event-${i}-${idx}`),
      graph_data: {},
      investigated: Math.random() > 0.6,
      rule_created: Math.random() > 0.75,
      rule_id: Math.random() > 0.75 ? `rule-${i}` : undefined,
      alert_triggered: pattern.level === 'critical' ? Math.random() > 0.3 : Math.random() > 0.6,
      tags: ['aap', 'advanced-persistent-threat', 'ai-detected', 'zero-day', 'requires-expert-analysis'].slice(0, Math.floor(Math.random() * 4) + 2),
      first_seen: firstSeen.toISOString(),
      last_seen: new Date(firstSeen.getTime() + Math.random() * 86400000 * 3).toISOString(),
      created_at: firstSeen.toISOString(),
      updated_at: new Date(firstSeen.getTime() + Math.random() * 86400000).toISOString(),
    });
  }
  return patterns;
};
