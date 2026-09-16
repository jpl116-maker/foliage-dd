import { Navigate } from "@tanstack/react-router";

export function RedirectHome() {
  return <Navigate to="/" />;
}
