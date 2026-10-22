import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertProjectAccess } from "@/lib/projects-db";
import { roomRoot, type WorkspaceId } from "@/lib/workspace";

const workspaceSchema = z.enum(["entity", "asset"]);

export type AskRoomFile = {
  id: string;
  name: string;
  folderId: string;
  folderName: string;
};

type CatalogFile = AskRoomFile & { mimeType: string };

type ModelJson = {
  answer?: string | null;
  read?: string[];
  open?: string[];
};

function parseModelJson(raw: string): ModelJson {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return { answer: trimmed || null };
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1)) as ModelJson;
    return {
      answer: typeof value.answer === "string" ? value.answer : value.answer ?? null,
      read: Array.isArray(value.read) ? value.read.filter((id) => typeof id === "string") : [],
      open: Array.isArray(value.open) ? value.open.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return { answer: trimmed || null };
  }
}

async function complete(apiKey: string, system: string, user: string, maxTokens: number) {
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
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  let res = await send(true);
  if (res.status === 400) res = await send(false);
  if (!res.ok) throw new Error(`xAI API error ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  return body.choices?.[0]?.message?.content ?? "";
}

async function catalogFor(projectId: string, workspace: WorkspaceId): Promise<CatalogFile[]> {
  const { ensureProjectRoom } = await import("@/lib/data-room");
  await ensureProjectRoom(projectId);
  const { getSql } = await import("@/lib/db");
  const q = await getSql();
  const folders = await q<{ id: string; parent_id: string | null; name: string }>`
    select id, parent_id, name from data_room_folders where project_id = ${projectId}
  `;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parent_id) continue;
    const list = children.get(folder.parent_id) ?? [];
    list.push(folder.id);
    children.set(folder.parent_id, list);
  }
  const inRoom = new Set<string>();
  const stack = [roomRoot(projectId, workspace)];
  while (stack.length) {
    const id = stack.pop();
    if (!id || inRoom.has(id)) continue;
    inRoom.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  function folderPath(id: string) {
    const parts: string[] = [];
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return parts.join(" / ");
  }
  const files = await q<{
    id: string;
    name: string;
    mime_type: string;
    folder_id: string;
  }>`
    select f.id, f.name, f.mime_type, f.folder_id
    from data_room_files f
    join data_room_folders d on d.id = f.folder_id
    where d.project_id = ${projectId}
      and coalesce(f.ready, true) = true
    order by f.name
  `;
  return files
    .filter((file) => inRoom.has(file.folder_id))
    .map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mime_type,
      folderId: file.folder_id,
      folderName: folderPath(file.folder_id),
    }));
}

export const askDataRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      projectId: z.string().min(1).max(80),
      workspace: workspaceSchema,
      prompt: z.string().trim().min(1).max(2000),
    }),
  )
  .handler(async ({ context, data }) => {
    await assertProjectAccess(context.userId, data.projectId);
    const files = await catalogFor(data.projectId, data.workspace);
    if (files.length === 0) {
      return {
        ok: true as const,
        text: "This data room has no files yet.",
        files: [] as AskRoomFile[],
      };
    }
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not available right now." };
    }

    const byId = new Map(files.map((file) => [file.id, file]));
    const listed = files.slice(0, 300);
    const catalogText = listed
      .map((file) => `${file.id}\t${file.folderName}\t${file.name}`)
      .join("\n");
    const more =
      files.length > listed.length
        ? `\n${files.length - listed.length} more files are not listed.`
        : "";

    let first: ModelJson;
    try {
      const raw = await complete(
        apiKey,
        `You answer questions about one due diligence data room. Reply with JSON only: {"answer": string or null, "read": string[], "open": string[]}. read is up to 6 catalog ids whose full text you need, most relevant first. Use an empty read list only when names and folders are enough. open is the ids the user should see opened in the data room. Never invent ids. Catalog columns are id, folder, name:\n${catalogText}${more}`,
        data.prompt,
        500,
      );
      first = parseModelJson(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reach Grok";
      return { ok: false as const, error: message };
    }

    const readIds = [...new Set(first.read ?? [])]
      .filter((id) => byId.has(id))
      .slice(0, 6);

    let answer = first.answer?.trim() || "";
    let openIds = first.open ?? [];

    if (readIds.length > 0) {
      const { readFileBytes } = await import("@/lib/data-room");
      const { extractRoomText } = await import("@/lib/room-text.server");
      const blocks: string[] = [];
      let remaining = 240_000;
      for (const id of readIds) {
        const file = byId.get(id);
        if (!file || remaining <= 0) continue;
        try {
          const stored = await readFileBytes(id, context.userId);
          let text = await extractRoomText(stored.name, stored.mimeType, stored.bytes);
          if (!text) text = "(no readable text)";
          if (text.length > remaining) {
            text = `${text.slice(0, remaining)}\n[remainder of this file was not sent]`;
          }
          remaining -= text.length;
          blocks.push(`FILE ${file.id}\n${file.folderName} / ${file.name}\n${text}`);
        } catch {
          blocks.push(`FILE ${file.id}\n${file.name}\n(could not read this file)`);
        }
      }
      try {
        const raw = await complete(
          apiKey,
          `Reply with JSON only: {"answer": string, "open": string[]}. answer is plain prose for a diligence reviewer. Each FILE block is the full extracted text of that data-room file, not an excerpt or sample. Use facts that appear anywhere in that text. Do not say the file or an excerpt lacks information that is present in the text. open lists catalog ids to show in the file viewer, including files the user asked to open and files the answer relies on. Allowed ids: ${files.map((file) => file.id).slice(0, 300).join(", ")}`,
          `Question: ${data.prompt}\n\n${blocks.join("\n\n")}`,
          1200,
        );
        const second = parseModelJson(raw);
        if (second.answer?.trim()) answer = second.answer.trim();
        if (second.open?.length) openIds = second.open;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not reach Grok";
        return { ok: false as const, error: message };
      }
    }

    const opened: AskRoomFile[] = [];
    const seen = new Set<string>();
    for (const id of [...openIds, ...readIds]) {
      if (seen.has(id)) continue;
      const file = byId.get(id);
      if (!file) continue;
      seen.add(id);
      opened.push({
        id: file.id,
        name: file.name,
        folderId: file.folderId,
        folderName: file.folderName,
      });
    }

    return {
      ok: true as const,
      text: answer || "I could not find an answer in this data room.",
      files: opened,
    };
  });
