import { useRef, useState, type ReactElement } from "react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

import { useTodos } from "../hooks/use-todos.ts";
import { TodoForm } from "./todo-form.tsx";

/** A sheet with an empty to-do form, opened by `trigger` */
export function NewTodoDrawer({ trigger }: { trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const { add } = useTodos();

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger render={trigger} />
      <DrawerContent className="mx-auto max-w-[640px]" initialFocus={nameRef}>
        <DrawerHeader className="px-5 pt-5 text-left">
          <DrawerTitle>New to-do</DrawerTitle>
          <DrawerDescription>Only you can see this.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
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
      </DrawerContent>
    </Drawer>
  );
}
