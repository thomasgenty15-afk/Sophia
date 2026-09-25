import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import { rhythmPrefillFor, rhythmPrefillLatches } from "./rhythmPrefill";
import type { EatingOccasion, EatingOccasionSlot } from "../api/mealGeneration";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { eatingStructureFor } from "../../../../supabase/functions/_shared/keel/eating_structure.ts";
import { sourceFamily } from "../../test/sourceFamily";

// ===========================================================================
// FF-060 — LES MOMENTS DÉRIVÉS SONT PROPOSÉS COCHÉS (⟳ 2026-09-08)
//
// ⛔ CE LOT EST UNE RÉVERSION ASSUMÉE. La pré-coche avait été retirée le
// 2026-09-06 au motif qu'elle confond le PLANCHER et la DÉCLARATION. Décision
// du propriétaire: la fiche se remplit dans l'entonnoir, sous les yeux de la
// personne, et l'enregistrement est sa confirmation. Ce fichier tient ce qui
// survit malgré tout de la cicatrice — et c'est le VERROU: on ne propose
// qu'une fois, sinon « tout décocher » devient inatteignable.
// ===========================================================================

const read = (rel: string) => sourceFamily(resolve(__dirname, rel));
const bare = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");

const DIALOG = bare(read("../components/MouthFormDialog.tsx"));

// ⟳ 2026-09-11 — `EatingOccasionSlot.slot` EST UN JETON FERMÉ, pas une chaîne:
// le banc prend donc `EatingOccasion` et laisse le typecheck refuser un
// moment qui n'existe pas, au lieu de le découvrir à l'exécution.
const slots = (...names: EatingOccasion[]): EatingOccasionSlot[] =>
  names.map((slot) => ({ slot, size: null }));

describe("on propose les moments que le corps demande", () => {
  it("fiche neuve: les moments dérivés sont rendus, dans l'ordre de la journée", () => {
    const next = rhythmPrefillFor({
      declared: null,
      // Volontairement en désordre: l'ordre rendu ne doit rien lui devoir.
      derived: ["dinner", "breakfast", "snack_pm", "lunch"],
      latched: false,
    });
    expect(next?.map((r) => r.slot)).toEqual([
      "breakfast",
      "lunch",
      "snack_pm",
      "dinner",
    ]);
  });

  it("⛔ ON PROPOSE UN MOMENT, PAS UNE PORTION: `size` reste `null`", () => {
    // La taille est une seconde question, posée sous la case une fois cochée.
    // La remplir ici ferait dire à la personne une chose de plus qu'elle n'a
    // pas dite — et celle-là ne se voit pas.
    const next = rhythmPrefillFor({
      declared: null,
      derived: ["breakfast", "lunch", "dinner"],
      latched: false,
    });
    expect(next?.every((r) => r.size === null)).toBe(true);
  });

  it("⛔ LE JETON LEGACY `snack` NE SE PROPOSE PAS", () => {
    // Le module serveur conserve les jetons qu'il ne connaît pas. Le recopier
    // poserait sur la fiche une case qu'aucune rangée ne rend: un moment que
    // la personne ne pourrait ni voir ni décocher.
    const next = rhythmPrefillFor({
      declared: null,
      derived: ["breakfast", "snack", "dinner"],
      latched: false,
    });
    expect(next?.map((r) => r.slot)).toEqual(["breakfast", "dinner"]);
  });

  it("rien à proposer ⇒ `null`, jamais un tableau vide", () => {
    // Le vide est une VALEUR dans ce champ (la base refuse `empty_rhythm`, et
    // l'écran le relit « comme la maison »): le rendre ferait écrire une
    // réponse là où on voulait s'abstenir.
    expect(rhythmPrefillFor({ declared: null, derived: [], latched: false }))
      .toBeNull();
    expect(rhythmPrefillFor({ declared: null, derived: ["snack"], latched: false }))
      .toBeNull();
  });
});

