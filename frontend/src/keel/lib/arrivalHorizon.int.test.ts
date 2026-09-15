import { describe, expect, it } from "vitest";

import {
  ARRIVAL_HORIZON_TEMPLATES,
  ARRIVAL_HORIZONS,
  type ArrivalVoice,
  arrivalCopyCarriesItsCondition,
  arrivalHorizonCopy,
  arrivalHorizonFor,
} from "./arrivalHorizon";
import { weeksToTarget } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";

// ===========================================================================
// 2026-09-15 — LA PHRASE DONNE UNE DATE, ET SA CONDITION AVEC ELLE
//
// ⚠️ CE FICHIER A CHANGÉ DE CAMP DEUX FOIS, ET IL LE DIT.
//   · lot `L3` (2026-08-22) — il gardait l'ABSENCE de tout mot de calendrier
//     (`arrivalCopyIsCalendarFree`);
//   · lot `L3′` (2026-09-01) — il gardait le nombre de semaines COLLÉ à sa
//     réserve (`arrivalCopyCarriesItsReserve`: « pas une date », « la
//     balance »);
//   · aujourd'hui — il garde la DATE COLLÉE À SA CONDITION.
//
// ⛔ CHAQUE GARDE PART AVEC LA DÉCISION QU'ELLE TENAIT, elle n'est jamais
// laissée dans le fichier à guetter une phrase que plus personne n'écrit. Ce
// qui SURVIT est la forme: le chiffre a le droit d'exister, il n'a pas le
// droit d'exister SEUL.
//
// ⚠️ LA MESURE DU 22/08 RESTE VRAIE (erreur d'estimation ±580 kcal/j > déficit
// visé 500 kcal/j, donc une borne haute à l'infini). Elle est écrite en entier
// dans `arrivalHorizon.ts`. C'est ce que le produit CHOISIT d'en dire qui a
// changé, et la conditionnelle est ce qui reste d'elle à l'écran.
//
// ⚠️ `.ts` ET PAS `.tsx`: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`. Un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

const VOICES: readonly ArrivalVoice[] = ["self", "other"];
const LANGS = ["en", "fr"] as const;

describe("le gabarit livré porte sa date, son poids visé ET sa condition", () => {
  it("⛔ LE CAS QUI PASSE: TOUS les gabarits traversent la garde, 2 langues × 2 voix", () => {
    // Sans ce cas, une garde qui refuse tout ressemblerait exactement à une
    // garde qui marche — cicatrice `guards-need-a-passing-case`.
    expect(ARRIVAL_HORIZONS.length).toBeGreaterThanOrEqual(1);
    for (const kind of ARRIVAL_HORIZONS) {
      for (const lang of LANGS) {
        for (const voice of VOICES) {
          const tpl = ARRIVAL_HORIZON_TEMPLATES[kind][lang][voice];
          expect([kind, lang, voice, arrivalCopyCarriesItsCondition(tpl, lang)])
            .toEqual([kind, lang, voice, null]);
        }
      }
    }
  });

  it("les deux langues et les deux voix existent partout, et aucune n'est vide", () => {
    for (const kind of ARRIVAL_HORIZONS) {
      for (const lang of LANGS) {
        for (const voice of VOICES) {
          expect(ARRIVAL_HORIZON_TEMPLATES[kind][lang][voice].length)
            .toBeGreaterThan(40);
        }
      }
    }
  });

  it("⚠️ chaque jeton d'horizon a son gabarit, et réciproquement", () => {
    // Un jeton ajouté sans gabarit sortirait `undefined` à l'écran; un
    // gabarit sans jeton serait du texte que rien ne peut afficher.
    expect(Object.keys(ARRIVAL_HORIZON_TEMPLATES).sort())
      .toEqual([...ARRIVAL_HORIZONS].sort());
  });

  it("⛔ LA DATE ET LA CONDITION SONT DANS LA MÊME CHAÎNE", () => {
    // C'est la garantie STRUCTURELLE, celle qu'aucun test ne peut remplacer:
    // il n'existe pas de moitié à rendre toute seule.
    for (const kind of ARRIVAL_HORIZONS) {
      for (const lang of LANGS) {
        for (const voice of VOICES) {
          const tpl = ARRIVAL_HORIZON_TEMPLATES[kind][lang][voice];
          expect(tpl.split("{date}")).toHaveLength(2);
          expect(tpl.split("{target}")).toHaveLength(2);
        }
      }
    }
  });

  it("⛔ LA VOIX `other` NOMME, LA VOIX `self` TUTOIE", () => {
    // « Tu seras à ton objectif » sous le prénom de quelqu'un d'autre est la
    // cicatrice déjà payée sur cet écran avec « Tu en as coché 4 ».
    for (const kind of ARRIVAL_HORIZONS) {
      for (const lang of LANGS) {
        expect(ARRIVAL_HORIZON_TEMPLATES[kind][lang].other).toContain("{who}");
        expect(ARRIVAL_HORIZON_TEMPLATES[kind][lang].self).not.toContain("{who}");
      }
    }
  });
});

