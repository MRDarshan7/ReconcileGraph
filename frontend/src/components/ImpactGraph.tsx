import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
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
  "P-101": { x: 40, y: 210 },
  "PRV-04": { x: 410, y: 30 },
  "SOP-7": { x: 410, y: 210 },
  "V-12": { x: 410, y: 390 },
  "INSP-04": { x: 780, y: 210 },
};

const ENTITY_TYPE_SHORT: Record<string, string> = {
  pump: "PUMP",
  valve: "VALVE",
  relief_valve: "PRV",
  sop: "SOP",
  inspection_certificate: "INSP",
};

export function ImpactGraph({ runState, onSelectEntity }: ImpactGraphProps) {
  const targetEntity = runState.eco.target_entity ?? "P-101";

  const { nodes, edges, stats } = useMemo(() => {
    const useFixedPumpLayout = targetEntity === "P-101";

    const hopBuckets = new Map<number, typeof runState.subgraph.nodes>();
    let maxHop = 0;
    for (const n of runState.subgraph.nodes) {
      if (n.hop > maxHop) maxHop = n.hop;
      const bucket = hopBuckets.get(n.hop) ?? [];
      bucket.push(n);
      hopBuckets.set(n.hop, bucket);
    }

    let openConflictNodes = 0;
    let resolvedNodes = 0;
    let verifiedNodes = 0;

    const entityStatusMap = new Map<
      string,
      "overload" | "conflict" | "resolved" | "verified" | "info"
    >();

    for (const ent of runState.subgraph.nodes) {
      const entityConflicts = runState.conflicts.filter(
        (c) => c.entity_id === ent.canonical_id
      );
      const openOverload = entityConflicts.some(
        (c) => c.status === "OPEN" && c.conflict_type === "DOWNSTREAM_OVERLOAD"
      );
      const openConflict =
        entityConflicts.some((c) => c.status === "OPEN") ||
        runState.findings.some(
          (f) =>
            f.entity_id === ent.canonical_id &&
            f.audit_status === "ESCALATED" &&
            !f.is_resolved
        );
      const hasResolved =
        !openConflict &&
        runState.findings.some(
          (f) => f.entity_id === ent.canonical_id && Boolean(f.is_resolved)
        );
      const hasVerified =
        !openConflict &&
        !hasResolved &&
        runState.findings.some(
          (f) => f.entity_id === ent.canonical_id && f.audit_status === "VERIFIED"
        );

      if (openOverload) {
        entityStatusMap.set(ent.canonical_id, "overload");
        openConflictNodes += 1;
      } else if (openConflict) {
        entityStatusMap.set(ent.canonical_id, "conflict");
        openConflictNodes += 1;
      } else if (hasResolved) {
        entityStatusMap.set(ent.canonical_id, "resolved");
        resolvedNodes += 1;
      } else if (hasVerified || ent.hop === 0) {
        entityStatusMap.set(ent.canonical_id, "verified");
        verifiedNodes += 1;
      } else {
        entityStatusMap.set(ent.canonical_id, "info");
      }
    }

    const rfNodes: Node[] = [];
    for (const [hop, bucket] of Array.from(hopBuckets.entries()).sort((a, b) => a[0] - b[0])) {
      bucket.forEach((ent, idx) => {
        const state = entityStatusMap.get(ent.canonical_id) ?? "info";

        let railClass = "border-l-sky-500";
        let pillClass = "border-sky-200 bg-sky-50 text-sky-800";
        let dotClass = "bg-sky-500";
        let statusLabel = ent.hop === 0 ? "SOURCE ASSET" : "VERIFIED";

        if (state === "overload") {
          railClass = "border-l-rose-500";
          pillClass = "border-rose-200 bg-rose-50 text-rose-800";
          dotClass = "bg-rose-500";
          statusLabel = "OVERLOAD";
        } else if (state === "conflict") {
          railClass = "border-l-amber-500";
          pillClass = "border-amber-200 bg-amber-50 text-amber-900";
          dotClass = "bg-amber-500";
          statusLabel = "OPEN CONFLICT";
        } else if (state === "resolved") {
          railClass = "border-l-emerald-500";
          pillClass = "border-emerald-200 bg-emerald-50 text-emerald-800";
          dotClass = "bg-emerald-500";
          statusLabel = "RESOLVED";
        } else if (state === "info") {
          railClass = "border-l-slate-400";
          pillClass = "border-slate-200 bg-slate-100 text-slate-700";
          dotClass = "bg-slate-400";
          statusLabel = "VERIFIED";
        }

        const fallbackPos = {
          x: hop * 360 + 40,
          y: (idx - (bucket.length - 1) / 2) * 185 + 210,
        };
        const position =
          useFixedPumpLayout && FIXED_POSITIONS[ent.canonical_id]
            ? FIXED_POSITIONS[ent.canonical_id]
            : fallbackPos;

        const typeTag =
          ENTITY_TYPE_SHORT[ent.entity_type] ?? ent.entity_type.toUpperCase();

        rfNodes.push({
          id: ent.canonical_id,
          position,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: (
              <div
                className={`group w-[264px] rounded-xl border border-slate-200 border-l-[3.5px] bg-white p-3.5 text-left shadow-xs transition hover:border-slate-400 hover:shadow-md ${railClass}`}
              >
                {/* Top Mono Strip */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-code text-[10px] font-bold tracking-wider text-slate-500">
                    {ent.hop === 0 ? "HOP 0 // TARGET" : `HOP ${ent.hop}`}
                  </span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.2 font-mono-code text-[9px] font-bold text-slate-600">
                    {typeTag}
                  </span>
                </div>

                {/* Asset ID & Name */}
                <div className="mt-2 font-mono-code text-sm font-bold tracking-tight text-slate-950">
                  {ent.canonical_id}
                </div>
                <div className="mt-0.5 truncate text-xs font-medium text-slate-600">
                  {ent.name}
                </div>

                {/* Status Micro-Pill & Inspect Affordance */}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono-code text-[9px] font-bold ${pillClass}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                    {statusLabel}
                  </span>
                  <span className="font-mono-code text-[10px] font-semibold text-slate-400 transition group-hover:text-slate-900">
                    Inspect Finding →
                  </span>
                </div>
              </div>
            ),
          },
          style: {
            background: "transparent",
            border: "none",
            padding: 0,
            width: 264,
          },
        });
      });
    }

    const rfEdges: Edge[] = runState.subgraph.edges.map((e) => {
      const targetState = entityStatusMap.get(e.target_id) ?? "info";
      const isHot = targetState === "overload" || targetState === "conflict";
      const isResolved = targetState === "resolved";

      const strokeColor =
        targetState === "overload"
          ? "#EF4444"
          : targetState === "conflict"
            ? "#F59E0B"
            : isResolved
              ? "#10B981"
              : "#94A3B8";

      return {
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "smoothstep",
        label: e.relation,
        animated: isHot,
        style: {
          stroke: strokeColor,
          strokeWidth: isHot ? 2 : 1.5,
        },
        labelStyle: {
          fontSize: 10,
          fontWeight: 700,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fill: "#334155",
          letterSpacing: "0.03em",
        },
        labelBgStyle: {
          fill: "#FFFFFF",
          fillOpacity: 0.96,
          stroke: "#CBD5E1",
          strokeWidth: 1,
        },
        labelBgPadding: [7, 4],
        labelBgBorderRadius: 6,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
      };
    });

    return {
      nodes: rfNodes,
      edges: rfEdges,
      stats: {
        totalNodes: runState.subgraph.nodes.length,
        totalEdges: runState.subgraph.edges.length,
        maxHop,
        openConflictNodes,
        resolvedNodes,
        verifiedNodes,
      },
    };
  }, [runState, targetEntity]);

  return (
    <div className="mx-auto max-w-[1600px] p-4">
      <div className="relative h-[calc(100vh-148px)] min-h-[560px] w-full overflow-hidden rounded-xl border border-slate-200 bg-[#F8FAFC] shadow-2xs">
        {/* Top-Left Floating Blast-Radius HUD */}
        <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-md">
          <div className="pointer-events-auto rounded-xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-code text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                BLAST-RADIUS TOPOLOGY
              </span>
              <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.2 font-mono-code text-[10px] font-bold text-slate-800">
                TARGET {targetEntity}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono-code text-[11px] font-semibold">
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                {stats.totalNodes} NODES • {stats.maxHop} HOPS
              </span>
              <span
                className={`rounded border px-2 py-0.5 ${
                  stats.openConflictNodes > 0
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {stats.openConflictNodes} OPEN
              </span>
              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                {stats.resolvedNodes} RESOLVED
              </span>
              <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800">
                {stats.verifiedNodes} VERIFIED
              </span>
            </div>

            <p className="mt-1.5 text-[11px] text-slate-500">
              Click any node to jump directly to its anchored finding in Evidence Review.
            </p>
          </div>
        </div>

        {/* Bottom-Left Floating Status Legend */}
        <div className="pointer-events-none absolute bottom-4 left-4 z-10">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3.5 rounded-lg border border-slate-200/90 bg-white/95 px-3.5 py-2 text-[11px] font-semibold text-slate-700 shadow-xs backdrop-blur-sm">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Source / Verified
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Overload
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Open Conflict
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Resolved
            </span>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.28 }}
          onNodeClick={(_evt, node) => onSelectEntity(node.id)}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="#CBD5E1"
            gap={22}
            size={1.2}
          />
          <Controls
            position="bottom-right"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
