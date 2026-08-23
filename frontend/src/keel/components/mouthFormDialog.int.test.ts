import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import MouthFormDialog, {
  MouthCoreFields,
  MouthPreferencesFields,
  type MouthSubject,
} from "./MouthFormDialog";
import {
  emptyMouthDraft,
  missingRequiredBlocks,
  type MouthFormDraft,
} from "../lib/mouthForm";
import { en } from "../i18n/en";
import { EATING_OCCASIONS, type EatingOccasion } from "../api/mealGeneration";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import { ARRIVAL_HORIZON_COPY } from "../lib/arrivalHorizon";
import {
  PACE_SATURATION_LABELS,
  PACE_WARNING_LABELS,
} from "../../../../supabase/functions/_shared/keel/weight_pace.ts";
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

const NO_ACCOUNT: MouthSubject = { existing: false, hasAccount: false, isSelf: false };
const WITH_ACCOUNT: MouthSubject = { existing: true, hasAccount: true, isSelf: false };

/**
 * ── ⚠️ DEUX SURFACES DEPUIS LE 2026-08-18, ET CE RENDU LES CONCATÈNE ──────
 *
 * Les six blocs ne vivent plus dans une seule fenêtre: les trois premiers sont
 * EN LIGNE (`MouthCoreFields`), les trois derniers derrière le bouton
 * « Renseigner ses préférences alimentaires » (`MouthPreferencesFields`).
 *
 * `html()` rend LES DEUX, bout à bout, et c'est délibéré: tout ce que ce
 * fichier gardait déjà — les libellés, les quatre états du curseur, les quatre
 * crans, le shaker, le régime, la parité des deux langues — porte sur ce que la
 * personne peut voir SUR SA FICHE, et ces faits-là ne doivent pas changer parce
 * qu'on a déplacé une cloison.
 *
 * ⚠️ CE QUI CHANGE, LUI, EST PROUVÉ À PART: `coreHtml` et `prefsHtml` sont
 * rendus SÉPARÉMENT dans la section « la cloison entre les deux surfaces », et
 * c'est la seule chose qui dise QUEL bloc est de QUEL côté. Sans elle, une
 * cloison déplacée à l'envers laisserait ce fichier entièrement vert.
 */
function scene(args: {
  draft?: Partial<MouthFormDraft>;
  subject?: MouthSubject;
  locale?: "en" | "fr";
  busy?: boolean;
  /** Les moments interrogés. Par défaut les six — voir `habitSlotsFor`. */
  slots?: readonly EatingOccasion[];
  onSaveShaker?: ((s: never) => void) | null;
  /**
   * LA FENÊTRE A-T-ELLE UNE LIGNE DE FOYER ? Lu par `prefsHtml` seul — la fiche
   * en ligne (`coreHtml`) ne s'en sert pas. Déclaré ICI plutôt que passé de
   * force: un `as any` au point d'appel désarmait la vérification de TOUS les
   * autres champs de la scène, pas seulement de celui-là.
   */
  memberScoped?: boolean;
}) {
  // `uiLocale()` lit le CHEMIN COURANT — la langue d'une page dépend de la
  // page, pas seulement du visiteur —, donc un rendu sans `location` sort en
  // anglais quoi qu'on ait choisi. Patron de `kitchenEquipmentCard.int.test.ts`.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(args.locale ?? "en");
  return {
    draft: { ...emptyMouthDraft(), ...(args.draft ?? {}) },
    subject: args.subject ?? NO_ACCOUNT,
    slots: args.slots ?? [...EATING_OCCASIONS],
    // `undefined` = pas précisé ⇒ le port existe. `null` = le sujet n'en a
    // pas, et c'est un CAS DE TEST, pas un défaut d'argument.
    onSaveShaker: args.onSaveShaker === undefined
      ? () => {}
      : args.onSaveShaker,
    busy: args.busy ?? false,
  };
}

/** LA FICHE EN LIGNE — blocs 1 à 3, plus le bouton qui ouvre les goûts. */
function coreHtml(args: Parameters<typeof scene>[0]): string {
  const s = scene(args);
  return renderToStaticMarkup(
    createElement(MouthCoreFields, {
      draft: s.draft,
      onChange: () => {},
      subject: s.subject,
      todayLocalIso: TODAY,
      busy: s.busy,
      failure: (args as { failure?: string | null }).failure ?? null,
      onOpenPreferences: () => {},
      onSubmit: () => {},
    }),
  );
}

/** LA FENÊTRE — blocs 4 à 6. */
function prefsHtml(args: Parameters<typeof scene>[0]): string {
  const s = scene(args);
  return renderToStaticMarkup(
    createElement(MouthPreferencesFields, {
      draft: s.draft,
      onChange: () => {},
      subject: s.subject,
      busy: s.busy,
      onClose: () => {},
      slots: s.slots ?? [...EATING_OCCASIONS],
      onSaveShaker: s.onSaveShaker,
      // ⚠️ `true` PARCE QUE C'EST LE CAS NOMINAL DE CETTE FENÊTRE: elle
      // s'ouvre sur `/app/household`, donc il y a un foyer, donc une ligne
      // membre. `false` est l'état d'un compte SOLO, et il a son propre cas
      // juste en dessous — « une garde a besoin d'un cas qui passe ».
      memberScoped: args.memberScoped ?? true,
    }),
  );
}

