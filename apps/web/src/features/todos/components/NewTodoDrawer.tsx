import { useRef, useState, type ReactElement } from "react";

import { cn } from "cn";

import { SHEET_BODY, SheetContent, SheetHeader } from "@/components/layout/Sheet.tsx";
import { Drawer, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

import { useTodos } from "../todos.hooks.ts";
import { TodoForm } from "./TodoForm.tsx";

/** A sheet with an empty to-do form, opened by `trigger` */
export function NewTodoDrawer({ trigger }: { trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const { add } = useTodos();

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger render={trigger} />
      <SheetContent initialFocus={nameRef}>
        <SheetHeader>
          <DrawerTitle>New to-do</DrawerTitle>
          <DrawerDescription>Only you can see this.</DrawerDescription>
        </SheetHeader>
        <div className={cn("overflow-y-auto", SHEET_BODY)}>
          {/* Mounted only while open, so it starts fresh each time */}
          {open && (
            <TodoForm
              submitLabel="Add to-do"
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
