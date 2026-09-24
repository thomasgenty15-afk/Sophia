/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 1 — LE VERROU DE SORTIE EST BRANCHÉ SUR LES MÊMES SURFACES, DEUX FOIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI DES ÉPINGLES DE SOURCE. `collectOutputSurfaces` est pur et testé
 * en isolation — et ça ne dit RIEN de l'endroit où il tourne. Or l'endroit EST
 * le lot : le défaut fermé est qu'il existait TROIS listes de champs recopiées
 * à la main (le parseur, `localizeOutputLockBites`, le handler), et qu'aucune
 * ne portait le déroulé d'une session.
 *
 * ⛔ « Le module existe » et « les deux contrôles s'en servent » sont DEUX
 * ÉTATS DIFFÉRENTS. Ce fichier éprouve le second.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const HANDLER = stripComments(
  await sourceFamily(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  ),
);
const MOTEUR = stripComments(
  await sourceFamily(
    new URL("_shared/keel/meal_generation.ts", FUNCTIONS_DIR),
  ),
);

Deno.test("① le parseur DÉRIVE son texte de verrou du recensement", () => {
  assert(
    MOTEUR.includes("const outputSurfaces = collectOutputSurfaces({"),
    "le parseur ne recense plus ses surfaces",
  );
  assert(
    MOTEUR.includes("const rendered = outputSurfacesText(outputSurfaces);"),
    "le texte du verrou global ne descend plus du recensement",
  );
  // ⛔ LA LISTE FAITE MAIN NE DOIT PAS REVENIR. Elle recollait les plats et les
  // casseroles sans les sessions, et c'est le défaut entier.
  assert(
    !MOTEUR.includes("...renderedPortionNotes,\n    ...finalShopping.map("),
    "l'ancien tableau concaténé à la main est de retour",
  );
});

Deno.test("② le parseur passe les SESSIONS au recensement", () => {
  const i = MOTEUR.indexOf("const outputSurfaces = collectOutputSurfaces({");
  assert(i > 0);
  const bloc = MOTEUR.slice(i, i + 400);
  assert(bloc.includes("cookingSessions,"), `les sessions n'y sont pas: ${bloc}`);
});

Deno.test("③ le handler recense DEUX fois: dans la boucle, et avant livraison", () => {
  const appels = HANDLER.split("collectOutputSurfaces({").length - 1;
  assertEquals(
    appels,
    2,
    "le handler doit recenser dans la boucle (pour adresser la réparation) " +
      "et sur l'état final (pour refuser la livraison)",
  );
});

Deno.test("④ la ceinture FINALE lit les sessions ET les parts réellement écrites", () => {
  const i = HANDLER.indexOf("const surfacesFinales = collectOutputSurfaces({");
  assert(i > 0, "la ceinture finale n'existe pas");
  const bloc = HANDLER.slice(i, i + 600);
  assert(bloc.includes("cookingSessions: meal.cooking_sessions,"));
  assert(
    bloc.includes("portionsOut.flatMap("),
    "les notes de part réellement écrites ne sont pas contrôlées",
  );
  assert(bloc.includes("preparationShares.map("));
  // ⟳ 2026-09-13 (second passage) — LA PROSE QUI PART À L'ÉCRAN. `explanation`
  // est écrite par le modèle, rendue par `PlanDraftDialog`, et sa garde propre
  // (`gatePlanExplanation`) ne reçoit AUCUNE contrainte de sécurité.
  assert(
    bloc.includes("explanationLines: explanation.lines"),
    "l'explication rendue à l'écran n'est pas contrôlée",
  );
});

Deno.test("④ bis — les deux relevés d'AMONT ne prétendent pas lire ce qui n'existe pas encore", () => {
  // ⚠️ `portionNotes: []` ET `explanationLines: []` DANS LA BOUCLE, ET C'EST
  // UNE DÉCISION ÉCRITE: les parts et la prose sont produites plus bas dans le
  // même tour. Les remplir là-haut lirait l'état du tour PRÉCÉDENT — le défaut
  // du `current` périmé, déjà payé sur cette lane.
  const i = HANDLER.indexOf("surfaces: collectOutputSurfaces({");
  assert(i > 0);
  const bloc = HANDLER.slice(i, i + 600);
  assert(bloc.includes("portionNotes: []"));
  assert(bloc.includes("explanationLines: []"));
  // ⛔ ET LE PARSEUR NON PLUS: `explanation` est une clé de la lane FOYER,
  // extraite du texte source bien après lui.
  assert(MOTEUR.includes("explanationLines: []"));
});

