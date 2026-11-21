import { UserAvatar } from "@/components/UserAvatar.tsx";
import { firstName, sharedWith, type Housemate } from "@/lib/shared-with.ts";
import { cn } from "cn";

// More faces than this stop telling you who and start looking like a crowd
const MAX_FACES = 4;

/**
 * Who shares this: housemates' faces, overlapping with a ring in the colour behind them. On a
 * slab the faces stand alone and the words are for screen readers; elsewhere the words show too.
 */
export function SharedWithLine({
  otherMembers,
  onSlab = false,
  className,
}: {
  otherMembers: Housemate[];
  onSlab?: boolean;
  className?: string;
}) {
  const words = sharedWith(otherMembers.map((person) => firstName(person.name)));
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {otherMembers.length > 0 && (
        <span aria-hidden className="flex p-0.5">
          {otherMembers.slice(0, MAX_FACES).map((person, index) => (
            <UserAvatar
              key={person.id}
              name={person.name}
              image={person.image}
              className={cn(
                "size-7 ring-2",
                onSlab ? "ring-area" : "ring-background",
                index > 0 && "-ml-1.5",
              )}
            />
          ))}
        </span>
      )}
      <span className={onSlab ? "sr-only" : undefined}>{words}</span>
    </span>
  );
}
