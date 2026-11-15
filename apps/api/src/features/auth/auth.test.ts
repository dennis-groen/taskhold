import { describe, expect, it } from "vitest";

import { app } from "../../app.ts";
import { anonymous, errorCode, json, signInAgain, signUp } from "../../../test/harness.ts";

describe("response headers", () => {
  it("forbid API responses from loading anything or being framed", async () => {
    const response = await anonymous.viewer.$get();
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=15552000");
  });

  it("tell browsers and proxies not to store API responses, errors included", async () => {
    const person = await signUp();
    const answers = [
      await person.api.viewer.$get(),
      await person.api.todos.$get(),
      await anonymous.todos.$get(),
      await app.request("/api/health"),
    ];
    for (const response of answers) {
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});

describe("sessions", () => {
  it("can end every other session of the person, and only theirs", async () => {
    const phone = await signUp();
    const laptop = await signInAgain(phone);
    const stranger = await signUp();

    const ended = await phone.api.viewer["other-sessions"].$delete();
    expect(await json(ended, 200)).toEqual({ ended: 1 });

    expect((await json(await phone.api.viewer.$get(), 200)).user?.id).toBe(phone.id);
    expect(await errorCode(await laptop.api.todos.$get(), 401)).toBe("UNAUTHORIZED");
    expect((await json(await stranger.api.viewer.$get(), 200)).user?.id).toBe(stranger.id);
  });

  it("only ends other sessions when asked from the app itself", async () => {
    const person = await signUp();
    const response = await app.request("/api/viewer/other-sessions", {
      method: "DELETE",
      headers: { cookie: person.cookie, origin: "http://evil.localhost:5173" },
    });
    expect(await errorCode(response, 403)).toBe("CROSS_ORIGIN_REQUEST");
  });

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
