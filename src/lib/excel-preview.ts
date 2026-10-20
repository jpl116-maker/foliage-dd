export const EXCEL_PREVIEW_MAX_ROWS = 250;
export const EXCEL_PREVIEW_MAX_COLS = 40;

export type ExcelSheetPreview = {
  name: string;
  rows: string[][];
  totalRows: number;
  totalCols: number;
  truncated: boolean;
};

export function isSpreadsheetFile(name: string, mimeType: string) {
  const lower = `${name} ${mimeType}`.toLowerCase();
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsm") ||
    lower.endsWith(".csv") ||
    lower.includes("spreadsheet") ||
    lower.includes("excel") ||
    mimeType === "text/csv" ||
    mimeType === "application/vnd.ms-excel"
  );
}

function cellText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function parseSpreadsheet(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ExcelSheetPreview[]> {
  const mod: Record<string, unknown> = await import("xlsx");
  const inner = (mod.default ?? mod) as Record<string, unknown>;
  const XLSX = (
    typeof inner.read === "function" ? inner : (inner.default ?? inner)
  ) as {
    read: (data: ArrayBuffer, opts: object) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_json: <T>(sheet: unknown, opts: object) => T };
  };
  if (typeof XLSX.read !== "function") {
    throw new Error("Could not read this spreadsheet");
  }
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, dense: true });
  const names = wb.SheetNames.length > 0 ? wb.SheetNames : ["Sheet1"];
  return names.map((name) => {
    const sheet = wb.Sheets[name] ?? {};
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    let maxCols = 0;
    for (const row of raw) {
      if (Array.isArray(row) && row.length > maxCols) maxCols = row.length;
    }
    const totalRows = raw.length;
    const totalCols = maxCols;
    const truncated =
      totalRows > EXCEL_PREVIEW_MAX_ROWS || totalCols > EXCEL_PREVIEW_MAX_COLS;
    const rows = raw.slice(0, EXCEL_PREVIEW_MAX_ROWS).map((row) => {
      const cells = Array.isArray(row) ? row : [];
      const out: string[] = [];
      const width = Math.min(Math.max(cells.length, 1), EXCEL_PREVIEW_MAX_COLS);
      for (let i = 0; i < width; i += 1) out.push(cellText(cells[i]));
      return out;
    });
    if (rows.length === 0) rows.push([filename.endsWith(".csv") ? "" : "Empty sheet"]);
    return { name, rows, totalRows, totalCols, truncated };
  });
}

export function columnLabel(index: number) {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}
