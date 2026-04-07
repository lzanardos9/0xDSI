/*
  # Add High Availability Settings

  1. Overview
    - Add HA configuration fields to system_settings table
    - Support for multi-node clusters and auto-scaling
    
  2. New Columns
    - enable_ha: Enable high availability mode
    - ha_mode: Cluster mode (active-passive, active-active, multi-master)
    - ha_nodes: Number of nodes in the cluster
    - ha_sync_mode: Data replication mode
    - ha_heartbeat_interval: Health check interval
    - ha_failover_timeout: Failover timeout
    - load_balancer_type: Type of load balancer
    - load_balancer_algorithm: Load balancing algorithm
    - enable_auto_scaling: Enable auto-scaling
    - min_instances: Minimum instances for auto-scaling
    - max_instances: Maximum instances for auto-scaling
    - scale_up_threshold: CPU/Memory threshold to scale up
    - scale_down_threshold: CPU/Memory threshold to scale down
*/

-- Add HA configuration columns
DO $$
BEGIN
  -- High Availability
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'enable_ha'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN enable_ha boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'ha_mode'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN ha_mode text DEFAULT 'active-passive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'ha_nodes'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN ha_nodes integer DEFAULT 2;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'ha_sync_mode'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN ha_sync_mode text DEFAULT 'synchronous';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'ha_heartbeat_interval'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN ha_heartbeat_interval integer DEFAULT 5;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'ha_failover_timeout'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN ha_failover_timeout integer DEFAULT 30;
  END IF;

  -- Load Balancer
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'load_balancer_type'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN load_balancer_type text DEFAULT 'round-robin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'load_balancer_algorithm'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN load_balancer_algorithm text DEFAULT 'least-connections';
  END IF;

  -- Auto-Scaling
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'enable_auto_scaling'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN enable_auto_scaling boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'min_instances'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN min_instances integer DEFAULT 2;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'max_instances'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN max_instances integer DEFAULT 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'scale_up_threshold'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN scale_up_threshold integer DEFAULT 80;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_settings' AND column_name = 'scale_down_threshold'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN scale_down_threshold integer DEFAULT 30;
  END IF;
END $$;

-- Update default settings
UPDATE system_settings
SET 
  enable_ha = false,
  ha_mode = 'active-passive',
  ha_nodes = 2,
  ha_sync_mode = 'synchronous',
  ha_heartbeat_interval = 5,
  ha_failover_timeout = 30,
  load_balancer_type = 'round-robin',
  load_balancer_algorithm = 'least-connections',
  enable_auto_scaling = false,
  min_instances = 2,
  max_instances = 10,
  scale_up_threshold = 80,
  scale_down_threshold = 30
WHERE id = '00000000-0000-0000-0000-000000000001';
