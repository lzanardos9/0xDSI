import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function generateToml(deployment: any, connectors: any[]): string {
  const lines: string[] = [];
  lines.push("# 0xDSI Edge Collector Configuration");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Deployment: ${deployment.agent_name}`);
  lines.push("");

  lines.push("[agent]");
  lines.push(`id = "${deployment.agent_id}"`);
  lines.push(`name = "${deployment.agent_name}"`);
  lines.push(`site = "${deployment.site}"`);
  lines.push(`log_level = "info"`);
  lines.push(`metrics_port = 9090`);
  lines.push(`health_port = 9091`);
  lines.push("");

  lines.push("[transport]");
  lines.push(`kind = "${deployment.transport_kind || "kafka"}"`);
  if (deployment.transport_kind === "kafka") {
    const meta = deployment.metadata?.transport || {};
    lines.push("");
    lines.push("[transport.kafka]");
    lines.push(
      `brokers = [${(meta.brokers || ["kafka:9092"]).map((b: string) => `"${b}"`).join(", ")}]`
    );
    lines.push(`topic_prefix = "${meta.topic_prefix || "0xdsi.edge"}"`);
    lines.push(`compression = "${meta.compression || "zstd"}"`);
    lines.push(`batch_size = ${meta.batch_size || 1000}`);
    lines.push(`linger_ms = ${meta.linger_ms || 5}`);
  } else if (deployment.transport_kind === "eventhub") {
    const meta = deployment.metadata?.transport || {};
    lines.push("");
    lines.push("[transport.eventhub]");
    lines.push(
      `connection_string = "${meta.connection_string || "Endpoint=sb://..."}"`
    );
    lines.push(`namespace = "${meta.namespace || "0xdsi-events"}"`);
  } else if (deployment.transport_kind === "http") {
    const meta = deployment.metadata?.transport || {};
    lines.push("");
    lines.push("[transport.http]");
    lines.push(`endpoint = "${meta.endpoint || "https://lake.internal/ingest"}"`);
    lines.push(`auth_token = "${meta.auth_token || ""}"`);
    lines.push(`batch_size = ${meta.batch_size || 500}`);
    lines.push(`timeout_secs = ${meta.timeout_secs || 30}`);
  }
  lines.push("");

  lines.push("[buffer]");
  lines.push(`path = "/var/lib/0xdsi/buffer"`);
  lines.push(`max_size_mb = 512`);
  lines.push(`flush_interval_secs = 5`);
  lines.push("");

  lines.push("[control_plane]");
  lines.push(`enabled = true`);
  lines.push(
    `grpc_endpoint = "${deployment.metadata?.control_plane_endpoint || "https://control.0xdsi.io:443"}"`
  );
  lines.push(`heartbeat_secs = 30`);
  lines.push(`config_refresh_secs = 300`);
  lines.push("");

  lines.push("[tls]");
  lines.push(`skip_verify = false`);
  lines.push("");

  lines.push("# --- Connectors ---");
  lines.push("");

  for (const conn of connectors) {
    if (!conn.enabled) continue;
    lines.push(`[[connectors]]`);
    lines.push(`id = "${conn.connector_id}"`);
    lines.push(`connector_type = "${conn.connector_type}"`);
    lines.push(`enabled = true`);
    lines.push(`protocol = "${conn.protocol}"`);
    lines.push(`poll_interval_secs = ${conn.poll_interval_secs || 60}`);
    lines.push("");

    lines.push(`[connectors.params]`);
    if (conn.endpoint) lines.push(`endpoint = "${conn.endpoint}"`);
    lines.push(`vendor = "${conn.vendor}"`);
    lines.push(`category = "${conn.category}"`);
    lines.push(`batch_size = ${conn.batch_size || 100}`);
    lines.push(`max_retries = ${conn.max_retries || 3}`);
    lines.push(`timeout_secs = ${conn.timeout_secs || 30}`);
    lines.push(`workers = ${conn.workers || 2}`);
    lines.push(`auth_method = "${conn.auth_method || "api_key"}"`);
    lines.push(`compression = "${conn.compression || "zstd"}"`);
    lines.push(`queue_strategy = "${conn.queue_strategy || "persistent"}"`);

    if (conn.bandwidth_limit_mbps) {
      lines.push(`bandwidth_limit_mbps = ${conn.bandwidth_limit_mbps}`);
    }
    if (conn.eps_limit) {
      lines.push(`eps_limit = ${conn.eps_limit}`);
    }
    if (conn.backpressure_action) {
      lines.push(`backpressure_action = "${conn.backpressure_action}"`);
    }

    if (conn.filters && conn.filters.length > 0) {
      lines.push("");
      for (const f of conn.filters) {
        lines.push(`[[connectors.filters]]`);
        lines.push(`field = "${f.field}"`);
        lines.push(`op = "${f.op}"`);
        lines.push(`value = "${f.value}"`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateInstallScript(
  token: string,
  arch: string,
  site: string
): string {
  return `#!/bin/bash
# 0xDSI Edge Collector Install Script
# Generated: ${new Date().toISOString()}
# Site: ${site} | Arch: ${arch}
set -euo pipefail

INSTALL_TOKEN="${token}"
ARCH="${arch}"
REGISTRY="ghcr.io/0xdsi/edge-collector"
VERSION="0.4.2"

echo "[0xDSI] Installing Edge Collector v\${VERSION} for \${ARCH}..."

# Create directories
mkdir -p /etc/0xdsi /var/lib/0xdsi/buffer /var/log/0xdsi

# Pull and run container
docker pull \${REGISTRY}:\${VERSION}-\${ARCH}

# Register with control plane using install token
docker run --rm \\
  -v /etc/0xdsi:/etc/0xdsi \\
  \${REGISTRY}:\${VERSION}-\${ARCH} \\
  /usr/local/bin/0xdsi-edge register \\
    --token "\${INSTALL_TOKEN}" \\
    --site "${site}" \\
    --arch "${arch}"

# Start the collector
docker run -d \\
  --name 0xdsi-edge \\
  --restart unless-stopped \\
  --network host \\
  -v /etc/0xdsi:/etc/0xdsi:ro \\
  -v /var/lib/0xdsi:/var/lib/0xdsi \\
  -v /var/log/0xdsi:/var/log/0xdsi \\
  -p 9090:9090 \\
  -p 9091:9091 \\
  \${REGISTRY}:\${VERSION}-\${ARCH}

echo "[0xDSI] Edge Collector installed and running."
echo "[0xDSI] Health: http://localhost:9091/health"
echo "[0xDSI] Metrics: http://localhost:9090/metrics"
`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/edge-connector-api", "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // GET /fleet - list all deployments with connector counts
    if (req.method === "GET" && path === "/fleet") {
      const { data: deployments } = await supabase
        .from("edge_deployments")
        .select("*, edge_connector_configs(count)")
        .order("created_at", { ascending: false });

      return jsonResponse({ deployments: deployments || [] });
    }

    // GET /deployment/:id - get single deployment with configs
    if (req.method === "GET" && path.startsWith("/deployment/")) {
      const deploymentId = path.split("/")[2];
      const { data: deployment } = await supabase
        .from("edge_deployments")
        .select("*")
        .eq("id", deploymentId)
        .single();

      const { data: connectors } = await supabase
        .from("edge_connector_configs")
        .select("*")
        .eq("deployment_id", deploymentId)
        .order("connector_type");

      return jsonResponse({ deployment, connectors: connectors || [] });
    }

    // GET /deployment/:id/toml - generate TOML config
    if (req.method === "GET" && path.match(/\/deployment\/[^/]+\/toml/)) {
      const deploymentId = path.split("/")[2];
      const { data: deployment } = await supabase
        .from("edge_deployments")
        .select("*")
        .eq("id", deploymentId)
        .single();

      const { data: connectors } = await supabase
        .from("edge_connector_configs")
        .select("*")
        .eq("deployment_id", deploymentId);

      if (!deployment) return jsonResponse({ error: "Not found" }, 404);

      const toml = generateToml(deployment, connectors || []);
      return new Response(toml, {
        headers: { "Content-Type": "application/toml", ...corsHeaders },
      });
    }

    // POST /deployment/:id/push-config - push config to edge collector
    if (req.method === "POST" && path.match(/\/deployment\/[^/]+\/push-config/)) {
      const deploymentId = path.split("/")[2];
      const { data: deployment } = await supabase
        .from("edge_deployments")
        .select("*")
        .eq("id", deploymentId)
        .single();

      const { data: connectors } = await supabase
        .from("edge_connector_configs")
        .select("*")
        .eq("deployment_id", deploymentId);

      if (!deployment) return jsonResponse({ error: "Not found" }, 404);

      const toml = generateToml(deployment, connectors || []);
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(toml)
      );
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { data: push } = await supabase
        .from("edge_config_pushes")
        .insert({
          deployment_id: deploymentId,
          config_toml: toml,
          config_hash: hashHex,
          pushed_by: "ui",
          status: "pending",
        })
        .select()
        .single();

      return jsonResponse({ push, toml_preview: toml.substring(0, 500) });
    }

    // POST /connector-config - save a connector configuration
    if (req.method === "POST" && path === "/connector-config") {
      const body = await req.json();
      const { data, error } = await supabase
        .from("edge_connector_configs")
        .upsert(body, { onConflict: "id" })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ config: data });
    }

    // POST /generate-token - generate install token
    if (req.method === "POST" && path === "/generate-token") {
      const body = await req.json();
      const { data, error } = await supabase
        .from("edge_install_tokens")
        .insert({
          site: body.site || "default",
          arch: body.arch || "x86_64-linux",
          connectors: body.connectors || [],
          transport_config: body.transport_config || {},
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 400);

      const script = generateInstallScript(
        data.token,
        data.arch,
        data.site
      );

      return jsonResponse({ token: data, install_script: script });
    }

    // POST /heartbeat - receive heartbeat from edge collector
    if (req.method === "POST" && path === "/heartbeat") {
      const body = await req.json();
      const { data: hb } = await supabase
        .from("edge_heartbeats")
        .insert({
          deployment_id: body.deployment_id,
          agent_id: body.agent_id,
          status: body.status || "healthy",
          cpu_percent: body.cpu_percent,
          memory_mb: body.memory_mb,
          buffer_usage_mb: body.buffer_usage_mb,
          events_per_sec: body.events_per_sec,
          active_connectors: body.active_connectors,
          error_count: body.error_count || 0,
          connector_statuses: body.connector_statuses || {},
        })
        .select()
        .single();

      // Update deployment last_heartbeat
      await supabase
        .from("edge_deployments")
        .update({
          last_heartbeat: new Date().toISOString(),
          status: body.status === "healthy" ? "running" : "degraded",
          cpu_percent: body.cpu_percent,
          memory_mb: body.memory_mb,
          buffer_usage_mb: body.buffer_usage_mb,
        })
        .eq("agent_id", body.agent_id);

      // Check if there's a pending config push
      const { data: pending } = await supabase
        .from("edge_config_pushes")
        .select("*")
        .eq("deployment_id", body.deployment_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);

      return jsonResponse({
        heartbeat: hb,
        pending_config: pending?.[0] || null,
      });
    }

    // GET /stats - fleet-wide statistics
    if (req.method === "GET" && path === "/stats") {
      const { data: deployments } = await supabase
        .from("edge_deployments")
        .select("status, events_collected, events_shipped");

      const stats = {
        total_deployments: deployments?.length || 0,
        running: deployments?.filter((d) => d.status === "running").length || 0,
        degraded:
          deployments?.filter((d) => d.status === "degraded").length || 0,
        offline: deployments?.filter((d) => d.status === "offline").length || 0,
        total_events_collected:
          deployments?.reduce((s, d) => s + (d.events_collected || 0), 0) || 0,
        total_events_shipped:
          deployments?.reduce((s, d) => s + (d.events_shipped || 0), 0) || 0,
      };

      return jsonResponse(stats);
    }

    return jsonResponse({ error: "Not found", path }, 404);
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
});
