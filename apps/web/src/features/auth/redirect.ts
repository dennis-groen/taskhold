/** Only same-site paths, so a crafted link can't send people elsewhere after sign-in */
export function safeRedirect(value: unknown): string | undefined {
  // Browsers read a backslash as "/", so "/\evil.com" would leave the site as well as "//evil.com"
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : undefined;
}
