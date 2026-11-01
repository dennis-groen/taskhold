import { describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { anonymous, errorCode, json, signUp } from "./helpers.ts";

describe("sessions", () => {
  it("tells signed-out visitors they aren't signed in, without an error", async () => {
    expect(await json(await anonymous.viewer.$get(), 200)).toEqual({ user: null, household: null });
  });

  it("knows who is signed in", async () => {
    const person = await signUp("Robin Example");
    const viewer = await json(await person.api.viewer.$get(), 200);
    expect(viewer.user).toMatchObject({ id: person.id, name: "Robin Example" });
    expect(viewer.household).toBeNull();
  });

  it("refuses protected routes without a session", async () => {
    expect(await errorCode(await anonymous.shopping.lists.$get(), 401)).toBe("UNAUTHORIZED");
    expect(await errorCode(await anonymous.chores.$get(), 401)).toBe("UNAUTHORIZED");
    expect(await errorCode(await anonymous.todos.$get(), 401)).toBe("UNAUTHORIZED");
  });

  it("refuses changes that come from another origin, even with a valid session", async () => {
    const person = await signUp();
    for (const origin of ["http://evil.localhost:5173", "http://localhost:8080", null]) {
      const response = await app.request("/api/todos", {
        method: "POST",
        headers: {
          cookie: person.cookie,
          "content-type": "application/json",
          ...(origin && { origin }),
        },
        body: JSON.stringify({ name: "Sneaky" }),
      });
      expect(await errorCode(response, 403)).toBe("CROSS_ORIGIN_REQUEST");
    }
  });
});
