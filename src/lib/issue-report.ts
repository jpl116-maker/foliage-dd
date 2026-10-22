import type { Category, DdDocument, Issue, Matter } from "@/lib/types";
import { ISSUE_STATUS_LABEL, SEVERITY_LABEL } from "@/lib/types";
import { issueFileRef } from "@/lib/issue-file";
import { WORKSPACE_LABEL, type WorkspaceId } from "@/lib/workspace";

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export type ReportIssue = {
  title: string;
  status: string;
  severity: string;
  code: string;
  why: string;
  where: string;
  finding: string;
};

function topicWhy(issue: Issue): string {
  const blob = `${issue.title} ${issue.summary} ${issue.codeSection ?? ""}`.toLowerCase();
  if (/itsi|impermissible tenant|tenant service|856\(d\)\(7\)/.test(blob)) {
    return "Impermissible tenant service income (ITSI) arises when a REIT provides noncustomary services to tenants other than through an independent contractor or a taxable REIT subsidiary. Under IRC §856(d)(7), amounts above the 1% de minimis are excluded from rents from real property. That income is nonqualifying for the 75% and 95% gross income tests and can put REIT status at risk.";
  }
  if (/non-?qualif|nqi|856\(c\)\(2\)|856\(c\)\(3\)|gross income test|75%|95%/.test(blob)) {
    return "Nonqualifying income (NQI) is gross income that does not count toward the REIT gross income tests in IRC §856(c)(2) and (c)(3). Only listed categories, principally rents from real property, mortgage interest, and certain gains, qualify. NQI above the permitted percentage can cause a failure of the 75% or 95% test unless a relief provision is available.";
  }
  if (/asset test|856\(c\)\(4\)|trs securit|25%/.test(blob)) {
    return "The REIT asset test in IRC §856(c)(4) requires that at least 75% of the value of assets be real estate assets at each quarter end, and it caps securities of taxable REIT subsidiaries and other issuers. A breach can terminate REIT status unless the failure is due to reasonable cause and the statutory cure is met.";
  }
  if (/built-in gain|337\(d\)|c corporation|c-corp/.test(blob)) {
    return "A REIT that converted from a C corporation, or that acquired assets from a C corporation in a carryover-basis transaction, can recognize built-in gain under IRC §337(d) and Treas. Reg. §1.337(d)-7 during the recognition period. Tax on that gain is a corporate-level cost of the deal if the period is still open.";
  }
  if (/382|ownership change|nol/.test(blob)) {
    return "An ownership change under IRC §382 limits the annual use of pre-change net operating losses and certain built-in losses. If a testing-period owner shift exceeded 50 percentage points, the losses are not freely available to shelter post-closing taxable income.";
  }
  if (/cost seg|168|depreciation|bonus/.test(blob)) {
    return "Cost-segregation allocations under IRC §168 move basis from real property into shorter-lived classes and can support bonus depreciation. An unsigned, unsupported, or aggressive study is a reserve item because the depreciation claimed on the return depends on that allocation.";
  }
  if (/856\(d\)\(2\)|related-party rent|related party rent/.test(blob)) {
    return "Rents received from a related party are generally excluded from rents from real property under IRC §856(d)(2). The exclusion does not apply to certain rents received through a taxable REIT subsidiary from lodging or health-care facilities operated by an eligible independent contractor. Related-party rent that misses those exceptions is nonqualifying income.";
  }
  if (/857|qualified reit dividend|distribution/.test(blob)) {
    return "A REIT must distribute at least 90% of its REIT taxable income under IRC §857, and the character of those dividends matters to the holders. A mischaracterized or unpaid distribution can produce corporate-level tax and holder-level reporting exposure.";
  }
  if (/856\(a\)|856\(h\)|closely held|100 shareholder|ownership limit/.test(blob)) {
    return "IRC §856(a) and (h) require at least 100 shareholders and prohibit five or fewer individuals from owning more than 50% of the REIT. An ownership limit, a waiver, or a missing shareholder agreement is relevant because a closely held REIT loses qualification.";
  }
  if (/6655|estimated tax/.test(blob)) {
    return "A shortfall in estimated tax under IRC §6655 produces an addition to tax. The amount is usually small relative to REIT qualification, but it is still a closing item if the voucher was not caught up.";
  }
  if (/california|franchise|combined|state|salt|nexus/.test(blob)) {
    return "State filing positions, including combined reporting and nexus, do not by themselves determine REIT qualification. They can still produce tax, penalty, and reserve exposure that the buyer should price or treat as a closing condition.";
  }
  return "The item was raised in tax due diligence because it may affect REIT qualification, the tax basis or attributes that transfer, or the cash tax cost of the transaction. The finding below is the specific point recorded on the issues list.";
}