function html(args: {
  draft?: Partial<MouthFormDraft>;
  subject?: MouthSubject;
  locale?: "en" | "fr";
  open?: boolean;
  failure?: string | null;
  busy?: boolean;
  slots?: readonly EatingOccasion[];
  onSaveShaker?: ((s: never) => void) | null;
}): string {
  return coreHtml(args) + prefsHtml(args);
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

/**
 * LA BALISE OUVRANTE DU BOUTON QUI PORTE CE LIBELLÉ — et rien d'autre.
 *
 * ⚠️ L5-B (2026-08-18). Les deux assertions existantes sur `disabled` portent
 * sur le markup ENTIER (`.toMatch` / `.not.toMatch`), donc elles ne savent dire
 * que « au moins un bouton est retenu » et « aucun ne l'est ». Or la fenêtre a
 * DEUX boutons dont les états sont OPPOSÉS par construction: sur un brouillon
 * vide, celui qui inscrit est retenu ET celui qui sort ne l'est pas. Une
 * assertion globale ne peut pas exprimer ça — mesuré: désactiver la sortie sur
 * `missingRequiredBlocks(draft).length > 0` laissait les 97 tests VERTS.
 */
function buttonTagOf(markup: string, label: string): string {
  const flat = decode(withoutClasses(markup));
  const seen = countOf(flat, label);
  if (seen !== 1) {
    throw new Error(`« ${label} » apparaît ${seen} fois, l'ancre est ambiguë`);
  }
  const at = flat.indexOf(label);
  const start = flat.lastIndexOf("<button", at);
  if (start < 0) throw new Error(`aucun <button> avant « ${label} »`);
  return flat.slice(start, flat.indexOf(">", start) + 1);
}

/** `disabled` en attribut, jamais dans une classe Tailwind. */
const DISABLED = /\sdisabled(=""|\s|>)/;

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

/**
 * LE TEXTE D'UNE CLÉ VOISÉE, `{who}` RÉSOLU — comme l'écran le rend.
 *
 * ⚠️ DEPUIS LE 2026-08-19, une clé de la fiche n'est plus une constante: elle
 * existe en deux voix (« tu » sur ma carte, le PRÉNOM sur celle des autres) et
 * porte un trou `{who}`. Comparer la chaîne BRUTE mesurerait un texte que
 * personne ne voit jamais. Voir `lib/mouthVoice.ts`.
 */
function voicedText(
  cat: typeof en | typeof fr,
  key: keyof typeof en & keyof typeof fr,
): string {
  return cat[key].replace(/\{who\}/g, cat["household.mouth.who_fallback"]);
}

describe("les six blocs se rendent, dans l'ordre de la conception", () => {
  it("les six titres sont à l'écran", () => {
    const body = text(html({}));
    for (
      const label of [
        en["household.mouth.identity"],
        en["household.mouth.direction"],
        en["household.mouth.body"],
        en["household.mouth.habits"].replace(/\{who\}/g, en["household.mouth.who_fallback"]),
        en["setup.mouths.allergies"].replace(/\{who\}/g, en["household.mouth.who_fallback"]),
        en["household.mouth.tastes"].replace(/\{who\}/g, en["household.mouth.who_fallback"]),
      ]
    ) {
      expect(body).toContain(decode(label));
    }
  });

  it("TOUS les champs sont à l'écran — plus rien n'est replié", () => {
    // ── ⛔ LE REPLI EST PARTI LE 2026-08-19 ────────────────────────────────
    // Ce test affirmait l'inverse: « les trois obligatoires sont DÉPLIÉS, les
    // sautables non ». Décision de l'utilisateur — « il faut arrêter avec le
    // dépliable ». Ce que le repli coûtait: une réponse repliée est une
    // réponse INVISIBLE, sur un écran dont le seul travail est de dire ce
    // qu'on sait de quelqu'un.
    const markup = html({});
    expect(markup).toContain('id="mouth-first-name"');
    expect(markup).toContain('id="mouth-birth-date"');
    expect(markup).toContain('id="mouth-height"');
    expect(markup).toContain('id="mouth-weight"');
    expect(markup).toContain('id="mouth-gender"');
    // Et ce qui se cachait derrière un en-tête fermé est là aussi, sans clic.
    expect(markup).toContain('id="mouth-diet"');
    expect(markup).toContain('id="mouth-dislike"');
    expect(markup).toContain('id="mouth-habit-breakfast"');
  });

  it("l'ordre des sections va du plus EXCLUANT au plus informatif", () => {
    // ⚠️ C'EST UNE DÉCISION, PAS UNE MISE EN PAGE, et c'est ce qui remplace le
    // repli: le régime écarte des familles entières d'aliments, donc il passe
    // avant les dégoûts (sinon on note des dégoûts sur ce qu'on ne servira
    // jamais); et « ce qu'elle mange déjà » vient en DERNIER parce que ses
    // lignes dépendent du nombre de repas déclaré au-dessus.
    const markup = html({});
    const at = (needle: string) => markup.indexOf(needle);
    expect(at('id="mouth-diet"')).toBeGreaterThan(-1);
    expect(at('id="mouth-diet"')).toBeLessThan(at('id="mouth-dislike"'));
    expect(at('id="mouth-dislike"'))
      .toBeLessThan(at('id="mouth-habit-breakfast"'));
  });

  it("« ce qu'elle mange déjà » ne pose QUE les moments déclarés", () => {
    // ⛔ LE DÉFAUT SIGNALÉ, CAPTURE À L'APPUI, LE 2026-08-19: « par défaut on a
    // mis les 6 plages et ça n'a pas de sens pour une personne qui indique
    // qu'elle mange que 2 fois par jour ». Un champ laissé vide sur un moment
    // qui n'existe pas se lit comme un oubli, pas comme une réponse.
    const twice = html({ slots: ["lunch", "dinner"] });
    expect(twice).toContain('id="mouth-habit-lunch"');
    expect(twice).toContain('id="mouth-habit-dinner"');
    expect(twice).not.toContain('id="mouth-habit-breakfast"');
    expect(twice).not.toContain('id="mouth-habit-snack_am"');
    expect(twice).not.toContain('id="mouth-habit-before_bed"');
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

  it("⛔ L3 — AUCUNE DATE D'ARRIVÉE NE SE REND, dans aucune langue", () => {
    // ⚠️ CE TEST EST L'ARME DU LOT `L3` (2026-08-22), ET IL LIT LE HTML RENDU.
    // Il remplace `expect(body).toContain("About 12 weeks")`: la même fenêtre,
    // sur le même brouillon, affichait un nombre de semaines EXACT.
    for (const locale of ["en", "fr"] as const) {
      const body = text(html({
        draft: { ...ADULT_COMPLETE, goal: "fat_loss", targetWeightKg: "55" },
        locale,
      }));
      // ① l'ancienne phrase est partie, et son gabarit avec.
      expect(body).not.toContain("About 12 weeks");
      expect(body).not.toContain("Environ 12 semaines");
      // ② et AUCUN nombre de semaines, quel qu'il soit, ne se rend.
      expect(body).not.toMatch(/\d+\s*(weeks?|semaines?)/i);
      // ③ ⛔ MAIS LA SURFACE N'A PAS DISPARU: la phrase de remplacement est
      // là, elle nomme la direction, la raison, et ce qui donnera le rythme.
      expect(body).toContain(
        decode(ARRIVAL_HORIZON_COPY.no_arrival_date[locale]),
      );
    }
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

  // ── ③ · LE CURSEUR SATURE, ET L'ÉCRAN LE DIT ─────────────────────────────
  //
  // Mesuré sur CE corps (110 kg, 185 cm, s'entraîne dur, en prise): son curseur
  // monte jusqu'à 1,0, et à partir de 0,40 l'écart quotidien exécuté ne bouge
  // plus — 415 kcal à 0,40, à 0,50, à 0,75 et à 1,0. Les trois cinquièmes de la
  // course ne changent pas un gramme dans une boîte.
  const SATURATED = "0.75";

  it("⛔ LA PHRASE DE SATURATION N'EST PLUS RENDUE, DANS AUCUNE LANGUE", () => {
    // ── RETIRÉE DE L'ÉCRAN LE 2026-08-19 ──────────────────────────────────
    // « À partir de ce cran, l'assiette ne change plus… » décrivait le
    // comportement interne du plafond à quelqu'un qui pousse un curseur DÉJÀ
    // borné par ce même plafond: le contrôle ne monte pas plus haut, ce qui est
    // l'information — la phrase la répétait en trente mots.
    //
    // ⚠️ CE TEST GARDE LE RETRAIT, il ne le constate pas: `PACE_SATURATION_LABELS`
    // reste dans le module moteur avec ses tests à lui, donc rien n'empêcherait
    // de rebrancher l'affichage sans s'en rendre compte.
    for (const locale of ["en", "fr"] as const) {
      const body = text(html({
        draft: { ...LIFTER, paceKgPerWeek: SATURATED },
        locale,
      }));
      expect(body).not.toContain(
        decode(PACE_SATURATION_LABELS.plate_stops_changing[locale]),
      );
    }
  });

  it("③ une PERTE ne sature pas: la même borne y est lue deux fois", () => {
    const body = text(html({
      draft: { ...LIFTER, goal: "fat_loss", paceKgPerWeek: "0.45" },
    }));
    expect(body).not.toContain(
      decode(PACE_SATURATION_LABELS.plate_stops_changing.en),
    );
  });

  it("③ l'avertissement de PHYSIOLOGIE, lui, reste", () => {
    // ⚠️ LES DEUX N'ONT JAMAIS DIT LA MÊME CHOSE, et c'est pour ça qu'une seule
    // part: « le surplus part surtout en gras » est un fait sur le CORPS, que
    // le curseur ne montre pas. « L'assiette ne change plus » était un fait sur
    // le CONTRÔLE, que le curseur montre déjà en refusant de monter.
    const body = text(html({ draft: { ...LIFTER, paceKgPerWeek: SATURATED } }));
    expect(body).toContain(decode(PACE_WARNING_LABELS.surplus_becomes_fat.en));
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

  it("la FENÊTRE dit qu'il est réclamé — ou qu'il ne l'est pas (D1)", () => {
    // ⚠️ D1 (2026-08-18) — LA DÉCISION EST RENDUE, PAS SEULEMENT APPLIQUÉE.
    // Sans cet attribut, la seule trace de la règle serait la ligne « il
    // manque… », c'est-à-dire une différence qu'on ne voit qu'APRÈS avoir
    // essayé de sortir.
    for (const goal of ["fat_loss", "muscle_gain"] as const) {
      expect(html({ draft: { goal } })).toContain(
        'aria-label="How active they are" aria-required="true"',
      );
    }
    expect(html({ draft: { goal: "maintenance" } })).toContain(
      'aria-label="How active they are" aria-required="false"',
    );
    // La direction non choisie ne réclame rien: son propre bloc retient déjà.
    expect(html({})).toContain(
      'aria-label="How active they are" aria-required="false"',
    );
  });

  it("…et le BOUTON suit la même décision — jamais l'inverse", () => {
    // ⚠️ UN CHAMP DÉCLARÉ FACULTATIF AU-DESSUS D'UN BOUTON QUI RETIENT QUAND
    // MÊME serait un mensonge, pas un assouplissement. Le corps complet SAUF le
    // cran: le bouton part sous `maintenance`, il reste retenu sous `fat_loss`.
    const body = {
      firstName: "Zoe",
      birthDate: ADULT_BIRTH,
      heightCm: "165",
      weightKg: "60",
      gender: "female" as const,
      activityLevel: "" as const,
    };
    const holds = html({ draft: { ...body, goal: "fat_loss" } });
    expect(buttonTagOf(holds, decode(en["household.mouth.add"])))
      .toMatch(DISABLED);
    expect(text(holds)).toContain(decode(en["household.mouth.block_body"]));

    const frees = html({ draft: { ...body, goal: "maintenance" } });
    expect(buttonTagOf(frees, decode(en["household.mouth.add"])))
      .not.toMatch(DISABLED);
    expect(text(frees)).not.toContain(decode(en["household.mouth.block_body"]));
  });
});

// ---------------------------------------------------------------------------
// BLOC 4 — LE SHAKER
// ---------------------------------------------------------------------------

describe("le shaker demande CE QU'IL APPORTE", () => {
  it("⛔ il existe POUR TOUT LE MONDE — compte ou pas", () => {
    // ── RENVERSÉ LE 2026-08-19, APRÈS QUATRE DEMANDES ─────────────────────
    // La règle d'avant était juste tant que `fixed_intakes` ne vivait que dans
    // `student_goals.practical_constraints`, c'est-à-dire sur `user_id`: une
    // bouche sans compte n'avait nulle part où le ranger, et afficher le bloc
    // aurait écrit SON shaker sur la ligne du MAÎTRE.
    //
    // `household_members.fixed_intakes` a fermé ce trou (migration
    // `20260819170000`), le moteur lit les deux stocks
    // (`household_fixed_intakes.ts`), et l'écran a maintenant deux portes.
    //
    // ⚠️ CE QUI DÉCIDE EST LE PORT, PAS LE COMPTE: `onSaveShaker` à `null`
    // retire le bloc — c'est le cas de la fiche d'AJOUT, dont la ligne n'existe
    // pas encore. Le cas est gardé plus bas.
    expect(text(html({ subject: WITH_ACCOUNT })))
      .toContain(decode(en["household.mouth.shaker_add"]));
    expect(text(html({ subject: NO_ACCOUNT })))
      .toContain(decode(en["household.mouth.shaker_add"]));
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
    // ⚠️ LA PHRASE A CHANGÉ DE PLACE LE 2026-08-19. L'avertissement AMBRE
    // (« il faut un nom et les trois nombres… ») a été retiré: il doublait la
    // ligne d'état sous « Enregistrer », qui dit exactement le même fait sans
    // ressembler à un refus. Ce qui doit rester vrai est que l'incomplétude est
    // DITE — pas où elle l'est.
    expect(body).toContain(decode(en["household.mouth.shaker_kept_not_counted"]));
  });
});

// ---------------------------------------------------------------------------
// BLOC 6 — LES GOÛTS VIVENT SUR LA LIGNE MEMBRE
// ---------------------------------------------------------------------------

describe("les goûts et le régime", () => {
  it("le régime est offert À TOUT LE MONDE, compte ou pas", () => {
    // ── ⚠️ RENVERSÉ LE 2026-08-19, ET LE MOTIF D'AVANT ÉTAIT MAL LU ────────
    // Ce test affirmait l'inverse: « le régime n'est offert QU'À une bouche
    // sans compte », parce que `keel_household_set_member_diet` refuse
    // `has_account`. Le refus de CETTE porte-là est réel, et il ne dit rien de
    // l'écran: le régime de quelqu'un qui a un compte EXISTE, il vit
    // simplement dans une autre table (`student_safety_constraints`, via
    // `saveOwnDiet`) — et cet écrivain est branché sur ce même champ de
    // brouillon depuis toujours.
    //
    // Ce que la version d'avant coûtait: le TITULAIRE, seul de la maison, ne
    // voyait nulle part la question qui écarte le plus d'aliments. C'est
    // l'inverse de la règle de cette fenêtre — « sans quoi celui qui tient la
    // maison serait le seul dont on ne sait rien ».
    expect(html({ subject: WITH_ACCOUNT })).toContain('id="mouth-diet"');
    expect(html({ subject: NO_ACCOUNT })).toContain('id="mouth-diet"');
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
    expect(body).toContain(decode(en["household.mouth.tastes_hint"].replace(/\{who\}/g, en["household.mouth.who_fallback"])));
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
    // ⚠️ LA SORTIE A CHANGÉ DE CÔTÉ LE 2026-08-18, PAS DE NATURE. La fiche est
    // EN LIGNE: il n'y a plus de fenêtre à quitter au-dessus des trois blocs
    // obligatoires, donc plus de « plus tard » chez eux — un bouton de sortie
    // sur une carte de page ne mène nulle part. Ce qui reste une FENÊTRE, ce
    // sont les préférences, et c'est là que la conception mord: « un pop-up
    // qu'on ne peut pas fermer fait abandonner l'ajout de la deuxième personne,
    // et le foyer meurt là ».
    const body = text(prefsHtml({}));
    expect(countOf(body, decode(en["household.mouth.preferences_done"])))
      .toBeGreaterThanOrEqual(1);
    // ET LE FRONTON PORTE BIEN SA SORTIE: prouvé sur la SOURCE du wrapper,
    // faute de DOM pour monter le portail. C'est la seule assertion de source
    // du fichier, et elle est bornée à deux lignes.
    //
    // ⛔ C'EST UNE CROIX DEPUIS LE 2026-08-19, plus « plus tard ». Ce libellé
    // rassurait — « la fiche se reprend, tu ne perds rien » — et il n'a plus
    // lieu d'être: la fenêtre ÉCRIT à la fermeture. Il n'y a pas de « plus
    // tard », il y a « c'est enregistré ».
    //
    // ⚠️ ET LE NOM ACCESSIBLE RESTE: une croix sans `aria-label` est un bouton
    // muet pour un lecteur d'écran, ce qui serait un recul, pas un allègement.
    expect(dialogSource).toContain("closeAsIcon");
    expect(dialogSource).toContain('closeLabel={t("common.close")}');
  });

  it("⛔ LA SORTIE N'EST JAMAIS RETENUE, ALORS QUE L'INSCRIPTION L'EST", () => {
    // ⚠️ L5-B (2026-08-18) — LA GARDE QUI MANQUAIT, ET C'EST CELLE DE
    // L'INVARIANT QUE CE LOT NOMME COMME LE PLUS IMPORTANT.
    //
    // Mesuré à l'époque: remplacer `disabled={props.busy}` par
    // `disabled={props.busy || missing.length > 0}` sur le bouton de sortie
    // laissait les 97 tests verts, c'est-à-dire livrait une fenêtre CAPTIVE
    // exactement dans l'état que la conception interdit.
    //
    // ⚠️ LES DEUX BOUTONS NE SONT PLUS DANS LE MÊME COMPOSANT depuis la
    // séparation des surfaces, et c'est justement pour ça qu'ils sont lus sur
    // le MÊME brouillon: c'est l'OPPOSITION de leurs états qui est le fait —
    // celui qui inscrit retient, celui qui ferme jamais.
    expect(missingRequiredBlocks(emptyMouthDraft())).toHaveLength(3);
    expect(buttonTagOf(coreHtml({}), decode(en["household.mouth.add"])))
      .toMatch(DISABLED);
    expect(
      buttonTagOf(prefsHtml({}), decode(en["household.mouth.preferences_done"])),
    ).not.toMatch(DISABLED);
    // ET EN FRANÇAIS: une fenêtre captive dans une seule langue est une fenêtre
    // captive (cicatrice « garde testée dans une seule langue »).
    expect(
      buttonTagOf(coreHtml({ locale: "fr" }), decode(fr["household.mouth.add"])),
    ).toMatch(DISABLED);
    expect(
      buttonTagOf(
        prefsHtml({ locale: "fr" }),
        decode(fr["household.mouth.preferences_done"]),
      ),
    ).not.toMatch(DISABLED);
  });

  it("`busy` retient les DEUX — un enregistrement en vol n'est pas une fenêtre", () => {
    // La seule raison légitime de retenir la sortie: un appel en cours. Sans ce
    // cas qui PASSE, la garde ci-dessus se lirait comme « la sortie n'est jamais
    // désactivée », et quelqu'un la « réparerait » en retirant `props.busy`.
    expect(
      buttonTagOf(
        prefsHtml({ busy: true }),
        decode(en["household.mouth.preferences_done"]),
      ),
    ).toMatch(DISABLED);
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
    // ⚠️ L'ORDRE DES DEUX DERNIERS A CHANGÉ LE 2026-08-18 — `body` avant
    // `direction`, comme à l'écran. La phrase nomme les manques dans l'ordre où
    // ils sont posés: l'inverse enverrait chercher le premier au mauvais
    // endroit, et c'est exactement le défaut qui a coûté le curseur muet.
    expect(text(html({}))).toContain(
      `${decode(en["household.mouth.block_body"])} and ${
        decode(en["household.mouth.block_direction"])
      }`,
    );
    expect(text(html({ locale: "fr" }))).toContain(
      `${decode(fr["household.mouth.block_body"])} et ${
        decode(fr["household.mouth.block_direction"])
      }`,
    );
  });

  it("les trois blocs remplis: plus de phrase, et le bouton est actif", () => {
    const markup = html({ draft: ADULT_COMPLETE });
    const body = text(markup);
    expect(body).not.toContain(decode(en["household.mouth.block_identity"]));
    // ⚠️ L'ASSERTION PORTE SUR LA FICHE, PAS SUR TOUT LE MARKUP, ET C'EST UNE
    // CORRECTION DU 2026-08-19. Elle balayait la page entière à la recherche
    // d'un `disabled` — ce qui ne marchait QUE parce que les sections de
    // préférences étaient repliées. Dépliées (le repli est parti), le bouton
    // « Ajouter » du champ de dégoût est légitimement désactivé tant qu'aucun
    // aliment n'est tapé, et ce test rougissait sur un contrôle sain.
    // On coupe donc au niveau de `MouthCoreFields`, qui est ce dont il parle.
    const core = withoutClasses(markup).split("None of this is required")[0];
    expect(core).not.toMatch(/\sdisabled(=""|\s|>)/);
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
          slots: [...EATING_OCCASIONS],
          onSaveShaker: () => {},
          memberScoped: true,
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
      expect(body).toContain(decode(voicedText(fr, key)));
      // ET PAS L'ANGLAIS À LA PLACE.
      if (fr[key] !== en[key]) {
        expect(body).not.toContain(decode(voicedText(en, key)));
      }
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
        // ⛔ `habits` ET `tastes` NE SONT PLUS DANS CETTE LISTE: ce cas rend la
        // FICHE EN LIGNE (blocs 1-3), et les deux vivent dans la FENÊTRE
        // (`prefsHtml`), où le cas d'à côté les mesure déjà. Ils y étaient par
        // héritage de l'époque où le rendu était d'un seul tenant.
      ] as const
    ) {
      expect(body).toContain(decode(voicedText(en, key)));
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

// ===========================================================================
// D6 (2026-08-18) — LA CLOISON ENTRE LES DEUX SURFACES
//
// C'est la SEULE section qui rende les deux composants séparément, et c'est
// elle qui porte la décision:
//
//   « Le poids visé et le rythme d'évolution, il faut pas que ce soit dans la
//     pop-up […]. Et le reste (allergies, etc.) dans une pop-up accessible
//     depuis "Renseigner ses préférences alimentaires". »
//
// ⚠️ CHAQUE FAIT EST DIT DEUX FOIS, EN PRÉSENCE ET EN ABSENCE. Un bloc rendu
// des DEUX côtés satisferait n'importe quelle assertion de présence, et
// livrerait deux formulaires qui écrivent la même colonne — la cicatrice que la
// fiche du maître a déjà payée.
// ===========================================================================

describe("la cloison entre les deux surfaces", () => {
  const TITLES = {
    identity: "household.mouth.identity",
    direction: "household.mouth.direction",
    body: "household.mouth.body",
    habits: "household.mouth.habits",
    allergies: "setup.mouths.allergies",
    tastes: "household.mouth.tastes",
  } as const;

  it("la fiche en ligne porte les trois blocs qui structurent, et rien d'autre", () => {
    const body = text(coreHtml({}));
    for (const key of [TITLES.identity, TITLES.direction, TITLES.body]) {
      expect(body, `${key} a quitté la fiche`).toContain(decode(en[key]));
    }
    for (const key of [TITLES.habits, TITLES.allergies, TITLES.tastes]) {
      expect(body, `${key} est remonté dans la fiche`).not.toContain(
        decode(en[key]),
      );
    }
  });

  it("la fenêtre porte les trois blocs qui affinent, et rien d'autre", () => {
    const body = text(prefsHtml({}));
    for (const key of [TITLES.habits, TITLES.allergies, TITLES.tastes]) {
      expect(body, `${key} a quitté la fenêtre`).toContain(
        decode(voicedText(en, key)),
      );
    }
    for (const key of [TITLES.identity, TITLES.direction, TITLES.body]) {
      expect(body, `${key} est redescendu dans la fenêtre`).not.toContain(
        decode(en[key]),
      );
    }
  });

  /**
   * LES DEUX CHAMPS QUE LA DÉCISION NOMME, ET LE CAS OÙ ILS EXISTENT.
   *
   * ⚠️ SANS LE CORPS ET LA DIRECTION, LE CURSEUR N'EST PAS RENDU DU TOUT
   * (`folded`, puis `needs_body`): une assertion d'absence côté fenêtre serait
   * alors verte sur un écran où PERSONNE ne le voit. Le brouillon porte donc un
   * corps complet et une direction qui bouge — l'état où le curseur EXISTE.
   */
  it("le poids visé et le curseur de rythme sont EN LIGNE, jamais dans la fenêtre", () => {
    const draft = {
      goal: "fat_loss" as const,
      birthDate: ADULT_BIRTH,
      heightCm: "178",
      weightKg: "85",
      gender: "male" as const,
      targetWeightKg: "78",
    };
    const core = coreHtml({ draft });
    const prefs = prefsHtml({ draft });
    expect(core, "le poids visé a quitté la fiche").toContain(
      'id="mouth-target-weight"',
    );
    expect(core, "le curseur de rythme a quitté la fiche").toContain(
      'id="mouth-pace"',
    );
    expect(prefs, "le poids visé est passé dans la fenêtre").not.toContain(
      'id="mouth-target-weight"',
    );
    expect(prefs, "le curseur est passé dans la fenêtre").not.toContain(
      'id="mouth-pace"',
    );
  });

  it("le bouton qui ouvre la fenêtre est sur la fiche, dans les deux langues", () => {
    expect(text(coreHtml({}))).toContain(
      decode(en["household.mouth.preferences_open"].replace(/\{who\}/g, en["household.mouth.who_fallback"])),
    );
    expect(text(coreHtml({ locale: "fr" }))).toContain(
      decode(fr["household.mouth.preferences_open"].replace(/\{who\}/g, fr["household.mouth.who_fallback"])),
    );
  });

  /**
   * CE QUI A ÉTÉ RENSEIGNÉ DERRIÈRE LE BOUTON EST DIT SOUS LE BOUTON.
   *
   * ⚠️ LE CAS VIDE EST LA MOITIÉ DE LA GARDE. Sans lui, un récapitulatif qui
   * dirait toujours la même phrase — ou qui ne dirait jamais rien — passerait:
   * ce qui est prouvé est que l'écran DISTINGUE « rien répondu » de « répondu ».
   */
  it("le récapitulatif distingue « rien renseigné » de ce qui l'a été", () => {
    expect(text(coreHtml({}))).toContain(
      decode(en["household.mouth.preferences_empty"]),
    );
    const filled = text(
      coreHtml({ draft: { allergies: ["milk"], dislikes: ["mushrooms"] } }),
    );
    expect(filled).not.toContain(
      decode(en["household.mouth.preferences_empty"]),
    );
    expect(filled).toContain(decode(en["household.mouth.block_allergies"]));
    expect(filled).toContain(decode(en["household.mouth.block_tastes"]));
    // ET PAS CELUI QU'ON N'A PAS TOUCHÉ: un récapitulatif qui nomme tout ne
    // récapitule rien.
    expect(filled).not.toContain(decode(en["household.mouth.block_habits"]));
  });

  /**
   * « AUCUNE ALLERGIE » EST UNE RÉPONSE, et le récapitulatif la compte comme
   * telle. Sinon quelqu'un qui a répondu « rien » lit qu'il n'a rien répondu,
   * rouvre, et recoche — c'est exactement ce que `allergiesNone` existe pour
   * éviter en base.
   */
  it("« rien à déclarer » compte comme renseigné", () => {
    const body = text(coreHtml({ draft: { allergiesNone: true } }));
    expect(body).not.toContain(decode(en["household.mouth.preferences_empty"]));
    expect(body).toContain(decode(en["household.mouth.block_allergies"]));
  });
});

// ===========================================================================
// D6 (2026-08-18) — LE CORPS AVANT LA DIRECTION, ET LE SILENCE QUI EN VENAIT
//
// Mesuré au navigateur: la fiche du maître s'ouvre avec un corps VIDE. On
// clique « perdre », le poids visé s'ouvre, et à la place du curseur il y a une
// phrase qui renvoie vers un bloc situé PLUS BAS. Rapporté par l'utilisateur
// comme « je ne vois ni le poids visé ni le rythme ».
//
// Ce n'est PAS l'état « pas de marge » (celui-là est prouvé plus haut, sur un
// corps de 25 kg, et il rend sa propre phrase). C'est un défaut d'ORDRE.
// ===========================================================================

describe("le corps est demandé AVANT le rythme qu'il borne", () => {
  it("à l'écran, le bloc du corps précède celui de la direction", () => {
    const body = text(coreHtml({}));
    const atBody = body.indexOf(decode(en["household.mouth.body"]));
    const atDirection = body.indexOf(decode(en["household.mouth.direction"]));
    expect(atBody, "le bloc du corps n'est plus rendu").toBeGreaterThan(-1);
    expect(atDirection, "le bloc de la direction n'est plus rendu")
      .toBeGreaterThan(-1);
    expect(atBody, "la direction est repassée devant le corps")
      .toBeLessThan(atDirection);
  });

  it("et les champs suivent: taille avant poids visé, taille avant curseur", () => {
    const markup = coreHtml({
      draft: {
        goal: "fat_loss",
        birthDate: ADULT_BIRTH,
        heightCm: "178",
        weightKg: "85",
        gender: "male",
      },
    });
    const atHeight = markup.indexOf('id="mouth-height"');
    const atTarget = markup.indexOf('id="mouth-target-weight"');
    const atPace = markup.indexOf('id="mouth-pace"');
    expect(atPace, "le curseur n'est pas rendu sur ce corps").toBeGreaterThan(-1);
    expect(atHeight).toBeLessThan(atTarget);
    expect(atHeight).toBeLessThan(atPace);
  });

  /**
   * ⚠️ LE CAS QUI PASSE, ET IL EST OBLIGATOIRE. Rien n'empêche quelqu'un de
   * sauter le bloc du corps: `needs_body` reste donc le seul écran juste, et
   * il ne doit pas devenir un dépliage VIDE — un contrôle muet se lit comme
   * une fonctionnalité absente, et c'est précisément le défaut d'origine.
   */
  it("sauter le corps laisse une PHRASE, jamais un blanc", () => {
    const markup = coreHtml({
      draft: { goal: "fat_loss", birthDate: ADULT_BIRTH },
    });
    expect(markup).not.toContain('id="mouth-pace"');
    expect(text(markup)).toContain(
      decode(en["household.mouth.pace_needs_body"]),
    );
    // ET LE POIDS VISÉ, LUI, EST BIEN LÀ: il ne dépend pas du corps, et
    // l'utilisateur a rapporté ne pas le voir alors qu'il s'affichait.
    expect(markup).toContain('id="mouth-target-weight"');
  });

  /**
   * LA PHRASE NE RENVOIE PLUS VERS LE BAS. Elle disait « ci-dessous » quand le
   * bloc du corps était sous elle; il est au-dessus depuis ce lot, et une
   * consigne qui pointe dans la mauvaise direction est pire qu'aucune.
   */
  it("et elle ne renvoie plus vers un bloc situé plus bas", () => {
    expect(decode(en["household.mouth.pace_needs_body"]).toLowerCase())
      .not.toContain("below");
    expect(decode(fr["household.mouth.pace_needs_body"]).toLowerCase())
      .not.toContain("ci-dessous");
  });
});

// ===========================================================================
// D7 (2026-08-18) — `memberScoped`: CE QUE LA FENÊTRE A LE DROIT DE MONTRER
//
// Trois des six blocs sont clés sur un `member_id` — les habitudes
// (`household_member_habits`), les dégoûts (`household_food_restrictions`) et
// le régime (`keel_household_set_member_diet`). Un compte SOLO n'a pas de
// foyer, donc pas de ligne membre: les lui montrer serait trois contrôles qui
// échouent à tous les coups, « pire qu'un contrôle absent, parce qu'il
// promet ».
//
// ⚠️ CE CAS EST LE « CAS QUI PASSE » DE LA GARDE. Sans lui, `memberScoped`
// serait un paramètre que tout le monde met à `true` et que rien ne mesure.
// ===========================================================================
describe("un écran sans ligne de foyer ne montre que ce qu'il sait écrire", () => {
  it("les habitudes par moment disparaissent, le shaker reste", () => {
    const body = text(
      prefsHtml({
        subject: WITH_ACCOUNT,
        memberScoped: false,
      }),
    );
    // `fixed_intakes` est clé sur `user_id`: le shaker part sans foyer.
    expect(body).toContain(decode(en["household.mouth.shaker_add"]));
    // ⚠️ LA CLÉ GÉNÉRIQUE A DISPARU LE 2026-08-19: il y a maintenant UN exemple
    // par moment (le même partout mettait « un café et deux tartines » sous
    // DÎNER). On vérifie donc qu'AUCUN des six n'est là — un seul suffirait à
    // prouver que la section s'est rendue quand même.
    for (const slot of EATING_OCCASIONS) {
      expect(body).not.toContain(
        decode(en[`household.mouth.habit_placeholder_${slot}` as const]),
      );
    }
  });

  it("le bloc des goûts et du régime disparaît en entier", () => {
    const body = text(
      prefsHtml({
        memberScoped: false,
      }),
    );
    expect(body).not.toContain(decode(en["household.mouth.tastes"].replace(/\{who\}/g, en["household.mouth.who_fallback"])));
  });

  /** ET LES ALLERGIES RESTENT — `student_safety_constraints` est sur `user_id`. */
  it("les allergies, elles, restent: elles n'ont pas besoin d'un foyer", () => {
    const body = text(
      prefsHtml({
        memberScoped: false,
      }),
    );
    expect(body).toContain(decode(en["setup.mouths.allergies"].replace(/\{who\}/g, en["household.mouth.who_fallback"])));
  });
});

// ---------------------------------------------------------------------------
// « COMBIEN DE FOIS ELLE MANGE » A CHANGÉ D'ÉCRAN (2026-08-19)
//
// La question vivait à l'étape 3 — deux écrans APRÈS « ce qu'elle mange déjà »,
// qu'elle dimensionne. On demandait donc six repas à quelqu'un sans lui avoir
// demandé combien il en fait. Elle est maintenant la section juste au-dessus,
// et son effet est immédiat: décocher un moment retire sa ligne DANS LE MÊME
// GESTE, sans aller-retour en base.
// ---------------------------------------------------------------------------

describe("les moments se cochent dans la fiche, et ils commandent la suite", () => {
  it("la section est là, au-dessus de « ce qu'elle mange déjà »", () => {
    const markup = html({});
    expect(markup).toContain('id="mouth-rhythm-breakfast"');
    expect(markup.indexOf('id="mouth-rhythm-breakfast"'))
      .toBeLessThan(markup.indexOf('id="mouth-habit-breakfast"'));
  });

  it("⛔ le brouillon GAGNE sur la cascade lue", () => {
    // Sans cette priorité, cocher une case n'aurait aucun effet visible avant
    // un aller-retour en base — « un geste qui ne fait rien est indiscernable
    // d'un geste qui a marché ».
    const markup = html({
      slots: [...EATING_OCCASIONS],
      draft: { rhythm: [{ slot: "dinner", size: null }] },
    });
    expect(markup).toContain('id="mouth-habit-dinner"');
    expect(markup).not.toContain('id="mouth-habit-breakfast"');
  });

  it("rien coché = « comme la maison », et l'écran le DIT", () => {
    // ⛔ PAS « elle ne mange jamais ». C'est le repli documenté de la ligne
    // membre, et la base refuse de toute façon un tableau vide
    // (`empty_rhythm`). Sans la phrase, une rangée décochée se lit comme un
    // oubli.
    const markup = html({ draft: { rhythm: null } });
    expect(markup).toContain(en["household.mouth.rhythm_house"].replace(/\{who\}/g, en["household.mouth.who_fallback"]));
    // Et les lignes d'habitudes retombent sur la cascade lue, pas sur zéro.
    expect(markup).toContain('id="mouth-habit-breakfast"');
  });
});

// ---------------------------------------------------------------------------
// L'APPORT CHIFFRÉ — UN OBJET LISIBLE, PAS UNE SUITE DE CASES
//
// « La partie ajouter un shaker, on ne comprend pas […] refais la partie UI
// parce qu'on comprend vraiment pas » (2026-08-19). Quatre causes distinctes,
// quatre assertions.
// ---------------------------------------------------------------------------

const SHAKER_DRAFT = {
  label: "mon shaker",
  servingGrams: "30",
  proteinGPerServing: "24",
  energyKcalPerServing: "120",
  slot: "",
};

describe("l'apport chiffré se lit", () => {
  it("replié: il porte un NOM, pas juste un bouton", () => {
    const markup = html({ subject: WITH_ACCOUNT });
    expect(markup).toContain(en["household.mouth.shaker_title"]);
    expect(markup).toContain(en["household.mouth.shaker_add"]);
  });

  it("⛔ déplié: CHAQUE nombre porte son étiquette VISIBLE", () => {
    // C'est le défaut le plus coûteux des quatre: le `placeholder` disparaît à
    // la première frappe, donc trois cases de chiffres sans étiquette
    // deviennent illisibles — et une protéine saisie dans la case des calories
    // est une donnée FAUSSE, pas seulement une gêne.
    const markup = html({ subject: WITH_ACCOUNT, draft: { shaker: SHAKER_DRAFT } });
    for (const id of ["grams", "protein", "kcal"]) {
      expect(markup).toContain(`for="mouth-shaker-${id}"`);
    }
  });

  it("complet: le récapitulatif REJOUE les trois nombres avec leur unité", () => {
    // La seconde moitié des étiquettes: trois champs remplis ne montrent pas
    // une inversion, une phrase si.
    const markup = html({ subject: WITH_ACCOUNT, draft: { shaker: SHAKER_DRAFT } });
    const summary = en["household.mouth.shaker_summary"]
      .replace("{grams}", "30")
      .replace("{protein}", "24")
      .replace("{kcal}", "120");
    expect(markup).toContain(summary);
  });

  it("incomplet: l'avertissement, et PAS le récapitulatif", () => {
    const markup = html({
      subject: WITH_ACCOUNT,
      draft: { shaker: { ...SHAKER_DRAFT, proteinGPerServing: "" } },
    });
    expect(markup).toContain(en["household.mouth.shaker_kept_not_counted"]);
    expect(markup).not.toContain("30 g ·");
  });

  it("il porte SON bouton d'enregistrement, et son retrait", () => {
    // ⚠️ RENVERSÉ LE 2026-08-19. Ce bloc n'avait pas de bouton — la fenêtre
    // édite le brouillon de la fiche, et un second écrivain sur les mêmes
    // colonnes est une plaie connue. L'utilisateur l'a refusé deux fois, et il
    // a raison sur le fond: ce bloc est un OBJET qu'on ajoute et qu'on retire,
    // pas un champ de la personne.
    const markup = html({ subject: WITH_ACCOUNT, draft: { shaker: SHAKER_DRAFT } });
    expect(markup).toContain(en["household.mouth.shaker_save"]);
    expect(markup).toContain(en["household.mouth.shaker_remove"]);
  });

  it("complet: il DIT qu'il est compté", () => {
    const markup = html({ subject: WITH_ACCOUNT, draft: { shaker: SHAKER_DRAFT } });
    expect(markup).toContain(en["household.mouth.shaker_counted"]);
  });

  it("⛔ une seule mesure: enregistrable, MAIS pas compté — et il le dit", () => {
    // C'est le point qui empêche « Enregistrer » de mentir. Le moteur est
    // tout-ou-rien sur les trois nombres (`parseFixedIntakes` jette une
    // déclaration incomplète), donc un shaker à une mesure part en base et
    // n'est PAS compté. Le bouton reste actif — c'est la règle demandée — et
    // la phrase dit l'état réel.
    const markup = html({
      subject: WITH_ACCOUNT,
      draft: {
        shaker: { ...SHAKER_DRAFT, proteinGPerServing: "", energyKcalPerServing: "" },
      },
    });
    expect(markup).toContain(en["household.mouth.shaker_kept_not_counted"]);
    expect(markup).not.toContain(en["household.mouth.shaker_counted"]);
  });

  it("aucune mesure: le bouton est désactivé, et il dit ce qu'il attend", () => {
    const markup = html({
      subject: WITH_ACCOUNT,
      draft: {
        shaker: {
          ...SHAKER_DRAFT,
          servingGrams: "",
          proteinGPerServing: "",
          energyKcalPerServing: "",
        },
      },
    });
    expect(markup).toContain(en["household.mouth.shaker_needs_one"]);
  });

  it("sans port d'écriture, le bloc ne se rend pas du tout", () => {
    // `fixed_intakes` est clé sur `user_id`. Un bouton qui écrirait « son »
    // shaker le poserait sur la ligne du MAÎTRE: on retire le bloc plutôt que
    // de rendre un contrôle qui échoue à tous les coups.
    const markup = html({
      subject: WITH_ACCOUNT,
      draft: { shaker: SHAKER_DRAFT },
      onSaveShaker: null,
    });
    // ⚠️ ON VISE UN `id` DU BLOC, PAS LE MOT « Save »: le libellé du bouton
    // d'enregistrement de la FICHE est le même mot, et l'assertion serait
    // verte pour la mauvaise raison.
    expect(markup).not.toContain('id="mouth-shaker-label"');
  });
});

// ---------------------------------------------------------------------------
// « CE QU'ELLE MANGE DÉJÀ » SUIT LES MOMENTS DÉCLARÉS, SANS CONTRÔLE EN PLUS
//
// ── ⛔ CE QU'ON A ESSAYÉ, ET POURQUOI ON L'A RETIRÉ ────────────────────────
// Un bouton « Voir les N autres moments » a vécu quelques heures le 2026-08-19.
// Il existait pour qu'une ligne ne disparaisse pas en silence quand on décoche
// un moment. Retiré le jour même, à la demande — et l'argument était juste:
//
//   · il n'apparaissait QUE sur une bouche au rythme déclaré, jamais sur la
//     carte du maître (rien de déclaré ⇒ rien de caché). Deux fiches identiques
//     cessaient de se ressembler, sans raison lisible;
//   · et ce qu'il rouvrait sont des moments dont la personne vient de dire
//     qu'ils n'existent pas.
//
// Ce qui change les lignes est la liste de cases juste au-dessus, et elle est
// à trois centimètres.
// ---------------------------------------------------------------------------

describe("les lignes suivent les moments déclarés", () => {
  it("deux moments déclarés: deux lignes, et AUCUN contrôle en plus", () => {
    const markup = html({
      draft: { rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }] },
    });
    expect(markup).toContain('id="mouth-habit-lunch"');
    expect(markup).toContain('id="mouth-habit-dinner"');
    expect(markup).not.toContain('id="mouth-habit-breakfast"');
    // ⛔ LE CONTRÔLE NE DOIT PAS REVENIR: c'est lui qui faisait diverger la
    // fiche d'une bouche et celle du maître.
    expect(markup).not.toMatch(/other moments|autres moments/);
  });

  it("rien de déclaré: les six, comme sur la carte du maître", () => {
    const markup = html({ slots: [...EATING_OCCASIONS], draft: { rhythm: null } });
    for (const slot of EATING_OCCASIONS) {
      expect(markup).toContain(`id="mouth-habit-${slot}"`);
    }
    expect(markup).not.toMatch(/other moments|autres moments/);
  });
});
