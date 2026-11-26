import type { ReactNode, RefObject } from "react";
import type { DocumentStatus, SpanRecord } from "../types";

interface FormattedRecordViewerProps {
  rawText: string;
  activeSpan: SpanRecord | null;
  highlightRef: RefObject<HTMLElement | null>;
  docId?: string;
  docTitle?: string;
  revLabel?: string;
  docStatus?: DocumentStatus;
  compactHeader?: boolean;
}

interface TextLine {
  text: string;
  start: number;
  end: number;
}

interface TableCellSpan {
  text: string;
  start: number;
  end: number;
}

type DocBlock =
  | { kind: "heading"; level: 1 | 2; line: TextLine; content: string }
  | { kind: "table"; header: TextLine | null; rows: TextLine[] }
  | { kind: "ul"; items: Array<{ line: TextLine; content: string }> }
  | { kind: "ol"; items: Array<{ line: TextLine; content: string }> }
  | { kind: "paragraph"; line: TextLine };

const SEPARATOR_ROW_RE = /^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function splitLinesWithOffsets(rawText: string): TextLine[] {
  const lines: TextLine[] = [];
  let cursor = 0;

  while (cursor <= rawText.length) {
    const nlIdx = rawText.indexOf("\n", cursor);
    if (nlIdx === -1) {
      lines.push({ text: rawText.slice(cursor), start: cursor, end: rawText.length });
      break;
    }
    const lineEnd = nlIdx > cursor && rawText[nlIdx - 1] === "\r" ? nlIdx - 1 : nlIdx;
    lines.push({ text: rawText.slice(cursor, lineEnd), start: cursor, end: lineEnd });
    cursor = nlIdx + 1;
    if (cursor === rawText.length) {
      break;
    }
  }

  return lines;
}

function overlapsSpan(start: number, end: number, span: SpanRecord | null): boolean {
  if (!span) return false;
  return start < span.char_end && end > span.char_start;
}

function parseTableCells(line: TextLine): TableCellSpan[] {
  const raw = line.text;
  const cells: TableCellSpan[] = [];
  const pipeIndices: number[] = [];

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "|") pipeIndices.push(i);
  }

  if (pipeIndices.length < 2) {
    return [{ text: raw.trim(), start: line.start, end: line.end }];
  }

  for (let idx = 0; idx < pipeIndices.length - 1; idx++) {
    const segStart = pipeIndices[idx] + 1;
    const segEnd = pipeIndices[idx + 1];
    const segment = raw.slice(segStart, segEnd);
    const trimmed = segment.trim();
    const leadingSpaces = segment.length - segment.trimStart().length;
    const cellStart = line.start + segStart + leadingSpaces;
    const cellEnd = cellStart + trimmed.length;
    cells.push({ text: trimmed, start: cellStart, end: cellEnd });
  }

  return cells;
}

function isNumericCell(text: string): boolean {
  const clean = text.replaceAll("*", "").replaceAll("`", "").trim();
  return /^\d+(\.\d+)?(\s*(bar|psi|kpa|mpa|m3\/h|°c|°f))?$/i.test(clean);
}

function renderPlainTextSegment(segment: string, keyPrefix: string): ReactNode {
  const colonMatch = segment.match(/^([A-Z][A-Za-z0-9\s/()-]{1,32}:)\s+(.+)$/);
  if (colonMatch) {
    return (
      <span key={keyPrefix}>
        <span className="text-[#737373]">{colonMatch[1]}</span>{" "}
        <span className="text-[#0A0A0A]">{colonMatch[2]}</span>
      </span>
    );
  }
  return <span key={keyPrefix}>{segment}</span>;
}

function renderInlineFormatted(text: string): ReactNode {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (!token) return null;
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      const inner = token.slice(2, -2);
      const isFieldLabel = inner.trim().endsWith(":");
      return (
        <strong
          key={idx}
          className={
            isFieldLabel
              ? "font-medium text-[#737373]"
              : "font-semibold text-[#0A0A0A]"
          }
        >
          {inner}
        </strong>
      );
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <span
          key={idx}
          className="mx-0.5 inline-block rounded-[2px] border border-[#E5E5E5] bg-[#F7F7F8] px-1.5 py-0.2 font-mono-code text-[11px] font-medium text-[#0A0A0A]"
        >
          {token.slice(1, -1)}
        </span>
      );
    }
    return renderPlainTextSegment(
      token.replaceAll("**", "").replaceAll("`", ""),
      String(idx)
    );
  });
}

function AnchoredSpanBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-[2px] border border-[#D97706] bg-[#FDE68A] px-1.5 py-0.2 align-middle font-mono-code text-[9px] font-semibold tracking-wider text-[#78350F] uppercase select-none">
      Anchored span
    </span>
  );
}

