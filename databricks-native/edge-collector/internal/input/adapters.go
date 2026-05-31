// Package input implements input adapters that receive raw events from various sources.
package input

import (
	"context"
	"fmt"
	"net"
	"time"

	"github.com/0xdsi/edge-collector/internal/dna"
	"go.uber.org/zap"
)

// Handler is called with raw event bytes for each received message.
type Handler func(raw []byte)

// Adapter receives events from a source and calls the handler for each.
type Adapter interface {
	Start(ctx context.Context) error
	Stop() error
}

// New creates an input adapter based on the DNA spec.
func New(spec dna.InputSpec, auth dna.AuthSpec, handler Handler, log *zap.SugaredLogger) (Adapter, error) {
	switch spec.Type {
	case "syslog":
		return newSyslogAdapter(spec, handler, log)
	case "api_poll", "api_stream", "s3_poll":
		return newAPIAdapter(spec, auth, handler, log)
	case "file_tail":
		return newFileTailAdapter(spec, handler, log)
	case "http_listener":
		return newHTTPListenerAdapter(spec, auth, handler, log)
	case "pcap":
		return newPcapAdapter(spec, handler, log)
	case "wmi":
		return newWMIAdapter(spec, auth, handler, log)
	case "eventhub":
		return newEventHubAdapter(spec, auth, handler, log)
	case "kafka":
		return newKafkaAdapter(spec, auth, handler, log)
	default:
		return nil, fmt.Errorf("unsupported input type: %s", spec.Type)
	}
}

// --- Syslog Adapter ---

type syslogAdapter struct {
	spec    dna.InputSpec
	handler Handler
	log     *zap.SugaredLogger
	conn    net.PacketConn
	ln      net.Listener
}

func newSyslogAdapter(spec dna.InputSpec, handler Handler, log *zap.SugaredLogger) (*syslogAdapter, error) {
	return &syslogAdapter{spec: spec, handler: handler, log: log}, nil
}

func (s *syslogAdapter) Start(ctx context.Context) error {
	addr := fmt.Sprintf("0.0.0.0:%d", s.spec.Port)

	if s.spec.Protocol == "udp" {
		conn, err := net.ListenPacket("udp", addr)
		if err != nil {
			return fmt.Errorf("listen UDP %s: %w", addr, err)
		}
		s.conn = conn
		s.log.Infow("syslog UDP listener started", "addr", addr)

		buf := make([]byte, 65536)
		for {
			select {
			case <-ctx.Done():
				return nil
			default:
			}
			s.conn.SetReadDeadline(time.Now().Add(1 * time.Second))
			n, _, err := s.conn.ReadFrom(buf)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				return fmt.Errorf("read UDP: %w", err)
			}
			msg := make([]byte, n)
			copy(msg, buf[:n])
			s.handler(msg)
		}
	}

	// TCP syslog
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen TCP %s: %w", addr, err)
	}
	s.ln = ln
	s.log.Infow("syslog TCP listener started", "addr", addr)

	go func() {
		<-ctx.Done()
		ln.Close()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			continue
		}
		go s.handleTCPConn(ctx, conn)
	}
}

func (s *syslogAdapter) handleTCPConn(ctx context.Context, conn net.Conn) {
	defer conn.Close()
	buf := make([]byte, 65536)
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		n, err := conn.Read(buf)
		if err != nil {
			return
		}
		// Split on newlines for framed syslog
		start := 0
		for i := 0; i < n; i++ {
			if buf[i] == '\n' {
				if i > start {
					msg := make([]byte, i-start)
					copy(msg, buf[start:i])
					s.handler(msg)
				}
				start = i + 1
			}
		}
		if start < n {
			msg := make([]byte, n-start)
			copy(msg, buf[start:n])
			s.handler(msg)
		}
	}
}

func (s *syslogAdapter) Stop() error {
	if s.conn != nil {
		return s.conn.Close()
	}
	if s.ln != nil {
		return s.ln.Close()
	}
	return nil
}

// --- Stub adapters (API, FileTail, HTTP, PCAP, WMI, EventHub, Kafka) ---

type apiAdapter struct {
	spec    dna.InputSpec
	auth    dna.AuthSpec
	handler Handler
	log     *zap.SugaredLogger
}

func newAPIAdapter(spec dna.InputSpec, auth dna.AuthSpec, handler Handler, log *zap.SugaredLogger) (*apiAdapter, error) {
	return &apiAdapter{spec: spec, auth: auth, handler: handler, log: log}, nil
}

