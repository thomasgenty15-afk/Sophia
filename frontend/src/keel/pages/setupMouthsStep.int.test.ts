import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MouthsStep, SelfStep } from "./SetupPage";
import { MouthCoreFields } from "../components/MouthFormDialog";
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

function html(patch: Record<string, unknown> = {}, maxOthers = 7): string {
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
      maxOthers,
      draft: draft(patch),
      onDraftChange: () => {},
      onAdd: () => {},
      held: null,
      failure: null,
      added: null,
      formOpen: true,
      onOpenForm: () => {},
      onDiscard: () => {},
      onGoal: () => {},
      onBirthDate: () => {},
      onAllergyAnswer: () => {},
      onOpenDraftPreferences: () => {},
      onOpenMouthPreferences: () => {},
      mouthPrefs: null,
      knownPrefs: () => emptyMouthDraft(),
      onSaveMouthPreferences: () => {},
      onBody: () => {},
      onRemove: () => {},
      editingMemberId: null,
      onToggleEdit: () => {},
      targets: new Map(),
      birthDates: new Map(),
      onTarget: () => {},
      confirmRemove: null,
      onConfirmRemove: () => {},
      inviteFor: null,
      onInviteFor: () => {},
      inviteEmail: "",
      onInviteEmail: () => {},
      onInvite: () => {},
      invite: null,
      busy: false,
    } as unknown as Parameters<typeof MouthsStep>[0]),
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
  it("n'existe pas dans le parcours solo", () => {
    const body = decode(html({}, 0));
    expect(body).not.toContain(en["setup.mouths.add"]);
    expect(body).not.toContain('id="mouth-first-name"');
  });

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

/**
 * ⚠️ RETOURNÉ LE 2026-09-03 (chantier P3, décision D3.2). Ce bloc affirmait
 * « les trois directions sont proposées à un mineur » — la décision du 18/08.
 * La base l'a renversée le 22/08 (`20260822041500`, lot S4: `goal_not_for_minor`
 * sur les quatre portes), et l'écran ne l'a suivie que douze jours plus tard.
 *
 * ⚠️ SUR LA VALEUR RENDUE: on compte les boutons radio du groupe, jamais une
 * liste dans la source. Une tuile masquée par `display:none` compterait ici —
 * c'est un FILTRE de liste, et c'est ce que ce bloc mesure.
 *
 * ⚠️ ET L'OPTION VIDE EST PARTIE. « Aucune direction particulière » était la
 * quatrième ligne du `<select>`; les tuiles n'ont ni `<select>`, ni valeur
 * `""`, ni pré-sélection. Une ligne existante sans direction n'a rien de coché.
 */
