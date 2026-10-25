import { UserAvatar } from "@/components/user-avatar.tsx";
import type { HouseholdMember } from "../households.api.ts";

export function HouseholdMembers({
  members,
  currentUserId,
}: {
  members: HouseholdMember[];
  currentUserId: string;
}) {
  return (
    <ul className="divide-y rounded-xl border">
      {members.map((member) => (
        <li key={member.id} className="flex items-center gap-3 px-4 py-3">
          <UserAvatar name={member.name} image={member.image} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {member.name}
            {member.id === currentUserId && (
              <span className="font-normal text-muted-foreground"> (you)</span>
            )}
          </span>
          <span className="text-sm text-muted-foreground">
            {member.role === "owner" ? "Owner" : "Member"}
          </span>
        </li>
      ))}
    </ul>
  );
}
