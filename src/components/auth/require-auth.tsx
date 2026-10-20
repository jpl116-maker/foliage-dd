import type { ReactNode } from "react";
import { RoleProvider } from "@/components/auth/role-provider";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper">
        <div className="h-8 w-40 animate-pulse rounded-md bg-paper-2" />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <RoleProvider>{children}</RoleProvider>;
}