describe("⛔ ON NE PROPOSE QU'UNE FOIS — sinon « comme la maison » est inatteignable", () => {
  it("elle a déjà répondu: on ne repasse pas par-dessus", () => {
    expect(
      rhythmPrefillFor({
        declared: slots("breakfast"),
        derived: ["breakfast", "lunch", "dinner", "snack_pm"],
        latched: false,
      }),
    ).toBeNull();
  });

  it("⛔ ELLE A TOUT DÉCOCHÉ: le verrou tient, la liste NE SE RECOCHE PAS", () => {
    // ══════════════════════════════════════════════════════════════════════
    // LA GARDE CENTRALE DU LOT, ET LE SEUL VRAI RISQUE DE LA RÉVERSION.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Décocher le dernier moment remet `rhythm` à `null` — l'état même sur
    // lequel on propose. Sans verrou, la liste se recoche sous les doigts et
    // « comme la maison » devient un état que le produit refuse d'atteindre.
    expect(
      rhythmPrefillFor({
        declared: null,
        derived: ["breakfast", "lunch", "dinner"],
        latched: true,
      }),
    ).toBeNull();
  });

  it("le verrou s'arme sur TOUTE réponse présente, quelle qu'en soit l'origine", () => {
    // Une fiche de membre qui portait déjà ses moments ne doit pas se faire
    // re-remplir au premier vidage.
    expect(rhythmPrefillLatches(slots("lunch"))).toBe(true);
    expect(rhythmPrefillLatches(null)).toBe(false);
  });
});

describe("⛔ AUCUNE FORMULE DANS LE FRONT: la liste vient du module serveur", () => {
  it("ce que `eatingStructureFor` retient est exactement ce qui se propose", () => {
    // ⚠️ LA PRÉMISSE DU LOT, ET ELLE EST VÉRIFIÉE PLUTÔT QUE SUPPOSÉE. Le
    // front ne décide ni combien de moments ni lesquels: il recopie
    // `structure.slots`. On fait donc tourner le MÊME module pur que le
    // générateur, sur un corps qui demande plus que trois assiettes.
    const structure = eatingStructureFor({
      // 84 kg en prise de masse: le cas mesuré du 2026-09-04, celui qui a
      // ouvert un cinquième moment.
      targetKcal: 4226,
      weightKg: 84,
      declaredSlots: [],
      blockedSlots: [],
      direction: "up",
    });
    expect(structure.requiredCount).toBeGreaterThan(3);
    const next = rhythmPrefillFor({
      declared: null,
      derived: structure.slots,
      latched: false,
    });
    expect(next?.map((r) => r.slot)).toEqual(structure.slots);
  });

  it("un moment nommé ABSENT n'est jamais proposé", () => {
    // `blockedSlots` gagne toujours côté serveur; la recopie ne doit pas le
    // défaire. Quelqu'un qui a dit « je ne mange pas le matin » ne retrouve
    // pas le petit-déjeuner coché.
    const structure = eatingStructureFor({
      targetKcal: 3056,
      weightKg: 75,
      declaredSlots: [],
      blockedSlots: ["breakfast"],
      direction: null,
    });
    const next = rhythmPrefillFor({
      declared: null,
      derived: structure.slots,
      latched: false,
    });
    expect(next?.map((r) => r.slot)).not.toContain("breakfast");
  });
});

