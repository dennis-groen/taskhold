import { AvatarGroup } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/user-avatar.tsx";
import { firstName, sharedWith, type Housemate } from "@/lib/shared-with.ts";

// More faces than this stop telling you who and start looking like a crowd
const MAX_FACES = 3;

/**
 * "Shared with Sam" plus their faces, under the title of anything the household shares. The faces
 * use the same tones as the initials on rows, so "SJ" on an item is recognisably Sam.
 */
export function SharedWithLine({ otherMembers }: { otherMembers: Housemate[] }) {
  return (
    <span className="inline-flex items-center gap-2">
      {otherMembers.length > 0 && (
        <AvatarGroup aria-hidden className="-space-x-1.5">
          {otherMembers.slice(0, MAX_FACES).map((person) => (
            <UserAvatar key={person.id} name={person.name} image={person.image} size="sm" />
          ))}
        </AvatarGroup>
      )}
      {sharedWith(otherMembers.map((person) => firstName(person.name)))}
    </span>
  );
}
