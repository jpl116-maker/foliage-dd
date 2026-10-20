import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function isStaleChunkError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch dynamically imported module")) return true;
  if (lower.includes("error loading dynamically imported module")) return true;
  if (lower.includes("importing a module script failed")) return true;
  if (lower.includes("unable to preload css")) return true;
  if (lower.includes("error loading chunk")) return true;
  if (lower.includes("loading chunk") && lower.includes("failed")) return true;
  if (lower.includes("reading 'component'") || lower.includes('reading "component"')) {
    return true;
  }
  if (lower.includes("reading 'default'") || lower.includes('reading "default"')) {
    return true;
  }
  // Safari: undefined is not an object (evaluating e[t].default)
  if (lower.includes("is not an object") && lower.includes(".default")) return true;
  if (lower.includes("is not an object") && lower.includes("['default']")) return true;
  if (lower.includes("is undefined") && lower.includes(".default")) return true;
  return false;
}

function looksLikeInternalTypeError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("is not an object") ||
    lower.includes("cannot read propert") ||
    lower.includes("is not a function") ||
    /evaluating ['"]?[a-z0-9_$[\].]+['"]?/i.test(message)
  );
}

function reloadApp() {
  try {
    sessionStorage.removeItem("folia-chunk-reload");
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const message = errorMessage(error);
  const stale = isStaleChunkError(message);
  const display = stale
    ? "This page loaded an outdated file. Reload to pick up the current version."
    : looksLikeInternalTypeError(message)
      ? FALLBACK_MESSAGE
      : message;

  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem("folia-chunk-reload")) return;
      sessionStorage.setItem("folia-chunk-reload", "1");
    } catch {
      if (window.location.search.includes("_r=")) return;
    }
    window.location.reload();
  }, [stale]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center text-ink">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-muted">{display}</p>
      <Button type="button" onClick={reloadApp}>
        Reload
      </Button>
    </main>
  );
}
