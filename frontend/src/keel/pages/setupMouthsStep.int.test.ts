import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MouthsStep } from "./SetupPage";
import { emptyMouthDraft } from "../lib/mouthForm";
import { en } from "../i18n/en";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import { GOAL_TOKENS } from "../../../../supabase/functions/_shared/keel/tokens.ts";

// ===========================================================================
// D6 (2026-08-18) — « C'EST UN ADULTE OU UN ENFANT ? » N'EST PLUS POSÉE
//
// Ce que ce fichier garde tient en deux phrases, et la seconde est un défaut
// mesuré, pas une préférence:
//
//   · LA QUESTION EST PARTIE. La date de naissance, collectée dans le MÊME
//     formulaire, dit déjà l'âge — et elle le dit mieux, parce qu'elle sait
//     répondre « je ne sais pas », ce qu'une paire de boutons ne sait pas.
//
//   · L'OBJECTIF D'UN MINEUR NE S'EFFACE PLUS. Le sélecteur retiré portait
//     `set({ kind, goal: kind === "child" ? "" : draft.goal })`: repasser en
//     « enfant » VIDAIT la direction déjà choisie. C'est l'ancienne règle,
//     renversée le 2026-08-18 (migration `20260818100000`, les deux portes RPC
//     ouvertes, `servingDirectionFor` côté moteur). Cet écran était le dernier
//     endroit à l'appliquer.
//
// ⚠️ SUR LA VALEUR RENDUE, PAS SUR LA SOURCE. `SetupPage` entier ne se monte
// pas (session, routeur, deux appels modèle de 100 à 200 s); `MouthsStep`, si.
// La seule assertion de source de ce fichier porte sur le GESTE qui effaçait,
// parce qu'un `onClick` disparu ne laisse aucune trace dans le HTML — et elle
// lit un fichier PRIVÉ DE SES COMMENTAIRES (cicatrice
// `caller-audit-must-strip-comments`: `SetupPage.tsx` PARLE longuement de la
// question retirée, et un grep naïf compterait ces morts-là comme des vivants).
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait jamais collecté, et le fichier
// entier serait un silence vert.
// ===========================================================================

const PATH = "/app/setup";

const MINOR_BIRTH = "2016-05-04";
const ADULT_BIRTH = "1990-05-04";

/**
 * Le brouillon d'ajout, dans sa forme rendue.
 *
 * ⚠️ IL VIENT DE `lib/mouthForm.ts` DEPUIS LE 2026-08-18, et pas d'un littéral
 * recopié ici. Le formulaire d'ajout porte désormais les mêmes champs qu'une
 * fiche de personne (le poids visé, le rythme, les préférences); un littéral
 * local aurait rendu ce fichier vert sur un brouillon qui n'existe plus, puis
 * rouge d'un `undefined.trim()` au premier champ ajouté ailleurs — ce qui vient
 * d'arriver.
 */
function draft(patch: Record<string, unknown> = {}) {
  return { ...emptyMouthDraft(), ...patch };
}

