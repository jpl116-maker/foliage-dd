import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleRoute } from "@/components/auth/role-provider";
import { UsersDirectory } from "@/components/dashboard/users-directory";

export const Route = createFileRoute("/users")({ component: UsersPage });

function UsersPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-paper text-ink">
      <header className="border-b border-border">
        <div className="h-0.5 bg-forest" />
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="font-display text-2xl tracking-tight text-ink">
            Foliage
          </Link>
        </div>
      </header>
      <RoleRoute action="manageUsers">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <UsersDirectory className="mt-0" defaultOpen />
        </div>
      </RoleRoute>
    </div>
  );
}
