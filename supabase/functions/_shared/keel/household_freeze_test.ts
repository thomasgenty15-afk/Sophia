// ===========================================================================
// LE GEL DU FOYER — CE QUI NE PEUT PAS SE PROUVER EN BASE (chantier 3, D4)
//
// Le gel LUI-MÊME se prouve en base, et il y est prouvé: le bloc de contrôle
// de `20260811050000_household_freeze.sql` monte un vrai foyer, le gèle, et
// compare son contenu avant/après. Ce fichier-ci ne le rejoue pas — il tient
// les DEUX choses qu'un test SQL ne peut pas voir:
//
//   1. LA CONSTANTE DUPLIQUÉE ENTRE DEUX RUNTIMES. `HOUSEHOLD_TRIAL_DAYS`
//      (Deno) et `keel_household_trial_days()` (SQL) disent le même nombre, ou
//      un foyer neuf naît avec une date que le produit ne promet pas.
//   2. LE FIL REBRANCHÉ. Les deux portes que D4 ferme CITENT la définition
//      unique. Un lot suivant qui retirerait l'appel laisserait une garde
//      construite et débranchée — le mode d'échec n°1 de ce dépôt, et il ne
//      casse aucune compilation.
//
// Et une troisième, qui est le piège n°1 nommé par le chantier: PERSONNE
// D'AUTRE NE RÉÉCRIT LA RÈGLE. Une règle écrite deux fois est une divergence
// en attente.
// ===========================================================================

// ⟳ 2026-09-11 · LOT 7 — LES CAS QUI N'ÉPROUVAIENT QUE `generate-meal-v1`
// SONT PARTIS AVEC ELLE. Aucune assertion métier n'a été retirée pour faire
// taire un rouge: chacun avait son jumeau FOYER, qui reste. Le détail de
// l'audit est dans `scratchpad/2026-09-11-LOT7-SUPPRESSION/`.
import { assert, assertEquals } from "jsr:@std/assert@1";

import { HOUSEHOLD_TRIAL_DAYS } from "../billing-tier.ts";

const MIGRATIONS_DIR = new URL("../../../migrations/", import.meta.url);
const FUNCTIONS_DIR = new URL("../../", import.meta.url);

async function migrationFilesSorted(): Promise<string[]> {
  const names: string[] = [];
  for await (const e of Deno.readDir(MIGRATIONS_DIR)) {
    if (e.isFile && e.name.endsWith(".sql")) names.push(e.name);
  }
  return names.sort();
}

/**
 * Le corps de la DERNIÈRE définition de cette fonction dans les migrations.
 *
 * ⚠️ AUCUNE MIGRATION N'EST CITÉE PAR SON NOM, pour la même raison que
 * `tier_vocabulary_test.ts`: coder `20260811050000` en dur rendrait ce test
 * faux-vert le jour où quelqu'un redéfinit la fonction ailleurs — exactement
 * la panne qu'il existe pour empêcher.
 */
