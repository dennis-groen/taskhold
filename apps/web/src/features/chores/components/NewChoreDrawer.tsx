import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactElement } from "react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

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
      <DrawerContent className="mx-auto max-w-[640px]" initialFocus={nameRef}>
        <DrawerHeader className="px-5 pt-5 text-left">
          <DrawerTitle>New chore</DrawerTitle>
          <DrawerDescription className="sr-only">
            Name the chore, choose how often it repeats, when it's due and who it's for.
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
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
      </DrawerContent>
    </Drawer>
  );
}
