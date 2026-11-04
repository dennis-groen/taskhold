import { useId, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import { UserAvatar } from "@/components/user-avatar.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client.ts";
import { today } from "@/lib/dates.ts";
import { firstName } from "@/lib/shared-with.ts";

import type { ChoreInput, Repeat } from "../chores.api.ts";

export type Member = { id: string; name: string; image: string | null };

type RepeatChoice = "once" | "daily" | "weekly" | "custom";

const REPEAT_CHOICES: { choice: RepeatChoice; label: string }[] = [
  { choice: "once", label: "Once" },
  { choice: "daily", label: "Daily" },
  { choice: "weekly", label: "Weekly" },
  { choice: "custom", label: "Custom" },
];

function choiceFor(repeat: Repeat | null): RepeatChoice {
  if (!repeat) return "once";
  if (repeat.every === 1) return repeat.unit === "day" ? "daily" : "weekly";
  return "custom";
}

/** A new chore starts weekly from today, with nobody assigned: the most common kind */
const NEW_CHORE: ChoreInput = {
  name: "",
  repeat: { every: 1, unit: "week" },
  dueOn: null,
  assigneeId: null,
};

/**
 * Name, how often, when it's next due and who it's for. Used to add a chore and to change one.
 * `onSubmit` throws when saving fails; the form shows the API's message and keeps what was typed.
 */
export function ChoreForm({
  initial = NEW_CHORE,
  members,
  viewerId,
  submitLabel,
  nameRef,
  onSubmit,
  footer,
}: {
  initial?: ChoreInput;
  members: Member[];
  viewerId: string;
  submitLabel: string;
  /** Gets focus when the form opens */
  nameRef?: RefObject<HTMLInputElement | null>;
  onSubmit: (input: ChoreInput) => Promise<void>;
  /** Extra actions next to the submit button, e.g. Delete */
  footer?: ReactNode;
}) {
  const ids = { name: useId(), due: useId(), every: useId() };
  const [name, setName] = useState(initial.name);
  const [choice, setChoice] = useState(choiceFor(initial.repeat));
  const [every, setEvery] = useState(String(initial.repeat?.every ?? 2));
  const [unit, setUnit] = useState<Repeat["unit"]>(initial.repeat?.unit ?? "week");
  const [dueOn, setDueOn] = useState(initial.dueOn ?? (initial.repeat ? today() : ""));
  const [assigneeId, setAssigneeId] = useState(initial.assigneeId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repeat: Repeat | null =
    choice === "once"
      ? null
      : choice === "daily"
        ? { every: 1, unit: "day" }
        : choice === "weekly"
          ? { every: 1, unit: "week" }
          : { every: Number(every), unit };

  function pickRepeat(next: RepeatChoice) {
    setChoice(next);
    // Repeating chores always have a next due date
    if (next !== "once" && !dueOn) setDueOn(today());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the chore a name.");
      nameRef?.current?.focus();
      return;
    }
    // Checked here rather than by the browser, so the message sits with the others
    if (repeat && !dueOn) {
      setError("Pick when it's next due.");
      return;
    }
    if (repeat && !(Number.isInteger(repeat.every) && repeat.every >= 1)) {
      setError(`Repeat at least every 1 ${repeat.unit}.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), repeat, dueOn: dueOn || null, assigneeId });
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the chore. Check your connection and try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.name}>Chore</Label>
        <Input
          id={ids.name}
          ref={nameRef}
          placeholder="Take out the bins"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          autoComplete="off"
          className="h-12 rounded-xl px-4 text-base md:text-base"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Repeats</legend>
        <Chips>
          {REPEAT_CHOICES.map((option) => (
            <Chip
              key={option.choice}
              active={choice === option.choice}
              onClick={() => pickRepeat(option.choice)}
            >
              {option.label}
            </Chip>
          ))}
        </Chips>
        {choice === "custom" && (
          <div className="mt-2 flex items-center gap-2">
            <Label htmlFor={ids.every} className="font-normal">
              Every
            </Label>
            <Input
              id={ids.every}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={every}
              onChange={(event) => setEvery(event.target.value)}
              className="h-10 w-20 text-base tabular-nums md:text-base"
            />
            <Chips>
              <Chip active={unit === "day"} onClick={() => setUnit("day")}>
                days
              </Chip>
              <Chip active={unit === "week"} onClick={() => setUnit("week")}>
                weeks
              </Chip>
            </Chips>
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.due}>{repeat ? "Next due" : "Due"}</Label>
        <div className="flex gap-2">
          <Input
            id={ids.due}
            type="date"
            value={dueOn}
            required={repeat !== null}
            onChange={(event) => setDueOn(event.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl px-4 text-base tabular-nums md:text-base"
          />
          {!repeat && dueOn && (
            <Button type="button" variant="ghost" size="xl" onClick={() => setDueOn("")}>
              No date
            </Button>
          )}
        </div>
        {repeat && (
          <p className="text-sm text-muted-foreground">
            After it's done, it's due again {repeatAfter(repeat)} from that day.
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Assigned to</legend>
        <Chips>
          {members.map((member) => (
            <Chip
              key={member.id}
              active={assigneeId === member.id}
              onClick={() => setAssigneeId(member.id)}
            >
              <UserAvatar name={member.name} image={member.image} size="sm" />
              {member.id === viewerId ? "You" : firstName(member.name)}
            </Chip>
          ))}
          <Chip active={assigneeId === null} onClick={() => setAssigneeId(null)}>
            Anyone
          </Chip>
        </Chips>
      </fieldset>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="xl" disabled={pending} className="flex-1">
          {pending && <Spinner />}
          {submitLabel}
        </Button>
        {footer}
      </div>
    </form>
  );
}

function repeatAfter({ every, unit }: Repeat): string {
  if (every === 1) return `a ${unit}`;
  return `${every} ${unit}s`;
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="chip"
      aria-pressed={active}
      onClick={onClick}
      className="has-data-[slot=avatar]:pl-1.5"
    >
      {children}
    </Button>
  );
}
