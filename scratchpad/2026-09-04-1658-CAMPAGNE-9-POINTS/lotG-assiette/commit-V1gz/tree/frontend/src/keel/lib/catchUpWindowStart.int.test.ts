import { describe, expect, it } from "vitest";

import { catchUpWindowStart } from "./useMealTicks";

// ===========================================================================
// MINUIT — LE DÉBUT DE FENÊTRE EST UN INSTANTANÉ DE MONTAGE, ET IL PÉRIME
//
// ⛔ LE DÉFAUT, MESURÉ SUR L'ÉCRAN DU PROPRIÉTAIRE LE 2026-08-20 À 00h03.
// `SetupPage` initialise `windowStart` par `browserLocalDate()` DANS un
// `useState` — donc évalué une seule fois, au montage. Un onglet ouvert la
// veille tient encore le 19 quand le serveur, qui lit le MÊME fuseau
// (`Europe/Paris`), est déjà au 20.
//
// Côté serveur, `resolveRequestedWindow` a une garde explicite:
//
//     if (request.startsOn < today) throw "start in the past"
//
// d'où `bad_window`, HTTP 400, et à l'écran « Ces jours n'ont pas pu être
// lus » — un message qui parle des JOURS alors que le défaut est une HORLOGE.
// C'est la famille de [[mount-snapshot-forms-need-a-loading-gate]]: une valeur
// figée au montage qui se met à mentir sans que rien ne le dise.
//
// ⚠️ CE QUI SE TESTE ICI EST LA RÈGLE, PAS L'EFFET. `SetupPage` entier ne se
// monte pas (session, routeur, deux appels modèle de 100 à 200 s), et un test
// qui lirait la SOURCE du `useEffect` resterait vert le jour où quelqu'un
// inverse la comparaison. La règle est donc une fonction pure, et l'horloge lui
// est passée.
// ===========================================================================

describe("catchUpWindowStart — le rattrapage de minuit", () => {
  it("un début DEVENU passé est ramené à aujourd'hui", () => {
    // Le cas exact du 2026-08-20 00h03: l'onglet tient le 19, le serveur est
    // au 20, et sans ce rattrapage la génération rend 400.
    expect(catchUpWindowStart("2026-08-19", "2026-08-20")).toBe("2026-08-20");
  });

  it("⛔ un début FUTUR n'est jamais déplacé — c'est une décision, pas un retard", () => {
    // « Je pars jeudi, fais-moi trois jours » est légitime et posé exprès. Le
    // corriger prendrait son choix des mains de la personne. C'est la moitié de
    // la règle qu'un `setWindowStart(today)` nu détruirait, et elle ne se voit
    // pas tant qu'on ne la teste pas.
    expect(catchUpWindowStart("2026-08-25", "2026-08-20")).toBe("2026-08-25");
  });

  it("le jour même ne bouge pas — le cas nominal, appelé à chaque focus", () => {
    // L'effet s'exécute sur CHAQUE `focus` et `visibilitychange`. Une identité
    // fausse ici ferait un `setState` à chaque retour sur l'onglet, donc un
    // rendu, donc une grille qui se recompose pour rien.
    expect(catchUpWindowStart("2026-08-20", "2026-08-20")).toBe("2026-08-20");
  });

  it("la comparaison est celle des DATES ISO, pas celle des nombres", () => {
    // `"2026-09-01" < "2026-10-01"` est vrai en ISO et le resterait en
    // lexicographique; le piège serait un format non zéro-padé. On épingle le
    // passage de mois et d'année, les deux endroits où un format bancal se voit.
    expect(catchUpWindowStart("2026-08-31", "2026-09-01")).toBe("2026-09-01");
    expect(catchUpWindowStart("2026-12-31", "2027-01-01")).toBe("2027-01-01");
    expect(catchUpWindowStart("2027-01-02", "2026-12-31")).toBe("2027-01-02");
  });
});
