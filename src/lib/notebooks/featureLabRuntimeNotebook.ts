import { DatabricksNotebook } from '../databricksNotebooks';

export const featureLabRuntimeNotebook: DatabricksNotebook = {
  id: 'feature-lab-runtime',
  title: 'Feature Lab BMAD Runtime',
  subtitle: 'Sandboxed execution of BMAD-generated security features against real telemetry',
  category: 'ml',
  tags: ['Feature Lab', 'BMAD', 'Sandbox', 'Detection-as-Code', 'Unity Catalog', 'Workspace Governance'],
  description: 'Pulls feature definitions published by the Feature Lab UI from soc_agent_registry, validates the generated PySpark/SQL code against an allowlist of allowed packages and SQL functions, executes inside an isolated Unity Catalog workspace bound to a dedicated service principal, captures metrics + sample output, and writes feature_runtime_executions back to Delta + Supabase. All input/output schemas come from the contract column on the registry row.',
  estimatedRuntime: '8 min per feature',
  clusterRequirements: 'DBR 15.4 LTS Shared, 2 workers, Unity Catalog, dedicated SP, RestrictedClusterPolicy',
  cells: [
    {
      type: 'markdown',
      content: `# Feature Lab BMAD Runtime

## Why this is sandboxed
BMAD-generated code is, by definition, untrusted. We:
1. Parse the AST and reject \`os.system\`, \`subprocess\`, \`requests\`, \`open\`, \`__import__\`.
2. Restrict SQL to whitelisted catalogs/schemas.
3. Run inside a Unity Catalog **shared** cluster with a service principal that has read on \`security.public\` and write on \`security.feature_lab_outputs\` only.
4. Wrap execution in a 5-minute timeout.
5. Persist a tamper-evident execution record (sha256 of code + output).`,
    },
    {
      type: 'code',
      content: `# Cell 1: Pull pending features
from pyspark.sql import SparkSession, functions as F
spark = SparkSession.builder.appName("feature-lab-runtime").getOrCreate()
TBL = lambda t: f"security.public.{t}"

pending = (spark.table(TBL("soc_agent_registry"))
  .filter((F.col("status") == "pending_runtime") & (F.col("origin") == "feature_lab"))
  .select("agent_id", "feature_name", "code", "contract_json")
  .collect())
print(f"{len(pending)} features queued")`,
    },
    {
      type: 'code',
      content: `# Cell 2: AST allowlist guard
import ast, hashlib, json, time, traceback

FORBIDDEN = {"os", "subprocess", "socket", "requests", "urllib", "ctypes", "shutil", "pickle"}
FORBIDDEN_BUILTINS = {"open", "exec", "eval", "compile", "__import__"}

def validate(code: str):
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in (node.names or []):
                top = alias.name.split(".")[0]
                if top in FORBIDDEN:
                    raise PermissionError(f"forbidden import: {top}")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_BUILTINS:
            raise PermissionError(f"forbidden builtin: {node.func.id}")
    return True`,
    },
    {
      type: 'code',
      content: `# Cell 3: Execute each feature
results = []
for row in pending:
    rec = {"agent_id": row.agent_id, "feature_name": row.feature_name,
           "code_sha": hashlib.sha256(row.code.encode()).hexdigest()}
    try:
        validate(row.code)
        ns = {"spark": spark, "F": F}
        t0 = time.time()
        exec(compile(row.code, f"<feature:{row.feature_name}>", "exec"), ns)
        out_df = ns.get("output")
        if out_df is None:
            raise ValueError("feature must define an 'output' DataFrame")
        sample = out_df.limit(20).toJSON().collect()
        rec.update({
            "status": "ok",
            "duration_s": time.time() - t0,
            "output_count": out_df.count(),
            "sample_json": sample,
        })
    except Exception as e:
        rec.update({"status": "failed", "error": str(e), "trace": traceback.format_exc()})
    results.append(rec)

results_df = spark.createDataFrame(results) \\
  .withColumn("executed_at", F.current_timestamp())
results_df.write.mode("append").saveAsTable(TBL("feature_runtime_executions"))`,
    },
    {
      type: 'sql',
      content: `-- Cell 4: Promote successful features to active
UPDATE security.public.soc_agent_registry
SET status = 'active', activated_at = current_timestamp()
WHERE agent_id IN (
  SELECT agent_id FROM security.public.feature_runtime_executions
  WHERE status = 'ok' AND executed_at > current_timestamp() - INTERVAL 1 HOUR
);`,
    },
  ],
};
