import { DatabricksNotebook, NotebookCell } from '../../lib/databricksNotebooks';
import { recordNotebookExport } from '../../lib/notebookRuns';

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

/**
 * Export to Jupyter `.ipynb` format. Databricks accepts .ipynb on import
 * and converts cells appropriately. This is the portable format.
 */
export function notebookToIpynb(notebook: DatabricksNotebook): string {
  const cellTypeMap: Record<NotebookCell['type'], 'markdown' | 'code'> = {
    markdown: 'markdown',
    code: 'code',
    sql: 'code',
  };

  const ipynbCells = notebook.cells.map((cell) => {
    const lines = cell.content.split('\n');
    const sourceLines = lines.map((l, i) => (i < lines.length - 1 ? `${l}\n` : l));

    if (cell.type === 'markdown') {
      return {
        cell_type: 'markdown',
        metadata: {},
        source: sourceLines,
      };
    }

    const prefix = cell.type === 'sql' ? '%sql\n' : '';
    const codeSource = prefix
      ? [prefix, ...sourceLines]
      : sourceLines;

    return {
      cell_type: 'code',
      execution_count: null,
      metadata: {},
      outputs: [],
      source: codeSource,
    };
  });

  const ipynb = {
    cells: ipynbCells,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        name: 'python',
        version: '3.10',
      },
      databricks: {
        notebookName: notebook.title,
        category: notebook.category,
        tags: notebook.tags,
        estimatedRuntime: notebook.estimatedRuntime,
        clusterRequirements: notebook.clusterRequirements,
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };

  return JSON.stringify(ipynb, null, 2);
}

/**
 * Legacy JSON export. Kept for backwards compatibility but uses the
 * Databricks workspace notebook JSON shape that the import API actually accepts.
 */
export function notebookToJSON(notebook: DatabricksNotebook): string {
  return notebookToIpynb(notebook);
}

export type NotebookExportFormat = 'py' | 'json' | 'ipynb';

export function downloadNotebook(notebook: DatabricksNotebook, format: NotebookExportFormat) {
  let content: string;
  let mimeType: string;
  let extension: string;

  if (format === 'py') {
    content = notebookToPython(notebook);
    mimeType = 'text/x-python';
    extension = 'py';
  } else if (format === 'ipynb') {
    content = notebookToIpynb(notebook);
    mimeType = 'application/x-ipynb+json';
    extension = 'ipynb';
  } else {
    content = notebookToJSON(notebook);
    mimeType = 'application/json';
    extension = 'json';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${notebook.id}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  void recordNotebookExport(notebook.id, notebook.title, format);
}

export function downloadAllNotebooks(notebooks: DatabricksNotebook[], format: NotebookExportFormat) {
  notebooks.forEach((nb, i) => {
    setTimeout(() => downloadNotebook(nb, format), i * 200);
  });
}
