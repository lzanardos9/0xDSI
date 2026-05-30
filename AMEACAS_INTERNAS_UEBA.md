# Ameacas Internas e Analise Comportamental de Usuarios (UEBA)

## Visao Geral

Ameacas internas (Insider Threats) representam um dos vetores de ataque mais destrutivos e dificeis de detectar. Diferente de atacantes externos, insiders ja possuem acesso legitimo, conhecimento dos sistemas e credenciais validas. A deteccao depende inteiramente da **analise comportamental** — identificar desvios do padrao normal de cada usuario.

---

## 1. Categorias de Ameacas Internas

### 1.1 Insider Malicioso
- Funcionario com intencao deliberada de causar dano
- Roubo de propriedade intelectual
- Venda de credenciais em mercados clandestinos
- Sabotagem de sistemas antes de desligamento
- Espionagem corporativa / industrial

### 1.2 Insider Negligente
- Violacao acidental de politicas de seguranca
- Cliques em phishing / engenharia social
- Compartilhamento inadequado de dados sensiveis
- Uso de shadow IT e aplicacoes nao autorizadas
- Configuracoes incorretas que expoe dados

### 1.3 Insider Comprometido
- Credenciais roubadas por atacante externo
- Conta sequestrada via credential stuffing
- Sessao hijack / token theft
- Malware em endpoint que opera com privilegios do usuario

### 1.4 Insider Colaborador
- Funcionario recrutado por grupo adversario (APT)
- Coercao / chantagem para exfiltrar dados
- Conluio entre multiplos insiders

---

## 2. Capacidades de Deteccao Comportamental

### 2.1 Baseline Comportamental Individual
| Dimensao | O Que Monitoramos |
|----------|-------------------|
| Horario de trabalho | Horas de login/logout, atividade fora do expediente |
| Volume de dados | MB/GB acessados, downloads, uploads por dia |
| Recursos acessados | Quais sistemas, pastas, bancos de dados |
| Padrao de digitacao | Velocidade, cadencia, erros (biometria comportamental) |
| Movimentacao de mouse | Padroes de cursor, velocidade, paradas |
| Aplicacoes utilizadas | Apps abertos, tempo em cada app |
| Comunicacao | Volume de emails, destinatarios, horarios |
| Geolocalizacao | De onde acessa, VPN, viagens |

### 2.2 Deteccao de Anomalias
- **Desvio temporal**: Acesso as 3h da manha quando o baseline e 8h-18h
- **Desvio volumetrico**: Download de 2GB quando a media e 50MB/dia
- **Desvio de recurso**: Acesso a repositorio de codigo nunca acessado antes
- **Desvio geografico**: Login de pais diferente em intervalo impossivel (impossible travel)
- **Desvio de privilegio**: Escalacao de privilegios fora do processo normal
- **Desvio de rede**: Comunicacao com IP/dominio incomum
- **Desvio de aplicacao**: Uso de ferramenta de exfiltracao (WinRAR, MegaSync, rclone)

### 2.3 Indicadores Compostos (Fusion de Sinais)
- Aviso previo + download massivo + acesso fora do horario = **risco critico**
- Falhas de MFA repetidas + login de IP diferente = **credential stuffing**
- Acesso a dados sensiveis + upload para nuvem pessoal = **exfiltracao**
- Pesquisa "como deletar logs" + limpeza de historico = **anti-forense**
- Acesso a sistemas financeiros + mudanca de dados bancarios = **fraude**

### 2.4 Perfilamento Psicologico (Indicadores de Risco)
- Indicadores de insatisfacao (pesquisas de emprego, reclamacoes)
- Padrao financeiro (dificuldades financeiras podem indicar motivacao)
- Mudancas de comportamento abruptas
- Isolamento social / reducao de comunicacao com equipe
- Horarios erraticos / padrao de sono irregular

### 2.5 Biometria Comportamental
- Keystroke dynamics (ritmo de digitacao unico por pessoa)
- Mouse dynamics (velocidade, curvatura, paradas)
- Padrao de navegacao (sequencia de cliques, scroll)
- Verificacao continua de identidade (alem do login)

---

## 3. Fontes de Dados Necessarias

