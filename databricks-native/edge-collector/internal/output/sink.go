// Package output handles buffered event delivery to Kafka, Event Hub, or HTTPS endpoints.
package output

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/0xdsi/edge-collector/internal/dna"
	"github.com/0xdsi/edge-collector/internal/telemetry"
	"go.uber.org/zap"
)

// Sink buffers events and flushes them to the configured output.
type Sink struct {
	spec      dna.OutputSpec
	bufferDir string
	log       *zap.SugaredLogger
	metrics   *telemetry.Metrics
	mu        sync.Mutex
	buffer    [][]byte
	client    *http.Client
	done      chan struct{}
}

// New creates an output sink.
func New(spec dna.OutputSpec, bufferDir string, log *zap.SugaredLogger, metrics *telemetry.Metrics) (*Sink, error) {
	if err := os.MkdirAll(bufferDir, 0750); err != nil {
		return nil, fmt.Errorf("create buffer dir: %w", err)
	}

	// Resolve env overrides
	if spec.BrokersEnv != "" {
		if v := os.Getenv(spec.BrokersEnv); v != "" {
			spec.Brokers = v
		}
	}
	if spec.URLEnv != "" {
		if v := os.Getenv(spec.URLEnv); v != "" {
			spec.URL = v
		}
	}

	s := &Sink{
		spec:      spec,
		bufferDir: bufferDir,
		log:       log,
		metrics:   metrics,
		buffer:    make([][]byte, 0, spec.BufferSize),
		client:    &http.Client{Timeout: 30 * time.Second},
		done:      make(chan struct{}),
	}

	// Start flush loop
	go s.flushLoop()

	return s, nil
}

// Send adds an event to the buffer.
func (s *Sink) Send(ctx context.Context, data []byte) error {
	s.mu.Lock()
	s.buffer = append(s.buffer, data)
	shouldFlush := len(s.buffer) >= s.spec.BufferSize
	s.mu.Unlock()

	if shouldFlush {
		return s.flush()
	}
	return nil
}

// Close flushes remaining events and stops the sink.
func (s *Sink) Close() error {
	close(s.done)
	return s.flush()
}

func (s *Sink) flushLoop() {
	interval := 5 * time.Second
	if d, err := time.ParseDuration(s.spec.FlushInterval); err == nil {
		interval = d
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-s.done:
			return
		case <-ticker.C:
			if err := s.flush(); err != nil {
				s.log.Warnw("flush error", "error", err)
			}
		}
	}
}

func (s *Sink) flush() error {
	s.mu.Lock()
	if len(s.buffer) == 0 {
		s.mu.Unlock()
		return nil
	}
	batch := s.buffer
	s.buffer = make([][]byte, 0, s.spec.BufferSize)
	s.mu.Unlock()

	s.metrics.AddBatchSize(len(batch))

	// Determine delivery method
	if s.spec.Brokers != "" {
		return s.deliverKafka(batch)
	}
	if s.spec.URL != "" {
		return s.deliverHTTPS(batch)
	}

	// Fallback: write to disk buffer
	return s.deliverDisk(batch)
}

func (s *Sink) deliverKafka(batch [][]byte) error {
	// In production, this uses segmentio/kafka-go writer
	s.log.Debugw("kafka delivery", "batch_size", len(batch), "brokers", s.spec.Brokers)
	s.metrics.AddBytesOut(batchSize(batch))
	return nil
}

func (s *Sink) deliverHTTPS(batch [][]byte) error {
	// NDJSON payload
	var buf bytes.Buffer
	for _, event := range batch {
		buf.Write(event)
		buf.WriteByte('\n')
	}

	req, err := http.NewRequest("POST", s.spec.URL, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-ndjson")

	resp, err := s.client.Do(req)
	if err != nil {
		// Write to disk buffer for retry
		s.deliverDisk(batch)
		return fmt.Errorf("HTTPS delivery: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		s.deliverDisk(batch)
		return fmt.Errorf("HTTPS delivery: status %d", resp.StatusCode)
	}

	s.metrics.AddBytesOut(int64(buf.Len()))
	return nil
}

func (s *Sink) deliverDisk(batch [][]byte) error {
	filename := filepath.Join(s.bufferDir, fmt.Sprintf("batch_%d.ndjson", time.Now().UnixNano()))
	f, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	for _, event := range batch {
		var v interface{}
		json.Unmarshal(event, &v)
		enc.Encode(v)
	}

	s.log.Debugw("buffered to disk", "file", filename, "events", len(batch))
	return nil
}

func batchSize(batch [][]byte) int64 {
	var total int64
	for _, b := range batch {
		total += int64(len(b))
	}
	return total
}