describe("l'effet est CÂBLÉ dans la fiche, et il lit la bonne moitié", () => {
  it("⛔ il recopie `structure.slots`, PAS `structure.opened`", () => {
    // `opened` est le DELTA — ce que la dérivation a ajouté — et il retombe à
    // zéro dès que le brouillon porte les moments. C'est cette confusion qui
    // avait rendu la phrase muette le 2026-09-04, et c'est le premier réflexe
    // au moment de recâbler.
    expect(DIALOG).toMatch(/derived: props\.structure\?\.slots \?\? \[\]/);
    const call = DIALOG.slice(
      DIALOG.indexOf("rhythmPrefillFor({"),
      DIALOG.indexOf("if (next === null) return;"),
    );
    expect(call, "l'effet lit `opened`").not.toMatch(/\.opened/);
  });

  it("⛔ le verrou est une `ref`, et il s'arme AVANT l'écriture", () => {
    // Un `useState` redessinerait, et la valeur se perdrait entre deux rendus.
    expect(DIALOG).toMatch(/const prefilled = React\.useRef\(false\);/);
    const effect = DIALOG.slice(DIALOG.indexOf("const prefilled = React.useRef"));
    const arm = effect.indexOf("prefilled.current = true;\n    set({ rhythm: next });");
    expect(arm, "le verrou ne s'arme plus juste avant l'écriture")
      .toBeGreaterThan(-1);
  });

  it("⛔ PLUS AUCUNE CASE N'EST GRISÉE — le verrou n'existe plus", () => {
    // ══════════════════════════════════════════════════════════════════════
    // 2026-09-15 — « ça doit pas être bloqué, mais en fonction de l'objectif
    // calorique il faut que ce soit coché ». Les deux moitiés vont ensemble et
    // ce fichier tient les deux: la pré-coche au-dessus, l'absence de verrou
    // ici.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE TEST PORTE SUR TROIS SYMBOLES, ET PAS UN SEUL. `floorBinds` retiré
    // mais `data-mouth-slot-locked` laissé en place rendrait un attribut vide;
    // `disabled` laissé sur autre chose que `props.busy` regriserait la case
    // par un autre chemin. Les trois ensemble sont ce qui prouve qu'une case
    // cochée reste cliquable.
    expect(DIALOG, "`floorBinds` est revenu").not.toMatch(/floorBinds\s*=/);
    expect(DIALOG, "l'attribut de verrou est revenu")
      .not.toMatch(/data-mouth-slot-locked/);
    const box = DIALOG.slice(
      DIALOG.indexOf('id={`mouth-rhythm-${slot}`}'),
      DIALOG.indexOf("onChange={() => {", DIALOG.indexOf('id={`mouth-rhythm-${slot}`}')),
    );
    expect(box, "la case se désactive sur autre chose qu'une écriture en cours")
      .toMatch(/disabled=\{props\.busy\}/);
  });
});

// ===========================================================================
// ⟳ 2026-09-15 — UNE SEULE PHRASE, POUR TOUT LE MONDE.
//
// Ce bloc en tenait DEUX, une par état: « libre » (on peut décocher) et
// « tenu » (les cases sont grisées, on ne peut qu'ajouter). Le verrou a été
// retiré le 2026-09-15 — plus personne n'est dans l'état « tenu », et
// `rhythm_floor_locked` a été supprimée des deux paquets.
//
// ⛔ CE QUI SURVIT DU LOT DE 2026-09-08, ET C'EST LA MOITIÉ QUI COMPTE: la
// phrase ne nomme QUE des gestes qui existent. « Décoche ceux que tu ne prends
// pas » n'est vrai que parce qu'aucune case ne refuse le clic — les deux tests
// ci-dessous le mesurent ensemble, ici et dans le bloc du dessus.
// ===========================================================================

const FREE = ["household.mouth.rhythm_derived", "household.mouth.rhythm_derived_you"] as const;