function parseBlocks(lines: TextLine[]): DocBlock[] {
  const blocks: DocBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.text.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length === 1 ? 1 : 2,
        line,
        content: headingMatch[2].trim(),
      });
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.includes("|", 1)) {
      const tableLines: TextLine[] = [];
      while (i < lines.length && lines[i].text.trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const nonSepLines = tableLines.filter(
        (tl) => !SEPARATOR_ROW_RE.test(tl.text.trim())
      );
      if (nonSepLines.length > 0) {
        blocks.push({
          kind: "table",
          header: nonSepLines[0],
          rows: nonSepLines.slice(1),
        });
      }
      continue;
    }

    if (/^\s*[-*]\s+/.test(line.text)) {
      const items: Array<{ line: TextLine; content: string }> = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i].text)) {
        const content = lines[i].text.replace(/^\s*[-*]\s+/, "");
        items.push({ line: lines[i], content });
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line.text)) {
      const items: Array<{ line: TextLine; content: string }> = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i].text)) {
        const content = lines[i].text.replace(/^\s*\d+\.\s+/, "");
        items.push({ line: lines[i], content });
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    blocks.push({ kind: "paragraph", line });
    i += 1;
  }

  return blocks;
}

const HIGHLIGHT_CLASS =
  "bg-[#FEF3C7] border-b-2 border-[#D97706] rounded-[2px] px-2 py-0.5 text-[#0A0A0A] font-medium";

