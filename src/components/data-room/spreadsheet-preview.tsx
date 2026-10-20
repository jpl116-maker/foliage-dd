import { useState } from "react";
import { columnLabel, type ExcelSheetPreview } from "@/lib/excel-preview";
import { cn } from "@/lib/utils";

export function SpreadsheetPreview({
  sheets,
  tall,
}: {
  sheets: ExcelSheetPreview[];
  tall?: boolean;
}) {
  const [active, setActive] = useState(0);
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  if (!sheet) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted">
        This workbook has no sheets to preview.
      </p>
    );
  }
  const colCount = Math.max(1, ...sheet.rows.map((row) => row.length));

  return (
    <div className={cn("flex min-h-0 flex-col", tall ? "h-full" : "max-h-[28rem]")}>
      {sheets.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-paper-2 px-2 py-1.5">
          {sheets.map((item, i) => (
            <button
              key={`${item.name}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "h-8 shrink-0 rounded-md px-2.5 text-xs font-medium",
                i === active ? "bg-surface text-ink shadow-[var(--shadow-border)]" : "text-muted hover:text-ink",
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 w-10 border-b border-r border-border bg-paper-2 px-1 py-1.5 text-center font-mono text-[10px] font-medium text-faint">
                #
              </th>
              {Array.from({ length: colCount }, (_, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 min-w-24 border-b border-border bg-paper-2 px-2 py-1.5 text-left font-mono text-[10px] font-medium text-faint"
                >
                  {columnLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} className="odd:bg-surface even:bg-paper/60">
                <th className="sticky left-0 z-10 w-10 border-r border-border bg-paper-2 px-1 py-1 text-center font-mono text-[10px] font-medium text-faint">
                  {r + 1}
                </th>
                {Array.from({ length: colCount }, (_, c) => (
                  <td
                    key={c}
                    className="max-w-64 truncate border-b border-border px-2 py-1 text-ink whitespace-nowrap"
                    title={row[c] ?? ""}
                  >
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.truncated ? (
        <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted">
          Showing the first {sheet.rows.length} rows
          {sheet.totalCols > colCount ? ` and ${colCount} columns` : ""} of {sheet.totalRows}{" "}
          × {sheet.totalCols}. Download the file for the full workbook.
        </p>
      ) : (
        <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted">
          {sheet.totalRows} {sheet.totalRows === 1 ? "row" : "rows"} · {sheet.totalCols}{" "}
          {sheet.totalCols === 1 ? "column" : "columns"}
        </p>
      )}
    </div>
  );
}
