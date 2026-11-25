# ReconcileGraph — 3-Minute Live Demo Script & K! Hacks 4.0 Round 1 Summary

## Submission Summary (K! Hacks 4.0 — Round 1)

- **Project:** ReconcileGraph — Span-Anchored Multi-Agent Verification Workbench for Industrial Engineering Change Orders (ECOs)
- **Core Innovation:** *Reconcile-before-reasoning* architecture combining structured Gemini extraction (with 3-key automatic failover + deterministic fallback) and deterministic engineering guardrails (`AliasResolver`, Pint `UnitNormalizer`, `RevisionComparator`, SHA-256 `SpanVerifier`, multi-hop BFS blast radius, bounded re-extraction retries, and a fail-closed `AuditorAgent`).
- **Stack:** FastAPI, SQLite provenance store, Pydantic v2, Pint, Google GenAI SDK, React 19, TypeScript, Tailwind CSS v4, `@xyflow/react`.

---

## 3-Minute Live Demo Walkthrough (`ECO-01: Pump P-101 High-Capacity Upgrade`)

### Minute 0:00 – 0:45 | Problem Framing & Initial Workbench State
1. Open the workbench (`http://localhost:5173`). `ECO-01` (**Replace Pump P-101 with Centriflo-550 at 14.0 bar, 145 m³/h**) automatically runs and populates the **3-Pane Review Workspace**.
2. Point out the **Execution Mode** badge in the top bar (`LIVE GEMINI • Key #N` or explicit amber `DETERMINISTIC FALLBACK` notice) and the **locked** `Approve & Sign-Off ECO` button showing `6 Open Conflicts`.
3. Show the excluded **Superseded Revision (`Rev A`, 8.5 bar)** finding in the Left Pane and click it to show `doc2_pump_spec_revA.md` (`SUPERSEDED` badge) in the Center Pane.

### Minute 0:45 – 1:45 | Cross-Document Conflict, Bounded Retry & Fail-Closed Audit
1. Click **`Active Baseline Conflict: P-101 Discharge Pressure`** in the Left Pane:
   - Center Pane automatically switches to `doc4_maint_log.md` and scrolls to the exact highlighted `[char_start : char_end]` span (`175 psi`) with its SHA-256 `text_hash`.
   - Right Pane (**Claim & Guardrail Inspector**) displays alias resolution (`"P101 rev. 2"` → `P-101` via `RULE_ALIAS_NORM`), Pint unit conversion (`175 psi` → `12.07 bar` via `RULE_UNIT_PINT`), and side-by-side competing claims (`10.0 bar` in Spec Rev B vs. `12.07 bar` in Maint Log).
2. Point out **`Missing Evidence Slot: vibration_baseline`** (triggered after 2 bounded re-extraction attempts `RULE_BOUNDED_RETRY_1` and `RULE_BOUNDED_RETRY_2`).
3. Point out the strikethrough **`UNGROUNDED • BLOCKED BY AUDITOR`** finding (`RULE_AUDIT_REJECT_UNGROUNDED`), proving that any candidate finding lacking a valid SHA-256 span is rejected before reaching sign-off.

### Minute 1:45 – 2:30 | Blast-Radius Graph & Human Conflict Resolution
1. Switch to the **Blast-Radius Graph** tab: show the deterministic BFS propagation from `P-101` (Hop 0) to `V-12` (12.0 bar MAWP), `PRV-04` (11.5 bar set pressure), `SOP-7` (11.0 bar shutdown interlock), and `INSP-04` (12.0 bar hydrostatic certificate requiring re-certification).
2. Click `V-12` in the graph to jump back to its finding in the 3-Pane Workspace.
3. Resolve each `OPEN` conflict inline using the quick resolution presets + engineering rationale (`Confirm Resolution`). Switch briefly to **Audit Trace & Ablation** to show `"decision re-checks impact"` and the **1.00 vs 0.53 vs 0.29** ablation table.

### Minute 2:30 – 3:00 | Sign-Off Gate Unlock
1. Return to the header bar: once all open conflicts are resolved (`0 Open Conflicts`), `Approve & Sign-Off ECO` unlocks.
2. Enter reviewer name and rationale in the modal → confirm sign-off → button turns into green **`ECO APPROVED`**.

---

## Judge Q&A Prep

**Q1: Why use a 4-agent pipeline + deterministic tools instead of a single long-context LLM prompt?**
> LLMs are strong at reading unstructured maintenance notes and synthesizing impact explanations, but unreliable at arithmetic unit conversions, silent revision filtering, and citation accuracy. ReconcileGraph delegates extraction and synthesis to Gemini while enforcing deterministic code guardrails (`pint`, regex/alias normalization, revision precedence, and graph BFS) so math and topology never hallucinate.

**Q2: How are hallucinated citations mathematically blocked?**
> Every extracted `excerpt` is passed through `SpanVerifier.create_verified_span()`, which locates the exact `[char_start : char_end]` slice inside the stored `raw_text` and computes its SHA-256 `text_hash`. Before any finding is finalized, `AuditorAgent` calls `SpanVerifier.verify_span_by_id()` to re-check the slice and hash; any finding with a missing or mismatched span is immediately marked `REJECTED` (`UNGROUNDED • BLOCKED BY AUDITOR`).

**Q3: How does ReconcileGraph behave in air-gapped or rate-limited industrial environments?**
> `llm_client.py` automatically fails over across 3 configured Gemini API keys (`Key #1` → `Key #2` → `Key #3`). If all keys fail or none are configured in an air-gapped facility, the pipeline catches `AIAgentsInaccessibleError`, raises an explicit amber fallback notice (`DETERMINISTIC_FALLBACK`), logs `RULE_LLM_FALLBACK`, and completes full verification locally using the deterministic extraction and guardrail suite with zero external network dependency.
