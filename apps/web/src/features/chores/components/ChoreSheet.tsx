import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import {
  SHEET_BODY,
  SHEET_ICON_BUTTON,
  SheetContent,
  SheetEyebrow,
} from "@/components/layout/Sheet.tsx";
import { BroomIcon, CheckIcon, PencilSimpleIcon } from "@/components/icons.ts";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { daysBetween, pastDateLabel, rowDueLabel, shortDate } from "@/lib/dates.ts";
import { firstName, type PersonSummary } from "@/lib/shared-with.ts";
import { cn } from "cn";

import { canPutOff, markDone, skip } from "@taskhold/api/chore-schedule";

import { repeatLabel, scheduleOf } from "../chore-dates.ts";
import type { Chore } from "../chores.api.ts";
import { useManageChores, usePutOff } from "../chores.hooks.ts";
import { choreQuery } from "../chores.queries.ts";
import { ChoreForm, type Member } from "./ChoreForm.tsx";

/** The newest time can be taken back for a day; after that the history stands */
const UNDO_WITHIN = Temporal.Duration.from({ hours: 24 });

/**
 * A chore, read first: when it's due, how it repeats, whose it is and when it was last done, with
 * Mark done under the thumb, Skip and Put off beside each other, and the history below. The
 * pencil turns the sheet into the form to change it.
 */
