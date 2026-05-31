// Package parser implements event parsing and OCSF normalization.
package parser

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/0xdsi/edge-collector/internal/dna"
	"github.com/0xdsi/edge-collector/internal/telemetry"
	"go.uber.org/zap"
)

// OCSFEvent represents a normalized event in OCSF format.
type OCSFEvent struct {
	ClassUID    int                    `json:"class_uid"`
	TypeID      int                    `json:"type_id,omitempty"`
	CategoryUID int                    `json:"category_uid,omitempty"`
	Time        int64                  `json:"time"`
	Severity    string                 `json:"severity,omitempty"`
	Message     string                 `json:"message,omitempty"`
	Metadata    map[string]interface{} `json:"metadata"`
	Observables map[string]interface{} `json:"observables,omitempty"`
	Raw         string                 `json:"raw_data,omitempty"`
}

// Pipeline processes raw bytes into OCSF events.
type Pipeline struct {
	spec    dna.ParserSpec
	ocsf    dna.OCSFSpec
	log     *zap.SugaredLogger
	metrics *telemetry.Metrics
	regex   *regexp.Regexp
}

// New creates a parser pipeline.
func New(spec dna.ParserSpec, ocsf dna.OCSFSpec, log *zap.SugaredLogger, metrics *telemetry.Metrics) *Pipeline {
	p := &Pipeline{spec: spec, ocsf: ocsf, log: log, metrics: metrics}
	if spec.Regex != "" {
		p.regex, _ = regexp.Compile(spec.Regex)
	}
	return p
}

// Process parses raw bytes into one or more OCSF events.
func (p *Pipeline) Process(raw []byte) ([][]byte, error) {
	switch p.spec.Engine {
	case "cef":
		return p.parseCEF(raw)
	case "json_path":
		return p.parseJSON(raw)
	case "kv_pairs":
		return p.parseKV(raw)
	case "syslog", "rfc5424":
		return p.parseSyslog(raw)
	case "regex":
		return p.parseRegex(raw)
	case "splunk_hec":
		return p.parseSplunkHEC(raw)
	case "evtx":
		return p.parseEVTX(raw)
	case "protocol_decode":
		return p.parseProtocol(raw)
	default:
		return p.parsePassthrough(raw)
	}
}

func (p *Pipeline) parseCEF(raw []byte) ([][]byte, error) {
	// CEF format: CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extension
	line := string(raw)
	if !strings.HasPrefix(line, "CEF:") {
		// Try to extract CEF from syslog wrapper
		idx := strings.Index(line, "CEF:")
		if idx < 0 {
			return p.parsePassthrough(raw)
		}
		line = line[idx:]
	}

	parts := strings.SplitN(line, "|", 8)
	if len(parts) < 7 {
		return nil, fmt.Errorf("invalid CEF: not enough pipe-delimited fields")
	}

	fields := make(map[string]interface{})
	fields["vendor"] = parts[1]
	fields["product"] = parts[2]
	fields["version"] = parts[3]
	fields["signature_id"] = parts[4]
	fields["name"] = parts[5]
	fields["severity"] = parts[6]

	// Parse extension key=value pairs
	if len(parts) >= 8 {
		ext := parseCEFExtension(parts[7])
		for k, v := range ext {
			fields[k] = v
		}
	}

	return p.toOCSF(fields, string(raw))
}

func parseCEFExtension(ext string) map[string]string {
	result := make(map[string]string)
	pairs := strings.Fields(ext)
	for _, pair := range pairs {
		idx := strings.Index(pair, "=")
		if idx > 0 {
			result[pair[:idx]] = pair[idx+1:]
		}
	}
	return result
}

func (p *Pipeline) parseJSON(raw []byte) ([][]byte, error) {
	var data map[string]interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("JSON parse: %w", err)
	}

	fields := make(map[string]interface{})
	// Apply JSON path extractions
	for target, path := range p.spec.JSONPaths {
		if val := extractJSONPath(data, path); val != nil {
			fields[target] = val
		}
	}
	// Include all top-level fields
	for k, v := range data {
		if _, exists := fields[k]; !exists {
			fields[k] = v
		}
	}

	return p.toOCSF(fields, string(raw))
}

