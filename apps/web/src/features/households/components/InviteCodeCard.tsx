import { useRef, useState } from "react";

import { CheckIcon, CopyIcon, LinkIcon, ShareNetworkIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/shared-with.ts";

import type { Household } from "../households.api.ts";
import { formatInviteCode, inviteLink } from "../invite-code.ts";
import { InviteCodeSlots } from "./InviteCodeSlots.tsx";
import { NewInviteCodeButton } from "./NewInviteCodeButton.tsx";

// Phones get the system share sheet; desktops copy, which is what people do there
const canShare =
  typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

/**
 * The household's invite code in its eight cells, with Share link and Copy code under it. The
 * owner can swap it for a new one; everyone else is told who can.
 */
export function InviteCodeCard({
  household,
  viewerId,
  reveal = false,
}: {
  household: Household;
  viewerId: string;
  /** Plays the code in cell by cell, as right after making the household */
  reveal?: boolean;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [copyBlocked, setCopyBlocked] = useState(false);
  // Set after the owner replaces the code, so the new one plays in like a fresh one
  const [replaced, setReplaced] = useState(false);
  const linkRef = useRef<HTMLParagraphElement>(null);

  const owner = household.members.find((member) => member.role === "owner");
  const isOwner = owner?.id === viewerId;
  const code = formatInviteCode(household.inviteCode);
  const link = inviteLink(household.inviteCode);

  async function copy(what: "link" | "code") {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : code);
    } catch {
      // Clipboard blocked: show the link selected, so copying it by hand is one shortcut away
      setCopyBlocked(true);
      requestAnimationFrame(() => {
        if (linkRef.current) window.getSelection()?.selectAllChildren(linkRef.current);
      });
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
    <div className="rounded-[1.375rem] bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2 pb-3">
        <h3 className="text-sm font-[750]">
          <label htmlFor="invite-code">Invite code</label>
        </h3>
        {isOwner && (
          <NewInviteCodeButton
            onReplaced={() => {
              setCopied(null);
              setCopyBlocked(false);
              setReplaced(true);
            }}
          />
        )}
      </div>
      <InviteCodeSlots
        // A new code remounts the slots so the reveal plays again
        key={household.inviteCode}
        id="invite-code"
        value={household.inviteCode}
        readOnly
        reveal={reveal || replaced}
      />
      <div className="mt-4 grid grid-cols-2 gap-2">
        {canShare ? (
          <Button
            size="xl"
            className="bg-foreground text-background hover:bg-foreground/90"
            onClick={() => void share()}
          >
            <ShareNetworkIcon />
            Share link
          </Button>
        ) : (
          <Button
            size="xl"
            className="bg-foreground text-background hover:bg-foreground/90"
            onClick={() => void copy("link")}
          >
            {copied === "link" ? <CheckIcon /> : <LinkIcon />}
            {copied === "link" ? "Link copied" : "Copy link"}
          </Button>
        )}
        <Button size="xl" variant="secondary" onClick={() => void copy("code")}>
          {copied === "code" ? <CheckIcon /> : <CopyIcon />}
          {copied === "code" ? "Code copied" : "Copy code"}
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? `${copied === "link" ? "Link" : "Code"} copied` : ""}
      </span>
      {copyBlocked && (
        <output className="mt-3 block text-sm">
          Your browser blocked copying. Copy the selected link with Ctrl+C or ⌘C:
          <span ref={linkRef} className="mt-1 block font-mono text-[0.8125rem] break-all">
            {link}
          </span>
        </output>
      )}
      <p className="mt-3 text-[0.8125rem] text-muted-foreground">
        {isOwner
          ? "Anyone with this code can join, so only share it with people you live with."
          : `Only ${owner ? firstName(owner.name) : "the owner"}, the owner, can make a new code or remove people.`}
      </p>
    </div>
  );
}
