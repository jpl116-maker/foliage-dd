import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tracking-wide uppercase",
  {
    variants: {
      tone: {
        muted: "bg-paper-2 text-muted",
        forest: "bg-forest/10 text-forest",
        ok: "bg-ok/10 text-ok",
        warn: "bg-warn/10 text-warn",
        danger: "bg-danger/10 text-danger",
        info: "bg-info/10 text-info",
        ink: "bg-ink text-paper",
        paper: "bg-paper text-ink",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
