// The Notifications page's switches answer a tap at once, though turning notifications on waits on
// the push service and the API. Demo accounts can't get notifications and a test browser can't
// subscribe, so the browser's push APIs and the reminder endpoints are stood in for here, each
// slow enough that a switch waiting on them would still be off when it's checked.
import { expect, test } from "@playwright/test";

const SLOW_MS = 1500;
// The page compares it with the subscription's key; any 65 bytes do
const PUBLIC_KEY = Buffer.from(new Uint8Array(65).fill(4)).toString("base64url");
const later = () => new Promise((resolve) => setTimeout(resolve, SLOW_MS));

type Settings = {
  remindAt: string;
  timeZone: string;
  dailySummary: boolean;
  shoppingTrips: boolean;
};

test("the notification switches turn the moment they're tapped", async ({ page }) => {
  await page.addInitScript((slowMs) => {
    const key = new Uint8Array(65).fill(4).buffer;
    const subscription = {
      endpoint: "https://push.example/device",
      options: { applicationServerKey: key },
      toJSON: () => ({
        endpoint: "https://push.example/device",
        keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) },
      }),
      unsubscribe: async () => true,
    };
    let subscribed = false;
    const registration = {
      pushManager: {
        getSubscription: async () => (subscribed ? subscription : null),
        subscribe: async () => {
          await new Promise((resolve) => setTimeout(resolve, slowMs));
          subscribed = true;
          return subscription;
        },
      },
    };
    Object.defineProperty(navigator.serviceWorker, "getRegistration", {
      value: async () => registration,
    });
    // Allowed before, so the phone doesn't ask again and the switch is all there is to see
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
  }, SLOW_MS);

  let settings: Settings | null = null;
  const status = () => ({ available: true, publicKey: PUBLIC_KEY, settings });
  await page.route("**/api/reminders", (route) => route.fulfill({ json: status() }));
  await page.route("**/api/reminders/subscription", async (route) => {
    await later();
    settings = {
      remindAt: "08:00",
      timeZone: "Europe/Amsterdam",
      dailySummary: true,
      shoppingTrips: false,
    };
    await route.fulfill({ json: status() });
  });
  await page.route("**/api/reminders/settings", async (route) => {
    await later();
    settings = { ...settings!, ...route.request().postDataJSON() };
    await route.fulfill({ json: status() });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/lists/);
  await page.goto("/household/notifications");

  // A tap shows straight away, long before the push service and the API answer
  const notifications = page.getByRole("switch", { name: /Notifications on this phone/ });
  await expect(notifications).not.toBeChecked();
  await notifications.click();
  await expect(notifications).toBeChecked({ timeout: SLOW_MS / 3 });

  const shopping = page.getByRole("switch", { name: /When someone goes shopping/ });
  await expect(shopping).toBeEnabled({ timeout: SLOW_MS * 3 });
  await expect(notifications).toBeChecked();
  await shopping.click();
  await expect(shopping).toBeChecked({ timeout: SLOW_MS / 3 });

  // And stays that way once they have
  await expect(shopping).toBeEnabled({ timeout: SLOW_MS * 2 });
  await expect(shopping).toBeChecked();
  await expect(notifications).toBeChecked();
});
