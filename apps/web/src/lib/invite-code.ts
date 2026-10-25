export const INVITE_CODE_LENGTH = 8;

/** Characters the API uses for codes (no 0/O or 1/I), in either case */
export const INVITE_CODE_PATTERN = "^[A-HJ-NP-Za-hj-np-z2-9]*$";

/** Pulls a code out of whatever was pasted: "fqvh-79zk", "FQVH 79ZK" or a full invite link. */
export function extractInviteCode(input: string): string {
  const fromLink = /\/join\/([^/?#\s]+)/i.exec(input)?.[1] ?? input;
  return fromLink
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .slice(0, INVITE_CODE_LENGTH);
}

/** "FQVH79ZK" -> "FQVH-79ZK", the way codes are shown and shared */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/join/${formatInviteCode(code)}`;
}
