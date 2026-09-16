import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-md bg-surface px-3 text-sm text-ink shadow-[var(--shadow-border)]",
      "placeholder:text-faint",
      "transition-[box-shadow] duration-150 ease-out",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest",
      "disabled:opacity-40",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
