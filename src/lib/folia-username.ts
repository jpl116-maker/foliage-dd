const EMAIL_DOMAIN = "users.folia";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string | null | undefined): string {
  if (!email) return "";
  const suffix = `@${EMAIL_DOMAIN}`;
  const lower = email.toLowerCase();
  if (lower.endsWith(suffix)) return email.slice(0, -suffix.length);
  return email;
}

export function usernameIssue(raw: string): string | null {
  const u = raw.trim();
  if (u.length < 3) return "Username must be at least 3 characters.";
  if (u.length > 32) return "Username must be 32 characters or fewer.";
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) {
    return "Use letters, numbers, periods, hyphens, or underscores.";
  }
  return null;
}

export function passwordIssue(raw: string): string | null {
  if (raw.length < 8) return "Password must be at least 8 characters.";
  if (raw.length > 72) return "Password is too long.";
  return null;
}

export function authErrorMessage(err: unknown, fallback: string): string {
  const text =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : err instanceof Error
        ? err.message
        : "";
  const lower = text.toLowerCase();
  if (lower.includes("already") || lower.includes("exists")) {
    return "That username is taken. Choose another.";
  }
  if (lower.includes("invalid") || lower.includes("password") || lower.includes("credential")) {
    return "Username or password is incorrect.";
  }
  return text || fallback;
}