describe("une seule phrase, et elle ne promet que le geste qui existe", () => {
  it("⛔ ELLE PROPOSE DE RETIRER — et l'écran le permet vraiment", () => {
    for (const key of FREE) {
      expect(fr[key], `fr · ${key}`).toMatch(/décoche/i);
      expect(en[key], `en · ${key}`).toMatch(/untick/i);
    }
  });

  it("⛔ LA PHRASE DE L'ÉTAT TENU A DISPARU DES DEUX PAQUETS", () => {
    // Laissée en place, elle serait revenue au premier « une phrase par
    // état » — et elle décrirait un refus que l'écran n'oppose plus.
    for (const key of [
      "household.mouth.rhythm_floor_locked",
      "household.mouth.rhythm_floor_locked_you",
    ]) {
      expect(fr).not.toHaveProperty(key);
      expect(en).not.toHaveProperty(key);
    }
    // ⛔ `rhythm_derived_why` N'EXISTE PLUS NON PLUS: elle se servait dans les
    // deux états, dont celui où elle n'expliquait rien de contraignant.
    expect(fr).not.toHaveProperty("household.mouth.rhythm_derived_why");
    expect(en).not.toHaveProperty("household.mouth.rhythm_derived_why");
  });

  it("⚠️ COURT: une phrase, pas un paragraphe", () => {
    // ══════════════════════════════════════════════════════════════════════
    // 65 MOTS ÉTAIENT LE DÉFAUT, ET UN CHIFFRE EST LA SEULE FAÇON DE LE TENIR.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Sans plafond, la phrase regrossit au premier ajout « utile » — chacun
    // l'étant pris seul. Le seuil est celui de l'empilement d'avant, divisé
    // par deux: de quoi dire un fait et un geste, pas une leçon.
    for (const key of FREE) {
      for (const [lang, pack] of [["fr", fr], ["en", en]] as const) {
        const words = pack[key].split(/\s+/).length;
        expect(words, `${lang} · ${key} fait ${words} mots`).toBeLessThanOrEqual(30);
      }
    }
  });

  it("⛔ ET L'ÉCRAN N'EN REND QU'UNE — ni empilement, ni branche", () => {
    // La contradiction ne venait pas des mots, elle venait du `+`. Le rendu ne
    // concatène plus — et depuis le 2026-09-15 il ne CHOISIT plus non plus:
    // une branche laissée ici serait un état mort qui attend sa clé.
    const block = DIALOG.slice(DIALOG.indexOf("{floorSpeaks"), DIALOG.indexOf("LE SHAKER COMPOSÉ"));
    expect(block).toMatch(/voiced\("household\.mouth\.rhythm_derived", voice\)/);
    expect(block, "la branche du verrou est revenue")
      .not.toMatch(/rhythm_floor_locked/);
    expect(block, "les deux phrases se concatènent encore")
      .not.toMatch(/rhythm_derived_why/);
  });

  it("⛔ ET ELLE A UNE VOIX: elle ne tutoie plus la fiche d'un tiers", () => {
    // « Tu en as coché 4 » s'affichait sous le prénom de quelqu'un d'autre.
    expect(fr["household.mouth.rhythm_derived"]).toMatch(/\{who\}/);
    expect(fr["household.mouth.rhythm_derived_you"]).not.toMatch(/\{who\}/);
    expect(en["household.mouth.rhythm_derived"]).toMatch(/\{who\}/);
    expect(en["household.mouth.rhythm_derived_you"]).not.toMatch(/\{who\}/);
  });
});

// ===========================================================================
// ⟳ 2026-09-19 — LA RECOMMANDATION APPARTIENT À UNE PERSONNE
//
// ── LE DÉFAUT, REPRODUIT À L'ÉCRAN AVANT D'ÊTRE CORRIGÉ ──────────────────
// Signalé: « j'ai tout coché pour un user et ça a tout coché automatiquement
// pour les autres ». Vérifié dans l'entonnoir, sur un foyer neuf: le titulaire
// coche ses six moments, ferme, ouvre la fiche de la bouche d'à côté — et les
// six cases y sont cochées, sur quelqu'un qui n'a rien dit.
//
// La pré-coche n'y était pour rien: elle faisait son travail, sur une réponse
// qui ne parlait pas de la bonne personne. `useEatingStructure` gardait UN
// état pour les trois sujets de l'écran (soi, la bouche qu'on ajoute, celle
// qu'on reprend) et n'en sortait jamais — `if (!active) return` s'en allait
// sans rien effacer. La première image de la fiche suivante recevait donc la
// réponse de la précédente, et le verrou `prefilled` la figeait là.
//
// ⚠️ CE QUI EST GARDÉ ICI EST LA GARDE, PAS LE CALCUL: que la réponse porte le
// nom de son sujet, et qu'elle ne se rende pas sous un autre. Les cas de la
// dérivation elle-même sont plus haut.
// ===========================================================================

const HOOK = bare(read("./useEatingStructure.ts"));
const SETUP = bare(read("../pages/SetupPage.tsx"));
const HOUSEHOLD = bare(read("../pages/HouseholdPage.tsx"));

