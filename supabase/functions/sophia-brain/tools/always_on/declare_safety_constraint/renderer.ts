/**
 * `declare_safety_constraint` — l'accusé, et il n'accuse QUE le ledger.
 *
 * Le défaut qu'on répare ici avait exactement cette forme: « Noted. That's
 * important, and I'll keep it in mind. » sur zéro ligne écrite. Le renderer ne
 * peut donc rien dire tant qu'il n'a pas un `CommittedSafetyConstraintEffect`
 * — un objet qui n'existe que si la base a rendu une ligne.
 *
 * ── POURQUOI IL NE NOMME PAS L'ALLERGÈNE ──────────────────────────────────
 * « I've recorded your peanut allergy » ferait mordre la ceinture de sortie sur
 * son propre accusé: `peanut` en position non niée. Le texte tourne donc autour
 * du geste (« c'est noté, et je vérifierai tout ce que je te propose ») sans
 * jamais citer l'identifiant. C'est la même discipline que
 * `MEDICAL_BLOCK_FALLBACK_EN`, pour la même raison mécanique.
 *
 * PURE MODULE: aucun I/O, aucune horloge.
 */

import type { CommittedSafetyConstraintEffect } from "./contract.ts";

export function renderSafetyConstraintAck(
  committed: readonly CommittedSafetyConstraintEffect[],
  args: { nothing_to_retract: boolean },
): string | null {
  if (committed.length === 0) {
    // Une rétractation qui ne trouve rien: on le DIT, plutôt que de laisser
    // croire à un retrait. Le tour de QA où l'élève disait « take it off my
    // file » recevait « the right place is the app or the clinician » — une
    // porte qui n'existe pas. Ici, la vérité est plus simple et plus utile.
    if (args.nothing_to_retract) {
      return "I don't have anything like that on file for you, so there's " +
        "nothing for me to take off.";
    }
    return null;
  }

  const retracted = committed.filter((c) => c.intent === "retract");
  const declared = committed.filter((c) => c.intent === "declare");
  const lines: string[] = [];

  if (declared.length > 0) {
    const medical = declared.some((c) => c.severity === "medical");
    lines.push(
      medical
        ? "That's on your file now, and I'll check anything I suggest against " +
          "it from here on."
        : "Noted on your file - I'll take it into account in what I suggest.",
    );
  }
  if (retracted.length > 0) {
    lines.push(
      "I've taken that off your file. It won't shape what I suggest any more.",
    );
  }
  return lines.join(" ") || null;
}
