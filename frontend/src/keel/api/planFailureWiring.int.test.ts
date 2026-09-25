import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { planFailureKey } from "../copy/planRefusals";
import { fr } from "../i18n/fr";

/**
 * CE QU'UNE COMPOSITION RATÉE MET SOUS LES YEUX D'UNE PERSONNE.
 *
 * ── LE DÉFAUT QUE CE FICHIER ÉPINGLE, MESURÉ LE 2026-09-14 ────────────────
 * Parcours réel, compte `lotf.camp8.s1`, foyer végane + omnivore. L'adoption
 * d'un aperçu a dépassé le délai du navigateur (145 s) pendant que le serveur
 * continuait. Au pied du dialogue s'est affiché, en toutes lettres:
 *
 *     [keel/planDraft] Failed to send a request to the Edge Function
 *
 * Deux interdits d'un coup:
 *   ① « KEEL » est un nom de code INTERNE — il ne doit apparaître sur AUCUNE
 *      surface lue par un utilisateur;
 *   ② une chaîne brute anglaise de bibliothèque comme seule sortie d'une panne
 *      ordinaire — ce que le contrat de bêta interdit nommément.
 *
 * Trois choses peuvent le recasser sans que rien n'échoue, et les trois sont
 * épinglées ici: le repli qui recolle un préfixe interne, le dialogue qui
 * réaffiche `e.message` tel quel, et le délai client qui redevient
 * indistinguable d'un réseau coupé.
 */

const ROOT = resolve(__dirname, "../../../..");

function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

