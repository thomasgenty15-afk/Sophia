import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import MouthFormDialog, {
  MouthCoreFields,
  MouthPreferencesFields,
  type MouthSubject,
  type ShakerPort,
} from "./MouthFormDialog";
import {
  emptyMouthDraft,
  missingRequiredBlocks,
  type MouthFormDraft,
  paceControlFor,
} from "../lib/mouthForm";
import { en } from "../i18n/en";
import { EATING_OCCASIONS, type EatingOccasion } from "../api/mealGeneration";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import {
  arrivalHorizonCopy,
} from "../lib/arrivalHorizon";
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
  /**
   * OÙ VA LE SHAKER DE CE SUJET — `undefined` = le cas nominal, il y a une
   * ligne et un bouton (`now`).
   *
   * ⟳ C'ÉTAIT `onSaveShaker?: fn | null` (2026-09-01). `null` y confondait
   * « pas de stock » et « pas de bouton ICI », et le bloc entier disparaissait
   * dans les deux cas — donc le shaker d'une personne AJOUTÉE était
   * incollectable. Voir `ShakerPort`.
   */
  shakerPort?: ShakerPort;
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
    // `undefined` = pas précisé ⇒ il y a une ligne et un bouton. Les deux
    // autres crans sont des CAS DE TEST, pas des défauts d'argument.
    shakerPort: args.shakerPort ?? { kind: "now", save: () => {} },
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
      shakerPort: s.shakerPort,
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
  shakerPort?: ShakerPort;
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
        // ⟳ 2026-09-01 — `habits` a fusionné avec `rhythm` sous `eating`. Les
        // deux clés survivent (`/app/household` et les tests les lisent
        // encore), mais ce n'est plus `habits` qui TITRE une section de cette
        // fiche: c'est « quand elle mange, et quoi ».
        en["household.mouth.eating"].replace(/\{who\}/g, en["household.mouth.who_fallback"]),
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
    // ⟳ 2026-09-01 — LE CHAMP D'HABITUDE A QUITTÉ CETTE LISTE, sur demande
    // explicite, après que l'écran a été vu: sur un compte neuf (`rhythm:
    // null`), CINQ champs vides et ouverts s'empilaient sous cinq cases
    // décochées.
    //
    // ⛔ ET CE N'EST PAS UN RETOUR AU DÉPLIABLE QUE CE TEST GARDE. Le repli du
    // 2026-08-19 cachait des RÉPONSES derrière un en-tête fermé. Ici une case
    // décochée veut dire « elle ne mange pas à ce moment »: il n'y a pas de
    // réponse cachée, il n'y a pas de question. C'est la même règle que le
    // contrôle « voir les N autres moments », retiré le même jour.
    //
    // La case, elle, reste TOUJOURS visible — c'est elle, l'entrée.
    expect(markup).toContain('id="mouth-rhythm-breakfast"');
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
    // ⚠️ ANCRÉ SUR LA CASE, PAS SUR LE CHAMP: depuis que le champ s'ouvre avec
    // sa case, il n'existe pas sur un brouillon qui n'a rien coché — et ce
    // test-ci parle d'ORDRE, pas de dépliant.
    expect(at('id="mouth-dislike"'))
      .toBeLessThan(at('id="mouth-rhythm-breakfast"'));

    // ⟳ 2026-09-01 — L'APPÉTIT ET L'ASSIETTE SONT PASSÉS SOUS LES DÉGOÛTS.
    //
    // ⛔ ET C'EST L'INVERSE D'UNE DEMANDE DU 2026-08-20, qui les voulait juste
    // sous le régime. Sans cette assertion, rien ne tiendrait la nouvelle
    // place: le premier lecteur du commentaire d'alors les remonterait, de
    // bonne foi, en citant une consigne périmée.
    //
    // La règle du test, elle, n'a pas bougé — elle est mieux servie. Le régime,
    // les allergies et les dégoûts ÉCARTENT des aliments; l'appétit et
    // l'assiette n'écartent rien, ils PRÉCISENT. Ils étaient les deux seuls
    // blocs informatifs coincés entre des blocs excluants.
    expect(at('name="mouth-appetite"')).toBeGreaterThan(-1);
    expect(at('id="mouth-dislike"'))
      .toBeLessThan(at('name="mouth-appetite"'));
    // …et ils restent AVANT les moments: la place refusée le 2026-08-20 était
    // « sous les habitudes par moment », et ce n'est pas celle-ci.
    expect(at('name="mouth-appetite"'))
      .toBeLessThan(at('id="mouth-rhythm-breakfast"'));
  });

  it("« ce qu'elle mange déjà » ne pose QUE les moments déclarés", () => {
    // ⛔ LE DÉFAUT SIGNALÉ, CAPTURE À L'APPUI, LE 2026-08-19: « par défaut on a
    // mis les 6 plages et ça n'a pas de sens pour une personne qui indique
    // qu'elle mange que 2 fois par jour ». Un champ laissé vide sur un moment
    // qui n'existe pas se lit comme un oubli, pas comme une réponse.
    // ⟳ 2026-09-01 — LE DÉCOR PASSE DE `slots` À `rhythm`. Le défaut signalé
    // reste le même mot pour mot (« un champ laissé vide sur un moment qui
    // n'existe pas se lit comme un oubli »); ce qui a changé est CE QUI
    // DÉCLARE un moment: la case cochée, et plus la cascade lue.
    const twice = html({
      draft: {
        rhythm: [
          { slot: "lunch", size: null },
          { slot: "dinner", size: null },
        ],
      },
    });
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

  it("⛔ ET IL N'EXPLIQUE PLUS SON PROPRE PLAFOND, dans aucune langue", () => {
    // Retiré le 2026-09-01, à la demande. `household.mouth.pace_hint` disait
    // « le maximum de ce curseur est réglé sur ton corps — c'est le rythme le
    // plus rapide que le plan sait vraiment cuisiner. »
    //
    // ⚠️ LES DEUX CLÉS SONT PARTIES DES CATALOGUES, donc la phrase est écrite
    // EN DUR ici: c'est la seule forme d'assertion qui survit à leur
    // suppression, et c'est déjà celle du test `L3` au-dessus (« About 12
    // weeks »). Un test qui lirait `en[...]` ne compilerait plus — et un test
    // qui ne compile plus se supprime au lieu de se relire.
    for (const locale of ["en", "fr"] as const) {
      const body = text(html({
        draft: { ...ADULT_COMPLETE, goal: "fat_loss", targetWeightKg: "55" },
        locale,
      }));
      expect(body).not.toMatch(/top of this slider|maximum de ce curseur/i);
      // ⚠️ ET LA GARDE A BESOIN D'UN CAS QUI PASSE: le curseur, lui, est bien
      // rendu sur ce même brouillon — sinon ce test resterait vert sur une
      // fenêtre entièrement vide.
      expect(html({
        draft: { ...ADULT_COMPLETE, goal: "fat_loss", targetWeightKg: "55" },
        locale,
      })).toContain('id="mouth-pace"');
    }
  });

  it("⛔ L3′ — LE NOMBRE DE SEMAINES SE REND, AVEC SA RÉSERVE", () => {
    // ⚠️ CE TEST EST L'ARME DU LOT, ET IL A CHANGÉ DE CAMP DEUX FOIS. Il a
    // exigé `toContain("About 12 weeks")`, puis son contraire strict
    // (`not.toMatch(/\d+\s*(weeks?|semaines?)/i)`, lot `L3` du 2026-08-22),
    // et depuis le 2026-09-01, à la demande, le nombre est de retour.
    //
    // ⛔ CE QU'IL GARDE MAINTENANT N'EST PAS « le chiffre est là »: c'est
    // « le chiffre n'est JAMAIS là tout seul ». La mesure qui l'avait fait
    // retirer (erreur d'estimation ±580 kcal/j > déficit visé 500 kcal/j,
    // donc une borne haute à l'infini) n'a pas été infirmée — c'est la
    // réserve à l'écran qui la porte.
    for (const locale of ["en", "fr"] as const) {
      const body = text(html({
        draft: { ...ADULT_COMPLETE, goal: "fat_loss", targetWeightKg: "55" },
        locale,
      }));
      // ① le nombre — 60 kg → 55 kg à 0,45 kg/semaine, arrondi au supérieur.
      expect(body).toMatch(/12\s*(weeks|semaines)/);
      // ② ⛔ ET SA RÉSERVE, DANS LA MÊME FENÊTRE. C'est l'assertion qui
      // compte: sans elle, ce test redeviendrait celui d'avant le lot `L3`.
      expect(body).toContain(decode(
        arrivalHorizonCopy({ kind: "weeks_at_this_pace", weeks: 12 }, locale),
      ));
      // ⚠️ ET LES MOTS DE LA RÉSERVE EN DUR, PAS SEULEMENT PAR LE CATALOGUE.
      // L'assertion du dessus se paramètre par la chaîne qu'elle vérifie:
      // vider la réserve du gabarit la laisserait VERTE (cicatrice
      // `test-parameterized-by-its-own-constant`). Ces deux-là mordent.
      expect(body).toContain(
        locale === "fr" ? "pas une date" : "not a date",
      );
      expect(body).toContain(
        locale === "fr" ? "la balance" : "the scale",
      );
      // ③ ⛔ ET AUCUNE FOURCHETTE: la borne haute des semaines est l'infini,
      // donc « 12 à 24 » serait une seconde promesse, fausse comme l'autre.
      expect(body).not.toMatch(/\d+\s*(à|to)\s*\d+\s*(weeks|semaines)/i);
      // ④ ⛔ ET PLUS DE `hint` SOUS « POIDS VISÉ »: il disait « pas le moment
      // où il sera atteint » / « not when it will be reached », ce qui
      // contredit le paragraphe rendu quinze lignes plus bas.
      expect(body).not.toMatch(
        /pas le moment où il sera atteint|not when it will be reached/i,
      );
      // ⑤ ⛔ NI SON ANCÊTRE, QUI SURPROMETTAIT: « il donne une date d'arrivée ».
      expect(body).not.toMatch(
        /donne une date d'arrivée|gives a date to arrive on/i,
      );
    }
  });

  it("⛔ L3′ — SANS CURSEUR, AUCUNE DURÉE NE SE REND", () => {
    // ⚠️ LA GARDE A BESOIN DES DEUX CÔTÉS. Sans ce cas, l'assertion du dessus
    // resterait vraie sur un écran qui affiche une durée À TOUT LE MONDE, y
    // compris à un corps dont on ne connaît pas le plafond — c'est-à-dire une
    // durée calculée sur quelqu'un qui n'existe pas.
    for (const locale of ["en", "fr"] as const) {
      const markup = html({
        draft: {
          ...ADULT_COMPLETE,
          heightCm: "",
          goal: "fat_loss",
          targetWeightKg: "55",
        },
        locale,
      });
      // Le cas qui rend ce test lisible: il n'y a bien AUCUN curseur ici.
      expect(markup).not.toContain('id="mouth-pace"');
      expect(text(markup)).not.toMatch(/\d+\s*(weeks?|semaines?)/i);
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
    expect(body).toContain(decode(en["household.mouth.tastes_hint"]));
    const bodyFr = text(html({ locale: "fr" }));
    expect(bodyFr).toContain(decode(fr["household.mouth.tastes_hint"]));
    // ⛔ ET UNE SEULE FOIS. Ce test exigeait AUSSI « Dislike, not allergy »
    // sous le champ — la MÊME phrase, un cran plus bas. Le bloc disait donc
    // trois fois la même chose: le titre, l'aide de section, puis un second
    // libellé et une seconde aide. Jugé le 2026-08-20: « cette section est
    // verbeuse, pas du tout optimisée ». La distinction reste là où le
    // commentaire ci-dessus la veut — dans l'en-tête —, et n'y est plus qu'une
    // fois.
    expect(
      countOf(body, decode(en["household.mouth.tastes_hint"])),
      "la distinction dégoût/allergie est répétée",
    ).toBe(1);
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
          shakerPort: { kind: "now", save: () => {} },
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
        // ⟳ 2026-09-01 — voir la note du test des six titres: la section a
        // fusionné et porte désormais `eating`.
        "household.mouth.eating",
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
// UN MINEUR PORTE LES SIX BLOCS — ET UNE SEULE DIRECTION (2026-09-03)
// ---------------------------------------------------------------------------

/**
 * ⚠️ RETOURNÉ LE 2026-09-03 (chantier P3, D3.2). Ce bloc affirmait « les TROIS
 * directions lui sont proposées » — la décision du 18/08. La base l'a renversée
 * le 22/08 (`20260822041500`, lot S4: `goal_not_for_minor` sur les quatre
 * portes), et la fiche ne l'a suivie que douze jours plus tard. Les six blocs,
 * eux, restent rendus pour lui: seul le CONTENU du bloc 3 change.
 */
describe("un mineur porte les six blocs, et une seule direction", () => {
  const KID: Partial<MouthFormDraft> = {
    firstName: "Kid",
    birthDate: MINOR_BIRTH,
    heightCm: "140",
    weightKg: "35",
    gender: "male",
    activityLevel: "trains_some",
  };

  it("UNE tuile, « Eat normally » — les deux autres ne sont pas dans le HTML", () => {
    const markup = html({ draft: KID });
    expect(countOf(markup, 'name="mouth-goal"')).toBe(1);
    expect(markup).toContain('value="maintenance"');
    for (const token of ["fat_loss", "muscle_gain"]) {
      expect(markup, `${token} est encore proposé à un enfant`)
        .not.toContain(`value="${token}"`);
    }
    const body = text(markup);
    expect(body).toContain(decode(en["household.goal.minor_maintenance"]));
    expect(body).toContain(decode(en["household.goal.minor_only"]));
    // Et pas le mot d'adulte sur la même tuile.
    expect(body).not.toContain(decode(en["household.goal.maintenance"]));
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

  /**
   * LE PLI, ET LA PHRASE. Une direction héritée (`fat_loss` sur une bouche
   * mineure — les lignes d'avant le 22/08, que la migration a laissées
   * exprès) est rendue comme « Eat normally » COCHÉ, la phrase NOMME la
   * direction remplacée, et rien ne se déplie dessous: ni poids visé, ni
   * curseur. C'est aussi ce que `mouthToPersist` écrira.
   */
  it("une direction héritée est PLIÉE: « Eat normally » cochée, la phrase la nomme, rien ne se déplie", () => {
    const markup = html({ draft: { ...KID, goal: "fat_loss" } });
    // ⚠️ LA BALISE ENTIÈRE: React (SSR) émet `checked=""` AVANT `value="…"`.
    const goalTags = [...markup.matchAll(/<input[^>]*name="mouth-goal"[^>]*>/g)].map((m) => m[0]);
    expect(goalTags).toHaveLength(1);
    expect(goalTags[0]).toContain('value="maintenance"');
    expect(goalTags[0]).toMatch(/\bchecked(=""|\s|\/)/);
    expect(text(markup)).toContain(
      decode(
        en["household.goal.minor_switched"].replace(
          "{from}",
          en["household.goal.fat_loss"],
        ),
      ),
    );
    expect(markup).not.toContain('id="mouth-pace"');
    expect(markup).not.toContain('id="mouth-target-weight"');
    // Et le bouton n'est pas retenu par un bloc « direction » ou « corps »
    // calculé sur le brouillon BRUT: la lecture est pliée de bout en bout.
    expect(text(markup)).not.toContain(decode(en["household.mouth.block_direction"]));
  });

  /**
   * ⚠️ LE PLAFOND PÉDIATRIQUE DU CURSEUR EXISTE TOUJOURS — DANS LE MODULE,
   * PLUS À L'ÉCRAN. Ce cas mesurait, sur le HTML, un `max` différent entre un
   * enfant et un adulte à corps égal. La fiche ne peut plus le rendre: aucune
   * direction qui bouge n'est proposée à un enfant. La borne, elle, vit dans
   * `paceControlFor` → `paceCeilingFor` et reste mesurable sur la VALEUR —
   * c'est la ceinture qui tient une ligne héritée si un écran la lisait brute.
   */
  it("et son plafond de rythme reste borné sur SON besoin, dans le module", () => {
    const kid = paceControlFor({ ...emptyMouthDraft(), ...KID, goal: "fat_loss" }, TODAY);
    const adult = paceControlFor(
      { ...emptyMouthDraft(), ...KID, birthDate: ADULT_BIRTH, goal: "fat_loss" },
      TODAY,
    );
    expect(kid.kind).toBe("slider");
    expect(adult.kind).toBe("slider");
    if (kid.kind === "slider" && adult.kind === "slider") {
      // Les deux corps sont IDENTIQUES sauf la date de naissance: si les
      // bornes sont les mêmes, c'est que le plafond pédiatrique n'est pas
      // appliqué.
      expect(kid.max).not.toBe(adult.max);
    }
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
    // ⟳ 2026-09-01 — LA SECTION A FUSIONNÉ ET CHANGÉ DE TITRE. `habits` et
    // `rhythm` étaient deux sections de cette fenêtre; elles n'en font plus
    // qu'une, titrée `eating`. Les deux anciennes clés restent au catalogue —
    // `/app/household` s'en sert encore — mais aucune ne titre plus rien ici,
    // donc la cloison doit se mesurer sur la nouvelle.
    habits: "household.mouth.eating",
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

  /**
   * ① ET ⑤ SONT DANS LA FENÊTRE — ET C'EST CE QUI LES REND VIVANTS.
   *
   * ── LE DÉFAUT QUE CE CAS FERME (2026-08-24) ─────────────────────────────
   * Les trois « Oui / Non » de l'assiette se rendaient EN LIGNE, en bas de
   * `TargetAndPaceFields`, donc sur la carte. Or les deux écrivains de la carte
   * d'une bouche inscrite (`saveMouthFields`, `saveRowBody`) RELAIENT ①/⑤
   * depuis la base au motif écrit noir sur blanc que « cette carte ne les
   * demande PAS: ils vivent dans la fenêtre des préférences ». La carte les
   * demandait quand même: la réponse partait dans un brouillon que son
   * écrivain rejetait — saisie à l'écran, jetée avant la base, sans un refus.
   *
   * ⛔ ON MESURE LE `name` DU CONTRÔLE, PAS SEULEMENT SON LIBELLÉ. Le libellé
   * de l'appétit porte `{who}`, donc il change de mot d'une voix à l'autre; le
   * groupe de boutons radio, lui, est ce qui reçoit le clic.
   *
   * ⚠️ LE BROUILLON PORTE UN CORPS COMPLET ET UNE DIRECTION QUI BOUGE, ET
   * C'EST LA CONDITION DE LA MESURE. `TargetAndPaceFields` — le bloc qui les
   * portait — rend `null` tant que `paceControlFor` répond `folded`: sur un
   * brouillon vide, l'assertion d'absence côté fiche serait verte MÊME si le
   * défaut était intact. Vérifié en remettant le bloc en place: 76 verts.
   * C'est la cicatrice `guards-need-a-passing-case`, et le cas d'à côté (« le
   * poids visé et le curseur sont EN LIGNE ») la paie déjà.
   */
  it("① et ⑤ sont DANS la fenêtre, jamais sur la fiche en ligne", () => {
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
    // LA PRÉMISSE, ARMÉE: la fiche rend BIEN le bloc qui portait ①.
    expect(core, "le bloc du poids visé ne se rend pas: mesure sans objet")
      .toContain('id="mouth-target-weight"');
    expect(prefs, "mouth-appetite a quitté la fenêtre")
      .toContain('name="mouth-appetite"');
    expect(core, "mouth-appetite est remonté sur la fiche")
      .not.toContain('name="mouth-appetite"');

    // ⟳ 2026-09-01 — ① NE SE MESURE PLUS SUR `takesDessert / Cheese / Bread`.
    // Les trois oui/non par personne ont été retirés avec leur section, et la
    // question se pose désormais DANS le moment qu'elle concerne. Ce qui est
    // mesuré ici reste la CLOISON — la fenêtre porte le contrôle, la fiche en
    // ligne ne le porte pas — sur ce qui l'incarne aujourd'hui.
    //
    // ⛔ ET LES TROIS NOMS SONT VÉRIFIÉS ABSENTS DES DEUX CÔTÉS. Sans cette
    // moitié, réintroduire un des trois contrôles sur la fiche en ligne ne
    // ferait rougir personne: le test ne les nommerait simplement plus.
    for (const name of ["takesDessert", "takesCheese", "takesBread"]) {
      expect(prefs, `${name} est revenu dans la fenêtre`)
        .not.toContain(`name="${name}"`);
      expect(core, `${name} est remonté sur la fiche`)
        .not.toContain(`name="${name}"`);
    }

    // Les bulles, elles, sont dans la fenêtre — et sur le moment coché.
    const withLunch = prefsHtml({
      draft: { ...draft, rhythm: [{ slot: "lunch", size: null }] },
    });
    expect(withLunch, "la bulle du pain a quitté la fenêtre")
      .toContain('data-mouth-extra="lunch:bread"');
    expect(
      coreHtml({ draft: { ...draft, rhythm: [{ slot: "lunch", size: null }] } }),
      "les bulles sont remontées sur la fiche en ligne",
    ).not.toContain("data-mouth-extra");
    // Et la question se LIT — cinq bulles sans leur question seraient cinq
    // boutons sur rien.
    expect(text(withLunch)).toContain(
      decode(en["household.mouth.extras_field"]),
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
// LA FICHE EST LA MÊME POUR TOUT LE MONDE — ET C'EST UNE GARDE, PAS UN CONSTAT
//
// ── CE QU'ELLE REMPLACE, ET POURQUOI ─────────────────────────────────────
// Ici vivait `memberScoped` (D7, 2026-08-18): un booléen qui RETIRAIT deux
// sections — « ce que tu n'aimes pas » et « quand tu manges, et quoi » — à qui
// n'avait pas de ligne de foyer, c'est-à-dire au parcours SOLO. Le motif était
// vrai (les deux vivent sur `member_id`), la conséquence ne l'était pas: le
// produit n'était pas le même selon le chemin d'entrée. Signalé à l'écran le
// 2026-09-01: « dans les préférences alimentaires il n'y a plus ce que j'aime
// pas, ni quand est-ce que je mange ».
//
// ⛔ LES TROIS CAS D'AVANT SONT SUPPRIMÉS, PAS ADAPTÉS. Ils affirmaient que les
// sections DOIVENT disparaître; les garder inversés aurait laissé leur
// vocabulaire — et leur idée — dans le fichier. L'un d'eux, d'ailleurs, ne
// mesurait rien: « les habitudes par moment disparaissent » cherchait des
// champs d'habitude sur un brouillon SANS moment coché, où il n'en existe
// aucun dans les deux cas.
//
// ── CE QUE CELLE-CI TIENT ────────────────────────────────────────────────
// La fiche n'a plus AUCUN paramètre qui décide de ce qu'elle montre. Le jour
// où une section n'aurait de destination que pour certains, la réponse n'est
// pas de la cacher aux autres — c'est de leur donner la destination.
// ===========================================================================
describe("la fiche est la MÊME pour tout le monde", () => {
  /**
   * CE QUE LA FICHE PORTE — sans un mot de sa formulation.
   *
   * ⛔ ON NE COMPARE PAS LES TITRES, ET C'EST UNE CORRECTION MESURÉE. La
   * première rédaction le faisait et rougissait à tort: `voiced()` écrit « ce
   * que TU n'aimes pas » au titulaire et « ce que CETTE PERSONNE n'aime pas »
   * à une bouche. C'est la VOIX qui change, pas la présence — et confondre les
   * deux ferait échouer la garde sur exactement ce qu'elle doit autoriser.
   *
   * On compte donc les CADRES et on liste les CONTRÔLES par leur `id`, qui ne
   * dépend d'aucune langue ni d'aucune voix.
   */
  function shape(over: Parameters<typeof scene>[0]) {
    const html = prefsHtml(over);
    return {
      cadres: countOf(html, "data-sheet-section"),
      controles: [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).sort(),
    };
  }

  it("⛔ AUCUN PROP NE PEUT RETIRER UNE SECTION", () => {
    // ⚠️ LA PRÉMISSE, ARMÉE: si la fiche ne rendait plus rien, l'égalité
    // ci-dessous serait vraie et ne prouverait rien.
    const base = shape({});
    expect(base.cadres, `${base.cadres} cadres rendus`).toBeGreaterThanOrEqual(6);
    expect(base.controles.length).toBeGreaterThan(0);

    // Trois sujets, la MÊME fiche. C'est ce que « pareil pour tous les
    // parcours » veut dire, et c'est mesuré ici plutôt que promis en
    // commentaire.
    for (
      const [nom, over] of [
        ["une bouche sans compte", { subject: NO_ACCOUNT }],
        ["un compte réclamé", { subject: WITH_ACCOUNT }],
        ["le titulaire lui-même", {
          subject: { existing: true, hasAccount: true, isSelf: true },
        }],
      ] as const
    ) {
      expect(shape(over), `${nom} ne voit pas la même fiche`).toEqual(base);
    }
  });

  it("⛔ LA FENÊTRE N'A PLUS DE PARAMÈTRE D'AFFICHAGE CONDITIONNEL", () => {
    // ⚠️ CE CAS LIT LA SOURCE, et c'est ce qui le rend durable. Le cas
    // au-dessus compare des rendus: il ne verrait PAS une section neuve qu'on
    // ajouterait derrière une garde neuve, puisqu'elle manquerait des deux
    // côtés du même brouillon. Celui-ci refuse la garde elle-même.
    const src = readFileSync(
      new URL("./MouthFormDialog.tsx", import.meta.url),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(src, "`memberScoped` est revenu").not.toContain("memberScoped");
    // Et aucune section ne se rend sous condition d'un prop du composant.
    const gated = [...src.matchAll(/\{props\.(\w+) \? \(/g)].map((m) => m[1]);
    expect(
      gated,
      "une section est de nouveau conditionnée par un prop: donne-lui une " +
        "destination plutôt que de la cacher",
    ).toEqual([]);
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
  it("la case précède SON champ, dans la même ligne", () => {
    // ⟳ 2026-09-01 — LES DEUX N'ÉTAIENT PLUS DEUX SECTIONS, ELLES ONT FUSIONNÉ.
    // Le champ ne vit plus « en dessous de la section », il vit DANS la ligne
    // de sa case — et il faut donc un brouillon qui a coché pour qu'il existe.
    const markup = html({ draft: { rhythm: [{ slot: "breakfast", size: null }] } });
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
    // ⟳ 2026-09-01 — ET AUCUN CHAMP D'HABITUDE, C'EST L'INVERSE D'AVANT.
    // Les lignes retombaient sur la cascade lue; depuis que le champ s'ouvre
    // avec sa case, rien de coché veut dire rien à remplir. Vu à l'écran et
    // demandé explicitement: cinq champs vides sous cinq cases décochées se
    // lisaient comme un formulaire, pas comme une liste de moments.
    //
    // ⚠️ LA PHRASE, ELLE, RESTE OBLIGATOIRE — et elle compte plus qu'avant:
    // c'est désormais la SEULE chose qui distingue « comme la maison » d'une
    // section vide.
    expect(markup).not.toContain('id="mouth-habit-breakfast"');
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

  it("sans stock lisible, le bloc ne se rend pas du tout", () => {
    // `none` = le moteur ne relira RIEN pour ce sujet. Cas réel: une bouche du
    // foyer qui a réclamé son compte — le lecteur choisit sa source par
    // `userId` et lit alors `student_goals`, jamais sa ligne membre. Un bouton
    // ici écrirait dans une colonne que personne ne relit.
    const markup = html({
      subject: WITH_ACCOUNT,
      draft: { shaker: SHAKER_DRAFT },
      shakerPort: { kind: "none" },
    });
    // ⚠️ ON VISE UN `id` DU BLOC, PAS LE MOT « Save »: le libellé du bouton
    // d'enregistrement de la FICHE est le même mot, et l'assertion serait
    // verte pour la mauvaise raison.
    expect(markup).not.toContain('id="mouth-shaker-label"');
  });
});

// ===========================================================================
// 2026-09-01 — LE SHAKER D'UNE PERSONNE QU'ON AJOUTE SE COLLECTE
//
// ── LE DÉFAUT, DANS SES MOTS ──────────────────────────────────────────────
// « Dans les préférences alimentaires des personnes ajoutées, il n'y a pas le
// shaker, donc il faut l'ajouter. »
//
// ── CE QUI ÉTAIT CONSTRUIT, ET CE QUI MANQUAIT ────────────────────────────
// Le 2026-08-19 a livré le stock (`household_members.fixed_intakes`, migration
// `20260819170000`), la porte (`keel_household_set_member_fixed_intakes`),
// l'écrivain (`addShakerToMemberIntakes`) ET le lecteur du moteur
// (`household_fixed_intakes.ts`, branche `!mouth.userId`). Quatre pièces sur
// cinq. La cinquième — l'écran — n'a jamais rien appelé sur le chemin de
// l'ajout: `onSaveShaker` y valait `null`, et `null` retirait le bloc ENTIER.
//
// ⚠️ CE N'ÉTAIT DONC PAS « pas enregistrable », C'ÉTAIT « INCOLLECTABLE ». La
// nuance est tout le lot: une déclaration qu'on ne peut pas saisir ne peut pas
// non plus voyager avec le brouillon, et le brouillon EST le chemin d'écriture
// de la fiche d'ajout (les habitudes, les dégoûts, le régime et le rythme
// passent tous par là).
//
// Ces tests gardent les trois états de `ShakerPort` à l'écran, et surtout la
// frontière entre eux: les CHAMPS d'un côté, le BOUTON de l'autre.
// ===========================================================================

describe("2026-09-01 · les trois états du port du shaker", () => {
  /** Le bloc est-il là ? Un `id` du bloc, jamais un mot partagé avec la fiche. */
  const blockIn = (markup: string) => markup.includes('id="mouth-shaker-label"');

  it("`with_the_card`: les champs sont là, le bouton non", () => {
    const markup = html({
      subject: NO_ACCOUNT,
      draft: { shaker: SHAKER_DRAFT },
      shakerPort: { kind: "with_the_card" },
    });
    expect(blockIn(markup), "le shaker reste incollectable à l'ajout").toBe(true);
    // Les trois nombres AUSSI: un bloc réduit à son nom ne serait pas une
    // déclaration, et `parseFixedIntakes` est tout-ou-rien sur les trois.
    for (const id of ["mouth-shaker-grams", "mouth-shaker-protein", "mouth-shaker-kcal"]) {
      expect(markup, `${id} manque`).toContain(`id="${id}"`);
    }
    expect(
      text(markup),
      "un bouton qui échouerait à tous les coups est revenu",
    ).not.toContain(decode(en["household.mouth.shaker_save"]));
  });

  it("`now`: le même bloc, ET son bouton", () => {
    // ⚠️ LE CAS QUI PASSE. Sans lui, un `ShakerFields` qui ne rendrait plus
    // AUCUN bouton laisserait le test du dessus vert — « une garde a besoin
    // d'un cas qui passe ».
    const markup = html({
      subject: NO_ACCOUNT,
      draft: { shaker: SHAKER_DRAFT },
      shakerPort: { kind: "now", save: () => {} },
    });
    expect(blockIn(markup)).toBe(true);
    expect(text(markup)).toContain(decode(en["household.mouth.shaker_save"]));
  });

  /**
   * ⛔ « COMPTÉ » EST UN FAIT SUR LA BASE, ET IL NE SE DIT PAS AVANT.
   *
   * La ligne d'état sous le bloc annonçait « Enregistré, et compté dans la
   * journée » dès que les trois nombres étaient là. Sans bouton d'écriture,
   * c'est une chose annoncée en base au moment précis où elle est dans un
   * brouillon — le mensonge que ce dépôt passe son temps à fermer. Elle dit
   * donc PAR OÙ la déclaration partira.
   */
  it("`with_the_card` complet: il dit par où il part, pas qu'il est arrivé", () => {
    const done = text(html({
      subject: NO_ACCOUNT,
      draft: { shaker: SHAKER_DRAFT },
      shakerPort: { kind: "with_the_card" },
    }));
    expect(done).toContain(decode(en["household.mouth.shaker_with_the_card"]));
    expect(done, "« compté » se dit sur un brouillon")
      .not.toContain(decode(en["household.mouth.shaker_counted"]));
  });

  it("`now` complet: là, « compté » est vrai", () => {
    const done = text(html({
      subject: NO_ACCOUNT,
      draft: { shaker: SHAKER_DRAFT },
      shakerPort: { kind: "now", save: () => {} },
    }));
    expect(done).toContain(decode(en["household.mouth.shaker_counted"]));
    expect(done).not.toContain(decode(en["household.mouth.shaker_with_the_card"]));
  });

  /**
   * LES DEUX AUTRES CRANS PARLENT DE LA DÉCLARATION, PAS DE LA BASE — donc ils
   * sont vrais des deux côtés du port, et ils ne doivent PAS avoir été
   * emportés par la distinction ci-dessus.
   */
  it("« il manque une mesure » est le même des deux côtés", () => {
    const bare = {
      label: "",
      servingGrams: "",
      proteinGPerServing: "",
      energyKcalPerServing: "",
      slot: "",
    };
    for (
      const port of [
        { kind: "with_the_card" } as const,
        { kind: "now", save: () => {} } as const,
      ]
    ) {
      expect(
        text(html({ subject: NO_ACCOUNT, draft: { shaker: bare }, shakerPort: port })),
        port.kind,
      ).toContain(decode(en["household.mouth.shaker_needs_one"]));
    }
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

  it("⟳ rien de déclaré: les six CASES, et aucun champ", () => {
    // ⟳ 2026-09-01 — CE TEST DISAIT L'INVERSE, et il avait raison à l'époque:
    // les champs suivaient la cascade lue (`props.slots`), donc six lignes
    // s'affichaient sur un brouillon vierge. Depuis que le champ s'ouvre avec
    // sa case, il n'y a plus de cascade à suivre — une case décochée ne pose
    // pas de question.
    //
    // ⚠️ CE QUI NE CHANGE PAS: les six CASES restent là. C'est par elles qu'on
    // entre, et les retirer rendrait la section inutilisable.
    const markup = html({ slots: [...EATING_OCCASIONS], draft: { rhythm: null } });
    for (const slot of EATING_OCCASIONS) {
      expect(markup, slot).toContain(`id="mouth-rhythm-${slot}"`);
      expect(markup, slot).not.toContain(`id="mouth-habit-${slot}"`);
    }
    // ⛔ ET TOUJOURS PAS DE « voir les N autres moments »: rouvrir un moment
    // décoché, c'est proposer de répondre à une question qu'on a retirée.
    expect(markup).not.toMatch(/other moments|autres moments/);
  });
});

// ===========================================================================
// 2026-08-20 — LE CHAMP DU RÉGIME, DEUX DÉFAUTS VUS À L'ÉCRAN
//
// Capture du propriétaire, fiche du titulaire ouverte:
//   ① « COMMENT TU MANGES » écrit DEUX FOIS, l'une sous l'autre — le
//      `Section` et le `Field` rendaient la même clé.
//   ② « Personne n'a dit » proposé comme OPTION, à quelqu'un en train de
//      répondre pour lui-même. « Ça n'a pas trop de sens, il faut l'enlever. »
// ===========================================================================

describe("2026-08-20 · toutes les sections de la fiche ont le même cadre", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⛔ MESURÉ SUR CAPTURE. L'appétit et la structure du repas étaient les SEULS
   * blocs rendus nus — étiquette, options, puis l'aide en bas — pendant que le
   * régime, les allergies, les dégoûts, le rythme et les habitudes vivent
   * chacun dans une carte encadrée. « Ce n'est pas comme le reste, dans un
   * cadre. »
   *
   * La cause: deux composants ajoutés plus tard avec `Field`, le primitif du
   * FORMULAIRE, au lieu de `Section`, celui de la FICHE.
   */
  it("⛔ CHAQUE section de la fiche porte son cadre — on les COMPTE", () => {
    // ⚠️ UN COMPTE, ET PAS « UN CADRE EXISTE AVANT CE CONTRÔLE ». La première
    // rédaction cherchait le cadre le plus proche EN AMONT du contrôle: elle
    // trouvait celui de la section PRÉCÉDENTE et restait verte quand le bloc
    // redevenait nu. Mutation faite, mutation non mordue, assertion refaite.
    const frames = countOf(prefsHtml({}), "data-sheet-section");
    // Régime · allergies · dégoûts · « quand elle mange » · appétit · shaker.
    //
    // ⟳ 2026-09-01 — SIX, ET DEUX MOUVEMENTS L'EXPLIQUENT. « Ce qu'il y a
    // d'autre dans l'assiette » et ses trois oui/non ont été retirés (−1): la
    // question se pose maintenant DANS le moment qu'elle concerne, en bulles.
    // Et le rythme et les habitudes avaient déjà fusionné en une section (−1),
    // pendant que le shaker en devenait une (+1).
    expect(frames, `${frames} cadres au lieu de 6`).toBe(6);
  });

});

describe("2026-08-20 · le champ du régime", () => {
  it("⛔ le titre du régime n'est écrit QU'UNE fois", () => {
    // ⚠️ ASSERTION DE STRUCTURE, PAS DE TEXTE. Le doublon venait de ce que le
    // `Section` ET le `Field` rendaient la même clé; ce qui a disparu est le
    // `<label>` du `Field`. Compter le TITRE obligerait à deviner le prénom du
    // décor et l'interpolation de la voix — deux choses sans rapport avec le
    // défaut, et deux façons de rendre le test faux pour une bonne raison.
    const html = withoutClasses(prefsHtml({}));
    expect(
      html,
      "un <label> est de nouveau rendu au-dessus du select du régime",
    ).not.toMatch(/<label[^>]*for="mouth-diet"/);
    // ⚠️ LE CAS QUI PASSE: le select, lui, est toujours là. Sans cette ligne,
    // un formulaire qui aurait PERDU le champ passerait ce test.
    expect(html).toContain('<select id="mouth-diet"');
  });

  it("⚠️ et le select reste NOMMÉ pour un lecteur d'écran", () => {
    // Retirer le `<label>` visible sans rien mettre laisserait un contrôle
    // anonyme: le doublon serait réparé à l'œil et cassé à l'oreille.
    const html = withoutClasses(prefsHtml({}));
    const tag = html.slice(html.indexOf('<select id="mouth-diet"'));
    expect(tag.slice(0, tag.indexOf(">"))).toContain("aria-label");
  });

  it("⛔ « pas encore répondu » ne se CHOISIT plus", () => {
    const html = withoutClasses(prefsHtml({}));
    const empty = html.slice(html.indexOf('<option value=""'));
    expect(
      empty.slice(0, empty.indexOf(">")),
      "l'option vide est encore sélectionnable",
    ).toContain("disabled");
  });

  it("⚠️ MAIS ELLE RESTE — sinon l'écran annonce un régime que personne n'a choisi", () => {
    // Sur un brouillon vide, `draft.diet` vaut `""`. Sans option pour cette
    // valeur, le `select` afficherait « Je mange de tout » — le champ qui
    // écarte le plus d'aliments annoncerait une déclaration inexistante.
    // Cicatrice `auto-tick-writes-undeniable-false-facts`.
    const html = withoutClasses(prefsHtml({}));
    expect(html, "l'option vide a disparu").toContain('<option value=""');
    // Et son texte est une INVITE, plus un constat sur un tiers.
    expect(decode(html)).toContain(en["household.mouth.diet_unset"]);
    // ET LA COPIE ELLE-MÊME, DANS LES DEUX PACKS: le constat sur un tiers ne
    // revient ni en français ni en anglais.
    expect(fr["household.mouth.diet_unset"]).not.toContain("Personne n'a dit");
    expect(en["household.mouth.diet_unset"]).not.toContain("Nobody has said");
  });
});

// ===========================================================================
// 2026-09-01 · « QUAND ELLE MANGE » ET « CE QU'ELLE MANGE DÉJÀ » N'EN FONT
// PLUS QU'UNE — ET LE SHAKER EN SORT
//
// ⛔ CE QUE LA FUSION RÉPARE: les deux sections posaient la même question en
// deux fois, et rien entre elles ne disait que la seconde DÉPENDAIT de la
// première. On cochait un moment en haut; le champ correspondant apparaissait
// plus bas, à distance, dans une autre carte.
//
// ⛔ CE QU'ELLE NE CASSE PAS, et c'est la moitié qui a demandé une seconde
// rédaction: le détail reste accroché à `declaredSlots`, PAS à la case cochée.
// La première version l'accrochait à la case et vidait la section pour tous
// ceux qui n'ont jamais rien déclaré — c'est-à-dire re-cachait des réponses
// déjà écrites, ce que « il faut arrêter avec le dépliable » (2026-08-19)
// interdit.
// ===========================================================================

describe("la section fusionnée", () => {
  it("les cases ET les champs vivent dans la MÊME carte", () => {
    // Il faut un moment COCHÉ pour que son champ existe — c'est le sujet du
    // test d'à côté; celui-ci mesure la PLACE du champ, pas sa présence.
    const markup = prefsHtml({
      draft: { rhythm: [{ slot: "breakfast", size: null }] },
    });
    // Les deux moitiés sont là…
    expect(markup).toContain('id="mouth-rhythm-breakfast"');
    expect(markup).toContain('id="mouth-habit-breakfast"');
    // …et le champ d'un moment suit SA case, pas la liste entière. Sans cette
    // assertion, les deux pourraient être revenues dans deux cartes voisines.
    const caseAt = markup.indexOf('id="mouth-rhythm-breakfast"');
    const fieldAt = markup.indexOf('id="mouth-habit-breakfast"');
    const nextCaseAt = markup.indexOf('id="mouth-rhythm-snack_am"');
    expect(caseAt).toBeLessThan(fieldAt);
    expect(fieldAt).toBeLessThan(nextCaseAt);
  });

  it("cocher un moment ouvre SON champ, et lui seul", () => {
    // Deux moments déclarés ⇒ deux champs, pas six.
    const twice = prefsHtml({
      draft: {
        rhythm: [
          { slot: "lunch", size: null },
          { slot: "dinner", size: null },
        ],
      },
    });
    expect(twice).toContain('id="mouth-habit-lunch"');
    expect(twice).toContain('id="mouth-habit-dinner"');
    expect(twice).not.toContain('id="mouth-habit-breakfast"');
    // ⚠️ MAIS LES SIX CASES RESTENT: on doit pouvoir en cocher une septième.
    expect(twice).toContain('id="mouth-rhythm-breakfast"');
  });

  it("⟳ RIEN DE COCHÉ = AUCUN CHAMP, et les six cases quand même", () => {
    // ══════════════════════════════════════════════════════════════════════
    // TROIS RÉDACTIONS, ET CE TEST LES PORTE TOUTES — sinon la deuxième
    // reviendra.
    // ══════════════════════════════════════════════════════════════════════
    //   ① champ accroché à la case — refusé par « plus rien n'est replié ».
    //   ② champ accroché à la cascade lue — tous ouverts, y compris sur un
    //     brouillon vierge. Refusé À L'ÉCRAN: cinq champs vides sous cinq
    //     cases décochées.
    //   ③ champ accroché à la case, à nouveau — demandé après avoir vu ②.
    //
    // ⚠️ ET ③ N'EST PAS UN RETOUR À ①: le repli du 2026-08-19 cachait des
    // RÉPONSES; ici une case décochée veut dire « elle ne mange pas à ce
    // moment », donc il n'y a pas de question à poser.
    const markup = prefsHtml({ draft: { rhythm: null } });
    expect(markup).not.toContain('id="mouth-habit-breakfast"');
    expect(markup).not.toContain('id="mouth-habit-dinner"');
    // ⛔ LES CASES, ELLES, SONT TOUJOURS LÀ: ce sont elles, l'entrée.
    expect(markup).toContain('id="mouth-rhythm-breakfast"');
    expect(markup).toContain('id="mouth-rhythm-dinner"');
  });
});

describe("le shaker a quitté « ce qu'elle mange déjà »", () => {
  it("il porte SON cadre, et le compte de sections ne bouge pas", () => {
    // ⚠️ LE COMPTE SEUL NE DIRAIT PAS CE QUI A BOUGÉ — rythme + habitudes ont
    // fusionné (−1), le shaker est devenu une section (+1), et « ce qu'il y a
    // d'autre dans l'assiette » a disparu (−1). D'où les deux assertions qui
    // l'encadrent, et celle du bloc précédent.
    expect(countOf(prefsHtml({}), "data-sheet-section")).toBe(6);
    // Sans port d'écriture, le shaker ne se rend pas: cinq sections.
    expect(countOf(prefsHtml({ shakerPort: { kind: "none" } }), "data-sheet-section"))
      .toBe(5);
  });

  it("il vient APRÈS tous les champs de moment, jamais entre eux", () => {
    // ⚠️ LA MESURE EST UN ORDRE, pas une classe. Le shaker vivait AU FOND de
    // « ce qu'elle mange déjà », donc après les champs lui aussi — mais DANS
    // la même carte. C'est le compte de cadres juste au-dessus qui dit qu'il
    // en a une à lui; celui-ci dit qu'il ne s'est pas glissé au milieu des
    // moments au passage.
    const markup = prefsHtml({
      draft: {
        // Un moment coché: sans lui il n'existe aucun champ d'habitude, et la
        // mesure d'ordre n'aurait rien à comparer.
        rhythm: [{ slot: "dinner", size: null }],
        shaker: {
          label: "whey",
          servingGrams: "30",
          proteinGPerServing: "24",
          energyKcalPerServing: "120",
          slot: "",
        },
      },
    });
    const lastHabit = markup.lastIndexOf('id="mouth-habit-');
    const shakerSlot = markup.indexOf('id="mouth-shaker-slot"');
    expect(lastHabit).toBeGreaterThan(-1);
    expect(shakerSlot).toBeGreaterThan(-1);
    expect(lastHabit).toBeLessThan(shakerSlot);
  });
});

describe("le moment du shaker", () => {
  const SHAKER = {
    label: "whey",
    servingGrams: "30",
    proteinGPerServing: "24",
    energyKcalPerServing: "120",
    slot: "",
  };

  it("⛔ LE CHAMP EXISTE — il n'était rendu NULLE PART avant ce lot", () => {
    // `ShakerDraft.slot` vivait dans le type depuis toujours et partait en base
    // avec sa valeur d'origine, sans que personne ait pu la choisir.
    const markup = prefsHtml({ draft: { shaker: SHAKER } });
    expect(markup).toContain('id="mouth-shaker-slot"');
  });

  it("les SIX moments sont offerts, plus « hors moment nommé »", () => {
    // ⛔ PAS SEULEMENT LES MOMENTS COCHÉS. Restreindre rendrait le cas
    // fondateur inexprimable: « je mange midi et soir, et j'ai un shaker
    // l'après-midi » — l'après-midi n'est PAS dans sa liste.
    const markup = prefsHtml({
      draft: {
        shaker: SHAKER,
        rhythm: [
          { slot: "lunch", size: null },
          { slot: "dinner", size: null },
        ],
      },
    });
    for (const slot of ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"]) {
      expect(markup, slot).toContain(`value="${slot}"`);
    }
  });

  it("⛔ LES OPTIONS PORTENT LE NOM DU MOMENT, ET RIEN D'AUTRE", () => {
    // ══════════════════════════════════════════════════════════════════════
    // DEUX RÉDACTIONS ONT ESSAYÉ D'ANNONCER L'AJOUT ICI. CE TEST LES ENTERRE
    // TOUTES LES DEUX, ET DIT POURQUOI.
    // ══════════════════════════════════════════════════════════════════════
    //
    //   ① une phrase sous le champ — INATTEIGNABLE (`onSlot` ajoute le moment
    //     dans le même `set()` que le slot, donc la condition était fausse au
    //     rendu suivant). Le test qui la couvrait passait, sur un état que
    //     l'interface ne peut pas produire: une garde verte sur un coffre vide.
    //   ② une marque « — à ajouter » sur chaque option non cochée —
    //     ATTEIGNABLE mais ILLISIBLE. Le cas courant est `rhythm: null`, où
    //     RIEN n'est coché: les six options la portaient. Vu à l'écran le
    //     2026-09-01, capture à l'appui.
    //
    // ⚠️ ET L'AJOUT RESTE VISIBLE: la case se coche dans la section du dessus,
    // dans le même geste. C'est ce qui autorise ces options à se taire — pas
    // un abandon de l'exigence « on ne coche jamais sans le dire ».
    const markup = prefsHtml({
      draft: {
        shaker: SHAKER,
        // Le décor où la marque était la PLUS bruyante: deux moments cochés,
        // quatre qui ne le sont pas.
        rhythm: [
          { slot: "lunch", size: null },
          { slot: "dinner", size: null },
        ],
      },
    });
    const optionOf = (slot: string) => {
      const at = markup.indexOf(`value="${slot}"`);
      expect(at, `l'option ${slot} manque`).toBeGreaterThan(-1);
      return decode(markup.slice(at, markup.indexOf("</option>", at)));
    };
    // Le nom du moment, tel quel, coché ou non — la MÊME forme pour les deux.
    for (const slot of ["snack_pm", "breakfast", "lunch", "dinner"]) {
      expect(optionOf(slot), slot).not.toMatch(/—/);
    }
    // ⚠️ LE CAS QUI PASSE: les noms sont bien là. Sans lui, des options VIDES
    // passeraient l'assertion du dessus sans rien garantir.
    expect(optionOf("lunch")).toContain(decode(en["meals.slot.lunch"]));
    expect(optionOf("snack_pm")).toContain(decode(en["meals.slot.snack_pm"]));
  });

  it("le shaker se VOIT sur le moment où il est posé", () => {
    // La seconde moitié du lot: un apport déclaré sur un moment doit se lire
    // SUR ce moment, sinon la journée se lit à deux endroits.
    const markup = text(prefsHtml({
      draft: {
        shaker: { ...SHAKER, slot: "lunch" },
        rhythm: [{ slot: "lunch", size: null }],
      },
    }));
    expect(markup).toContain(
      decode(voicedText(en, "household.mouth.habit_shaker_here")),
    );
  });

  it("⚠️ ET PAS SUR LES AUTRES — « hors moment nommé » ne se pose nulle part", () => {
    const markup = text(prefsHtml({
      draft: { shaker: { ...SHAKER, slot: "" }, rhythm: [{ slot: "lunch", size: null }] },
    }));
    expect(markup).not.toContain(
      decode(voicedText(en, "household.mouth.habit_shaker_here")),
    );
  });
});

// ===========================================================================
// LES BULLES DE CE QUI EST PRIS À CÔTÉ DU PLAT (2026-09-01)
//
// ⛔ ELLES REMPLACENT « Ce qu'il y a d'autre dans l'assiette » ET SES TROIS
// OUI/NON. Ceux-là étaient posés UNE FOIS POUR LA PERSONNE: « je prends du
// pain » ne disait pas si c'était le midi, le soir, ou les deux, et le même
// ratio partait sur les six moments — petit-déjeuner compris, que le plan
// compose pourtant en entier.
//
// ⚠️ CE FICHIER REND DU MARKUP STATIQUE (`environment: "node"`), donc il ne
// PEUT PAS cliquer. Ce qui est mordu ici est CE QUI S'AFFICHE et sur QUEL
// moment; la sémantique du clic est tenue par `lib/mealExtras.ts` et ses
// tests, et le câblage des deux par la vérification au navigateur.
// ===========================================================================

describe("les bulles de ce qui est pris à côté du plat", () => {
  const lunchOnly = { rhythm: [{ slot: "lunch" as const, size: null }] };

  it("⛔ SUR LE DÉJEUNER ET LE DÎNER SEULEMENT", () => {
    const markup = prefsHtml({
      draft: {
        rhythm: EATING_OCCASIONS.map((slot) => ({ slot, size: null })),
      },
    });
    // Les six moments sont cochés — donc les six dépliants sont ouverts.
    for (const slot of ["lunch", "dinner"]) {
      expect(markup, `${slot} devrait porter ses bulles`)
        .toContain(`data-mouth-extra="${slot}:bread"`);
    }
    // ⛔ ET SURTOUT PAS AILLEURS. Le plan compose ENTIÈREMENT le
    // petit-déjeuner et les collations: y retrancher un forfait compterait
    // deux fois ce qui est déjà dans l'assiette.
    for (const slot of ["breakfast", "snack_am", "snack_pm", "before_bed"]) {
      expect(markup, `${slot} ne doit porter aucune bulle`)
        .not.toContain(`data-mouth-extra="${slot}:`);
    }
  });

  it("les CINQ bulles sont là, et il n'y en a pas une sixième", () => {
    const markup = prefsHtml({ draft: lunchOnly });
    for (const extra of ["bread", "cheese", "yoghurt", "fruit", "dessert"]) {
      expect(markup).toContain(`data-mouth-extra="lunch:${extra}"`);
    }
    expect(countOf(markup, 'data-mouth-extra="lunch:')).toBe(5);
  });

  it("⚠️ ELLES N'APPARAISSENT QUE SI LE MOMENT EST COCHÉ", () => {
    // Demander ce qu'on prend à côté d'un repas dont on vient de dire qu'il
    // n'existe pas est le défaut exact que la fusion du 2026-09-01 réparait.
    expect(prefsHtml({ draft: { rhythm: null } }))
      .not.toContain("data-mouth-extra");
    expect(prefsHtml({ draft: lunchOnly }))
      .toContain('data-mouth-extra="lunch:bread"');
  });

  it("une bulle ALLUMÉE se distingue d'une bulle éteinte", () => {
    const off = prefsHtml({ draft: lunchOnly });
    const on = prefsHtml({ draft: { ...lunchOnly, extras: { lunch: ["bread"] } } });
    // `aria-pressed` porte l'état — c'est ce qu'un lecteur d'écran annonce, et
    // une couleur seule ne dirait rien à personne qui ne la voit pas.
    expect(off).toContain('data-mouth-extra="lunch:bread"');
    expect(off).toMatch(/aria-pressed="false" data-mouth-extra="lunch:bread"/);
    expect(on).toMatch(/aria-pressed="true" data-mouth-extra="lunch:bread"/);
    // ⚠️ ET LE « + » DISPARAÎT: une bulle allumée ne propose plus d'ajouter,
    // elle DIT ce qui est pris.
    expect(text(off)).toContain("+ bread");
    expect(text(on)).not.toContain("+ bread");
  });

  it("⛔ LE MOMENT SEMÉ SE REND COCHÉ — sinon la fiche EFFACE", () => {
    // La porte REMPLACE la liste d'entrées: une fiche qui s'ouvre sur des
    // bulles éteintes alors que la base en porte les effacerait au Save.
    const markup = prefsHtml({
      draft: { ...lunchOnly, extras: { lunch: ["cheese", "fruit"] } },
    });
    expect(markup).toMatch(/aria-pressed="true" data-mouth-extra="lunch:cheese"/);
    expect(markup).toMatch(/aria-pressed="true" data-mouth-extra="lunch:fruit"/);
    expect(markup).toMatch(/aria-pressed="false" data-mouth-extra="lunch:bread"/);
  });

  it("⛔ « Ce qu'il y a d'autre dans l'assiette » A DISPARU", () => {
    const body = text(prefsHtml({ draft: lunchOnly }));
    expect(body).not.toContain(decode(en["household.mouth.meal_structure_you"]));
    expect(body).not.toContain(decode(en["household.mouth.takes_bread"]));
    // ⚠️ LE CAS QUI PASSE, à côté: la section qui les REMPLACE, elle, est là.
    expect(body).toContain(decode(en["household.mouth.extras_field"]));
  });
});
