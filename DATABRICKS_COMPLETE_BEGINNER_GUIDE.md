# 🎓 Complete Beginner's Guide to Databricks SIEM
## Every Single Step with All Commands - No Experience Required!

**Time needed:** 2 hours
**Difficulty:** Beginner-friendly
**What you'll build:** A complete security monitoring system on Databricks

---

## 📚 Table of Contents

1. [What is Databricks?](#what-is-databricks)
2. [Getting Your Accounts Ready](#getting-your-accounts-ready)
3. [Setting Up Your Computer](#setting-up-your-computer)
4. [Creating Your First Cluster](#creating-your-first-cluster)
5. [Building the Database Structure](#building-the-database-structure)
6. [Creating Security Secrets](#creating-security-secrets)
7. [Writing Your First Notebook](#writing-your-first-notebook)
8. [Automating Everything](#automating-everything)
9. [Testing Your System](#testing-your-system)
10. [Troubleshooting Guide](#troubleshooting-guide)

---

## 🤔 What is Databricks?

Think of Databricks as a **super-powered computer in the cloud** that can:
- Store MILLIONS of security events (logs)
- Search through them INSTANTLY
- Find patterns that humans would miss
- Run 24/7 without you touching it

**Why use it for security?**
- Your current database (Supabase) is great for apps, but slows down with lots of data
- Databricks can handle BILLIONS of security logs
- It has built-in AI to detect threats automatically

---

## 🎫 Getting Your Accounts Ready

### Step 1: Sign Up for Databricks (5 minutes)

1. Go to: https://databricks.com/try-databricks
2. Click "Start Free Trial"
3. Choose your cloud:
   - **AWS** (Amazon) - Most common
   - **Azure** (Microsoft) - If you use Office 365
   - **GCP** (Google) - If you use Gmail for work
4. Fill in your details:
   - Work email (personal email works too!)
   - Company name (can be your own name)
   - Phone number
5. Click "Start Free Trial"
6. Check your email for verification link
7. Click the link and set a password

**✅ Success check:** You should see a Databricks dashboard with "Workspace" on the left

---

### Step 2: Get Your Supabase Info (3 minutes)

We need to connect Databricks to your existing Supabase database:

1. Open a new tab: https://supabase.com/dashboard
2. Click on your project
3. Click the **Settings** icon (⚙️) at the bottom left
4. Click **API** in the left menu
5. Copy these THREE things to a notepad:

```
Project URL: https://xxxxxxxxxxx.supabase.co
anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
service_role secret: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
```

**⚠️ IMPORTANT:** The service_role key is like your master password - NEVER share it!

**✅ Success check:** You have all three values copied safely

---

## 💻 Setting Up Your Computer

### Step 3: Install Python (10 minutes)

**On Windows:**

1. Go to: https://www.python.org/downloads/
2. Click the big yellow "Download Python 3.12" button
3. Run the downloaded file
4. **IMPORTANT:** Check the box "Add Python to PATH"
5. Click "Install Now"
6. Wait for it to finish (3-5 minutes)
7. Open Command Prompt:
   - Press Windows Key + R
   - Type `cmd`
   - Press Enter
8. Test Python:
   ```cmd
   python --version
   ```
   **✅ You should see:** `Python 3.12.x`

**On Mac:**

1. Open Terminal:
   - Press Cmd + Space
   - Type "Terminal"
   - Press Enter
2. Install Homebrew (package manager):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. Install Python:
   ```bash
   brew install python@3.12
   ```
4. Test Python:
   ```bash
   python3 --version
   ```
   **✅ You should see:** `Python 3.12.x`

---

### Step 4: Install Databricks CLI (5 minutes)

The CLI (Command Line Interface) lets you control Databricks from your computer.

**On Windows (Command Prompt):**

```cmd
python -m pip install --upgrade pip
pip install databricks-cli
```

Wait 2-3 minutes for it to install.

Test it:
```cmd
databricks --version
```

**✅ You should see:** `Version 0.xxx`

**On Mac/Linux (Terminal):**

```bash
python3 -m pip install --upgrade pip
pip3 install databricks-cli
```

Test it:
```bash
databricks --version
```

**✅ You should see:** `Version 0.xxx`

---

### Step 5: Connect Your Computer to Databricks (5 minutes)

Now we'll link your computer to your Databricks account:

1. Go to Databricks in your browser
2. Click your email/username in the top-right corner
3. Click **User Settings**
4. Click **Developer** tab
5. Under "Access tokens", click **Generate new token**
6. Fill in:
   - Comment: `My Computer`
   - Lifetime: 90 days
7. Click **Generate**
8. **IMMEDIATELY** copy the token (it looks like: `dapi1234abcd...`)
   - **You can only see it once!**
   - Save it in your notepad

Now configure your computer:

**In your terminal/command prompt:**

```bash
databricks configure --token
```

It will ask questions. Answer:

```
Databricks Host (should begin with https://): https://your-workspace.cloud.databricks.com
```
**👆 Copy this from your browser address bar when you're in Databricks**

```
Token: dapi1234abcd...
```
**👆 Paste the token you just generated**

Press Enter.

**Test the connection:**

```bash
databricks workspace ls /
```

**✅ You should see:** A list of folders like `/Users`, `/Shared`, etc.

**❌ If you see "Error":** Double-check your workspace URL and token

---

## 🖥️ Creating Your First Cluster

A cluster is like renting a super-computer to process your data.

### Step 6: Create a Compute Cluster (10 minutes)

1. In Databricks, click **Compute** on the left sidebar
2. Click the blue **Create Compute** button
3. Fill in the form:

```
Cluster name: my-siem-cluster

Policy: Leave as "Unrestricted"

Cluster mode: Single Node
  👆 Cheapest option for learning

Databricks Runtime Version: 14.3 LTS (includes Apache Spark 3.5.0, Scala 2.12)
  👆 Pick the one labeled "LTS" (Long Term Support)

Node type: Select based on your cloud:
  • AWS: i3.xlarge
  • Azure: Standard_DS3_v2
  • GCP: n1-highmem-4
  👆 These are the smallest/cheapest options

Terminate after: 60 minutes of inactivity
  👆 This stops the cluster when not in use to save money!
```

4. Click **Create Compute**
5. Wait 3-5 minutes while it starts (you'll see a blue spinning circle)

**💰 Cost Note:** This cluster costs about $0.50/hour. Since we set auto-terminate, it will stop when idle.

**✅ Success check:** You see a green circle and "Running" next to your cluster name

---

## 🗄️ Building the Database Structure

Now we'll create the "filing cabinets" to organize your security data.

### Step 7: Create Your Data Catalog (5 minutes)

Think of a catalog as your main filing cabinet.

1. Click **Data** on the left sidebar
2. Click **Create Catalog** (blue button)
3. Fill in:
   ```
   Name: siem_platform
   Comment: Security Information and Event Management data
   ```
4. Click **Create**

**✅ Success check:** You see "siem_platform" in the catalog list

---

### Step 8: Create Schemas (Folders) (5 minutes)

Schemas are like drawers in your filing cabinet.

1. Click on your `siem_platform` catalog
2. Click **Create Schema**
3. Create these FIVE schemas one by one:

**Schema 1:**
```
Name: security_events
Comment: Main security events and alerts
```
Click **Create**

**Schema 2:**
```
Name: threat_intelligence
Comment: Known bad IPs, malware signatures, etc
```
Click **Create**

**Schema 3:**
```
Name: user_analytics
Comment: User behavior and anomaly detection
```
Click **Create**

**Schema 4:**
```
Name: compliance
Comment: Compliance reports and audit trails
```
Click **Create**

**Schema 5:**
```
Name: unity_audit
Comment: Audit logs of who accessed what data
```
Click **Create**

**✅ Success check:** You see all 5 schemas listed under siem_platform

---

### Step 9: Create Your First Table (15 minutes)

Tables are like individual file folders that hold specific types of data.

1. Click **SQL Editor** on the left sidebar
2. Click **Create → Query**
3. Name it: `01_create_events_table`

Now copy this ENTIRE code block and paste it:

```sql
-- Select which database to use
USE CATALOG siem_platform;
USE SCHEMA security_events;

-- Create the events table
CREATE TABLE IF NOT EXISTS events (
  -- Basic info about each security event
  event_id STRING NOT NULL,
  event_time TIMESTAMP NOT NULL,
  event_type STRING,
  severity STRING,
  category STRING,

  -- Where the event came from
  src_ip STRING,
  src_port INT,
  src_hostname STRING,

  -- Where it was going to
  dst_ip STRING,
  dst_port INT,
  dst_hostname STRING,

  -- Who did it
  user_id STRING,
  user_email STRING,
  user_name STRING,

  -- The raw data
  raw_data STRING,
  normalized_data STRING,

  -- AI/ML scores
  risk_score DOUBLE,
  confidence_score DOUBLE,

  -- When we received it
  ingestion_time TIMESTAMP DEFAULT current_timestamp(),
  processing_time TIMESTAMP,

  -- Auto-generated date for faster searches
  event_date DATE GENERATED ALWAYS AS (CAST(event_time AS DATE))
)
USING DELTA
PARTITIONED BY (event_date, severity)
COMMENT 'Main table for all security events'
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);

-- Show success message
SELECT 'Events table created successfully!' as message;
```

4. Click the blue **Run** button (or press Ctrl+Enter on Windows, Cmd+Return on Mac)
5. Wait 5-10 seconds

**✅ Success check:** You see "Events table created successfully!" at the bottom

**🤔 What just happened?**
- You created a table with 20+ columns
- It's partitioned (organized) by date and severity for fast searches
- Delta format gives you time-travel (can undo changes!)
- Auto-optimize makes it faster over time

---

### Step 10: Create More Tables (10 minutes)

Let's create the other important tables. Create a new query for each:

**Query: `02_create_alerts_table`**

```sql
USE CATALOG siem_platform;
USE SCHEMA security_events;

CREATE TABLE IF NOT EXISTS alerts (
  alert_id STRING NOT NULL,
  event_id STRING,
  alert_time TIMESTAMP DEFAULT current_timestamp(),
  alert_name STRING NOT NULL,
  alert_type STRING,
  severity STRING,
  status STRING DEFAULT 'open',

  rule_id STRING,
  rule_name STRING,
  risk_score DOUBLE,
  confidence_score DOUBLE,

  assigned_to STRING,
  assigned_time TIMESTAMP,

  investigation_notes STRING,
  resolution_status STRING,
  resolution_time TIMESTAMP,

  mitre_tactics ARRAY<STRING>,
  mitre_techniques ARRAY<STRING>,

  affected_assets ARRAY<STRING>,
  affected_users ARRAY<STRING>
)
USING DELTA
COMMENT 'Security alerts requiring investigation';

SELECT 'Alerts table created!' as message;
```

Click **Run**

---

**Query: `03_create_threat_intel_tables`**

```sql
USE CATALOG siem_platform;
USE SCHEMA threat_intelligence;

-- Table for bad IPs, domains, file hashes
CREATE TABLE IF NOT EXISTS iocs (
  ioc_id STRING NOT NULL,
  ioc_value STRING NOT NULL,
  ioc_type STRING NOT NULL,
  threat_type STRING,
  severity STRING,
  confidence_score DOUBLE,

  source STRING,
  feed_name STRING,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,

  description STRING,
  tags ARRAY<STRING>,

  created_at TIMESTAMP DEFAULT current_timestamp(),
  updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
COMMENT 'Indicators of Compromise from threat feeds';

-- Table tracking threat feed sources
CREATE TABLE IF NOT EXISTS threat_feeds (
  feed_id STRING NOT NULL,
  feed_name STRING NOT NULL,
  feed_url STRING,
  feed_type STRING,
  last_updated TIMESTAMP,
  ioc_count BIGINT,
  status STRING
)
USING DELTA
COMMENT 'Threat intelligence feed sources';

SELECT 'Threat intel tables created!' as message;
```

Click **Run**

---

**Query: `04_create_user_analytics_tables`**

```sql
USE CATALOG siem_platform;
USE SCHEMA user_analytics;

-- Table for user behavior profiles
CREATE TABLE IF NOT EXISTS user_behavior_profiles (
  user_id STRING NOT NULL,
  user_email STRING NOT NULL,

  avg_login_time TIME,
  typical_locations ARRAY<STRING>,
  typical_devices ARRAY<STRING>,
  typical_applications ARRAY<STRING>,

  risk_score DOUBLE DEFAULT 0.0,
  anomaly_score DOUBLE DEFAULT 0.0,

  total_events BIGINT DEFAULT 0,
  failed_logins_count BIGINT DEFAULT 0,
  privilege_escalations_count BIGINT DEFAULT 0,

  profile_created TIMESTAMP DEFAULT current_timestamp(),
  last_updated TIMESTAMP DEFAULT current_timestamp(),
  last_seen TIMESTAMP
)
USING DELTA
COMMENT 'User behavior baselines for anomaly detection';

-- Table for user sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id STRING NOT NULL,
  user_id STRING NOT NULL,
  user_email STRING,

  session_start TIMESTAMP,
  session_end TIMESTAMP,
  duration_seconds BIGINT,

  source_ip STRING,
  location STRING,
  device_type STRING,

  events_count BIGINT,
  risk_score DOUBLE,
  anomaly_detected BOOLEAN DEFAULT false
)
USING DELTA
PARTITIONED BY (DATE(session_start))
COMMENT 'User login sessions with risk analysis';

SELECT 'User analytics tables created!' as message;
```

Click **Run**

---

**Query: `05_create_unity_audit_table`**

```sql
USE CATALOG siem_platform;
USE SCHEMA unity_audit;

CREATE TABLE IF NOT EXISTS audit_events (
  event_id STRING NOT NULL,
  workspace_id STRING,
  event_time TIMESTAMP NOT NULL,

  user_email STRING,
  user_id STRING,
  service_principal_name STRING,

  action_name STRING,
  operation_type STRING,

  catalog_name STRING,
  schema_name STRING,
  table_name STRING,
  column_names ARRAY<STRING>,

  status_code INT,
  error_message STRING,

  source_ip STRING,
  user_agent STRING,

  risk_score DOUBLE,
  is_anomalous BOOLEAN DEFAULT false,

  request_id STRING,

  detected_at TIMESTAMP DEFAULT current_timestamp(),
  ingestion_time TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (DATE(event_time))
COMMENT 'Unity Catalog audit logs';

SELECT 'Audit table created!' as message;
```

Click **Run**

---

### Step 11: Verify All Tables (2 minutes)

Let's make sure everything was created correctly:

Create a new query: `06_verify_tables`

```sql
-- Check all tables in security_events
SHOW TABLES IN siem_platform.security_events;

-- Check threat_intelligence tables
SHOW TABLES IN siem_platform.threat_intelligence;

-- Check user_analytics tables
SHOW TABLES IN siem_platform.user_analytics;

-- Check unity_audit table
SHOW TABLES IN siem_platform.unity_audit;
```

Click **Run**

**✅ Success check:** You should see:
- security_events: 2 tables (events, alerts)
- threat_intelligence: 2 tables (iocs, threat_feeds)
- user_analytics: 2 tables (user_behavior_profiles, user_sessions)
- unity_audit: 1 table (audit_events)

**🎉 Total: 7 tables created!**

---

## 🔐 Creating Security Secrets

Now we'll safely store your Supabase credentials in Databricks.

### Step 12: Create Secret Scope (5 minutes)

Open your terminal/command prompt again:

```bash
databricks secrets create-scope --scope siem
```

**✅ You should see:** `Successfully created secret scope: siem`

---

### Step 13: Add Supabase URL (2 minutes)

```bash
databricks secrets put --scope siem --key supabase_url
```

This will open a text editor. Paste your Supabase URL:
```
https://xxxxxxxxxxx.supabase.co
```

**How to save and exit:**
- **Windows (Notepad):** Press Ctrl+S to save, then close the window
- **Mac (nano):** Press Ctrl+X, then Y, then Enter
- **Linux (vim):** Press Esc, type `:wq`, press Enter

**✅ You should see:** `Successfully added secret: supabase_url`

---

### Step 14: Add Supabase Anon Key (2 minutes)

```bash
databricks secrets put --scope siem --key supabase_anon_key
```

Paste your anon key (the eyJ... string), save and exit.

**✅ You should see:** `Successfully added secret: supabase_anon_key`

---

### Step 15: Add Supabase Service Key (2 minutes)

```bash
databricks secrets put --scope siem --key supabase_service_key
```

Paste your service_role key (the eyJ... string), save and exit.

**✅ You should see:** `Successfully added secret: supabase_service_key`

---

### Step 16: Verify Secrets (1 minute)

```bash
databricks secrets list --scope siem
```

**✅ You should see:**
```
Key name               Last updated time
supabase_url           xxxxxxxxxxxxx
supabase_anon_key      xxxxxxxxxxxxx
supabase_service_key   xxxxxxxxxxxxx
```

**🎉 Your credentials are now safely stored!**

---

## 📓 Writing Your First Notebook

Notebooks let you write code that processes your security data.

### Step 17: Create Workspace Folder (3 minutes)

1. In Databricks, click **Workspace** on the left
2. Click your username folder (it looks like: `/Users/your.email@company.com`)
3. Click the three dots next to your name
4. Click **Create → Folder**
5. Name it: `siem`
6. Click **Create**

**✅ Success check:** You see a "siem" folder under your username

---

### Step 18: Create Event Ingestion Notebook (10 minutes)

1. Click on your `siem` folder
2. Click **Create → Notebook**
3. Fill in:
   ```
   Name: 01_ingest_security_events
   Language: Python
   Cluster: my-siem-cluster
   ```
4. Click **Create**

You'll see a blank notebook with a code cell.

---

### Step 19: Add Code to Fetch Events (5 minutes)

Copy and paste this code into the first cell:

```python
# MAGIC %md
# MAGIC # Security Events Ingestion
# MAGIC This notebook fetches security events from Supabase and loads them into Databricks

# COMMAND ----------

# Import libraries
from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
import requests
import json
from datetime import datetime, timedelta

print("✓ Libraries imported successfully!")

# COMMAND ----------

# Get Supabase credentials from secrets
SUPABASE_URL = dbutils.secrets.get(scope="siem", key="supabase_url")
SUPABASE_KEY = dbutils.secrets.get(scope="siem", key="supabase_service_key")

CATALOG_NAME = "siem_platform"
SCHEMA_NAME = "security_events"
TABLE_NAME = "events"

print(f"✓ Configuration loaded")
print(f"  Catalog: {CATALOG_NAME}")
print(f"  Schema: {SCHEMA_NAME}")
print(f"  Table: {TABLE_NAME}")
print(f"  Supabase URL: {SUPABASE_URL}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Events from Supabase

# COMMAND ----------

def fetch_events(hours_back=24):
    """Fetch security events from Supabase"""
    start_time = (datetime.now() - timedelta(hours=hours_back)).isoformat()

    url = f"{SUPABASE_URL}/rest/v1/events"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    params = {
        "timestamp": f"gte.{start_time}",
        "order": "timestamp.asc",
        "limit": 10000
    }

    print(f"Fetching events from Supabase...")
    print(f"  Time range: Last {hours_back} hours")

    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        events = response.json()
        print(f"✓ Fetched {len(events)} events!")
        return events
    else:
        print(f"✗ Error: {response.status_code}")
        print(f"  Message: {response.text}")
        return []

# Fetch events
events_data = fetch_events(hours_back=24)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Events into Delta Table

# COMMAND ----------

if events_data and len(events_data) > 0:
    print(f"Processing {len(events_data)} events...")

    # Convert to DataFrame
    events_df = spark.createDataFrame(events_data)

    # Transform to match our schema
    transformed_df = events_df.select(
        col("id").alias("event_id"),
        col("timestamp").cast("timestamp").alias("event_time"),
        coalesce(col("event_type"), lit("unknown")).alias("event_type"),
        coalesce(col("severity"), lit("low")).alias("severity"),
        coalesce(col("category"), lit("general")).alias("category"),
        col("source_ip").alias("src_ip"),
        col("destination_ip").alias("dst_ip"),
        col("user_id").alias("user_email"),
        col("raw_log").alias("raw_data"),
        coalesce(col("risk_score"), lit(0.0)).cast("double").alias("risk_score"),
        current_timestamp().alias("ingestion_time"),
        current_timestamp().alias("processing_time")
    )

    print("✓ Data transformed")

    # Show sample
    print("\nSample data:")
    transformed_df.show(5, truncate=False)

    # Write to table
    print(f"\nWriting to: {CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}")

    transformed_df.write \
        .mode("append") \
        .format("delta") \
        .saveAsTable(f"{CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}")

    print(f"✓ Successfully ingested {transformed_df.count()} events!")

else:
    print("⚠ No events found")

# COMMAND ----------

# MAGIC %md
# MAGIC ## View Results

# COMMAND ----------

# Query the table
result = spark.sql(f"""
    SELECT
        event_id,
        event_time,
        event_type,
        severity,
        src_ip,
        user_email,
        risk_score
    FROM {CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}
    ORDER BY ingestion_time DESC
    LIMIT 20
""")

print("Most recent events:")
result.show(20, truncate=False)

# COMMAND ----------

# Statistics
stats = spark.sql(f"""
    SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT user_email) as unique_users,
        COUNT(DISTINCT src_ip) as unique_ips,
        ROUND(AVG(risk_score), 2) as avg_risk_score
    FROM {CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}
""")

print("📊 Statistics:")
stats.show(truncate=False)

# COMMAND ----------

print("✅ Event ingestion completed successfully!")
```

---

### Step 20: Run Your Notebook (5 minutes)

1. Make sure your cluster is running (green circle)
2. Click **Run All** at the top of the notebook
3. Watch as each cell executes (you'll see blue bars showing progress)
4. Wait 1-2 minutes

**✅ Success check:** You see:
- "✓ Libraries imported successfully!"
- "✓ Configuration loaded"
- "✓ Fetched X events!" (might be 0 if you have no events yet)
- "✅ Event ingestion completed successfully!"

**🎉 You just ran your first data pipeline!**

---

## 🧪 Testing Your System

Now let's add some fake test data to make sure everything works.

### Step 21: Insert Test Events (5 minutes)

Go back to SQL Editor and create a new query: `07_insert_test_data`

```sql
USE CATALOG siem_platform;
USE SCHEMA security_events;

-- Insert 5 test security events
INSERT INTO events (
    event_id,
    event_time,
    event_type,
    severity,
    category,
    src_ip,
    dst_ip,
    user_email,
    raw_data,
    risk_score,
    ingestion_time,
    processing_time
) VALUES
-- Event 1: Failed login attempt
(
    'test-001',
    current_timestamp(),
    'failed_login',
    'high',
    'authentication',
    '192.168.1.100',
    '10.0.0.50',
    'john.doe@company.com',
    '{"message": "Failed login - wrong password", "attempts": 3}',
    75.0,
    current_timestamp(),
    current_timestamp()
),
-- Event 2: Malware detected
(
    'test-002',
    current_timestamp(),
    'malware_detected',
    'critical',
    'malware',
    '192.168.1.200',
    '10.0.0.50',
    'jane.smith@company.com',
    '{"message": "Trojan detected", "file": "suspicious.exe", "hash": "abc123"}',
    95.0,
    current_timestamp(),
    current_timestamp()
),
-- Event 3: Normal file access
(
    'test-003',
    current_timestamp(),
    'file_access',
    'low',
    'data_access',
    '192.168.1.150',
    '10.0.0.100',
    'bob.johnson@company.com',
    '{"message": "File opened", "file": "/documents/report.docx"}',
    10.0,
    current_timestamp(),
    current_timestamp()
),
-- Event 4: Port scan detected
(
    'test-004',
    current_timestamp(),
    'port_scan',
    'high',
    'network',
    '203.0.113.50',
    '10.0.0.1',
    'unknown',
    '{"message": "Port scan detected", "ports_scanned": 1000, "duration_seconds": 10}',
    85.0,
    current_timestamp(),
    current_timestamp()
),
-- Event 5: Successful login from new location
(
    'test-005',
    current_timestamp(),
    'successful_login',
    'medium',
    'authentication',
    '198.51.100.75',
    '10.0.0.50',
    'alice.williams@company.com',
    '{"message": "Login from new location", "location": "Russia", "device": "iPhone"}',
    60.0,
    current_timestamp(),
    current_timestamp()
);

SELECT 'Test data inserted successfully!' as message;
```

Click **Run**

**✅ Success check:** "Test data inserted successfully!"

---

### Step 22: Query Your Test Data (3 minutes)

Create a new query: `08_view_test_data`

```sql
USE CATALOG siem_platform;
USE SCHEMA security_events;

-- View all events
SELECT
    event_id,
    event_time,
    event_type,
    severity,
    src_ip,
    user_email,
    risk_score
FROM events
ORDER BY event_time DESC
LIMIT 10;
```

Click **Run**

**✅ Success check:** You see your 5 test events in a table!

---

### Step 23: Filter High-Risk Events (2 minutes)

Create a new query: `09_high_risk_events`

```sql
USE CATALOG siem_platform;
USE SCHEMA security_events;

-- Find high-risk events (score >= 70)
SELECT
    event_id,
    event_time,
    event_type,
    severity,
    src_ip,
    user_email,
    risk_score
FROM events
WHERE risk_score >= 70.0
ORDER BY risk_score DESC;
```

Click **Run**

**✅ Success check:** You see 4 events with risk scores 75, 85, 95, and 60

---

### Step 24: Create Your First Alert (5 minutes)

Create a new query: `10_create_test_alert`

```sql
USE CATALOG siem_platform;
USE SCHEMA security_events;

-- Create an alert for the malware event
INSERT INTO alerts (
    alert_id,
    event_id,
    alert_time,
    alert_name,
    alert_type,
    severity,
    status,
    risk_score,
    rule_name,
    mitre_tactics,
    mitre_techniques,
    affected_users
) VALUES (
    'alert-001',
    'test-002',
    current_timestamp(),
    'Critical Malware Detected on Endpoint',
    'malware',
    'critical',
    'open',
    95.0,
    'Malware Detection Rule #42',
    array('Execution', 'Persistence'),
    array('T1204.002', 'T1547.001'),
    array('jane.smith@company.com')
);

SELECT 'Alert created successfully!' as message;
```

Click **Run**

**✅ Success check:** "Alert created successfully!"

---

### Step 25: View Your Alerts (2 minutes)

Create a new query: `11_view_alerts`

```sql
USE CATALOG siem_platform;
USE SCHEMA security_events;

SELECT
    alert_id,
    alert_name,
    severity,
    status,
    risk_score,
    affected_users
FROM alerts
ORDER BY alert_time DESC;
```

Click **Run**

**✅ Success check:** You see your malware alert!

---

## 🎉 CONGRATULATIONS!

You've successfully built a complete security monitoring system on Databricks!

### 📊 What You've Built:

✅ **7 Tables** storing different types of security data
✅ **1 Cluster** processing data in the cloud
✅ **1 Notebook** automatically fetching and loading events
✅ **Test Data** proving everything works
✅ **Security Secrets** safely storing credentials

### 🎯 What You Can Do Now:

1. **Monitor Security Events** - All your security logs in one place
2. **Detect Threats** - Query for suspicious activity
3. **Create Alerts** - Automatically flag dangerous events
4. **Analyze Patterns** - Find trends in your data
5. **Scale Infinitely** - Handle millions of events per day

---

## 🔧 Troubleshooting Guide

### Problem: "Catalog not found"

**Cause:** You're trying to use a catalog that doesn't exist

**Fix:**
```sql
-- Check which catalogs exist
SHOW CATALOGS;

-- Create it if missing
CREATE CATALOG IF NOT EXISTS siem_platform;
```

---

### Problem: "Cluster terminated unexpectedly"

**Cause:** The cluster auto-terminated after 60 minutes of inactivity

**Fix:**
1. Go to **Compute**
2. Click your cluster name
3. Click **Start**
4. Wait 3 minutes

---

### Problem: "Secret not found"

**Cause:** The secret wasn't added correctly

**Fix:**
```bash
# List all secrets
databricks secrets list --scope siem

# If missing, add it again
databricks secrets put --scope siem --key supabase_url
```

---

### Problem: "Permission denied" when creating tables

**Cause:** You don't have permission on the catalog

**Fix:**
Ask your Databricks admin to run:
```sql
GRANT ALL PRIVILEGES ON CATALOG siem_platform TO `your.email@company.com`;
```

Or create a catalog in your personal space:
```sql
CREATE CATALOG IF NOT EXISTS your_username;
USE CATALOG your_username;
-- Then create schemas as before
```

---

### Problem: Notebook won't run

**Fix:**
1. Check cluster is running (green circle)
2. At top of notebook, click dropdown that says "Detached"
3. Select your cluster
4. Try again

---

### Problem: "Table already exists" error

**Solution:** This is actually fine! Just skip that step or use:
```sql
DROP TABLE IF EXISTS siem_platform.security_events.events;
-- Then create it again
```

---

### Problem: Python import errors

**Fix:**
Your cluster might be missing a library. Add it:
1. Go to **Compute**
2. Click your cluster
3. Click **Libraries** tab
4. Click **Install New**
5. Select **PyPI**
6. Enter library name (e.g., `requests`)
7. Click **Install**
8. Wait 2 minutes
9. Restart your cluster

---

### Problem: Notebook runs but shows "No events found"

**Solution:** This means:
- Your Supabase table is empty, OR
- The credentials are wrong

**Check credentials:**
```python
# Add this cell to your notebook
print(f"Supabase URL: {SUPABASE_URL}")
print(f"Key starts with: {SUPABASE_KEY[:20]}...")
```

If they look wrong, re-add your secrets.

---

## 📚 Next Steps

### Level Up Your Skills:

1. **Automate the notebook** - Make it run every 15 minutes:
   - Go to **Workflows**
   - Click **Create Job**
   - Add your notebook as a task
   - Set schedule: "Every 15 minutes"

2. **Create dashboards** - Visualize your data:
   - Go to **SQL Editor**
   - Write a query
   - Click **Add Visualization**
   - Create charts and graphs

3. **Add more data sources** - Connect to:
   - Firewall logs
   - Antivirus alerts
   - Cloud provider logs
   - Application logs

4. **Build ML models** - Detect anomalies:
   - Use Databricks ML to train models
   - Predict which events are threats
   - Auto-block suspicious IPs

5. **Set up real-time processing** - Use Spark Streaming:
   - Process events as they happen
   - Alert within seconds of an attack

---

## 🆘 Getting More Help

### Official Documentation:
- Databricks Docs: https://docs.databricks.com/
- Unity Catalog Guide: https://docs.databricks.com/data-governance/unity-catalog/
- Delta Lake Docs: https://docs.delta.io/

### Community:
- Databricks Community: https://community.databricks.com/
- Stack Overflow: Tag `databricks`

### Videos:
- Databricks YouTube: https://www.youtube.com/databricks
- Search "Databricks tutorial for beginners"

---

## ✅ Final Checklist

Copy this and check off each item:

- [ ] Signed up for Databricks
- [ ] Created a cluster
- [ ] Built data catalog and schemas
- [ ] Created 7 tables
- [ ] Installed Databricks CLI on computer
- [ ] Connected CLI to Databricks
- [ ] Added Supabase secrets
- [ ] Created ingestion notebook
- [ ] Inserted test data
- [ ] Queried data successfully
- [ ] Created test alert
- [ ] Verified everything works

---

**🎊 YOU DID IT! You're now a Databricks user!**

Time to celebrate - you just built an enterprise-grade security platform! 🚀

---

**Deployment Time:** ~2 hours (for your first time)
**Difficulty:** ⭐⭐☆☆☆ (Beginner-friendly)
**Cost:** ~$1-2 for this tutorial (with free trial credits)
**What You Learned:** Cloud computing, databases, data pipelines, security monitoring

**Keep this guide bookmarked - you'll refer to it as you grow!**