async function lastFunctionBody(fnName: string): Promise<string> {
  let found = "";
  for (const name of await migrationFilesSorted()) {
    const sql = await Deno.readTextFile(new URL(name, MIGRATIONS_DIR));
    const re = new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${fnName}\\s*\\(([\\s\\S]*?)\\$function\\$([\\s\\S]*?)\\$function\\$`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) found = m[2];
  }
  assert(found, `public.${fnName} introuvable dans supabase/migrations`);
  return found;
}

/**
 * Le code SANS ses commentaires.
 *
 * ⚠️ CICATRICE DU DÉPÔT: « un audit d'appelants au grep naïf compte des faux
 * vivants ». Les deux portes de ce chantier EXPLIQUENT en commentaire
 * pourquoi elles ne relisent pas `free_until` — un scan qui garderait les
 * commentaires les accuserait précisément de ce qu'elles refusent de faire.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Tous les `.ts` de `supabase/functions`, `node_modules` exclu. */
async function functionSources(): Promise<Array<[string, string]>> {
  const out: Array<[string, string]> = [];
  async function walk(dir: URL, prefix: string): Promise<void> {
    for await (const e of Deno.readDir(dir)) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const child = new URL(`${e.name}${e.isDirectory ? "/" : ""}`, dir);
      if (e.isDirectory) {
        await walk(child, `${prefix}${e.name}/`);
      } else if (e.name.endsWith(".ts")) {
        out.push([`${prefix}${e.name}`, await Deno.readTextFile(child)]);
      }
    }
  }
  await walk(FUNCTIONS_DIR, "");
  return out;
}

// ---------------------------------------------------------------------------
// 1. LA CONSTANTE, DANS LES DEUX RUNTIMES
// ---------------------------------------------------------------------------

Deno.test("l'essai du foyer dit le même nombre en SQL et en Deno", async () => {
  const body = await lastFunctionBody("keel_household_trial_days");
  const m = body.match(/select\s+(\d+)/i);
  assert(m, `keel_household_trial_days() ne rend pas un littéral: ${body}`);
  assertEquals(
    Number(m![1]),
    HOUSEHOLD_TRIAL_DAYS,
    "keel_household_trial_days() (SQL) et HOUSEHOLD_TRIAL_DAYS (billing-tier.ts) " +
      "ont divergé: un foyer neuf naîtrait avec un essai que le produit ne " +
      "promet pas, et personne ne le verrait avant la première expiration.",
  );
});

Deno.test("le défaut de households.free_until CITE la constante", async () => {
  let posed = false;
  for (const name of await migrationFilesSorted()) {
    const sql = await Deno.readTextFile(new URL(name, MIGRATIONS_DIR));
    if (
      /alter\s+column\s+free_until[\s\S]{0,120}set\s+default[\s\S]{0,120}keel_household_trial_days\s*\(\s*\)/i
        .test(sql)
    ) posed = true;
  }
  assert(
    posed,
    "aucune migration ne pose le défaut de households.free_until sur " +
      "keel_household_trial_days(). Sans écrivain, aucun foyer neuf n'a de " +
      "date, donc aucun n'expire: le gel serait une garde désarmée.",
  );
});

// ---------------------------------------------------------------------------
// 2. LES DEUX PORTES CITENT LA DÉFINITION UNIQUE
// ---------------------------------------------------------------------------

/**
 * L'APPEL, pas le mot.
 *
 * ⚠️ MESURÉ EN MUTANT, le 2026-08-11: un `src.includes("keel_household_is_
 * covered")` reste VERT quand on renomme la RPC en
 * `keel_household_is_covered_XX` (le nom cassé contient l'ancien) ET quand on
 * supprime l'appel, parce que le gros commentaire qui explique la garde cite
 * le nom. Deux fois la cicatrice « un audit d'appelants au grep naïf compte
 * des faux vivants » — dans le fichier même qui la nomme.
 *
 * Donc: commentaires retirés, et la forme d'APPEL exigée, guillemet fermant
 * compris.
 */
function callsCoverageRpc(src: string): boolean {
  return /rpc\(\s*["']keel_household_is_covered["']/.test(stripComments(src));
}

/** Le motif NOMMÉ, rendu comme valeur — pas cité dans une prose. */
function returnsFrozenReason(src: string): boolean {
  return /["']household_frozen["']/.test(stripComments(src));
}

Deno.test("la génération de repas de foyer interroge la couverture", async () => {
  const src = await Deno.readTextFile(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  );
  assert(
    callsCoverageRpc(src),
    "generate-household-meal-v1 n'appelle plus keel_household_is_covered: la " +
      "porte que D4 ferme est rouverte, et rien ne le dit.",
  );
  assert(
    returnsFrozenReason(src),
    "generate-household-meal-v1 ne rend plus le motif NOMMÉ `household_frozen`: " +
      "un refus muet se lit comme une panne.",
  );
});

Deno.test("la génération de repas PERSONNELLE interroge la couverture", async () => {
  // D13 — LA PORTE VOISINE. Mesuré le 2026-08-11: un foyer gelé se voyait
  // refuser `generate-household-meal-v1`, puis obtenait 200 ici, et le plan
  // écrit portait quand même le `household_id` de ce foyer. Un 402 qui se
  // contourne par une porte voisine n'est pas un 402.
  const src = await Deno.readTextFile(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  );
  assert(
    callsCoverageRpc(src),
    "generate-meal-v1 n'appelle plus keel_household_is_covered: le gel du " +
      "foyer se contourne par la porte du plan personnel, et rien ne le dit.",
  );
  assert(
    returnsFrozenReason(src),
    "generate-meal-v1 ne rend plus le motif NOMMÉ `household_frozen`: le " +
      "front mappe CE mot (HouseholdPage), et deux vocabulaires pour un même " +
      "refus est une dette payée deux fois.",
  );
});

Deno.test("le gel personnel ne coûte pas un appel modèle", async () => {
  // ⚠️ LE SEUL TEST QUI PROTÈGE LE COÛT. Une garde posée APRÈS la génération
  // refuse tout aussi correctement — en HTTP, elle est indiscernable — et
  // brûle les 19 805 jetons qu'elle existe pour ne pas dépenser. La position
  // ne se prouve donc pas par le comportement, seulement par la source.
  for (
    const fn of ["generate-household-meal-v1/index.ts"]
  ) {
    const src = stripComments(
      await Deno.readTextFile(new URL(fn, FUNCTIONS_DIR)),
    );
    const guard = src.search(/rpc\(\s*["']keel_household_is_covered["']/);
    const model = src.indexOf("generateWithGemini(");
    assert(guard >= 0, `${fn}: garde de couverture absente`);
    assert(model >= 0, `${fn}: appel modèle introuvable — test à réviser`);
    assert(
      guard < model,
      `${fn}: la garde de couverture est APRÈS le premier appel modèle. Le ` +
        `refus reste juste, et c'est ce qui le rend invisible: il se paie ` +
        `désormais au prix d'une génération complète.`,
    );
  }
});

Deno.test("un impayé n'écrit pas dans le journal d'incidents", async () => {
  // MESURÉ LE 2026-08-12, sur la campagne réelle de L1: 15 lignes de
  // `system_error_logs` au niveau `error` — 9 pour `generate-meal-v1`, 6 pour
  // le foyer — produites par des refus de paiement, en UNE session de test.
  //
  // `jsonResponse` journalise tout statut >= 400 sauf `skipErrorLog`. Un foyer
  // gelé qui retape « Composer » écrit donc une ligne d'incident par appui.
  // Un journal où l'état produit le plus banal est majoritaire est un journal
  // qu'on cesse de lire — et c'est là qu'on cherche les vraies pannes.
  //
  // La trace reste ENTIÈRE: le `console.log` nommé (`keel.*.frozen`) porte la
  // personne et le foyer, juste au-dessus du refus. Ce test garde le silence
  // du journal d'incidents, pas le silence tout court.
  for (
    const fn of ["generate-household-meal-v1/index.ts"]
  ) {
    const src = stripComments(
      await Deno.readTextFile(new URL(fn, FUNCTIONS_DIR)),
    );
    const at = src.search(/["']household_frozen["']/);
    assert(at >= 0, `${fn}: le motif nommé a disparu — test à réviser`);
    // La fin de l'appel `jsonResponse`, donc l'objet d'options qui porte le
    // statut. On ne cherche pas dans tout le fichier: `skipErrorLog` ailleurs
    // ne prouverait rien sur CE refus.
    const tail = src.slice(at, at + 600);
    const opts = tail.match(/\{\s*status:\s*402[^}]*\}/);
    assert(
      opts,
      `${fn}: le refus \`household_frozen\` ne rend plus 402 dans les 600 ` +
        `caractères qui suivent son motif — test à réviser.`,
    );
    assert(
      /skipErrorLog:\s*true/.test(opts[0]),
      `${fn}: le refus de paiement repart dans \`system_error_logs\` au ` +
        `niveau \`error\`. Ce n'est pas un incident, c'est l'état produit le ` +
        `plus banal du foyer impayé, et il noie le journal où l'on cherche ` +
        `les pannes.`,
    );
  }
});

// ⚠️ ── LA SECONDE PORTE DE D4 A DISPARU AVEC SON CANAL (2026-09-01) ────────
//
// Il y avait ici « la recommandation quotidienne saute les foyers gelés », qui
// lisait `daily_recommendation_engine.ts` et exigeait qu'il interroge
// `keel_household_coverage_for_user`.
//
// **Ce moteur n'existe plus** : FF-028 est abandonnée (il n'y a pas de
// recommandation en plein milieu de plan). La garde n'est donc pas « rouverte
// sans casser une compilation » — son SUJET a disparu, ce qui est le seul cas
// où retirer une épreuve de fil est légitime.
//
// LA PORTE DE COMPOSITION, ELLE, EST INTACTE et reste tenue plus bas :
// `generate-meal-v1`, `generate-household-meal-v1` et
// `household-merge-notices-v1` appellent tous `keel_household_is_covered`.
//
// 🔴 CE QUE ÇA LAISSE OUVERT, ET IL FAUT LE SAVOIR AVANT DE LE DÉCOUVRIR :
// `keel-weight-divergence-v1` (FF-056) hérite du rôle de canal proactif du
// soir, et il NE PORTE PAS cette garde — vérifié le 2026-09-01, `grep
// household_coverage weight_divergence_engine.ts` est vide. Un foyer gelé peut
// donc recevoir une question de divergence tant que son dernier plan écoulé est
// assez frais (`lastElapsedPlanEnd`). La fenêtre est étroite — un foyer gelé ne
// peut plus composer, donc ses plans vieillissent — mais elle n'est pas nulle.
//
// Ce n'est PAS corrigé ici, exprès : ajouter une garde de facturation à un
// moteur de sécurité est une décision produit, pas un effet de bord de retrait.

// ---------------------------------------------------------------------------
// 3. UNE SEULE DÉFINITION — LE PIÈGE N°1 DE CE LOT
// ---------------------------------------------------------------------------

Deno.test("personne ne relit `free_until` hors de la facturation", async () => {
  // LA FACTURATION a le droit de la lire: elle répond « faut-il facturer ce
  // mois-ci », qui n'est PAS « ce foyer est-il gelé ». Tout autre lecteur
  // TypeScript serait une SECONDE définition du gel — celle qui divergera au
  // premier ajustement, et dont personne ne saura laquelle ment.
  const ALLOWED = new Set([
    "_shared/billing-tier.ts",
    "stripe-reconcile-households/reconcile.ts",
    "stripe-reconcile-households/reconcile_test.ts",
    "stripe-reconcile-households/index.ts",
    "stripe-create-checkout-session/index.ts",
    "_shared/keel/household_freeze_test.ts",
    // ⟳ 2026-09-11 — UN BANC QUI POSE UN DÉCOR N'EST PAS UNE DÉFINITION. Ce
    // fichier ÉCRIT `free_until` sur le foyer d'essai, lit la valeur d'avant
    // et la restaure à la fin: il fabrique un foyer gelé pour vérifier ce que
    // le runtime en fait. Il ne répond jamais « ce foyer est-il couvert » —
    // c'est toujours `keel_household_is_covered` qui tranche. La garde reste
    // donc entière pour tout lecteur de production.
    "_shared/keel/lot8_integration_handler_test.ts",
  ]);
  const offenders: string[] = [];
  for (const [name, src] of await functionSources()) {
    if (ALLOWED.has(name)) continue;
    if (stripComments(src).includes("free_until")) offenders.push(name);
  }
  assertEquals(
    offenders,
    [],
    "ces fichiers lisent `free_until` hors du chemin de facturation. « Ce " +
      "foyer est-il couvert » a UNE définition, en SQL " +
      "(keel_household_is_covered): la réécrire en TypeScript est le défaut " +
      "que le chantier 3 existe pour retirer.",
  );
});
// ⟳ 2026-09-11 · LOT 7 — C5 ⑦ EST PARTI AVEC `generate-meal-v1`.
// Il épinglait que la panne de `resolveHouseholdIdFor` était JOURNALISÉE dans
// la lane individuelle. Cette fonction n'existe plus, et la lane du foyer
// n'a jamais eu ce chemin: elle jette sur sa lecture de siège
// (`if (meRes.error) throw`), ce que le lot 2 a épinglé ailleurs.


// ===========================================================================
// C5 ⑥ — UN 500 DIT DE QUOI, ET PAS « [object Object] »
//
// MESURÉ: `HTTP=500 {"ok":false,"error":"[object Object]"}`. Une
// `PostgrestError` est un objet nu; `String(...)` la rend illisible pour
// l'élève ET pour la ligne HTTP du journal. Le vrai message n'existait que dans
// `system_error_logs`.
// ===========================================================================

Deno.test("C5 ⑥ — aucun générateur ne rend `[object Object]` dans son corps", async () => {
  for (
    const fn of [
      // ⟳ 2026-09-11 · LOT 7 — une seule lane reste. La boucle est GARDÉE sur
      // un élément: la propriété est « sur CHAQUE générateur », pas « sur
      // celui-ci », et un second s'y ajoutera au lieu de rouvrir un test.
      "generate-household-meal-v1/index.ts",
    ]
  ) {
    const src = stripComments(
      await Deno.readTextFile(new URL(fn, FUNCTIONS_DIR)),
    );
    assert(
      !/instanceof Error \? \w+\.message : String\(/.test(src),
      `${fn}: le raccourci \`instanceof Error ? … : String(…)\` est revenu. ` +
        `Une PostgrestError n'est pas une \`Error\`: le corps rendra ` +
        `« [object Object] », et la cause n'existera que dans les logs.`,
    );
    assert(
      src.includes("readableErrorMessage("),
      `${fn}: le lecteur d'erreur partagé n'est plus appelé.`,
    );
  }
});

Deno.test("C5 ⑥ — LE CAS QUI PASSE: une PostgrestError se lit", async () => {
  const { readableErrorMessage } = await import("../error-log.ts");
  // La forme EXACTE mesurée: un objet nu, sans prototype `Error`.
  const pgError = {
    code: "23502",
    details: null,
    hint: null,
    message:
      'null value in column "content_locale" of relation ' +
      '"contract_change_requests" violates not-null constraint',
  };
  const text = readableErrorMessage(pgError);
  assert(!text.includes("[object Object]"), text);
  assert(text.includes("content_locale"), text);
  assert(text.includes("23502"), text);
  // Et le filet du filet: un objet SANS message ne retombe pas non plus sur
  // « [object Object] ».
  assert(!readableErrorMessage({ a: 1 }).includes("[object Object]"));
  assert(!readableErrorMessage(Object.create(null)).includes("[object Object]"));
  // Une vraie `Error` garde son message, mot pour mot.
  assertEquals(readableErrorMessage(new Error("boom")), "boom");
});

// ---------------------------------------------------------------------------
// FF-064 — LE PAIEMENT ANTICIPÉ EST BRANCHÉ, ET LE REFUS QU'IL REMPLACE EST
// PARTI
// ---------------------------------------------------------------------------
//
// Ces deux assertions sont des épreuves de FIL, pas de logique: le calcul de
// `trial_end` est prouvé dans `_shared/billing-tier_test.ts`, mais un calcul
// juste qu'on n'appelle nulle part est un lot désarmé qui ressemble à un lot
// qui marche. Elles lisent la SOURCE parce que c'est la seule façon de le voir
// sans un compte Stripe.
Deno.test("le tunnel du foyer pose `trial_end`, et ne refuse plus l'essai", async () => {
  const src = stripComments(
    await Deno.readTextFile(
      new URL("stripe-create-checkout-session/index.ts", FUNCTIONS_DIR),
    ),
  );

  // 1. LE REFUS EST PARTI. `household_in_trial` renvoyait 409 à quiconque
  //    voulait payer pendant sa semaine offerte — c'est-à-dire à tout le monde,
  //    puisque c'est la seule fenêtre où l'app fonctionne encore.
  assert(
    !/["']household_in_trial["']/.test(src),
    "le refus `household_in_trial` est revenu. Il n'a plus de raison d'être: " +
      "l'objection qui l'avait créé (Stripe exige 48 h) est répondue par le " +
      "repli à 49 h de `householdStripeTrialEnd`, qui ne peut que DÉPASSER la " +
      "promesse.",
  );

  // 2. LA CLÉ EST DANS `subscription_data`, ET PAS AILLEURS. Posée à côté —
  //    au niveau de la session — Stripe l'ignore en silence, et la semaine
  //    offerte se ferait facturer sans que rien ne le dise.
  const at = src.indexOf("subscription_data:");
  assert(at >= 0, "`subscription_data` a disparu du tunnel — test à réviser.");
  const tail = src.slice(at, at + 400);
  assert(
    /trial_end:\s*householdStripeTrialEnd\(/.test(tail),
    "`trial_end` n'est plus posé dans les 400 caractères qui suivent " +
      "`subscription_data`. Hors de cet objet, Stripe l'ignore SANS ERREUR, " +
      "et le premier prélèvement tombe le jour du paiement.",
  );

  // 3. ⛔ LA CARTE RESTE OBLIGATOIRE. `payment_method_collection:
  //    "if_required"` laisserait démarrer un essai sans moyen de paiement,
  //    c'est-à-dire un mur qui retombe dans sept jours.
  assert(
    !/payment_method_collection/.test(src),
    "quelqu'un a touché à `payment_method_collection`. Avec un `trial_end`, " +
      "Checkout collecte la carte par défaut; la rendre facultative rouvre le " +
      "mur une semaine plus tard.",
  );
});
