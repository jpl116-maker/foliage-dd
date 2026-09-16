export const DEFAULT_PROJECT_ID = "default";
export const DEFAULT_PROJECT_SLUG = "oakridge";

export type Project = {
  id: string;
  slug: string;
  name: string;
  clientName: string;
  portfolio: string;
  dueOn: string;
  workspace: "entity" | "asset";
};

export function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug;
}

export function isReservedSlug(slug: string) {
  return (
    slug === "login" ||
    slug === "api" ||
    slug === "users" ||
    slug === "data-room" ||
    slug === "issues" ||
    slug === "request-list" ||
    slug === "reit-tests" ||
    slug === "p"
  );
}

export function listScope(projectId: string, workspace: "entity" | "asset") {
  return `${projectId}::${workspace}`;
}

export function projectHome(slug: string) {
  return `/p/${slug}`;
}

export function projectHref(slug: string, path: string) {
  return `/p/${slug}${path}`;
}
