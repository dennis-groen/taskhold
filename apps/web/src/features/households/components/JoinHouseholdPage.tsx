import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { BackLink } from "@/components/BackLink.tsx";
import { ClipboardTextIcon, PencilSimpleIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { errorMessage } from "@/lib/api.ts";
import { notify } from "@/lib/feedback.ts";

import { InviteCodeSlots } from "./InviteCodeSlots.tsx";
import { acceptInvite, lookUpInvite, type InvitePreview } from "../households.api.ts";
import { INVITE_CODE_LENGTH, extractInviteCode } from "../invite-code.ts";

const routeApi = getRouteApi("/onboarding/join");

export function JoinHouseholdPage() {
  const navigate = useNavigate();
  const initialLookup = routeApi.useLoaderData();
  const { code: initialCode } = routeApi.useSearch();

  const [code, setCode] = useState(initialCode ?? "");
  const [lookup, setLookup] = useState(initialLookup);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Drops answers for a code that has been edited since the lookup started
  const latestCode = useRef(code);

  async function changeCode(next: string) {
    setCode(next);
    setJoinError(null);
    latestCode.current = next;

    if (next.length < INVITE_CODE_LENGTH) {
      setLookup({ status: "idle" });
      return;
    }
    setLookup({ status: "loading" });
    const result = await lookUpInvite(next);
    if (latestCode.current === next) setLookup(result);
  }

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      await acceptInvite(code);
      await navigate({ to: "/lists" });
      if (invite) notify(`Welcome to ${invite.householdName}`);
    } catch (err) {
      setJoinError(errorMessage(err, "Couldn't join the household. Try again."));
      setJoining(false);
    }
  }

  const invite = lookup.status === "found" ? lookup.invite : null;

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      const pasted = extractInviteCode(text);
      if (pasted) await changeCode(pasted.toUpperCase());
    } catch {
      // Reading the clipboard was refused; the field still takes a paste
    }
  }

  return (
    <>
      <BackLink to="/onboarding" />
      <header className="mt-2 rounded-[1.75rem] bg-(--home-slab) px-5 pt-5 pb-6 text-(--home-on)">
        <h1 className="text-[2rem] leading-none font-[850] tracking-[-0.02em] [font-stretch:125%]">
          Your household
        </h1>
        <p className="mt-2 text-[0.9375rem] text-pretty opacity-85">
          Join with a code from someone you live with, or start a new one.
        </p>
      </header>

      <Field className="mt-6" data-invalid={lookup.status === "error" ? true : undefined}>
        <FieldLabel htmlFor="invite-code">Invite code</FieldLabel>
        <InviteCodeSlots
          id="invite-code"
          value={code}
          onChange={(next) => void changeCode(next)}
          invalid={lookup.status === "error"}
        />
        {lookup.status === "error" && (
          <>
            <FieldError>{lookup.message}</FieldError>
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" onClick={() => void changeCode("")}>
                <PencilSimpleIcon />
                Edit code
              </Button>
              <Button variant="secondary" size="lg" onClick={() => void paste()}>
                <ClipboardTextIcon />
                Paste
              </Button>
            </div>
          </>
        )}
        {lookup.status === "idle" && (
          <FieldDescription>It's on the Household tab of anyone already in it.</FieldDescription>
        )}
        {lookup.status === "loading" && (
          <FieldDescription className="flex items-center gap-2">
            <Spinner className="size-3.5" />
            Looking up this code…
          </FieldDescription>
        )}
      </Field>

      {invite && (
        <section
          aria-live="polite"
          className="mt-6 rounded-[1.375rem] bg-card p-4 shadow-card transition-[opacity,translate] duration-300 ease-(--ease-out) starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none sm:p-5"
        >
          <h2 className="font-heading text-xl font-bold tracking-[-0.02em]">
            {invite.householdName}
          </h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex -space-x-2 *:rounded-full *:ring-2 *:ring-card">
              {invite.members.slice(0, 4).map((member, index) => (
                <UserAvatar key={index} name={member.name} image={member.image} size="sm" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{whoIsHere(invite.members)}</p>
          </div>
        </section>
      )}

      <Button
        size="xl"
        disabled={!invite || joining}
        onClick={() => void join()}
        className="mt-6 w-full bg-foreground text-background hover:bg-foreground/90"
      >
        {joining && <Spinner />}
        <span className="truncate">
          {invite ? `Join ${invite.householdName}` : "Join household"}
        </span>
      </Button>
      {joinError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {joinError}
        </p>
      )}
      <Link
        to="/onboarding/create"
        className="mt-3 flex min-h-11 items-center justify-center rounded-xl text-[0.9375rem] font-[650] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/80 active:opacity-60"
      >
        Start a new household instead
      </Link>
    </>
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function whoIsHere(members: InvitePreview["members"]) {
  const [first, second] = members;
  if (!first) return "Nobody has joined yet.";
  if (!second) return `${first.name} is already here.`;
  if (members.length === 2) {
    return `${firstName(first.name)} and ${firstName(second.name)} are already here.`;
  }
  const others = members.length - 2;
  return `${firstName(first.name)}, ${firstName(second.name)} and ${others} ${others === 1 ? "other" : "others"} are already here.`;
}
