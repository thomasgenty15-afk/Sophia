// KEEL — LE DÉCALAGE D'UN JOUR, PROUVÉ AUX DEUX BOUTS DU MONDE.
//
// ── CE QUE CE FICHIER MESURE, ET QUE RIEN NE MESURAIT ──────────────────────
// Le modèle de date de ce produit est une chaîne `yyyy-mm-dd` (`local_date`,
// `week_start_date`, `starts_on`…). `new Date("2026-08-07")` la lit à MINUIT
// UTC, et minuit UTC rendu dans le fuseau de l'appareil est LE JOUR PRÉCÉDENT
// pour tout utilisateur à l'ouest de Greenwich. Trois écrans avaient cette
// forme exacte, et deux autres la contournaient chacun à leur façon — trois
// contournements pour un défaut, c'est-à-dire un défaut sans propriétaire.
//
// ⚠️ ET LE PIÈGE SYMÉTRIQUE, QUI SE VOIT MOINS: parser à midi UTC seul répare
// l'ouest et CASSE l'est. Midi UTC lu à Auckland (UTC+13) est une heure du
// matin le LENDEMAIN. C'est pour ça que les deux fuseaux sont testés ici, et
// pas seulement celui qui a fait remonter le bug.
//
// ── POURQUOI `process.env.TZ` EST RÉÉCRIT EN COURS DE TEST ─────────────────
// Le fuseau qu'on veut mettre en défaut est celui de L'APPAREIL, c'est-à-dire
// précisément l'argument qu'aucun appelant ne passe. Le simuler en passant
// `timeZone` explicitement testerait la surcharge et laisserait le défaut
// intact. Node ≥ 16 rejoue la configuration d'`Intl` quand `process.env.TZ`
// change; vérifié sur ce dépôt (Node 22).

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  displayLocaleTag,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatNumber,
  formatPrice,
  formatTime,
  formatWeekday,
} from "./format";
import { en } from "./en";
import { fr } from "./fr";
import { PRICES } from "./prices";
import { setChosenUiLocaleForTest } from "./runtime";

const ORIGINAL_TZ = process.env.TZ;

/** Les deux bouts du monde: l'ouest de Greenwich, et le plus à l'est habité. */
const ZONES = ["America/Los_Angeles", "Pacific/Auckland"] as const;

function inZone(tz: string, run: () => void): void {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    run();
  } finally {
    process.env.TZ = previous;
  }
}

/**
 * `uiLocale()` lit `location.pathname` à l'appel: sans chemin DÉCLARÉ et
 * entièrement traduit, il rend l'anglais quel que soit le choix du visiteur.
 */
function inLocale(locale: "en" | "fr"): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/", search: "", href: "https://x.test/" },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
}

