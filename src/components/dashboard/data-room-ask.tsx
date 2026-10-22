import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/components/project/project-provider";
import { useRole } from "@/components/auth/role-provider";
import { askDataRoom, type AskRoomFile, type SearchIntensity } from "@/lib/data-room-ask";
import { useDdStore } from "@/lib/store";

export function DataRoomAsk() {
  const { can } = useRole();
  const { slug, id: projectId } = useProject();
  const workspace = useDdStore((s) => s.workspace);
  const [prompt, setPrompt] = useState("");
  const [intensity, setIntensity] = useState<SearchIntensity>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [files, setFiles] = useState<AskRoomFile[]>([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const question = prompt.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await askDataRoom({
        data: { projectId, workspace, prompt: question, intensity },
      });
      if (!result.ok) {
        setAnswer(null);
        setFiles([]);
        setError(result.error);
        return;
      }
      setAnswer(result.text);
      setFiles(result.files);
    } catch {
      setAnswer(null);
      setFiles([]);
      setError("Could not ask Grok. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!can("askDataRoom")) return null;

  return (
    <div className="mb-3">
      <form className="flex flex-wrap items-center gap-2" onSubmit={onSubmit}>
        <div className="relative min-w-[12rem] flex-1">
          <Sparkles
            className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-faint"
            strokeWidth={1.75}
          />
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask Grok about the data room"
            className="min-w-0 pl-10"
            aria-label="Ask Grok about the data room"
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="flex h-11 shrink-0 items-center gap-2 rounded-md bg-surface px-2.5 text-sm shadow-[var(--shadow-border)]">
          <label htmlFor="search-intensity" className="text-xs font-medium whitespace-nowrap text-muted">
            Search Intensity
          </label>
          <select
            id="search-intensity"
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as SearchIntensity)}
            disabled={busy}
            className="h-9 bg-transparent text-sm text-ink outline-none disabled:opacity-40"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <Button type="submit" disabled={busy || !prompt.trim()}>
          {busy ? "Asking…" : "Ask"}
        </Button>
      </form>
      {error || answer || files.length > 0 ? (
        <div className="mt-2 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {answer ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{answer}</p>
          ) : null}
          {files.length > 0 ? (
            <div className={answer || error ? "mt-3 border-t border-border pt-2" : ""}>
              <p className="pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                Open in the data room
              </p>
              <ul>
                {files.map((file) => (
                  <li key={file.id}>
                    <Link
                      to="/p/$slug/data-room/$folderId"
                      params={{ slug, folderId: file.folderId }}
                      search={{ file: file.id }}
                      className="flex min-h-11 items-center gap-3 py-1.5 hover:underline"
                    >
                      <FileText className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{file.name}</span>
                        <span className="block truncate text-xs text-faint">
                          {file.folderName}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