function whereFound(
  issue: Issue,
  workspace: WorkspaceId,
  projectId: string,
  doc?: DdDocument,
  category?: Category,
) {
  const ref = issueFileRef(issue, workspace, doc?.name, projectId);
  const fileName = ref?.name;
  const area = category?.name || "the diligence file";
  const period = doc?.period ? ` The file covers ${doc.period}.` : "";
  const notes = doc?.notes?.trim();
  if (!fileName) {
    return `No data-room file is attached. The issue is recorded under ${area}.`;
  }
  const about = notes
    ? ` ${notes}`
    : ` It is a ${area} file in the data room.`;
  return `Found in ${fileName}.${period}${about}`;
}

export function reportIssues(input: {
  issues: Issue[];
  documents: DdDocument[];
  categories: Category[];
  workspace: WorkspaceId;
  projectId: string;
}): ReportIssue[] {
  return input.issues
    .slice()
    .sort((a, b) => {
      if (a.status === "resolved" && b.status !== "resolved") return 1;
      if (b.status === "resolved" && a.status !== "resolved") return -1;
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    })
    .map((issue) => {
      const doc = input.documents.find((row) => row.id === issue.documentId);
      const category = input.categories.find((row) => row.id === issue.categoryId);
      return {
        title: issue.title,
        status: ISSUE_STATUS_LABEL[issue.status],
        severity: SEVERITY_LABEL[issue.severity],
        code: issue.codeSection?.trim() || "",
        why: topicWhy(issue),
        where: whereFound(issue, input.workspace, input.projectId, doc, category),
        finding: issue.summary.trim(),
      };
    });
}

export function reportParagraphs(input: {
  matter: Matter;
  workspace: WorkspaceId;
  issues: ReportIssue[];
  preparedOn: string;
}): string[] {
  const { matter, issues } = input;
  const workstream = WORKSPACE_LABEL[input.workspace];
  const open = issues.filter((issue) => issue.status === "Open").length;
  const watch = issues.filter((issue) => issue.status === "Monitoring").length;
  const closed = issues.filter((issue) => issue.status === "Resolved").length;
  const critical = issues.filter((issue) => issue.severity === "Critical").length;
  const high = issues.filter((issue) => issue.severity === "High").length;
  const lines = [
    "Tax due diligence issue report",
    matter.name,
    `Prepared ${input.preparedOn}`,
    `This report summarizes the tax due diligence issues recorded for ${matter.name}. The client is ${matter.client}. The target ${input.workspace === "asset" ? "portfolio" : "entity"} is ${matter.target}. The transaction is ${matter.dealType}. The comments cover the ${workstream} workstream and are taken from the issues list as of ${input.preparedOn}.`,
    issues.length === 0
      ? "No issues are recorded on the issues list."
      : `The issues list contains ${issues.length} ${issues.length === 1 ? "issue" : "issues"}: ${open} open, ${watch} on watch, and ${closed} closed. ${critical} ${critical === 1 ? "is" : "are"} critical and ${high} ${high === 1 ? "is" : "are"} high.`,
  ];
  issues.forEach((issue, index) => {
    lines.push(`${index + 1}. ${issue.title}`);
    lines.push(
      `Status: ${issue.status}. Severity: ${issue.severity}.${issue.code ? ` Code: ${issue.code}.` : ""}`,
    );
    lines.push(`Why this is an issue. ${issue.why}`);
    lines.push(`Where it was found. ${issue.where}`);
    if (issue.finding) lines.push(`Finding. ${issue.finding}`);
  });
  return lines;
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length + file.data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.data.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(file.data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.data.length, true);
    centralView.setUint32(24, file.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end].map(
    (part) => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer,
  );
  return new Blob(parts, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function paragraph(text: string, heading: boolean) {
  const size = heading ? "28" : "22";
  const bold = heading ? "<w:b/>" : "";
  const before = heading ? "280" : "80";
  return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="60"/></w:pPr><w:r><w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${text
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")}</w:t></w:r></w:p>`;
}

export function issueReportDocx(lines: string[]) {
  const body = lines
    .map((line, index) => paragraph(line, index === 0 || /^\d+\. /.test(line)))
    .join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const encoder = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(types) },
    { name: "_rels/.rels", data: encoder.encode(rels) },
    { name: "word/document.xml", data: encoder.encode(document) },
  ]);
}