### 3.1 Identity & Access Management (IAM)

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Active Directory / Entra ID | Logins, logouts, falhas, lockouts, mudancas de grupo | Windows Event Logs (4624, 4625, 4720, 4728) |
| LDAP / OpenLDAP | Autenticacoes, consultas de diretorio | Syslog / LDAP audit logs |
| Okta / Auth0 / OneLogin | SSO events, MFA challenges, device trust | API REST / Webhooks |
| CyberArk / BeyondTrust | Sessoes privilegiadas, checkout de credenciais | Syslog / API |
| Azure AD / AWS IAM | Role assumptions, policy changes, cross-account | CloudTrail / Azure Activity Log |

### 3.2 Endpoint (EDR / XDR)

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| CrowdStrike Falcon | Processos, modulos carregados, network connections | API Streaming / Syslog |
| Microsoft Defender for Endpoint | Alertas, timeline de processos, file events | Microsoft Graph API |
| SentinelOne | Storyline (kill chain completa), deep visibility | API REST / S1 QL |
| Carbon Black | Process tree, modloads, registry mods, netconns | API / Syslog CEF |
| Osquery | Tabelas de SO em tempo real (processos, users, sockets) | JSON / TLS |

### 3.3 Network (NDR / Flow)

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Firewalls (Palo Alto, Fortinet) | Conexoes permitidas/bloqueadas, apps, users | Syslog CEF / LEEF |
| Proxy / SWG (Zscaler, Netskope) | URLs acessadas, uploads, categorias, DLP matches | API / Syslog |
| DNS (Infoblox, Route53) | Resolucoes, domains suspeitos, tunneling | DNS logs / Passive DNS |
| NetFlow / IPFIX | Volume de trafego, top talkers, anomalias de fluxo | NetFlow v5/v9 / IPFIX |
| Full PCAP (Zeek/Bro, Suricata) | Protocolos detalhados, extractions, anomalias | JSON / EVE JSON |
| IDS/IPS (Snort, Suricata) | Alertas de assinatura, protocolos malformados | Unified2 / EVE JSON |

### 3.4 Cloud & SaaS

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Microsoft 365 / Google Workspace | Emails enviados, arquivos compartilhados, labels | Management Activity API / Reports API |
| Salesforce | Exports de dados, mudancas em oportunidades | Event Monitoring / Shield |
| GitHub / GitLab | Commits, clones, forks, secrets em codigo | Webhooks / Audit API |
| AWS CloudTrail | Todas as chamadas de API, S3 access, IAM changes | JSON / S3 / EventBridge |
| Azure Monitor / GCP Audit | Operacoes em recursos, RBAC changes | Diagnostic Settings / Pub/Sub |
| Box / Dropbox / OneDrive | Downloads massivos, shares externos, previews | API / Webhooks |
| Slack / Teams | Mensagens DLP, arquivos compartilhados, channels | Compliance API / Graph API |

### 3.5 DLP (Data Loss Prevention)

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Symantec DLP | Policy violations, data classifications, incidents | Syslog / API |
| Microsoft Purview | Sensitivity labels, data movement, policy matches | Graph API / Activity Explorer |
| Digital Guardian | File movements, USB copies, print, clipboard | API / Syslog |
| Netskope DLP | Cloud data movement, inline inspection results | API REST |
| Forcepoint DLP | Incidents, channels (email, web, endpoint) | Syslog / ICAP |

### 3.6 Aplicacoes de Negocio (Business Apps)

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| SAP | Transacoes executadas, mudancas em dados mestres | SAP Audit Log / RFC |
| Oracle EBS / Fusion | Aprovacoes, alteracoes financeiras | Database audit / API |
| ServiceNow | Tickets, mudancas de configuracao, accessos | API REST |
| Jira / Confluence | Acesso a documentos sensiveis, exports | Webhooks / Audit Log |
| Sistemas de RH (Workday, SuccessFactors) | Desligamentos, mudancas de cargo, PIP | API / SFTP |

### 3.7 Seguranca Fisica

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Controle de acesso (catracas/crachas) | Entradas/saidas, horarios, areas restritas | Wiegand / OSDP / API |
| CCTV / Cameras | Reconhecimento facial, deteccao de tailgating | RTSP / ONVIF / Analytics API |
| Impressoras / MFP | Documentos impressos, volume, horarios | SNMP / Syslog |
| Visitantes | Registro de visitantes, sponsors, horarios | API do sistema de visitantes |

