import { DatabricksNotebook } from '../databricksNotebooks';
import { correlationNotebooks } from './correlationNotebooks';
import { mlNotebooks } from './mlNotebooks';
import { streamingNotebooks } from './streamingNotebooks';
import { behavioralNotebooks } from './behavioralNotebooks';
import { threatIntelNotebooks } from './threatIntelNotebooks';
import { mockDataNotebooks } from './mockDataNotebooks';
import { graphCorrelationSchemasNotebook } from './graphCorrelationSchemas';
import { graphCorrelationRuntimeNotebook } from './graphCorrelationRuntime';
import { graphCorrelationDetectionsNotebook } from './graphCorrelationDetections';
import { graphCorrelationVectorMemoryNotebook } from './graphCorrelationVectorMemory';
import { graphCorrelationVectorDetectionNotebook } from './graphCorrelationVectorDetection';
import { agentSOCSchemasNotebook } from './agentSOCSchemas';
import { agentSOCPipelineNotebook } from './agentSOCPipeline';
import { agentSOCOrchestratorNotebook } from './agentSOCOrchestrator';

export const allNotebooks: DatabricksNotebook[] = [
  ...correlationNotebooks,
  ...mlNotebooks,
  ...streamingNotebooks,
  ...behavioralNotebooks,
  ...threatIntelNotebooks,
  ...mockDataNotebooks,
  graphCorrelationSchemasNotebook,
  graphCorrelationRuntimeNotebook,
  graphCorrelationDetectionsNotebook,
  graphCorrelationVectorMemoryNotebook,
  graphCorrelationVectorDetectionNotebook,
  agentSOCSchemasNotebook,
  agentSOCPipelineNotebook,
  agentSOCOrchestratorNotebook,
];

export {
  correlationNotebooks,
  mlNotebooks,
  streamingNotebooks,
  behavioralNotebooks,
  threatIntelNotebooks,
  mockDataNotebooks,
  graphCorrelationSchemasNotebook,
  graphCorrelationRuntimeNotebook,
  graphCorrelationDetectionsNotebook,
  graphCorrelationVectorMemoryNotebook,
  graphCorrelationVectorDetectionNotebook,
  agentSOCSchemasNotebook,
  agentSOCPipelineNotebook,
  agentSOCOrchestratorNotebook,
};
