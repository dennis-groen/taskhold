import { OfflineNote } from "@/components/layout/OfflineNote.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";

/**
 * In place of a household page that needs the server (members' roles, the invite code)
 * while the app is open from the copy on the device
 */
export function NeedsConnection({
  title,
  householdName,
}: {
  title: string;
  householdName: string;
}) {
  return (
    <>
      <PageHeading title={title}>{householdName}</PageHeading>
      <OfflineNote className="mt-8">
        You're offline. This page comes back as soon as you're connected. Your lists, chores and
        to-dos work in the meantime.
      </OfflineNote>
    </>
  );
}
