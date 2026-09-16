import { createFileRoute } from "@tanstack/react-router";
import { RedirectHome } from "@/components/redirect-home";

export const Route = createFileRoute("/reit-tests")({
  component: RedirectHome,
});
