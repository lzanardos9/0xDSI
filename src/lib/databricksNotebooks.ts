export interface NotebookCell {
  type: 'markdown' | 'code' | 'sql';
  content: string;
}

export interface DatabricksNotebook {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  tags: string[];
  description: string;
  estimatedRuntime: string;
  clusterRequirements: string;
  cells: NotebookCell[];
}

export interface NotebookCategory {
  id: string;
  label: string;
  description: string;
  icon: string;
  count: number;
}

export const notebookCategories: NotebookCategory[] = [
  { id: 'all', label: 'All Notebooks', description: 'Complete collection', icon: 'Layers', count: 0 },
  { id: 'correlation', label: 'Correlation Engines', description: 'Real-time event correlation and pattern matching', icon: 'GitBranch', count: 0 },
  { id: 'ml', label: 'ML / AI Engines', description: 'Machine learning models and AI-driven detection', icon: 'Brain', count: 0 },
  { id: 'streaming', label: 'Streaming Analytics', description: 'Spark Structured Streaming pipelines', icon: 'Zap', count: 0 },
  { id: 'threat-intel', label: 'Threat Intelligence', description: 'IOC enrichment and threat feed integration', icon: 'Shield', count: 0 },
  { id: 'behavioral', label: 'Behavioral Analytics', description: 'User and entity behavior analysis', icon: 'Users', count: 0 },
  { id: 'mock-data', label: 'Mock Data Generators', description: 'Realistic data replay for demos', icon: 'Database', count: 0 },
];

export function getNotebookCategories(notebooks: DatabricksNotebook[]): NotebookCategory[] {
  return notebookCategories.map(cat => ({
    ...cat,
    count: cat.id === 'all' ? notebooks.length : notebooks.filter(n => n.category === cat.id).length,
  }));
}
