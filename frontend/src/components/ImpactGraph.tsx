import { useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { RunState } from "../types";

interface ImpactGraphProps {
  runState: RunState;
  onSelectEntity: (entityId: string) => void;
}

const FIXED_POSITIONS: Record<string, { x: number; y: number }> = {
  "P-101": { x: 40, y: 220 },
  "PRV-04": { x: 400, y: 40 },
  "SOP-7": { x: 400, y: 220 },
  "V-12": { x: 400, y: 400 },
  "INSP-04": { x: 760, y: 220 },
};

const RELATION_LABELS: Record<string, string> = {
  CONNECTS_TO: "Connects to",
  GOVERNED_BY: "Governed by",
  INSPECTED_IN: "Inspected in",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  pump: "Pump",
  valve: "Check Valve",
  relief_valve: "Relief Valve",
  sop: "Procedure",
  inspection_certificate: "Inspection",
};

export function ImpactGraph({ runState, onSelectEntity }: ImpactGraphProps) {
  const targetEntity = runState.eco.target_entity ?? "P-101";

  const { nodes, edges } = useMemo(() => {
    const useFixedPumpLayout = targetEntity === "P-101";

    const hopBuckets = new Map<number, typeof runState.subgraph.nodes>();
    for (const n of runState.subgraph.nodes) {
      const bucket = hopBuckets.get(n.hop) ?? [];
      bucket.push(n);
      hopBuckets.set(n.hop, bucket);
    }

    const rfNodes: Node[] = [];
    for (const [hop, bucket] of Array.from(hopBuckets.entries()).sort((a, b) => a[0] - b[0])) {
      bucket.forEach((ent, idx) => {
        const hasOpenConflict = runState.conflicts.some(
          (c) => c.entity_id === ent.canonical_id && c.status === "OPEN"
        );
        const hasEscalatedFinding = runState.findings.some(
          (f) => f.entity_id === ent.canonical_id && f.audit_status === "ESCALATED"
        );
        const hasVerifiedFinding = runState.findings.some(
          (f) => f.entity_id === ent.canonical_id && f.audit_status === "VERIFIED"
        );

        let cardBorder = "border-slate-300 bg-white text-slate-900";
        let pillStyle = "bg-slate-100 text-slate-700";
        let statusLabel = "Informational";

        if (hasOpenConflict || hasEscalatedFinding) {
          cardBorder = "border-rose-400 bg-rose-50/70 text-rose-950";
          pillStyle = "bg-rose-100 text-rose-800";
          statusLabel = "Conflict / Overload";
        } else if (hasVerifiedFinding) {
          cardBorder = "border-emerald-400 bg-emerald-50/70 text-emerald-950";
          pillStyle = "bg-emerald-100 text-emerald-800";
          statusLabel = "Verified";
        }

        const fallbackPos = {
          x: hop * 360 + 40,
          y: (idx - (bucket.length - 1) / 2) * 180 + 220,
        };
        const position =
          useFixedPumpLayout && FIXED_POSITIONS[ent.canonical_id]
            ? FIXED_POSITIONS[ent.canonical_id]
            : fallbackPos;

        rfNodes.push({
          id: ent.canonical_id,
          position,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: (
              <div className={`w-60 rounded-xl border-2 p-4 text-left shadow-sm ${cardBorder}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-code text-sm font-bold">
                    {ent.canonical_id}
                  </span>
                  <span className="rounded-full bg-slate-900/10 px-2 py-0.5 text-[10px] font-semibold">
                    {ent.hop === 0 ? "Target" : `Step ${ent.hop}`}
                  </span>
                </div>

                <div className="mt-1.5 text-xs font-medium text-slate-700">
                  {ent.name}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-slate-500">
                    {ENTITY_TYPE_LABELS[ent.entity_type] ?? ent.entity_type}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pillStyle}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
            ),
          },
          style: {
            background: "transparent",
            border: "none",
            padding: 0,
            width: 240,
          },
        });
      });
    }

    const rfEdges: Edge[] = runState.subgraph.edges.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      type: "smoothstep",
      label: RELATION_LABELS[e.relation] ?? e.relation,
      animated: runState.conflicts.some(
        (c) => c.entity_id === e.target_id && c.status === "OPEN"
      ),
      style: { stroke: "#64748b", strokeWidth: 2 },
      labelStyle: { fontSize: 11, fontWeight: 600, fill: "#334155" },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.95 },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 6,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#64748b",
      },
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [runState, targetEntity]);

  return (
    <div className="mx-auto max-w-[1600px] p-5">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Downstream Impact Map
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Connected equipment, safety valves, and procedures affected by{" "}
              <span className="font-mono-code font-semibold text-slate-700">
                {targetEntity}
              </span>{" "}
              (click any node to inspect)
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 text-rose-700">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Conflict / Overload
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Verified
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Informational
            </span>
          </div>
        </div>

        <div className="h-[580px] w-full bg-slate-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            onNodeClick={(_evt, node) => onSelectEntity(node.id)}
          >
            <Background color="#cbd5e1" gap={24} />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
