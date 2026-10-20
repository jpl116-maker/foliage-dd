import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUserId } from "@/lib/auth/verify.server";

export async function requireRequestUser(request: Request): Promise<string> {
  assertSameSiteRequest();
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : undefined;
  return requireUserId(bearer);
}
