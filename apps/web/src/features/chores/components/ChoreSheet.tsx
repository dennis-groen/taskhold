import { useQuery } from "@tanstack/react-query";

import { SHEET_BODY, SheetContent, SheetHeader } from "@/components/layout/Sheet.tsx";
import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { SkipForwardIcon, SunHorizonIcon, TrashIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { daysBetween, dueLabel, pastDateLabel } from "@/lib/dates.ts";
import { cn } from "cn";

import { canPutOff, skip } from "@taskhold/api/chore-schedule";

import { repeatLabel, scheduleOf } from "../chore-dates.ts";
import type { Chore } from "../chores.api.ts";
import { useManageChores, usePutOff } from "../chores.hooks.ts";
import { choreQuery } from "../chores.queries.ts";
import { ChoreForm, type Member } from "./ChoreForm.tsx";

/**
 * A chore's details: put it off, change it, see who did it lately, take back the last time, or
 * delete it
 */
export function ChoreSheet({
  chore,
  members,
  viewer,
  today,
  onUndo,
  onClose,
}: {
  /** The chore to show; null keeps the sheet closed */
  chore: Chore | null;
  members: Member[];
  viewer: Viewer;
  today: string;
  onUndo: (choreId: string) => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={chore !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {chore && (
          <SheetBody
            // Fresh form state for each chore
            key={chore.id}
            chore={chore}
            members={members}
            viewer={viewer}
            today={today}
            onUndo={onUndo}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Drawer>
  );
}

function SheetBody({
  chore,
  members,
  viewer,
  today,
  onUndo,
  onClose,
}: {
  chore: Chore;
  members: Member[];
  viewer: Viewer;
  today: string;
  onUndo: (choreId: string) => void;
  onClose: () => void;
}) {
  const { save, remove } = useManageChores(members);
  const { data: detail, isPending } = useQuery(choreQuery(chore.id));
  const history = detail?.history ?? [];
  // "2 days overdue · Every week": what putting it off is measured against
  const due = !chore.done && chore.dueOn ? chore.dueOn : null;
  const overdue = due !== null && daysBetween(today, due) < 0;
  const repeats = chore.repeat && repeatLabel(chore.repeat);

  return (
    <>
      <SheetHeader>
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
      </SheetHeader>

      <div className={cn("overflow-y-auto", SHEET_BODY)}>
        <PutOff chore={chore} viewer={viewer} today={today} onDone={onClose} />

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
          viewerId={viewer.id}
          submitLabel="Save changes"
          onSubmit={(input) => {
            save(chore, input);
            onClose();
          }}
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
              onConfirm={async () => {
                // Gone from the list straight away, and sent once there is a connection
                remove(chore);
                onClose();
              }}
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
                      ? completion.completedBy.id === viewer.id
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

/** The person looking, as their skips are shown before the API answers */
type Viewer = { id: string; name: string };

/**
 * For a chore that can't be done now. Tomorrow (once it's due) moves the date and nothing else.
 * Skip this time (repeating chores) moves it one interval on and says so in the history, so
 * nobody has to tick it off when it wasn't done. Either one closes the sheet and offers Undo, and
 * waits on the device when there's no connection.
 */
function PutOff({
  chore,
  viewer,
  today,
  onDone,
}: {
  chore: Chore;
  viewer: Viewer;
  today: string;
  onDone: () => void;
}) {
  const putOff = usePutOff(viewer);

  const schedule = scheduleOf(chore);
  const day = Temporal.PlainDate.from(today);
  const canTomorrow = canPutOff(schedule, day);
  // Not when skipped already today: a second skip would change nothing, and Undo is in the history
  const canSkip = skip(schedule, day).kind === "moved";
  if (!canTomorrow && !canSkip) return null;

  const button = (how: PutOffHow, Icon: typeof SkipForwardIcon, label: string) => (
    <Button
      variant="outline"
      size="lg"
      onClick={() => {
        putOff[how](chore, today);
        onDone();
      }}
    >
      <Icon aria-hidden />
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
