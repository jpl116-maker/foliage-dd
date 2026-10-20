import { useEffect } from "react";
import { loadRequestList } from "@/lib/request-list-db";
import { useDdStore } from "@/lib/store";
import { useProject } from "@/components/project/project-provider";

export function RequestListSync() {
  const workspace = useDdStore((s) => s.workspace);
  const hydrateRequestList = useDdStore((s) => s.hydrateRequestList);
  const markRequestListReady = useDdStore((s) => s.markRequestListReady);
  const project = useProject();

  useEffect(() => {
    let cancelled = false;
    void loadRequestList({ data: { projectId: project.id, workspace } })
      .then((data) => {
        if (cancelled) return;
        if (data.empty) {
          markRequestListReady(true);
          return;
        }
        hydrateRequestList({
          categories: data.categories,
          requests: data.requests,
        });
      })
      .catch(() => {
        if (!cancelled) markRequestListReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, project.id, hydrateRequestList, markRequestListReady]);

  return null;
}
