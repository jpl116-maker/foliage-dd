import { useEffect } from "react";
import { loadIssues } from "@/lib/issues-db";
import { useDdStore } from "@/lib/store";
import { useProject } from "@/components/project/project-provider";

export function IssuesSync() {
  const workspace = useDdStore((s) => s.workspace);
  const hydrateIssues = useDdStore((s) => s.hydrateIssues);
  const project = useProject();

  useEffect(() => {
    let cancelled = false;
    void loadIssues({ data: { projectId: project.id, workspace } })
      .then((issues) => {
        if (!cancelled) hydrateIssues(issues);
      })
      .catch(() => {
        /* keep the in-memory list until the next successful load */
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, project.id, hydrateIssues]);

  return null;
}