func extractJSONPath(data map[string]interface{}, path string) interface{} {
	parts := strings.Split(path, ".")
	var current interface{} = data
	for _, part := range parts {
		m, ok := current.(map[string]interface{})
		if !ok {
			return nil
		}
		current = m[part]
	}
	return current
}

func (p *Pipeline) parseKV(raw []byte) ([][]byte, error) {
	line := string(raw)
	fields := make(map[string]interface{})
	delimiter := p.spec.Delimiter
	if delimiter == "" {
		delimiter = " "
	}
	pairs := strings.Split(line, delimiter)
	for _, pair := range pairs {
		idx := strings.Index(pair, "=")
		if idx > 0 {
			key := strings.TrimSpace(pair[:idx])
			val := strings.Trim(strings.TrimSpace(pair[idx+1:]), "\"")
			fields[key] = val
		}
	}
	return p.toOCSF(fields, line)
}

func (p *Pipeline) parseSyslog(raw []byte) ([][]byte, error) {
	fields := map[string]interface{}{
		"message": string(raw),
	}
	return p.toOCSF(fields, string(raw))
}

func (p *Pipeline) parseRegex(raw []byte) ([][]byte, error) {
	if p.regex == nil {
		return p.parsePassthrough(raw)
	}
	match := p.regex.FindSubmatch(raw)
	if match == nil {
		return nil, fmt.Errorf("regex did not match")
	}
	fields := make(map[string]interface{})
	for i, name := range p.regex.SubexpNames() {
		if i > 0 && name != "" && i < len(match) {
			fields[name] = string(match[i])
		}
	}
	return p.toOCSF(fields, string(raw))
}

func (p *Pipeline) parseSplunkHEC(raw []byte) ([][]byte, error) {
	var data map[string]interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	fields := make(map[string]interface{})
	if event, ok := data["event"]; ok {
		switch v := event.(type) {
		case map[string]interface{}:
			fields = v
		case string:
			fields["message"] = v
		}
	}
	if source, ok := data["source"].(string); ok {
		fields["source"] = source
	}
	if sourcetype, ok := data["sourcetype"].(string); ok {
		fields["sourcetype"] = sourcetype
	}
	return p.toOCSF(fields, string(raw))
}

func (p *Pipeline) parseEVTX(raw []byte) ([][]byte, error) {
	return p.parseJSON(raw)
}

func (p *Pipeline) parseProtocol(raw []byte) ([][]byte, error) {
	fields := map[string]interface{}{
		"raw_bytes":   fmt.Sprintf("%x", raw),
		"byte_length": len(raw),
	}
	return p.toOCSF(fields, string(raw))
}

func (p *Pipeline) parsePassthrough(raw []byte) ([][]byte, error) {
	fields := map[string]interface{}{
		"message": string(raw),
	}
	return p.toOCSF(fields, string(raw))
}

// toOCSF converts parsed fields into OCSF JSON bytes.
func (p *Pipeline) toOCSF(fields map[string]interface{}, rawStr string) ([][]byte, error) {
	observables := make(map[string]interface{})
	for ocsfField, sourceField := range p.ocsf.Fields {
		if val, ok := fields[sourceField]; ok {
			observables[ocsfField] = val
		}
	}

	evt := OCSFEvent{
		ClassUID:    p.ocsf.EventClass,
		TypeID:      p.ocsf.TypeID,
		CategoryUID: p.ocsf.CategoryID,
		Time:        time.Now().UnixMilli(),
		Metadata:    fields,
		Observables: observables,
		Raw:         rawStr,
	}

	// Extract severity
	if sev, ok := fields["severity"]; ok {
		evt.Severity = fmt.Sprintf("%v", sev)
	}
	if msg, ok := fields["message"]; ok {
		evt.Message = fmt.Sprintf("%v", msg)
	}

	data, err := json.Marshal(evt)
	if err != nil {
		return nil, err
	}
	return [][]byte{data}, nil
}
