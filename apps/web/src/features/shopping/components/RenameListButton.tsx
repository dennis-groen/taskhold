import { useId, useState, type FormEvent } from "react";

import { cn } from "cn";

import { SHEET_BODY, SheetContent, SheetHeader } from "@/components/layout/Sheet.tsx";
import { PencilSimpleIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ShoppingList } from "../shopping.api.ts";
import { useManageLists } from "../shopping.hooks.ts";

/** Opens a sheet to change the list's name, for everyone in the household */
export function RenameListButton({ list }: { list: ShoppingList }) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={
          <Button variant="ghost" size="lg" className="-ml-1 text-muted-foreground">
            <PencilSimpleIcon />
            Rename list
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader>
          <DrawerTitle>Rename list</DrawerTitle>
          <DrawerDescription>Everyone in your household sees the new name.</DrawerDescription>
        </SheetHeader>
        {/* Mounted only while open, so it starts from the current name each time */}
        {open && <RenameForm list={list} onDone={() => setOpen(false)} />}
      </SheetContent>
    </Drawer>
  );
}

function RenameForm({ list, onDone }: { list: ShoppingList; onDone: () => void }) {
  const { rename } = useManageLists();
  const nameId = useId();
  const [name, setName] = useState(list.name);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the list a name.");
      return;
    }
    // Shows straight away and is sent once there is a connection; a failure shows a notice
    if (trimmed !== list.name) rename(list.id, trimmed);
    onDone();
  }

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-6", SHEET_BODY)}>
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          autoComplete="off"
          enterKeyHint="done"
          className="h-12 rounded-xl px-4 text-base md:text-base"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="xl">
        Save name
      </Button>
    </form>
  );
}
