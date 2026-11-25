import { useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { RunState } from "../types";

interface ImpactGraphProps {
  runState: RunState;
  onSelectEntity: (entityId: string) => void;
}

export function ImpactGraph({ runState, onSelectEntity }: ImpactGraphProps) {
  const { nodes, edges } = useMemo(() => {
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

        let paletteClass = "border-slate-300 bg-white text-slate-900";
        let statusLabel = "INFO";
        if (hasOpenConflict || hasEscalatedFinding) {
          paletteClass = "border-rose-400 bg-rose-50 text-rose-950";
          statusLabel = "CONFLICT / OVERLOAD";
        } else if (hasVerifiedFinding) {
          paletteClass = "border-emerald-400 bg-emerald-50 text-emerald-950";
          statusLabel = "VERIFIED";
        }

        const yOffset = (idx - (bucket.length - 1) / 2) * 140 + 220;
        rfNodes.push({
          id: ent.canonical_id,
          position: { x: hop * 290 + 40, y: yOffset },
          data: {
            label: (
              <div className={`min-w-[190px] rounded-md border-2 px-3 py-2 text-left shadow-xs ${paletteClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-code text-xs font-bold">
                    {ent.canonical_id}
                  </span>
                  <span className="rounded bg-slate-900/10 px-1.5 py-0.5 font-mono-code text-[10px] font-semibold">
                    Hop {ent.hop}
                  </span>
                </div>
                <div className="mt-1 text-xs font-medium">{ent.name}</div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold opacity-80">
                  <span>{ent.entity_type}</span>
                  <span>{statusLabel}</span>
                </div>
              </div>
            ),
          },
          style: {
            background: "transparent",
            border: "none",
            padding: 0,
          },
        });
      });
    }

    const rfEdges: Edge[] = runState.subgraph.edges.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      label: e.relation,
      animated: runState.conflicts.some(
        (c) => c.entity_id === e.target_id && c.status === "OPEN"
      ),
      style: { stroke: "#475569", strokeWidth: 1.8 },
      labelStyle: { fontSize: 10, fontWeight: 700, fill: "#334155" },
      labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.9 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#475569",
      },
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [runState]);

  return (
    <div className="mx-auto max-w-[1600px] p-4">
      <div className="rounded-lg border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Deterministic Downstream Blast-Radius Graph
            </h2>
            <p className="text-xs text-slate-500">
              BFS traversal from target entity{" "}
              <span className="font-mono-code font-semibold text-slate-700">
                {runState.eco.target_entity ?? "P-101"}
              </span>{" "}
              (click any node to inspect its findings in the 3-pane workspace)
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-semibold">
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

        <div className="h-[560px] w-full bg-slate-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_evt, node) => onSelectEntity(node.id)}
          >
            <Background color="#cbd5e1" gap={20} />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
