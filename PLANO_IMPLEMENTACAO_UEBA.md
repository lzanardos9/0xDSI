# Plano de Implementacao - Deteccao de Ameacas Internas (UEBA)

## Primeiro Cliente - Cronograma Completo

---

## Fase 0: Pre-Requisitos e Setup (Semana 1-2)

### Semana 1: Infraestrutura

| Dia | Atividade | Responsavel | Entregavel |
|-----|-----------|-------------|------------|
| D1-D2 | Provisionamento do workspace Databricks | Infra | Catalog `0xdsi_soc` ativo |
| D1-D2 | Configuracao do Unity Catalog + schemas | Infra | bronze/silver/gold schemas |
| D3 | Deploy dos notebooks _shared/ (bootstrap, config, helpers) | Engenharia | Framework base funcional |
| D3-D4 | Configuracao de secrets (API keys, endpoints) | Infra | Secrets scope configurado |
| D5 | Deploy do setup/01_create_catalog_schema.py | Engenharia | 100+ tabelas criadas |
| D5 | Validacao: todas as tabelas existem e RLS correto | QA | Checklist verde |

### Semana 2: Conectores e Ingestao Inicial

| Dia | Atividade | Responsavel | Entregavel |
|-----|-----------|-------------|------------|
| D1-D2 | Configuracao de conectores (AD, EDR, Proxy) | Engenharia | Streaming ativo |
| D2-D3 | Deploy ingestion notebooks (01-05 prioritarios) | Engenharia | Eventos fluindo para bronze |
| D4 | Configuracao de schema enforcement (03) | Engenharia | OCSF validation ativa |
| D4 | Configuracao do quarantine handler (04) | Engenharia | Eventos malformados isolados |
| D5 | Validacao: eventos chegando, volumes corretos | QA | Dashboard de ingestao verde |

**Gate de Saida Fase 0:**
- [ ] Workspace operacional
- [ ] Minimo 3 fontes de dados conectadas
- [ ] Eventos fluindo para tabela `events` particionada
- [ ] Bootstrap funcional em todos os notebooks

---

## Fase 1: Ingestao em Batch para Treinamento (Semana 3-4)

### Objetivo
Carregar **90 dias de dados historicos** via batch para construir baselines comportamentais antes de ativar deteccao em tempo real.

### Semana 3: Carga Historica

| Dia | Atividade | Volume Esperado | Tempo |
|-----|-----------|-----------------|-------|
| D1 | Batch load: Active Directory logs (90 dias) | ~50M eventos | 4-6h |
| D1 | Batch load: VPN/ZTNA logs (90 dias) | ~20M eventos | 2-3h |
| D2 | Batch load: EDR telemetria (90 dias) | ~200M eventos | 8-12h |
| D2 | Batch load: Proxy/SWG logs (90 dias) | ~500M eventos | 12-16h |
| D3 | Batch load: Email metadata (90 dias) | ~30M eventos | 3-4h |
| D3 | Batch load: DLP incidents (90 dias) | ~2M eventos | 30min |
| D4 | Batch load: Cloud audit logs (90 dias) | ~100M eventos | 6-8h |
| D5 | Validacao de integridade dos dados | N/A | 4h |

**Configuracao de Cluster para Batch:**
```
Runtime: 14.3 LTS ML
Workers: 16-32 (auto-scale)
Instance: i3.2xlarge (memory-optimized)
Spot instances: 80% (tolerancia a interrupcao)
Paralelismo: 4 fontes simultaneas max
```

**Otimizacao de Ingestao:**
- Usar `COPY INTO` para carga massiva (10x mais rapido que INSERT)
- Particionar por `event_type` + `DATE(timestamp)` durante carga
- Desabilitar CDF durante batch (reativar depois)
- Z-ORDER por `user_id, timestamp` apos carga completa
- OPTIMIZE em tabelas > 1TB apos carga

### Semana 4: Normalizacao e Enriquecimento

