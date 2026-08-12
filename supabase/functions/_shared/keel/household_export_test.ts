// ===========================================================================
// C3 ③ — LA DATE DE NAISSANCE SURVIT AU COMPTE, ET L'EXPORT LE DIT
//
// ── LE FAIT, VÉRIFIÉ PLUTÔT QUE SUPPOSÉ ────────────────────────────────────
// `keel_household_purge_user` (migration 20260811040000) DÉTACHE la ligne du
// foyer — `user_id` passe à NULL — au lieu de la supprimer. `first_name` et
// `birth_date` survivent donc au compte effacé. La survie de LA BOUCHE est
// voulue et testée (D3: « une bouche sans compte reste une bouche du foyer »).
// La survie de SA DATE DE NAISSANCE n'avait jamais été décidée — et
// `household_members` n'apparaissait NULLE PART dans `account-export-v1`.
//
// ── CE QUE C3 TRANCHE, ET POURQUOI ─────────────────────────────────────────
// ON GARDE, ET ON LE DIT. Le prénom répond à « pour qui je cuisine ». La date
// de naissance résout l'âge (`keel_household_member_age`), donc la direction de
// service, donc les PARTS — et pas seulement les siennes: retirer une bouche
// datée d'un foyer change la casserole de tout le monde. L'effacer dégraderait
// la composition d'un foyer que la personne quitte, ce qui est exactement le
// dégât que D3 existe pour empêcher.
//
// Ce qui manquait n'était donc pas l'effacement, c'était la DÉCLARATION: une
// donnée qu'on garde et qu'on ne dit pas est le seul des deux qui n'a aucune
// justification. L'export porte maintenant la ligne ET la phrase.
//
// ── L'OPTION ÉCARTÉE ───────────────────────────────────────────────────────
// Effacer `birth_date` à la purge (`user_id = null, birth_date = null`). Coût:
// toutes les bouches détachées repassent en `unknown`, donc en part standard,
// en silence — et le foyer ne peut pas la ressaisir puisqu'il ne sait pas
// qu'elle a disparu. Retour arrière de la décision prise: une ligne dans
// `keel_household_purge_user`, plus la ligne d'export ci-dessous.
// ===========================================================================

import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

async function exportSource(): Promise<string> {
  return await Deno.readTextFile(
    new URL("account-export-v1/index.ts", FUNCTIONS_DIR),
  );
}

Deno.test("C3 ③ — `household_members` EST DANS L'EXPORT, scopée à SA ligne", async () => {
  const src = await exportSource();
  const at = src.indexOf('"household_members"');
  assert(
    at >= 0,
    "la seule table dont des données personnelles survivent à la purge n'est " +
      "de nouveau exportée nulle part.",
  );
  const call = src.slice(at, at + 200);
  assert(
    call.includes('"user_id"'),
    "la lecture n'est plus scopée par `user_id`: l'export RGPD de l'un " +
      "divulguerait les autres bouches du foyer.",
  );
  // ⚠️ `joined_at`, PAS `created_at`. Cette table n'a pas de `created_at`, et un
  // tri sur une colonne inexistante ferait tomber la lecture dans le filet
  // `tables_indisponibles` — donc un export silencieusement VIDE sur la seule
  // table qui survit à la purge. Le pire des deux mondes: la clé est là, la
  // donnée n'y est pas.
  assert(
    call.includes('"joined_at"'),
    "le tri est revenu sur `created_at`, qui n'existe pas sur cette table: " +
      "l'export rend du vide sans le dire.",
  );
});

Deno.test("C3 ③ — LES DEUX CHAMPS QUI SURVIVENT SONT DANS L'ALLOWLIST", async () => {
  const src = await exportSource();
  const at = src.indexOf("householdMembers:");
  assert(at >= 0, "l'allowlist de colonnes a disparu");
  const scope = src.slice(at, at + 300);
  for (const column of ["first_name", "birth_date", "goal", "away_days"]) {
    assert(
      scope.includes(column),
      `${column} n'est plus exportée. L'allowlist est PAR COLONNE: une colonne ` +
        `absente ne sort pas, et ce dépôt a déjà oublié neuf tables ici.`,
    );
  }
});

Deno.test("C3 ③ — L'EXPORT DIT CE QU'IL GARDE, pas seulement ce qu'il détient", async () => {
  // ⚠️ LA MOITIÉ QUI COMPTE. Rendre la ligne sans dire qu'elle survit à la
  // suppression ferait un export exact et une information manquante: la
  // personne saurait ce qu'on a, pas ce qu'on gardera.
  const src = await exportSource();
  assert(
    src.includes('"mon_foyer.json"'),
    "le fichier de foyer a disparu de l'archive",
  );
  assert(
    src.includes("ce_qui_survit_a_la_suppression"),
    "l'archive ne dit plus ce qui survit à la suppression du compte.",
  );
  assert(
    src.includes("champs_conserves"),
    "la liste des champs conservés a disparu: « on garde des choses » sans " +
      "dire lesquelles est pire que se taire.",
  );
  assert(
    src.includes("comment_les_effacer"),
    "l'archive ne dit plus comment effacer aussi la bouche (« retirer aussi " +
      "ma place dans ce foyer »): un droit qu'on ne nomme pas ne s'exerce pas.",
  );
  // Et le README de l'archive le nomme: un fichier qu'aucune ligne n'annonce
  // n'est pas lu.
  assert(
    src.includes("mon_foyer.json       :"),
    "le README de l'archive n'annonce plus ce fichier.",
  );
});

Deno.test("C3 ③ — LE DÉTACHEMENT RESTE LA RÈGLE (D3), et la purge ne l'a pas changée", async () => {
  // Le cas qui PASSE de l'autre côté: ce lot ne touche PAS à la purge. Si un
  // jour quelqu'un décide d'effacer la date, c'est ici que ça se verra — et le
  // texte d'export ci-dessus deviendra faux au même instant.
  const sql = await Deno.readTextFile(
    new URL("../../../migrations/20260811040000_household_detachment.sql", import.meta.url),
  );
  const at = sql.indexOf("create or replace function public.keel_household_purge_user");
  assert(at >= 0, "la purge a disparu — test à réviser");
  const body = sql.slice(at, sql.indexOf("comment on function public.keel_household_purge_user"));
  assert(
    body.includes("set user_id = null"),
    "la purge ne DÉTACHE plus: D3 est renversé, et la phrase d'export ment.",
  );
  assertEquals(
    body.includes("birth_date = null"),
    false,
    "la purge efface désormais la date de naissance: c'est peut-être juste, " +
      "mais alors `ce_qui_survit_a_la_suppression` doit être réécrit — cette " +
      "assertion est là pour que les deux ne puissent pas diverger en silence.",
  );
});
