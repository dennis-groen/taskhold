import { useId, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { TodoInput } from "../todos.api.ts";

const EMPTY: TodoInput = { name: "", notes: null, dueOn: null };

/**
 * What to do, an optional due date and optional notes. Used to add a to-do and to change one.
 * `onSubmit` throws when saving fails; the form shows the message and keeps what was typed.
 */
export function TodoForm({
  initial = EMPTY,
  submitLabel,
  nameRef,
  onSubmit,
  footer,
}: {
  initial?: TodoInput;
  submitLabel: string;
  /** Gets focus when the form opens */
  nameRef?: RefObject<HTMLInputElement | null>;
  onSubmit: (input: TodoInput) => void;
  /** Extra actions under the submit button, e.g. Delete */
  footer?: ReactNode;
}) {
  const ids = { name: useId(), due: useId(), notes: useId() };
  const [name, setName] = useState(initial.name);
  const [dueOn, setDueOn] = useState(initial.dueOn ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Write what you need to do.");
      nameRef?.current?.focus();
      return;
    }
    setError(null);
    // Shows straight away; a failure shows as a notice (see todos.changes.ts)
    onSubmit({ name: name.trim(), notes: notes.trim() || null, dueOn: dueOn || null });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.name}>To-do</Label>
        <Input
          id={ids.name}
          ref={nameRef}
          placeholder="Call the dentist"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          autoComplete="off"
          className="h-12 rounded-xl px-4 text-base md:text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.due}>Due</Label>
        <div className="flex gap-2">
          <Input
            id={ids.due}
            type="date"
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl px-4 text-base tabular-nums md:text-base"
          />
          {dueOn && (
            <Button type="button" variant="ghost" size="xl" onClick={() => setDueOn("")}>
              No date
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.notes}>Notes</Label>
        <Textarea
          id={ids.notes}
          placeholder="A phone number, an address, what to ask"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          rows={3}
          className="rounded-xl px-4 py-3 text-base md:text-base"
        />
      </div>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <Button type="submit" size="xl">
        {submitLabel}
      </Button>
      {footer}
    </form>
  );
}
