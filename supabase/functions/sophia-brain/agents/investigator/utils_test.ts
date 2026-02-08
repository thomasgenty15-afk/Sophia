import { resolveBinaryConsent } from "./utils.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`Assertion failed.\nExpected: ${e}\nActual:   ${a}`);
  }
}

Deno.test("resolveBinaryConsent: resolves yes/no deterministically", () => {
  assertEquals(resolveBinaryConsent("oui vas-y"), "yes");
  assertEquals(resolveBinaryConsent("non pas maintenant"), "no");
});

Deno.test("resolveBinaryConsent: conflict yes+no returns null", () => {
  assertEquals(resolveBinaryConsent("oui mais pas maintenant"), null);
});

Deno.test("resolveBinaryConsent: dispatcher override wins", () => {
  assertEquals(
    resolveBinaryConsent("je sais pas", { overrideConfirmed: true }),
    "yes",
  );
  assertEquals(
    resolveBinaryConsent("oui", { overrideConfirmed: false }),
    "no",
  );
});
