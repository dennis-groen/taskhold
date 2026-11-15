import { describe, expect, it } from "vitest";

import type { Viewer } from "./auth.api.ts";
import { whereToSend } from "./page-access.ts";

const user = { id: "sam", name: "Sam", email: "sam@example.test", image: null };
const signedOut: Viewer = { user: null, household: null };
const withoutHousehold: Viewer = { user, household: null };
const withHousehold: Viewer = { user, household: { id: "home", name: "Home", role: "member" } };

describe("who may open which page", () => {
  it("sends signed-out visitors to sign-in from everywhere but the front page", () => {
    expect(whereToSend(signedOut, "/")).toBeNull();
    for (const path of ["/lists", "/chores", "/onboarding", "/join/FQVH-79ZK"]) {
      expect(whereToSend(signedOut, path)).toBe("/");
    }
  });

  it("keeps people without a household on the setup pages", () => {
    for (const path of ["/", "/onboarding", "/onboarding/create", "/join/FQVH-79ZK"]) {
      expect(whereToSend(withoutHousehold, path)).toBeNull();
    }
    expect(whereToSend(withoutHousehold, "/lists")).toBe("/onboarding");
    expect(whereToSend(withoutHousehold, "/onboardingx")).toBe("/onboarding");
  });

  it("sends people with a household away from setup and invite links", () => {
    for (const path of ["/", "/lists", "/chores", "/personal", "/household"]) {
      expect(whereToSend(withHousehold, path)).toBeNull();
    }
    expect(whereToSend(withHousehold, "/onboarding")).toBe("/lists");
    expect(whereToSend(withHousehold, "/join/FQVH-79ZK")).toBe("/lists");
  });
});
