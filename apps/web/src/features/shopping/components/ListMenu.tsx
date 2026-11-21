import { useId, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { PencilSimpleIcon, TrashIcon } from "@/components/icons.ts";
import { SHEET_BODY, SheetContent, SheetHeader } from "@/components/layout/Sheet.tsx";
import { MoreMenu } from "@/components/MoreMenu.tsx";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

import { useManageLists } from "../shopping.hooks.ts";

type ListInfo = { id: string; name: string; itemCount: number };

/**
 * A list's ⋯ menu: Rename list opens a sheet, Delete list… asks first. On a list row in the
 * overview, and on the open list's bar.
 */
export function ListMenu({
  list,
  onSlab = false,
  beforeDelete,
  className,
}: {
  list: ListInfo;
  onSlab?: boolean;
  className?: string;
  /** Runs before the list goes, e.g. leaving its page so it doesn't look for what's gone */
  beforeDelete?: () => Promise<void>;
}) {
  const { remove } = useManageLists();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const count = list.itemCount;

  return (
    <>
      <MoreMenu
        label={`More for ${list.name}`}
        onSlab={onSlab}
        className={className}
        items={[
          { label: "Rename list", icon: PencilSimpleIcon, onSelect: () => setRenaming(true) },
          {
            label: "Delete list…",
            icon: TrashIcon,
            danger: true,
            onSelect: () => setDeleting(true),
          },
        ]}
      />

      <Drawer open={renaming} onOpenChange={setRenaming}>
        <SheetContent>
          <SheetHeader>
            <DrawerTitle>Rename list</DrawerTitle>
            <DrawerDescription>Everyone in your household sees the new name.</DrawerDescription>
          </SheetHeader>
          {/* Mounted only while open, so it starts from the current name each time */}
          {renaming && <RenameForm list={list} onDone={() => setRenaming(false)} />}
        </SheetContent>
      </Drawer>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${list.name}?`}
        description={
          count === 0
            ? "The list goes away for everyone in your household."
            : `The list and its ${count === 1 ? "item" : `${count} items`} go away for everyone in your household.`
        }
        confirmLabel="Delete list"
        destructive
        onConfirm={async () => {
          await beforeDelete?.();
          // Gone from the overview straight away, and sent once there is a connection
          remove(list.id);
        }}
      />
    </>
  );
}

function RenameForm({ list, onDone }: { list: ListInfo; onDone: () => void }) {
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
          className="h-14 rounded-2xl border-0 bg-muted px-4 text-[1.0625rem] md:text-[1.0625rem]"
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
