// Package dna handles loading and validating Connector DNA specs.
package dna

import (
	"embed"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

//go:embed builtin/*.yaml
var builtinFS embed.FS

// Spec represents a complete Connector DNA specification.
type Spec struct {
	Name        string      `yaml:"name"`
	Version     string      `yaml:"version"`
	Vendor      string      `yaml:"vendor"`
	Category    string      `yaml:"category"`
	Description string      `yaml:"description"`
	Input       InputSpec   `yaml:"input"`
	Auth        AuthSpec    `yaml:"auth"`
	Parser      ParserSpec  `yaml:"parser"`
	OCSFMapping OCSFSpec    `yaml:"ocsf_mapping"`
	Output      OutputSpec  `yaml:"output"`
	Health      HealthSpec  `yaml:"health"`
}

type InputSpec struct {
	Type     string `yaml:"type"`
	Protocol string `yaml:"protocol"`
	Port     int    `yaml:"port"`
	Format   string `yaml:"format"`
	// TLS config
	TLSEnabled  bool   `yaml:"tls_enabled"`
	TLSCertPath string `yaml:"tls_cert_path"`
	TLSKeyPath  string `yaml:"tls_key_path"`
	// API-specific
	Endpoint    string `yaml:"endpoint"`
	PollInterval string `yaml:"poll_interval"`
	// File-specific
	FilePath    string `yaml:"file_path"`
	FilePattern string `yaml:"file_pattern"`
}

type AuthSpec struct {
	Type         string `yaml:"type"`
	KeyEnv       string `yaml:"key_env"`
	SecretEnv    string `yaml:"secret_env"`
	CertPath     string `yaml:"cert_path"`
	TokenURL     string `yaml:"token_url"`
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
	Realm        string `yaml:"realm"`
}

type ParserSpec struct {
	Engine         string            `yaml:"engine"`
	TimestampField string            `yaml:"timestamp_field"`
	TimestampFormat string           `yaml:"timestamp_format"`
	SeverityMap    map[string]string `yaml:"severity_map"`
	Delimiter      string            `yaml:"delimiter"`
	Regex          string            `yaml:"regex"`
	JSONPaths      map[string]string `yaml:"json_paths"`
}

type OCSFSpec struct {
	EventClass int               `yaml:"event_class"`
	Fields     map[string]string `yaml:"fields"`
	TypeID     int               `yaml:"type_id"`
	CategoryID int               `yaml:"category_id"`
}

type OutputSpec struct {
	BufferSize    int    `yaml:"buffer_size"`
	FlushInterval string `yaml:"flush_interval"`
	Compression   string `yaml:"compression"`
	Format        string `yaml:"format"`
	// Kafka/EventHub
	Brokers  string `yaml:"brokers"`
	Topic    string `yaml:"topic"`
	// HTTPS
	URL      string `yaml:"url"`
	// Env overrides
	BrokersEnv string `yaml:"brokers_env"`
	URLEnv     string `yaml:"url_env"`
}

type HealthSpec struct {
	HeartbeatInterval string `yaml:"heartbeat_interval"`
	MaxEPSWarning     int    `yaml:"max_eps_warning"`
	DiskBufferMB      int    `yaml:"disk_buffer_mb"`
}

// LoadFromFile loads a DNA spec from a YAML file.
func LoadFromFile(path string) (*Spec, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read DNA file: %w", err)
	}
	return parse(data)
}

// LoadBuiltin loads a built-in DNA spec by name.
func LoadBuiltin(name string) (*Spec, error) {
	path := fmt.Sprintf("builtin/%s.yaml", name)
	data, err := builtinFS.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("builtin DNA '%s' not found: %w", name, err)
	}
	return parse(data)
}

func parse(data []byte) (*Spec, error) {
	var spec Spec
	if err := yaml.Unmarshal(data, &spec); err != nil {
		return nil, fmt.Errorf("parse DNA YAML: %w", err)
	}
	if spec.Name == "" {
		return nil, fmt.Errorf("DNA spec missing required 'name' field")
	}
	if spec.Input.Type == "" {
		return nil, fmt.Errorf("DNA spec missing required 'input.type' field")
	}
	// Apply defaults
	if spec.Input.Port == 0 {
		spec.Input.Port = 514
	}
	if spec.Output.BufferSize == 0 {
		spec.Output.BufferSize = 10000
	}
	if spec.Output.FlushInterval == "" {
		spec.Output.FlushInterval = "5s"
	}
	if spec.Output.Compression == "" {
		spec.Output.Compression = "zstd"
	}
	if spec.Output.Format == "" {
		spec.Output.Format = "ocsf_json"
	}
	if spec.Health.HeartbeatInterval == "" {
		spec.Health.HeartbeatInterval = "30s"
	}
	if spec.Health.DiskBufferMB == 0 {
		spec.Health.DiskBufferMB = 500
	}
	return &spec, nil
}
