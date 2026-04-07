# Databricks Notebooks for SOC Platform

Two comprehensive notebooks for data population and ML experiments in Databricks.

## Quick Start

### Notebook 1: Data Population & Basic ML
**File**: `DATABRICKS_DATA_POPULATION_NOTEBOOK.md`

**Purpose**: Populate all Databricks tables with mock SOC data and run 4 basic ML experiments

**Contents**:
- Cell 1-2: Environment setup and utility functions
- Cell 3-5: Populate core_siem, threat_intel, and user_analytics tables
- Cell 6-9: Run 4 ML experiments (correlation detection, anomaly detection, threat classification, embeddings)
- Cell 10-11: Log results and data quality verification

**Tables Created**:
- 10,000 security events
- 5,000 alerts
- 2,000 incident cases
- 3,000 user sessions
- 8,000 IOC indicators
- 1,000 threat feeds
- 3,000 dark web forum posts
- 500 user behavior profiles
- 2,000 anomalous activities

**Runtime**: 20-30 minutes

**Quick Copy**:
1. Open new Databricks notebook
2. For each code block (between ` ``` ` markers), create a new cell and paste
3. Run cells 1-11 sequentially
4. Results logged to `soc_platform.ai_agents.ml_experiments_log`

---

### Notebook 2: Advanced ML Experiments
**File**: `DATABRICKS_ML_ADVANCED_EXPERIMENTS.md`

**Purpose**: Run 7 advanced ML experiments for threat detection and analysis

**Experiments**:
1. **Autoencoder Anomaly Detection** - Unsupervised anomaly detection via reconstruction error
2. **Time Series Forecasting** - Predict alert volumes using linear regression
3. **Threat Clustering** - K-Means clustering for attack campaign grouping
4. **Feature Importance** - Gradient boosted trees to identify key alert predictors
5. **Insider Threat Detection** - Behavioral anomaly scoring for user risk
6. **Deep Learning Classification** - Multi-layer perceptron for threat type classification
7. **Correlation Rule Mining** - Frequent pattern analysis for security rules

**Runtime**: 15-20 minutes (after Notebook 1)

**Key Features**:
- All results logged with metrics and timestamps
- Automatic experiment dashboard (Cell 10)
- No external dependencies - uses only Spark MLlib
- Mock data generation compatible with Notebook 1 output

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ SOC Platform Databricks Workspace                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Catalog: soc_platform                                      │
│  ├── core_siem              (8 tables - events/alerts)      │
│  ├── threat_intel           (17 tables - IOCs/feeds)        │
│  ├── user_analytics         (5 tables - UBA)                │
│  ├── ai_agents              (exp log, models)               │
│  ├── correlation_engine     (embeddings, rules)             │
│  └── [13 other schemas]                                     │
│                                                             │
│  ML Experiments:                                            │
│  ├── Basic ML (Notebook 1)                                  │
│  │   ├── Correlation Detection (RF)                         │
│  │   ├── Anomaly Detection (Z-Score)                        │
│  │   ├── Classification (GBT)                               │
│  │   └── Embeddings (TF-IDF)                                │
│  │                                                           │
│  └── Advanced ML (Notebook 2)                               │
│      ├── Autoencoder Anomaly                                │
│      ├── Time Series Forecast                               │
│      ├── Clustering (K-Means)                               │
│      ├── Feature Importance (GBT)                           │
│      ├── Insider Threat (Behavior)                          │
│      ├── Deep Learning (MLP)                                │
│      └── Rule Mining (Frequent Patterns)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Workflow

### Step 1: Run Notebook 1 (Data Population)
```
1. Create new Databricks notebook
2. Copy cells from DATABRICKS_DATA_POPULATION_NOTEBOOK.md
3. Run all cells sequentially
4. Verify: SELECT COUNT(*) FROM soc_platform.core_siem.events
   Expected: ~10,000 rows
```

### Step 2: Run Notebook 2 (Advanced ML)
```
1. Create new Databricks notebook (separate)
2. Copy cells from DATABRICKS_ML_ADVANCED_EXPERIMENTS.md
3. Run all cells sequentially
4. View dashboard in Cell 10
```

### Step 3: Query Results
```sql
-- View all experiments
SELECT experiment_name, status, training_timestamp
FROM soc_platform.ai_agents.ml_experiments_log
ORDER BY training_timestamp DESC;

-- Analyze correlation detection results
SELECT * FROM soc_platform.ai_agents.ml_experiments_log
WHERE experiment_name = 'Event Correlation Detection';

-- Check anomaly detection
SELECT * FROM soc_platform.user_analytics.anomaly_detection_results
LIMIT 10;
```

---

## Cluster Requirements

**Minimum**:
- DBR 13.3 LTS
- 4 cores
- 32GB RAM
- Single node cluster

**Recommended**:
- DBR 13.3 LTS
- 8 cores
- 64GB RAM
- Single node cluster

---

## Data Summary

### Notebook 1 Generated Rows

| Schema | Table | Rows | Purpose |
|--------|-------|------|---------|
| core_siem | events | 10,000 | Raw security events |
| core_siem | alerts | 5,000 | Generated security alerts |
| core_siem | cases | 2,000 | Security incident cases |
| core_siem | sessions | 3,000 | User sessions |
| threat_intel | ioc_indicators | 8,000 | Indicators of compromise |
| threat_intel | threat_feeds | 1,000 | Threat intelligence feeds |
| threat_intel | dark_web_forum_posts | 3,000 | Dark web intelligence |
| user_analytics | user_behavior_profiles | 500 | User behavior baseline |
| user_analytics | anomalous_activity | 2,000 | Anomalous user activity |

**Total**: ~44,000 rows

### ML Models Generated

| Experiment | Model Type | Metric | Value |
|------------|-----------|--------|-------|
| Correlation Detection | Random Forest (10 trees) | AUC | ~0.75-0.85 |
| Event Forecasting | Linear Regression | RMSE | Calculated |
| Threat Clustering | K-Means (k=5) | Silhouette | ~0.4-0.8 |
| Classification | GBT (5 depth) | Accuracy | ~0.70-0.85 |
| Deep Learning | MLP [3-5-5-4] | Accuracy | ~0.80-0.90 |

---

## Troubleshooting

### Issue: Timeout in data population
**Solution**: Increase cluster memory to 64GB, or reduce data volume in generators

### Issue: Insufficient data for forecasting
**Solution**: Notebook handles this gracefully - forecasting requires >7 hours of data

### Issue: Memory errors during clustering
**Solution**: Reduce k-means clusters or limit alert sample size

### Issue: Missing tables
**Solution**: Run Cell 1 of Notebook 1 again to ensure catalog/schemas exist

---

## Next Steps

After running both notebooks:

1. **Export Models** to production:
   ```python
   model.save("/mnt/models/correlation_detector")
   ```

2. **Create Feature Store**:
   ```sql
   CREATE TABLE soc_platform.ai_agents.feature_store AS
   SELECT * FROM correlation_engine.event_embeddings
   ```

3. **Deploy Predictions**:
   - Use models in real-time scoring jobs
   - Integrate with SIEM for live alert classification
   - Monitor model drift

4. **Expand Data**:
   - Connect to real Splunk/ELK instances
   - Ingest real IOC feeds
   - Run automated retraining

---

## File Locations

```
Project Root
├── DATABRICKS_DATA_POPULATION_NOTEBOOK.md      (27 KB)
├── DATABRICKS_ML_ADVANCED_EXPERIMENTS.md       (20 KB)
└── DATABRICKS_NOTEBOOKS_README.md              (This file)
```

---

## Support

For issues or questions:
1. Check the **Troubleshooting** section above
2. Verify cluster configuration meets requirements
3. Review cell output logs for specific errors
4. Ensure Notebook 1 completes before running Notebook 2

---

**Last Updated**: March 27, 2026
**Compatible With**: Databricks 13.3 LTS+, Spark 3.3+
