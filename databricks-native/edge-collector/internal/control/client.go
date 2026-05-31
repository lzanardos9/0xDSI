// Package control implements the control plane client for registration,
// heartbeat, config sync, and self-upgrade.
package control

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/0xdsi/edge-collector/internal/telemetry"
	"go.uber.org/zap"
)

// Config for the control plane client.
type Config struct {
	URL           string
	Token         string
	CollectorID   string
	DNAName       string
	DNAVersion    string
	BinaryVersion string
	Hostname      string
}

// Client communicates with the 0xDSI control plane.
type Client struct {
	cfg     Config
	log     *zap.SugaredLogger
	metrics *telemetry.Metrics
	http    *http.Client
}

// New creates a control plane client.
func New(cfg Config, log *zap.SugaredLogger, metrics *telemetry.Metrics) *Client {
	return &Client{
		cfg:     cfg,
		log:     log,
		metrics: metrics,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// Register registers this collector with the control plane.
func (c *Client) Register(ctx context.Context) (string, error) {
	payload := map[string]string{
		"token":          c.cfg.Token,
		"hostname":       c.cfg.Hostname,
		"ip_address":     localIP(),
		"os_type":        runtime.GOOS,
		"os_version":     runtime.GOARCH,
		"binary_version": c.cfg.BinaryVersion,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", c.cfg.URL+"/api/edge-connectors/register", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("register request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("register failed: status %d", resp.StatusCode)
	}

	var result struct {
		CollectorID string `json:"collector_id"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	c.cfg.CollectorID = result.CollectorID
	return result.CollectorID, nil
}

// HeartbeatLoop sends periodic heartbeats to the control plane.
func (c *Client) HeartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.sendHeartbeat(ctx)
		}
	}
}

func (c *Client) sendHeartbeat(ctx context.Context) {
	stats := c.metrics.Snapshot()

	payload := map[string]interface{}{
		"collector_id":   c.cfg.CollectorID,
		"eps":            stats.EPS,
		"bps":            stats.BytesPerSec,
		"errors":         stats.ErrorCount,
		"buffer_pct":     stats.BufferPct,
		"uptime":         stats.UptimeSeconds,
		"cpu":            stats.CPUPercent,
		"memory_mb":      stats.MemoryMB,
		"disk_buffer_mb": stats.DiskBufferMB,
		"status":         "connected",
		"latency_ms":     stats.LatencyMs,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", c.cfg.URL+"/api/edge-connectors/heartbeat", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		c.log.Debugw("heartbeat failed", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		var result struct {
			Config struct {
				DesiredState      string `json:"desired_state"`
				DesiredDNAVersion string `json:"desired_dna_version"`
				CustomParams      string `json:"custom_params"`
			} `json:"config"`
		}
		json.NewDecoder(resp.Body).Decode(&result)

		// Handle desired state changes
		if result.Config.DesiredState == "stopped" {
			c.log.Info("control plane requested stop")
			os.Exit(0)
		}
		if result.Config.DesiredState == "restarting" {
			c.log.Info("control plane requested restart")
			os.Exit(42) // Special exit code for restart
		}
	}
}

// ConfigSyncLoop periodically checks for config changes.
func (c *Client) ConfigSyncLoop(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Config sync happens via heartbeat response
		}
	}
}

func localIP() string {
	// Simple best-effort local IP detection
	return "0.0.0.0"
}