describe("un mineur ne voit qu'une direction: « Eat normally » (2026-09-03)", () => {
  // ⚠️ ON LIT LA BALISE ENTIÈRE, PAS UN ORDRE D'ATTRIBUTS: React (SSR) émet
  // `checked=""` puis `value="…"` EN DERNIER, quel que soit l'ordre des props.
  const tags = (markup: string) =>
    [...markup.matchAll(/<input[^>]*name="mouth-goal"[^>]*>/g)].map((m) => m[0]);
  const valueOf = (tag: string) => /value="([a-z_]*)"/.exec(tag)?.[1] ?? "(sans valeur)";
  const offered = (markup: string) =>
    tags(markup).filter((t) => t.includes('type="radio"')).map(valueOf);
  const checkedValues = (markup: string) =>
    tags(markup).filter((t) => /\bchecked(=""|\s|\/)/.test(t)).map(valueOf);

  it("un mineur: UNE tuile, et c'est « Eat normally » — pas le mot d'adulte", () => {
    const markup = html({ birthDate: MINOR_BIRTH });
    expect(offered(markup)).toEqual(["maintenance"]);
    const body = decode(markup);
    expect(body).toContain(en["household.goal.minor_maintenance"]);
    expect(body).toContain(en["household.goal.minor_only"]);
    expect(body, "la tuile d'un enfant porte le mot d'un adulte")
      .not.toContain(en["setup.goal.maintenance"]);
    for (const goal of ["fat_loss", "muscle_gain"] as const) {
      expect(body, `la direction ${goal} est encore proposée à un mineur`)
        .not.toContain(en[`setup.goal.${goal}`]);
    }
  });

  it("un majeur: les trois, dans l'ordre du socle, et AUCUNE pré-cochée", () => {
    const markup = html({ birthDate: ADULT_BIRTH });
    expect(offered(markup)).toEqual([...GOAL_TOKENS]);
    expect(checkedValues(markup), "une direction est pré-cochée").toEqual([]);
    expect(decode(markup)).not.toContain(en["household.goal.minor_only"]);
  });

  /**
   * ⚠️ « JE NE SAIS PAS » N'EST PAS « C'EST UN ENFANT ». Sans date, l'âge est
   * inconnu, et l'inconnu voit les trois — sinon l'objectif de tout adulte
   * dont on n'a pas encore la date se fermerait, c'est-à-dire le cas courant
   * de l'entonnoir. Muter `goalsForAge` pour lire `unknown` comme `minor`
   * tombe ici.
   */
  it("un âge INCONNU voit les trois", () => {
    expect(offered(html({ birthDate: "" }))).toEqual([...GOAL_TOKENS]);
  });

  it("⛔ plus d'option vide: aucun `<select>` de direction, aucune valeur \"\"", () => {
    const markup = html({ birthDate: ADULT_BIRTH });
    expect(markup, "le sélecteur déroulant est revenu")
      .not.toMatch(/<select[^>]*id="mouth-goal"/);
    expect(offered(markup), "l'option vide est revenue sous forme de tuile")
      .not.toContain("");
  });

  /**
   * LE PLI, ET LA PHRASE. Rendu avec une date de mineur ET `fat_loss` déjà
   * choisi (une bouche héritée d'avant le 22/08, ou une date qu'on vient de
   * taper), la tuile « Eat normally » est COCHÉE et la phrase NOMME la
   * direction remplacée. C'est la lecture d'écran de « on refuse, on n'efface
   * pas »: le brouillon garde `fat_loss`, l'écran montre ce qui partira.
   */
  it("une direction héritée sur une date de mineur est pliée, cochée « Eat normally », et DITE", () => {
    const markup = html({ birthDate: MINOR_BIRTH, goal: "fat_loss" });
    expect(offered(markup)).toEqual(["maintenance"]);
    expect(checkedValues(markup)).toEqual(["maintenance"]);
    // ⟳ A5, 2026-09-03 — LE LIBELLÉ DE LA DIRECTION EST CELUI DU FOYER.
    // La fiche d'ajout montait ses propres libellés (`setup.goal.*`); elle
    // monte `MouthCoreFields` depuis ce lot, et `MouthCoreFields` nomme les
    // directions avec `household.goal.*`. Deux vocabulaires pour les trois
    // mêmes jetons, c'était l'écart que le lot referme — la phrase de bascule
    // suit celui de la fiche qui la rend.
    expect(decode(markup)).toContain(
      en["household.goal.minor_switched"].replace(
        "{from}",
        en["household.goal.fat_loss"],
      ),
    );
    // Et rien ne se déplie sous une direction repliée.
    expect(markup).not.toContain('id="mouth-target-weight"');
    expect(markup).not.toContain('id="mouth-pace"');
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
    expect(markup).toContain('id="mouth-target-weight"');
    expect(markup).toContain('id="mouth-pace"');
  });

  /**
   * ⚠️ ET LEURS `id` NE SONT PAS CEUX DU TITULAIRE. Les deux fiches sont sur LA
   * MÊME PAGE (sa carte est juste au-dessus): deux `id` identiques feraient
   * qu'un `<label for>` désigne le curseur de quelqu'un d'autre.
   *
   * ⟳ A5, 2026-09-03 — LA FICHE D'AJOUT PORTE MAINTENANT LES `id` `mouth-*`,
   * ceux de `MouthCoreFields`, parce que c'est LUI qu'elle monte désormais. Le
   * préfixe `setup-mouth-*` a disparu avec les dix champs recopiés.
   *
   * ⛔ CE QUI EST GARDÉ EST LA PROPRIÉTÉ, PAS LE PRÉFIXE. Vérifier « la fiche
   * ne contient pas `id="mouth-…"` » n'aurait plus aucun sens: elle n'en
   * contient QUE. On rend donc LES DEUX CARTES et on cherche un `id` en
   * double — c'est la panne que le préfixe existait pour empêcher, et elle se
   * mesure directement, sans dépendre du nom qu'on donne au préfixe.
   */
  it("aucun `id` n'est rendu deux fois sur l'étape 2", () => {
    const idsOf = (markup: string) =>
      [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const both = [...idsOf(selfHtml()), ...idsOf(html(LOSING))];
    // LE CAS QUI PASSE: sans lui, deux cartes rendant ZÉRO `id` seraient
    // déclarées sans collision — la panne la plus silencieuse de ce fichier.
    expect(both.length, "les deux cartes ne rendent plus aucun `id`")
      .toBeGreaterThanOrEqual(8);
    const seen = new Set<string>();
    const twice = both.filter((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    expect(twice, "un `id` désigne deux contrôles sur la même page").toEqual([]);
    // ET LA PAIRE QUI COMPTE, NOMMÉE: le curseur du titulaire et celui de la
    // bouche sont les deux `id` que le lot du 2026-08-18 avait séparés.
    expect(html(LOSING)).not.toContain('id="setup-self-pace"');
  });

  it("direction qui ne bouge pas: rien ne se déplie", () => {
    const markup = html({ ...LOSING, goal: "maintenance" });
    expect(markup).not.toContain('id="mouth-target-weight"');
    expect(markup).not.toContain('id="mouth-pace"');
  });

  /** Corps inconnu: une PHRASE, jamais un blanc. */
  it("corps inconnu: la phrase, pas le curseur", () => {
    const markup = html({ firstName: "Léa", goal: "fat_loss", birthDate: ADULT_BIRTH });
    expect(markup).not.toContain('id="mouth-pace"');
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
    expect(html()).toContain(en["household.mouth.preferences_open"].replace(/\{who\}/g, en["household.mouth.who_fallback"]));
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
        maxOthers: 7,
        draft: draft(),
        onDraftChange: () => {},
        onAdd: () => {},
        held: null,
        failure: null,
        added: null,
        formOpen: true,
        onOpenForm: () => {},
        onDiscard: () => {},
        onGoal: () => {},
        onBirthDate: () => {},
        onAllergyAnswer: () => {},
        onOpenDraftPreferences: () => {},
        onOpenMouthPreferences: () => {},
        mouthPrefs: null,
        knownPrefs: () => emptyMouthDraft(),
        onSaveMouthPreferences: () => {},
        onBody: () => {},
        onRemove: () => {},
        editingMemberId: null,
        onToggleEdit: () => {},
        targets: new Map(),
        birthDates: new Map(),
        onTarget: () => {},
        confirmRemove: null,
        onConfirmRemove: () => {},
        inviteFor: null,
        onInviteFor: () => {},
        inviteEmail: "",
        onInviteEmail: () => {},
        onInvite: () => {},
        invite: null,
        busy: false,
      } as unknown as Parameters<typeof MouthsStep>[0]),
    );
    // Deux boutons: celui de sa ligne, et celui du formulaire d'ajout.
    expect(markup.split(en["household.mouth.preferences_open"].replace(/\{who\}/g, en["household.mouth.who_fallback"])).length - 1)
      .toBe(2);
    expect(markup).not.toContain(en["setup.people.allergies_none"]);
  });
});

