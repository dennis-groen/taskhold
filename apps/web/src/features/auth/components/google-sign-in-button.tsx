import { Button } from "@/components/ui/button";

import { authClient } from "../auth-client.ts";

/** Starts Google sign-in; after it, the browser lands on `callbackURL` */
export function GoogleSignInButton({ callbackURL }: { callbackURL: string }) {
  return (
    <Button
      type="button"
      onClick={() => void authClient.signIn.social({ provider: "google", callbackURL })}
    >
      Login with Google
    </Button>
  );
}