export function FormattedRecordViewer({
  rawText,
  activeSpan,
  highlightRef,
  docId,
  docTitle,
  revLabel,
  docStatus,
  compactHeader = false,
}: FormattedRecordViewerProps) {
  const lines = splitLinesWithOffsets(rawText);
  const blocks = parseBlocks(lines);
  let refAssigned = false;

  const claimHighlightRef = () => {
    if (refAssigned) return undefined;
    refAssigned = true;
    return highlightRef as RefObject<never>;
  };

  return (
    <div className="space-y-3.5 text-[13.5px] leading-relaxed text-[#333333]">
      {/* Header Row: Full Strip for Plant Records, Clean Compact Header for Drawer */}
      {(docId || docTitle) &&
        (compactHeader ? (
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#E5E5E5] pb-2.5">
            <span className="text-xs font-medium text-[#0A0A0A]">
              {docTitle ?? docId}
            </span>
            {docStatus && (
              <span
                className={`rounded-[2px] border px-1.5 py-0.5 font-mono-code text-[10px] font-medium ${
                  docStatus === "SUPERSEDED"
                    ? "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]"
                    : "border-[#059669]/35 bg-[#059669]/10 text-[#059669]"
                }`}
              >
                {docStatus}
              </span>
            )}
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-[#E5E5E5] bg-[#FAFAFB] px-3.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {docId && (
                <span className="rounded-[2px] border border-[#E5E5E5] bg-white px-2 py-0.5 font-mono-code text-[10px] font-medium text-[#0A0A0A]">
                  {docId}
                </span>
              )}
              {docTitle && (
                <span className="text-xs font-medium text-[#0A0A0A]">{docTitle}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 font-mono-code text-[10px] font-medium">
              {revLabel && (
                <span className="rounded-[2px] border border-[#E5E5E5] bg-white px-1.5 py-0.5 text-[#0A0A0A]">
                  {revLabel}
                </span>
              )}
              {docStatus && (
                <span
                  className={`rounded-[2px] border px-1.5 py-0.5 ${
                    docStatus === "SUPERSEDED"
                      ? "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]"
                      : "border-[#059669]/35 bg-[#059669]/10 text-[#059669]"
                  }`}
                >
                  {docStatus}
                </span>
              )}
            </div>
          </div>
        ))}

      {blocks.map((block, blockIdx) => {
        if (block.kind === "heading") {
          const isMatched = overlapsSpan(block.line.start, block.line.end, activeSpan);
          if (block.level === 1) {
            return (
              <h1
                key={blockIdx}
                ref={isMatched ? claimHighlightRef() : undefined}
                className={`border-b border-[#E5E5E5] pb-2 text-lg font-medium tracking-[-0.02em] text-[#0A0A0A] ${
                  isMatched ? HIGHLIGHT_CLASS : ""
                }`}
              >
                {renderInlineFormatted(block.content)}
                {isMatched && <AnchoredSpanBadge />}
              </h1>
            );
          }
          return (
            <h2
              key={blockIdx}
              ref={isMatched ? claimHighlightRef() : undefined}
              className={`mt-5 mb-2 border-b border-[#F0F0F0] pb-1 text-sm font-medium tracking-[-0.01em] text-[#0A0A0A] ${
                isMatched ? HIGHLIGHT_CLASS : ""
              }`}
            >
              {renderInlineFormatted(block.content)}
              {isMatched && <AnchoredSpanBadge />}
            </h2>
          );
        }

        if (block.kind === "table") {
          const headerCells = block.header ? parseTableCells(block.header) : [];
          return (
            <div
              key={blockIdx}
              className="my-3.5 overflow-x-auto rounded-[2px] border border-[#E5E5E5]"
            >
              <table className="w-full border-collapse text-left text-xs">
                {headerCells.length > 0 && (
                  <thead>
                    <tr className="border-b border-[#E5E5E5] bg-[#F7F7F8]">
                      {headerCells.map((cell, cIdx) => (
                        <th
                          key={cIdx}
                          className="px-3 py-2 font-mono-code text-[10px] font-semibold tracking-wider text-[#666666] uppercase"
                        >
                          {renderInlineFormatted(cell.text)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-[#E5E5E5] bg-white">
                  {block.rows.map((rowLine, rIdx) => {
                    const rowCells = parseTableCells(rowLine);
                    const rowOverlaps = overlapsSpan(
                      rowLine.start,
                      rowLine.end,
                      activeSpan
                    );
                    const overlappingCells = rowCells.filter((cell) =>
                      overlapsSpan(cell.start, cell.end, activeSpan)
                    );
                    const highlightSingleCell =
                      rowOverlaps && overlappingCells.length === 1;

                    return (
                      <tr
                        key={rIdx}
                        ref={
                          rowOverlaps && !highlightSingleCell
                            ? claimHighlightRef()
                            : undefined
                        }
                        className={
                          rowOverlaps && !highlightSingleCell
                            ? "border-b-2 border-[#D97706] bg-[#FEF3C7] font-medium text-[#0A0A0A]"
                            : "even:bg-[#FAFAFB]"
                        }
                      >
                        {rowCells.map((cell, cIdx) => {
                          const cellMatched =
                            highlightSingleCell &&
                            overlapsSpan(cell.start, cell.end, activeSpan);
                          const numeric = isNumericCell(cell.text);
                          return (
                            <td
                              key={cIdx}
                              ref={cellMatched ? claimHighlightRef() : undefined}
                              className={`px-3 py-2 align-top leading-5 ${
                                numeric ? "font-mono-code text-[11px]" : ""
                              } ${
                                cellMatched
                                  ? "border-b-2 border-[#D97706] bg-[#FEF3C7] ring-1 ring-inset ring-[#D97706] font-medium text-[#0A0A0A]"
                                  : "text-[#0A0A0A]"
                              }`}
                            >
                              {renderInlineFormatted(cell.text)}
                              {cellMatched && <AnchoredSpanBadge />}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.kind === "ul") {
          return (
            <ul key={blockIdx} className="my-2.5 space-y-2">
              {block.items.map((item, idx) => {
                const isMatched = overlapsSpan(item.line.start, item.line.end, activeSpan);
                return (
                  <li
                    key={idx}
                    ref={isMatched ? claimHighlightRef() : undefined}
                    className={`flex items-start gap-2.5 rounded-[2px] px-2 py-1 text-[13px] leading-relaxed ${
                      isMatched ? HIGHLIGHT_CLASS : ""
                    }`}
                  >
                    <span
                      className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        isMatched ? "bg-[#D97706]" : "bg-[#B4B4BC]"
                      }`}
                    />
                    <span className="flex-1 text-[#0A0A0A]">
                      {renderInlineFormatted(item.content)}
                      {isMatched && <AnchoredSpanBadge />}
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        }

        if (block.kind === "ol") {
          return (
            <ol key={blockIdx} className="my-2.5 list-decimal space-y-2 pl-6">
              {block.items.map((item, idx) => {
                const isMatched = overlapsSpan(item.line.start, item.line.end, activeSpan);
                return (
                  <li
                    key={idx}
                    ref={isMatched ? claimHighlightRef() : undefined}
                    className={`rounded-[2px] px-2 py-0.5 text-[13px] leading-relaxed text-[#0A0A0A] ${
                      isMatched ? HIGHLIGHT_CLASS : ""
                    }`}
                  >
                    {renderInlineFormatted(item.content)}
                    {isMatched && <AnchoredSpanBadge />}
                  </li>
                );
              })}
            </ol>
          );
        }

        const isMatched = overlapsSpan(block.line.start, block.line.end, activeSpan);
        return (
          <p
            key={blockIdx}
            ref={isMatched ? claimHighlightRef() : undefined}
            className={`text-[13.5px] leading-relaxed ${isMatched ? HIGHLIGHT_CLASS : ""}`}
          >
            {renderInlineFormatted(block.line.text)}
            {isMatched && <AnchoredSpanBadge />}
          </p>
        );
      })}
    </div>
  );
}
