/**
 * CONTINUER APRÈS AVOIR RÉPONDU — le seul geste que le runtime edge permet.
 *
 * Supabase coupe toute fonction qui n'a pas RÉPONDU en 150 s. Une fois la
 * réponse partie, l'isolat n'est gardé en vie que pour les promesses confiées à
 * `EdgeRuntime.waitUntil()`, et jusqu'au mur de la machine (400 s en plan
 * payant, 150 s en gratuit — mesuré par `keel-runtime-probe-v1`, pas déduit).
 *
 * ⛔ CE N'EST PAS UNE FILE. La promesse meurt avec le worker ; ce qui survit est
 * la LIGNE (`student_meal_drafts`), relue et relancée par la base. Ce module ne
 * fait qu'une chose : dire au runtime « j'ai encore du travail », et dire à
 * l'appelant si le runtime l'a entendu.
 *
 * `EdgeRuntime` n'est pas déclaré par `jsr:@supabase/functions-js/edge-runtime.d.ts`
 * dans la version que ce dépôt épingle ; on le lit sur `globalThis`, sans
 * déclaration ambiante, pour que le typecheck passe en test comme en production.
 */
type WaitUntilHost = {
  EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void };
};

/**
 * Confie `work` au runtime. Rend `true` si le runtime l'a pris ; `false` si
 * `EdgeRuntime.waitUntil` n'existe pas ici — la promesse tourne alors sans
 * garantie, et l'appelant DOIT le journaliser plutôt que le supposer.
 *
 * Une promesse rejetée n'est jamais laissée orpheline : sans `catch`, un rejet
 * après la réponse ferait planter l'isolat pour tout le monde.
 */
export function keepWorking(work: Promise<unknown>): boolean {
  const host = globalThis as WaitUntilHost;
  const guarded = work.catch((failure) => {
    console.error(JSON.stringify({
      tag: "keel.edge_runtime",
      event: "background_rejected",
      message: failure instanceof Error ? failure.message : String(failure),
    }));
  });
  const waitUntil = host.EdgeRuntime?.waitUntil;
  if (typeof waitUntil !== "function") return false;
  waitUntil.call(host.EdgeRuntime, guarded);
  return true;
}