### 3.8 HR & Context Enrichment

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Sistema de RH | Cargo, departamento, gerente, data admissao | API / CSV / SFTP |
| Performance reviews | Score de desempenho, feedbacks negativos | API / Batch |
| Listas de desligamento | Aviso previo, demissao programada | API / Webhook |
| Travel system | Viagens aprovadas (para validar geolocalizacao) | API |
| Badge photo | Foto oficial para reconhecimento facial | LDAP / API |

### 3.9 Comunicacoes e Analise Psicologica (NLP/LLM)

Esta e uma das fontes mais ricas e sensíveis para deteccao de insider threats. A analise de comunicacoes permite construir um **perfil psicologico continuo** de cada usuario, detectando mudancas de humor, insatisfacao crescente, intencao maliciosa e sinais pre-exfiltracao.

#### 3.9.1 Fontes de Mensagens e Chat

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Microsoft Teams | Mensagens 1:1, grupos, reacoes, presenca, calls metadata | Microsoft Graph API / Compliance API |
| Slack | Mensagens em canais/DMs, threads, reacoes, edits, deletes | Discovery API / Compliance Exports |
| Google Chat | Mensagens, spaces, reacoes | Google Workspace Events API |
| Zoom Chat | Mensagens in-meeting, mensagens persistentes | Zoom Compliance API |
| WhatsApp Business | Mensagens corporativas (quando gerenciado) | WhatsApp Business API |
| Webex | Mensagens, spaces, mention patterns | Webex Compliance API |

**Sinais extraidos de mensagens:**
- Sentiment score por mensagem e media movel (janela 7/14/30 dias)
- Topicos discutidos (classificacao automatica)
- Mencoes a insatisfacao, demissao, reclamacao, injustica
- Mencoes a ferramentas/tecnicas de exfiltracao
- Linguagem agressiva ou hostil (toxicity score)
- Mudanca abrupta de volume de comunicacao (isolamento)
- Comunicacao fora do horario com entidades externas
- Delecao massiva de mensagens (anti-forense)
- Mudanca de idioma (comunicacao em idioma incomum para ocultar conteudo)

#### 3.9.2 Fontes de Email

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Microsoft Exchange / M365 | Headers, corpo, anexos, destinatarios, BCC | Graph API / EWS / Compliance |
| Google Workspace Gmail | Metadata, labels, delegacao, encaminhamentos | Gmail API / Vault API |
| Proofpoint / Mimecast | Email gateway logs, DLP matches, URLs clicadas | API / Syslog |
| Email Archive (Veritas, Global Relay) | Historico completo para compliance | API / SFTP |

**Sinais extraidos de emails:**
- Volume de emails para dominios externos (baseline vs anomalia)
- Novos destinatarios nunca contatados antes
- Auto-forward rules criadas (exfiltracao passiva)
- BCC para enderecos pessoais
- Anexos com dados sensiveis (classificacao DLP)
- Horario de envio vs baseline do usuario
- Sentiment em emails enviados para gestao (frustacao, raiva)
- Padroes de resposta (demora crescente = desengajamento)
- Tamanho de anexos (picos = possivel exfiltracao)
- Encryption de emails para dominios suspeitos

#### 3.9.3 Gravacoes de Reunioes (Meeting Intelligence)

| Fonte | Dados Coletados | Protocolo/Formato |
|-------|-----------------|-------------------|
| Microsoft Teams Recordings | Transcricoes automaticas, speakers, timestamps | Graph API / Stream |
| Zoom Cloud Recordings | Transcricao, audio, video, chat in-meeting | Zoom API / Webhooks |
| Google Meet | Transcricoes (com Gemini), attendance | Google Workspace API |
| Webex Recordings | Transcricao, highlights, action items | Webex API |
| Gong / Chorus / Fireflies | Transcricao enriquecida, sentiment, keywords | API REST |

**Sinais extraidos de reunioes:**
- Participacao em reunioes (declinio = desengajamento)
- Sentiment durante falas (tom de voz, palavras escolhidas)
- Mencoes a dados sensiveis em contextos inadequados
- Compartilhamento de tela com conteudo restrito
- Gravacoes locais nao-autorizadas (detectadas via EDR)
- Ausencia em reunioes obrigatorias (skip patterns)
- Duracoes anomalas (reunioes muito curtas = desengajamento)
- Topicos discutidos vs role do participante (acesso indevido a informacao)
- Participantes externos nao-aprovados em reunioes internas
- Analise de speaker diarization: quem domina, quem se calou (mudanca de comportamento)

