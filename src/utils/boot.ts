export interface BootSecurityCheck {
  allowed: boolean;
  error?: string;
  warning?: string;
}

const INSECURE_WARNING =
  "xpm-agent is running in insecure mode (ALLOW_INSECURE=true): every /pm2 route is unauthenticated.";

/**
 * The /pm2/start route is remote code execution by design, so the API must not
 * boot without a bearer token unless the operator explicitly opts out for
 * local development.
 */
export function checkBootSecurity(env: { AUTH_TOKEN?: string; ALLOW_INSECURE?: string }): BootSecurityCheck {
  const hasToken = typeof env.AUTH_TOKEN === "string" && env.AUTH_TOKEN.trim() !== "";
  if (hasToken) return { allowed: true };

  if (env.ALLOW_INSECURE === "true") {
    return { allowed: true, warning: INSECURE_WARNING };
  }

  return {
    allowed: false,
    error:
      "AUTH_TOKEN is not set. Set AUTH_TOKEN in .env (see .env.example), or set ALLOW_INSECURE=true for local development only.",
  };
}