describe("la garde MORD, et sur quoi exactement", () => {
  it("⛔ LA DATE SEULE EST REFUSÉE — c'est la phrase sans son « si »", () => {
    expect(
      arrivalCopyCarriesItsCondition(
        "Le {date} tu seras à ton objectif de {target} kg.",
        "fr",
      ),
    ).toEqual({ kind: "missing_condition", missing: "colle" });
    expect(
      arrivalCopyCarriesItsCondition(
        "On {date} you are at your target of {target} kg.",
        "en",
      ),
    ).toEqual({ kind: "missing_condition", missing: "stick" });
  });

  it("une condition à MOITIÉ est refusée aussi", () => {
    // Dire « si tu colles au plan » sans dire ce que vaut la date laisse la
    // phrase sans sa chute; dire « c'est mathématique » sans le « si » promet
    // une date que rien ne conditionne.
    expect(
      arrivalCopyCarriesItsCondition(
        "Si tu colles au plan, le {date} tu seras à {target} kg.",
        "fr",
      ),
    ).toEqual({ kind: "missing_condition", missing: "mathématique" });
    expect(
      arrivalCopyCarriesItsCondition(
        "On {date} you are at {target} kg. It is arithmetic.",
        "en",
      ),
    ).toEqual({ kind: "missing_condition", missing: "stick" });
  });

  it("CHAQUE marqueur mord, aucun n'est décoratif", () => {
    // Un marqueur qu'on peut retirer sans faire rougir le test est un
    // marqueur qui ne garde rien.
    for (const lang of LANGS) {
      const full = ARRIVAL_HORIZON_TEMPLATES.weeks_at_this_pace[lang].self;
      const markers = lang === "fr"
        ? ["colle", "mathématique"]
        : ["stick", "arithmetic"];
      for (const marker of markers) {
        // ⚠️ RETRAIT INSENSIBLE À LA CASSE, PARCE QUE LA GARDE L'EST. Le
        // gabarit anglais ouvre sur « Stick »: un `replace` littéral ne
        // l'aurait pas trouvé, aurait laissé la phrase ENTIÈRE, et ce cas
        // aurait dit « le marqueur ne garde rien » alors qu'il garde.
        const stripped = full.replace(new RegExp(marker, "i"), "…");
        expect([lang, marker, arrivalCopyCarriesItsCondition(stripped, lang)?.kind])
          .toEqual([lang, marker, "missing_condition"]);
      }
    }
  });

  it("un gabarit SANS date est refusé — la condition seule ne suffit pas", () => {
    // ⛔ C'est la garde dans l'autre sens: le lot rétablit une DATE. Un
    // gabarit qui ne porterait que la prudence serait le retour silencieux à
    // l'écran du 2026-08-22, sous couvert de passer la garde.
    expect(
      arrivalCopyCarriesItsCondition(
        "Si tu colles au plan, tu atteindras ton objectif. C'est mathématique.",
        "fr",
      ),
    ).toEqual({ kind: "no_date" });
  });

  it("un gabarit SANS poids visé est refusé", () => {
    // La date sans le poids qu'elle annonce est une date sur rien: c'est
    // l'objectif qui la rend lisible, pas le calendrier.
    expect(
      arrivalCopyCarriesItsCondition(
        "Si tu colles au plan, le {date} tu y seras. C'est mathématique.",
        "fr",
      ),
    ).toEqual({ kind: "no_target" });
  });

  it("⚠️ la casse ne fait pas passer un gabarit à travers", () => {
    expect(
      arrivalCopyCarriesItsCondition(
        "Si tu COLLES au plan, le {date} tu seras à {target} kg. C'est " +
          "MATHÉMATIQUE.",
        "fr",
      ),
    ).toBeNull();
  });
});

