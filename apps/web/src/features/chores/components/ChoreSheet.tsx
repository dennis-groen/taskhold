import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { SkipForwardIcon, SunHorizonIcon, TrashIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { daysBetween, dueLabel, pastDateLabel } from "@/lib/dates.ts";
import { changeFailed, offerUndo } from "@/lib/feedback.ts";
import { cn } from "cn";

import { repeatLabel } from "../chore-dates.ts";
import {
  deleteChore,
  skipChore,
  updateChore,
  type Chore,
  type ChoreDetail,
  type ChoreInput,
} from "../chores.api.ts";
import { choreKeys, choreQuery } from "../chores.queries.ts";
import { ChoreForm, type Member } from "./ChoreForm.tsx";

/**
 * A chore's details: put it off, change it, see who did it lately, take back the last time, or
 * delete it
 */
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
  // "2 days overdue · Every week": what putting it off is measured against
  const due = !chore.done && chore.dueOn ? chore.dueOn : null;
  const overdue = due !== null && daysBetween(today, due) < 0;
  const repeats = chore.repeat && repeatLabel(chore.repeat);

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
        <DrawerDescription className={cn(!due && !repeats && "sr-only")}>
          {due || repeats ? (
            <>
              {due && (
                <span className={cn(overdue && "font-semibold text-destructive")}>
                  {dueLabel(due, today)}
                </span>
              )}
              {due && repeats && " · "}
              {repeats}
            </>
          ) : (
            "Change the chore, see who did it lately, or delete it."
          )}
        </DrawerDescription>
      </DrawerHeader>

      <div className="overflow-y-auto px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <PutOff chore={chore} today={today} onUndoSkip={onUndo} onDone={onClose} />

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
          <h3 className="text-sm font-semibold">History</h3>
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
                      · {completion.skipped && "skipped "}
                      {pastDateLabel(completion.completedOn, today)}
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

type PutOffHow = "tomorrow" | "skip";

/**
 * For a chore that can't be done now. Tomorrow (once it's due) moves the date and nothing else.
 * Skip this time (repeating chores) moves it one interval on and says so in the history, so
 * nobody has to tick it off when it wasn't done. Either one closes the sheet and offers Undo.
 */
function PutOff({
  chore,
  today,
  onUndoSkip,
  onDone,
}: {
  chore: Chore;
  today: string;
  onUndoSkip: (choreId: string) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const tomorrow = Temporal.PlainDate.from(today).add({ days: 1 }).toString();

  async function show(updated: ChoreDetail) {
    queryClient.setQueryData(choreKeys.detail(updated.id), updated);
    await queryClient.invalidateQueries({ queryKey: choreKeys.list() });
  }

  const putOff = useMutation({
    mutationFn: (how: PutOffHow) =>
      how === "skip" ? skipChore(chore.id, today) : updateChore(chore.id, { dueOn: tomorrow }),
    onSuccess: async (updated, how) => {
      await show(updated);
      onDone();
      if (how === "tomorrow") {
        offerUndo(`${chore.name} moved to tomorrow.`, () => {
          // Puts back the date it had; the move isn't kept in the history
          updateChore(chore.id, { dueOn: chore.dueOn }).then(show, (err: unknown) =>
            changeFailed(err, "Couldn't undo that. Try again."),
          );
        });
      } else {
        const due = updated.dueOn ? ` ${dueLabel(updated.dueOn, today)}.` : "";
        offerUndo(`${chore.name} skipped.${due}`, () => onUndoSkip(chore.id));
      }
    },
    onError: (err) => changeFailed(err, "Couldn't move that. Check your connection and try again."),
  });

  const canTomorrow = !chore.done && chore.dueOn !== null && daysBetween(today, chore.dueOn) <= 0;
  // Skipped already today: a second skip would change nothing, and Undo is in the history
  const skippedToday = chore.lastCompletion?.skipped && chore.lastCompletion.completedOn === today;
  const canSkip = chore.repeat !== null && chore.dueOn !== null && !skippedToday;
  if (!canTomorrow && !canSkip) return null;

  const button = (how: PutOffHow, Icon: typeof SkipForwardIcon, label: string) => (
    <Button
      variant="outline"
      size="lg"
      disabled={putOff.isPending}
      onClick={() => putOff.mutate(how)}
    >
      {putOff.isPending && putOff.variables === how ? <Spinner /> : <Icon aria-hidden />}
      {label}
    </Button>
  );

  return (
    <fieldset className="mb-6 grid grid-cols-2 gap-2">
      <legend className="sr-only">Put it off</legend>
      {canTomorrow && button("tomorrow", SunHorizonIcon, "Tomorrow")}
      {canSkip && button("skip", SkipForwardIcon, "Skip this time")}
    </fieldset>
  );
}
