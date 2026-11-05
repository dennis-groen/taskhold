import { TrashIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { pastDateLabel } from "@/lib/dates.ts";

import { deleteChore, updateChore, type Chore, type ChoreInput } from "../chores.api.ts";
import { choreKeys, choreQuery } from "../chores.queries.ts";
import { ChoreForm, type Member } from "./ChoreForm.tsx";

/** A chore's details: change it, see who did it lately, take back the last time, or delete it */
export function ChoreSheet({
  chore,
  members,
  viewerId,
  today,
  onUndo,
  onClose,
}: {
  /** The chore to show; null keeps the sheet closed */
  chore: Chore | null;
  members: Member[];
  viewerId: string;
  today: string;
  onUndo: (choreId: string) => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={chore !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-w-[640px]">
        {chore && (
          <SheetBody
            // Fresh form state for each chore
            key={chore.id}
            chore={chore}
            members={members}
            viewerId={viewerId}
            today={today}
            onUndo={onUndo}
            onClose={onClose}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function SheetBody({
  chore,
  members,
  viewerId,
  today,
  onUndo,
  onClose,
}: {
  chore: Chore;
  members: Member[];
  viewerId: string;
  today: string;
  onUndo: (choreId: string) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: detail, isPending } = useQuery(choreQuery(chore.id));
  const history = detail?.history ?? [];

  async function save(input: ChoreInput) {
    const updated = await updateChore(chore.id, input);
    queryClient.setQueryData(choreKeys.detail(chore.id), updated);
    await queryClient.invalidateQueries({ queryKey: choreKeys.list() });
    onClose();
  }

  async function remove() {
    await deleteChore(chore.id);
    queryClient.removeQueries({ queryKey: choreKeys.detail(chore.id) });
    await queryClient.invalidateQueries({ queryKey: choreKeys.list() });
    onClose();
  }

  return (
    <>
      <DrawerHeader className="px-5 pt-5 text-left">
        <DrawerTitle className="break-words">{chore.name}</DrawerTitle>
        <DrawerDescription className="sr-only">
          Change the chore, see who did it lately, or delete it.
        </DrawerDescription>
      </DrawerHeader>

      <div className="overflow-y-auto px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <ChoreForm
          // Starts over when an undo moves the due date, so saving can't put the old one back
          key={`${chore.dueOn}|${chore.lastCompletion?.id}`}
          initial={{
            name: chore.name,
            repeat: chore.repeat,
            dueOn: chore.dueOn,
            assigneeId: chore.assignee?.id ?? null,
          }}
          members={members}
          viewerId={viewerId}
          submitLabel="Save changes"
          onSubmit={save}
          footer={
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="xl">
                  <TrashIcon />
                  Delete
                </Button>
              }
              title={`Delete ${chore.name}?`}
              description="It goes for everyone in the household, with its history."
              confirmLabel="Delete chore"
              destructive
              onConfirm={remove}
            />
          }
        />

        <section className="mt-8" aria-label="History">
          <h3 className="text-sm font-semibold">Recently done</h3>
          {isPending ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : history.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Not done yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/80 overflow-hidden rounded-xl bg-card shadow-card">
              {history.map((completion, index) => (
                <li key={completion.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 text-sm">
                    {completion.completedBy
                      ? completion.completedBy.id === viewerId
                        ? "You"
                        : completion.completedBy.name
                      : "Someone who left"}
                    <span className="text-muted-foreground">
                      {" "}
                      · {pastDateLabel(completion.completedOn, today)}
                    </span>
                  </span>
                  {/* Only the most recent time can be taken back */}
                  {index === 0 && (
                    <Button variant="soft" size="sm" onClick={() => onUndo(chore.id)}>
                      Undo
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
