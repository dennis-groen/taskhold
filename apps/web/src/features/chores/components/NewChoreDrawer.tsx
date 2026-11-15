import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactElement } from "react";

import { cn } from "cn";

import { SHEET_BODY, SheetContent, SheetHeader } from "@/components/layout/Sheet.tsx";
import { Drawer, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

import { createChore } from "../chores.api.ts";
import { choreKeys } from "../chores.queries.ts";
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
  const queryClient = useQueryClient();

  async function create(input: Parameters<typeof createChore>[0]) {
    await createChore(input);
    await queryClient.invalidateQueries({ queryKey: choreKeys.list() });
    setOpen(false);
  }

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
              onSubmit={create}
            />
          )}
        </div>
      </SheetContent>
    </Drawer>
  );
}
