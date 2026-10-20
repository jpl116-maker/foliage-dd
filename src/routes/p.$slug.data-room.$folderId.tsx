import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DataRoomBrowser } from "@/components/data-room/browser";
import { listFolder } from "@/lib/data-room";

export const Route = createFileRoute("/p/$slug/data-room/$folderId")({
  validateSearch: z.object({
    file: z.string().optional(),
  }),
  loader: ({ params }) => listFolder({ data: { folderId: params.folderId } }),
  component: DataRoomFolder,
  pendingComponent: DataRoomPending,
});

function DataRoomFolder() {
  const listing = Route.useLoaderData();
  const { file } = Route.useSearch();
  return <DataRoomBrowser listing={listing} focusFileId={file} />;
}

function DataRoomPending() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-muted">
      Opening folder…
    </div>
  );
}
