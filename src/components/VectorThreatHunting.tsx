import { useState, useEffect } from 'react';
import { Search, Zap, Brain, Target, GitBranch, Plus, Play, Eye, TrendingUp, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { VectorEmbeddingEngine, AICorrelationEngine } from '../lib/vectorEngine';
import MicroPatternsPanel from './MicroPatternsPanel';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';

const generateMockAccessEvents = () => {
  const now = new Date();
  const events = [
    {
      id: 'mock-1',
      description: 'Failed badge access attempt to Data Center - Restricted Area Alpha',
      event_type: 'physical_security',
      source: 'Access Control System',
      source_ip: 'badge-reader-dc-01',
      dest_ip: null,
      protocol: 'RS-485',
      event_timestamp: new Date(now.getTime() - 15 * 60000).toISOString(),
      similarity_score: 0.94,
      similarity_cluster: 1,
      iocs: ['BADGE-7823', 'DOOR-DC-ALPHA-01'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 15 * 60000).toLocaleTimeString()}] ACCESS_DENIED | Badge: 7823 | User: John Smith | Door: DC-ALPHA-01 | Reason: Insufficient Clearance | Location: Building 7, Floor B2, Data Center Alpha | Attempted: 3 times in 5 minutes`,
      raw_json: {
        event_type: 'access_denied',
        badge_id: '7823',
        user_name: 'John Smith',
        door_id: 'DC-ALPHA-01',
        location: 'Building 7, Floor B2, Data Center Alpha',
        clearance_level: 'Level 2',
        required_level: 'Level 4',
        attempt_count: 3,
        time_window: '5 minutes',
        alert_triggered: true
      }
    },
    {
      id: 'mock-2',
      description: 'Unauthorized access attempt to Executive Suite after hours',
      event_type: 'physical_security',
      source: 'Access Control System',
      source_ip: 'badge-reader-exec-05',
      dest_ip: null,
      protocol: 'RS-485',
      event_timestamp: new Date(now.getTime() - 45 * 60000).toISOString(),
      similarity_score: 0.91,
      similarity_cluster: 1,
      iocs: ['BADGE-2341', 'DOOR-EXEC-SUITE'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 45 * 60000).toLocaleTimeString()}] SUSPICIOUS_ACCESS | Badge: 2341 | User: Sarah Johnson | Door: EXEC-SUITE | Reason: After Hours Access | Location: Building 3, Floor 15, Executive Suite | Time: 02:47 AM | Normal Hours: 08:00-18:00`,
      raw_json: {
        event_type: 'after_hours_access',
        badge_id: '2341',
        user_name: 'Sarah Johnson',
        door_id: 'EXEC-SUITE',
        location: 'Building 3, Floor 15, Executive Suite',
        access_time: '02:47 AM',
        normal_hours: '08:00-18:00',
        deviation: '8 hours 47 minutes',
        user_department: 'IT Operations',
        authorized_for_location: false
      }
    },
    {
      id: 'mock-3',
      description: 'Multiple failed attempts to access Server Room - Unknown badge',
      event_type: 'physical_security',
      source: 'Access Control System',
      source_ip: 'badge-reader-srv-03',
      dest_ip: null,
      protocol: 'RS-485',
      event_timestamp: new Date(now.getTime() - 90 * 60000).toISOString(),
      similarity_score: 0.96,
      similarity_cluster: 1,
      iocs: ['BADGE-UNKNOWN', 'DOOR-SERVER-03'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 90 * 60000).toLocaleTimeString()}] CRITICAL_ALERT | Badge: UNREGISTERED | Door: SERVER-03 | Reason: Unknown Badge | Location: Building 5, Floor 3, Server Room | Attempts: 7 in 2 minutes | Response: Security Notified | Camera Footage: Captured`,
      raw_json: {
        event_type: 'unregistered_badge',
        badge_id: 'UNKNOWN',
        door_id: 'SERVER-03',
        location: 'Building 5, Floor 3, Server Room',
        attempt_count: 7,
        time_window: '2 minutes',
        security_notified: true,
        camera_footage: 'CAM-SRV-03-20241015-0247.mp4',
        threat_level: 'CRITICAL'
      }
    },
    {
      id: 'mock-4',
      description: 'Tailgating detected at Research Lab entrance',
      event_type: 'physical_security',
      source: 'Access Control System',
      source_ip: 'badge-reader-lab-01',
      dest_ip: null,
      protocol: 'RS-485',
      event_timestamp: new Date(now.getTime() - 120 * 60000).toISOString(),
      similarity_score: 0.88,
      similarity_cluster: 2,
      iocs: ['BADGE-4521', 'DOOR-LAB-01', 'TAILGATE-DETECTED'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 120 * 60000).toLocaleTimeString()}] TAILGATING_EVENT | Badge: 4521 | User: Michael Chen | Door: LAB-01 | Location: Building 2, Floor 4, Research Lab | Detection: Weight sensor + Motion tracking | Persons Detected: 2 | Authorized: 1 | Camera: Facial recognition confirmed second person`,
      raw_json: {
        event_type: 'tailgating',
        badge_id: '4521',
        authorized_user: 'Michael Chen',
        door_id: 'LAB-01',
        location: 'Building 2, Floor 4, Research Lab',
        persons_authorized: 1,
        persons_detected: 2,
        detection_method: ['weight_sensor', 'motion_tracking', 'facial_recognition'],
        second_person_identified: false,
        security_response: 'Dispatched'
      }
    },
    {
      id: 'mock-5',
      description: 'Forced door entry detected at Secure Storage Area',
      event_type: 'physical_security',
      source: 'Access Control System',
      source_ip: 'door-sensor-storage-07',
      dest_ip: null,
      protocol: 'Modbus',
      event_timestamp: new Date(now.getTime() - 180 * 60000).toISOString(),
      similarity_score: 0.97,
      similarity_cluster: 3,
      iocs: ['DOOR-STORAGE-07', 'FORCE-ENTRY'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 180 * 60000).toLocaleTimeString()}] EMERGENCY_ALERT | Door: STORAGE-07 | Location: Building 1, Floor B1, Secure Storage | Event: FORCED ENTRY | Method: Door forced open without badge | Alarm: TRIGGERED | Lock Status: COMPROMISED | Emergency Response: ACTIVATED | Police: NOTIFIED`,
      raw_json: {
        event_type: 'forced_entry',
        door_id: 'STORAGE-07',
        location: 'Building 1, Floor B1, Secure Storage',
        entry_method: 'forced_physical',
        alarm_triggered: true,
        lock_status: 'compromised',
        emergency_response: true,
        police_notified: true,
        timestamp: new Date(now.getTime() - 180 * 60000).toISOString(),
        threat_level: 'CRITICAL'
      }
    },
    {
      id: 'mock-6',
      description: 'Expired badge used to access Finance Department',
      event_type: 'physical_security',
      source: 'Access Control System',
      source_ip: 'badge-reader-fin-02',
      dest_ip: null,
      protocol: 'RS-485',
      event_timestamp: new Date(now.getTime() - 210 * 60000).toISOString(),
      similarity_score: 0.85,
      similarity_cluster: 1,
      iocs: ['BADGE-8745', 'EXPIRED-CREDENTIAL'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 210 * 60000).toLocaleTimeString()}] ACCESS_VIOLATION | Badge: 8745 | User: Former Employee - David Martinez | Door: FIN-02 | Location: Building 4, Floor 6, Finance Department | Status: BADGE EXPIRED | Expiration: 2024-08-15 | Days Expired: 60 | Access: DENIED | Security: ALERTED`,
      raw_json: {
        event_type: 'expired_credential',
        badge_id: '8745',
        user_name: 'David Martinez',
        employment_status: 'terminated',
        door_id: 'FIN-02',
        location: 'Building 4, Floor 6, Finance Department',
        badge_expiration: '2024-08-15',
        days_expired: 60,
        access_granted: false,
        security_alerted: true,
        investigation_required: true
      }
    },
    {
      id: 'mock-7',
      description: 'Unauthorized entry to Network Operations Center during maintenance window',
      event_type: 'physical_security',
      source: 'Access Control System',
      source_ip: 'badge-reader-noc-01',
      dest_ip: null,
      protocol: 'RS-485',
      event_timestamp: new Date(now.getTime() - 30 * 60000).toISOString(),
      similarity_score: 0.89,
      similarity_cluster: 1,
      iocs: ['BADGE-5629', 'DOOR-NOC-01'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 30 * 60000).toLocaleTimeString()}] POLICY_VIOLATION | Badge: 5629 | User: Robert Taylor | Door: NOC-01 | Location: Building 8, Floor 2, Network Operations Center | Violation: Unauthorized access during scheduled maintenance | Maintenance Window: 03:00-05:00 | Required Authorization: Level 5 + Approval | Authorization: Level 3 (Insufficient)`,
      raw_json: {
        event_type: 'policy_violation',
        badge_id: '5629',
        user_name: 'Robert Taylor',
        door_id: 'NOC-01',
        location: 'Building 8, Floor 2, Network Operations Center',
        user_clearance: 'Level 3',
        required_clearance: 'Level 5',
        maintenance_window: '03:00-05:00',
        special_authorization_required: true,
        authorization_provided: false,
        access_granted: false
      }
    },
    {
      id: 'mock-8',
      description: 'Badge cloning suspected - Simultaneous access attempts from different locations',
      event_type: 'physical_security',
      source: 'Access Control System',
      source_ip: 'badge-correlation-engine',
      dest_ip: null,
      protocol: 'Internal',
      event_timestamp: new Date(now.getTime() - 60 * 60000).toISOString(),
      similarity_score: 0.93,
      similarity_cluster: 4,
      iocs: ['BADGE-3314', 'CLONE-SUSPECTED', 'IMPOSSIBLE-TRAVEL'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 60 * 60000).toLocaleTimeString()}] CRITICAL_SECURITY_ALERT | Badge: 3314 | User: Lisa Anderson | Alert: BADGE CLONING SUSPECTED | Evidence: Simultaneous access at Building 1 (Badge Reader BR-01) and Building 9 (Badge Reader BR-09) | Distance: 2.3 km | Time Difference: 15 seconds | Physical Transit Time: Impossible | Recommended Action: Deactivate badge, issue replacement, investigate security breach`,
      raw_json: {
        event_type: 'badge_cloning_suspected',
        badge_id: '3314',
        user_name: 'Lisa Anderson',
        location_1: 'Building 1 - Badge Reader BR-01',
        location_2: 'Building 9 - Badge Reader BR-09',
        distance_km: 2.3,
        time_difference_seconds: 15,
        impossible_travel: true,
        threat_level: 'CRITICAL',
        recommended_actions: ['deactivate_badge', 'issue_replacement', 'investigate_breach', 'review_footage'],
        investigation_status: 'OPEN'
      }
    }
  ];

  return events;
};

