/*
# Hide stored workflow webhook credentials from the browser

1. Plain-English summary
   Workflow webhook tokens are stored in `n8n_workflows.auth_credentials`. Until now any visitor
   could read them. Workflows are now executed by the `execute-workflow` server function, which reads
   the token with the service role, so the browser no longer needs (or can read) this column.

2. Modified tables
   - `n8n_workflows`: anon and authenticated lose SELECT on `auth_credentials` only. They keep SELECT on
     every other column, and keep INSERT/UPDATE so credentials can still be written (write-only).

3. Security changes
   - Column-level SELECT replaces the table-level SELECT for anon/authenticated.
   - service_role keeps full access for the server function.

4. Notes
   - No data is changed or removed. Existing policies are unchanged.
*/

REVOKE SELECT ON public.n8n_workflows FROM anon, authenticated;

GRANT SELECT (id, name, description, n8n_webhook_url, n8n_workflow_id, workflow_type, enabled,
  configuration, auth_method, created_by, created_at, updated_at)
  ON public.n8n_workflows TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.n8n_workflows TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.workflow_executions TO service_role;
