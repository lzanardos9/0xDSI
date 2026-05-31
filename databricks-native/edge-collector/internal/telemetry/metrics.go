// Package telemetry tracks runtime metrics for the edge collector.
package telemetry

import (
	"runtime"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
)

// Snapshot represents a point-in-time metrics snapshot.
type Snapshot struct {
	EPS          float64
	BytesPerSec  float64
	ErrorCount   int64
	BufferPct    float64
	UptimeSeconds int64
	CPUPercent   float64
	MemoryMB     float64
	DiskBufferMB float64
	LatencyMs    float64
	TotalEvents  int64
}

// Metrics tracks collector performance.
type Metrics struct {
	log         *zap.SugaredLogger
	startTime   time.Time
	totalEvents atomic.Int64
	totalErrors atomic.Int64
	totalBytes  atomic.Int64
	batchCount  atomic.Int64
	lastEvents  atomic.Int64
	lastTime    atomic.Int64
}

// New creates a metrics tracker.
func New(log *zap.SugaredLogger) *Metrics {
	m := &Metrics{
		log:       log,
		startTime: time.Now(),
	}
	m.lastTime.Store(time.Now().UnixMilli())
	go m.computeLoop()
	return m
}

// IncrEvents increments the event counter.
func (m *Metrics) IncrEvents() {
	m.totalEvents.Add(1)
}

// IncrErrors increments the error counter.
func (m *Metrics) IncrErrors() {
	m.totalErrors.Add(1)
}

// AddBytesOut adds to the bytes out counter.
func (m *Metrics) AddBytesOut(n int64) {
	m.totalBytes.Add(n)
}

// AddBatchSize records a batch delivery.
func (m *Metrics) AddBatchSize(n int) {
	m.batchCount.Add(1)
}

// Snapshot returns current metrics.
func (m *Metrics) Snapshot() Snapshot {
	now := time.Now()
	uptime := now.Sub(m.startTime).Seconds()
	total := m.totalEvents.Load()

	// Compute EPS over last interval
	lastEvts := m.lastEvents.Load()
	lastT := m.lastTime.Load()
	elapsed := float64(now.UnixMilli()-lastT) / 1000.0
	var eps float64
	if elapsed > 0 {
		eps = float64(total-lastEvts) / elapsed
	}

	// Memory stats
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	return Snapshot{
		EPS:           eps,
		BytesPerSec:   float64(m.totalBytes.Load()) / uptime,
		ErrorCount:    m.totalErrors.Load(),
		BufferPct:     0, // TODO: track buffer usage
		UptimeSeconds: int64(uptime),
		CPUPercent:    0, // Approximated by OS stats
		MemoryMB:      float64(memStats.Alloc) / 1024 / 1024,
		DiskBufferMB:  0,
		LatencyMs:     0,
		TotalEvents:   total,
	}
}

func (m *Metrics) computeLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		m.lastEvents.Store(m.totalEvents.Load())
		m.lastTime.Store(time.Now().UnixMilli())
	}
}
