import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertProjectAccess } from "@/lib/projects-db";

const issueSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(240),
  summary: z.string().max(4000),
  code: z.string().max(160),
  status: z.string().max(40),
  severity: z.string().max(40),
  where: z.string().max(1000),
});

type Polished = { id: string; title: string; summary: string; finding: string };

function parsePolished(raw: string, allowed: Set<string>): Polished[] {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1)) as { issues?: unknown };
    if (!Array.isArray(value.issues)) return [];
    return value.issues.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      if (!allowed.has(id)) return [];
      return [
        {
          id,
          title: typeof row.title === "string" ? row.title.trim() : "",
          summary: typeof row.summary === "string" ? row.summary.trim() : "",
          finding: typeof row.finding === "string" ? row.finding.trim() : "",
        },
      ];
    });
  } catch {
    return [];
  }
}

export const polishIssueReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      client: z.string().max(160),
      target: z.string().max(160),
      deal: z.string().max(160),
      issues: z.array(issueSchema).max(60),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectAccess(context.userId, data.projectId);
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey || data.issues.length === 0) return { ok: true as const, issues: [] as Polished[] };

    const listed = data.issues
      .map(
        (issue) =>
          `ID ${issue.id}\nTitle: ${issue.title}\nSummary: ${issue.summary}\nCode: ${issue.code || "none"}\nStatus: ${issue.status}\nSeverity: ${issue.severity}\nWhere: ${issue.where}`,
      )
      .join("\n\n");
    const send = (jsonMode: boolean) =>
      fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.2,
          max_tokens: 8000,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: [
            {
              role: "system",
              content:
                'You prepare a tax due diligence issues report. Reply with JSON only: {"issues":[{"id":string,"title":string,"summary":string,"finding":string}]}. Return one object for every input id. title is the issue title with spelling, grammar, and punctuation corrected, and no new facts. summary is the tracker note with the same corrections, the same facts, and about the same length. It will be saved back to the issues list, so do not expand it. finding is the report paragraph. If the summary already says what is wrong and why it matters, finding is the corrected summary. If the summary is missing, fragmentary, or only a label, finding is two to four sentences that state the issue in plain prose. Use only the title, summary, code, status, severity, and where text. Do not invent amounts, dates, parties, or documents.',
            },
            {
              role: "user",
              content: `Client: ${data.client}\nTarget: ${data.target}\nTransaction: ${data.deal}\n\n${listed}`,
            },
          ],
        }),
      });

    let res = await send(true);
    if (res.status === 400) res = await send(false);
    if (!res.ok) return { ok: false as const, error: "Could not edit the issues." };
    const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const issues = parsePolished(body.choices?.[0]?.message?.content ?? "", new Set(data.issues.map((issue) => issue.id)));
    return { ok: true as const, issues };
  });