// ===========================================================================
// A5 (2026-09-03) — UN SEUL FORMULAIRE DE PERSONNE DANS LE DÉPÔT
//
// ── CE QUE CE BLOC GARDAIT, ET POURQUOI IL CHANGE DE SUJET ────────────────
// Il tenait une RELATION demandée à l'écran le 2026-09-01: « j'aimerais que la
// partie "j'ajoute quelqu'un qui mange ici" ait la même disposition que celle
// du compte maître […] mais avec "Il/Elle" ». On rendait donc `SelfStep` et
// `MouthsStep`, et on comparait leurs étiquettes une à une.
//
// La demande était juste, et le remède n'était que la moitié du remède: on
// avait fait RESSEMBLER deux formulaires au lieu de n'en garder qu'un. Il en
// restait DEUX qui décrivent la même personne dans les mêmes colonnes —
// celui-ci et `MouthCoreFields`, monté par `/app/household` —, et ils avaient
// déjà divergé sur trois points mesurés le 2026-09-03:
//   · la fiche du Foyer NOMME ce qui retient l'enregistrement, bloc par bloc
//     (`missingRequiredBlocks` + `household.mouth.held`); celle-ci ne disait
//     rien, et la base refusait plus loin;
//   · la fiche du Foyer groupe en trois blocs obligatoires nommés; celle-ci
//     empilait dix champs à plat;
//   · l'appétit et les trois cases du repas n'étaient pas collectables ici —
//     une bouche ajoutée depuis l'entonnoir naissait sans eux.
//
// L'étape 2 monte donc `MouthCoreFields` depuis A5, et la relation gardée ici
// devient la bonne: LES DEUX FICHES D'AJOUT SONT LE MÊME COMPOSANT, donc les
// mêmes étiquettes, dans le même ordre, sans qu'aucune liste ne soit recopiée.
//
// ── ⛔ ET LA CARTE DU TITULAIRE N'EST PAS PLIÉE DEDANS, EXPRÈS ────────────
// `SelfStep` écrit `profiles` / `student_goals`, pas une ligne membre, et ses
// BORNES sont celles de `profiles` (90–250 cm, 25–400 kg) quand celles d'une
// bouche sont celles de `keel_household_set_member_body` (30–260, 2–400): une
// bouche peut être un enfant de trois ans, que les bornes adultes refuseraient.
// Les deux cartes ne sont pas interchangeables, et le dernier cas de ce bloc
// le MESURE — pour qu'une session future qui voudrait « finir l'unification »
// trouve le motif avant de casser les bornes.
//
// ⚠️ CE QUI RESTE VRAI DE LA DEMANDE DU 2026-09-01 est tenu ailleurs, et par
// des cas qui passent: la voix (`voiced` + `lib/mouthVoice.ts`, dont le
// `Record` complet ne compile pas sans la jumelle `_you`), et l'interdiction
// du libellé qui s'efface (dernier cas ci-dessous).
// ===========================================================================

