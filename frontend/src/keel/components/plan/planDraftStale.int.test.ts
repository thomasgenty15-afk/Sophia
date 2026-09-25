import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { planFailureKey } from "../../copy/planRefusals";
import { en } from "../../i18n/en";
import { fr } from "../../i18n/fr";

// ===========================================================================
// ⟳ 2026-09-25 — UN AJUSTEMENT SE FAIT EN LOCAL, OU LE SYSTÈME RECOMPOSE.
// ===========================================================================
//
// Décision produit du 2026-09-25, sur capture : « J'aime pas le tofu » sur un
// aperçu fait la veille à 23 h, envoyé à 1 h, rendait « Cet aperçu partait
// d'aujourd'hui, et la journée est entamée : il ne peut plus être retouché, il
// faut le refaire » et un bouton « Refaire tout le plan ». Il n'y a pas de
// « refaire le plan » : soit la retouche est locale, soit le système décide de
// recomposer. Ce fichier tient les trois moitiés côté front :
//   ① le dialogue n'a plus de bouton « Refaire tout le plan » ;
//   ② aucune phrase ne demande à la personne de refaire le plan, et les deux
//      refus de fenêtre (`draft_day_passed`, `draft_mismatch`) n'ont plus de
//      mots — le serveur ne les rend plus ;
//   ③ les trois retouches locales recomposent d'elles-mêmes quand elles ne
//      peuvent pas aboutir — aperçu de départ inutilisable, ou plan retouché
//      refusé par la porte finale (`editOrRecompose`).
// La moitié serveur (la fenêtre de l'aperçu, sans relecture de l'heure) est
// tenue par `rejected_dishes_wiring_test.ts` ⑥.
//
// ⚠️ CE TEST LIT LA SOURCE. Les commentaires sont retirés avant toute mesure.

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const bare = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
const DIALOG = bare(read("./PlanDraftDialog.tsx"));
const API = bare(read("../../api/planDraft.ts"));

describe("un ajustement n'est jamais renvoyé à la personne", () => {
  it("① le dialogue n'a plus de « Refaire tout le plan »", () => {
    expect(DIALOG).not.toContain("recomposeStale");
    expect(DIALOG).not.toContain("staleBlock");
    expect(DIALOG).not.toContain("plan.draft.recompose_stale");
    expect(DIALOG).not.toContain("recompose:");
  });

  // ⟳ 2026-09-25 — « il ne doit pas y avoir de limite de reprises dans les
  // faits » : ni compteur à l'écran, ni bouton éteint au troisième tour.
  it("④ aucune limite de reprises: ni compteur, ni phrase, ni garde", () => {
    expect(DIALOG).not.toContain("canAskAgain");
    expect(DIALOG).not.toContain("turnsUsed");
    expect(DIALOG).not.toContain("plan.draft.turns_");
    expect(API).not.toContain("DRAFT_MAX_TURNS");
    expect(API).not.toContain("function canRemix");
    for (const pack of [fr, en] as Record<string, string>[]) {
      for (const key of ["plan.draft.turns_left", "plan.draft.turns_one", "plan.draft.turns_none"]) {
        expect(pack[key]).toBeUndefined();
      }
    }
  });

  it("② aucune phrase ne demande de refaire le plan", () => {
    for (const pack of [fr, en] as Record<string, string>[]) {
      expect(pack["plan.draft.recompose_stale"]).toBeUndefined();
      expect(pack["plan.refusal.draft_day_passed"]).toBeUndefined();
      expect(pack["plan.refusal.draft_mismatch"]).toBeUndefined();
      for (const text of Object.values(pack)) {
        expect(text).not.toMatch(/Refais tout le plan|il faut le refaire|Redo the whole plan|needs to be redone/);
      }
    }
    expect(planFailureKey("draft_day_passed")).toBeNull();
    expect(planFailureKey("draft_mismatch")).toBeNull();
  });

  it("③ les trois retouches recomposent quand elles ne peuvent pas aboutir", () => {
    const helper = API.slice(
      API.indexOf("const EDIT_FALLS_BACK_TO_COMPOSE"),
      API.indexOf("async function editOrRecompose"),
    );
    for (const token of ["draft_not_found", "draft_not_done", "draft_has_no_source", "plan_not_deliverable"]) {
      expect(helper).toContain(`"${token}"`);
    }
    const fallback = API.slice(
      API.indexOf("async function editOrRecompose"),
      API.indexOf("export async function replaceDishes"),
    );
    expect(fallback).toContain("if (!EDIT_FALLS_BACK_TO_COMPOSE.has(token)) throw error;");
    expect(fallback).toContain("return await composeDraft(input, opts);");
    // ⟳ 2026-09-25 — une exclusion REDITE (déjà en mémoire, `known`) aiguille
    // comme une exclusion neuve: sans ça, elle recomposait toute la semaine.
    const reader = API.slice(
      API.indexOf("function readNoteOutcome("),
      API.indexOf("const questions: NoteQuestion[] = [];"),
    );
    expect(reader).toContain("readLines(raw.known)");
    expect(reader).toContain("...written,");
    for (const fn of ["replaceDishes", "editCells", "editExclusions"]) {
      const at = API.indexOf(`export async function ${fn}(`);
      expect(at).toBeGreaterThan(-1);
      const body = API.slice(at, API.indexOf("\n}\n", at));
      expect(body).toContain("return await editOrRecompose(input, opts, async () => {");
    }
  });
});
