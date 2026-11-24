import type { ReactNode } from "react";

import { BackLink } from "@/components/BackLink.tsx";

import { CompactHeader } from "./AreaHeader.tsx";

/**
 * A page behind a row on the Household page (Account, Notifications, Appearance): the compact
 * slab with the way back, and the page's groups under it
 */
export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <CompactHeader back={<BackLink to="/household" label="Household" onSlab />} title={title} />
      <div className="pt-2">{children}</div>
    </>
  );
}

/** A quiet line under a group, for what the rows above it don't say */
export function GroupNote({ children }: { children: ReactNode }) {
  return <p className="px-1 pt-2 text-[0.8125rem] text-pretty text-muted-foreground">{children}</p>;
}