#### 3.9.4 Modelos de NLP/LLM Aplicados

| Modelo | Aplicacao | Output |
|--------|-----------|--------|
| Sentiment Analysis (BERT/RoBERTa) | Classificar tom emocional de cada mensagem | Score -1.0 a +1.0 |
| Topic Classification (Zero-shot) | Categorizar assuntos discutidos | Labels: work, complaint, job_search, tech_tools, exfiltration_related |
| Named Entity Recognition (NER) | Extrair entidades mencionadas (IPs, dominios, nomes, projetos) | Entities + tipos |
| Toxicity Detection | Detectar linguagem hostil/agressiva | Score 0.0 a 1.0 |
| Intent Classification | Classificar intencao de mensagens suspeitas | Labels: curiosity, planning, execution, covering_tracks |
| Summarization (LLM) | Resumir threads longas para investigadores | Resumo contextual |
| Embedding + Similarity | Detectar assuntos anomalos vs historico | Cosine distance do baseline |
| Emotion Detection (GoEmotions) | Granularidade emocional (raiva, medo, desgosto, surpresa) | Multi-label scores |
| Language Style Analysis | Detectar mudanca de estilo (pessoa diferente usando a conta) | Perplexity score |
| Keyword Alerting (Regex + ML) | Detectar termos criticos: "senha", "root", "deletar tudo" | Boolean + contexto |

#### 3.9.5 Perfil Psicologico Continuo

O sistema mantem um **perfil psicologico rolling** para cada usuario baseado nas comunicacoes:

```
psychological_profile = {
    "sentiment_trend_7d": -0.3,        // Tendencia negativa na semana
    "sentiment_trend_30d": -0.1,       // Tendencia geral do mes
    "engagement_score": 0.4,           // Baixo engajamento (0-1)
    "isolation_index": 0.7,            // Alto isolamento (0-1)
    "toxicity_incidents_30d": 3,       // Quantidade de mensagens toxicas
    "frustration_signals": ["denied promotion", "unfair review"],
    "job_search_indicators": 0.8,      // Probabilidade de buscar emprego
    "exfiltration_language": 0.1,      // Mencoes a tecnicas/tools
    "communication_volume_delta": -45%, // Reducao vs baseline
    "off_hours_comms_ratio": 0.35,     // 35% das msgs fora do horario
    "external_comms_anomaly": true,    // Contato incomum com externos
    "emotional_volatility": 0.6,       // Variacao emocional alta
    "response_time_delta": +180%,      // Demora 180% mais para responder
    "meeting_skip_rate_30d": 0.4,      // Falta 40% das reunioes
    "deletion_behavior": "elevated",   // Apagando mensagens acima do normal
    "risk_classification": "high",     // Classificacao geral
    "confidence": 0.82                 // Confianca do modelo
}
```

**Triggers de Alerta (Compostos):**
- sentiment_trend_7d < -0.5 AND isolation_index > 0.6 = **Investigar**
- job_search_indicators > 0.7 AND communication_volume_delta < -30% = **Monitoramento intensivo**
- exfiltration_language > 0.3 AND off_hours_comms_ratio > 0.4 = **Alerta critico**
- toxicity_incidents > 5/30d AND frustration_signals.length > 2 = **Risco de sabotagem**
- deletion_behavior == "elevated" AND external_comms_anomaly == true = **Possivel exfiltracao ativa**

#### 3.9.6 Consideracoes Eticas e Legais

A analise de comunicacoes e a fonte MAIS sensivel do programa UEBA:

