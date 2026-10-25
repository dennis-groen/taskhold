import { CheckIcon, CopyIcon, LinkIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { BackLink } from "@/components/back-link.tsx";
import { PageHeading } from "@/components/layout/page-heading.tsx";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { HouseholdMembers } from "../components/household-members.tsx";
import { InviteCodeSlots } from "../components/invite-code-slots.tsx";
import { formatInviteCode, inviteLink } from "../invite-code.ts";

const householdRoute = getRouteApi("/_household");
const routeApi = getRouteApi("/_household/invite");

// Phones get the system share sheet; desktops copy, which is what people do there
const canShare =
  typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

export function InviteMembersPage() {
  const household = householdRoute.useLoaderData();
  const { user } = householdRoute.useRouteContext();
  const { created } = routeApi.useSearch();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [copyBlocked, setCopyBlocked] = useState(false);
  const linkRef = useRef<HTMLParagraphElement>(null);

  const code = formatInviteCode(household.inviteCode);
  const link = inviteLink(household.inviteCode);

  async function copy(what: "link" | "code") {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : code);
    } catch {
      // Clipboard blocked: select the link so copying it by hand is one shortcut away
      if (linkRef.current) window.getSelection()?.selectAllChildren(linkRef.current);
      setCopyBlocked(true);
      return;
    }
    setCopyBlocked(false);
    setCopied(what);
    setTimeout(() => setCopied((current) => (current === what ? null : current)), 2000);
  }

  async function share() {
    try {
      await navigator.share({
        title: `Join ${household.name} on taskhold`,
        text: `Join ${household.name} on taskhold. Invite code: ${code}`,
        url: link,
      });
    } catch {
      // Closing the share sheet rejects too; nothing to do
    }
  }

  return (
    <>
      {!created && <BackLink to="/dashboard" />}
      <PageHeading
        title={created ? `${household.name} is ready` : `Invite people to ${household.name}`}
      >
        Share this code with the people you live with. They enter it after signing in to taskhold.
      </PageHeading>

      <Field className="mt-8">
        <FieldLabel htmlFor="invite-code">Invite code</FieldLabel>
        <InviteCodeSlots id="invite-code" value={household.inviteCode} readOnly reveal={created} />
        <FieldDescription>
          Anyone with this code can join, so only share it with people you live with.
        </FieldDescription>
      </Field>

      <div className="mt-6 flex flex-wrap gap-2">
        {canShare ? (
          <Button size="lg" className="h-11 px-4" onClick={() => void share()}>
            <ShareNetworkIcon />
            Share invite link
          </Button>
        ) : (
          <Button size="lg" className="h-11 px-4" onClick={() => void copy("link")}>
            {copied === "link" ? <CheckIcon /> : <LinkIcon />}
            {copied === "link" ? "Link copied" : "Copy invite link"}
          </Button>
        )}
        <Button size="lg" variant="outline" className="h-11 px-4" onClick={() => void copy("code")}>
          {copied === "code" ? <CheckIcon /> : <CopyIcon />}
          {copied === "code" ? "Code copied" : "Copy code"}
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? `${copied === "link" ? "Link" : "Code"} copied` : ""}
        </span>
      </div>
      <p ref={linkRef} className="mt-3 text-sm break-all text-muted-foreground">
        {link}
      </p>
      {copyBlocked && (
        <output className="mt-1 block text-sm text-foreground">
          Your browser blocked copying. The link above is selected, so copy it with Ctrl+C or ⌘C.
        </output>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium">Already in {household.name}</h2>
        <HouseholdMembers members={household.members} currentUserId={user.id} />
      </section>

      {created && (
        <Link
          to="/dashboard"
          className={cn(buttonVariants({ variant: "link", size: "lg" }), "mt-6 h-11 px-0")}
        >
          Go to your household
        </Link>
      )}
    </>
  );
}
