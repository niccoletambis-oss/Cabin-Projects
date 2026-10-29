import { production } from "./environment";
export function securityHeaders(nonce: string) {
  return {
    "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin",
    "Permissions-Policy":
      "camera=(self), microphone=(), geolocation=(), payment=()",
    ...(production()
      ? { "Strict-Transport-Security": "max-age=31536000" }
      : {}),
  };
}
