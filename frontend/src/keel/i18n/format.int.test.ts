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
  // ⚠️ `/start` ET PLUS `/`. Il faut ici un chemin DÉCLARÉ et entièrement
  // TRADUIT — sinon `uiLocale()` rend l'anglais quoi qu'on choisisse — et
  // qui ne soit PAS routé par langue. Depuis que l'URL porte la langue des
  // quatre pages de vente (`LOCALE_ROUTED_PATHS` dans `i18n/catalog.ts`),
  // `/` est FRANÇAIS par son adresse: le choix passé à ce helper n'y avait
  // plus aucun effet, et ces tests mesuraient la locale de la page d'accueil
  // au lieu de celle du visiteur. `/start` est une porte fonctionnelle, elle
  // suit le visiteur — c'est exactement ce que ce helper veut simuler.
    value: { pathname: "/start", search: "", href: "https://x.test/start" },
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

  /**
   * ⚠️ CE TEST A CHANGÉ DE QUESTION LE 2026-09-01, ET IL FAUT LIRE POURQUOI.
   *
   * Il demandait: « chaque tarif de `PRICES` se retrouve-t-il quelque part
   * dans la prose ? » — une question qui n'a plus de sens depuis que le bloc
   * d'offre partagé (`ui/OfferLines.tsx`, namespace `offer`) INTERPOLE ses
   * montants. `PRICES.claimedProfile` n'est plus écrit nulle part en toutes
   * lettres, et c'est le résultat voulu, pas un défaut: un montant qu'aucune
   * phrase ne recopie ne peut pas diverger.
   *
   * Ce qui reste vrai, et donc ce qu'il vérifie maintenant: les descriptions
   * SEO n'ont AUCUN composant pour interpoler — une balise `<meta>` est écrite
   * avant qu'un `t()` puisse la remplir. Les trois PAGES DE VENTE du foyer
   * portent donc le tarif en toutes lettres, et ce sont les seules. Si le
   * tarif bouge sans elles, trois pages annoncent un prix à Google et un autre
   * à leur lecteur.
   *
   * ⚠️ `home.seo_description` EST HORS DE CETTE RÈGLE, ET C'EST UNE DÉCISION.
   * Le hall n'a jamais vendu — il aiguille —, et surtout sa description est
   * RECOPIÉE MOT POUR MOT dans `frontend/index.html`, qui est un fichier
   * statique: aucun `t()`, aucun `PRICES`, aucun test ne peut l'y suivre. Un
   * tarif dans cette phrase-là serait le seul du produit que rien ne tiendrait
   * à jour. Il n'y en a pas, et il ne faut pas en ajouter.
   */
  it("les descriptions SEO des pages de vente disent le tarif courant", () => {
    const dot = String(PRICES.household);
    const comma = dot.replace(".", ",");
    for (const [name, pack] of seeds) {
      const seoKeys = Object.keys(pack).filter((k) => /^(mealprep|couples|families)\.seo_description$/.test(k));
      // La ceinture de la ceinture: si le filtre ne trouve plus rien, ce test
      // verdit en ne regardant rien. Les trois pages de vente en ont une.
      expect(seoKeys.length, `${name}: aucune description SEO de page de vente trouvée`).toBe(3);
      for (const key of seoKeys) {
        const value = (pack as Record<string, string>)[key];
        expect(
          value.includes(dot) || value.includes(comma),
          `${name}: ${key} ne dit pas le tarif courant (${PRICES.household})`,
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

  /**
   * LA CEINTURE QUI MANQUAIT, ET CE QU'ELLE AURAIT ATTRAPÉ.
   *
   * ── LE DÉFAUT, MESURÉ LE 2026-09-01 ──────────────────────────────────────
   * `PRICES.household` était passé de 12,99 à 11,99 le 2026-08-31. Le test
   * d'au-dessus est resté VERT: il demande seulement que chaque tarif
   * apparaisse QUELQUE PART dans la prose, et « 11,99 » y était. Ce qu'il ne
   * pouvait pas voir, c'est que l'ancien chiffre y était AUSSI, et que le
   * second supplément avait deux valeurs — `/` et `/couples` vendaient l'accès
   * d'une autre personne 2 €, `/families` le vendait 1,99 € sous un autre nom.
   * Quatre pages de vente, trois tarifs, à un clic les unes des autres.
   *
   * ── CE QUE CELLE-CI DEMANDE ──────────────────────────────────────────────
   * L'inverse, et c'est l'assertion qui ferme le trou: TOUT montant en euros
   * écrit dans la prose de vente doit être une valeur de `PRICES`. Un tarif
   * périmé qu'on a oublié de balayer n'est plus « un chiffre en trop quelque
   * part », c'est un rouge.
   *
   * ⚠️ ELLE NE COUVRE QUE LES NAMESPACES DE VENTE. Le reste du catalogue parle
   * de budget de courses, de montants saisis par un coach, d'exemples chiffrés
   * — des nombres qui ne sont pas nos tarifs et n'ont pas à leur ressembler.
   */
  const SALES_NAMESPACES = /^(home|offer|mealprep|couples|families|start|pro|coaches|gyms|communities)\./;

  /**
   * Les ARITHMÉTIQUES illustratives, exclues nommément.
   *
   * Cicatrice du dépôt: une liste-garde nommée ne garde que ce qu'elle nomme.
   * Celle-ci est donc courte ET explicite — « 37 membres × 25 € = 925 € » est
   * un exemple, ses opérandes ne sont pas nos tarifs, et le jour où une page
   * en ajoute un elle doit venir l'écrire ici. C'est le point.
   */
  const WORKED_EXAMPLES = /^(gyms\.fig\.|communities\.fig_tier\.|communities\.tier\.example$)/;

  it("aucun montant de la prose de vente n'est étranger à PRICES", () => {
    const known = new Set<string>();
    for (const amount of Object.values(PRICES)) {
      known.add(String(amount));
      known.add(String(amount).replace(".", ","));
    }
    // Un montant est un nombre COLLÉ à un symbole d'euro, d'un côté ou de
    // l'autre. Sans cette exigence, « 8 personnes » et « 3 jours » seraient
    // comptés comme des tarifs.
    const MONEY = /(?:€\s?(\d+(?:[.,]\d+)?))|(?:(\d+(?:[.,]\d+)?)\s?€)/g;
    const strays: string[] = [];
    for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
      for (const [key, value] of Object.entries(pack)) {
        if (!SALES_NAMESPACES.test(key) || WORKED_EXAMPLES.test(key)) continue;
        for (const m of value.matchAll(MONEY)) {
          const amount = (m[1] ?? m[2]).replace(",", ".");
          if (known.has(amount) || known.has(amount.replace(".", ","))) continue;
          strays.push(`${name}: ${key} dit « ${m[0]} », qui n'est aucun PRICES.*`);
        }
      }
    }
    expect(strays).toEqual([]);
  });

  /**
   * LE TARIF ÉCRIT EN LETTRES — l'angle mort du test ci-dessus.
   *
   * Mesuré le 2026-09-01: `couples.fig.who.desc` annonçait « pour deux euros
   * par mois » (« two euros a month » en anglais). Le montant était périmé, il
   * contredisait `/families` sur la même journée, et AUCUN balayage de
   * chiffres ne pouvait le voir — il n'y avait pas de chiffre.
   *
   * La règle est donc plus simple qu'une détection: dans la prose de vente, un
   * montant s'écrit avec le SYMBOLE, et il vient de `formatPrice`. Le mot
   * « euro » n'y a rien à faire. Les arithmétiques illustratives gardent leur
   * exemption nommée — c'est leur seul privilège, et il est court.
   */
  it("aucun tarif n'est écrit en toutes lettres dans la prose de vente", () => {
    const spelled: string[] = [];
    for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
      for (const [key, value] of Object.entries(pack)) {
        if (!SALES_NAMESPACES.test(key) || WORKED_EXAMPLES.test(key)) continue;
        if (/\beuros?\b/i.test(value)) spelled.push(`${name}: ${key} écrit « euro » au lieu du symbole`);
      }
    }
    expect(spelled).toEqual([]);
  });
});