export function ChoreSheet({
  chore,
  members,
  viewer,
  today,
  onComplete,
  onUndo,
  onClose,
}: {
  /** The chore to show; null keeps the sheet closed */
  chore: Chore | null;
  members: Member[];
  viewer: PersonSummary;
  today: string;
  onComplete: (chore: Chore) => void;
  onUndo: (choreId: string) => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={chore !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {chore && (
          <SheetBody
            // Fresh state for each chore
            key={chore.id}
            chore={chore}
            members={members}
            viewer={viewer}
            today={today}
            onComplete={onComplete}
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
  onComplete,
  onUndo,
  onClose,
}: {
  chore: Chore;
  members: Member[];
  viewer: PersonSummary;
  today: string;
  onComplete: (chore: Chore) => void;
  onUndo: (choreId: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { save, remove } = useManageChores(members);

  return (
    <>
      <SheetEyebrow
        icon={BroomIcon}
        actions={
          !editing && (
            <button
              type="button"
              aria-label={`Change ${chore.name}`}
              onClick={() => setEditing(true)}
              className={SHEET_ICON_BUTTON}
            >
              <PencilSimpleIcon weight="bold" className="size-5" />
            </button>
          )
        }
      >
        {editing ? "Change chore" : "Chore · shared"}
      </SheetEyebrow>

      {editing ? (
        <div className={cn("overflow-y-auto", SHEET_BODY)}>
          <DrawerTitle className="sr-only">Change {chore.name}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Everyone in the household sees the change.
          </DrawerDescription>
          <ChoreForm
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
              setEditing(false);
            }}
            footer={
              <Button
                variant="secondary"
                size="xl"
                onClick={() => {
                  // Gone from the list straight away, with a moment to undo before it's deleted
                  remove(chore);
                  onClose();
                }}
              >
                Delete chore
              </Button>
            }
          />
        </div>
      ) : (
        <ReadView
          chore={chore}
          viewer={viewer}
          today={today}
          onComplete={() => onComplete(chore)}
          onUndo={() => onUndo(chore.id)}
          onClose={onClose}
        />
      )}
    </>
  );
}

function ReadView({
  chore,
  viewer,
  today,
  onComplete,
  onUndo,
  onClose,
}: {
  chore: Chore;
  viewer: PersonSummary;
  today: string;
  onComplete: () => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  const putOff = usePutOff(viewer);
  const { data: detail, isPending } = useQuery(choreQuery(chore.id));
  const history = detail?.history ?? [];
  const schedule = scheduleOf(chore);
  const day = Temporal.PlainDate.from(today);
  const marking = markDone(schedule, day);
  const skipping = skip(schedule, day);
  const canTomorrow = canPutOff(schedule, day);
  const due = !chore.done && chore.dueOn ? chore.dueOn : null;
  const late = due !== null && daysBetween(today, due) < 0;
  const last = chore.lastCompletion;
  const who = (person: { id: string; name: string } | null | undefined) =>
    person ? (person.id === viewer.id ? "You" : firstName(person.name)) : "Someone who left";

  return (
    <div className={cn("overflow-y-auto", SHEET_BODY, "pt-1")}>
      <DrawerTitle className="text-[2rem] leading-[1.05] break-words">{chore.name}</DrawerTitle>
      <DrawerDescription className="sr-only">
        When it's due, who it's for, and who did it lately.
      </DrawerDescription>

      <dl className="mt-5 grid grid-cols-2 gap-2">
        <Fact label="Due">
          {chore.done ? (
            "Done"
          ) : due ? (
            <span className={cn(late && "text-destructive")}>
              {rowDueLabel(due, today) ?? "Today"}
            </span>
          ) : (
            "No date"
          )}
        </Fact>
        <Fact label="Repeat">{chore.repeat ? repeatLabel(chore.repeat) : "Once"}</Fact>
        <Fact label="Assigned to">
          {chore.assignee ? (
            <span className="flex items-center gap-2">
              <UserAvatar
                name={chore.assignee.name}
                image={chore.assignee.image}
                size="sm"
                className="data-[size=sm]:size-6"
              />
              <span className="truncate">{who(chore.assignee)}</span>
            </span>
          ) : (
            "Anyone"
          )}
        </Fact>
        <Fact label="Last done">
          {last && !last.skipped ? (
            <span className="first-letter:uppercase">{pastDateLabel(last.completedOn, today)}</span>
          ) : (
            "Not yet"
          )}
        </Fact>
      </dl>

      <div className="mt-5">
        {marking.kind === "done" ? (
          <Button
            size="xl"
            className="h-auto min-h-16 w-full flex-col gap-0 rounded-2xl py-2.5"
            onClick={() => {
              onComplete();
              onClose();
            }}
          >
            <span className="flex items-center gap-2 text-[1.0625rem] font-[750]">
              <CheckIcon weight="bold" aria-hidden className="size-5" />
              Mark done
            </span>
            {marking.dueOn && (
              <span className="text-[0.8125rem] font-medium opacity-80">
                Next due {shortDate(marking.dueOn.toString())}
              </span>
            )}
          </Button>
        ) : (
          <div className="flex min-h-16 flex-col items-center justify-center rounded-2xl bg-area-tint px-4 py-2.5 text-center">
            <span className="flex items-center gap-2 font-[750] text-area-fg">
              <CheckIcon weight="bold" aria-hidden className="size-5" />
              Done today
            </span>
            <span className="text-[0.8125rem] text-muted-foreground">
              Marking it again changes nothing
            </span>
          </div>
        )}

        {(skipping.kind === "moved" || canTomorrow) && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {skipping.kind === "moved" && (
                <TwoLineButton
                  title="Skip this time"
                  sub={`Next due ${shortDate(skipping.dueOn.toString())}`}
                  onClick={() => {
                    putOff.skip(chore, today);
                    onClose();
                  }}
                />
              )}
              {canTomorrow && (
                <TwoLineButton
                  title="Put off"
                  sub="Due tomorrow"
                  onClick={() => {
                    putOff.tomorrow(chore, today);
                    onClose();
                  }}
                />
              )}
            </div>
            <p className="mt-2 px-1 text-[0.8125rem] text-muted-foreground">
              {skipping.kind === "moved" &&
                "Skipping goes in the history, so nobody has to tick it. "}
              {canTomorrow && "Putting off only moves the date."}
            </p>
          </>
        )}
      </div>

      <section className="mt-7" aria-labelledby="chore-history">
        <div className="flex items-baseline justify-between">
          <h3 id="chore-history" className="text-sm font-[750]">
            History
          </h3>
          {history.length > 1 && (
            <span className="text-[0.8125rem] text-muted-foreground">Newest first</span>
          )}
        </div>
        {isPending ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : history.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Not done yet.</p>
        ) : (
          <ul className="mt-1">
            {history.map((completion, index) => {
              const at = Temporal.Instant.from(completion.createdAt);
              const undoable =
                index === 0 &&
                Temporal.Duration.compare(Temporal.Now.instant().since(at), UNDO_WITHIN) < 0;
              return (
                <li
                  key={completion.id}
                  className="flex min-h-14 items-center gap-3 border-b border-border py-2 last:border-b-0"
                >
                  {completion.completedBy ? (
                    <UserAvatar
                      name={completion.completedBy.name}
                      image={null}
                      size="sm"
                      className="data-[size=sm]:size-7"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="size-7 shrink-0 rounded-full border-[1.5px] border-dashed border-line-strong"
                    />
                  )}
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-[650]">
                      {who(completion.completedBy)}{" "}
                      {completion.skipped ? "skipped it." : "marked it done."}
                    </span>
                    <span className="block text-[0.8125rem] text-muted-foreground">
                      {whenDone(at, completion.completedOn, today)}
                    </span>
                  </span>
                  {undoable && (
                    <Button variant="secondary" size="sm" onClick={onUndo}>
                      Undo
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-muted px-3.5 py-2.5">
      <dt className="text-xs font-[650] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[1.0625rem] font-[750]">{children}</dd>
    </div>
  );
}

function TwoLineButton({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      className="h-auto min-h-14 flex-col gap-0 rounded-2xl py-2"
    >
      <span className="text-[0.9375rem] font-[700]">{title}</span>
      <span className="text-xs font-medium text-muted-foreground">{sub}</span>
    </Button>
  );
}

/** "Today, 08:14", "Yesterday, 19:02", "Sat 14 Nov, 10:30" */
function whenDone(at: Temporal.Instant, completedOn: string, today: string): string {
  const time = at
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const days = daysBetween(completedOn, today);
  const date = days <= 0 ? "Today" : days === 1 ? "Yesterday" : shortDate(completedOn);
  return `${date}, ${time}`;
}