| Dia | Atividade | Tempo |
|-----|-----------|-------|
| D1-D2 | Pipeline DLT Silver: normalizacao OCSF de 90 dias | 12-24h |
| D2-D3 | Entity Spine: construcao do grafo de entidades | 8-12h |
| D3 | Enrichment: geolocalizacao, ASN, reputacao | 4-6h |
| D4 | Construcao de `enriched_security_events` (Gold) | 6-8h |
| D5 | Validacao: Silver e Gold layers completos | 4h |

**Gate de Saida Fase 1:**
- [ ] 90 dias de dados em todas as 3 camadas (bronze/silver/gold)
- [ ] Entity Spine populado com todos os usuarios/assets
- [ ] `enriched_security_events` disponivel para ML
- [ ] Dados validados: sem gaps > 1h, sem duplicatas > 0.1%

---

## Fase 2: Treinamento dos Modelos (Semana 5-7)

### Semana 5: Feature Engineering e Baselines

| Dia | Atividade | Notebook | Tempo |
|-----|-----------|----------|-------|
| D1 | Deploy ml_training/02_feature_engineering.py | Feature eng | 2h deploy |
| D1-D2 | Execucao: gerar features para todos os usuarios (90d) | Feature eng | 8-12h |
| D3 | Deploy ml_training/03_ueba_behavioral_baseline.py | Baselines | 2h deploy |
| D3-D4 | Execucao: calcular baseline individual para cada usuario | Baselines | 12-18h |
| D5 | Validacao: features geradas, baselines coerentes | QA | 4h |

**Features Geradas (por usuario, por dia):**
- login_count, logout_count, failed_login_count
- unique_sources_accessed, unique_ips_used
- bytes_downloaded, bytes_uploaded
- off_hours_activity_ratio
- new_resource_access_count
- peer_group_deviation_score
- geo_diversity_score
- application_diversity_score

**Baselines Calculados:**
- media movel exponencial (EWM, alpha=0.1) por feature
- desvio padrao por feature
- percentis 95/99 por feature
- peer group medians por departamento/cargo

### Semana 6: Treinamento de Modelos

| Dia | Modelo | Tecnica | Dados | Tempo Treino |
|-----|--------|---------|-------|--------------|
| D1 | Anomaly Detector | Isolation Forest | 90d features | 2-4h |
| D1 | Sequence Predictor | LSTM Autoencoder | Sequencias de acoes | 6-8h |
| D2 | Risk Scorer | XGBoost | Features + labels historicos | 1-2h |
| D2 | Peer Comparator | DBSCAN + KNN | Features por grupo | 2-3h |
| D3 | Entity Drift | Online Learning (River) | Streaming features | Setup 1h |
| D3-D4 | Graph Anomaly | GNN (PyG) | Entity Spine edges | 8-12h |
| D5 | Ensemble Combiner | Stacking | Outputs dos modelos acima | 1-2h |

**Configuracao de Cluster para ML:**
```
Runtime: 14.3 LTS ML (GPU)
Driver: g5.4xlarge (GPU para LSTM/GNN)
Workers: 8 (i3.2xlarge) para feature eng
MLflow Experiment: 0xdsi_ueba_v1
Model Registry: Unity Catalog
```

**Hiperparametros Esperados:**

| Modelo | Parametros Chave | Range |
|--------|------------------|-------|
| Isolation Forest | n_estimators=500, contamination=0.02-0.05 | Grid search |
| LSTM Autoencoder | layers=2, hidden=128, seq_len=48h, lr=0.001 | Bayesian opt |
| XGBoost | max_depth=6-10, n_rounds=200-500, eta=0.05-0.1 | Optuna |
| GNN | layers=3, hidden=64, attention_heads=4 | Manual |

### Semana 7: Validacao e Calibracao

