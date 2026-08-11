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

Deno.test("la génération de repas de foyer interroge la couverture", async () => {
  const src = await Deno.readTextFile(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  );
  assert(
    src.includes("keel_household_is_covered"),
    "generate-household-meal-v1 n'appelle plus keel_household_is_covered: la " +
      "porte que D4 ferme est rouverte, et rien ne le dit.",
  );
  assert(
    src.includes("household_frozen"),
    "generate-household-meal-v1 ne rend plus le motif NOMMÉ `household_frozen`: " +
      "un refus muet se lit comme une panne.",
  );
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
