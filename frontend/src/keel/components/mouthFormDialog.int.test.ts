import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import MouthFormDialog, {
  MouthFormFields,
  type MouthSubject,
} from "./MouthFormDialog";
import {
  emptyMouthDraft,
  type MouthFormBlock,
  type MouthFormDraft,
} from "../lib/mouthForm";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import { PACE_WARNING_LABELS } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";
import { ACTIVITY_LEVELS } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import { GOAL_TOKENS } from "../../../../supabase/functions/_shared/keel/tokens.ts";

// ===========================================================================
// L5-A (2026-08-18) — LE POP-UP « UNE BOUCHE », SUR LA VALEUR RENDUE
//
// ⚠️ CE FICHIER MONTE LA FENÊTRE ET LIT SON HTML. Des tests de SOURCE sont
// restés verts sur du code mort dans ce dépôt — une prop passée à un tableau
// vide en dur, une garde qui recopiait du JSX. La seule question qui compte
// est « QU'EST-CE QUE LE LECTEUR VOIT, ET COMBIEN DE FOIS ».
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
//
// ⚠️ ON MONTE `MouthFormFields`, PAS `MouthFormDialog`, ET C'EST MESURÉ.
// `Modal` passe par `createPortal(…, document.body)` et `vitest.config.ts`
// tourne en environnement `node`: monter la fenêtre entière lève
// `ReferenceError: document is not defined` — 38 rouges au premier lancement de
// ce fichier. Le CORPS est ce qui porte les six blocs; le chrome de la fenêtre
// (Échap, verrou de défilement, `aria-modal`) est l'obligation de `Modal`, et
// elle est tenue une seule fois, chez lui.
// ⛔ Ne pas passer la suite en `jsdom` pour ça: `vitest.config.ts` est partagé
// par toutes les lanes.
// ===========================================================================

const TODAY = "2026-08-18";
const ADULT_BIRTH = "1990-05-04";
const MINOR_BIRTH = "2016-05-04";
/** La fenêtre s'ouvre sur `/app/household` comme sur `/app/setup`. */
const PATH = "/app/household";

/** Le wrapper, lu sur le disque — voir la seule assertion de source, plus bas. */
const dialogSource = readFileSync(
  new URL("./MouthFormDialog.tsx", import.meta.url),
  "utf-8",
);

const NO_ACCOUNT: MouthSubject = { existing: false, hasAccount: false };
const WITH_ACCOUNT: MouthSubject = { existing: true, hasAccount: true };

function html(args: {
  draft?: Partial<MouthFormDraft>;
  subject?: MouthSubject;
  locale?: "en" | "fr";
  open?: boolean;
  failure?: string | null;
  /** Le bloc sautable ouvert. `null` (défaut) = tous repliés. */
  openBlock?: MouthFormBlock | null;
}): string {
  // `uiLocale()` lit le CHEMIN COURANT — la langue d'une page dépend de la
  // page, pas seulement du visiteur —, donc un rendu sans `location` sort en
  // anglais quoi qu'on ait choisi. Patron de `kitchenEquipmentCard.int.test.ts`.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(args.locale ?? "en");
  return renderToStaticMarkup(
    createElement(MouthFormFields, {
      open: args.open ?? true,
      onClose: () => {},
      draft: { ...emptyMouthDraft(), ...(args.draft ?? {}) },
      onChange: () => {},
      subject: args.subject ?? NO_ACCOUNT,
      todayLocalIso: TODAY,
      busy: false,
      failure: args.failure ?? null,
      openBlock: args.openBlock ?? null,
      onOpenBlock: () => {},
      onSubmit: () => {},
    }),
  );
}

/**
 * ⚠️ ON RETIRE LES CLASSES AVANT DE CHERCHER `disabled`. Tailwind écrit
 * `disabled:cursor-not-allowed` DANS la classe de chaque bouton: chercher le
 * mot dans le markup brut rend VRAI sur un bouton parfaitement actif.
 */
function withoutClasses(markup: string): string {
  return markup.replace(/\sclass="[^"]*"/g, "");
}