beforeEach(() => inLocale("en"));

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("une date nue rend le MÊME jour civil dans tous les fuseaux", () => {
  it("garde le 7 août à l'ouest ET à l'est de Greenwich", () => {
    // LE test du fichier. Avant `format.ts`: « 6 Aug » à Los Angeles.
    for (const tz of ZONES) {
      inZone(tz, () => {
        expect(formatDate("2026-08-07", { year: false }), tz).toBe("7 Aug");
        expect(formatDateLong("2026-08-07"), tz).toBe("7 August 2026");
      });
    }
  });

  it("garde le bon JOUR DE LA SEMAINE — les en-têtes de la grille de rythme", () => {
    // `/app/progress` rend toutes ses colonnes par cette fonction. Un décalage
    // d'un jour ne se voit pas sur un nombre; il se voit tout de suite sur
    // « Thu » au-dessus de la colonne du vendredi.
    for (const tz of ZONES) {
      inZone(tz, () => {
        expect(formatWeekday("2026-08-07"), tz).toBe("Fri");
        expect(formatWeekday("2026-08-07", { long: true }), tz).toBe("Friday");
      });
    }
  });

  it("mord sur les DEUX bornes d'un mois, où le décalage change aussi le mois", () => {
    for (const tz of ZONES) {
      inZone(tz, () => {
        expect(formatDate("2026-08-01"), tz).toBe("1 Aug 2026");
        expect(formatDate("2026-08-31"), tz).toBe("31 Aug 2026");
        // Le 1er janvier: un décalage d'un jour y change aussi l'ANNÉE.
        expect(formatDate("2026-01-01"), tz).toBe("1 Jan 2026");
      });
    }
  });

  it("prouve que le test verrait le défaut: la lecture NAÏVE, elle, décale", () => {
    // ⚠️ SANS CETTE ASSERTION, LES TROIS D'AU-DESSUS POURRAIENT ÊTRE VERTES
    // PARCE QUE `process.env.TZ` N'A AUCUN EFFET. Elle mesure l'ancien code —
    // `new Date(iso).toLocaleDateString(...)` — et exige qu'il DIVERGE des deux
    // côtés. Une garde a besoin d'un cas qui échoue pour valoir quelque chose.
    inZone("America/Los_Angeles", () => {
      expect(new Date("2026-08-07").getDate()).toBe(6);
    });
    inZone("Pacific/Auckland", () => {
      expect(new Date("2026-08-07").getDate()).toBe(7);
    });
  });
});

describe("un HORODATAGE, lui, reste un instant et suit le lecteur", () => {
  it("rend l'heure dans le fuseau de l'appareil", () => {
    // Un instant n'est pas une date civile: « envoyé à 14 h 03 » veut dire
    // 14 h 03 CHEZ LE LECTEUR. La règle UTC des dates nues ne doit pas fuir ici.
    inZone("America/Los_Angeles", () => {
      expect(formatTime("2026-08-07T19:00:00Z")).toBe("12:00");
    });
    inZone("Pacific/Auckland", () => {
      expect(formatTime("2026-08-07T19:00:00Z")).toBe("07:00");
    });
  });

  it("accepte un fuseau nommé par l'appelant — celui du profil de l'élève", () => {
    expect(formatTime("2026-08-07T19:00:00Z", { timeZone: "Europe/Paris" }))
      .toBe("21:00");
  });

  it("compose date et heure", () => {
    expect(
      formatDateTime("2026-08-07T19:00:00Z", { timeZone: "UTC" }),
    ).toBe("7 Aug 2026, 19:00");
  });
});

describe("la table des tags est déclarée à UN endroit", () => {
  it("rend en-GB et fr-FR, jamais en-US", () => {
    inLocale("en");
    expect(displayLocaleTag()).toBe("en-GB");
    inLocale("fr");
    expect(displayLocaleTag()).toBe("fr-FR");
  });

  it("la même date change de MOTS avec la langue de la page", () => {
    // ⚠️ La preuve que le formatage suit la langue de l'APP et non celle du
    // navigateur: c'est le défaut inverse du décalage, et le plus silencieux
    // des deux — dix sites ne passaient aucun argument, donc ils suivaient
    // `navigator.language` et rendaient « 7 août » au milieu d'un écran anglais.
    expect(formatDate("2026-08-07", { locale: "fr", year: false })).toBe("7 août");
    expect(formatDate("2026-08-07", { locale: "en", year: false })).toBe("7 Aug");
    expect(formatWeekday("2026-08-07", { locale: "fr", long: true })).toBe("vendredi");
  });
});

