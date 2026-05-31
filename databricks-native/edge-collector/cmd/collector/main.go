// Package main implements the 0xDSI Edge Collector - a universal security
// event collector that loads Connector DNA specs and becomes any connector.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/0xdsi/edge-collector/internal/control"
	"github.com/0xdsi/edge-collector/internal/dna"
	"github.com/0xdsi/edge-collector/internal/input"
	"github.com/0xdsi/edge-collector/internal/output"
	"github.com/0xdsi/edge-collector/internal/parser"
	"github.com/0xdsi/edge-collector/internal/telemetry"
	"go.uber.org/zap"
)

var (
	version   = "dev"
	buildTime = "unknown"
	gitCommit = "unknown"
)

func main() {
	var (
		dnaPath       = flag.String("dna", "", "Path to DNA YAML spec file")
		dnaName       = flag.String("dna-name", "", "Name of built-in DNA to use")
		token         = flag.String("token", os.Getenv("TOKEN"), "Registration token for control plane")
		controlPlane  = flag.String("control-plane", os.Getenv("CONTROL_PLANE_URL"), "Control plane URL")
		showVersion   = flag.Bool("version", false, "Show version and exit")
		bufferDir     = flag.String("buffer-dir", "/tmp/0xdsi-buffer", "Disk buffer directory")
		logLevel      = flag.String("log-level", "info", "Log level: debug, info, warn, error")
	)
	flag.Parse()

	if *showVersion {
		fmt.Printf("0xDSI Edge Collector %s (built %s, commit %s)\n", version, buildTime, gitCommit)
		os.Exit(0)
	}

	// Initialize logger
	var logger *zap.Logger
	var err error
	switch *logLevel {
	case "debug":
		logger, err = zap.NewDevelopment()
	default:
		logger, err = zap.NewProduction()
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to init logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()
	log := logger.Sugar()

	log.Infow("starting 0xDSI Edge Collector",
		"version", version,
		"build_time", buildTime,
	)

	// Load DNA spec
	var spec *dna.Spec
	if *dnaPath != "" {
		spec, err = dna.LoadFromFile(*dnaPath)
	} else if *dnaName != "" {
		spec, err = dna.LoadBuiltin(*dnaName)
	} else {
		log.Fatal("must specify --dna (file path) or --dna-name (built-in)")
	}
	if err != nil {
		log.Fatalw("failed to load DNA spec", "error", err)
	}
	log.Infow("DNA spec loaded",
		"name", spec.Name,
		"version", spec.Version,
		"vendor", spec.Vendor,
		"input_type", spec.Input.Type,
	)

	// Create context with graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		log.Infow("received signal, shutting down", "signal", sig)
		cancel()
	}()

	// Initialize telemetry
	metrics := telemetry.New(log)

	// Initialize control plane client
	cp := control.New(control.Config{
		URL:           *controlPlane,
		Token:         *token,
		CollectorID:   "", // assigned after registration
		DNAName:       spec.Name,
		DNAVersion:    spec.Version,
		BinaryVersion: version,
		Hostname:      hostname(),
	}, log, metrics)

	// Register with control plane
	if *controlPlane != "" && *token != "" {
		collectorID, err := cp.Register(ctx)
		if err != nil {
			log.Warnw("control plane registration failed (will retry)", "error", err)
		} else {
			log.Infow("registered with control plane", "collector_id", collectorID)
		}
	}

	// Initialize output sink
	sink, err := output.New(spec.Output, *bufferDir, log, metrics)
	if err != nil {
		log.Fatalw("failed to create output sink", "error", err)
	}
	defer sink.Close()

	// Initialize parser pipeline
	pipe := parser.New(spec.Parser, spec.OCSFMapping, log, metrics)

	// Initialize input adapter
	adapter, err := input.New(spec.Input, spec.Auth, func(raw []byte) {
		// Parse raw event
		events, err := pipe.Process(raw)
		if err != nil {
			metrics.IncrErrors()
			log.Debugw("parse error", "error", err)
			return
		}
		// Send to output
		for _, evt := range events {
			if err := sink.Send(ctx, evt); err != nil {
				metrics.IncrErrors()
				log.Debugw("send error", "error", err)
			} else {
				metrics.IncrEvents()
			}
		}
	}, log)
	if err != nil {
		log.Fatalw("failed to create input adapter", "error", err)
	}

	// Start control plane heartbeat loop
	if *controlPlane != "" {
		go cp.HeartbeatLoop(ctx)
		go cp.ConfigSyncLoop(ctx)
	}

	// Start input adapter (blocking until context cancelled)
	log.Infow("collector running",
		"dna", spec.Name,
		"input", fmt.Sprintf("%s://%s:%d", spec.Input.Protocol, "0.0.0.0", spec.Input.Port),
	)

	if err := adapter.Start(ctx); err != nil && ctx.Err() == nil {
		log.Fatalw("input adapter error", "error", err)
	}

	log.Info("collector stopped")
}

func hostname() string {
	h, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return h
}