- **LGPD Art. 7**: Base legal deve ser interesse legitimo (Art. 7, IX) com RIPD obrigatorio
- **Transparencia**: Funcionarios DEVEM ser informados que comunicacoes corporativas sao monitoradas
- **Proporcionalidade**: Analisar metadata e sentiment, NAO ler conteudo integral por padrao
- **Escalacao gradual**: Leitura de conteudo apenas com aprovacao juridica + motivo documentado
- **Direito trabalhista**: Respeitar expectativa de privacidade em canais pessoais
- **Retencao minima**: Perfis psicologicos com TTL maximo de 90 dias sem incidente
- **Acesso restrito**: Apenas equipe UEBA senior + CISO podem ver perfis individuais
- **Auditoria**: Todo acesso a perfis psicologicos deve ser logado e justificado
- **Opt-out parcial**: Em jurisdicoes que exigem, permitir opt-out de analise de conteudo (nao metadata)
- **Validacao humana**: Perfis NUNCA devem gerar acoes automaticas sem revisao humana

---

## 4. Modelos de Deteccao e Machine Learning

### 4.1 Modelos Estatisticos
- **Z-Score / MAD**: Detectar outliers em metricas continuas (volume, horario)
- **EWM (Exponential Weighted Moving Average)**: Baselines adaptativos
- **Peer Group Analysis**: Comparar usuario com colegas do mesmo cargo/depto
- **Seasonal Decomposition**: Separar sazonalidade de anomalias reais

### 4.2 Machine Learning Supervisionado
- **Random Forest / XGBoost**: Classificacao de risco com features engenheiradas
- **Neural Networks (LSTM)**: Sequencia temporal de acoes do usuario
- **Gradient Boosting**: Scoring de probabilidade de insider threat

### 4.3 Machine Learning Nao-Supervisionado
- **Isolation Forest**: Deteccao de anomalias sem labels historicos
- **Autoencoders**: Aprender representacao "normal" e detectar desvios
- **DBSCAN / HDBSCAN**: Clustering de comportamentos para encontrar outliers
- **Graph Neural Networks**: Detectar anomalias em grafos de relacionamento

### 4.4 Deep Learning e NLP
- **Sentiment Analysis**: Analisar comunicacoes para detectar insatisfacao
- **Topic Modeling**: Identificar pesquisas suspeitas (exfiltracao, hacking)
- **Embedding de Sequencias**: Representar jornadas de usuario como vetores
- **Transformer-based**: Prever proxima acao e alertar quando surpreendente

---

## 5. Risk Scoring Unificado

### 5.1 Formula de Risco Composto

```
Risk_Score = (
    w1 * anomaly_score +          // Desvio comportamental (0-100)
    w2 * data_sensitivity_score + // Sensibilidade dos dados acessados (0-100)
    w3 * privilege_level +        // Nivel de privilegio do usuario (0-100)
    w4 * context_risk +           // Contexto: aviso previo, PIP, etc. (0-100)
    w5 * velocity_score +         // Velocidade de acoes suspeitas (0-100)
    w6 * peer_deviation           // Desvio em relacao ao peer group (0-100)
) * decay_factor                  // Decaimento temporal
```

### 5.2 Niveis de Risco e Acao

| Score | Nivel | Acao |
|-------|-------|------|
| 0-25 | Baixo | Monitoramento passivo |
| 26-50 | Medio | Alerta para equipe UEBA |
| 51-75 | Alto | Investigacao ativa + restricao de acesso |
| 76-90 | Critico | Contencao imediata + notificacao gerencia |
| 91-100 | Emergencia | Bloqueio de conta + forense + juridico |

---

## 6. Cenarios de Uso Prioritarios

### 6.1 Exfiltracao de Dados
**Sinais**: Download massivo + compressao + upload para servico pessoal
**Fontes**: DLP + Proxy + Endpoint + Cloud Storage
**Tempo de deteccao alvo**: < 15 minutos

### 6.2 Privilege Abuse
**Sinais**: Acesso a recursos fora do escopo + horario incomum + sem justificativa
**Fontes**: IAM + PAM + App Logs + ServiceNow
**Tempo de deteccao alvo**: < 30 minutos

### 6.3 Credential Theft / Sharing
**Sinais**: Mesmo usuario logado de multiplos locais + impossible travel + device novo
**Fontes**: IAM + VPN + EDR + Geolocalizacao
**Tempo de deteccao alvo**: < 5 minutos

### 6.4 Pre-Departure Risk
**Sinais**: Aviso previo ativo + aumento de downloads + acesso a repositorios incomuns
**Fontes**: RH + DLP + Git + Cloud Storage + Email
**Tempo de deteccao alvo**: Monitoramento continuo desde o aviso

