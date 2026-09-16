import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$slug/data-room")({
  component: DataRoomLayout,
});

function DataRoomLayout() {
  return <Outlet />;
}
