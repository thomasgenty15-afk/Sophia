// R4 — LA GATE DE MONTAGE DU POINT HEBDO, ÉPINGLÉE SUR LE RENDU RÉEL.
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
// La DÉCISION de soumission est déjà testée, pure, dans
// `api/weeklyCheckIn.int.test.ts`. Ce qu'elle ne peut pas prouver, c'est ce que
// l'élève VOIT: qu'aucun des six axes n'est rendu quand personne ne les lit, et
// que le formulaire ne se monte pas tant qu'on ne sait pas encore.
//
// Ce dépôt n'a ni jsdom ni testing-library — un composant ne se rendait donc que
// dans un E2E, et le point hebdo n'en a aucun (il faut un jeton de semaine émis
// par le serveur pour le faire apparaître). `renderToStaticMarkup` suffit
// pourtant: la gate est un rendu, pas une interaction. Pas d'événement ici, et
// c'est assumé — cliquer est le travail de la décision pure d'à côté.
//
// `createElement` PLUTÔT QUE DU JSX, et ce n'est pas un goût: le glob de
// `vitest.config.ts` est `src/**/*.int.test.ts`. Élargir la config partagée pour
// un fichier serait un effet de bord de ce lot sur tous les autres; trois appels
// à `createElement` ne coûtent rien et ne changent rien pour personne.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WeeklyCheckInDialog } from "./WeeklyCheckInDialog";
import { WEEKLY_AXES } from "../api/weeklyCheckIn";
import { en as EN } from "../i18n/en";

function render(showAxes: boolean | null): string {
  return renderToStaticMarkup(
    createElement(WeeklyCheckInDialog, {
      showAxes,
      onSubmit: () => {},
      onCancel: () => {},
    }),
  );
}

describe("R4 — les six axes ne se rendent que là où quelqu'un les lit", () => {
  it("showAxes=null ne monte RIEN: pas d'affichage puis retrait", () => {
    // Le formulaire n'apparaît qu'après un clic, et la visibilité se résout au
    // montage de l'écran. Si la réponse n'est pas encore là, montrer les six axes
    // pour les retirer ensuite donnerait le pire des deux: l'élève voit une
    // question qu'on a décidé de ne pas poser, et la voit disparaître.
    expect(render(null)).toBe("");
  });

  it("sans lecteur: zéro axe rendu, et les deux mesures restent", () => {
    const html = render(false);

    // Le formulaire est bien là — le retrait ne supprime pas le point hebdo.
    expect(html).toContain('data-testid="weekly-checkin"');
    expect(html).toContain('data-axes="off"');

    // AUCUN des six libellés, et aucun cran de l'échelle.
    for (const axis of WEEKLY_AXES) {
      expect(html, `axe rendu sans lecteur: ${axis}`).not.toContain(
        EN[`chat.weekly.axis.${axis}` as keyof typeof EN],
      );
    }
    expect(html).not.toContain("aria-pressed");

    // Poids et tour de taille restent pour tous: leurs lecteurs ne dépendent pas
    // du coach. C'est la boucle que le retrait ne doit pas casser.
    expect(html).toContain(EN["chat.weekly.weight"]);
    expect(html).toContain(EN["chat.weekly.waist"]);

    // Et le sous-titre n'annonce pas six lectures sous deux champs.
    expect(html).toContain(EN["chat.weekly.subtitle.measures"]);
    expect(html).not.toContain(EN["chat.weekly.subtitle"]);
    // « Optionnel » disparaît avec les axes: sur l'unique chose demandée, ça
    // dirait à l'élève qu'il peut envoyer un formulaire vide.
    expect(html).not.toContain(EN["chat.weekly.optional"]);
  });

  it("avec un lecteur: les six axes et les cinq crans sont là", () => {
    const html = render(true);
    expect(html).toContain('data-axes="on"');
    for (const axis of WEEKLY_AXES) {
      expect(html, `axe manquant: ${axis}`).toContain(
        EN[`chat.weekly.axis.${axis}` as keyof typeof EN],
      );
    }
    expect(html).toContain("aria-pressed");
    expect(html).toContain(EN["chat.weekly.subtitle"]);
    expect(html).toContain(EN["chat.weekly.optional"]);
    expect(html).toContain(EN["chat.weekly.weight"]);
  });

  it("les deux modes rendent le MÊME bouton d'envoi et la même sortie", () => {
    // Un mode qui perdrait son bouton d'annulation piégerait l'élève dans un
    // formulaire qu'il n'a pas demandé à ouvrir.
    for (const showAxes of [true, false]) {
      const html = render(showAxes);
      expect(html, `submit absent: axes=${showAxes}`).toContain(
        EN["chat.weekly.submit"],
      );
      expect(html, `cancel absent: axes=${showAxes}`).toContain(
        EN["chat.weekly.cancel"],
      );
    }
  });
});