describe("la prémisse: la phrase ne sort pas toute seule", () => {
  const ACCEPTED = {
    targetAccepted: true,
    currentKg: 60,
    targetKg: 55,
    todayLocalIso: "2026-09-15",
  };

  it("sans cible acceptée, rien", () => {
    expect(
      arrivalHorizonFor({ ...ACCEPTED, targetAccepted: false, paceKgPerWeek: 0.45 }),
    ).toBeNull();
  });

  it("sans curseur vivant, rien", () => {
    expect(arrivalHorizonFor({ ...ACCEPTED, paceKgPerWeek: null })).toBeNull();
  });

  it("un rythme nul ou négatif ne mène nulle part: rien", () => {
    expect(arrivalHorizonFor({ ...ACCEPTED, paceKgPerWeek: 0 })).toBeNull();
    expect(arrivalHorizonFor({ ...ACCEPTED, paceKgPerWeek: -1 })).toBeNull();
    expect(arrivalHorizonFor({ ...ACCEPTED, paceKgPerWeek: NaN })).toBeNull();
  });

  it("⛔ sans les DEUX poids, rien — on ne divise pas sur une ignorance", () => {
    expect(
      arrivalHorizonFor({ ...ACCEPTED, currentKg: null, paceKgPerWeek: 0.45 }),
    ).toBeNull();
    expect(
      arrivalHorizonFor({ ...ACCEPTED, targetKg: null, paceKgPerWeek: 0.45 }),
    ).toBeNull();
    expect(
      arrivalHorizonFor({ ...ACCEPTED, currentKg: NaN, paceKgPerWeek: 0.45 }),
    ).toBeNull();
  });

  it("un écart nul ne se dit pas « aujourd'hui »", () => {
    expect(
      arrivalHorizonFor({ ...ACCEPTED, targetKg: 60, paceKgPerWeek: 0.45 }),
    ).toBeNull();
  });

  it("⛔ SANS JOUR D'AUJOURD'HUI LISIBLE, RIEN — on n'invente pas un jour", () => {
    // Le module est pur: la date d'aujourd'hui ENTRE. Une entrée illisible ne
    // doit pas produire une date fabriquée, elle doit fermer la phrase.
    for (const today of ["", "15/09/2026", "2026-9-15", "hier"]) {
      expect([today, arrivalHorizonFor({
        ...ACCEPTED,
        todayLocalIso: today,
        paceKgPerWeek: 0.45,
      })]).toEqual([today, null]);
    }
  });
});

