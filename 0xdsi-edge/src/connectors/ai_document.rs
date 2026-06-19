use crate::define_connector;

/// AI Document Analysis Connectors
/// These process unstructured documents (PDF, DOCX, contracts, compliance reports)
/// using ML/LLM pipelines to extract security-relevant data:
/// - Asset inventories
/// - Risk assessments
/// - Business Impact Analysis (BIA) records
/// - Compliance gaps
/// - Contract obligations and SLA data

// General PDF/DOCX analyzer with OCR + NLP
define_connector!(AiDocPdf, "AI Document Analyzer (PDF/DOCX)", "ai_doc_pdf", "ai_analysis",
    "File Watch / S3 Poll / REST Upload → LLM Pipeline");

// Contract-specific risk and obligation extractor
define_connector!(AiDocContract, "Contract Risk Extractor", "ai_doc_contract", "ai_analysis",
    "PDF/DOCX → NER + Clause Classification → Risk Scoring");

// Compliance document scanner (SOC2, ISO 27001, PCI, HIPAA)
define_connector!(AiDocCompliance, "Compliance Document Scanner", "ai_doc_compliance", "ai_analysis",
    "Policy/Audit Docs → Framework Mapping → Gap Detection");

// Business Impact Analysis extractor
define_connector!(AiDocBia, "Business Impact Analysis (BIA)", "ai_doc_bia", "ai_analysis",
    "BCP/DR Docs → Process Criticality + RTO/RPO Extraction");