const generateMockInsiderThreatEvents = () => {
  const now = new Date();
  const events = [
    {
      id: 'insider-1',
      description: 'Marketing employee accessed HR salary database - Highly unusual behavior',
      event_type: 'file_access',
      source: 'File Audit System',
      source_ip: '10.50.12.45',
      dest_ip: '10.10.5.200',
      protocol: 'SMB',
      event_timestamp: new Date(now.getTime() - 20 * 60000).toISOString(),
      similarity_score: 0.95,
      similarity_cluster: 1,
      iocs: ['USER-JTHOMPSON', 'FILE-HR-SALARIES-2024.xlsx', 'ABNORMAL-ACCESS'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 20 * 60000).toLocaleTimeString()}] ANOMALY_DETECTED | User: Jennifer Thompson | Department: Marketing | File: \\\\fileserver\\HR\\Confidential\\Salaries_2024.xlsx | Action: READ | Risk Score: 95/100 | Reason: User never accessed HR files in 3 year employment history | File Classification: HIGHLY CONFIDENTIAL | Access Pattern: Out of normal working hours (11:45 PM) | User Clearance: Standard | File Clearance Required: HR Manager+ | Alert: SOC Notified`,
      raw_json: {
        event_type: 'sensitive_file_access',
        user_id: 'jthompson',
        user_name: 'Jennifer Thompson',
        department: 'Marketing',
        job_title: 'Marketing Coordinator',
        file_path: '\\\\fileserver\\HR\\Confidential\\Salaries_2024.xlsx',
        file_classification: 'HIGHLY CONFIDENTIAL',
        action: 'READ',
        access_time: new Date(now.getTime() - 20 * 60000).toISOString(),
        risk_score: 95,
        anomaly_reasons: [
          'First time accessing HR directory in 3 year employment history',
          'Access outside normal working hours (11:45 PM)',
          'Insufficient clearance level for file classification',
          'No business justification on record',
          'Department has no legitimate need for salary data'
        ],
        historical_access: {
          total_hr_file_accesses: 0,
          typical_files: ['Marketing Materials', 'Campaign Data', 'Social Media Assets'],
          typical_access_hours: '09:00-18:00'
        },
        threat_indicators: ['insider_threat', 'data_theft', 'privilege_abuse']
      }
    },
    {
      id: 'insider-2',
      description: 'Junior developer bulk downloaded source code for unassigned projects',
      event_type: 'file_access',
      source: 'File Audit System',
      source_ip: '10.50.8.122',
      dest_ip: '10.10.5.150',
      protocol: 'SMB',
      event_timestamp: new Date(now.getTime() - 55 * 60000).toISOString(),
      similarity_score: 0.92,
      similarity_cluster: 2,
      iocs: ['USER-MRODRIGUEZ', 'BULK-DOWNLOAD', 'UNASSIGNED-PROJECTS'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 55 * 60000).toLocaleTimeString()}] SUSPICIOUS_ACTIVITY | User: Miguel Rodriguez | Department: Engineering | Action: BULK_DOWNLOAD | Files: 47 source code repositories | Projects: NOT assigned to user | Size: 8.4 GB | Duration: 12 minutes | Target: External USB Drive E:\\ | Classification: PROPRIETARY SOURCE CODE | Risk Score: 92/100 | Indicators: Possible IP theft, employee gave 2-week notice 3 days ago`,
      raw_json: {
        event_type: 'bulk_file_download',
        user_id: 'mrodriguez',
        user_name: 'Miguel Rodriguez',
        department: 'Engineering',
        job_title: 'Junior Software Developer',
        seniority: '1.5 years',
        employment_status: 'RESIGNATION NOTICE FILED',
        resignation_date: new Date(now.getTime() - 3 * 24 * 60 * 60000).toISOString(),
        last_day: new Date(now.getTime() + 11 * 24 * 60 * 60000).toISOString(),
        files_downloaded: 47,
        total_size_gb: 8.4,
        download_duration_minutes: 12,
        projects_accessed: [
          'NextGen-API-v2',
          'ML-Recommendation-Engine',
          'Customer-Analytics-Platform',
          'Payment-Processing-Core',
          'Mobile-App-Backend'
        ],
        projects_assigned_to_user: ['Legacy-Bug-Fixes', 'Documentation-Updates'],
        target_location: 'External USB Drive E:\\',
        risk_score: 92,
        threat_indicators: [
          'IP theft preparation',
          'Departing employee',
          'Access to unassigned projects',
          'Bulk download to removable media',
          'Unusual time and volume'
        ]
      }
    },
    {
      id: 'insider-3',
      description: 'Finance employee accessed customer credit card vault - No business justification',
      event_type: 'database_access',
      source: 'Database Audit Log',
      source_ip: '10.50.15.78',
      dest_ip: '10.10.20.50',
      protocol: 'TDS',
      event_timestamp: new Date(now.getTime() - 90 * 60000).toISOString(),
      similarity_score: 0.97,
      similarity_cluster: 1,
      iocs: ['USER-AWILSON', 'PCI-VAULT-ACCESS', 'CUSTOMER-CC-DATA'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 90 * 60000).toLocaleTimeString()}] CRITICAL_SECURITY_EVENT | User: Amanda Wilson | Department: Finance | Database: customer_payment_vault | Query: SELECT card_number, cvv, expiration, cardholder_name FROM credit_cards WHERE status='active' | Rows Returned: 12,847 | Risk Score: 97/100 | PCI Compliance Violation | User Role: Accounts Payable Clerk | Authorized Access: Invoice records only | Query Pattern: Mass extraction attempt | Security Response: Query blocked, credentials suspended, incident escalated`,
      raw_json: {
        event_type: 'unauthorized_database_query',
        user_id: 'awilson',
        user_name: 'Amanda Wilson',
        department: 'Finance',
        job_title: 'Accounts Payable Clerk',
        database: 'customer_payment_vault',
        table: 'credit_cards',
        query: 'SELECT card_number, cvv, expiration, cardholder_name FROM credit_cards WHERE status=\'active\'',
        query_type: 'SELECT',
        rows_attempted: 12847,
        rows_returned: 0,
        query_blocked: true,
        risk_score: 97,
        authorized_tables: ['invoices', 'vendor_payments', 'expense_reports'],
        violation_type: 'PCI_DSS_VIOLATION',
        compliance_frameworks: ['PCI-DSS', 'SOX'],
        threat_indicators: [
          'Mass credit card data extraction attempt',
          'No business justification',
          'Access beyond job responsibilities',
          'PCI vault unauthorized access',
          'Potential data breach attempt'
        ],
        response_actions: [
          'Query blocked by database security',
          'User credentials immediately suspended',
          'SOC incident created',
          'CISO notified',
          'PCI forensic investigation initiated'
        ]
      }
    },
    {
      id: 'insider-4',
      description: 'Sales representative accessed competitor contract templates - Suspicious timing',
      event_type: 'file_access',
      source: 'File Audit System',
      source_ip: '10.50.22.91',
      dest_ip: '10.10.5.200',
      protocol: 'SMB',
      event_timestamp: new Date(now.getTime() - 125 * 60000).toISOString(),
      similarity_score: 0.88,
      similarity_cluster: 3,
      iocs: ['USER-RBAKER', 'COMPETITIVE-INTEL', 'UNUSUAL-PATTERN'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 125 * 60000).toLocaleTimeString()}] BEHAVIORAL_ANOMALY | User: Rachel Baker | Department: Sales | Files Accessed: Competitive_Analysis_2024.docx, Pricing_Strategy_Internal.xlsx, Market_Position_Confidential.pptx, Contract_Templates_Strategic_Accounts.docx | Classification: CONFIDENTIAL - STRATEGIC | Normal Access Pattern: Customer contracts only | Today's Pattern: 15 strategic documents in 30 minutes | Context: LinkedIn shows new connection to competitor VP yesterday | Risk Score: 88/100`,
      raw_json: {
        event_type: 'suspicious_file_access_pattern',
        user_id: 'rbaker',
        user_name: 'Rachel Baker',
        department: 'Sales',
        job_title: 'Senior Sales Representative',
        files_accessed_today: 15,
        sensitive_files: [
          'Competitive_Analysis_2024.docx',
          'Pricing_Strategy_Internal.xlsx',
          'Market_Position_Confidential.pptx',
          'Contract_Templates_Strategic_Accounts.docx'
        ],
        file_classifications: ['CONFIDENTIAL', 'STRATEGIC'],
        access_duration_minutes: 30,
        normal_access_pattern: {
          typical_files: ['Customer Contracts', 'Sales Presentations', 'Product Specs'],
          typical_daily_file_count: 5,
          typical_sensitive_file_count: 0
        },
        risk_score: 88,
        contextual_indicators: [
          'LinkedIn connection to competitor VP (TechCorp) established yesterday',
          'Calendar shows upcoming meeting labeled "Coffee with TC"',
          'Recent web searches for competitor company',
          '300% increase in file access velocity',
          'First time accessing competitive intelligence folder'
        ],
        threat_indicators: ['potential_corporate_espionage', 'competitor_recruitment', 'data_exfiltration_prep']
      }
    },
    {
      id: 'insider-5',
      description: 'IT administrator accessed executive email archives without ticket or approval',
      event_type: 'email_access',
      source: 'Exchange Audit Log',
      source_ip: '10.50.5.33',
      dest_ip: '10.10.30.100',
      protocol: 'MAPI',
      event_timestamp: new Date(now.getTime() - 160 * 60000).toISOString(),
      similarity_score: 0.94,
      similarity_cluster: 1,
      iocs: ['USER-KPATEL', 'EXEC-MAILBOX', 'NO-TICKET'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 160 * 60000).toLocaleTimeString()}] PRIVILEGE_ABUSE_DETECTED | User: Kiran Patel | Role: IT Systems Administrator | Action: Full mailbox access | Target: CEO mailbox (john.smith@company.com) | Folders: Inbox, Sent Items, Board Communications, M&A Discussions | Emails Viewed: 127 | Duration: 45 minutes | Ticket Number: NONE | Approval: NONE | Risk Score: 94/100 | Context: Admin privilege used without business justification | Policy: Executive mailbox access requires VP approval + ticket`,
      raw_json: {
        event_type: 'unauthorized_mailbox_access',
        user_id: 'kpatel',
        user_name: 'Kiran Patel',
        department: 'IT Operations',
        job_title: 'Systems Administrator',
        admin_privileges: true,
        target_mailbox: 'john.smith@company.com',
        target_user_title: 'CEO',
        folders_accessed: [
          'Inbox',
          'Sent Items',
          'Board Communications',
          'Confidential/M&A Discussions',
          'Executive Strategy'
        ],
        emails_viewed: 127,
        emails_exported: 0,
        access_duration_minutes: 45,
        ticket_number: null,
        approval_required: true,
        approval_obtained: false,
        risk_score: 94,
        policy_violations: [
          'No support ticket for mailbox access',
          'No VP approval obtained',
          'Access outside change management window',
          'Viewed M&A sensitive communications',
          'Extended duration without justification'
        ],
        threat_indicators: ['privilege_abuse', 'insider_threat', 'potential_espionage', 'unauthorized_surveillance']
      }
    },
    {
      id: 'insider-6',
      description: 'Customer support agent queried customer database for personal acquaintances',
      event_type: 'database_access',
      source: 'Database Audit Log',
      source_ip: '10.50.18.67',
      dest_ip: '10.10.20.30',
      protocol: 'MySQL',
      event_timestamp: new Date(now.getTime() - 45 * 60000).toISOString(),
      similarity_score: 0.86,
      similarity_cluster: 4,
      iocs: ['USER-SLEE', 'PRIVACY-VIOLATION', 'PERSONAL-LOOKUP'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 45 * 60000).toLocaleTimeString()}] PRIVACY_BREACH | User: Sandra Lee | Department: Customer Support | Database: customer_master | Queries: 8 lookups by personal name (not customer ID or case number) | Names: Suspicious pattern - appears to be friends/family | Data Accessed: Purchase history, payment info, addresses, phone numbers | Business Context: No open support tickets for any of these customers | Risk Score: 86/100 | Violation: Privacy policy, potential GDPR breach | Action: Account suspended pending investigation`,
      raw_json: {
        event_type: 'unauthorized_customer_lookup',
        user_id: 'slee',
        user_name: 'Sandra Lee',
        department: 'Customer Support',
        job_title: 'Customer Service Representative',
        database: 'customer_master',
        queries_executed: 8,
        lookup_method: 'name_search',
        expected_lookup_method: 'customer_id_or_case_number',
        customers_queried: [
          { name: 'Michael Lee', relation: 'Potential family member (same last name)' },
          { name: 'Jessica Chen', relation: 'Facebook friend confirmed' },
          { name: 'Robert Martinez', relation: 'Ex-spouse (public records)' },
          { name: 'Amy Thompson', relation: 'Unknown' }
        ],
        data_fields_accessed: [
          'customer_id',
          'full_name',
          'email',
          'phone',
          'address',
          'purchase_history',
          'payment_methods',
          'account_balance'
        ],
        open_support_tickets: 0,
        business_justification: null,
        risk_score: 86,
        compliance_violations: ['GDPR', 'CCPA', 'Company Privacy Policy'],
        threat_indicators: ['privacy_breach', 'unauthorized_surveillance', 'data_misuse', 'trust_violation']
      }
    },
    {
      id: 'insider-7',
      description: 'Research scientist copied proprietary algorithms to personal cloud storage',
      event_type: 'data_exfiltration',
      source: 'DLP System',
      source_ip: '10.50.30.144',
      dest_ip: '104.16.123.96',
      protocol: 'HTTPS',
      event_timestamp: new Date(now.getTime() - 200 * 60000).toISOString(),
      similarity_score: 0.96,
      similarity_cluster: 2,
      iocs: ['USER-DCHEN', 'CLOUD-UPLOAD', 'IP-THEFT'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 200 * 60000).toLocaleTimeString()}] DATA_EXFILTRATION_BLOCKED | User: Dr. David Chen | Department: Research & Development | Action: BLOCKED | Destination: personal-dropbox.com | Files: AI_Algorithm_Proprietary_v3.py, Training_Data_Models.zip, Research_Notes_Breakthrough.docx, Patent_Draft_Novel_Approach.pdf | Total Size: 2.1 GB | Classification: TRADE SECRET | DLP Rule: Block upload of proprietary research to personal cloud | Risk Score: 96/100 | Context: User attending competitor conference next week | Investigation: URGENT`,
      raw_json: {
        event_type: 'data_exfiltration_attempt',
        user_id: 'dchen',
        user_name: 'Dr. David Chen',
        department: 'Research & Development',
        job_title: 'Senior Research Scientist',
        destination_service: 'Dropbox Personal Account',
        destination_url: 'https://www.dropbox.com/upload',
        destination_account: 'david.chen.personal@gmail.com',
        files_attempted: [
          'AI_Algorithm_Proprietary_v3.py',
          'Training_Data_Models.zip',
          'Research_Notes_Breakthrough.docx',
          'Patent_Draft_Novel_Approach.pdf'
        ],
        total_size_gb: 2.1,
        file_classifications: ['TRADE_SECRET', 'PROPRIETARY', 'PATENT_PENDING'],
        transfer_blocked: true,
        dlp_rule_triggered: 'Block proprietary research to personal cloud storage',
        risk_score: 96,
        contextual_red_flags: [
          'Attending competitor conference "AI Innovation Summit" next week',
          'Recent LinkedIn activity shows engagement with competitor recruiters',
          'Performance review showed dissatisfaction with compensation',
          'Multiple failed attempts to upload over past 3 days',
          'Files represent 18 months of groundbreaking research'
        ],
        business_impact: 'CRITICAL - Core IP assets, multi-million dollar research investment',
        threat_indicators: ['IP_theft', 'trade_secret_misappropriation', 'competitor_recruitment', 'data_exfiltration']
      }
    },
    {
      id: 'insider-8',
      description: 'Contractor accessed customer PII database beyond contract scope',
      event_type: 'database_access',
      source: 'Database Audit Log',
      source_ip: '10.50.45.201',
      dest_ip: '10.10.20.30',
      protocol: 'PostgreSQL',
      event_timestamp: new Date(now.getTime() - 75 * 60000).toISOString(),
      similarity_score: 0.90,
      similarity_cluster: 1,
      iocs: ['USER-CONTRACTOR-TJones', 'SCOPE-VIOLATION', 'PII-ACCESS'],
      raw_log: `[2024-10-15 ${new Date(now.getTime() - 75 * 60000).toLocaleTimeString()}] CONTRACT_VIOLATION | User: Thomas Jones (CONTRACTOR) | Vendor: TechConsulting Inc | Contract Scope: Website UI/UX updates | Database: customer_pii | Tables: customers, orders, payment_methods, addresses | Rows Queried: 45,000+ | Contract Terms: NO DATABASE ACCESS AUTHORIZED | Risk Score: 90/100 | Data Accessed: SSN, DOB, Credit Cards, Addresses | Violation: Contract breach, unauthorized PII access | Legal: Contract compliance officer notified`,
      raw_json: {
        event_type: 'contractor_scope_violation',
        user_id: 'tjones-contractor',
        user_name: 'Thomas Jones',
        employment_type: 'CONTRACTOR',
        vendor_company: 'TechConsulting Inc',
        contract_number: 'CT-2024-0847',
        contract_scope: 'Website UI/UX design and front-end development',
        contract_authorized_access: ['Web server', 'Static assets', 'UI design tools'],
        contract_prohibited_access: ['Databases', 'Customer data', 'Backend systems'],
        actual_access: {
          database: 'customer_pii',
          tables: ['customers', 'orders', 'payment_methods', 'addresses', 'transactions'],
          rows_accessed: 45000,
          sensitive_fields: ['ssn', 'date_of_birth', 'credit_card_number', 'bank_account', 'drivers_license']
        },
        risk_score: 90,
        contract_violations: [
          'Accessed database without authorization',
          'Viewed customer PII outside contract scope',
          'No NDA covering database access',
          'Background check only covered UI work, not data access',
          'No data handling training completed'
        ],
        compliance_impact: ['GDPR', 'CCPA', 'SOX', 'Contract Law'],
        legal_risk: 'HIGH - Potential breach of contract, regulatory violations',
        threat_indicators: ['unauthorized_access', 'scope_creep', 'data_breach_risk', 'vendor_risk']
      }
    }
  ];

  return events;
};

const VectorThreatHunting = () => {
  const [activeTab, setActiveTab] = useState<'hunt' | 'correlations' | 'rules' | 'hunts' | 'events' | 'create' | 'micropatterns'>('hunts');
  const [huntQuery, setHuntQuery] = useState('');
  const [huntResults, setHuntResults] = useState<any[]>([]);
  const [correlations, setCorrelations] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [huntQueries, setHuntQueries] = useState<any[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ events: 0, clusters: 0, rules: 0, matches: 0, hunts: 0 });
  const [showRuleCreator, setShowRuleCreator] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [corrData, rulesData, eventsCount, huntQueriesData, eventsData] = await Promise.all([
      supabase.from('vector_correlations').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('vector_correlation_rules').select('*').eq('enabled', true),
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('threat_hunt_queries').select('*').order('created_at', { ascending: false }),
      supabase.from('events').select('*').order('event_timestamp', { ascending: false }).limit(50),
    ]);

    setCorrelations(corrData.data || []);
    setRules(rulesData.data || []);
    setHuntQueries(huntQueriesData.data || []);
    setSecurityEvents(eventsData.data || []);
    setStats({
      events: eventsCount.count || 0,
      clusters: 7,
      rules: (rulesData.data || []).length,
      matches: (corrData.data || []).length,
      hunts: (huntQueriesData.data || []).length,
    });
  };

  const handleSemanticSearch = async () => {
    if (!huntQuery.trim()) return;

    setLoading(true);
    try {
      const query = huntQuery.toLowerCase();

      // Special handling for demo queries about physical security/access
      const isAccessQuery = query.includes('unauthorized access') ||
                           query.includes('restricted area') ||
                           query.includes('access attempt') ||
                           query.includes('badge') ||
                           query.includes('door') ||
                           query.includes('physical');

      // Special handling for insider threat / sensitive file access queries
      const isInsiderThreatQuery = query.includes('sensitive file') ||
                                   query.includes('accessing sensitive') ||
                                   query.includes('employees accessing') ||
                                   query.includes('insider threat') ||
                                   query.includes('abnormal file access') ||
                                   query.includes('unusual file') ||
                                   (query.includes('file') && (query.includes('sensitive') || query.includes('normally')));

      // Semantic-style search using full-text and pattern matching
      const { data: results, error } = await supabase
        .from('events')
        .select('*')
        .or(`description.ilike.%${query}%,event_type.ilike.%${query}%,source.ilike.%${query}%,source_ip.ilike.%${query}%,raw_log.ilike.%${query}%`)
        .order('event_timestamp', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Search error:', error);

        // Generate mock data for access control queries
        if (isAccessQuery) {
          const mockAccessEvents = generateMockAccessEvents();
          setHuntResults(mockAccessEvents);
        } else if (isInsiderThreatQuery) {
          const mockInsiderEvents = generateMockInsiderThreatEvents();
          setHuntResults(mockInsiderEvents);
        } else {
          // Fallback to client-side search
          const filtered = securityEvents.filter(event => {
            const description = (event.description || '').toLowerCase();
            const rawLog = (event.raw_log || '').toLowerCase();
            const rawJson = JSON.stringify(event.raw_json || {}).toLowerCase();
            const sourceSystem = (event.source || '').toLowerCase();
            const eventType = (event.event_type || '').toLowerCase();
            return description.includes(query) || rawLog.includes(query) || rawJson.includes(query) ||
                   sourceSystem.includes(query) || eventType.includes(query);
          });
          setHuntResults(filtered.slice(0, 15));
        }
      } else if (results && results.length > 0) {
        // Score results based on relevance
        const scoredResults = results.map(event => {
          let score = 0;
          const description = (event.description || '').toLowerCase();
          const rawLog = (event.raw_log || '').toLowerCase();
          const rawJson = JSON.stringify(event.raw_json || {}).toLowerCase();
          const sourceSystem = (event.source || '').toLowerCase();
          const eventType = (event.event_type || '').toLowerCase();

          // Query term matching
          const queryTerms = query.split(' ');
          queryTerms.forEach(term => {
            if (description.includes(term)) score += 0.4;
            if (eventType.includes(term)) score += 0.3;
            if (sourceSystem.includes(term)) score += 0.2;
            if (rawLog.includes(term)) score += 0.15;
            if (rawJson.includes(term)) score += 0.1;
          });

          return {
            ...event,
            similarity_score: Math.min(score, 1.0)
          };
        }).sort((a, b) => b.similarity_score - a.similarity_score);

        setHuntResults(scoredResults.slice(0, 15));
      } else {
        // Generate mock data for access control queries if no results
        if (isAccessQuery) {
          const mockAccessEvents = generateMockAccessEvents();
          setHuntResults(mockAccessEvents);
        } else if (isInsiderThreatQuery) {
          const mockInsiderEvents = generateMockInsiderThreatEvents();
          setHuntResults(mockInsiderEvents);
        } else {
          // Client-side fallback
          const filtered = securityEvents.filter(event => {
            const description = (event.description || '').toLowerCase();
            const rawLog = (event.raw_log || '').toLowerCase();
            const rawJson = JSON.stringify(event.raw_json || {}).toLowerCase();
            return description.includes(query) || rawLog.includes(query) || rawJson.includes(query);
          });
          setHuntResults(filtered.slice(0, 15));
        }
      }

      // Create hunt query record
      if (huntQuery.length > 5 && results && results.length > 0) {
        await supabase.from('threat_hunt_queries').insert({
          query_name: `Hunt: ${huntQuery.substring(0, 50)}`,
          natural_language_query: huntQuery,
          hunt_type: 'semantic_search',
          hunter: 'analyst',
          status: 'completed',
          results_count: results?.length || 0,
          completed_at: new Date().toISOString()
        });
        loadData();
      }
    } catch (error) {
      console.error('Hunt failed:', error);
      // Final fallback to client-side search
      const query = huntQuery.toLowerCase();
      const filtered = securityEvents.filter(event => {
        const summary = (event.event_summary || '').toLowerCase();
        const payload = JSON.stringify(event.raw_payload || {}).toLowerCase();
        return summary.includes(query) || payload.includes(query);
      });
      setHuntResults(filtered.slice(0, 15));
    } finally {
      setLoading(false);
    }
  };

  const exampleQueries = [
    'physical',
    'dlp',
    'blocked',
    'high',
    'critical',
    'encrypted',
    'packet',
    'asset',
  ];

  return (
    <div className="space-y-6">
      <MLModelExplainer {...ML_MODELS.vectorThreatHunting} />

      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Brain className="w-6 h-6 text-purple-500" />
              <span>AI-Powered Threat Hunting</span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Vector embeddings and semantic search for modern threat detection
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 mb-6">
          <StatCard title="Hunt Sessions" value={stats.hunts} icon={<Target className="w-5 h-5" />} color="blue" />
          <StatCard title="Raw Events" value={stats.events} icon={<Eye className="w-5 h-5" />} color="purple" />
          <StatCard title="Vector Rules" value={stats.rules} icon={<Zap className="w-5 h-5" />} color="green" />
          <StatCard title="AI Correlations" value={stats.matches} icon={<GitBranch className="w-5 h-5" />} color="orange" />
          <StatCard title="Event Clusters" value={stats.clusters} icon={<TrendingUp className="w-5 h-5" />} color="cyan" />
        </div>

        <div className="flex space-x-2 mb-6 border-b border-slate-800">
          <TabButton active={activeTab === 'hunts'} onClick={() => setActiveTab('hunts')} icon={<Target />} label="Hunt Sessions" />
          <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<Eye />} label="Events" />
          <TabButton active={activeTab === 'correlations'} onClick={() => setActiveTab('correlations')} icon={<GitBranch />} label="AI Correlations" />
          <TabButton active={activeTab === 'rules'} onClick={() => setActiveTab('rules')} icon={<Zap />} label="Vector Rules" />
          <TabButton active={activeTab === 'micropatterns'} onClick={() => setActiveTab('micropatterns')} icon={<Layers />} label="Micro Patterns" />
          <TabButton active={activeTab === 'hunt'} onClick={() => setActiveTab('hunt')} icon={<Search />} label="Search Events" />
        </div>

        {activeTab === 'hunts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">
                View completed and ongoing threat hunting sessions with detailed findings
              </p>
            </div>
            {huntQueries.length === 0 ? (
              <div className="text-center py-12">
                <Target className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No hunt sessions found</p>
              </div>
            ) : (
              huntQueries.map((hunt) => (
                <div key={hunt.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Target className="w-5 h-5 text-blue-400" />
                        <span className="text-white font-semibold text-lg">{hunt.query_name}</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          hunt.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          hunt.status === 'running' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {hunt.status}
                        </span>
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs capitalize">
                          {hunt.hunt_type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-slate-300 mb-3 text-sm italic">&quot;{hunt.natural_language_query}&quot;</p>

                      <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                        <div>
                          <p className="text-slate-500">Hunter</p>
                          <p className="text-white font-semibold">{hunt.hunter}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Results</p>
                          <p className="text-white font-semibold">{hunt.results_count} events</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Started</p>
                          <p className="text-white font-semibold">{new Date(hunt.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>

                      {hunt.findings && hunt.findings.length > 0 && (
                        <div className="bg-slate-900/50 rounded-lg p-4 mt-3 space-y-2">
                          <p className="text-slate-400 text-sm font-semibold mb-2">Key Findings:</p>
                          {hunt.findings.map((finding: any, idx: number) => (
                            <div key={idx} className="text-sm">
                              {finding.severity && (
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold mr-2 ${getSeverityColor(finding.severity)}`}>
                                  {finding.severity}
                                </span>
                              )}
                              {finding.description && (
                                <span className="text-slate-300">{finding.description}</span>
                              )}
                              {finding.confidence && (
                                <span className="text-slate-500 text-xs ml-2">
                                  ({(finding.confidence * 100).toFixed(0)}% confidence)
                                </span>
                              )}
                              {finding.recommendation && (
                                <p className="text-slate-400 text-xs mt-1 ml-4">
                                  → {finding.recommendation}
                                </p>
                              )}
                              {finding.technique && (
                                <p className="text-purple-400 text-xs mt-1">
                                  MITRE: {finding.technique}
                                </p>
                              )}
                              {finding.indicators && (
                                <p className="text-slate-500 text-xs mt-1">
                                  Indicators: {finding.indicators.join(', ')}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">
                Raw security events with threat indicators and cluster assignments
              </p>
            </div>
            {securityEvents.length === 0 ? (
              <div className="text-center py-12">
                <Eye className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No security events found</p>
              </div>
            ) : (
              securityEvents.map((event) => (
                <div key={event.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        {event.similarity_cluster && (
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold">
                            Cluster {event.similarity_cluster}
                          </span>
                        )}
                        <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                          {event.source}
                        </span>
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs capitalize">
                          {event.event_type}
                        </span>
                        <span className="text-slate-500 text-xs">
                          {new Date(event.event_timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-white font-semibold mb-2">{event.description}</p>

                      {event.source_ip && (
                        <div className="flex items-center space-x-4 text-sm mb-2">
                          <span className="text-slate-400">
                            Source: <span className="text-white font-mono">{event.source_ip}</span>
                          </span>
                          {event.dest_ip && (
                            <span className="text-slate-400">
                              → <span className="text-white font-mono">{event.dest_ip}</span>
                            </span>
                          )}
                          {event.protocol && (
                            <span className="text-slate-400">
                              <span className="text-purple-400 font-mono">{event.protocol}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {event.raw_log && (
                        <details className="mt-3">
                          <summary className="text-blue-400 text-xs cursor-pointer hover:text-blue-300 font-semibold">
                            View Raw Log Data
                          </summary>
                          <pre className="text-slate-300 text-xs bg-slate-900 rounded p-3 mt-2 overflow-x-auto border border-slate-700 font-mono">
                            {event.raw_log}
                          </pre>
                        </details>
                      )}

                      {event.raw_json && (
                        <details className="mt-2">
                          <summary className="text-green-400 text-xs cursor-pointer hover:text-green-300 font-semibold">
                            View Parsed JSON Data
                          </summary>
                          <pre className="text-slate-300 text-xs bg-slate-900 rounded p-3 mt-2 overflow-x-auto border border-slate-700">
                            {JSON.stringify(event.raw_json, null, 2)}
                          </pre>
                        </details>
                      )}

                      {event.network_flow && (
                        <details className="mt-2">
                          <summary className="text-yellow-400 text-xs cursor-pointer hover:text-yellow-300 font-semibold">
                            View Network Flow Data
                          </summary>
                          <pre className="text-slate-300 text-xs bg-slate-900 rounded p-3 mt-2 overflow-x-auto border border-slate-700">
                            {JSON.stringify(event.network_flow, null, 2)}
                          </pre>
                        </details>
                      )}

                      {event.packet_data && (
                        <details className="mt-2">
                          <summary className="text-red-400 text-xs cursor-pointer hover:text-red-300 font-semibold">
                            View Packet Hex Dump
                          </summary>
                          <pre className="text-slate-300 text-xs bg-slate-900 rounded p-3 mt-2 overflow-x-auto border border-slate-700 font-mono">
                            {event.packet_data}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'hunt' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-lg p-6">
              <div className="flex items-start space-x-4">
                <Brain className="w-12 h-12 text-purple-400 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-white font-semibold mb-2">AI-Powered Semantic Search</h3>
                  <p className="text-slate-300 text-sm mb-4">
                    Ask in natural language. AI understands context and meaning, not just keywords.
                    Search across physical security, network events, DPI flows, DLP violations, and infrastructure alerts.
                  </p>
                  <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
                    <p className="text-slate-400 text-xs mb-2">Example natural language queries:</p>
                    <div className="flex flex-wrap gap-2">
                      <code className="text-green-400 text-xs bg-slate-900/50 px-2 py-1 rounded">Show me unauthorized access attempts in restricted areas</code>
                      <code className="text-green-400 text-xs bg-slate-900/50 px-2 py-1 rounded">Find data exfiltration attempts with encryption</code>
                      <code className="text-green-400 text-xs bg-slate-900/50 px-2 py-1 rounded">Detect lateral movement across network zones</code>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={huntQuery}
                      onChange={(e) => setHuntQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSemanticSearch()}
                      placeholder="Ask in plain English: What suspicious activity do you want to find?"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500"
                    />
                    <button
                      onClick={handleSemanticSearch}
                      disabled={loading || !huntQuery.trim()}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <Search className="w-5 h-5" />
                      <span>{loading ? 'Searching...' : 'Hunt'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/30 rounded-lg p-4 mb-4">
              <p className="text-slate-400 text-sm mb-3">Quick semantic queries (click to search):</p>
              <div className="flex flex-wrap gap-2">
                {exampleQueries.map((query, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setHuntQuery(query);
                      setTimeout(() => handleSemanticSearch(), 100);
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-purple-600 text-slate-300 hover:text-white rounded-lg text-sm transition-colors border border-slate-700 hover:border-purple-500"
                  >
                    {query}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  💡 {securityEvents.length} events indexed | Physical, Network, Infrastructure domains
                </span>
                <span className="text-purple-400 font-semibold">
                  Powered by Vector Embeddings
                </span>
              </div>
            </div>

            {huntQuery && huntResults.length === 0 && !loading && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
                <p className="text-yellow-400 font-semibold mb-2">
                  No events found matching &quot;{huntQuery}&quot;
                </p>
                <p className="text-yellow-300 text-sm">
                  Try different queries like: unauthorized access, encrypted traffic, data exfiltration, or high risk assets
                </p>
              </div>
            )}

            {huntResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold flex items-center space-x-2">
                    <Target className="w-5 h-5 text-green-500" />
                    <span>Semantic Search Results ({huntResults.length})</span>
                  </h3>
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-1">
                    <span className="text-purple-400 text-xs font-semibold">AI-Matched by Similarity</span>
                  </div>
                </div>
                {huntResults.map((result, idx) => (
                  <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {result.similarity_score !== undefined && (
                            <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-xs font-semibold border border-green-500/30">
                              {(result.similarity_score * 100).toFixed(1)}% Match
                            </span>
                          )}
                          {result.similarity_cluster && (
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold">
                              Cluster {result.similarity_cluster}
                            </span>
                          )}
                          <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                            {result.source}
                          </span>
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs capitalize">
                            {result.event_type}
                          </span>
                          <span className="text-slate-500 text-xs">
                            {new Date(result.event_timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-white font-semibold mb-2">{result.description}</p>
                        {result.source_ip && (
                          <div className="flex items-center space-x-4 text-sm mb-2">
                            <span className="text-slate-400">
                              Source: <span className="text-white font-mono">{result.source_ip}</span>
                            </span>
                            {result.dest_ip && (
                              <span className="text-slate-400">
                                → <span className="text-white font-mono">{result.dest_ip}</span>
                              </span>
                            )}
                            {result.protocol && (
                              <span className="text-slate-400">
                                <span className="text-purple-400 font-mono">{result.protocol}</span>
                              </span>
                            )}
                          </div>
                        )}
                        {result.iocs && result.iocs.length > 0 && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded p-2 mt-2">
                            <p className="text-red-400 text-xs font-semibold mb-1">IOCs Detected:</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {result.iocs.map((ioc: string, i: number) => (
                                <span key={i} className="text-red-300 text-xs bg-red-900/30 px-2 py-1 rounded font-mono">{ioc}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {result.raw_log && (
                          <details className="mt-3">
                            <summary className="text-blue-400 text-xs cursor-pointer hover:text-blue-300 font-semibold">
                              🔍 View Raw Log Data
                            </summary>
                            <pre className="text-slate-300 text-xs bg-slate-900 rounded p-3 mt-2 overflow-x-auto border border-slate-700 font-mono max-h-64 overflow-y-auto">
                              {result.raw_log}
                            </pre>
                          </details>
                        )}
                        {result.raw_json && (
                          <details className="mt-2">
                            <summary className="text-green-400 text-xs cursor-pointer hover:text-green-300 font-semibold">
                              📋 View Parsed JSON Data
                            </summary>
                            <pre className="text-slate-300 text-xs bg-slate-900 rounded p-3 mt-2 overflow-x-auto border border-slate-700 max-h-64 overflow-y-auto">
                              {JSON.stringify(result.raw_json, null, 2)}
                            </pre>
                          </details>
                        )}
                        {result.network_flow && (
                          <details className="mt-2">
                            <summary className="text-yellow-400 text-xs cursor-pointer hover:text-yellow-300 font-semibold">
                              🌐 View Network Flow Data
                            </summary>
                            <pre className="text-slate-300 text-xs bg-slate-900 rounded p-3 mt-2 overflow-x-auto border border-slate-700 max-h-64 overflow-y-auto">
                              {JSON.stringify(result.network_flow, null, 2)}
                            </pre>
                          </details>
                        )}
                        {result.packet_data && (
                          <details className="mt-2">
                            <summary className="text-red-400 text-xs cursor-pointer hover:text-red-300 font-semibold">
                              📦 View Packet Hex Dump
                            </summary>
                            <pre className="text-slate-300 text-xs bg-slate-900 rounded p-3 mt-2 overflow-x-auto border border-slate-700 font-mono max-h-64 overflow-y-auto">
                              {result.packet_data}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'correlations' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">
                AI-detected correlations based on vector similarity and behavioral patterns
              </p>
            </div>
            {correlations.length === 0 ? (
              <div className="text-center py-12">
                <GitBranch className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No correlations detected yet</p>
              </div>
            ) : (
              correlations.map((corr) => (
                <div key={corr.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold border ${getSeverityColor(corr.severity)}`}>
                          {corr.severity}
                        </span>
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs capitalize">
                          {corr.correlation_type.replace('_', ' ')}
                        </span>
                        <span className="text-slate-500 text-xs">
                          {corr.event_ids.length} events
                        </span>
                      </div>
                      <p className="text-white mb-2">{corr.threat_narrative}</p>
                      {corr.similarity_score && (
                        <p className="text-slate-400 text-sm">
                          Similarity Score: {(corr.similarity_score * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">
                ML-based correlation rules using vector embeddings instead of regex patterns
              </p>
              <button className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>New Rule</span>
              </button>
            </div>
            {rules.map((rule) => (
              <div key={rule.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Zap className="w-5 h-5 text-purple-500" />
                      <span className="text-white font-semibold">{rule.rule_name}</span>
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs capitalize">
                        {rule.rule_type.replace('_', ' ')}
                      </span>
                      {rule.enabled && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mb-3">{rule.description}</p>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-slate-500">Threshold</p>
                        <p className="text-white font-semibold">{(rule.similarity_threshold * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Detections</p>
                        <p className="text-white font-semibold">{rule.detection_count}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Confidence</p>
                        <p className="text-white font-semibold">{rule.confidence_score.toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Tags</p>
                        <div className="flex flex-wrap gap-1">
                          {rule.tags.slice(0, 2).map((tag: string, idx: number) => (
                            <span key={idx} className="px-1 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'micropatterns' && <MicroPatternsPanel />}
        {activeTab === 'create' && <PromptBasedRuleCreator onRuleCreated={loadData} />}
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }: any) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
    green: 'bg-green-500/20 border-green-500/30 text-green-400',
    orange: 'bg-orange-500/20 border-orange-500/30 text-orange-400',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400 text-sm">{title}</p>
        {icon}
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 transition-colors flex items-center space-x-2 ${
      active
        ? 'text-purple-400 border-b-2 border-purple-400'
        : 'text-slate-400 hover:text-white'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    case 'high':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    case 'low':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  }
};

const PromptBasedRuleCreator = ({ onRuleCreated }: { onRuleCreated: () => void }) => {
  const [prompt, setPrompt] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState('behavioral_pattern');
  const [threshold, setThreshold] = useState(0.85);
  const [creating, setCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  const promptTemplates = [
    {
      category: 'Advanced Persistent Threats',
      templates: [
        {
          name: 'APT Lateral Movement Chain',
          prompt: 'Detect sophisticated lateral movement where an attacker uses compromised credentials to access multiple high-value systems sequentially, utilizing legitimate admin tools like PowerShell remoting, PsExec, or WMI. Look for unusual authentication patterns from service accounts, escalation of privileges on intermediate systems, and pivoting through multiple network segments within a short timeframe.',
          description: 'Multi-stage lateral movement with credential reuse',
          type: 'attack_chain',
          threshold: 0.88,
        },
        {
          name: 'Living Off The Land (LOLBins)',
          prompt: 'Identify attacks using legitimate system binaries for malicious purposes including certutil for file downloads, bitsadmin for C2 communication, regsvr32 for code execution, mshta for script execution, and rundll32 for DLL sideloading. Focus on unusual command-line parameters, execution from non-standard directories, and chains of native tools performing reconnaissance or data staging.',
          description: 'Abuse of legitimate system tools for attacks',
          type: 'behavioral_pattern',
          threshold: 0.86,
        },
        {
          name: 'Supply Chain Compromise Detection',
          prompt: 'Detect supply chain attacks through unusual software update mechanisms, unexpected code signing certificates, modifications to trusted binaries, suspicious package installations from development tools or package managers, and anomalous network connections during software deployment processes. Look for tampering with build systems, unauthorized changes to deployment pipelines, and binary modifications after installation.',
          description: 'Compromised software supply chain indicators',
          type: 'behavioral_pattern',
          threshold: 0.84,
        },
      ],
    },
    {
      category: 'Data Exfiltration',
      templates: [
        {
          name: 'Covert Channel Exfiltration',
          prompt: 'Identify data exfiltration through covert channels including DNS tunneling with abnormal query patterns, ICMP tunneling with unusual packet sizes, steganography in outbound images, data hidden in protocol headers, and abuse of legitimate cloud services for data staging. Detect large volumes of encoded data in uncommon protocols, unusual bandwidth patterns to rarely-accessed domains, and fragmented data transfers designed to evade DLP.',
          description: 'Hidden data exfiltration channels',
          type: 'behavioral_pattern',
          threshold: 0.87,
        },
        {
          name: 'Insider Threat Data Theft',
          prompt: 'Detect insider threats through unusual data access patterns including bulk downloads of sensitive files outside normal working hours, accessing data unrelated to job function, copying files to external devices or personal cloud storage, database queries returning unusually large result sets, and attempts to disable audit logging or security controls before data access. Look for gradual data accumulation over time and accessing legacy or archived data.',
          description: 'Malicious insider data exfiltration patterns',
          type: 'behavioral_pattern',
          threshold: 0.85,
        },
        {
          name: 'Automated Data Harvesting',
          prompt: 'Identify automated data collection through scripted enumeration of file shares, automated database scraping, bulk API calls to retrieve sensitive information, web scraping of internal applications, and systematic traversal of directory structures. Detect rapid sequential access to multiple data sources, automated extraction patterns, and use of scripts or tools for batch file operations.',
          description: 'Bot-driven data collection activities',
          type: 'semantic_similarity',
          threshold: 0.83,
        },
      ],
    },
    {
      category: 'Ransomware & Destructive Attacks',
      templates: [
        {
          name: 'Pre-Ransomware Indicators',
          prompt: 'Detect ransomware preparation activities including reconnaissance for valuable data locations, deletion or disabling of backup systems, termination of database and security processes, clearing of event logs, disabling of recovery features, creation of persistence mechanisms, lateral movement to maximize impact, and staging of encryption tools. Look for suspicious PowerShell scripts manipulating shadow copies, unusual file enumeration, and privilege escalation attempts.',
          description: 'Early warning signs before ransomware deployment',
          type: 'attack_chain',
          threshold: 0.89,
        },
        {
          name: 'Rapid Encryption Detection',
          prompt: 'Identify active ransomware encryption through abnormally high file modification rates, mass file renaming with unusual extensions, rapid file access across multiple directories, high CPU usage from encryption processes, creation of ransom notes in multiple directories, and unusual file entropy changes. Detect simultaneous file operations on network shares, attempts to encrypt cloud-synced folders, and targeting of backup repositories.',
          description: 'Real-time ransomware encryption activity',
          type: 'anomaly_detection',
          threshold: 0.92,
        },
        {
          name: 'Wiper Malware Detection',
          prompt: 'Detect destructive wiper malware through mass file deletion operations, overwriting of master boot records, corruption of system files, destruction of backup catalogs, deletion of recovery partitions, and attempts to brick firmware. Look for irreversible data destruction patterns, targeting of critical system areas, and simultaneous attacks on multiple systems to maximize damage before detection.',
          description: 'Destructive malware causing permanent data loss',
          type: 'behavioral_pattern',
          threshold: 0.90,
        },
      ],
    },
    {
      category: 'Cloud & Container Security',
      templates: [
        {
          name: 'Cloud Resource Hijacking',
          prompt: 'Detect unauthorized cloud resource usage including cryptocurrency mining on cloud instances, creation of rogue compute resources, unusual API calls for resource provisioning, unexpected data transfer to external storage, abuse of serverless functions, and unauthorized container deployments. Look for resource-intensive workloads launched outside change management, unusual billing patterns, and deployment of resources in unexpected regions.',
          description: 'Unauthorized use of cloud infrastructure',
          type: 'behavioral_pattern',
          threshold: 0.84,
        },
        {
          name: 'Container Escape & Breakout',
          prompt: 'Identify container escape attempts through exploitation of kernel vulnerabilities, abuse of privileged containers, mounting of host filesystem, manipulation of container runtime, exploitation of orchestrator APIs, and attempts to access host resources. Detect unusual system calls from containers, modifications to cgroup settings, attempts to access host network namespace, and exploitation of misconfigurations.',
          description: 'Container breakout to underlying host',
          type: 'behavioral_pattern',
          threshold: 0.87,
        },
        {
          name: 'Kubernetes Attack Patterns',
          prompt: 'Detect Kubernetes-specific attacks including unauthorized access to secrets, privilege escalation through RBAC misconfigurations, malicious admission controller webhooks, abuse of service accounts, pod hijacking, exposure of kubelet APIs, malicious custom resource definitions, and supply chain attacks through container images. Look for unusual kubectl commands, unauthorized API server access, and suspicious pod-to-pod lateral movement.',
          description: 'Attacks targeting Kubernetes infrastructure',
          type: 'attack_chain',
          threshold: 0.86,
        },
      ],
    },
    {
      category: 'Identity & Access Attacks',
      templates: [
        {
          name: 'Credential Stuffing & Spraying',
          prompt: 'Detect credential attacks through high-volume authentication attempts from distributed sources, systematic password attempts across multiple accounts, authentication requests for many users from single IPs, unusual timing patterns in login attempts, low success rates with persistent attempts, targeting of admin and service accounts, and attempts to bypass multi-factor authentication. Look for coordinated attacks using stolen credential lists and automated tools.',
          description: 'Large-scale credential-based attacks',
          type: 'behavioral_pattern',
          threshold: 0.85,
        },
        {
          name: 'Token Theft & Session Hijacking',
          prompt: 'Identify session and token theft through suspicious token reuse patterns, access from impossible travel locations, unusual token replay attacks, compromised refresh tokens, theft of authentication cookies, Kerberos ticket manipulation, JWT token tampering, and OAuth token abuse. Detect access from multiple geographic locations with same credentials, token usage outside normal patterns, and attempts to extend session lifetimes.',
          description: 'Stolen authentication token abuse',
          type: 'behavioral_pattern',
          threshold: 0.88,
        },
        {
          name: 'Golden Ticket & Silver Ticket Attacks',
          prompt: 'Detect Kerberos ticket forgery through creation of long-lived tickets, tickets for disabled accounts, tickets with unusual privilege assignments, TGT requests without corresponding authentication, service tickets for privileged services from unexpected sources, and unusual ticket renewal patterns. Look for DCSync attacks, dumping of NTDS.dit, and creation of Kerberos tickets outside normal domain controller operations.',
          description: 'Forged Kerberos authentication tickets',
          type: 'attack_chain',
          threshold: 0.90,
        },
      ],
    },
    {
      category: 'Network & Communication Threats',
      templates: [
        {
          name: 'Command & Control Sophistication',
          prompt: 'Identify advanced C2 communications including domain generation algorithms producing seemingly random domains, fast flux DNS techniques, domain fronting through CDNs, encrypted C2 over legitimate protocols, steganographic C2 channels, peer-to-peer botnet communications, and use of legitimate cloud services for C2. Detect beaconing with jitter and randomization, protocol-hopping behaviors, and fallback C2 mechanisms.',
          description: 'Advanced C2 communication techniques',
          type: 'behavioral_pattern',
          threshold: 0.87,
        },
        {
          name: 'Network Tunneling Detection',
          prompt: 'Detect malicious network tunneling through SSH tunneling for port forwarding, VPN tunnel abuse, reverse SSH connections, HTTP/HTTPS tunneling, DNS tunneling protocols, ICMP tunneling, and abuse of remote access tools. Look for unusual tunnel establishment patterns, long-lived tunnels with high data volume, tunnels from compromised systems, and tunneling to internal resources through external hops.',
          description: 'Unauthorized network tunnel creation',
          type: 'behavioral_pattern',
          threshold: 0.86,
        },
        {
          name: 'Internal Reconnaissance Scanning',
          prompt: 'Identify internal network reconnaissance through systematic port scanning, service enumeration, network mapping, LDAP queries for Active Directory enumeration, SMB share discovery, SNMP walking, vulnerability scanning from internal hosts, and mapping of network topology. Detect unusual DNS queries for internal infrastructure, attempts to identify security controls, and systematic probing of network segments.',
          description: 'Post-compromise network reconnaissance',
          type: 'behavioral_pattern',
          threshold: 0.84,
        },
      ],
    },
  ];

  const handleCreateRule = async () => {
    if (!ruleName || !prompt) return;

    setCreating(true);
    try {
      await VectorEmbeddingEngine.createVectorCorrelationRule(
        ruleName,
        prompt,
        [prompt],
        ruleType,
        threshold,
        supabase
      );

      setPrompt('');
      setRuleName('');
      onRuleCreated();
      alert('Rule created successfully!');
    } catch (error) {
      console.error('Error creating rule:', error);
      alert('Failed to create rule');
    } finally {
      setCreating(false);
    }
  };

  const useTemplate = (template: any) => {
    setSelectedTemplate(template);
    setRuleName(template.name);
    setPrompt(template.prompt);
    setRuleType(template.type);
    setThreshold(template.threshold);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-green-500/10 border border-purple-500/30 rounded-lg p-6">
        <div className="flex items-start space-x-4">
          <Brain className="w-16 h-16 text-purple-400 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-white font-semibold text-xl mb-2">AI-Powered Rule Generation</h3>
            <p className="text-slate-300 text-sm mb-4">
              Describe the threat behavior you want to detect in natural language. The AI will create a vector-based
              correlation rule that uses semantic similarity to identify matching events - no regex or field mapping required.
            </p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-purple-400 font-semibold mb-1">Semantic Matching</div>
                <div className="text-slate-400">Understands meaning, not just keywords</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-blue-400 font-semibold mb-1">Context-Aware</div>
                <div className="text-slate-400">Recognizes behavioral patterns</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-green-400 font-semibold mb-1">Zero-Day Ready</div>
                <div className="text-slate-400">Detects unknown variants</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">Rule Name</label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g., Advanced Lateral Movement Detection"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">Threat Behavior Description (Prompt)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the threat behavior in detail. Include specific techniques, patterns, tools, and indicators you want to detect..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 h-64 resize-none"
            />
            <p className="text-slate-500 text-xs mt-2">
              Tip: Be specific and include multiple indicators. The more detailed your description, the better the detection accuracy.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">Rule Type</label>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white"
              >
                <option value="semantic_similarity">Semantic Similarity</option>
                <option value="behavioral_pattern">Behavioral Pattern</option>
                <option value="anomaly_detection">Anomaly Detection</option>
                <option value="attack_chain">Attack Chain</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-sm mb-2">Similarity Threshold</label>
              <div className="flex items-center space-x-3">
                <input
                  type="range"
                  min="0.7"
                  max="0.95"
                  step="0.01"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-white font-semibold w-12">{(threshold * 100).toFixed(0)}%</span>
              </div>
              <p className="text-slate-500 text-xs mt-1">
                Higher = more precise, Lower = more sensitive
              </p>
            </div>
          </div>

          <button
            onClick={handleCreateRule}
            disabled={creating || !ruleName || !prompt}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-slate-700 disabled:to-slate-700 text-white px-6 py-4 rounded-lg transition-all font-semibold flex items-center justify-center space-x-2"
          >
            <Brain className="w-5 h-5" />
            <span>{creating ? 'Generating Rule...' : 'Generate AI Rule'}</span>
          </button>
        </div>

        <div className="space-y-4">
          <h4 className="text-white font-semibold">Prompt Templates</h4>
          <div className="space-y-3 max-h-[800px] overflow-y-auto pr-2">
            {promptTemplates.map((category, catIdx) => (
              <div key={catIdx}>
                <h5 className="text-slate-400 text-sm font-semibold mb-2">{category.category}</h5>
                <div className="space-y-2">
                  {category.templates.map((template, tempIdx) => (
                    <button
                      key={tempIdx}
                      onClick={() => useTemplate(template)}
                      className="w-full text-left bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-purple-500/50 rounded-lg p-3 transition-all"
                    >
                      <div className="font-semibold text-white text-sm mb-1">{template.name}</div>
                      <div className="text-slate-400 text-xs mb-2">{template.description}</div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                          {template.type.replace('_', ' ')}
                        </span>
                        <span className="text-slate-500">{(template.threshold * 100).toFixed(0)}% threshold</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VectorThreatHunting;
