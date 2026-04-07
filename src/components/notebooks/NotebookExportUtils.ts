import { DatabricksNotebook, NotebookCell } from '../../lib/databricksNotebooks';

function cellToDatabricksFormat(cell: NotebookCell, index: number): string {
  const command = index === 0 ? '' : '\n# COMMAND ----------\n\n';

  if (cell.type === 'markdown') {
    return `${command}# MAGIC %md\n${cell.content.split('\n').map(line => `# MAGIC ${line}`).join('\n')}`;
  }
  if (cell.type === 'sql') {
    return `${command}# MAGIC %sql\n${cell.content.split('\n').map(line => `# MAGIC ${line}`).join('\n')}`;
  }
  return `${command}${cell.content}`;
}

export function notebookToPython(notebook: DatabricksNotebook): string {
  const header = `# Databricks notebook source
# MAGIC %md
# MAGIC # ${notebook.title}
# MAGIC ## ${notebook.subtitle}
# MAGIC
# MAGIC **Category:** ${notebook.category} | **Tags:** ${notebook.tags.join(', ')}
# MAGIC
# MAGIC **Estimated Runtime:** ${notebook.estimatedRuntime} | **Cluster:** ${notebook.clusterRequirements}
# MAGIC
# MAGIC ---

# COMMAND ----------

`;
  const cells = notebook.cells.map((cell, i) => cellToDatabricksFormat(cell, i)).join('\n\n');
  return header + cells;
}

export function notebookToJSON(notebook: DatabricksNotebook): string {
  const dbNotebook = {
    version: "NotebookV1",
    name: notebook.title,
    language: "python",
    commands: notebook.cells.map((cell, idx) => ({
      position: idx + 1,
      command: cell.type === 'sql' ? `%sql\n${cell.content}` :
               cell.type === 'markdown' ? `%md\n${cell.content}` :
               cell.content,
      language: cell.type === 'sql' ? 'sql' : cell.type === 'markdown' ? 'md' : 'python',
    })),
  };
  return JSON.stringify(dbNotebook, null, 2);
}

export function downloadNotebook(notebook: DatabricksNotebook, format: 'py' | 'json') {
  const content = format === 'py' ? notebookToPython(notebook) : notebookToJSON(notebook);
  const mimeType = format === 'py' ? 'text/x-python' : 'application/json';
  const extension = format === 'py' ? 'py' : 'json';

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${notebook.id}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAllNotebooks(notebooks: DatabricksNotebook[], format: 'py' | 'json') {
  notebooks.forEach((nb, i) => {
    setTimeout(() => downloadNotebook(nb, format), i * 200);
  });
}