/** La carte du titulaire, rendue avec ses deux blocs conditionnels ouverts. */
function selfHtml(): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
  return renderToStaticMarkup(
    createElement(SelfStep, {
      draft: {
        firstName: "",
        birthDate: "",
        gender: "",
        heightCm: "",
        weightKg: "",
        goal: "",
        dayActivity: null,
        sportFrequency: null,
      },
      onChange: () => {},
      // ⚠️ PAS « solo »: cette branche-là RETIRE le prénom (rien, dans le
      // chemin individuel, ne le lit). La comparaison porterait alors sur une
      // carte amputée d'un champ, et le premier écart serait un faux.
      branch: "with_others",
      onSave: null,
      busy: false,
      // Les deux `null` possibles sont des LECTURES PAS FAITES, pas des états
      // de repos: passés à `null`, le poids visé et la porte des préférences
      // ne se montent pas, et la carte comparée n'est pas celle de l'écran.
      target: {
        draft: emptyMouthDraft(),
        onChange: () => {},
        todayLocalIso: "2026-09-01",
      },
      onOpenPreferences: () => {},
    } as unknown as Parameters<typeof SelfStep>[0]),
  );
}

/**
 * LA FICHE D'AJOUT DU FOYER — le MÊME composant, monté comme `/app/household`
 * le monte (`AddMouthCard`): `existing: false`, `hasAccount: false`,
 * `isSelf: false`.
 *
 * ⚠️ ON MONTE LE COMPOSANT, PAS LA PAGE. `HouseholdPage` ne se rend pas sous
 * `renderToStaticMarkup` (session, routeur, quatre lectures); ce qui doit être
 * comparé est la FICHE, et c'est elle qu'on monte des deux côtés.
 */
