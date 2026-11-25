import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api.ts";

import { startDemo } from "../demo.api.ts";

/** For the sign-in page: opens a demo household of the visitor's own, no account needed */
export function TryDemoButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      await startDemo();
      // Asks again who is signed in, which takes the visitor on to their lists
      await router.invalidate();
    } catch (err) {
      setError(errorMessage(err, "Couldn't start the demo. Check your connection and try again."));
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="xl"
        disabled={pending}
        onClick={() => void start()}
        className="h-14 w-full rounded-[17px] text-[1.0625rem] font-bold"
      >
        {pending && <Spinner />}
        Try the demo
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