function decode(markup: string): string {
  return markup
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

function text(markup: string): string {
  return decode(withoutClasses(markup).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ");
}

function countOf(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

const ADULT_COMPLETE: Partial<MouthFormDraft> = {
  firstName: "Zoe",
  birthDate: ADULT_BIRTH,
  heightCm: "165",
  weightKg: "60",
  gender: "female",
  activityLevel: "sedentary",
  goal: "maintenance",
};

afterEach(() => setChosenUiLocaleForTest("en"));

// ---------------------------------------------------------------------------
// LES SIX BLOCS SONT LÀ
// ---------------------------------------------------------------------------

describe("les six blocs se rendent, dans l'ordre de la conception", () => {
  it("les six titres sont à l'écran", () => {
    const body = text(html({}));
    for (
      const label of [
        en["household.mouth.identity"],
        en["household.mouth.direction"],
        en["household.mouth.body"],
        en["household.mouth.habits"],
        en["setup.mouths.allergies"],
        en["household.mouth.tastes"],
      ]
    ) {
      expect(body).toContain(decode(label));
    }
  });

  it("les trois obligatoires sont DÉPLIÉS, les sautables non", () => {
    const markup = html({});
    // Les champs des blocs obligatoires sont dans le markup.
    expect(markup).toContain('id="mouth-first-name"');
    expect(markup).toContain('id="mouth-birth-date"');
    expect(markup).toContain('id="mouth-height"');
    expect(markup).toContain('id="mouth-weight"');
    expect(markup).toContain('id="mouth-gender"');
    // Un bloc sautable REPLIÉ ne rend AUCUN de ses champs.
    expect(markup).not.toContain('id="mouth-dislike"');
    expect(markup).not.toContain('id="mouth-diet"');
  });

  it("un bloc sautable déplié rend ses champs", () => {
    const markup = html({ draft: { goal: "muscle_gain" } });
    // Le bloc `habits` s'ouvre TOUT SEUL en prise (§Bloc 4).
    expect(markup).toContain('id="mouth-habit-breakfast"');
    // Et les deux autres s'ouvrent quand on les nomme.
    expect(html({ openBlock: "tastes" })).toContain('id="mouth-dislike"');
  });
});

// ---------------------------------------------------------------------------
// ⛔ ON NE DEMANDE JAMAIS « ADULTE OU ENFANT »
// ---------------------------------------------------------------------------

describe("aucune question « adulte ou enfant »", () => {
  it("la question de `SetupPage` n'apparaît nulle part", () => {
    const body = text(html({}));
    // La formulation exacte de l'ancien champ, dans les deux langues.
    expect(body).not.toContain(decode(en["setup.mouths.kind"]));
    expect(body).not.toContain(decode(en["setup.mouths.kind_adult"]));
    expect(body).not.toContain(decode(en["setup.mouths.kind_child"]));
    const bodyFr = text(html({ locale: "fr" }));
    expect(bodyFr).not.toContain(decode(fr["setup.mouths.kind"]));
    expect(bodyFr).not.toContain(decode(fr["setup.mouths.kind_child"]));
  });

  it("et l'écran DIT que la date de naissance le remplace", () => {
    expect(text(html({}))).toContain(
      decode(en["household.mouth.birth_date_hint"]),
    );
  });

  it("une date illisible est SIGNALÉE — « je ne sais pas » n'est pas « enfant »", () => {
    const unknown = text(html({ draft: { birthDate: "pas-une-date" } }));
    expect(unknown).toContain(decode(en["household.mouth.age_unknown"]));
    const adult = text(html({ draft: { birthDate: ADULT_BIRTH } }));
    expect(adult).not.toContain(decode(en["household.mouth.age_unknown"]));
  });
});

// ---------------------------------------------------------------------------
// BLOC 2 — TROIS DIRECTIONS, ET LES QUATRE ÉCRANS DU CURSEUR
// ---------------------------------------------------------------------------

describe("la direction: TROIS choix, jamais six", () => {
  it("trois boutons radio, et exactement les trois jetons de la base", () => {
    const markup = html({});
    expect(countOf(markup, 'name="mouth-goal"')).toBe(3);
    for (const token of GOAL_TOKENS) expect(markup).toContain(`value="${token}"`);
    // Les trois jetons retirés le 2026-08-18 ne sont proposés nulle part.
    for (const retired of ["recomposition", "performance", "health"]) {
      expect(markup).not.toContain(`value="${retired}"`);
    }
  });
});

describe("le curseur — quatre états, et deux d'entre eux sont des PHRASES", () => {
  it("`maintenance`: les deux champs sont REPLIÉS", () => {
    const markup = html({ draft: { ...ADULT_COMPLETE, goal: "maintenance" } });
    expect(markup).not.toContain('id="mouth-target-weight"');
    expect(markup).not.toContain('id="mouth-pace"');
  });

  it("⚠️ corps inconnu: on DEMANDE le corps, on n'affiche PAS de curseur", () => {
    const markup = html({
      draft: { firstName: "Zoe", birthDate: ADULT_BIRTH, goal: "fat_loss" },
    });
    expect(markup).not.toContain('id="mouth-pace"');
    expect(text(markup)).toContain(
      decode(en["household.mouth.pace_needs_body"]),
    );
  });

  it("⚠️ corps SANS MARGE: une phrase, et surtout PAS un curseur de 0,05 à 0", () => {
    // D3 de la vérification du socle. Un contrôle mort se lit comme un bouton
    // cassé, jamais comme un refus.
    const markup = html({
      draft: {
        firstName: "Ada",
        birthDate: ADULT_BIRTH,
        heightCm: "140",
        weightKg: "25",
        gender: "female",
        activityLevel: "sedentary",
        goal: "fat_loss",
      },
    });
    expect(markup).not.toContain('id="mouth-pace"');
    expect(markup).not.toContain('max="0"');
    expect(text(markup)).toContain(
      decode(en["household.mouth.pace_no_margin"]),
    );
    // ET CE N'EST PAS LA MÊME PHRASE que « je ne connais pas ce corps ».
    expect(text(markup)).not.toContain(
      decode(en["household.mouth.pace_needs_body"]),
    );
  });

  it("corps connu et marge disponible: un curseur, borné sur CE corps", () => {
    const markup = html({
      draft: { ...ADULT_COMPLETE, goal: "fat_loss", targetWeightKg: "55" },
    });
    expect(markup).toContain('id="mouth-pace"');
    expect(markup).toContain('type="range"');
    // 60 kg → 0,45 kg/semaine, le cas du design.
    expect(markup).toContain('max="0.45"');
    expect(markup).toContain('min="0.05"');
    expect(markup).toContain('step="0.05"');
  });

  it("la DATE D'ARRIVÉE se rend quand elle est calculable", () => {
    const body = text(html({
      draft: { ...ADULT_COMPLETE, goal: "fat_loss", targetWeightKg: "55" },
    }));
    // 5 kg à 0,45 kg/semaine → 12 semaines (arrondi au supérieur).
    expect(body).toContain("About 12 weeks");
  });
});

// ---------------------------------------------------------------------------
// ⚠️ LE SEUIL DE 0,5 EST UN AVERTISSEMENT, PAS UNE BORNE
// ---------------------------------------------------------------------------

describe("en prise, le curseur DIT sans interdire", () => {
  const LIFTER: Partial<MouthFormDraft> = {
    firstName: "Theo",
    birthDate: ADULT_BIRTH,
    heightCm: "185",
    weightKg: "110",
    gender: "male",
    activityLevel: "trains_hard",
    goal: "muscle_gain",
  };

  it("le curseur MONTE au-delà de 0,5 — la butée est ailleurs", () => {
    const markup = html({ draft: LIFTER });
    expect(markup).toContain('max="1"');
  });

  it("au-delà du seuil, LA PHRASE DU MODULE — en anglais", () => {
    const body = text(html({ draft: { ...LIFTER, paceKgPerWeek: "0.75" } }));
    expect(body).toContain(
      decode(PACE_WARNING_LABELS.surplus_becomes_fat.en),
    );
  });

  it("… ET EN FRANÇAIS — le seuil et son mot sont une seule décision", () => {
    const body = text(
      html({ draft: { ...LIFTER, paceKgPerWeek: "0.75" }, locale: "fr" }),
    );
    expect(body).toContain(
      decode(PACE_WARNING_LABELS.surplus_becomes_fat.fr),
    );
    // ⚠️ ET PAS L'ANGLAIS À CÔTÉ: une phrase anglaise au milieu d'un écran
    // français est la couture exacte que le chantier i18n ferme.
    expect(body).not.toContain(
      decode(PACE_WARNING_LABELS.surplus_becomes_fat.en),
    );
  });

  it("à 0,50 pile, aucune phrase: le seuil est FRANCHI, pas atteint", () => {
    const body = text(html({ draft: { ...LIFTER, paceKgPerWeek: "0.5" } }));
    expect(body).not.toContain(
      decode(PACE_WARNING_LABELS.surplus_becomes_fat.en),
    );
  });

  it("une PERTE n'affiche jamais cet avertissement", () => {
    const body = text(html({
      draft: { ...LIFTER, goal: "fat_loss", paceKgPerWeek: "0.45" },
    }));
    expect(body).not.toContain(
      decode(PACE_WARNING_LABELS.surplus_becomes_fat.en),
    );
  });
});

// ---------------------------------------------------------------------------
// LE POIDS VISÉ — LE REFUS EST À CÔTÉ DU CHAMP
// ---------------------------------------------------------------------------

describe("le refus du poids visé vit sur le geste qui le lève", () => {
  it("il se rend, NOMMÉ, et le bouton d'inscription est retenu", () => {
    const markup = html({
      draft: { ...ADULT_COMPLETE, goal: "fat_loss", targetWeightKg: "70" },
    });
    expect(text(markup)).toContain(
      decode(en["household.mouth.target_refused_wrong_direction"]),
    );
    expect(withoutClasses(markup)).toMatch(/\sdisabled(=""|\s|>)/);
  });

  it("accepté: aucun refus à l'écran", () => {
    const body = text(html({
      draft: { ...ADULT_COMPLETE, goal: "fat_loss", targetWeightKg: "55" },
    }));
    expect(body).not.toContain(
      decode(en["household.mouth.target_refused_wrong_direction"]),
    );
    expect(body).not.toContain(
      decode(en["household.mouth.target_refused_implausible"]),
    );
  });
});

// ---------------------------------------------------------------------------
// BLOC 3 — LE NIVEAU D'ACTIVITÉ
// ---------------------------------------------------------------------------

describe("le niveau d'activité — quatre crans, jamais un nombre", () => {
  it("exactement QUATRE boutons, et aucun cinquième « je ne sais pas »", () => {
    const markup = html({});
    expect(countOf(markup, 'name="mouth-activity"')).toBe(4);
    expect(countOf(markup, 'name="mouth-activity"')).toBe(
      ACTIVITY_LEVELS.length,
    );
  });

  it("les quatre libellés sont des PHRASES, pas des nombres", () => {
    const body = text(html({}));
    for (const level of ACTIVITY_LEVELS) {
      const key =
        `household.mouth.activity_${level}` as "household.mouth.activity_sedentary";
      expect(body).toContain(decode(en[key]));
    }
    // Aucun facteur d'activité (1,45 / 1,65 / 1,80 / 2,00) à l'écran.
    for (const factor of ["1.45", "1.65", "1.8", "2.0", "1,45", "1,65"]) {
      expect(body).not.toContain(factor);
    }
  });

  it("rien n'est PRÉ-COCHÉ: ne pas répondre reste possible", () => {
    // Une coche automatique écrirait un fait faux que personne ne peut
    // démentir — cicatrice `auto-tick-writes-undeniable-false-facts`.
    const markup = html({});
    expect(countOf(markup, 'name="mouth-activity" checked')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BLOC 4 — LE SHAKER
// ---------------------------------------------------------------------------

describe("le shaker demande CE QU'IL APPORTE", () => {
  it("il n'existe QUE pour une bouche qui a un compte", () => {
    // `fixed_intakes` est clé sur `user_id`, et la lane foyer passe
    // `fixedIntakes: []` en dur. Le montrer ailleurs serait promettre.
    const withAccount = html({
      draft: { goal: "muscle_gain" },
      subject: WITH_ACCOUNT,
    });
    expect(text(withAccount)).toContain(
      decode(en["household.mouth.shaker_foreground"]),
    );
    const without = html({
      draft: { goal: "muscle_gain" },
      subject: NO_ACCOUNT,
    });
    expect(text(without)).not.toContain(
      decode(en["household.mouth.shaker_foreground"]),
    );
    expect(text(without)).not.toContain(
      decode(en["household.mouth.shaker_background"]),
    );
  });

  it("mis en AVANT pour qui prend du poids, proposé aux autres", () => {
    const gaining = text(
      html({ draft: { goal: "muscle_gain" }, subject: WITH_ACCOUNT }),
    );
    expect(gaining).toContain(decode(en["household.mouth.shaker_foreground"]));
    expect(gaining).not.toContain(
      decode(en["household.mouth.shaker_background"]),
    );
  });

  it("⚠️ il demande LES DEUX NOMBRES: protéines ET calories", () => {
    const markup = html({
      draft: {
        goal: "muscle_gain",
        shaker: {
          label: "",
          servingGrams: "",
          proteinGPerServing: "",
          energyKcalPerServing: "",
          slot: "",
        },
      },
      subject: WITH_ACCOUNT,
    });
    expect(markup).toContain('id="mouth-shaker-protein"');
    expect(markup).toContain('id="mouth-shaker-kcal"');
    expect(markup).toContain('id="mouth-shaker-grams"');
    // ET IL DIT OÙ ON LES LIT: sur l'étiquette du pot — un fait du produit,
    // jamais un verdict sur la personne.
    expect(text(markup)).toContain(
      decode(en["household.mouth.shaker_label_source"]),
    );
  });

  it("incomplet: il le DIT, plutôt que de se faire jeter en silence", () => {
    const body = text(html({
      draft: {
        goal: "muscle_gain",
        shaker: {
          label: "mon shaker",
          servingGrams: "30",
          proteinGPerServing: "24",
          energyKcalPerServing: "",
          slot: "",
        },
      },
      subject: WITH_ACCOUNT,
    }));
    expect(body).toContain(decode(en["household.mouth.shaker_incomplete"]));
  });
});

// ---------------------------------------------------------------------------
// BLOC 6 — LES GOÛTS VIVENT SUR LA LIGNE MEMBRE
// ---------------------------------------------------------------------------

describe("les goûts et le régime", () => {
  it("le régime n'est offert QU'À une bouche sans compte", () => {
    // La base refuse `has_account`: le régime de quelqu'un qui a un compte vit
    // dans SON « about you ». Afficher le champ montrerait un contrôle qui
    // échoue à tous les coups.
    //
    // ⚠️ LE BLOC EST OUVERT ICI, ET C'EST CE QUI REND CE TEST RÉEL. Sur un bloc
    // replié, `id="mouth-diet"` est absent DES DEUX CÔTÉS: la première version
    // de ce test passait quoi qu'on fasse, et une mutation qui montrait le
    // champ à tout le monde restait verte.
    const withAccount = html({ subject: WITH_ACCOUNT, openBlock: "tastes" });
    expect(withAccount).not.toContain('id="mouth-diet"');
    const without = html({ subject: NO_ACCOUNT, openBlock: "tastes" });
    expect(without).toContain('id="mouth-diet"');
  });

  it("un dégoût N'EST PAS une allergie, et ça se lit BLOC REPLIÉ", () => {
    // Les deux tables ont deux natures: une allergie est médicale et
    // fail-closed; un dégoût est un fait de foyer dont le verrou serveur TAIT
    // le pourquoi. Les fondre promettrait une garde de sécurité sur une
    // préférence.
    //
    // ⚠️ LA DISTINCTION EST DANS L'EN-TÊTE DU BLOC, PAS SOUS SON CHAMP, ET
    // C'EST UNE CORRECTION MESURÉE: sous le champ, elle n'était lisible
    // qu'après avoir déplié — c'est-à-dire après avoir choisi le mauvais bloc.
    const body = text(html({}));
    expect(body).toContain(decode(en["household.mouth.tastes_hint"]));
    expect(body).toContain("Dislike, not allergy");
    const bodyFr = text(html({ locale: "fr" }));
    expect(bodyFr).toContain("Dégoût, pas allergie");
  });
});

// ---------------------------------------------------------------------------
// LA FENÊTRE SE FERME, TOUJOURS
// ---------------------------------------------------------------------------

describe("la fenêtre se ferme, et ce qui retient est NOMMÉ", () => {
  it("une sortie est rendue même quand les trois blocs manquent", () => {
    const body = text(html({}));
    // ⚠️ DEUX SORTIES EXISTENT, ET UNE SEULE EST DANS CE COMPOSANT. Le bouton
    // du bas est ici; le second est le `closeLabel` du fronton, passé par
    // `MouthFormDialog` — sans lui, `Modal` retomberait sur son défaut
    // « fermer », qui laisse croire qu'on perd ce qu'on a saisi.
    expect(countOf(body, decode(en["household.mouth.later"])))
      .toBeGreaterThanOrEqual(1);
    // ET LE FRONTON PORTE BIEN LE MÊME MOT: prouvé sur la SOURCE du wrapper,
    // faute de DOM pour monter le portail. C'est la seule assertion de source
    // du fichier, et elle est bornée à une ligne.
    expect(dialogSource).toContain('closeLabel={t("household.mouth.later")}');
  });

  it("ce qui RETIENT le bouton est écrit, à côté du bouton", () => {
    const body = text(html({}));
    expect(body).toContain(decode(en["household.mouth.block_identity"]));
    expect(body).toContain(decode(en["household.mouth.block_direction"]));
    expect(body).toContain(decode(en["household.mouth.block_body"]));
  });

  it("⚠️ la liste des blocs manquants suit la GRAMMAIRE de la langue", () => {
    // Une première version portait une clé i18n « , » dans les deux packs, et
    // la garde de parité l'a rougie. `Intl.ListFormat` fait mieux: il connaît
    // la conjonction des deux langues, là où un `join(", ")` rend « a, b, c »
    // dans une phrase qui se lit à voix haute.
    expect(text(html({}))).toContain(
      `${decode(en["household.mouth.block_direction"])} and ${
        decode(en["household.mouth.block_body"])
      }`,
    );
    expect(text(html({ locale: "fr" }))).toContain(
      `${decode(fr["household.mouth.block_direction"])} et ${
        decode(fr["household.mouth.block_body"])
      }`,
    );
  });

  it("les trois blocs remplis: plus de phrase, et le bouton est actif", () => {
    const markup = html({ draft: ADULT_COMPLETE });
    const body = text(markup);
    expect(body).not.toContain(decode(en["household.mouth.block_identity"]));
    expect(withoutClasses(markup)).not.toMatch(/\sdisabled(=""|\s|>)/);
  });

  it("un refus du serveur se rend, à côté du geste", () => {
    const body = text(html({ failure: "That is not one of the four answers." }));
    expect(body).toContain("That is not one of the four answers.");
  });

  it("fermée, la FENÊTRE ne rend rien — et elle ne touche pas au portail", () => {
    // Le seul test qui monte `MouthFormDialog` lui-même: `Modal` rend `null`
    // AVANT `createPortal`, donc `open: false` traverse un environnement sans
    // DOM. C'est aussi ce qui prouve que la fenêtre ne monte pas son corps
    // quand elle est fermée.
    expect(
      renderToStaticMarkup(
        createElement(MouthFormDialog, {
          open: false,
          onClose: () => {},
          draft: emptyMouthDraft(),
          onChange: () => {},
          subject: NO_ACCOUNT,
          todayLocalIso: TODAY,
          busy: false,
          failure: null,
          openBlock: null,
          onOpenBlock: () => {},
          onSubmit: () => {},
        }),
      ),
    ).toBe("");
  });
});

// ---------------------------------------------------------------------------
// LES DEUX LANGUES
// ---------------------------------------------------------------------------

describe("les deux langues, sur la valeur", () => {
  it("aucune clé i18n brute ne fuit, dans aucune des deux", () => {
    for (const locale of ["en", "fr"] as const) {
      const markup = html({ draft: ADULT_COMPLETE, locale });
      expect(markup).not.toMatch(/household\.mouth\./);
      expect(markup).not.toMatch(/setup\.people\./);
    }
  });

  it("le français est du français — les six titres, sur la valeur", () => {
    const body = text(html({ locale: "fr" }));
    for (
      const key of [
        "household.mouth.identity",
        "household.mouth.direction",
        "household.mouth.body",
        "household.mouth.habits",
        "household.mouth.tastes",
        "household.mouth.activity",
      ] as const
    ) {
      expect(body).toContain(decode(fr[key]));
      // ET PAS L'ANGLAIS À LA PLACE.
      if (fr[key] !== en[key]) expect(body).not.toContain(decode(en[key]));
    }
  });

  it("le rythme se lit avec la VIRGULE en français", () => {
    const body = text(html({
      draft: {
        ...ADULT_COMPLETE,
        goal: "fat_loss",
        targetWeightKg: "55",
        paceKgPerWeek: "0.45",
      },
      locale: "fr",
    }));
    expect(body).toContain("0,45 kg par semaine");
    expect(body).not.toContain("0.45 kg");
  });
});

// ---------------------------------------------------------------------------
// UN MINEUR PORTE LES SIX BLOCS
// ---------------------------------------------------------------------------

describe("un mineur porte les six blocs, comme les autres", () => {
  const KID: Partial<MouthFormDraft> = {
    firstName: "Kid",
    birthDate: MINOR_BIRTH,
    heightCm: "140",
    weightKg: "35",
    gender: "male",
    activityLevel: "trains_some",
  };

  it("les TROIS directions lui sont proposées", () => {
    const markup = html({ draft: KID });
    expect(countOf(markup, 'name="mouth-goal"')).toBe(3);
    for (const token of GOAL_TOKENS) expect(markup).toContain(`value="${token}"`);
  });

  it("aucun bloc n'est masqué pour lui", () => {
    const body = text(html({ draft: { ...KID, goal: "fat_loss" } }));
    for (
      const key of [
        "household.mouth.identity",
        "household.mouth.direction",
        "household.mouth.body",
        "household.mouth.habits",
        "household.mouth.tastes",
      ] as const
    ) {
      expect(body).toContain(decode(en[key]));
    }
  });

  it("et son curseur est borné sur SON besoin, pas sur celui d'un adulte", () => {
    const kidMarkup = html({ draft: { ...KID, goal: "fat_loss" } });
    const adultMarkup = html({
      draft: { ...KID, birthDate: ADULT_BIRTH, goal: "fat_loss" },
    });
    const kidMax = /id="mouth-pace"[^>]*max="([\d.]+)"/.exec(kidMarkup)?.[1] ??
      /max="([\d.]+)"[^>]*id="mouth-pace"/.exec(kidMarkup)?.[1];
    const adultMax =
      /id="mouth-pace"[^>]*max="([\d.]+)"/.exec(adultMarkup)?.[1] ??
        /max="([\d.]+)"[^>]*id="mouth-pace"/.exec(adultMarkup)?.[1];
    expect(kidMax).toBeDefined();
    expect(adultMax).toBeDefined();
    // Les deux corps sont IDENTIQUES sauf la date de naissance: si les bornes
    // sont les mêmes, c'est que le plafond pédiatrique n'est pas appliqué.
    expect(kidMax).not.toBe(adultMax);
  });
});
