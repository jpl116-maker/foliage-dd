import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DataRoomBrowser } from "@/components/data-room/browser";
import { useProject } from "@/components/project/project-provider";
import { listFolder, type RoomListing } from "@/lib/data-room";
import { useDdStore } from "@/lib/store";
import { roomRoot } from "@/lib/workspace";

export const Route = createFileRoute("/p/$slug/data-room/")({
  component: DataRoomRoot,
  pendingComponent: DataRoomPending,
});

function DataRoomRoot() {
  const { id: projectId } = useProject();
  const workspace = useDdStore((s) => s.workspace);
  const [listing, setListing] = useState<RoomListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setListing(null);
    setError(null);
    void listFolder({ data: { folderId: roomRoot(projectId, workspace) } })
      .then((row) => {
        if (!cancelled) setListing(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open the data room");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, workspace]);

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-muted">{error}</div>
    );
  }
  if (!listing) return <DataRoomPending />;
  return <DataRoomBrowser listing={listing} />;
}

function DataRoomPending() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-muted">
      Opening the data room…
    </div>
  );
}
