import type { ReactNode } from "react";

export type BadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "neutral"
  | "brand"
  | "role-empleado"
  | "role-gerente"
  | "role-administrador"
  | "role-dueno";

interface BadgeProps {
  tone: BadgeTone;
  initial?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone, initial, className = "", children }: BadgeProps) {
  return (
    <span className={`badge badge-${tone} ${className}`.trim()}>
      {initial !== undefined ? (
        <span className="badge-initial">{initial}</span>
      ) : (
        <span aria-hidden="true" className="badge-dot" />
      )}
      {children}
    </span>
  );
}

