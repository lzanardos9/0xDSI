/*
# Detection SLM — Ray.io Distributed Training on Databricks

Adds the data behind a live "Ray Training Theater" so the SOC app can visibly show
a Small Language Model being trained across a Ray cluster on top of Databricks, with
per-worker GPU telemetry animating over time.

## 1. New Tables
- `dslm_ray_runs` — one row per distributed training job.
  - `run_name`, `status` (running/completed), `model_name`, `base_params_millions`
  - `dataset_name`, `training_strategy` (e.g. Ray Train + TorchTrainer DDP)
  - `num_workers`, `gpus_per_worker`, `accelerator`, `global_batch_size`
  - `total_steps`, `tokens_total_billions`
  - `proven_incident_weight` — how much confirmed-incident data is up-weighted vs all events
  - `notes`, `created_at`
- `dslm_ray_workers` — the worker fleet for a run.
  - `run_id`, `worker_index`, `role` (head/worker), `node_ip`, `gpu_model`, `shard_name`
- `dslm_ray_timeline` — ordered playback frames the client animates as "live" training.
  - `run_id`, `step`, `loss`, `learning_rate`, `tokens_per_sec`, `gpu_util_avg`
  - `grad_norm`, `allreduce_ms`, `phase`, `worker_stats` (jsonb array of per-worker snapshots)

## 2. Security
- RLS enabled on all three tables.
- This data is non-sensitive demo telemetry read by the anon-key frontend, so read
  access is granted `TO anon, authenticated` (matching the other dslm_* tables).
- No public write policies: the fleet and timeline are seeded server-side only.

## 3. Notes
1. The migration is idempotent — it deletes the seeded demo run (and cascades to its
   workers/timeline) before re-inserting, so re-running is safe.
2. The timeline is generated with a decaying loss curve and per-worker jitter so the
   theater animates smoothly from a live all-reduce ring to a completed run.
*/

CREATE TABLE IF NOT EXISTS dslm_ray_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_name text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  model_name text NOT NULL DEFAULT '',
  base_params_millions numeric NOT NULL DEFAULT 0,
  dataset_name text NOT NULL DEFAULT '',
  training_strategy text NOT NULL DEFAULT '',
  num_workers int NOT NULL DEFAULT 0,
  gpus_per_worker int NOT NULL DEFAULT 0,
  accelerator text NOT NULL DEFAULT '',
  global_batch_size int NOT NULL DEFAULT 0,
  total_steps int NOT NULL DEFAULT 0,
  tokens_total_billions numeric NOT NULL DEFAULT 0,
  proven_incident_weight numeric NOT NULL DEFAULT 1,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dslm_ray_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES dslm_ray_runs(id) ON DELETE CASCADE,
  worker_index int NOT NULL DEFAULT 0,
  role text NOT NULL DEFAULT 'worker',
  node_ip text NOT NULL DEFAULT '',
  gpu_model text NOT NULL DEFAULT '',
  shard_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dslm_ray_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES dslm_ray_runs(id) ON DELETE CASCADE,
  step int NOT NULL DEFAULT 0,
  loss numeric NOT NULL DEFAULT 0,
  learning_rate numeric NOT NULL DEFAULT 0,
  tokens_per_sec bigint NOT NULL DEFAULT 0,
  gpu_util_avg numeric NOT NULL DEFAULT 0,
  grad_norm numeric NOT NULL DEFAULT 0,
  allreduce_ms numeric NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'pretrain',
  worker_stats jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dslm_ray_workers_run ON dslm_ray_workers(run_id, worker_index);
CREATE INDEX IF NOT EXISTS idx_dslm_ray_timeline_run ON dslm_ray_timeline(run_id, step);

ALTER TABLE dslm_ray_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dslm_ray_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dslm_ray_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_ray_runs" ON dslm_ray_runs;
CREATE POLICY "read_ray_runs" ON dslm_ray_runs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "read_ray_workers" ON dslm_ray_workers;
CREATE POLICY "read_ray_workers" ON dslm_ray_workers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "read_ray_timeline" ON dslm_ray_timeline;
CREATE POLICY "read_ray_timeline" ON dslm_ray_timeline FOR SELECT TO anon, authenticated USING (true);

-- Idempotent reseed
DELETE FROM dslm_ray_runs WHERE id = 'facade00-0000-4000-8000-000000000001';

INSERT INTO dslm_ray_runs (
  id, run_name, status, model_name, base_params_millions, dataset_name, training_strategy,
  num_workers, gpus_per_worker, accelerator, global_batch_size, total_steps,
  tokens_total_billions, proven_incident_weight, notes
) VALUES (
  'facade00-0000-4000-8000-000000000001',
  'cet-slm-pretrain-v0.3-ray',
  'running',
  '0xDSI-CET-SLM (124M)',
  124,
  'ocsf_event_language.gold.pretrain_corpus',
  'Ray Train · TorchTrainer · DDP (NCCL all-reduce)',
  8, 4, 'NVIDIA A100-80GB', 2048, 24000,
  4.2, 3.0,
  'Distributed pretraining orchestrated by Ray on a Databricks GPU cluster. 8 worker actors x 4 A100 = 32 GPUs. Proven-incident sequences up-weighted 3x during curriculum sampling.'
);

INSERT INTO dslm_ray_workers (run_id, worker_index, role, node_ip, gpu_model, shard_name)
SELECT
  'facade00-0000-4000-8000-000000000001',
  w,
  CASE WHEN w = 0 THEN 'head' ELSE 'worker' END,
  '10.42.7.' || (20 + w)::text,
  'A100-80GB x4',
  'shard_' || lpad(w::text, 2, '0')
FROM generate_series(0, 7) AS w;

INSERT INTO dslm_ray_timeline (run_id, step, loss, learning_rate, tokens_per_sec, gpu_util_avg, grad_norm, allreduce_ms, phase, worker_stats)
SELECT
  'facade00-0000-4000-8000-000000000001',
  gs * 400 AS step,
  round((4.2 * exp(-gs / 16.0) + 0.82 + 0.02 * sin(gs))::numeric, 3) AS loss,
  round((0.0006 * (0.5 + 0.5 * cos(3.1416 * gs / 60.0)))::numeric, 6) AS learning_rate,
  (415000 + (18000 * sin(gs * 0.7))::int) AS tokens_per_sec,
  round((93 + 4 * sin(gs * 0.9))::numeric, 1) AS gpu_util_avg,
  round((1.8 * exp(-gs / 22.0) + 0.35)::numeric, 3) AS grad_norm,
  round((7.5 + 2.5 * sin(gs * 1.3))::numeric, 2) AS allreduce_ms,
  'pretrain' AS phase,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'i', w,
        'gpu', least(99, greatest(70, round(92 + 6 * sin(gs + w * 1.7))))::int,
        'mem', least(99, greatest(55, round(74 + 9 * sin(gs * 0.5 + w))))::int,
        'tps', (50000 + (4200 * sin(gs + w * 2.1))::int),
        'loss', round((4.2 * exp(-gs / 16.0) + 0.82 + 0.05 * sin(gs + w))::numeric, 3)
      ) ORDER BY w
    )
    FROM generate_series(0, 7) AS w
  ) AS worker_stats
FROM generate_series(0, 59) AS gs;