describe("⛔ une structure parle de QUELQU'UN, et ne se rend pas sous un autre nom", () => {
  it("le crochet retient le sujet AVEC la réponse", () => {
    expect(HOOK, "le sujet n'est plus demandé").toContain("subject: string;");
    expect(
      HOOK,
      "la réponse et son sujet sont dans deux états: le rendu du milieu ment",
    ).toMatch(/useState<\s*\{ subject: string; value: EatingStructure \| null \} \| null\s*>/);
  });

  it("⛔ LA GARDE EST AU RENDU, pas dans un effet de nettoyage", () => {
    // Un effet aurait couru APRÈS le rendu fautif, c'est-à-dire après la
    // morsure: la fiche d'en face a déjà recopié les cases et verrouillé.
    expect(HOOK).toContain(
      "return computed !== null && computed.subject === subject ? computed.value : null;",
    );
  });

  it("le sujet relance le calcul — deux corps identiques ne sont pas une personne", () => {
    const at = HOOK.indexOf("}, [");
    expect(at, "la liste de dépendances a disparu").toBeGreaterThan(0);
    expect(HOOK.slice(at, at + 400)).toContain("subject,");
  });

  it("⛔ LES QUATRE SITES DE MONTAGE NOMMENT LEUR SUJET, ET DISTINCTEMENT", () => {
    // L'entonnoir est celui qui a mordu: un seul crochet, trois sujets.
    expect(SETUP).toContain("subject: prefsFor === null");
    expect(SETUP).toContain("`member:${prefsFor.memberId}`");
    // Le foyer en a trois, un par montage — la garde s'y pose quand même:
    // « une garde qu'on ne pose que là où ça peut arriver finit par manquer ».
    expect(HOUSEHOLD).toContain('subject: "self",');
    expect(HOUSEHOLD).toContain('subject: "new",');
    expect(HOUSEHOLD).toContain("subject: `member:${member.memberId}`,");
  });

  it("⛔ ET CHAQUE BOUCHE DE L'ENTONNOIR PORTE SON PROPRE CORPS DANS SA FICHE", () => {
    // La seconde moitié du signalement: ne pas hériter de la recommandation
    // d'à côté ne suffit pas, encore faut-il en avoir une à soi. Sans ces
    // champs, le crochet n'a AUCUN poids pour cette bouche — il ne demande
    // rien, et la fenêtre ne propose rien.
    //
    // ⚠️ EN LECTURE SEULE: `saveMouthPreferences` écrit le corps depuis la
    // ligne du roster (`target`), jamais depuis ce brouillon.
    const at = SETUP.indexOf("onOpenMouthPreferences={(m) => {");
    expect(at, "la porte de la fenêtre a disparu").toBeGreaterThan(0);
    const block = SETUP.slice(at, at + 2200);
    for (const field of [
      "heightCm: m.heightCm",
      "weightKg: m.weightKg",
      "gender: m.gender",
      "birthDate: memberBirthDates?.get(",
      "paceKgPerWeek: aimed?.paceKgPerWeek",
    ]) {
      expect(block, `${field} ne descend pas dans la fiche`).toContain(field);
    }
  });
});

// ===========================================================================
// ⟳ 2026-09-19 — LE CURSEUR DE RYTHME D'UNE BOUCHE DÉJÀ INSCRITE
//
// Signalé: « le curseur n'apparaît pas dans le cas d'une perte de poids ».
// Sur la ligne d'une bouche ajoutée puis rouverte par « Modifier », en
// `fat_loss` et avec taille/poids/sexe: « Poids visé » se dépliait, le curseur
// non. `mouthDraftFromRow` ne porte pas la date de naissance (le roster ne la
// rend jamais), et `estimatedMaintenanceKcal` rend `null` sans BANDE D'ÂGE —
// donc pas de plafond, donc `needs_body`, donc pas de curseur.
//
// La date, elle, EST connue de la ligne (`date`, semée par la porte scopée au
// maître). On la DÉRIVE dans le brouillon affiché plutôt que de la semer: la
// mettre dans la semence obligerait à la mettre dans la CLÉ de semence, et
// chaque frappe dans le champ date effacerait un poids visé en cours de
// saisie.
// ===========================================================================

describe("⛔ le curseur d'une bouche a besoin de son ÂGE, et la ligne le connaît", () => {
  it("le brouillon affiché porte la date de la ligne", () => {
    const at = SETUP.indexOf("const rowTargetDraft: MouthFormDraft = {");
    expect(at, "le brouillon dérivé de la ligne a disparu").toBeGreaterThan(0);
    expect(SETUP.slice(at, at + 400)).toContain("birthDate: date,");
  });

  it("⛔ ET ELLE N'ENTRE PAS DANS LA CLÉ DE SEMENCE", () => {
    // Sinon chaque frappe dans le champ date re-sème `targetDraft` et efface
    // le poids visé qu'on est en train de taper.
    const at = SETUP.indexOf("const targetSeed = ");
    expect(at, "la clé de semence a disparu").toBeGreaterThan(0);
    expect(SETUP.slice(at, at + 300)).not.toContain("date");
  });
});
