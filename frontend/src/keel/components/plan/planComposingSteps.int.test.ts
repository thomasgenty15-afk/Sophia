/**
 * ⟳ 2026-09-22 — LA RANGÉE D'ÉTAPES AVANCE À LA MONTRE, ET C'EST VOULU.
 *
 * ── CE QUI A ÉTÉ MESURÉ (base locale, cinq compositions réussies) ─────────
 * Passage au stade `writing` entre 1 min 52 et 3 min 34, puis fin de la ligne
 * DEUX À QUATRE CENTIÈMES DE SECONDE plus tard. `composing` prend tout le
 * temps; `checking`, `repairing` et `writing` s'allument ensemble à la
 * dernière seconde. La rangée restait donc figée trois minutes sur
 * « Composer », ce qui se lit comme une panne.
 *
 * ── LA DÉCISION ──────────────────────────────────────────────────────────
 * « Tu gardes les pastilles, tu les fais avancer toutes les 40 secondes,
 * c'est tout, osef si c'est la vérité. » La rangée n'est donc plus un relevé.
 *
 * ⛔ CE FICHIER EXISTE POUR QUE PERSONNE NE LA « RÉPARE » AU NOM DE
 * L'EN-TÊTE DU COMPOSANT, qui dit encore que les stades sont lus et jamais
 * fabriqués — vrai pour la PHRASE et pour le temps écoulé, plus pour la
 * rangée.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync(
  new URL("./PlanComposingCard.tsx", import.meta.url),
  "utf8",
);

describe("l'écran d'attente d'une composition", () => {
  it("la rangée avance d'un cran toutes les 40 secondes", () => {
    expect(SRC).toContain("const COMPOSING_STEP_MS = 40_000;");
    expect(SRC).toContain("COMPOSING_STEP_MS,");
  });

  it("⛔ LE STADE RÉEL GAGNE TOUJOURS — la montre n'est qu'un plancher", () => {
    // Sans ce `Math.max`, une composition rapide afficherait « Composer »
    // pendant que le worker range déjà. La minuterie ne doit jamais RETENIR
    // la rangée, seulement l'empêcher de rester immobile.
    expect(SRC).toContain("const current = Math.max(real, ticked);");
  });

  it("⛔ ELLE S'ARRÊTE AU DERNIER STADE, elle ne boucle pas", () => {
    // Reboucler sur « Composer » après « Ranger » ferait croire que tout
    // recommence, sur une attente qui n'a rien recommencé.
    expect(SRC).toContain("if (ticked >= DRAFT_STAGES.length - 1) return;");
  });

  it("⛔ LA PHRASE SUIT LA PASTILLE, PAS LE STADE", () => {
    // Les laisser diverger afficherait « Vérifier » allumé au-dessus de « Le
    // modèle compose les repas… »: deux affirmations contradictoires à trois
    // lignes d'écart.
    expect(SRC).toContain("const shown = DRAFT_STAGES[current] ?? null;");
    expect(SRC).not.toContain("`plan.progress.${stage}`");
  });

  it("le temps écoulé, lui, reste CELUI DU SERVEUR", () => {
    // C'est la seule chose de cette carte qui soit encore mesurée: elle vient
    // de `created_at`, pas d'un compteur du navigateur. La simuler aussi
    // rendrait la carte entièrement inventée.
    expect(SRC).toContain("formatElapsed(progress.elapsedMs)");
  });
});