| Dia | Atividade | Metrica Alvo |
|-----|-----------|--------------|
| D1 | Backtesting: rodar modelos em 90 dias historicos | AUC > 0.85 |
| D2 | Analise de falsos positivos em dados reais | FP rate < 5% |
| D3 | Calibracao de thresholds por modelo | Precision@90% recall |
| D4 | Validacao com equipe de seguranca (known incidents) | Recall > 80% em incidentes conhecidos |
| D5 | Registro de modelos finais no MLflow | Modelos em "Production" stage |

**Expectativas de Performance:**

| Modelo | AUC Esperado | FP Rate | Recall | Latencia |
|--------|-------------|---------|--------|----------|
| Isolation Forest | 0.82-0.88 | 3-5% | 70-80% | < 100ms |
| LSTM Autoencoder | 0.85-0.92 | 2-4% | 75-85% | < 500ms |
| XGBoost Risk Scorer | 0.88-0.94 | 1-3% | 80-90% | < 50ms |
| Ensemble | 0.90-0.95 | 1-2% | 85-92% | < 1s |

**IMPORTANTE - Expectativas Realistas:**
- Semana 1-2: Muitos falsos positivos (modelos "frios")
- Semana 3-4: Reducao significativa apos feedback loop
- Semana 5-8: Estabilizacao em FP < 5%
- Mes 3+: Modelo maduro com FP < 2%

**Gate de Saida Fase 2:**
- [ ] Todos os modelos registrados no MLflow
- [ ] AUC > 0.85 em backtesting
- [ ] False Positive Rate < 5% em dados historicos
- [ ] Recall > 80% em incidentes conhecidos
- [ ] Modelos promovidos para "Production" no registry

---

## Fase 3: Pipeline de Deteccao Real-Time (Semana 8-9)

### Semana 8: Deploy dos Agentes

| Dia | Agente | Funcao | SLA |
|-----|--------|--------|-----|
| D1 | 01_triage_agent | Triagem automatica de alertas | < 30s por alerta |
| D1 | 02_enrichment_agent | Enriquecimento com threat intel | < 60s por alerta |
| D2 | 03_threat_hunter_agent | Caca proativa de ameacas | < 5min por hunt |
| D2 | 09_pattern_discovery | Descoberta de padroes novos | Batch 15min |
| D3 | 04_orchestrator | Orquestracao da pipeline | < 2min end-to-end |
| D3 | 10_vector_memory | Memoria vetorial dos agentes | Near-realtime |
| D4 | 40_llm_risk_profiler | Profiling de uso de LLM | < 60s |
| D5 | Validacao end-to-end: alerta → triagem → enriquecimento → resposta | Full | < 5min |

### Semana 9: Correlation e Detection

| Dia | Notebook | Funcao | Frequencia |
|-----|----------|--------|------------|
| D1 | correlation/01_streaming_correlation | CEP em streaming | Continuo |
| D1 | correlation/02_negative_correlation | Correlacao negativa | 5min batch |
| D2 | correlation/04_temporal_window | Janelas temporais | Continuo |
| D2 | correlation/08_entity_spine | Atualizacao do grafo | 1min micro-batch |
| D3 | detection/01_behavioral_anomaly | Deteccao de anomalias | 5min |
| D3 | detection/03_detection_slm | SLM para deteccao | 15min |
| D4 | detection/05_entity_drift_cet | Drift de entidades | 5min |
| D5 | Validacao: pipeline completa com dados reais | Full | Continuo |

**Gate de Saida Fase 3:**
- [ ] Pipeline processando eventos em tempo real
- [ ] MTTD (Mean Time to Detect) < 15 minutos
- [ ] Orchestrator executando ciclos a cada 5 minutos
- [ ] Zero crashes em 48h de operacao continua
- [ ] Alertas chegando no dashboard

---

## Fase 4: Operacao Assistida (Semana 10-12)

### Modo "Shadow" (Semana 10)
- Pipeline rodando em paralelo com SOC existente
- Alertas gerados mas NAO executam acoes automaticas
- Analistas revisam e dao feedback (true positive / false positive)
- Ajuste fino de thresholds baseado em feedback

