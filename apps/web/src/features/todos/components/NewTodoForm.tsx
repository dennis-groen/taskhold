import { useId, useState, type FormEvent, type RefObject } from "react";

import { CalendarBlankIcon, LockIcon, NoteIcon } from "@/components/icons.ts";
import { BigTitleInput, Choices, Tile } from "@/components/layout/AddSheet.tsx";
import { SHEET_BODY } from "@/components/layout/Sheet.tsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rowDueLabel, today as todayOnDevice } from "@/lib/dates.ts";
import { cn } from "cn";

import { useTodos } from "../todos.hooks.ts";

type Open = "due" | "notes" | null;

/**
 * Adding a to-do, the same shape as adding a chore: the name typed big, then Due and Notes as
 * tiles. Due starts empty, as most to-dos have no date.
 */
export function NewTodoForm({
  name,
  onNameChange,
  nameRef,
  onAdded,
}: {
  /** Kept by the sheet, so switching to Chore keeps what's typed */
  name: string;
  onNameChange: (name: string) => void;
  nameRef: RefObject<HTMLInputElement | null>;
  onAdded: () => void;
}) {
  const ids = { due: useId(), notes: useId(), error: useId() };
  const { add } = useTodos();
  const today = todayOnDevice();
  const tomorrow = Temporal.PlainDate.from(today).add({ days: 1 }).toString();
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Write what you need to do.");
      nameRef.current?.focus();
      return;
    }
    // Shows in the list straight away; a failure shows as a notice
    add({ name: name.trim(), notes: notes.trim() || null, dueOn });
    onAdded();
  }

  return (
    <form noValidate onSubmit={submit} className={cn(SHEET_BODY, "pt-3")}>
      <BigTitleInput
        ref={nameRef}
        aria-label="To-do"
        placeholder="Call the dentist"
        value={name}
        onChange={(event) => {
          onNameChange(event.target.value);
          setError(null);
        }}
        maxLength={100}
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
          icon={<CalendarBlankIcon aria-hidden weight="bold" className="size-4" />}
          label="Due"
          value={dueOn ? (rowDueLabel(dueOn, today) ?? "Today") : "No date"}
          open={open === "due"}
          onClick={() => setOpen((current) => (current === "due" ? null : "due"))}
          controls={ids.due}
        />
        <Tile
          icon={<NoteIcon aria-hidden weight="bold" className="size-4" />}
          label="Notes"
          value={notes.trim() ? notes.trim() : "None"}
          open={open === "notes"}
          onClick={() => setOpen((current) => (current === "notes" ? null : "notes"))}
          controls={ids.notes}
        />
      </div>

      {open === "due" && (
        <div id={ids.due} className="mt-3 border-t border-border pt-4">
          <Choices
            label="Due"
            value={
              dueOn === today ? "today" : dueOn === tomorrow ? "tomorrow" : dueOn ? "on" : "none"
            }
            options={[
              { value: "none", label: "No date" },
              { value: "today", label: "Today" },
              { value: "tomorrow", label: "Tomorrow" },
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
              value={dueOn ?? ""}
              onChange={(event) => setDueOn(event.target.value || null)}
              className="h-11 flex-1 rounded-xl bg-muted px-3 text-base text-foreground tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/80"
            />
          </label>
        </div>
      )}

      {open === "notes" && (
        <div id={ids.notes} className="mt-3 border-t border-border pt-4">
          <Textarea
            aria-label="Notes"
            placeholder="A phone number, an address, what to ask"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
            rows={3}
            className="rounded-xl px-4 py-3 text-base md:text-base"
          />
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-[600] text-muted-foreground">
          <LockIcon aria-hidden weight="bold" className="size-4 shrink-0" />
          Only you will see it
        </span>
        <Button
          type="submit"
          size="xl"
          className="shrink-0 rounded-2xl bg-foreground px-6 text-background hover:bg-foreground/90"
        >
          Add to-do
        </Button>
      </div>
    </form>
  );
}
