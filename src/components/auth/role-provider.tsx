import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate } from "@tanstack/react-router";
import { getMyRole } from "@/lib/roles-db";
import { can, type FoliaRole, type RoleAction } from "@/lib/roles";
import { useCurrentUser } from "@/lib/auth/use-current-user";

type RoleContextValue = {
  role: FoliaRole;
  realRole: FoliaRole;
  siteRole: FoliaRole;
  ready: boolean;
  can: (action: RoleAction) => boolean;
  setViewAs: (role: FoliaRole) => void;
  setProjectRole: (role: FoliaRole | null) => void;
  refresh: () => void;
};

const RoleContext = createContext<RoleContextValue>({
  role: "client",
  realRole: "client",
  siteRole: "client",
  ready: false,
  can: () => false,
  setViewAs: () => {},
  setProjectRole: () => {},
  refresh: () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [realRole, setRealRole] = useState<FoliaRole>("client");
  const [projectRole, setProjectRole] = useState<FoliaRole | null>(null);
  const [viewAs, setViewAs] = useState<FoliaRole | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) {
      setReady(false);
      return;
    }
    let cancelled = false;
    void getMyRole()
      .then((next) => {
        if (cancelled) return;
        setRealRole(next);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRealRole("client");
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, tick]);

  const siteRole = realRole;
  const baseRole = projectRole ?? realRole;
  const role = (siteRole === "admin" || projectRole === "admin") && viewAs ? viewAs : baseRole;

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      realRole: baseRole,
      siteRole,
      ready,
      can: (action) => can(role, action),
      setViewAs: (next) => {
        if (siteRole !== "admin" && projectRole !== "admin") return;
        setViewAs(next === baseRole ? null : next);
      },
      setProjectRole,
      refresh: () => setTick((n) => n + 1),
    }),
    [role, baseRole, siteRole, projectRole, ready],
  );

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper">
        <div className="h-8 w-40 animate-pulse rounded-md bg-paper-2" />
      </div>
    );
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

export function RoleRoute({
  action,
  children,
}: {
  action: RoleAction;
  children: ReactNode;
}) {
  const { ready, can: allowed } = useRole();
  if (!ready) return null;
  if (!allowed(action)) return <Navigate to="/" />;
  return <>{children}</>;
}
