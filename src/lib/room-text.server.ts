import { inflateRawSync } from "node:zlib";

const MAX_CHARS = 6000;

function clip(text: string) {
  const clean = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (clean.length <= MAX_CHARS) return clean;
  return `${clean.slice(0, MAX_CHARS)}\n[truncated]`;
}

function pdfText(bytes: Buffer) {
  const latin = bytes.toString("latin1");
  const parts: string[] = [];
  const re = /\((?:\\.|[^\\)]){1,800}\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(latin))) {
    let value = match[0].slice(1, -1);
    value = value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\")
      .replace(/\\([0-7]{1,3})/g, (_, oct: string) =>
        String.fromCharCode(Number.parseInt(oct, 8)),
      );
    if (/[A-Za-z0-9]/.test(value)) parts.push(value);
    if (parts.join(" ").length > MAX_CHARS) break;
  }
  return clip(parts.join(" "));
}

function zipEntry(bytes: Buffer, wanted: string): Buffer | null {
  const needle = Buffer.from(wanted);
  let from = 0;
  while (from < bytes.length) {
    const at = bytes.indexOf(needle, from);
    if (at < 0) return null;
    const header = at - 30;
    if (header >= 0 && bytes.readUInt32LE(header) === 0x04034b50) {
      const method = bytes.readUInt16LE(header + 8);
      const compSize = bytes.readUInt32LE(header + 18);
      const nameLen = bytes.readUInt16LE(header + 26);
      const extraLen = bytes.readUInt16LE(header + 28);
      const start = header + 30 + nameLen + extraLen;
      if (compSize > 0 && start + compSize <= bytes.length) {
        const data = bytes.subarray(start, start + compSize);
        try {
          if (method === 0) return Buffer.from(data);
          if (method === 8) return inflateRawSync(data);
        } catch {
          /* try the next copy of the name */
        }
      }
    }
    from = at + needle.length;
  }
  return null;
}

function docxText(bytes: Buffer) {
  const xml = zipEntry(bytes, "word/document.xml");
  if (!xml) return "";
  const text = xml
    .toString("utf8")
    .replace(/<w:p[ >]/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(new RegExp("&" + "amp;", "g"), "&")
    .replace(new RegExp("&" + "lt;", "g"), "<")
    .replace(new RegExp("&" + "gt;", "g"), ">")
    .replace(new RegExp("&" + "quot;", "g"), '"');
  return clip(text);
}

async function sheetText(bytes: Buffer, name: string) {
  const mod: Record<string, unknown> = await import("xlsx");
  const inner = (mod.default ?? mod) as Record<string, unknown>;
  const XLSX = (
    typeof inner.read === "function" ? inner : (inner.default ?? inner)
  ) as {
    read: (data: Buffer, opts: object) => {
      SheetNames: string[];
      Sheets: Record<string, unknown>;
    };
    utils: { sheet_to_csv: (sheet: unknown, opts: object) => string };
  };
  const wb = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const chunks: string[] = [];
  for (const sheetName of wb.SheetNames.slice(0, 4)) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName] ?? {}, { blankrows: false });
    const lines = csv.split(/\r?\n/).slice(0, 40);
    chunks.push(`# ${sheetName}\n${lines.join("\n")}`);
    if (chunks.join("\n").length > MAX_CHARS) break;
  }
  return clip(chunks.join("\n\n") || name);
}

export async function extractRoomText(name: string, mimeType: string, bytes: Buffer) {
  const lower = `${name} ${mimeType}`.toLowerCase();
  if (!bytes.length) return "";
  if (
    lower.includes("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".md") ||
    lower.endsWith(".json") ||
    lower.includes("json") ||
    mimeType === "text/csv"
  ) {
    return clip(bytes.toString("utf8"));
  }
  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsm") ||
    lower.includes("spreadsheet") ||
    lower.includes("excel")
  ) {
    return sheetText(bytes, name);
  }
  if (lower.endsWith(".docx") || lower.includes("wordprocessingml")) {
    return docxText(bytes);
  }
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    return pdfText(bytes);
  }
  return "";
}
