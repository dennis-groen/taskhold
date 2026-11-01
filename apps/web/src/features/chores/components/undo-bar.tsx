import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** How long the bar stays up */
const UNDO_BAR_MS = 6_000;

/**
 * A short-lived bar above the navigation after a chore is marked done, with a way to take it back.
 * Keyed by the caller, so each new message starts its own timer.
 */
export function UndoBar({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, UNDO_BAR_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6 lg:pl-28">
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-xl bg-foreground py-1 pr-1 pl-4 text-background shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <output className="min-w-0 flex-1 py-2 text-sm">{message}</output>
        <Button
          variant="ghost"
          onClick={() => {
            onUndo();
            onDismiss();
          }}
          className="h-11 px-4 font-semibold text-background hover:bg-background/15 hover:text-background"
        >
          Undo
        </Button>
      </div>
    </div>
  );
}
