/**
 * LOT 1.1 — L'ÉCHÉANCE EST UNE SEULE VALEUR, DES DEUX CÔTÉS.
 *
 * `keel_household_claim_generation` reçoit `p_stale_after` du handler (440 s) ;
 * `keel_household_request_status` lit la sienne dans
 * `keel_generation_stale_after()`. Si l'un bouge sans l'autre, la lecture
 * dira « en vol » sur un bail que la prise balaie déjà — ou l'inverse. Ce
 * test épingle les trois sites sur le fichier de migration.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  GENERATION_LOCK_MARGIN_MS,
  PLAN_REQUEST_BUDGET_MS,
} from "./generation_model.ts";

const ROOT = new URL("../../../", import.meta.url);
const SQL = await Deno.readTextFile(
  new URL("migrations/20260915100000_l_echeance_est_lue.sql", ROOT),
);
const HANDLER = await Deno.readTextFile(
  new URL("functions/generate-household-meal-v1/index.ts", ROOT),
);

Deno.test("épinglage — l'échéance SQL vaut budget + marge, soit 440 s", () => {
  assertEquals(PLAN_REQUEST_BUDGET_MS + GENERATION_LOCK_MARGIN_MS, 440_000);
  assert(SQL.includes("select interval '440 seconds'"));
});

Deno.test("la prise passe la MÊME échéance que la lecture", () => {
  assert(
    HANDLER.includes(
      "const lockTtlMs = PLAN_REQUEST_BUDGET_MS + GENERATION_LOCK_MARGIN_MS;",
    ),
  );
  assert(HANDLER.includes("p_stale_after: `${Math.round(lockTtlMs / 1000)} seconds`,"));
});

Deno.test("la lecture de statut lit l'âge du verrou ET du brouillon en vol", () => {
  assert(SQL.includes("v_stale interval := public.keel_generation_stale_after();"));
  assert(SQL.includes("v_lock.started_at < now() - v_stale"));
  assert(SQL.includes("v_draft.created_at < now() - v_stale"));
  assertEquals(
    (SQL.match(/'kind', 'expired'/g) ?? []).length,
    2,
    "deux sorties `expired` : le brouillon en vol, puis le verrou",
  );
  // La lecture ne balaie rien : c'est la prise qui le fait.
  assertEquals(SQL.includes("delete from"), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-15 · BÊTA 2C — LE SECOND TAP NE SE BLOQUE PAS LUI-MÊME
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE DÉFAUT N'A ÉTÉ VU QUE SUR LE CHEMIN RÉEL, ET C'EST LA LEÇON. Le
// correctif de `adoptability` (200 `already_written` au lieu d'un 409) passait
// tous ses tests de module — parce qu'ils appellent `adoptDraft` EN DIRECT.
// Dans le handler, une porte tombe 5 600 lignes plus tôt: le second tap se
// heurte à `plan_overlaps_existing`, où le plan qui « chevauche » est celui
// que ce brouillon vient lui-même d'écrire.
//
// Mesuré le 2026-09-15 contre la fonction edge servie:
//   avant · ① 200 meal=e629297a  ② 409 plan_overlaps_existing
//   après · ① 200 meal=e629297a  ② 200 meal=e629297a already_written=true
//   (0 appel modèle, 0 verrou laissé, un seul plan porte le brouillon)

Deno.test("l'adoption exclut de la fenêtre le plan que CE brouillon a écrit", () => {
  assert(
    HANDLER.includes("if (adoptingDraft && editDraftId !== null) {"),
    "la lecture du brouillon avant la porte de fenêtre a disparu",
  );
  assert(
    HANDLER.includes("selfAdoptedPlanId = String(ligne.adopted_meal_id ?? \"\").trim();"),
    "le plan déjà adopté n'est plus relevé",
  );
  // ⛔ ET RIEN D'AUTRE. Ouvrir la porte à tous les plans ferait adopter un
  // aperçu qui percute le plan d'à côté — ce que ce contrôle existe pour
  // empêcher. Le filtre lit `selfAdoptedPlanId`, pas `adoptingDraft` seul.
  assertEquals(
    (HANDLER.match(
      /\.filter\(\(p\) => selfAdoptedPlanId === "" \|\| p\.id !== selfAdoptedPlanId\)/g,
    ) ?? []).length,
    1,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-15 · BÊTA 2C — LE REFUS DIT LA VRAIE RAISON
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ MESURÉ SUR LE CHEMIN RÉEL. Adopter le brouillon d'un AUTRE foyer, ou un
// brouillon inexistant, rendait `plan_overlaps_existing` — « ta fenêtre
// chevauche un plan que tu as déjà ». Rien n'était écrit, la protection
// tenait, et la phrase envoyait la personne changer une fenêtre qui n'y est
// pour rien. Après: `draft_not_found`, 404, zéro écriture.

Deno.test("un brouillon étranger ou absent refuse AVANT la porte de fenêtre", () => {
  const i = HANDLER.indexOf('error: "draft_not_found",\n            detail: `le brouillon');
  const j = HANDLER.indexOf('error: "plan_overlaps_existing"');
  assert(i > 0, "le refus `draft_not_found` du chemin d'adoption a disparu");
  assert(j > 0, "la porte de fenêtre a disparu");
  // ⛔ L'ORDRE EST LA MOITIÉ DU CORRECTIF. Le même refus placé APRÈS ne serait
  // jamais atteint: c'est exactement l'état qu'on vient de corriger.
  assert(i < j, "le refus de brouillon doit tomber AVANT le refus de fenêtre");
});
