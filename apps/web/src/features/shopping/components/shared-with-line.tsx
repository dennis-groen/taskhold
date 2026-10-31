import { sharedWith } from "@/lib/shared-with.ts";

/** "Shared with Sam ●", under the title of anything the household shares */
export function SharedWithLine({ otherMembers }: { otherMembers: string[] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {sharedWith(otherMembers)}
      {otherMembers.length > 0 && <span className="size-2 rounded-full bg-primary" aria-hidden />}
    </span>
  );
}
