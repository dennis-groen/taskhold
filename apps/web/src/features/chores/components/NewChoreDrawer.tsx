import { useRef, useState, type ReactElement } from "react";

import { cn } from "cn";

import { SHEET_BODY, SheetContent, SheetHeader } from "@/components/layout/Sheet.tsx";
import { Drawer, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

import { useManageChores } from "../chores.hooks.ts";
import { ChoreForm, type Member } from "./ChoreForm.tsx";

/** A sheet with an empty chore form, opened by `trigger` */
export function NewChoreDrawer({
  trigger,
  members,
  viewerId,
}: {
  trigger: ReactElement;
  members: Member[];
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const { add } = useManageChores(members);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger render={trigger} />
      <SheetContent initialFocus={nameRef}>
        <SheetHeader>
          <DrawerTitle>New chore</DrawerTitle>
          <DrawerDescription className="sr-only">
            Name the chore, choose how often it repeats, when it's due and who it's for.
          </DrawerDescription>
        </SheetHeader>
        <div className={cn("overflow-y-auto", SHEET_BODY)}>
          {/* Mounted only while open, so it starts fresh each time */}
          {open && (
            <ChoreForm
              members={members}
              viewerId={viewerId}
              submitLabel="Add chore"
              nameRef={nameRef}
              onSubmit={(input) => {
                // Shows in the list straight away; a failure shows on the page
                add(input);
                setOpen(false);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Drawer>
  );
}