export type ReportFormat = "docx" | "pdf";

function pdfEscape(text: string) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    let byte = code;
    if (code === 0x2013 || code === 0x2014) {
      out += "--";
      continue;
    }
    if (code === 0x2018 || code === 0x2019) byte = 0x27;
    else if (code === 0x201c || code === 0x201d) byte = 0x22;
    else if (code >= 32 && code <= 126) byte = code;
    else if (code >= 160 && code <= 255) byte = code;
    else byte = 63;
    if (byte === 0x5c || byte === 0x28 || byte === 0x29) out += `\\${String.fromCharCode(byte)}`;
    else if (byte > 126) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return out;
}

function wrapReportLine(text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if (`${line} ${word}`.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function pdfBytes(objects: string[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(encoder.encode(`${i} 0 obj\n${objects[i]}\nendobj\n`));
  }
  const startxref = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(
    encoder.encode(
      `${xref}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`,
    ),
  );
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export function issueReportPdf(lines: string[]) {
  const wrapped: { text: string; heading: boolean }[] = [];
  lines.forEach((line, index) => {
    const heading = index === 0 || /^\d+\. /.test(line);
    for (const row of wrapReportLine(line, heading ? 72 : 92)) {
      wrapped.push({ text: row, heading });
    }
  });
  const pageSize = 40;
  const pages: { text: string; heading: boolean }[][] = [];
  for (let i = 0; i < wrapped.length; i += pageSize) pages.push(wrapped.slice(i, i + pageSize));
  if (pages.length === 0) pages.push([]);

  const objects = ["", "", "", "", ""];
  const firstPage = 5;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages
    .map((_, index) => `${firstPage + index * 2} 0 R`)
    .join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((rows, index) => {
    const pageObj = firstPage + index * 2;
    const contentObj = pageObj + 1;
    let stream = "BT\n";
    let font = "";
    let y = 740;
    for (const row of rows) {
      const next = row.heading ? "F2" : "F1";
      const size = row.heading ? 13 : 11;
      if (next !== font) {
        stream += `/${next} ${size} Tf\n`;
        font = next;
      }
      stream += `1 0 0 1 72 ${y} Tm (${pdfEscape(row.text)}) Tj\n`;
      y -= 16;
    }
    stream += "ET";
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObj} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`;
  });

  const bytes = pdfBytes(objects);
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([copy], { type: "application/pdf" });
}

export function downloadIssueReport(filename: string, lines: string[], format: ReportFormat) {
  const blob = format === "pdf" ? issueReportPdf(lines) : issueReportDocx(lines);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
