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

        let railClass = "border-l-[#0A0A0A]";
        let badgeClass = "border-[#E5E5E5] bg-[#F7F7F8] text-[#0A0A0A]";
        let dotClass = "bg-[#0A0A0A]";
        let statusLabel = ent.hop === 0 ? "Target asset" : "Verified";

        if (state === "overload") {
          railClass = "border-l-[#DC2626]";
          badgeClass = "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]";
          dotClass = "bg-[#DC2626]";
          statusLabel = "Overload";
        } else if (state === "conflict") {
          railClass = "border-l-[#D97706]";
          badgeClass = "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]";
          dotClass = "bg-[#D97706]";
          statusLabel = "Open conflict";
        } else if (state === "resolved") {
          railClass = "border-l-[#059669]";
          badgeClass = "border-[#059669]/30 bg-[#059669]/10 text-[#059669]";
          dotClass = "bg-[#059669]";
          statusLabel = "Resolved";
        } else if (state === "info") {
          railClass = "border-l-[#999999]";
          badgeClass = "border-[#E5E5E5] bg-[#F7F7F8] text-[#666666]";
          dotClass = "bg-[#666666]";
          statusLabel = "Verified";
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
                className={`group w-[264px] rounded-[2px] border border-[#E5E5E5] border-l-2 bg-white p-3.5 text-left transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#0A0A0A] ${railClass}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-code text-[10px] font-medium text-[#666666]">
                    {ent.hop === 0 ? "Hop 0 · Target" : `Hop ${ent.hop}`}
                  </span>
                  <span className="rounded-[2px] border border-[#E5E5E5] bg-[#F7F7F8] px-1.5 py-0.2 font-mono-code text-[9px] font-medium text-[#666666]">
                    {typeTag}
                  </span>
                </div>

                <div className="mt-2 font-mono-code text-sm font-semibold tracking-tight text-[#0A0A0A]">
                  {ent.canonical_id}
                </div>
                <div className="mt-0.5 truncate text-xs text-[#666666]">
                  {ent.name}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#E5E5E5] pt-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-mono-code text-[10px] font-medium ${badgeClass}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-[1px] ${dotClass}`} />
                    {statusLabel}
                  </span>
                  <span className="font-mono-code text-[10px] font-medium text-[#666666] transition-[color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[#0A0A0A]">
                    Inspect →
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
          ? "#DC2626"
          : targetState === "conflict"
            ? "#D97706"
            : isResolved
              ? "#059669"
              : "#999999";

      return {
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "smoothstep",
        label: e.relation,
        animated: isHot,
        style: {
          stroke: strokeColor,
          strokeWidth: isHot ? 1.8 : 1.3,
        },
        labelStyle: {
          fontSize: 10,
          fontWeight: 500,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fill: "#0A0A0A",
          letterSpacing: "0.02em",
        },
        labelBgStyle: {
          fill: "#FFFFFF",
          fillOpacity: 0.96,
          stroke: "#E5E5E5",
          strokeWidth: 1,
        },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 2,
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
    <div className="rg-workbench-flow relative h-[calc(100vh-52px)] min-h-[560px] w-full bg-white">
      {/* Top-Left Floating Telemetry HUD */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-md">
        <div className="pointer-events-auto rounded-[2px] border border-[#E5E5E5] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[#0A0A0A]">
              Blast-radius topology
            </span>
            <span className="rounded-[2px] border border-[#E5E5E5] bg-[#F7F7F8] px-1.5 py-0.5 font-mono-code text-[10px] font-medium text-[#0A0A0A]">
              Target {targetEntity}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono-code text-[10px]">
            <span className="rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFB] px-2 py-0.5 text-[#666666]">
              {stats.totalNodes} nodes · {stats.maxHop} hops
            </span>
            <span
              className={`rounded-[2px] border px-2 py-0.5 ${
                stats.openConflictNodes > 0
                  ? "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]"
                  : "border-[#E5E5E5] bg-[#FAFAFB] text-[#666666]"
              }`}
            >
              {stats.openConflictNodes} open
            </span>
            <span className="rounded-[2px] border border-[#059669]/30 bg-[#059669]/10 px-2 py-0.5 text-[#059669]">
              {stats.resolvedNodes} resolved
            </span>
            <span className="rounded-[2px] border border-[#E5E5E5] bg-[#F7F7F8] px-2 py-0.5 text-[#0A0A0A]">
              {stats.verifiedNodes} verified
            </span>
          </div>

          <p className="mt-2 text-[11px] text-[#666666]">
            Click any asset node to jump directly to its finding in Evidence Review.
          </p>
        </div>
      </div>

      {/* Bottom-Left Floating Status Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10">
        <div className="pointer-events-auto flex flex-wrap items-center gap-4 rounded-[2px] border border-[#E5E5E5] bg-white px-3.5 py-2 text-[11px] font-medium text-[#0A0A0A]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[1px] bg-[#0A0A0A]" />
            Verified
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[1px] bg-[#DC2626]" />
            Overload
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[1px] bg-[#D97706]" />
            Open conflict
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[1px] bg-[#059669]" />
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
          color="#D4D4D8"
          gap={22}
          size={1}
        />
        <Controls
          position="bottom-right"
          className="rounded-[2px] border border-[#E5E5E5] bg-white"
        />
      </ReactFlow>
    </div>
  );
}