function householdAddHtml(): string {
  Object.defineProperty(globalThis, "location", {
    value: {
      pathname: "/app/household",
      search: "",
      href: "http://localhost/app/household",
    },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
  const markup = renderToStaticMarkup(
    createElement(MouthCoreFields, {
      draft: emptyMouthDraft(),
      onChange: () => {},
      subject: { existing: false, hasAccount: false, isSelf: false },
      todayLocalIso: "2026-09-03",
      busy: false,
      failure: null,
      onOpenPreferences: () => {},
      onSubmit: () => {},
    }),
  );
  // ON REPOSE LA PAGE DE CE FICHIER: `html()` dépend du `pathname` pour
  // résoudre la langue, et le laisser sur `/app/household` ferait dériver les
  // cas suivants sans qu'aucun ne le dise.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  return markup;
}

/** Les étiquettes réellement rendues, dans l'ordre du document. */
function labelsOf(markup: string): string[] {
  return [...decode(markup).matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, "").trim());
}

describe("A5 · un seul formulaire de personne — l'entonnoir et le Foyer", () => {
  /**
   * LA RELATION, ET ELLE N'EST PLUS UNE RESSEMBLANCE MAIS UNE IDENTITÉ.
   *
   * ⚠️ AUCUNE LISTE N'EST RECOPIÉE ICI, et c'est le point: une liste figée
   * resterait verte le jour où l'une des deux fiches bouge sans l'autre —
   * c'est-à-dire le jour exact où la divergence revient.
   */
  it("les deux fiches d'ajout rendent les mêmes étiquettes, dans le même ordre", () => {
    const funnel = labelsOf(html());
    // LE CAS QUI PASSE: sans lui, deux fiches rendant ZÉRO étiquette se
    // compareraient égales — la panne la plus silencieuse de ce fichier.
    expect(funnel.length, "la fiche d'ajout ne rend plus d'étiquette")
      .toBeGreaterThanOrEqual(6);
    expect(funnel).toEqual(labelsOf(householdAddHtml()));
  });

  /**
   * ⚠️ ET ELLE PARLE À LA TROISIÈME PERSONNE. La comparaison ci-dessus serait
   * verte si les deux fiches tutoyaient: elle compare, elle ne contrôle pas la
   * voix. Ces deux-là mordent alors — sur les clés que `voiced` bascule et qui
   * portent une personne.
   */
  it("la fiche d'ajout nomme la personne, elle ne la tutoie pas", () => {
    const body = decode(html({ firstName: "Léa" }));
    for (
      const key of [
        "household.mouth.body",
        "household.mouth.activity",
        "household.mouth.identity_hint",
      ] as const
    ) {
      const other = en[key].replace("{who}", "Léa");
      const own = en[`${key}_you` as "household.mouth.body_you"];
      expect(body, `« ${other} » manque dans la fiche d'ajout`).toContain(other);
      expect(body, `« ${own} » tutoie quelqu'un dont ce n'est pas la fiche`)
        .not.toContain(own);
    }
  });

  /**
   * LE TOUT-OU-RIEN DU CORPS A SURVÉCU AU DÉMÉNAGEMENT.
   *
   * `keel_household_set_member_body` rend `body_incomplete` dès qu'un des
   * trois manque, et le moteur SAUTE une bouche sans corps: taille et poids
   * saisis, sexe laissé sur « — », et la personne reçoit la part de tout le
   * monde EN SILENCE. La phrase est passée avec les champs qu'elle commente,
   * de la carte d'ajout de l'entonnoir vers `MouthCoreFields` — sinon elle
   * serait partie avec les dix champs recopiés, sans que rien ne rougisse.
   */
  it("le corps reste annoncé comme un tout", () => {
    expect(decode(html()), "le corps n'annonce plus qu'il est indivisible")
      .toContain(en["setup.mouths.body_together"]);
    expect(
      decode(householdAddHtml()),
      "la fiche du Foyer, elle, ne l'annonce pas",
    ).toContain(en["setup.mouths.body_together"]);
  });

  /**
   * PLUS UN SEUL LIBELLÉ QUI S'EFFACE. Les trois contrôles du corps de
   * `MouthCoreFields` n'avaient QUE leur `placeholder` pour se nommer —
   * c'est-à-dire un libellé qui disparaît à la première frappe, absent de toute
   * fiche remplie. La correction du 2026-09-01 avait été faite sur la carte de
   * l'entonnoir, celle qui vient d'être SUPPRIMÉE: elle est remontée dans le
   * composant partagé avec ce lot, sans quoi l'unification aurait été une
   * régression d'accessibilité.
   */
  it("aucun contrôle n'est étiqueté par son seul placeholder", () => {
    const markup = html();
    expect(
      [...markup.matchAll(/placeholder="([^"]*)"/g)].map((m) => m[1]),
      "un placeholder sert encore d'étiquette",
    ).toEqual([]);
    for (
      const id of [
        "mouth-first-name",
        "mouth-birth-date",
        "mouth-gender",
        "mouth-height",
        "mouth-weight",
      ]
    ) {
      expect(markup, `${id} n'a pas d'étiquette qui le désigne`)
        .toContain(`for="${id}"`);
    }
  });

  /**
   * ⛔ ET LA CARTE DU TITULAIRE N'EST PAS CETTE FICHE-LÀ — LES BORNES.
   *
   * Ce cas passe, et il existe pour être LU par la session qui voudra « finir
   * l'unification » en pliant `SelfStep` dans `MouthCoreFields`. Les deux
   * cartes écrivent des tables différentes, avec des CHECK différents:
   * `profiles` accepte 90–250 cm et 25–400 kg (un adulte titulaire d'un
   * compte), `household_members` accepte 30–260 et 2–400 (une bouche peut être
   * un enfant de trois ans). Plier l'une dans l'autre élargirait ou
   * resserrerait un CHECK sans que personne ne l'ait décidé.
   */
  it("⛔ le titulaire garde ses bornes, la bouche garde les siennes", () => {
    const self = selfHtml();
    const mouth = html();

    // ── LA TAILLE ────────────────────────────────────────────────────────
    expect(self, "les bornes de taille de `profiles` ont bougé")
      .toMatch(/min="90"[\s\S]*max="250"/);
    expect(mouth, "les bornes de taille d'une bouche ont bougé")
      .toMatch(/min="30"[\s\S]*max="260"/);

    // ── LE POIDS, ET C'EST LUI QUI PORTE L'ARGUMENT ──────────────────────
    //
    // ⛔ CETTE MOITIÉ MANQUAIT, et c'était la moitié qui compte. Le pavé
    // ci-dessus dit « une bouche peut être un enfant de trois ans »: un enfant
    // de trois ans pèse ~14 kg, et c'est le `min` du POIDS qui le refuse
    // (25 kg côté `profiles`), pas celui de la taille — un enfant de trois ans
    // mesure ~95 cm, ce que le `min=90` de `profiles` accepte déjà.
    // Le cas prouvait donc son titre sans prouver sa raison.
    expect(self, "les bornes de poids de `profiles` ont bougé")
      .toMatch(/min="25"[\s\S]*max="400"/);
    expect(mouth, "les bornes de poids d'une bouche ont bougé")
      .toMatch(/min="2"[\s\S]*max="400"/);

    // ⚠️ ET LES DEUX PLANCHERS DE POIDS DIFFÈRENT VRAIMENT: sans cette ligne,
    // `min="2"` serait satisfait par un `min="25"` mal lu (« 2 » est un préfixe
    // de « 25 »), et la garde retomberait sur une coïncidence de chaîne.
    expect(mouth, "le plancher de poids d'une bouche est celui d'un adulte")
      .not.toMatch(/min="25"/);
  });
});