describe("aucune panne ordinaire ne sort en clair sur l'écran", () => {
  /**
   * ① LE NOM DE CODE INTERNE. Il vivait dans TROIS replis du même fichier —
   * `[keel/planDraft]`, `[keel/readNote]`, `[keel/answerNote]` — et chacun
   * était l'unique sortie d'une panne de transport.
   */
  it("les clients de plan n'ont plus un seul repli qui écrit « keel »", () => {
    // ⚠️ `api/household.ts` N'EST PAS DANS CETTE LISTE, ET IL FAUT LE DIRE.
    // Il porte encore `[keel/api] loadLiveInvitations: …`, qui appartient à
    // l'écran du foyer, pas au parcours de composition. Ce préfixe existe à
    // ~90 endroits du front — c'est une FAMILLE, et la traiter entière est un
    // chantier à part. Ce qui est réparé et gardé ici, c'est le chemin mesuré:
    // composer, prévisualiser, adopter. Son repli à lui est épinglé au test ②.
    for (const rel of [
      "frontend/src/keel/api/planDraft.ts",
      "frontend/src/keel/components/plan/PlanDraftDialog.tsx",
      "frontend/src/keel/components/MealBuilder.tsx",
    ]) {
      const src = code(rel);
      const fuites = src.match(/`\[keel\//g) ?? [];
      expect(fuites, `${rel} recolle un préfixe interne dans un message`)
        .toEqual([]);
    }
  });

  /**
   * ② LE REPLI EST UN JETON, DONC IL A UNE PHRASE. `composition_unavailable`
   * existait déjà et n'était jamais atteint par ce chemin.
   */
  it("le repli des deux lanes est `composition_unavailable`, pas le message brut", () => {
    const draft = code("frontend/src/keel/api/planDraft.ts");
    // ⟳ 2026-09-24 — QUATRE: la lecture des raisons de « Remplacer »
    // (`readRejections`) passe par le même repli que la note.
    expect(draft.match(/refusalOf\(error, "composition_unavailable"\)/g)?.length)
      .toBe(4);
    // ⟳ 2026-09-15 · LOT E — `generateHouseholdMeal` N'A PLUS DE CHEMIN D'APPEL
    // À LUI : c'est une façade sur `composeDraft` (202 + relecture de la ligne)
    // puis `writeFromDraft`. Le second exemplaire du transport — et son repli
    // sur le message de la bibliothèque — a disparu avec lui.
    const foyer = code("frontend/src/keel/api/household.ts");
    expect(foyer, "la lane du foyer a retrouvé un transport à elle")
      .not.toContain('functions.invoke("generate-household-meal-v1"');
    expect(foyer).not.toContain("?? error.message)");
  });

  /**
   * ③ LE DIALOGUE TRADUIT. Trois `setFailure` posaient `e.message` tel quel:
   * boucher la source sans traduire ici aurait remplacé une phrase anglaise
   * par un code brut, ce qui est le même défaut.
   */
  it("le dialogue d'aperçu ne pose plus `e.message` sous un bouton", () => {
    const src = code("frontend/src/keel/components/plan/PlanDraftDialog.tsx");
    // ⟳ 2026-09-24 — QUATRE: la note, l'adoption, la suite des questions en
    // couche, et « Remplacer ». Chacun traduit son refus.
    // ⟳ même jour — les reprises passent par `bodyFailure`, qui traduit PAR
    // `failureText`; l'adoption traduit directement. ⟳ 2026-09-25 — trois, et
    // plus quatre : « Refaire tout le plan » est parti (décision produit).
    expect(src.match(/message: failureText\(e\)/g)?.length).toBe(1);
    expect(src.match(/setFailure\(bodyFailure\(e\)\)/g)?.length).toBe(3);
    expect(src).toContain("const message = failureText(e);");
    expect(src, "un motif repart en brut sous un bouton")
      .not.toContain("message: e instanceof Error ? e.message");
  });

  /**
   * ④ LE DÉLAI DU NAVIGATEUR SE RECONNAÎT AU SITE D'APPEL. L'option `timeout`
   * de la bibliothèque rend un `FunctionsFetchError` dont le message est
   * IDENTIQUE à celui d'un réseau coupé; les distinguer en lisant ce message
   * serait un matcher maison sur du texte que nous n'écrivons pas.
   */
  it("la borne client relit l'état durable avant de nommer un travail en cours", () => {
    const src = code("frontend/src/keel/api/planDraft.ts");
    expect(src).toContain(
      "const timer = setTimeout(() => deadline.abort(), PLAN_CLIENT_TIMEOUT_MS);",
    );
    expect(src).toContain("signal: deadline.signal,");
    expect(src).toContain("await settleInterruptedGeneration(requestId);");
    expect(src).toContain(
      'if (recovered.kind === "in_flight") throw new Error("plan_still_composing");',
    );
    expect(src).toContain(
      'if (deadline.signal.aborted) throw new Error("composition_unavailable");',
    );
    expect(src, "l'option de la bibliothèque est revenue: le motif redevient indistinguable")
      .not.toContain("timeout: PLAN_CLIENT_TIMEOUT_MS,");
    // ⟳ 2026-09-15 · LOT E — la lane du foyer passe par LE MÊME transport :
    // un aperçu accepté tôt, relu dans la ligne, puis adopté sans appel modèle.
    const foyer = code("frontend/src/keel/api/household.ts");
    // ⟳ 2026-09-21 — l'appel porte aussi `replaces` (voir
    // `draftReplacesWiring.int.test.ts`); ce qui compte ici est le transport.
    expect(foyer).toContain("await composeDraft(input, {");
    expect(foyer).toContain("onProgress: args.onProgress,");
    expect(foyer).toContain("await writeFromDraft(input, draftId, intent, args.replaces ?? null)");
  });

  /**
   * ⑤ ET LE MOTIF A UNE PHRASE QUI DIT LA VÉRITÉ. Le serveur CONTINUE après
   * notre abandon: ni « ça a échoué », ni « relance ».
   */
  it("`plan_still_composing` a une phrase, et elle ne demande pas de relancer", () => {
    const key = planFailureKey("plan_still_composing");
    expect(key).toBe("plan.refusal.plan_still_composing");
    const phrase = (fr as Record<string, string>)[key as string];
    expect(phrase).toBeTruthy();
    expect(phrase).toContain("ne relance pas");
  });
});
