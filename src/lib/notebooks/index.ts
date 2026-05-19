import { DatabricksNotebook } from '../databricksNotebooks';
import { correlationNotebooks } from './correlationNotebooks';
import { mlNotebooks } from './mlNotebooks';
import { streamingNotebooks } from './streamingNotebooks';
import { behavioralNotebooks } from './behavioralNotebooks';
import { threatIntelNotebooks } from './threatIntelNotebooks';
import { allProductionNotebooks } from './productionNotebooks';
import { graphCorrelationSchemasNotebook } from './graphCorrelationSchemas';
import { graphCorrelationRuntimeNotebook } from './graphCorrelationRuntime';
import { graphCorrelationDetectionsNotebook } from './graphCorrelationDetections';
import { graphCorrelationVectorMemoryNotebook } from './graphCorrelationVectorMemory';
import { graphCorrelationVectorDetectionNotebook } from './graphCorrelationVectorDetection';
import { agentSOCSchemasNotebook } from './agentSOCSchemas';
import { agentSOCPipelineNotebook } from './agentSOCPipeline';
import { agentSOCOrchestratorNotebook } from './agentSOCOrchestrator';
import { chronoweaveFusionNotebook } from './chronoweaveNotebooks';
import { geopoliticalCyberCorrelationNotebook } from './geopoliticalCorrelationNotebook';
import { incidentDrilldownEnrichmentNotebook } from './incidentDrilldownNotebook';
import { featureLabRuntimeNotebook } from './featureLabRuntimeNotebook';
import { detectionConfluenceNotebook } from './detectionConfluenceNotebook';
import { negativeCorrelationNotebook } from './negativeCorrelationNotebook';

export const allNotebooks: DatabricksNotebook[] = [
  ...allProductionNotebooks,
  ...correlationNotebooks,
  ...mlNotebooks,
  ...streamingNotebooks,
  ...behavioralNotebooks,
  ...threatIntelNotebooks,
  graphCorrelationSchemasNotebook,
  graphCorrelationRuntimeNotebook,
  graphCorrelationDetectionsNotebook,
  graphCorrelationVectorMemoryNotebook,
  graphCorrelationVectorDetectionNotebook,
  agentSOCSchemasNotebook,
  agentSOCPipelineNotebook,
  agentSOCOrchestratorNotebook,
  chronoweaveFusionNotebook,
  geopoliticalCyberCorrelationNotebook,
  incidentDrilldownEnrichmentNotebook,
  featureLabRuntimeNotebook,
  detectionConfluenceNotebook,
  negativeCorrelationNotebook,
];

export {
  correlationNotebooks,
  mlNotebooks,
  streamingNotebooks,
  behavioralNotebooks,
  threatIntelNotebooks,
  allProductionNotebooks,
  graphCorrelationSchemasNotebook,
  graphCorrelationRuntimeNotebook,
  graphCorrelationDetectionsNotebook,
  graphCorrelationVectorMemoryNotebook,
  graphCorrelationVectorDetectionNotebook,
  agentSOCSchemasNotebook,
  agentSOCPipelineNotebook,
  agentSOCOrchestratorNotebook,
  chronoweaveFusionNotebook,
  geopoliticalCyberCorrelationNotebook,
  incidentDrilldownEnrichmentNotebook,
  featureLabRuntimeNotebook,
  detectionConfluenceNotebook,
  negativeCorrelationNotebook,
};
