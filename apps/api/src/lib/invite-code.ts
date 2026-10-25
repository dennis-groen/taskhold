// No 0/O or 1/I, so codes survive being read aloud or typed from a screenshot
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 8;

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  // 32 divides 256 evenly, so masking keeps every character equally likely
  return Array.from(bytes, (byte) => ALPHABET[byte & 31]).join("");
}

/** Accepts "abcd-efgh", "ABCD EFGH" or "ABCDEFGH"; returns null if it can't be a code. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== LENGTH) return null;
  for (const char of code) {
    if (!ALPHABET.includes(char)) return null;
  }
  return code;
}
