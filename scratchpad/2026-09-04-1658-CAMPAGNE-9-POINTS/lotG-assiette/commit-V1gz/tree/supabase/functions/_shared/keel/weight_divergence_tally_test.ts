import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  type DivergenceTally,
  emptyDivergenceTally,
  tallyDivergenceOutcome,
} from "./weight_divergence_tally.ts";
import type { DivergenceStepOutcome } from "./weight_divergence_engine.ts";

/**
 * FF-056 — LE COMPTE QUI REND LE DÉBRANCHEMENT VISIBLE.
 *
 * ══ LE DÉFAUT QUE CES ÉPREUVES EXISTENT POUR FERMER ══════════════════════
 *
 * Du 2026-08-11 au 2026-09-01, la divergence était greffée dans la boucle de
 * `keel-daily-recommendation-v1`, APRÈS un `try/catch` qui sortait par
 * `continue` dans ses quatre cas non-nominaux. Le pas n'était donc jamais
 * atteint pour le cas nominal.
 *
 * **Le mécanisme était mort et le compte-rendu ne pouvait pas le dire**, parce
 * qu'il ne portait que `divergence_asked` — dont la valeur nominale est
 * précisément zéro. Un mécanisme débranché et un mécanisme qui se tait
 * correctement rendaient le même rapport.
 *
 * Ce que ces épreuves tiennent:
 *   · `examined` monte pour TOUTE issue sauf `outside_window`, refus compris —
 *     c'est ce qui le rend insensible aux raisons et sensible au seul fait qui
 *     compte: le pas a-t-il tourné;
 *   · `asked` et `examined` ne se confondent jamais;
 *   · les six issues du moteur sont TOUTES comptées (l'exhaustivité est tenue
 *     par le compilateur, mais un `never` ne dit rien de ce qu'on compte).
 */

const ASKED: DivergenceStepOutcome = {
  outcome: "asked",
  episodeId: "11111111-1111-4111-8111-111111111111",
  shape: "moving_away",
  fingerprint: "fp-1",
};

function fold(
  outcomes: readonly DivergenceStepOutcome[],
): DivergenceTally {
  return outcomes.reduce(tallyDivergenceOutcome, emptyDivergenceTally());
}

Deno.test("hors fenêtre ne compte PAS comme examiné", () => {
  const tally = fold([
    { outcome: "outside_window" },
    { outcome: "outside_window" },
  ]);
  assertEquals(tally.examined, 0, "la fenêtre locale écarte, elle n'examine pas");
  assertEquals(tally.asked, 0);
  assertEquals(tally.skipped.outside_window, 2);
});

Deno.test("⛔ UN REFUS EST UN ÉLÈVE EXAMINÉ — c'est tout l'intérêt du chiffre", () => {
  // Le cas exact du défaut: le moteur tourne, se tait pour de bonnes raisons,
  // et `asked` reste à zéro. Si `examined` restait à zéro aussi, on ne pourrait
  // pas distinguer ça d'un pas qui n'est jamais atteint.
  const tally = fold([
    { outcome: "skipped", reason: "ask_budget_taken" },
    { outcome: "skipped", reason: "cooldown" },
    { outcome: "no_divergence", verdict: "aligned" },
    { outcome: "not_delivered", reason: "muted" },
  ]);
  assertEquals(tally.examined, 4, "quatre élèves ont bel et bien été regardés");
  assertEquals(tally.asked, 0, "et aucune question n'est partie — c'est NORMAL");
});

Deno.test("`asked` et `examined` ne se confondent pas", () => {
  const tally = fold([
    { outcome: "outside_window" },
    { outcome: "no_divergence", verdict: "aligned" },
    ASKED,
  ]);
  assertEquals(tally.examined, 2);
  assertEquals(tally.asked, 1);
  assertEquals(tally.shapes.moving_away, 1);
});

Deno.test("`would_ask` compte comme demandé — c'est l'intérêt du dry-run", () => {
  // `dry_run: true` sert à voir QUI serait sollicité avant d'ouvrir la vanne.
  // Ne pas le compter rendrait le mode inutile.
  const tally = fold([{
    outcome: "would_ask",
    // Le verdict complet du détecteur; seule sa `shape` est lue ici.
    verdict: { shape: "stalled" } as unknown as Extract<
      DivergenceStepOutcome,
      { outcome: "would_ask" }
    >["verdict"],
  }]);
  assertEquals(tally.examined, 1);
  assertEquals(tally.asked, 1);
  assertEquals(tally.shapes.stalled, 1);
});

Deno.test("un `would_ask` sans forme lisible ne perd pas l'élève", () => {
  const tally = fold([{
    outcome: "would_ask",
    verdict: {} as unknown as Extract<
      DivergenceStepOutcome,
      { outcome: "would_ask" }
    >["verdict"],
  }]);
  assertEquals(tally.asked, 1);
  assertEquals(tally.shapes.unknown, 1, "nommée `unknown`, jamais silencieuse");
});

Deno.test("un refus de LIVRAISON est distinct d'un refus de GARDE", () => {
  // Les deux ne se réparent pas au même endroit: une garde est une décision
  // produit, une livraison refusée est un plafond ou un mute. Les fondre dans
  // une seule clé ferait chercher au mauvais endroit.
  const tally = fold([
    { outcome: "skipped", reason: "cooldown" },
    { outcome: "not_delivered", reason: "cooldown" },
  ]);
  assertEquals(tally.skipped.cooldown, 1);
  assertEquals(tally.skipped["delivery:cooldown"], 1);
});

Deno.test("les SIX issues du moteur sont comptées, aucune n'est perdue", () => {
  // ⚠️ L'exhaustivité est tenue par le compilateur (`never` au défaut), mais un
  // `never` ne dit rien de CE QU'ON COMPTE. Cette épreuve le dit: chaque issue
  // laisse une trace, et la somme des traces couvre les six.
  const all: DivergenceStepOutcome[] = [
    { outcome: "outside_window" },
    { outcome: "skipped", reason: "cooldown" },
    { outcome: "no_divergence", verdict: "aligned" },
    { outcome: "not_delivered", reason: "muted" },
    { outcome: "would_ask", verdict: { shape: "stalled" } as never },
    ASKED,
  ];
  const tally = fold(all);
  assertEquals(tally.examined, 5, "toutes sauf `outside_window`");
  assertEquals(tally.asked, 2, "`asked` + `would_ask`");

  // Six clés: `outside_window`, `cooldown`, `delivery:muted` (skipped),
  // `aligned` (verdicts), `stalled` et `moving_away` (shapes). Les deux issues
  // qui demandent portent des FORMES différentes — c'est ce qui fait six et non
  // cinq, et c'est correct: une forme est ce qu'on veut lire, pas un doublon.
  const traced = Object.keys(tally.skipped).length +
    Object.keys(tally.verdicts).length +
    Object.keys(tally.shapes).length;
  assertEquals(traced, 6, "chaque issue laisse sa propre trace");
});

Deno.test("le compte est PUR: l'entrée n'est jamais mutée", () => {
  // Un compteur mutable partagé entre deux boucles est la façon la plus simple
  // de rendre un compte-rendu faux sans qu'aucun test ne tombe.
  const before = emptyDivergenceTally();
  const after = tallyDivergenceOutcome(before, ASKED);
  assertEquals(before.examined, 0, "l'entrée est intacte");
  assertEquals(before.asked, 0);
  assertEquals(Object.keys(before.shapes).length, 0);
  assertEquals(after.examined, 1);
  assert(before !== after, "une nouvelle valeur, jamais la même référence");
});
