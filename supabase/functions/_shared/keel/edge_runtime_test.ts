// `keepWorking` : dit la vérité sur ce que le runtime a accepté.
//
// Deux cas, et les deux comptent : sans `EdgeRuntime` (les tests, un runtime
// inconnu) la promesse tourne mais rien ne la protège — `false`, et l'appelant
// le journalise ; avec `EdgeRuntime.waitUntil`, la promesse EST transmise, une
// fois, protégée d'un rejet.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { keepWorking } from "./edge_runtime.ts";

type Host = { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } };

Deno.test("sans EdgeRuntime : rend false, la promesse n'est pas orpheline", async () => {
  const host = globalThis as Host;
  const before = host.EdgeRuntime;
  delete host.EdgeRuntime;
  try {
    const registered = keepWorking(Promise.reject(new Error("boum")));
    assertEquals(registered, false);
    // Un tour de boucle : le rejet a été absorbé, sinon Deno le signalerait.
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (before) host.EdgeRuntime = before;
  }
});

Deno.test("avec EdgeRuntime.waitUntil : rend true et transmet UNE promesse", async () => {
  const host = globalThis as Host;
  const before = host.EdgeRuntime;
  const received: Promise<unknown>[] = [];
  host.EdgeRuntime = { waitUntil: (work) => received.push(work) };
  try {
    let done = false;
    const work = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      done = true;
    })();
    const registered = keepWorking(work);
    assertEquals(registered, true);
    assertEquals(received.length, 1);
    await received[0];
    assert(done, "la promesse transmise est bien celle du travail");
  } finally {
    if (before) host.EdgeRuntime = before;
    else delete host.EdgeRuntime;
  }
});
