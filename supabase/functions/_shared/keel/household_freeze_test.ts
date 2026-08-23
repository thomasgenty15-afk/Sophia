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
    new URL("generate-meal-v1/index.ts", FUNCTIONS_DIR),
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
    const fn of ["generate-meal-v1/index.ts", "generate-household-meal-v1/index.ts"]
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
    const fn of ["generate-meal-v1/index.ts", "generate-household-meal-v1/index.ts"]
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

Deno.test("le gel personnel ne mord QUE sur un foyer connu et non couvert", async () => {
  // UNE GARDE A BESOIN D'UN CAS QUI PASSE. Cassée, elle refuse tout et
  // ressemble trait pour trait à une garde qui marche. Les trois cas qui
  // DOIVENT passer sont rejoués ici sur la logique elle-même:
  //
  //   • sans foyer — arbitrage D13, mot pour mot: « il y a des comptes
  //     individuels qui nécessiteront pas de foyer on s'en fout ». La RPC
  //     n'est même pas interrogée.
  //   • foyer couvert — le cas nominal.
  //   • lecture de foyer EN PANNE — fail-open, l'inverse des allergies: on ne
  //     peut pas geler quelqu'un dont on n'a pas su lire le foyer, et une
  //     lecture de facturation cassée qui refuse coupe un client qui paie.
  const decide = (
    householdId: string | null,
    lookupFailed: boolean,
    covered: boolean | null,
  ): "refuse" | "pass" => {
    if (householdId && !lookupFailed) {
      if (covered === false) return "refuse";
    }
    return "pass";
  };

  // ⚠️ `decide` est une COPIE de la condition, et une copie qui dérive est un
  // test faux-vert — ce dépôt a déjà mesuré « un test paramétré par sa propre
  // constante reste vert quand on change la constante ». Les deux lignes
  // ci-dessous rattachent la copie à l'original: si la condition de la source
  // change, ce test tombe avant d'avoir pu mentir.
  const src = await Deno.readTextFile(
    new URL("generate-meal-v1/index.ts", FUNCTIONS_DIR),
  );
  assert(
    src.includes("if (householdId && !householdLookupFailed) {"),
    "la condition d'entrée de la garde a changé dans generate-meal-v1: " +
      "`decide` ci-dessous n'en est plus la copie, et ses cas qui passent ne " +
      "prouvent plus rien.",
  );
  assert(
    stripComments(src).includes('coverRes.data === false'),
    "generate-meal-v1 ne compare plus la couverture à `false`: un `!coverRes." +
      "data` refuserait aussi sur `null`, c'est-à-dire sur une lecture " +
      "illisible — l'inverse exact du fail-open voulu.",
  );

  assertEquals(decide(null, false, null), "pass", "compte sans foyer (D13)");
  assertEquals(decide("h1", false, true), "pass", "foyer couvert");
  assertEquals(decide("h1", true, null), "pass", "résolution du foyer en panne");
  assertEquals(decide(null, true, null), "pass", "pas de foyer, lecture ratée");
  assertEquals(decide("h1", false, null), "pass", "couverture illisible");
  assertEquals(decide("h1", false, false), "refuse", "foyer gelé");
});

Deno.test("la recommandation quotidienne saute les foyers gelés", async () => {
  const src = await Deno.readTextFile(
    new URL("_shared/keel/daily_recommendation_engine.ts", FUNCTIONS_DIR),
  );
  assert(
    src.includes("keel_household_coverage_for_user"),
    "le moteur du soir n'interroge plus la couverture du foyer: D4 ferme DEUX " +
      "portes, et celle-ci s'est rouverte sans casser une compilation.",
  );
});

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

// ===========================================================================
// C5 ⑦ — UNE LECTURE DE FOYER QUI TOMBE NE PEUT PLUS TOMBER EN SILENCE
//
// Le `catch` qui pose `householdLookupFailed` n'écrivait RIEN: ni log, ni
// ligne d'erreur. Le fail-open, lui, est ASSUMÉ (« se tromper de sens coupe un
// client qui paie »). Le silence ne l'était pas, et il coûte DEUX choses:
//
//   · le gel 402 est sauté — et c'est voulu;
//   · `householdId` devient `null`, donc le repli de doctrine de C1/C2
//     disparaît, et un secondaire PAYANT retombe sur `409 no_coach`.
//
// La seconde n'est écrite nulle part quand la fonction refuse avant d'écrire
// une ligne: `generated_from.household_lookup_failed` ne vit que sur un plan
// qui s'écrit. À comparer avec la lecture de COUVERTURE, juste en dessous, qui
// appelle `logEdgeFunctionError` depuis L1.
// ===========================================================================

for (
  const fn of [
    "generate-meal-v1/index.ts",
  ]
) {
  Deno.test(`C5 ⑦ — la panne de résolution du foyer est journalisée — ${fn}`, async () => {
    const src = stripComments(
      await Deno.readTextFile(new URL(fn, FUNCTIONS_DIR)),
    );
    const at = src.indexOf("resolveHouseholdIdFor(admin, userId)");
    assert(at >= 0, `${fn}: la résolution du foyer a disparu — test à réviser`);
    // Le `catch` de CETTE lecture-là, pas un `logEdgeFunctionError` ailleurs
    // dans le fichier: il ne prouverait rien sur cette panne-ci.
    const block = src.slice(at, at + 700);
    assert(
      /catch\s*\(\s*error\s*\)/.test(block),
      `${fn}: l'erreur est de nouveau jetée (\`catch (_error)\`). Une panne ` +
        `qui n'a pas de nom ne se journalise pas.`,
    );
    assert(
      block.includes("logEdgeFunctionError("),
      `${fn}: la panne de résolution du foyer ne laisse AUCUNE trace. Le gel ` +
        `402 est sauté (fail-open assumé) ET le repli de doctrine disparaît — ` +
        `un secondaire payant retombe sur \`no_coach\` sans qu'on puisse le ` +
        `relier à quoi que ce soit.`,
    );
    assert(
      /source:\s*"household_lookup"/.test(block),
      `${fn}: la ligne d'erreur ne nomme plus sa source; elle se confondra ` +
        `avec celle de la couverture, dix lignes plus bas.`,
    );
    // ET LE FAIL-OPEN SURVIT: la panne ne doit pas être devenue un refus.
    assert(
      !/status:\s*(40[0-9]|50[0-9])/.test(block),
      `${fn}: la panne de lecture est devenue un REFUS. C'est l'inverse de ` +
        `l'arbitrage de L1 — un refus qui coupe un client qui paie ne se ` +
        `répare par aucun nouvel essai.`,
    );
  });
}

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
      "generate-meal-v1/index.ts",
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
