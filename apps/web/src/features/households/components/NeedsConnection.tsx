import { CloudSlashIcon } from "@phosphor-icons/react";

import { PageHeading } from "@/components/layout/PageHeading.tsx";

/**
 * In place of a household page that needs the server (members' roles, the invite code, account
 * settings) while the app is open from the copy on the device
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
      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-muted px-4 py-3.5 text-muted-foreground">
        <CloudSlashIcon className="mt-0.5 size-5 shrink-0" weight="duotone" aria-hidden />
        <p className="text-pretty">
          You're offline. This page comes back as soon as you're connected. Your lists, chores and
          to-dos work in the meantime.
        </p>
      </div>
    </>
  );
}
