export type DocumentStatus = "RELEASED" | "SUPERSEDED";
export type ClaimStatus = "VERIFIED" | "SUPERSEDED" | "CONFLICTED" | "UNGROUNDED";
export type ConflictType = "VALUE_MISMATCH" | "DOWNSTREAM_OVERLOAD" | "MISSING_EVIDENCE";
export type ConflictStatus = "OPEN" | "RESOLVED";
export type FindingSeverity = "CRITICAL" | "WARNING" | "INFO";
export type AuditStatus = "VERIFIED" | "ESCALATED" | "REJECTED";
export type ExecutionMode = "LIVE_GEMINI" | "LIVE_GROQ" | "DETERMINISTIC_FALLBACK";

export interface HealthResponse {
  status: string;
  configured_gemini_keys: number;
  configured_groq_keys?: number;
  model: string;
  groq_model?: string;
}

export interface ScenarioPreset {
  id: string;
  title: string;
  target_entity: string;
  change_request: string;
  proposed_changes: Record<string, string | number>;
  expected_outcomes: Record<string, unknown>;
}

export interface ScenariosResponse {
  scenarios: ScenarioPreset[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  doc_type: string;
  rev_label: string;
  status: DocumentStatus;
  effective_date: string;
  authority_rank: number;
  content_hash: string;
  raw_text: string;
}

export interface DocumentsResponse {
  documents: DocumentRecord[];
}

export interface SpanRecord {
  id: string;
  doc_id: string;
  char_start: number;
  char_end: number;
  excerpt: string;
  text_hash: string;
}

export interface ClaimRecord {
  id: string;
  run_id: string;
  entity_id: string;
  parameter: string;
  raw_value: string;
  raw_unit: string | null;
  norm_value: string | null;
  norm_unit: string | null;
  rev_label: string;
  rev_status: DocumentStatus;
  span_id: string | null;
  confidence: number;
  status: ClaimStatus;
}

export interface ConflictRecord {
  id: string;
  run_id: string;
  entity_id: string;
  parameter: string;
  claim_a_id: string;
  claim_b_id: string;
  conflict_type: ConflictType;
  status: ConflictStatus;
  resolution_choice: string | null;
  reviewer_rationale: string | null;
}

export interface FindingRecord {
  id: string;
  run_id: string;
  severity: FindingSeverity;
  title: string;
  summary: string;
  entity_id: string;
  span_id: string | null;
  claim_id: string | null;
  audit_status: AuditStatus;
  rule_id: string;
  is_resolved?: boolean;
  resolution_choice?: string | null;
}

export interface AuditEvent {
  id: string;
  run_id: string;
  step_order: number;
  agent_name: string;
  action: string;
  rule_id: string;
  detail: Record<string, unknown>;
  timestamp: string;
}

export interface SubgraphNode {
  canonical_id: string;
  name: string;
  entity_type: string;
  aliases: string[];
  hop: number;
}

export interface SubgraphEdge {
  id: string;
  source_id: string;
  relation: string;
  target_id: string;
  source_hop: number;
  target_hop: number;
}

export interface SubgraphData {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
}

export interface EcoPayload {
  id?: string;
  title?: string;
  target_entity?: string;
  change_request?: string;
  proposed_changes?: Record<string, string | number>;
}

export interface RunState {
  run_id: string;
  scenario_id: string | null;
  eco: EcoPayload;
  execution_mode: ExecutionMode;
  active_key_slot: string | null;
  fallback_notice: string | null;
  can_sign_off: boolean;
  signed_off: boolean;
  sign_off_note: string | null;
  created_at: string;
  findings: FindingRecord[];
  conflicts: ConflictRecord[];
  claims: ClaimRecord[];
  spans: SpanRecord[];
  documents: DocumentRecord[];
  subgraph: SubgraphData;
  audit_events: AuditEvent[];
}

export interface AblationMetrics {
  evidence_traceability: number;
  revision_resolution: number;
  conflict_detection: number;
  impact_correctness: number;
  escalation_precision: number;
  audit_faithfulness: number;
  overall_score: number;
}

export interface AblationSystem {
  name: string;
  metrics: AblationMetrics;
  notes: string;
}

export interface AblationResponse {
  scenario_count: number;
  systems: AblationSystem[];
}

export interface CustomEcoInput {
  target_entity_id: string;
  title: string;
  proposed_model?: string;
  proposed_pressure_bar?: number | null;
  proposed_spec_text: string;
  change_request?: string;
}

export type WorkbenchTab = "review" | "graph" | "ablation";
