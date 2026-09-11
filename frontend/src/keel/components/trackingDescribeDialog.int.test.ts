import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import TrackingDescribeDialog from "./TrackingDescribeDialog";
import { slotLabel } from "../api/labels";

/**
 * LE DÉFAUT QUE CE FICHIER FERME — et il emportait TOUTE la page.
 *
 * `/app/progress` monte ce dialogue EN PERMANENCE, fermé par `open`, avec
 * `slot={describing?.slot ?? ""}`. Tant que personne n'a cliqué « Décrire »,
 * `slot` vaut `""`. Or les enfants d'un `Modal` sont CONSTRUITS par React
 * avant que le `Modal` ne décide de rendre `null`: le corps s'évaluait donc à
 * chaque rendu, fermé ou non, et `slotLabel("")` levait
 * `[keel/labels] no message key "slot." in the English seed (R7)`.
 * Résultat mesuré le 2026-09-09: `/app/progress` ne rendait plus une ligne —
 * l'écran entier tombait dans « Une erreur est survenue », la frontière
 * d'erreur d'`App`.
 *
 * ⚠️ CE N'EST PAS R7 QUI AVAIT TORT. `""` n'est pas un jeton que la base
 * connaît et que le seed ignore: c'est l'ABSENCE de sélection. R7 doit
 * continuer de lever sur un vrai jeton inconnu — le troisième test le tient.
 */
describe("TrackingDescribeDialog — fermé sans créneau, il ne lève pas", () => {
  it("un dialogue fermé sans créneau rend `null` au lieu d'emporter la page", () => {
    const markup = renderToStaticMarkup(
      createElement(TrackingDescribeDialog, {
        open: false,
        localDate: "",
        slot: "",
        onClose: () => {},
        onRecorded: () => {},
      }),
    );
    expect(markup).toBe("");
  });

  it("le nouveau journal ne monte plus le dialogue historique avec un créneau vide", () => {
    const page = readFileSync(
      resolve(__dirname, "../pages/StudentProgressPage.tsx"),
      "utf8",
    );
    expect(page).not.toContain("<TrackingDescribeDialog");
    expect(page).toContain("<MealEditor");
    expect(page).toContain("if (!editor) return null");
  });

  it("R7 lève toujours sur un VRAI jeton inconnu", () => {
    expect(() => slotLabel("petit_dej_du_mardi")).toThrow(/no message key/);
  });
});
