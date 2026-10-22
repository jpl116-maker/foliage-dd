import type { Category, DdDocument, Issue, Matter } from "@/lib/types";
import { ISSUE_STATUS_LABEL, SEVERITY_LABEL } from "@/lib/types";
import { issueFileRef } from "@/lib/issue-file";
import { WORKSPACE_LABEL, type WorkspaceId } from "@/lib/workspace";

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export type ReportIssue = {
  id: string;
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
        id: issue.id,
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

export type IssueReport = {
  title: string;
  project: string;
  client: string;
  preparedOn: string;
  intro: string;
  facts: { label: string; value: string }[];
  summary: string;
  issues: ReportIssue[];
};

export function buildIssueReport(input: {
  matter: Matter;
  workspace: WorkspaceId;
  issues: ReportIssue[];
  preparedOn: string;
}): IssueReport {
  const { matter, issues } = input;
  const workstream = WORKSPACE_LABEL[input.workspace];
  const open = issues.filter((issue) => issue.status === "Open").length;
  const watch = issues.filter((issue) => issue.status === "Monitoring").length;
  const closed = issues.filter((issue) => issue.status === "Resolved").length;
  const critical = issues.filter((issue) => issue.severity === "Critical").length;
  const high = issues.filter((issue) => issue.severity === "High").length;
  return {
    title: "Tax Due Diligence Issue Report",
    project: matter.name,
    client: matter.client,
    preparedOn: input.preparedOn,
    intro: `This report summarizes the tax due diligence issues recorded for ${matter.name}. It covers the ${workstream} workstream and is taken from the issues list as of ${input.preparedOn}.`,
    facts: [
      { label: "Client", value: matter.client },
      { label: "Target", value: matter.target },
      { label: "Transaction", value: matter.dealType },
      { label: "Workstream", value: workstream },
    ],
    summary:
      issues.length === 0
        ? "No issues are recorded on the issues list."
        : `${issues.length} ${issues.length === 1 ? "issue" : "issues"}: ${open} open, ${watch} on watch, and ${closed} closed. ${critical} ${critical === 1 ? "is" : "are"} critical and ${high} ${high === 1 ? "is" : "are"} high.`,
    issues,
  };
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

const NAVY = "1E3A8A";
const BLUE = "4169E1";
const INK = "1F2937";
const MUTED = "6B7280";
const RULE = "D6DCE8";
const WASH = "EEF2FF";

function xml(text: string) {
  return text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function wordRun(
  text: string,
  opts: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {},
) {
  const size = opts.size ?? 22;
  return `<w:r><w:rPr>${opts.bold ? "<w:b/>" : ""}${opts.italic ? "<w:i/>" : ""}<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${opts.color ? `<w:color w:val="${opts.color}"/>` : ""}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function wordPara(
  content: string,
  opts: { before?: number; after?: number; border?: "bottom" | "top"; rightTab?: boolean } = {},
) {
  const border =
    opts.border === "bottom"
      ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="${BLUE}"/></w:pBdr>`
      : opts.border === "top"
        ? `<w:pBdr><w:top w:val="single" w:sz="8" w:space="1" w:color="${BLUE}"/></w:pBdr>`
        : "";
  const tab = opts.rightTab ? `<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>` : "";
  return `<w:p><w:pPr><w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 60}" w:line="276" w:lineRule="auto"/>${tab}${border}</w:pPr>${content}</w:p>`;
}

function wordCell(blocks: string, width: number, fill?: string) {
  const shade = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade}<w:vAlign w:val="center"/><w:tcMar><w:top w:w="70" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>${blocks}</w:tc>`;
}

function wordTable(rows: string[]) {
  const edge = (name: string) =>
    `<w:${name} w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>${edge("top")}${edge("left")}${edge("bottom")}${edge("right")}${edge("insideH")}${edge("insideV")}</w:tblBorders></w:tblPr>${rows
    .map((row) => `<w:tr>${row}</w:tr>`)
    .join("")}</w:tbl>`;
}

function labeledBlock(label: string, text: string) {
  if (!text.trim()) return "";
  return (
    wordPara(wordRun(label, { bold: true, size: 18, color: BLUE }), { before: 160, after: 20 }) +
    wordPara(wordRun(text, { size: 22, color: INK }), { before: 0, after: 40 })
  );
}

export function issueReportDocx(report: IssueReport) {
  const fact = (item: { label: string; value: string }) =>
    wordCell(
      wordPara(wordRun(item.label.toUpperCase(), { bold: true, size: 16, color: BLUE }), {
        before: 0,
        after: 0,
      }) +
        wordPara(wordRun(item.value || "None", { bold: true, size: 22, color: INK }), {
          before: 20,
          after: 0,
        }),
      4680,
    );
  const head = (label: string) =>
    wordCell(
      wordPara(wordRun(label, { bold: true, size: 16, color: "FFFFFF" }), { before: 0, after: 0 }),
      3120,
      BLUE,
    );
  const value = (text: string) =>
    wordCell(
      wordPara(wordRun(text || "None", { size: 20, color: INK }), { before: 0, after: 0 }),
      3120,
    );
  const body = [
    wordPara(wordRun(report.title, { bold: true, size: 36, color: NAVY }), { before: 0, after: 40 }),
    wordPara(wordRun(report.project, { size: 26, color: INK }), { before: 0, after: 0 }),
    wordPara(wordRun(`Prepared ${report.preparedOn}`, { italic: true, size: 18, color: MUTED }), {
      before: 40,
      after: 160,
      border: "bottom",
    }),
    wordPara(wordRun(report.intro, { size: 22, color: INK }), { before: 200, after: 160 }),
    wordTable([
      fact(report.facts[0]) + fact(report.facts[1]),
      fact(report.facts[2]) + fact(report.facts[3]),
    ]),
    wordPara("", { before: 80, after: 40 }),
    wordTable([
      wordCell(
        wordPara(wordRun(report.summary, { size: 22, color: INK }), { before: 20, after: 20 }),
        9360,
        WASH,
      ),
    ]),
    wordPara(wordRun("Issues", { bold: true, size: 28, color: NAVY }), {
      before: 320,
      after: 80,
      border: "bottom",
    }),
    ...report.issues.flatMap((issue, index) => [
      wordPara(wordRun(`ISSUE ${index + 1}`, { bold: true, size: 16, color: BLUE }), {
        before: 280,
        after: 0,
      }),
      wordPara(wordRun(issue.title, { bold: true, size: 26, color: NAVY }), { before: 40, after: 80 }),
      wordTable([
        head("STATUS") + head("SEVERITY") + head("CODE"),
        value(issue.status) + value(issue.severity) + value(issue.code),
      ]),
      labeledBlock("WHY THIS IS AN ISSUE", issue.why),
      labeledBlock("WHERE IT WAS FOUND", issue.where),
      labeledBlock("FINDING", issue.finding),
    ]),
  ].join("");
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${wordPara(
    wordRun("TAX DUE DILIGENCE", { bold: true, size: 16, color: BLUE }) +
      "<w:r><w:tab/></w:r>" +
      wordRun(report.project, { size: 16, color: MUTED }),
    { before: 0, after: 40, border: "bottom", rightTab: true },
  )}</w:hdr>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${wordPara(
    wordRun("Confidential", { size: 16, color: MUTED }) +
      "<w:r><w:tab/></w:r>" +
      wordRun("Page ", { size: 16, color: MUTED }) +
      `<w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="${MUTED}"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
      wordRun(" of ", { size: 16, color: MUTED }) +
      `<w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="${MUTED}"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`,
    { before: 0, after: 0, border: "top", rightTab: true },
  )}</w:ftr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1080" w:bottom="1134" w:left="1080" w:header="567" w:footer="567"/></w:sectPr></w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer.xml"/></Relationships>`;
  const encoder = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(types) },
    { name: "_rels/.rels", data: encoder.encode(rels) },
    { name: "word/document.xml", data: encoder.encode(document) },
    { name: "word/header.xml", data: encoder.encode(header) },
    { name: "word/footer.xml", data: encoder.encode(footer) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(docRels) },
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

const PDF_BLUE = "0.255 0.412 0.882";
const PDF_NAVY = "0.118 0.227 0.541";
const PDF_INK = "0.122 0.161 0.216";
const PDF_MUTED = "0.420 0.447 0.502";
const PDF_WASH = "0.933 0.949 1";
const PDF_LINE = "0.839 0.863 0.910";
const PDF_LEFT = 54;
const PDF_RIGHT = 558;
const PDF_WIDTH = PDF_RIGHT - PDF_LEFT;

type PdfItem = {
  h: number;
  keepWithNext?: boolean;
  draw: (yTop: number) => string;
};

function pdfTextWidth(text: string, size: number) {
  return text.length * size * 0.5;
}

function pdfLines(text: string, size: number, width = PDF_WIDTH) {
  const max = Math.max(24, Math.floor(width / (size * 0.5)));
  return wrapReportLine(text, max);
}

function pdfText(
  text: string,
  size: number,
  color: string,
  bold: boolean,
  opts: { before?: number; after?: number; width?: number; x?: number } = {},
): PdfItem {
  const lines = pdfLines(text, size, opts.width ?? PDF_WIDTH);
  const leading = size + 4;
  const before = opts.before ?? 0;
  const after = opts.after ?? 2;
  const x = opts.x ?? PDF_LEFT;
  return {
    h: before + lines.length * leading + after,
    draw(yTop) {
      let y = yTop - before - size;
      let stream = `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg\n`;
      for (const line of lines) {
        stream += `1 0 0 1 ${x} ${y.toFixed(1)} Tm (${pdfEscape(line)}) Tj\n`;
        y -= leading;
      }
      return `${stream}ET\n`;
    },
  };
}

function pdfRule(): PdfItem {
  return {
    h: 14,
    draw(yTop) {
      const y = (yTop - 7).toFixed(1);
      return `${PDF_BLUE} RG 1.25 w ${PDF_LEFT} ${y} m ${PDF_RIGHT} ${y} l S\n`;
    },
  };
}

function pdfCallout(text: string): PdfItem {
  const lines = pdfLines(text, 11, PDF_WIDTH - 20);
  const leading = 15;
  const inner = 16 + lines.length * leading;
  return {
    h: inner + 8,
    draw(yTop) {
      const top = yTop - 4;
      const boxH = inner - 8;
      let stream = `${PDF_WASH} rg ${PDF_LEFT} ${(top - boxH).toFixed(1)} ${PDF_WIDTH} ${boxH} re f\n`;
      stream += `BT /F1 11 Tf ${PDF_INK} rg\n`;
      let y = top - 16;
      for (const line of lines) {
        stream += `1 0 0 1 ${PDF_LEFT + 10} ${y.toFixed(1)} Tm (${pdfEscape(line)}) Tj\n`;
        y -= leading;
      }
      return `${stream}ET\n`;
    },
  };
}

function pdfFacts(facts: { label: string; value: string }[]): PdfItem {
  const h = 78;
  return {
    h: h + 8,
    draw(yTop) {
      const top = yTop - 4;
      const boxH = h - 8;
      let stream = `${PDF_WASH} rg ${PDF_LEFT} ${(top - boxH).toFixed(1)} ${PDF_WIDTH} ${boxH} re f\n`;
      stream += `${PDF_LINE} RG 0.6 w ${PDF_LEFT} ${(top - boxH).toFixed(1)} ${PDF_WIDTH} ${boxH} re S\n`;
      facts.slice(0, 4).forEach((fact, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = PDF_LEFT + 12 + col * (PDF_WIDTH / 2);
        const labelY = top - 16 - row * 34;
        const valueY = labelY - 13;
        stream += `BT /F2 8 Tf ${PDF_BLUE} rg 1 0 0 1 ${x} ${labelY.toFixed(1)} Tm (${pdfEscape(fact.label.toUpperCase())}) Tj ET\n`;
        const value = pdfLines(fact.value || "None", 11, PDF_WIDTH / 2 - 24)[0];
        stream += `BT /F2 11 Tf ${PDF_INK} rg 1 0 0 1 ${x} ${valueY.toFixed(1)} Tm (${pdfEscape(value)}) Tj ET\n`;
      });
      return stream;
    },
  };
}

function pdfMeta(issue: ReportIssue): PdfItem {
  const cells = [
    ["STATUS", issue.status],
    ["SEVERITY", issue.severity],
    ["CODE", issue.code || "None"],
  ];
  const colW = PDF_WIDTH / 3;
  return {
    h: 36,
    draw(yTop) {
      const top = yTop - 2;
      const boxH = 32;
      let stream = "";
      cells.forEach((cell, index) => {
        const x = PDF_LEFT + index * colW;
        stream += `${PDF_NAVY} rg ${x} ${(top - boxH).toFixed(1)} ${colW - 4} 14 re f\n`;
        stream += `BT /F2 8 Tf 1 1 1 rg 1 0 0 1 ${x + 6} ${(top - 11).toFixed(1)} Tm (${pdfEscape(cell[0])}) Tj ET\n`;
        const value = pdfLines(cell[1], 10, colW - 16)[0];
        stream += `BT /F1 10 Tf ${PDF_INK} rg 1 0 0 1 ${x + 6} ${(top - 26).toFixed(1)} Tm (${pdfEscape(value)}) Tj ET\n`;
      });
      return stream;
    },
  };
}

function pdfItems(report: IssueReport): PdfItem[] {
  const items: PdfItem[] = [
    pdfText(report.title, 18, PDF_NAVY, true, { before: 0, after: 4 }),
    pdfText(report.project, 13, PDF_INK, false, { before: 2, after: 2 }),
    pdfText(`Prepared ${report.preparedOn}`, 9, PDF_MUTED, false, { before: 2, after: 2 }),
    pdfRule(),
    pdfText(report.intro, 11, PDF_INK, false, { before: 8, after: 8 }),
    pdfFacts(report.facts),
    pdfCallout(report.summary),
    pdfText("Issues", 14, PDF_NAVY, true, { before: 16, after: 4 }),
    pdfRule(),
  ];
  report.issues.forEach((issue, index) => {
    const kicker = pdfText(`ISSUE ${index + 1}`, 8, PDF_BLUE, true, { before: 14, after: 1 });
    kicker.keepWithNext = true;
    const title = pdfText(issue.title, 13, PDF_NAVY, true, { before: 2, after: 6 });
    title.keepWithNext = true;
    items.push(kicker, title, pdfMeta(issue));
    for (const [label, text] of [
      ["WHY THIS IS AN ISSUE", issue.why],
      ["WHERE IT WAS FOUND", issue.where],
      ["FINDING", issue.finding],
    ] as const) {
      if (!text.trim()) continue;
      const heading = pdfText(label, 9, PDF_BLUE, true, { before: 8, after: 1 });
      heading.keepWithNext = true;
      items.push(heading, pdfText(text, 11, PDF_INK, false, { before: 1, after: 2 }));
    }
  });
  return items;
}

function paginate(items: PdfItem[]) {
  const room = 700 - 72;
  const pages: PdfItem[][] = [];
  let current: PdfItem[] = [];
  let used = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const partner = item.keepWithNext ? items[i + 1] : undefined;
    const need = item.h + (partner ? partner.h : 0);
    if (current.length && used + need > room) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += item.h;
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

function paintPage(items: PdfItem[], pageNo: number, pageCount: number, report: IssueReport) {
  const projectX = Math.max(PDF_LEFT + 140, PDF_RIGHT - pdfTextWidth(report.project, 8));
  let stream = `${PDF_BLUE} RG 1.2 w ${PDF_LEFT} 724 m ${PDF_RIGHT} 724 l S\n`;
  stream += `BT /F2 8 Tf ${PDF_BLUE} rg 1 0 0 1 ${PDF_LEFT} 734 Tm (${pdfEscape("TAX DUE DILIGENCE")}) Tj ET\n`;
  stream += `BT /F1 8 Tf ${PDF_MUTED} rg 1 0 0 1 ${projectX.toFixed(1)} 734 Tm (${pdfEscape(report.project)}) Tj ET\n`;
  stream += `${PDF_LINE} RG 0.6 w ${PDF_LEFT} 48 m ${PDF_RIGHT} 48 l S\n`;
  stream += `BT /F1 8 Tf ${PDF_MUTED} rg 1 0 0 1 ${PDF_LEFT} 34 Tm (${pdfEscape("Confidential")}) Tj ET\n`;
  const label = `Page ${pageNo} of ${pageCount}`;
  const labelX = PDF_RIGHT - pdfTextWidth(label, 8);
  stream += `BT /F1 8 Tf ${PDF_MUTED} rg 1 0 0 1 ${labelX.toFixed(1)} 34 Tm (${pdfEscape(label)}) Tj ET\n`;
  let y = 700;
  for (const item of items) {
    stream += item.draw(y);
    y -= item.h;
  }
  return stream;
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

export function issueReportPdf(report: IssueReport) {
  const pages = paginate(pdfItems(report));
  const objects = ["", "", "", "", ""];
  const firstPage = 5;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages
    .map((_, index) => `${firstPage + index * 2} 0 R`)
    .join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((items, index) => {
    const pageObj = firstPage + index * 2;
    const contentObj = pageObj + 1;
    const stream = paintPage(items, index + 1, pages.length, report);
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObj} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`;
  });
  const bytes = pdfBytes(objects);
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([copy], { type: "application/pdf" });
}

export function downloadIssueReport(filename: string, report: IssueReport, format: ReportFormat) {
  const blob = format === "pdf" ? issueReportPdf(report) : issueReportDocx(report);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}



