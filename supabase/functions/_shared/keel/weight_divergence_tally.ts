/**
 * FF-056 — LE COMPTE D'UN PAS DE DIVERGENCE. PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE, ET CE QU'IL EMPÊCHE DE REVENIR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'au 2026-09-01, la divergence était greffée dans la boucle de
 * `keel-daily-recommendation-v1`, APRÈS un `try/catch` qui sortait par
 * `continue` dans ses quatre cas non-nominaux. Le pas n'était donc **jamais
 * atteint** pour le cas nominal — et le compte-rendu ne pouvait pas le dire,
 * parce qu'il ne portait que `divergence_asked`, dont la valeur nominale est
 * précisément zéro.
 *
 * Un mécanisme débranché et un mécanisme qui se tait correctement rendaient le
 * MÊME rapport. C'est la faute que ce module ferme, et il la ferme par une
 * distinction, pas par un commentaire:
 *
 *     `asked`    — combien de questions sont parties. Zéro est NORMAL.
 *     `examined` — combien d'élèves le détecteur a réellement regardés.
 *                  Zéro sur une cohorte est une PANNE.
 *
 * ⚠️ `examined` monte pour TOUTE issue sauf `outside_window`, y compris les
 * refus. Un élève écarté par une garde a bel et bien été examiné — c'est ce qui
 * rend le chiffre insensible aux raisons et sensible au seul fait qui compte:
 * le pas a-t-il tourné.
 *
 * ── L'EXHAUSTIVITÉ EST TENUE PAR LE COMPILATEUR ─────────────────────────
 * Le `switch` est exhaustif sur `DivergenceStepOutcome` et son défaut est un
 * `never`. Une issue ajoutée au moteur sans être comptée ici ne compile pas —
 * c'est la seule forme de garde qui survit à un lot pressé.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire.
 */

import type { DivergenceStepOutcome } from "./weight_divergence_engine.ts";

export interface DivergenceTally {
  /** Élèves pour qui le pas a rendu autre chose que `outside_window`. */
  examined: number;
  /** Questions parties (ou qui seraient parties en `dry_run`). */
  asked: number;
  /** Les verdicts du détecteur quand il ne demande rien. Porte §10. */
  verdicts: Record<string, number>;
  /** La forme de la divergence quand une question part. */
  shapes: Record<string, number>;
  /** Pourquoi on n'a rien demandé. Les motifs de garde et de livraison. */
  skipped: Record<string, number>;
}

export function emptyDivergenceTally(): DivergenceTally {
  return { examined: 0, asked: 0, verdicts: {}, shapes: {}, skipped: {} };
}

function bump(table: Record<string, number>, key: string): void {
  table[key] = (table[key] ?? 0) + 1;
}

/**
 * Range une issue dans le compte. RETOURNE le compte, ne le mute pas —
 * un compteur mutable partagé entre deux boucles est la façon la plus simple
 * de rendre un compte-rendu faux sans qu'aucun test ne tombe.
 */
export function tallyDivergenceOutcome(
  tally: DivergenceTally,
  outcome: DivergenceStepOutcome,
): DivergenceTally {
  const next: DivergenceTally = {
    examined: tally.examined,
    asked: tally.asked,
    verdicts: { ...tally.verdicts },
    shapes: { ...tally.shapes },
    skipped: { ...tally.skipped },
  };

  switch (outcome.outcome) {
    case "outside_window":
      // LE SEUL CAS QUI NE COMPTE PAS COMME EXAMINÉ. La fenêtre locale écarte
      // l'écrasante majorité de la cohorte à chaque tick horaire; la compter
      // comme examinée noierait le chiffre qui doit rester lisible.
      bump(next.skipped, "outside_window");
      return next;

    case "skipped":
      next.examined++;
      bump(next.skipped, outcome.reason);
      return next;

    case "no_divergence":
      next.examined++;
      bump(next.verdicts, outcome.verdict);
      return next;

    case "not_delivered":
      next.examined++;
      // Préfixé: un refus de LIVRAISON et un refus de GARDE ne se réparent pas
      // au même endroit, et les fondre dans une seule clé ferait chercher au
      // mauvais endroit.
      bump(next.skipped, `delivery:${outcome.reason}`);
      return next;

    case "asked":
      next.examined++;
      next.asked++;
      bump(next.shapes, outcome.shape);
      return next;

    case "would_ask":
      // `dry_run`: la question serait partie. Elle compte comme demandée —
      // c'est tout l'intérêt du mode, voir QUI serait sollicité.
      next.examined++;
      next.asked++;
      bump(next.shapes, outcome.verdict.shape ?? "unknown");
      return next;

    default: {
      // Exhaustivité tenue par le compilateur. Une issue ajoutée au moteur sans
      // branche ici ne compile pas.
      const unreachable: never = outcome;
      throw new Error(
        `[keel/weight_divergence_tally] issue non comptée: ${
          JSON.stringify(unreachable)
        }`,
      );
    }
  }
}