func (a *apiAdapter) Start(ctx context.Context) error {
	interval := 60 * time.Second
	if a.spec.PollInterval != "" {
		if d, err := time.ParseDuration(a.spec.PollInterval); err == nil {
			interval = d
		}
	}
	a.log.Infow("API poll adapter started", "interval", interval, "endpoint", a.spec.Endpoint)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			a.poll()
		}
	}
}

func (a *apiAdapter) poll() {
	// Real implementation would call the API endpoint with auth
	a.log.Debug("polling API endpoint")
}

func (a *apiAdapter) Stop() error { return nil }

type fileTailAdapter struct {
	spec    dna.InputSpec
	handler Handler
	log     *zap.SugaredLogger
}

func newFileTailAdapter(spec dna.InputSpec, handler Handler, log *zap.SugaredLogger) (*fileTailAdapter, error) {
	return &fileTailAdapter{spec: spec, handler: handler, log: log}, nil
}

func (f *fileTailAdapter) Start(ctx context.Context) error {
	f.log.Infow("file tail adapter started", "path", f.spec.FilePath)
	<-ctx.Done()
	return nil
}

func (f *fileTailAdapter) Stop() error { return nil }

type httpListenerAdapter struct {
	spec    dna.InputSpec
	auth    dna.AuthSpec
	handler Handler
	log     *zap.SugaredLogger
}

func newHTTPListenerAdapter(spec dna.InputSpec, auth dna.AuthSpec, handler Handler, log *zap.SugaredLogger) (*httpListenerAdapter, error) {
	return &httpListenerAdapter{spec: spec, auth: auth, handler: handler, log: log}, nil
}

func (h *httpListenerAdapter) Start(ctx context.Context) error {
	h.log.Infow("HTTP listener started", "port", h.spec.Port)
	<-ctx.Done()
	return nil
}

func (h *httpListenerAdapter) Stop() error { return nil }

type pcapAdapter struct {
	spec    dna.InputSpec
	handler Handler
	log     *zap.SugaredLogger
}

func newPcapAdapter(spec dna.InputSpec, handler Handler, log *zap.SugaredLogger) (*pcapAdapter, error) {
	return &pcapAdapter{spec: spec, handler: handler, log: log}, nil
}

func (p *pcapAdapter) Start(ctx context.Context) error {
	p.log.Infow("PCAP adapter started", "port", p.spec.Port)
	<-ctx.Done()
	return nil
}

func (p *pcapAdapter) Stop() error { return nil }

type wmiAdapter struct {
	spec    dna.InputSpec
	auth    dna.AuthSpec
	handler Handler
	log     *zap.SugaredLogger
}

func newWMIAdapter(spec dna.InputSpec, auth dna.AuthSpec, handler Handler, log *zap.SugaredLogger) (*wmiAdapter, error) {
	return &wmiAdapter{spec: spec, auth: auth, handler: handler, log: log}, nil
}

func (w *wmiAdapter) Start(ctx context.Context) error {
	w.log.Infow("WMI adapter started", "port", w.spec.Port)
	<-ctx.Done()
	return nil
}

func (w *wmiAdapter) Stop() error { return nil }

type eventHubAdapter struct {
	spec    dna.InputSpec
	auth    dna.AuthSpec
	handler Handler
	log     *zap.SugaredLogger
}

func newEventHubAdapter(spec dna.InputSpec, auth dna.AuthSpec, handler Handler, log *zap.SugaredLogger) (*eventHubAdapter, error) {
	return &eventHubAdapter{spec: spec, auth: auth, handler: handler, log: log}, nil
}

func (e *eventHubAdapter) Start(ctx context.Context) error {
	e.log.Infow("EventHub adapter started")
	<-ctx.Done()
	return nil
}

func (e *eventHubAdapter) Stop() error { return nil }

type kafkaAdapter struct {
	spec    dna.InputSpec
	auth    dna.AuthSpec
	handler Handler
	log     *zap.SugaredLogger
}

func newKafkaAdapter(spec dna.InputSpec, auth dna.AuthSpec, handler Handler, log *zap.SugaredLogger) (*kafkaAdapter, error) {
	return &kafkaAdapter{spec: spec, auth: auth, handler: handler, log: log}, nil
}

func (k *kafkaAdapter) Start(ctx context.Context) error {
	k.log.Infow("Kafka adapter started")
	<-ctx.Done()
	return nil
}

func (k *kafkaAdapter) Stop() error { return nil }
