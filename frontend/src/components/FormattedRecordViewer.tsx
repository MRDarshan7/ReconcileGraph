import type { ReactNode, RefObject } from "react";
import type { SpanRecord } from "../types";

interface FormattedRecordViewerProps {
  rawText: string;
  activeSpan: SpanRecord | null;
  highlightRef: RefObject<HTMLElement | null>;
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

function renderInlineFormatted(text: string): ReactNode {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (!token) return null;
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <span
          key={idx}
          className="mx-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono-code text-xs font-medium text-slate-800"
        >
          {token.slice(1, -1)}
        </span>
      );
    }
    return <span key={idx}>{token.replaceAll("**", "").replaceAll("`", "")}</span>;
  });
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

    // Headings (# or ## / ###)
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

    // Pipe Tables
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

    // Bullet lists (- item)
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

    // Ordered lists (1. item)
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
  "bg-amber-100/90 ring-2 ring-amber-400 rounded-md px-1.5 py-0.5 text-slate-950 font-medium";

export function FormattedRecordViewer({
  rawText,
  activeSpan,
  highlightRef,
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
    <div className="space-y-3 text-sm leading-7 text-slate-700">
      {blocks.map((block, blockIdx) => {
        if (block.kind === "heading") {
          const isMatched = overlapsSpan(block.line.start, block.line.end, activeSpan);
          if (block.level === 1) {
            return (
              <h1
                key={blockIdx}
                ref={isMatched ? claimHighlightRef() : undefined}
                className={`border-b border-slate-200 pb-2 text-lg font-bold text-slate-900 ${
                  isMatched ? HIGHLIGHT_CLASS : ""
                }`}
              >
                {renderInlineFormatted(block.content)}
              </h1>
            );
          }
          return (
            <h2
              key={blockIdx}
              ref={isMatched ? claimHighlightRef() : undefined}
              className={`mt-4 mb-2 border-b border-slate-200 pb-1.5 text-base font-semibold text-slate-900 ${
                isMatched ? HIGHLIGHT_CLASS : ""
              }`}
            >
              {renderInlineFormatted(block.content)}
            </h2>
          );
        }

        if (block.kind === "table") {
          const headerCells = block.header ? parseTableCells(block.header) : [];
          return (
            <div
              key={blockIdx}
              className="my-3 overflow-x-auto rounded-lg border border-slate-200"
            >
              <table className="w-full border-collapse text-left text-xs">
                {headerCells.length > 0 && (
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {headerCells.map((cell, cIdx) => (
                        <th
                          key={cIdx}
                          className="px-3 py-2 font-semibold text-slate-700"
                        >
                          {renderInlineFormatted(cell.text)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-slate-100 bg-white">
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
                    // If the span matches a single specific cell cleanly, highlight that cell;
                    // otherwise highlight the entire row.
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
                            ? "bg-amber-100/90 ring-2 ring-inset ring-amber-400 text-slate-950 font-medium"
                            : ""
                        }
                      >
                        {rowCells.map((cell, cIdx) => {
                          const cellMatched =
                            highlightSingleCell &&
                            overlapsSpan(cell.start, cell.end, activeSpan);
                          return (
                            <td
                              key={cIdx}
                              ref={cellMatched ? claimHighlightRef() : undefined}
                              className={`px-3 py-2 align-top leading-5 ${
                                cellMatched
                                  ? "bg-amber-100/90 ring-2 ring-inset ring-amber-400 font-medium text-slate-950"
                                  : "text-slate-700"
                              }`}
                            >
                              {renderInlineFormatted(cell.text)}
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
            <ul key={blockIdx} className="my-2 space-y-1.5">
              {block.items.map((item, idx) => {
                const isMatched = overlapsSpan(item.line.start, item.line.end, activeSpan);
                return (
                  <li
                    key={idx}
                    ref={isMatched ? claimHighlightRef() : undefined}
                    className={`flex items-start gap-2 rounded-md px-2 py-1 text-sm leading-6 ${
                      isMatched ? HIGHLIGHT_CLASS : ""
                    }`}
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    <span className="flex-1">{renderInlineFormatted(item.content)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        if (block.kind === "ol") {
          return (
            <ol key={blockIdx} className="my-2 list-decimal space-y-1.5 pl-6">
              {block.items.map((item, idx) => {
                const isMatched = overlapsSpan(item.line.start, item.line.end, activeSpan);
                return (
                  <li
                    key={idx}
                    ref={isMatched ? claimHighlightRef() : undefined}
                    className={`rounded-md px-1.5 py-0.5 text-sm leading-6 ${
                      isMatched ? HIGHLIGHT_CLASS : ""
                    }`}
                  >
                    {renderInlineFormatted(item.content)}
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
            className={`text-sm leading-7 ${isMatched ? HIGHLIGHT_CLASS : ""}`}
          >
            {renderInlineFormatted(block.line.text)}
          </p>
        );
      })}
    </div>
  );
}
