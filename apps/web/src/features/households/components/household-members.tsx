import type { ReactNode } from "react";

import { UserAvatar } from "@/components/user-avatar.tsx";

import type { HouseholdMember } from "../households.api.ts";

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
    <ul className="divide-y rounded-xl border">
      {members.map((member) => (
        <li key={member.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
          <UserAvatar name={member.name} image={member.image} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {member.name}
              {member.id === currentUserId && (
                <span className="font-normal text-muted-foreground"> (you)</span>
              )}
            </span>
            <span className="block text-sm text-muted-foreground">
              {member.role === "owner" ? "Owner" : "Member"}
            </span>
          </span>
          {renderAction?.(member)}
        </li>
      ))}
    </ul>
  );
}
