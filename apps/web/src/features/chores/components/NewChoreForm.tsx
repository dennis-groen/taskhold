import { useId, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import { CalendarBlankIcon, MinusIcon, PlusIcon, RepeatIcon } from "@/components/icons.ts";
import { BigTitleInput, Choices, Tile } from "@/components/layout/AddSheet.tsx";
import { SHEET_BODY } from "@/components/layout/Sheet.tsx";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Button } from "@/components/ui/button";
import { rowDueLabel, shortDate, today as todayOnDevice } from "@/lib/dates.ts";
import { firstName, namesList } from "@/lib/shared-with.ts";
import { cn } from "cn";

import { repeatLabel } from "../chore-dates.ts";
import type { ChoreInput, Repeat } from "../chores.api.ts";
import { useManageChores } from "../chores.hooks.ts";
import type { Member } from "./ChoreForm.tsx";

type Open = "who" | "due" | "repeat" | null;

// How far a repeat goes: up to a year, in days or weeks
const MAX_EVERY = { day: 365, week: 52 };

/**
 * Adding a chore, made for the keyboard being up: the name typed big, then Who, Due and Repeat as
 * three tiles. Due starts on Today, which is how people use the + button. Each tile opens its
 * choices under the row, and the line by the button says who else will see it.
 */
