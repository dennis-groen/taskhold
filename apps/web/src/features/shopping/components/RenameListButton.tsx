import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";

import { PencilSimpleIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api.ts";

import { renameList, type ShoppingList } from "../shopping.api.ts";
import { shoppingKeys } from "../shopping.queries.ts";

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
      <DrawerContent className="mx-auto max-w-[640px]">
        <DrawerHeader className="px-5 pt-5 text-left">
          <DrawerTitle>Rename list</DrawerTitle>
          <DrawerDescription>Everyone in your household sees the new name.</DrawerDescription>
        </DrawerHeader>
        {/* Mounted only while open, so it starts from the current name each time */}
        {open && <RenameForm list={list} onDone={() => setOpen(false)} />}
      </DrawerContent>
    </Drawer>
  );
}

function RenameForm({ list, onDone }: { list: ShoppingList; onDone: () => void }) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const [name, setName] = useState(list.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the list a name.");
      return;
    }
    if (trimmed === list.name) {
      onDone();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await renameList(list.id, trimmed);
      queryClient.setQueryData(
        shoppingKeys.list(list.id),
        (current: ShoppingList | undefined) => current && { ...current, name: trimmed },
      );
      void queryClient.invalidateQueries({ queryKey: shoppingKeys.lists() });
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Couldn't rename the list. Check your connection and try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-6 px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
    >
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
      <Button type="submit" size="xl" disabled={pending}>
        {pending && <Spinner />}
        Save name
      </Button>
    </form>
  );
}
