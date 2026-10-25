import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { BackLink } from "@/components/back-link.tsx";
import { InviteCodeSlots } from "@/components/invite-code-slots.tsx";
import { PageHeading } from "@/components/page-shell.tsx";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/user-avatar.tsx";
import { api, errorMessage, parseResponse, type InvitePreview } from "@/lib/api.ts";
import { INVITE_CODE_LENGTH, extractInviteCode } from "@/lib/invite-code.ts";

type Lookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; invite: InvitePreview }
  | { status: "error"; message: string };

async function lookUpInvite(code: string): Promise<Lookup> {
  try {
    const { invite } = await parseResponse(api.invites[":code"].$get({ param: { code } }));
    return { status: "found", invite };
  } catch (err) {
    return { status: "error", message: errorMessage(err, "Couldn't check this code. Try again.") };
  }
}

export const Route = createFileRoute("/onboarding/join")({
  validateSearch: (search): { code?: string } => ({
    code: typeof search.code === "string" ? extractInviteCode(search.code) || undefined : undefined,
  }),
  // A code that came in through an invite link is looked up before the page shows
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: ({ deps }): Promise<Lookup> | Lookup =>
    deps.code?.length === INVITE_CODE_LENGTH ? lookUpInvite(deps.code) : { status: "idle" },
  component: JoinHousehold,
});

function JoinHousehold() {
  const navigate = useNavigate();
  const initialLookup = Route.useLoaderData();
  const { code: initialCode } = Route.useSearch();

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
      await parseResponse(api.invites[":code"].accept.$post({ param: { code } }));
      await navigate({ to: "/dashboard" });
    } catch (err) {
      setJoinError(errorMessage(err, "Couldn't join the household. Try again."));
      setJoining(false);
    }
  }

  const invite = lookup.status === "found" ? lookup.invite : null;

  return (
    <>
      <BackLink to="/onboarding" />
      <PageHeading title="Join a household">
        Enter the code someone in your home shared with you, or paste their invite link.
      </PageHeading>

      <Field className="mt-8" data-invalid={lookup.status === "error" ? true : undefined}>
        <FieldLabel htmlFor="invite-code">Invite code</FieldLabel>
        <InviteCodeSlots
          id="invite-code"
          value={code}
          onChange={(next) => void changeCode(next)}
          invalid={lookup.status === "error"}
        />
        {lookup.status === "error" && <FieldError>{lookup.message}</FieldError>}
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
          className="mt-6 animate-in rounded-xl border p-4 duration-300 ease-out fade-in slide-in-from-top-1 motion-reduce:animate-none sm:p-5"
        >
          <h2 className="text-lg font-semibold tracking-tight">{invite.householdName}</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex -space-x-2 *:rounded-full *:ring-2 *:ring-background">
              {invite.members.slice(0, 4).map((member, index) => (
                <UserAvatar key={index} name={member.name} image={member.image} size="sm" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{whoIsHere(invite.members)}</p>
          </div>
        </section>
      )}

      <Button
        size="lg"
        disabled={!invite || joining}
        onClick={() => void join()}
        className="mt-6 h-11 max-w-full px-5"
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