describe("la date, et d'où elle vient", () => {
  it("le cas du design: 60 → 55 kg à 0,45 kg/sem = 12 semaines, soit 12×7 jours", () => {
    expect(
      arrivalHorizonFor({
        targetAccepted: true,
        currentKg: 60,
        targetKg: 55,
        paceKgPerWeek: 0.45,
        todayLocalIso: "2026-09-15",
      }),
    ).toEqual({
      kind: "weeks_at_this_pace",
      weeks: 12,
      arrivalOn: "2026-12-08",
      targetKg: 55,
    });
  });

  it("le second cas mesuré: 94 → 80 kg à 0,45 kg/sem = 32 semaines", () => {
    expect(
      arrivalHorizonFor({
        targetAccepted: true,
        currentKg: 94,
        targetKg: 80,
        paceKgPerWeek: 0.45,
        todayLocalIso: "2026-09-15",
      }),
    ).toEqual({
      kind: "weeks_at_this_pace",
      weeks: 32,
      arrivalOn: "2027-04-27",
      targetKg: 80,
    });
  });

  it("⚠️ LA DIVISION EST CELLE DE `weeksToTarget`, PAS UNE SECONDE", () => {
    // Une arithmétique recopiée ici divergerait au premier changement
    // d'arrondi — et `weeksToTarget` arrondit AU SUPÉRIEUR par décision
    // (annoncer trop tôt est une déception programmée).
    for (const [cur, tgt, pace] of [
      [60, 55, 0.45],
      [94, 80, 0.45],
      [70, 78, 0.25],
      [80, 74.2, 0.5],
    ] as const) {
      const horizon = arrivalHorizonFor({
        targetAccepted: true,
        currentKg: cur,
        targetKg: tgt,
        paceKgPerWeek: pace,
        todayLocalIso: "2026-09-15",
      });
      expect([cur, tgt, pace, horizon?.weeks ?? null])
        .toEqual([cur, tgt, pace, weeksToTarget(cur, tgt, pace)]);
    }
  });

  it("⚠️ LA DATE SUIT LES SEMAINES, À SEPT JOURS PRÈS — sur un an entier", () => {
    // ⛔ ET ELLE NE DÉCALE PAS AU CHANGEMENT D'HEURE. L'arithmétique est en
    // UTC: une addition en heure locale saute ou répète un jour deux fois par
    // an, sur une phrase qui annonce une date. Ce cas balaie douze départs.
    for (let m = 1; m <= 12; m++) {
      const today = `2026-${String(m).padStart(2, "0")}-15`;
      const h = arrivalHorizonFor({
        targetAccepted: true,
        currentKg: 94,
        targetKg: 80,
        paceKgPerWeek: 0.45,
        todayLocalIso: today,
      })!;
      const days = (Date.parse(`${h.arrivalOn}T00:00:00Z`) -
        Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
      expect([today, days]).toEqual([today, h.weeks * 7]);
    }
  });

  it("⚠️ LA PRISE DE POIDS AUSSI — l'écart est une valeur absolue", () => {
    expect(
      arrivalHorizonFor({
        targetAccepted: true,
        currentKg: 60,
        targetKg: 66,
        paceKgPerWeek: 0.25,
        todayLocalIso: "2026-09-15",
      })?.weeks,
    ).toBe(24);
  });
});

describe("la phrase rendue", () => {
  const HORIZON = {
    kind: "weeks_at_this_pace",
    weeks: 32,
    arrivalOn: "2027-04-27",
    targetKg: 80,
  } as const;

  it("⛔ elle porte la date, le poids visé ET sa condition, dans les deux langues", () => {
    const fr = arrivalHorizonCopy(HORIZON, "fr", "self", "Fabrice");
    expect(fr).toContain("27 avril 2027");
    expect(fr).toContain("80 kg");
    expect(fr).toContain("Si tu colles au plan");
    expect(fr).toContain("C'est mathématique");

    const en = arrivalHorizonCopy(HORIZON, "en", "self", "Fabrice");
    expect(en).toContain("27 April 2027");
    expect(en).toContain("80 kg");
    expect(en).toContain("Stick to the plan");
    expect(en).toContain("It is arithmetic");
  });

  it("⛔ LA VOIX SUIT LE SUJET: « tu » sur sa fiche, le PRÉNOM sur celle d'un tiers", () => {
    const self = arrivalHorizonCopy(HORIZON, "fr", "self", "Fabrice");
    expect(self).toContain("tu seras");
    expect(self).not.toContain("Fabrice");

    const other = arrivalHorizonCopy(HORIZON, "fr", "other", "Fabrice");
    expect(other).toContain("Fabrice");
    expect(other).not.toMatch(/\btu\b/);
  });

  it("⛔ AUCUN GABARIT NE SURVIT AU RENDU", () => {
    // Un gabarit non substitué se lit comme un bug à l'écran, et il est
    // passé une fois par une clé i18n de ce dépôt.
    for (const lang of LANGS) {
      for (const voice of VOICES) {
        const copy = arrivalHorizonCopy(HORIZON, lang, voice, "Fabrice");
        for (const token of ["{date}", "{target}", "{who}"]) {
          expect([lang, voice, token, copy.includes(token)])
            .toEqual([lang, voice, token, false]);
        }
      }
    }
  });

  it("⚠️ la date et le poids sont formatés dans la langue de la phrase", () => {
    // « 80,5 kg » ne s'écrit pas « 80.5 » en français, et « 27 avril » ne
    // s'écrit pas « April 27 ».
    const half = { ...HORIZON, targetKg: 80.5 } as const;
    expect(arrivalHorizonCopy(half, "fr", "self", "F")).toContain("80,5 kg");
    expect(arrivalHorizonCopy(half, "en", "self", "F")).toContain("80.5 kg");
    expect(arrivalHorizonCopy(HORIZON, "fr", "self", "F")).toContain("avril");
    expect(arrivalHorizonCopy(HORIZON, "en", "self", "F")).toContain("April");
  });

  it("⛔ AUCUN kcal DANS LA PHRASE — clause C5", () => {
    // Une grandeur d'énergie PAR BOUCHE sortirait ici sans avoir traversé la
    // moindre porte, à côté d'un curseur que le compte maître règle POUR
    // QUELQU'UN D'AUTRE.
    for (const lang of LANGS) {
      for (const voice of VOICES) {
        expect(arrivalHorizonCopy(HORIZON, lang, voice, "F"))
          .not.toMatch(/kcal|calorie/i);
      }
    }
  });

  it("⛔ et elle ne promet PAS que le plan suivra les pesées", () => {
    // `L11★`: 9 comptes portent plus d'une pesée, ZÉRO BOUCHE, et aucun
    // écrivain ne propage vers `household_member_bodies.weight_kg`. Une
    // phrase qui l'annoncerait remplacerait une promesse fausse par une
    // autre. La phrase parle de ce que la personne FAIT (coller au plan), pas
    // de ce que le produit lira de sa balance.
    expect(arrivalHorizonCopy(HORIZON, "fr", "self", "F"))
      .not.toMatch(/le plan (s'|se )?(adapte|ajuste|suivra|suit)/i);
    expect(arrivalHorizonCopy(HORIZON, "en", "self", "F"))
      .not.toMatch(/the plan will (follow|adjust|adapt|track)/i);
  });

  it("⛔ ET AUCUNE FOURCHETTE — la borne haute est l'infini", () => {
    // « 12 à 24 semaines » serait une seconde promesse, fausse comme la
    // première: l'intervalle de l'écart quotidien exécuté traverse zéro.
    // C'est le SEUL énoncé que ce module continue de s'interdire.
    for (const lang of LANGS) {
      for (const voice of VOICES) {
        const copy = arrivalHorizonCopy(HORIZON, lang, voice, "F");
        expect(copy).not.toMatch(/\d+\s*(à|to|–|—)\s*\d+/);
        expect(copy).not.toMatch(/±|\+\/-/);
      }
    }
  });
});