export function NewChoreForm({
  members,
  viewerId,
  name,
  onNameChange,
  nameRef,
  onAdded,
}: {
  members: Member[];
  viewerId: string;
  /** Kept by the sheet, so switching to To-do keeps what's typed */
  name: string;
  onNameChange: (name: string) => void;
  nameRef: RefObject<HTMLInputElement | null>;
  onAdded: () => void;
}) {
  const ids = { who: useId(), due: useId(), repeat: useId(), error: useId() };
  const { add } = useManageChores(members);
  const today = todayOnDevice();
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState<string | null>(today);
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);

  const assignee = members.find((member) => member.id === assigneeId) ?? null;
  const others = members.filter((member) => member.id !== viewerId);
  const tomorrow = Temporal.PlainDate.from(today).add({ days: 1 }).toString();

  function toggle(tile: Exclude<Open, null>) {
    setOpen((current) => (current === tile ? null : tile));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the chore a name.");
      nameRef.current?.focus();
      return;
    }
    const input: ChoreInput = {
      name: name.trim(),
      repeat,
      // A repeating chore always has a next due date
      dueOn: dueOn ?? (repeat ? today : null),
      assigneeId,
    };
    // Shows in the list straight away; a failure shows as a notice
    add(input);
    onAdded();
  }

  return (
    <form noValidate onSubmit={submit} className={cn(SHEET_BODY, "pt-3")}>
      <BigTitleInput
        ref={nameRef}
        aria-label="Chore"
        placeholder="Take out the bins"
        value={name}
        onChange={(event) => {
          onNameChange(event.target.value);
          setError(null);
        }}
        maxLength={60}
        aria-invalid={error !== null || undefined}
        aria-describedby={error ? ids.error : undefined}
      />
      {error && (
        <p id={ids.error} role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Tile
          icon={
            assignee ? (
              <UserAvatar
                name={assignee.name}
                image={assignee.image}
                size="sm"
                className="data-[size=sm]:size-4"
              />
            ) : (
              <span
                aria-hidden
                className="size-4 rounded-full border-[1.5px] border-dashed border-current"
              />
            )
          }
          label="Who"
          value={
            assignee ? (assignee.id === viewerId ? "You" : firstName(assignee.name)) : "Anyone"
          }
          open={open === "who"}
          onClick={() => toggle("who")}
          controls={ids.who}
        />
        <Tile
          icon={<CalendarBlankIcon aria-hidden weight="bold" className="size-4" />}
          label="Due"
          value={dueOn ? (rowDueLabel(dueOn, today) ?? "Today") : "No date"}
          open={open === "due"}
          onClick={() => toggle("due")}
          controls={ids.due}
        />
        <Tile
          icon={<RepeatIcon aria-hidden weight="bold" className="size-4" />}
          label="Repeat"
          value={repeat ? repeatLabel(repeat) : "Once"}
          open={open === "repeat"}
          onClick={() => toggle("repeat")}
          controls={ids.repeat}
        />
      </div>

      {open === "who" && (
        <Panel id={ids.who}>
          <div className="flex flex-wrap gap-2">
            {[null, ...members].map((member) => (
              <Button
                key={member?.id ?? "anyone"}
                type="button"
                variant="chip"
                aria-pressed={assigneeId === (member?.id ?? null)}
                onClick={() => {
                  setAssigneeId(member?.id ?? null);
                  setOpen(null);
                }}
                className="has-data-[slot=avatar]:pl-1.5"
              >
                {member && <UserAvatar name={member.name} image={member.image} size="sm" />}
                {member ? (member.id === viewerId ? "You" : firstName(member.name)) : "Anyone"}
              </Button>
            ))}
          </div>
        </Panel>
      )}

      {open === "due" && (
        <Panel id={ids.due}>
          <Choices
            label="Due"
            value={
              dueOn === today ? "today" : dueOn === tomorrow ? "tomorrow" : dueOn ? "on" : "none"
            }
            options={[
              { value: "today", label: "Today" },
              { value: "tomorrow", label: "Tomorrow" },
              ...(repeat ? [] : [{ value: "none" as const, label: "No date" }]),
            ]}
            onChange={(choice) => {
              setDueOn(choice === "today" ? today : choice === "tomorrow" ? tomorrow : null);
              setOpen(null);
            }}
          />
          <label className="mt-3 flex items-center gap-3 text-sm font-[650] text-muted-foreground">
            Or on
            <input
              type="date"
              min={today}
              value={dueOn ?? ""}
              onChange={(event) => setDueOn(event.target.value || (repeat ? today : null))}
              className="h-11 flex-1 rounded-xl bg-muted px-3 text-base text-foreground tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/80"
            />
          </label>
        </Panel>
      )}

      {open === "repeat" && (
        <Panel id={ids.repeat}>
          <Choices
            label="Repeat"
            value={repeat ? "every" : "once"}
            options={[
              { value: "once", label: "Once" },
              { value: "every", label: "Every…" },
            ]}
            onChange={(choice) => {
              setRepeat(choice === "once" ? null : { every: 1, unit: "week" });
              if (choice === "every" && !dueOn) setDueOn(today);
            }}
          />
          {repeat && (
            <>
              <div className="mt-3 flex items-center gap-2.5">
                <span className="flex h-[50px] items-center rounded-[14px] bg-muted">
                  <button
                    type="button"
                    aria-label="Fewer"
                    disabled={repeat.every <= 1}
                    onClick={() => setRepeat({ ...repeat, every: repeat.every - 1 })}
                    className="grid size-11 place-items-center rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.92] disabled:opacity-40"
                  >
                    <MinusIcon weight="bold" className="size-5" />
                  </button>
                  <b
                    aria-live="polite"
                    className="min-w-8 text-center text-xl font-[800] tabular-nums [font-stretch:125%]"
                  >
                    {repeat.every}
                  </b>
                  <button
                    type="button"
                    aria-label="More"
                    disabled={repeat.every >= MAX_EVERY[repeat.unit]}
                    onClick={() => setRepeat({ ...repeat, every: repeat.every + 1 })}
                    className="grid size-11 place-items-center rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.92] disabled:opacity-40"
                  >
                    <PlusIcon weight="bold" className="size-5" />
                  </button>
                </span>
                <Choices
                  label="Unit"
                  value={repeat.unit}
                  options={[
                    { value: "day", label: repeat.every === 1 ? "day" : "days" },
                    { value: "week", label: repeat.every === 1 ? "week" : "weeks" },
                  ]}
                  onChange={(unit) =>
                    setRepeat({ unit, every: Math.min(repeat.every, MAX_EVERY[unit]) })
                  }
                  className="flex-1"
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {repeatLabel(repeat)}, counted from the day it's marked done. First due{" "}
                {dueOn === today ? "today, " : ""}
                {shortDate(dueOn ?? today)}.
              </p>
            </>
          )}
        </Panel>
      )}

      <div className="mt-5 flex items-center gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-[600] text-muted-foreground">
          {others.length > 0 && (
            <span aria-hidden className="flex shrink-0">
              {others.slice(0, 3).map((member, index) => (
                <UserAvatar
                  key={member.id}
                  name={member.name}
                  image={member.image}
                  size="sm"
                  className={cn("ring-2 ring-sheet", index > 0 && "-ml-1.5")}
                />
              ))}
            </span>
          )}
          <span className="min-w-0">
            {others.length > 0
              ? `${namesList(others.map((member) => firstName(member.name)))} will see it`
              : "Everyone who joins will see it"}
          </span>
        </span>
        <Button type="submit" size="xl" className="shrink-0 rounded-2xl px-6">
          Add chore
        </Button>
      </div>
    </form>
  );
}

function Panel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      className="mt-3 border-t border-border pt-4 transition-[opacity,translate] duration-200 ease-(--ease-out) starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none"
    >
      {children}
    </div>
  );
}
