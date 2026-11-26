// The production build in a real browser. The unit tests run the code in Node; only a browser
// runs the built bundle under the page's Content Security Policy, keeps the session cookie the
// API sets and registers the service worker, so a break in any of those shows up here first.
import { expect, test, type Page } from "@playwright/test";

/** Everything the page logs as an error from here on, CSP violations included */
function errorsOn(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("a visitor starts the demo and sees a housemate's change arrive", async ({ page }) => {
  const errors = errorsOn(page);
  await page.goto("/");
  // Without the policy the no-errors check below would prove nothing
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/lists/);
  await expect(page.getByRole("complementary", { name: "Demo" })).toBeVisible();
  const groceries = page.getByRole("main").getByRole("link", { name: /^Groceries/ });
  const ticked = Number(/(\d+) ticked/.exec((await groceries.textContent()) ?? "")?.[1]);
  expect(ticked).toBeGreaterThan(0);

  // A housemate ticks an item, and the change reaches the list through the live updates stream
  await page.getByRole("button", { name: "Housemate's turn" }).click();
  await expect(page.getByText("Noor ticked Oat milk")).toBeVisible();
  await expect(groceries).toContainText(`${ticked + 1} ticked`);

  // Installed and ready to work offline
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state),
    )
    .toBe("activated");

  expect(errors).toEqual([]);
});