describe("nombres et prix", () => {
  it("sépare les milliers selon la langue", () => {
    // « 2,400 » dans une phrase française se lit « deux virgule quatre ».
    expect(formatNumber(2400, { locale: "en" })).toBe("2,400");
    // L'espace de `fr-FR` est une insécable étroite (U+202F): on compare sur
    // les chiffres pour ne pas figer un octet d'ICU dans un test.
    expect(formatNumber(2400, { locale: "fr" }).replace(/\s/gu, "")).toBe("2400");
  });

  it("place le symbole et la virgule selon la langue, sans centimes inutiles", () => {
    expect(formatPrice(12.99, { locale: "en" })).toBe("€12.99");
    expect(formatPrice(12.99, { locale: "fr" }).replace(/\s/gu, "")).toBe("12,99€");
    // Un prix rond n'affiche pas « 7,00 € »: ça se lit comme une facture.
    expect(formatPrice(7, { locale: "en" })).toBe("€7");
    expect(formatPrice(7, { locale: "fr" }).replace(/\s/gu, "")).toBe("7€");
  });
});

describe("une entrée illisible reste lisible", () => {
  it("rend la chaîne brute plutôt que de faire tomber l'écran", () => {
    // ⚠️ Pas R7 ici, et c'est délibéré: `keel/api/dates.ts` LÈVE parce qu'une
    // date fausse y devient une clé fausse. Ceci est de l'affichage — perdre
    // tout un écran pour une colonne malformée punirait l'utilisateur.
    expect(formatDate("pas-une-date")).toBe("pas-une-date");
    expect(formatDate("")).toBe("");
    expect(formatDate(null)).toBe("");
    expect(formatWeekday(undefined)).toBe("");
  });
});

describe("les montants et la prose de vente disent le même chiffre", () => {
  /**
   * ⚠️ CETTE CEINTURE EXISTE PARCE QUE LE LOT 6 A CRÉÉ UN SECOND ENDROIT.
   *
   * Sept clés du catalogue portaient un montant nu; elles sont sorties dans
   * `prices.ts`. Mais une quarantaine de PHRASES de vente citent encore le
   * chiffre dans leur argument (« 12,99 € par mois pour le foyer »), et
   * celles-là restent du texte — les transformer en gabarits à trous coûterait
   * plus que la divergence qu'elles risquent.
   *
   * Le risque, lui, est réel et il est neuf: changer `PRICES.household` sans
   * toucher la prose donnerait une page de vente qui annonce un prix dans son
   * encadré et un autre dans son paragraphe. Ce test le rend impossible — il
   * n'exige pas que la prose soit interpolée, seulement qu'elle DISE le même
   * nombre quelque part.
   */
  const seeds: Array<[string, Record<string, string>]> = [["en", en], ["fr", fr]];

  it("chaque tarif se retrouve dans la prose des deux packs", () => {
    for (const [name, pack] of seeds) {
      const prose = Object.values(pack).join(" | ");
      for (const [label, amount] of Object.entries(PRICES)) {
        // Les deux écritures décimales, parce que les deux traînent dans les
        // packs — c'est justement ce que ce lot a mesuré.
        const dot = String(amount);
        const comma = dot.replace(".", ",");
        expect(
          prose.includes(dot) || prose.includes(comma),
          `${name}: PRICES.${label} = ${amount} n'apparaît dans aucune phrase`,
        ).toBe(true);
      }
    }
  });

  it("aucune clé du catalogue n'est un montant nu", () => {
    // La règle qui a rendu la divergence possible: une valeur de catalogue qui
    // n'est QU'un prix est un nombre dupliqué par langue. Elle vaut pour les
    // clés à venir, pas seulement pour les sept qu'on vient de sortir.
    const bare = Object.entries(en)
      .filter(([, value]) => /^\s*[€$£]?\s*\d+([.,]\d+)?\s*[€$£]?\s*$/.test(value))
      .map(([key]) => key);
    // Les ARITHMÉTIQUES d'exemple des deux pages B2B restent: leurs opérandes
    // ne sont pas nos tarifs, et elles n'ont de sens que dans leur figure.
    const workedExamples = bare.filter((k) =>
      !/^(gyms\.fig\.|communities\.fig_tier\.)/.test(k)
    );
    expect(workedExamples).toEqual([]);
  });
});