Deno.test("⑤ la ceinture finale précède le refus, et le refus lit SON relevé", () => {
  const releve = HANDLER.indexOf("const surfacesFinales = collectOutputSurfaces({");
  const refus = HANDLER.indexOf('if (publication.kind === "output_lock_violation") {');
  assert(releve > 0 && refus > releve, "le refus ne lit pas le relevé final");
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 2 § 2.3 — LA PREUVE A CHANGÉ DE NATURE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ELLE DISAIT « LES ÉCRITURES SONT PLUS BAS DANS LE FICHIER ». Une preuve
  // de position ne survit pas au premier déplacement de bloc et ne compte
  // aucune écriture. Les deux écritures vivent maintenant DANS `publier`, et
  // `publier` est passée à `decidePlanPublication`, qui ne l'appelle que si
  // rien ne refuse — donc l'ordre du fichier ne décide plus rien.
  //
  // ⚠️ ET LA PROTECTION COUVRE TOUJOURS LES DEUX SORTIES. `completeDraft` est
  // le magasin d'APERÇU : une candidate dangereuse ne doit pas s'afficher non
  // plus. Les deux sont dans la MÊME fonction injectée.
  const ouverture = HANDLER.indexOf(
    "const publier = async (): Promise<Response> => {",
  );
  const orchestrateur = HANDLER.indexOf(
    "const publication = await decidePlanPublication({",
  );
  const apercu = HANDLER.indexOf('"keel_household_complete_draft_generation"');
  const ecriture = HANDLER.indexOf('"keel_household_publish_generation"');
  assert(ouverture > 0, "la fonction de publication a disparu");
  assert(orchestrateur > ouverture, "le bloc extrait ne suit plus `publier`");
  assert(
    apercu > ouverture && apercu < orchestrateur,
    "le magasin d'aperçu est SORTI de `publier`: il s'écrirait sans le refus",
  );
  assert(
    ecriture > ouverture && ecriture < orchestrateur,
    "l'écriture du plan est SORTIE de `publier`",
  );
  // ⛔ ET `publier` N'A QU'UN SEUL LECTEUR: le bloc extrait. Un second point
  // d'appel rouvrirait un chemin d'écriture qui ne passe par aucun refus.
  assertEquals(
    HANDLER.split("publier").length - 1,
    2,
    "`publier` est déclarée une fois et passée une fois — pas plus",
  );
  assert(
    HANDLER.includes("publish: publier,"),
    "le bloc extrait ne reçoit plus la publication",
  );
});

Deno.test("⑥ un relevé qui JETTE bloque, il ne vaut pas « rien trouvé »", () => {
  // ⟳ 2026-09-13 · LOT 2 § 2.3 — LE `try` A DÉMÉNAGÉ, ET IL EST DÉSORMAIS
  // EXÉCUTÉ PAR UN TEST. Il vivait ici, lu par une épingle de source et jamais
  // parcouru par une exception. Il vit maintenant dans `runValidation`
  // (`plan_publication.ts`), et `plan_publication_test.ts` fait JETER le vrai
  // relevé — `collectOutputSurfaces` sur un plan illisible.
  const i = HANDLER.indexOf("const publication = await decidePlanPublication({");
  assert(i > 0, "le bloc extrait a disparu");
  const fin = HANDLER.indexOf(
    'if (publication.kind === "output_lock_violation") {',
    i,
  );
  assert(fin > i, "le refus de morsure ne suit plus le bloc extrait");
  const bloc = HANDLER.slice(i, fin);
  assert(
    bloc.includes("const surfacesFinales = collectOutputSurfaces({"),
    "le relevé final n'est plus le contrôle passé au bloc",
  );
  assert(
    bloc.includes('reason: "output_lock_unavailable",'),
    "le motif du relevé a disparu",
  );
  assert(
    bloc.includes('issues.push("output_lock_unavailable")'),
    "une panne du relevé ne se compte pas",
  );
  assert(
    bloc.includes('error: "plan_validation_unavailable"'),
    "une panne du relevé n'empêche pas la livraison",
  );
});

Deno.test("⑦ le refus public ne rend AUCUNE recette de la candidate dangereuse", () => {
  const morsure = HANDLER.indexOf('if (publication.kind === "output_lock_violation") {');
  const i = HANDLER.indexOf('error: "plan_not_deliverable"', morsure);
  assert(i > 0, "le refus de livraison a disparu");
  const bloc = HANDLER.slice(i, i + 400);
  // ⛔ UN COMPTE, PAS UN CONTENU. La candidate interne existe pour qu'un patch
  // puisse viser l'unité en cause ; la rendre dans une réponse d'erreur
  // publierait très exactement ce que le verrou existe pour empêcher.
  assert(bloc.includes("detail: [`output_lock:${c4LockBites.length}`]"));
  for (const interdit of ["meal.dishes", "meal.preparations", "unsafe_candidate"]) {
    assert(
      !bloc.includes(interdit),
      `le refus public porte ${interdit}`,
    );
  }
});

Deno.test("⑧ les jetons d'allergène ne partent dans AUCUN journal de ce chemin", () => {
  // ⛔ UN JOURNAL SE RECOPIE DANS UN RAPPORT. Nommer l'allergène de quelqu'un
  // dans une trace est exactement ce que le verrou existe pour empêcher.
  for (const tag of [
    "keel.household_meal.output_lock_localized",
    "keel.household_meal.output_lock_final",
    "keel.household_meal.output_lock_violation",
  ]) {
    const i = HANDLER.indexOf(tag);
    assert(i > 0, `${tag} a disparu`);
    const bloc = HANDLER.slice(i, i + 700);
    assert(!bloc.includes("v.tokens"), `${tag} journalise des jetons`);
    assert(!bloc.includes(".term"), `${tag} journalise un terme`);
  }
});