function html(patch: Record<string, unknown> = {}): string {
  // `uiLocale()` lit le CHEMIN COURANT: sans `location`, la page sort en
  // anglais quoi qu'on ait choisi. Patron de `mouthFormDialog.int.test.ts`.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
  return renderToStaticMarkup(
    createElement(MouthsStep, {
      // AUCUNE BOUCHE DÉJÀ INSCRITE: la pastille « adulte / enfant » d'une
      // ligne existante est un RENDU de ce que la base a compris (dérivé de
      // `ageState`), pas une question. La confondre avec la question retirée
      // ferait rougir ce fichier pour la mauvaise raison.
      mouths: [],
      draft: draft(patch),
      onDraftChange: () => {},
      onAdd: () => {},
      held: null,
      failure: null,
      onDiscard: () => {},
      onGoal: () => {},
      onBirthDate: () => {},
      onAllergyAnswer: () => {},
      onOpenDraftPreferences: () => {},
      onOpenMouthPreferences: () => {},
      mouthPrefs: null,
      onSaveMouthPreferences: () => {},
      onBody: () => {},
      onRemove: () => {},
      confirmRemove: null,
      onConfirmRemove: () => {},
      inviteFor: null,
      onInviteFor: () => {},
      inviteEmail: "",
      onInviteEmail: () => {},
      onInvite: () => {},
      invite: null,
      busy: false,
      // deno-lint-ignore no-explicit-any
    } as any),
  );
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

/** La source, PRIVÉE DE SES COMMENTAIRES. */
function code(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

describe("le formulaire d'ajout ne demande plus l'âge en toutes lettres", () => {
  it("ni la question, ni ses deux réponses", () => {
    const body = decode(html());
    expect(body, "la question « adulte ou enfant » est revenue")
      .not.toContain(en["setup.mouths.kind"]);
    expect(body, "le bouton « un adulte » est revenu")
      .not.toContain(en["setup.mouths.kind_adult"]);
    expect(body, "le bouton « un enfant » est revenu")
      .not.toContain(en["setup.mouths.kind_child"]);
  });

  /**
   * ⚠️ LE CAS QUI DONNE SON SENS AU PRÉCÉDENT. Sans lui, un `MouthsStep` qui
   * ne rendrait RIEN du tout passerait le test du dessus — « une garde a
   * besoin d'un cas qui passe ».
   */
  it("mais il demande toujours la date de naissance", () => {
    const body = decode(html());
    expect(body).toContain(en["setup.people.birth_date"]);
    expect(body).toContain('type="date"');
  });
});

describe("un mineur porte les trois directions, comme un majeur", () => {
  /**
   * LA LISTE NE DÉPEND PLUS DE L'ÂGE — c'est la décision du 2026-08-18, et
   * elle se lit sur les DEUX dates: une liste plus courte d'un côté serait
   * exactement l'ancienne règle réintroduite par la porte de derrière.
   */
  for (const [label, birthDate] of [["mineur", MINOR_BIRTH], ["majeur", ADULT_BIRTH]] as const) {
    it(`les ${GOAL_TOKENS.length} directions sont proposées à un ${label}`, () => {
      const body = decode(html({ birthDate }));
      for (const goal of GOAL_TOKENS) {
        expect(body, `la direction ${goal} manque pour un ${label}`).toContain(
          en[`setup.goal.${goal}` as "setup.goal.fat_loss"],
        );
      }
    });
  }

  /**
   * L'OBJECTIF SURVIT À LA DATE D'UN ENFANT. Rendu avec une date de mineur ET
   * une direction déjà choisie, le menu doit la rendre SÉLECTIONNÉE: c'est la
   * lecture d'écran de « on n'efface plus jamais l'objectif ».
   */
  it("une direction déjà choisie reste choisie sur une date de mineur", () => {
    const body = html({ birthDate: MINOR_BIRTH, goal: "fat_loss" });
    expect(body).toMatch(/<option[^>]*value="fat_loss"[^>]*selected/);
  });
});

/**
 * LE GESTE QUI EFFAÇAIT — la seule assertion de source, et elle est nommée.
 *
 * Un `onClick` supprimé ne laisse aucune trace dans le HTML: le prouver par le
 * rendu demanderait de simuler un clic, donc un DOM, donc `jsdom` pour toute la
 * suite — un effet de bord que personne n'a demandé sur un fichier de config
 * partagé par toutes les lanes.
 */
describe("plus aucun geste n'efface l'objectif d'un brouillon", () => {
  const src = code("./SetupPage.tsx");

  it("le brouillon d'ajout ne porte plus de champ `kind`", () => {
    expect(src, "le sélecteur adulte/enfant est revenu")
      .not.toContain('["adult", "child"] as const');
    expect(src, "le brouillon redéclare un `kind` tapé à la main")
      .not.toMatch(/^\s*kind: "adult" \| "child";/m);
  });

  it("aucune ligne ne remet `goal` à vide sur un choix d'âge", () => {
    expect(src, "l'effacement de l'objectif est revenu")
      .not.toContain('kind === "child" ? "" :');
  });

  /**
   * ET LE DERNIER LECTEUR DE L'ANCIENNE RÈGLE: un enfant DÉJÀ INSCRIT ne voyait
   * ni le champ de direction, ni la phrase qui dit où il vit — un blanc, là où
   * un majeur lisait « ça se règle dans ton about you ».
   */
  it("un enfant qui a un compte n'est plus muet sur sa direction", () => {
    expect(src, "le blanc réservé aux mineurs inscrits est revenu")
      .not.toContain('m.claimed && m.kind === "child"');
  });
});

// ===========================================================================
// D7 (2026-08-18) — UNE AUTRE BOUCHE PORTE AUSSI SON POIDS VISÉ ET SON RYTHME
//
// « Le maître serait sinon le seul dont on sait quelque chose. » Les deux
// champs vivaient uniquement sur sa fiche à lui; ici ils étaient absents, et le
// commentaire qui l'expliquait invoquait un écrivain manquant
// (`setMemberTarget`) — la porte existait depuis le début.
// ===========================================================================
describe("le formulaire d'ajout porte le poids visé et le curseur", () => {
  /** Un corps connu, et une direction qui bouge. */
  const LOSING = {
    firstName: "Léa",
    birthDate: ADULT_BIRTH,
    goal: "fat_loss",
    heightCm: "170",
    weightKg: "72",
    gender: "female",
  };

  it("direction qui bouge + corps connu: les deux contrôles", () => {
    const markup = html(LOSING);
    expect(markup).toContain('id="setup-mouth-target-weight"');
    expect(markup).toContain('id="setup-mouth-pace"');
  });

  /**
   * ⚠️ ET LEURS `id` NE SONT PAS CEUX DU TITULAIRE. Les deux fiches sont sur LA
   * MÊME PAGE (sa carte est juste au-dessus): deux `id` identiques feraient
   * qu'un `<label for>` désigne le curseur de quelqu'un d'autre.
   */
  it("les `id` sont préfixés, donc ils ne collisionnent pas", () => {
    const markup = html(LOSING);
    expect(markup).not.toContain('id="mouth-target-weight"');
    expect(markup).not.toContain('id="setup-self-pace"');
  });

  it("direction qui ne bouge pas: rien ne se déplie", () => {
    const markup = html({ ...LOSING, goal: "maintenance" });
    expect(markup).not.toContain('id="setup-mouth-target-weight"');
    expect(markup).not.toContain('id="setup-mouth-pace"');
  });

  /** Corps inconnu: une PHRASE, jamais un blanc. */
  it("corps inconnu: la phrase, pas le curseur", () => {
    const markup = html({ firstName: "Léa", goal: "fat_loss", birthDate: ADULT_BIRTH });
    expect(markup).not.toContain('id="setup-mouth-pace"');
    expect(markup).toContain(en["household.mouth.pace_needs_body"]);
  });
});

/**
 * ET CE QUI EST COLLECTÉ PART EN BASE — par l'AUTRE porte que celle du
 * titulaire. Un champ qu'on remplit et qui ne part nulle part est pire qu'un
 * champ absent, parce qu'il promet.
 */
describe("et la cible d'une bouche a son écrivain", () => {
  const src = code("./SetupPage.tsx");

  it("`addMouth` appelle `setMemberTarget`", () => {
    expect(src, "la cible d'une bouche ne part nulle part").toContain(
      "setMemberTarget(",
    );
  });
});

// ===========================================================================
// D7 (2026-08-18) — LES ALLERGIES D'UNE BOUCHE SONT DERRIÈRE LE BOUTON
//
// Cet écran en portait TROIS exemplaires en ligne — la carte du titulaire, ce
// formulaire d'ajout, et la ligne de chaque bouche déjà inscrite — pendant que
// la même question vivait déjà dans une fenêtre sur `/app/household`. Deux
// formulaires sur la même colonne: c'est le motif qui avait servi à ne rien
// faire, et c'est celui qu'on referme.
//
// ⚠️ RETIRER LE CHAMP SANS LA PORTE SERAIT PIRE QUE DE NE RIEN FAIRE:
// `canGenerate` réclame `member_allergies`, et la ligne n'offrirait plus aucun
// champ pour y répondre — un bouton gris, et rien à faire.
// ===========================================================================
describe("la porte des préférences, et plus aucun champ en ligne", () => {
  it("le formulaire d'ajout porte le bouton", () => {
    expect(html()).toContain(en["household.mouth.preferences_open"]);
  });

  it("et plus aucun sélecteur d'allergies en ligne", () => {
    expect(html(), "le champ d'allergies en ligne est revenu")
      .not.toContain(en["setup.people.allergies_none"]);
  });

  /**
   * ⚠️ LA LIGNE D'UNE BOUCHE DÉJÀ INSCRITE AUSSI, et son bouton n'est PAS
   * conditionné à « les allergies n'ont pas encore de réponse »: la fenêtre
   * porte aussi ce qu'elle mange déjà, ce qu'elle n'aime pas et son régime.
   */
  it("une bouche déjà inscrite a la même porte, même allergies répondues", () => {
    const markup = renderToStaticMarkup(
      createElement(MouthsStep, {
        mouths: [{
          memberId: "m-1",
          firstName: "Léa",
          claimed: false,
          diet: null,
          eatingSlots: null,
          away: [],
          heightCm: 120,
          weightKg: 25,
          gender: "female",
          activityLevel: null,
          kind: "child",
          birthDate: null,
          goal: null,
          allergiesReviewed: true,
        }],
        draft: draft(),
        onDraftChange: () => {},
        onAdd: () => {},
        held: null,
        failure: null,
        onDiscard: () => {},
        onGoal: () => {},
        onBirthDate: () => {},
        onAllergyAnswer: () => {},
        onOpenDraftPreferences: () => {},
        onOpenMouthPreferences: () => {},
        mouthPrefs: null,
        onSaveMouthPreferences: () => {},
        onBody: () => {},
        onRemove: () => {},
        confirmRemove: null,
        onConfirmRemove: () => {},
        inviteFor: null,
        onInviteFor: () => {},
        inviteEmail: "",
        onInviteEmail: () => {},
        onInvite: () => {},
        invite: null,
        busy: false,
        // deno-lint-ignore no-explicit-any
      } as any),
    );
    // Deux boutons: celui de sa ligne, et celui du formulaire d'ajout.
    expect(markup.split(en["household.mouth.preferences_open"]).length - 1)
      .toBe(2);
    expect(markup).not.toContain(en["setup.people.allergies_none"]);
  });
});