### 6.5 Account Takeover
**Sinais**: Mudanca de comportamento abrupta + device fingerprint diferente + MFA reset
**Fontes**: IAM + EDR + Biometria comportamental + Risk Engine
**Tempo de deteccao alvo**: < 2 minutos

### 6.6 Sabotagem
**Sinais**: Delecao massiva + wipe de sistemas + modificacao de backups + limpeza de logs
**Fontes**: EDR + SIEM + Backup logs + Database audit
**Tempo de deteccao alvo**: < 1 minuto (pre-empcao ideal)

---

## 7. Integracao com a Plataforma 0xDSI

### 7.1 Componentes Existentes Relevantes
- **User Behavior** (UserBehavior.tsx): Dashboard principal de UEBA
- **Psychological Profiling**: Perfil psicologico baseado em multiplas fontes
- **LLM Risk Profiling**: Analise de uso de LLM e risco associado
- **Cross-Domain Strip**: Correlacao entre dominios (rede, endpoint, identity)
- **Unified Risk Header**: Score unificado de risco por usuario
- **Session Monitor**: Monitoramento de sessoes ativas
- **Insider Credential Selling**: Deteccao de venda de credenciais

### 7.2 Fontes de Dados por Prioridade

**Fase 1 - Fundacao (Obrigatorio)**
1. Active Directory / Entra ID (identity + autenticacao)
2. EDR (endpoint telemetria)
3. Proxy/SWG (navegacao web)
4. VPN/ZTNA (acesso remoto)
5. Email gateway (comunicacao)

**Fase 2 - Enriquecimento**
6. DLP (movimento de dados)
7. Cloud logs (AWS/Azure/GCP)
8. SaaS audit logs (M365, Salesforce)
9. PAM (sessoes privilegiadas)
10. DNS logs

**Fase 3 - Contexto Avancado**
11. Sistema de RH (contexto organizacional)
12. Controle de acesso fisico
13. CCTV analytics
14. Biometria comportamental (keystroke/mouse)
15. Sistemas de negocio (SAP, ERP)

**Fase 4 - Inteligencia**
16. Dark web monitoring (credenciais vazadas)
17. Threat intelligence feeds (APT targeting)
18. Network forensics (full PCAP quando necessario)
19. Sentiment analysis de comunicacoes
20. Financial transaction monitoring

---

## 8. Metricas de Sucesso

| Metrica | Target |
|---------|--------|
| Mean Time to Detect (MTTD) insider threat | < 24 horas |
| False Positive Rate | < 5% |
| Cobertura de usuarios monitorados | 100% |
| Fontes de dados integradas | >= 10 |
| Score de risco atualizado a cada | 5 minutos |
| Retencao de baseline comportamental | 90 dias rolling |
| Tempo para investigacao inicial | < 1 hora apos alerta |
| Casos confirmados vs total de alertas | > 15% (true positive rate) |

---

## 9. Consideracoes Legais e de Privacidade

- Conformidade com LGPD (Lei Geral de Protecao de Dados)
- Necessidade de base legal para monitoramento (interesse legitimo do controlador)
- Transparencia com funcionarios (politica de monitoramento clara)
- Minimizacao de dados (coletar apenas o necessario)
- Retencao limitada (definir periodo maximo)
- Acesso restrito aos dados comportamentais (equipe UEBA apenas)
- Anonimizacao quando possivel (peer group analysis sem identificar individuos)
- Registro de auditoria de quem consultou dados de UEBA
- Avaliacao de Impacto a Protecao de Dados (DPIA/RIPD) obrigatoria

---

## 10. Arquitetura de Ingestao Recomendada

```
[Fontes] --> [Coletores/Agentes] --> [Kafka/EventHub] --> [Normalizacao OCSF]
                                                              |
                                                    [Lakehouse (Bronze)]
                                                              |
                                                    [Enrichment (Silver)]
                                                              |
                                              [Behavioral Models (Gold)]
                                                              |
                                                    [Risk Scoring Engine]
                                                              |
                                              [Alertas + Dashboard UEBA]
```

Cada fonte deve ser normalizada para o schema OCSF (Open Cybersecurity Schema Framework) antes de alimentar os modelos comportamentais, garantindo correlacao entre dominios diferentes.
