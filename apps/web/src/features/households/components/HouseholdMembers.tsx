import type { ReactNode } from "react";

import { CrownSimpleIcon } from "@/components/icons.ts";
import { UserAvatar } from "@/components/UserAvatar.tsx";

import type { HouseholdMember } from "../households.api.ts";

/** Member rows, for inside a Group: a face in their colour, their name, and whether they own it */
export function HouseholdMembers({
  members,
  currentUserId,
  renderAction,
}: {
  members: HouseholdMember[];
  currentUserId: string;
  /** Optional control at the end of a member's row, e.g. a remove button */
  renderAction?: (member: HouseholdMember) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-border">
      {members.map((member) => (
        <li key={member.id} className="flex min-h-15 items-center gap-3.5 py-2.5 pr-1 pl-4">
          <UserAvatar name={member.name} image={member.image} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[1.0625rem] font-[650]">
              <span className="truncate">{member.name}</span>
              {member.id === currentUserId && (
                <span className="shrink-0 rounded-md bg-muted px-[7px] py-0.5 text-xs font-bold text-muted-foreground">
                  You
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              {member.role === "owner" && (
                <CrownSimpleIcon aria-hidden weight="fill" className="size-3.5 text-area-fg" />
              )}
              {member.role === "owner" ? "Owner" : "Member"}
            </span>
          </span>
          {renderAction?.(member)}
        </li>
      ))}
    </ul>
  );
}
