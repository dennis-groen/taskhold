import { createAuthClient } from "better-auth/react";

// Same origin as the app: /api is proxied to the API by Vite in dev
export const authClient = createAuthClient();