### Modo "Semi-Automatico" (Semana 11)
- Alertas de baixo risco: contencao automatica
- Alertas de medio risco: sugestao + aprovacao humana
- Alertas de alto risco: notificacao imediata + investigacao assistida

### Modo "Producao" (Semana 12)
- Pipeline autonoma com human-in-the-loop para acoes criticas
- Reporting automatico para gestao
- Metricas de SLA sendo monitoradas

---

## Fase 5: Otimizacao Continua (Mes 4+)

- Retreinamento semanal dos modelos com novos dados
- Revisao quinzenal de falsos positivos com equipe SOC
- Adicao de novas fontes de dados (Fase 2/3 do plano de fontes)
- Refinamento de peer groups baseado em mudancas organizacionais
- Expansao de cenarios de deteccao

---

## Custos Estimados (Databricks)

### Cluster de Ingestao (24/7)
```
Workers: 4-8 (auto-scale), i3.xlarge
DBU/hora: ~12-24 DBUs
Custo mensal: ~$2,500-5,000
```

### Cluster de ML Training (sob demanda)
```
Driver: g5.4xlarge (GPU)
Workers: 8 i3.2xlarge
DBU/hora: ~80 DBUs
Uso: ~40h/semana (treinamento + retreino)
Custo mensal: ~$3,000-6,000
```

### Cluster de Deteccao (24/7)
```
Workers: 4-16 (auto-scale), m5.2xlarge
DBU/hora: ~16-64 DBUs
Custo mensal: ~$4,000-8,000
```

### Storage (Delta Lake)
```
90 dias retencao, ~2TB/mes ingestao
Custo mensal: ~$500-1,000
```

### Total Estimado: $10,000-20,000/mes
(Varia com volume de eventos e numero de fontes)

---

## Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|---------------|---------|-----------|
| Volume de dados maior que esperado | Alta | Custo | Auto-scaling + alertas de custo |
| Falsos positivos excessivos no inicio | Alta | Confianca | Modo shadow + feedback loop |
| Fonte de dados indisponivel | Media | Cobertura | Graceful degradation + alertas |
| Modelo degenera com o tempo | Media | Deteccao | Monitoramento de drift + retreino |
| Latencia acima do SLA | Baixa | Deteccao | Cluster overprovisioning inicial |
| Dados com PII mal gerenciados | Baixa | Compliance | RBAC + masking + audit |

---

## Metricas de Sucesso por Fase

| Fase | Metrica | Target | Prazo |
|------|---------|--------|-------|
| 0 | Fontes conectadas | >= 3 | Semana 2 |
| 1 | Dados historicos carregados | 90 dias, todas fontes | Semana 4 |
| 2 | Model AUC (backtesting) | > 0.85 | Semana 7 |
| 3 | MTTD (tempo de deteccao) | < 15 min | Semana 9 |
| 3 | Pipeline uptime | > 99.5% | Semana 9 |
| 4 | False Positive Rate | < 5% | Semana 12 |
| 4 | Analista satisfaction score | > 7/10 | Semana 12 |
| 5 | FP Rate (maduro) | < 2% | Mes 4 |
| 5 | Incidents detectados vs total | > 85% recall | Mes 4 |

---

## Checklist Pre-Go-Live

- [ ] Todas as fontes de dados da Fase 1 conectadas e validadas
- [ ] 90 dias de historico processado (bronze/silver/gold)
- [ ] Modelos treinados com AUC > 0.85
- [ ] Pipeline end-to-end testada com dados reais (modo shadow)
- [ ] Thresholds calibrados com feedback da equipe
- [ ] Runbooks de operacao documentados
- [ ] Escalation matrix configurada
- [ ] Dashboards operacionais ativos
- [ ] Alertas de saude do sistema configurados
- [ ] Backup e disaster recovery testados
- [ ] Equipe treinada no uso da plataforma
- [ ] LGPD/DPIA aprovada pelo juridico
- [ ] Acordo de SLA documentado com stakeholders
