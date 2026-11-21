import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "cn";

import { authClient } from "../auth-client.ts";

/** Starts Google sign-in; after it, the browser lands on `callbackURL` */
export function GoogleSignInButton({
  callbackURL,
  className,
}: {
  callbackURL: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.social({ provider: "google", callbackURL });
    // On success the browser is already on its way to Google, so only failures land here
    if (result.error) {
      setError("Couldn't reach Google. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="xl"
        disabled={pending}
        onClick={() => void signIn()}
        className={cn(
          "h-14 w-full gap-3 rounded-[17px] bg-foreground text-[1.0625rem] font-bold text-background hover:bg-foreground/90",
          className,
        )}
      >
        <span className="grid size-[26px] place-items-center rounded-full bg-white">
          {pending ? <Spinner className="text-[#18191c]" /> : <GoogleLogo />}
        </span>
        Continue with Google
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}
