import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { RequireAuth } from "@/components/auth/require-auth";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Toaster } from "sonner";
import { CONTENT_SECURITY_POLICY } from "@/lib/content-security-policy";
import appCss from "../styles.css?url";

const APP_NAME = "Foliage";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#F7F7F8" },
      {
        httpEquiv: "Content-Security-Policy",
        content: CONTENT_SECURITY_POLICY,
      },
      {
        name: "description",
        content:
          "Foliage tracks tax due diligence — document review status and issues raised on the file.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
    scripts: [
      {
        children: `!function(){function n(e){e=String(e||"").toLowerCase();return e.indexOf("dynamically imported module")>=0||e.indexOf("importing a module script failed")>=0||e.indexOf("error loading chunk")>=0||e.indexOf("unable to preload")>=0||e.indexOf("reading 'default'")>=0||e.indexOf('reading "default"')>=0||e.indexOf("reading 'component'")>=0||e.indexOf('reading "component"')>=0||(e.indexOf("is not an object")>=0&&e.indexOf(".default")>=0)||(e.indexOf("is undefined")>=0&&e.indexOf(".default")>=0)}function r(){try{if(sessionStorage.getItem("folia-chunk-reload"))return;sessionStorage.setItem("folia-chunk-reload","1")}catch(e){if(/[?&]_r=/.test(location.search))return;var u=new URL(location.href);u.searchParams.set("_r",String(Date.now()));location.replace(u.toString());return}location.reload()}window.addEventListener("vite:preloadError",function(e){e.preventDefault();r()});window.addEventListener("unhandledrejection",function(e){var m=e&&e.reason&&e.reason.message||String(e&&e.reason||"");if(n(m)){e.preventDefault();r()}});window.addEventListener("error",function(e){var m=e&&e.message||e&&e.error&&e.error.message||"";if(n(m)){e.preventDefault();r()}})}();`,
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-paper text-ink">
        <PreviewHostBridge />
        <AuthProvider>
          <AppOutlet />
        </AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            className:
              "!bg-surface !text-ink !border-0 !shadow-[var(--shadow-border)] !font-sans",
          }}
        />
        <Scripts />
      </body>
    </html>
  );
}

function AppOutlet() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/login") return <Outlet />;
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}
