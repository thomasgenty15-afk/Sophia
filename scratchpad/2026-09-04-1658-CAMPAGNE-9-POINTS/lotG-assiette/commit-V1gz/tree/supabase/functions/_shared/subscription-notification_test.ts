import { assertEquals } from "jsr:@std/assert@1";
import {
  decideSubscriptionNotification,
  notificationDedupKey,
  subscriptionModifiedText,
  type SubscriptionSnapshot,
  tierLabel,
} from "./subscription-notification.ts";

const NOW = Date.parse("2026-07-07T13:50:00Z");
const FUTURE = "2026-08-07T00:00:00Z";
const PAST = "2026-06-01T00:00:00Z";

function snap(
  status: string | null,
  tier: SubscriptionSnapshot["tier"],
  interval: SubscriptionSnapshot["interval"],
  currentPeriodEnd: string | null = FUTURE,
): SubscriptionSnapshot {
  return { status, tier, interval, currentPeriodEnd };
}

Deno.test("decide: created (no prior row) active => new", () => {
  assertEquals(
    decideSubscriptionNotification(
      null,
      snap("active", "architecte", "monthly"),
      NOW,
    ),
    "new",
  );
});

Deno.test("decide: trialing -> active is a first paid activation => new", () => {
  assertEquals(
    decideSubscriptionNotification(
      snap("trialing", "architecte", "monthly"),
      snap("active", "architecte", "monthly"),
      NOW,
    ),
    "new",
  );
});

Deno.test("decide: reactivation after a lapsed period => new", () => {
  assertEquals(
    decideSubscriptionNotification(
      snap("active", "architecte", "monthly", PAST),
      snap("active", "architecte", "monthly"),
      NOW,
    ),
    "new",
  );
});

Deno.test("decide: tier upgrade on active subscription => modified", () => {
  assertEquals(
    decideSubscriptionNotification(
      snap("active", "alliance", "monthly"),
      snap("active", "architecte", "monthly"),
      NOW,
    ),
    "modified",
  );
});

Deno.test("decide: interval change on active subscription => modified", () => {
  assertEquals(
    decideSubscriptionNotification(
      snap("active", "architecte", "monthly"),
      snap("active", "architecte", "yearly"),
      NOW,
    ),
    "modified",
  );
});

Deno.test("decide: same tier/interval (renewal, card change) => no message", () => {
  assertEquals(
    decideSubscriptionNotification(
      snap("active", "architecte", "monthly"),
      snap("active", "architecte", "monthly"),
      NOW,
    ),
    null,
  );
});

Deno.test("decide: becoming inactive => no message", () => {
  assertEquals(
    decideSubscriptionNotification(
      snap("active", "architecte", "monthly"),
      snap("canceled", "architecte", "monthly"),
      NOW,
    ),
    null,
  );
});

Deno.test("dedup key: 'new' collapses per subscription; two updated events for one change share a key", () => {
  assertEquals(
    notificationDedupKey("sub_1", "new", "architecte", "monthly"),
    "sub_1:new",
  );

  const a = notificationDedupKey("sub_1", "modified", "architecte", "monthly");
  const b = notificationDedupKey("sub_1", "modified", "architecte", "monthly");
  assertEquals(a, b);

  const later = notificationDedupKey(
    "sub_1",
    "modified",
    "architecte",
    "yearly",
  );
  assertEquals(later === a, false);
});

Deno.test("modified text uses human tier label", () => {
  assertEquals(tierLabel("architecte"), "Architecte");
  const text = subscriptionModifiedText("architecte");
  assertEquals(text.includes("Architecte"), true);
});
