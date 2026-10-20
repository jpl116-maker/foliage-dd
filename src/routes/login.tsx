import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { claimSignupRole, ensureNamedAdmin } from "@/lib/roles-db";
import { cn } from "@/lib/utils";
import {
  authErrorMessage,
  passwordIssue,
  usernameIssue,
  usernameToEmail,
} from "@/lib/folia-username";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accountType, setAccountType] = useState<"client" | "reviewer">("client");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void ensureNamedAdmin();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const nameIssue = usernameIssue(username);
    if (nameIssue) {
      setError(nameIssue);
      return;
    }
    const passIssue = passwordIssue(password);
    if (passIssue) {
      setError(passIssue);
      return;
    }
    if (mode === "up" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!authEnabled) {
      setError("Sign-in is disabled.");
      return;
    }
    setBusy(true);
    try {
      const email = usernameToEmail(username);
      if (mode === "up") {
        const { error: signUpError } = await authClient.signUp.email({
          email,
          password,
          name: username.trim(),
        });
        if (signUpError) {
          throw new Error(signUpError.message ?? "Could not create account");
        }
        if (accountType === "reviewer") {
          await claimSignupRole({
            data: { role: "reviewer", keyword: keyword.trim() },
          });
        }
        toast("Account created");
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email,
          password,
        });
        if (signInError) {
          throw new Error(signInError.message ?? "Could not sign in");
        }
      }
      await authClient.getSession();
      await navigate({ to: "/" });
    } catch (err) {
      setError(
        authErrorMessage(
          err,
          mode === "up" ? "Could not create account" : "Could not sign in",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper">
        <div className="h-8 w-40 animate-pulse rounded-md bg-paper-2" />
      </main>
    );
  }
  if (user) return <Navigate to="/" />;

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="font-display text-3xl tracking-tight text-ink">Foliage</p>
        <h1 className="mt-2 font-display text-2xl tracking-tight text-ink">
          {mode === "in" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "in"
            ? "Use your username and password to open this matter."
            : "Usernames must be unique. Client is the default. Reviewer needs the confirmation keyword. Password is at least 8 characters."}
        </p>

        {!authEnabled ? (
          <p className="mt-6 text-sm text-muted">Sign-in is disabled.</p>
        ) : (
          <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {mode === "up" ? (
              <div className="grid gap-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
            ) : null}
            {mode === "up" ? (
              <fieldset className="grid gap-2">
                <legend className="text-xs font-medium uppercase tracking-wide text-muted">
                  Account type
                </legend>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-paper-2 p-0.5">
                  {(["client", "reviewer"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAccountType(type)}
                      className={cn(
                        "h-11 rounded-sm text-sm font-medium capitalize",
                        accountType === type
                          ? "bg-surface text-ink shadow-[var(--shadow-border)]"
                          : "text-muted hover:text-ink",
                      )}
                      aria-pressed={accountType === type}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {mode === "up" && accountType === "reviewer" ? (
              <div className="grid gap-2">
                <Label htmlFor="keyword">User-Type Keyword Confirmation</Label>
                <Input
                  id="keyword"
                  autoComplete="off"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  required
                />
              </div>
            ) : null}
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy
                ? mode === "in"
                  ? "Signing in…"
                  : "Creating…"
                : mode === "in"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>
        )}

        <p className="mt-4 text-sm text-muted">
          {mode === "in" ? "Need an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-forest hover:underline"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setAccountType("client");
              setKeyword("");
              setError(null);
            }}
          >
            {mode === "in" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
