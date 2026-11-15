// What an invite code looks like. The web app bundles this file (@taskhold/api/invite-code) for
// the alphabet and length, so the join form accepts exactly what the API hands out.

/** No 0/O or 1/I, so codes survive being read aloud or typed from a screenshot */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  // 32 divides 256 evenly, so masking keeps every character equally likely
  return Array.from(bytes, (byte) => INVITE_CODE_ALPHABET[byte & 31]).join("");
}

/** Accepts "abcd-efgh", "ABCD EFGH" or "ABCDEFGH"; returns null if it can't be a code. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const char of code) {
    if (!INVITE_CODE_ALPHABET.includes(char)) return null;
  }
  return code;
}
