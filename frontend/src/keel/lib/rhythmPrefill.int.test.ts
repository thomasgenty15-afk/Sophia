import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { rhythmPrefillFor, rhythmPrefillLatches } from "./rhythmPrefill";
import type { EatingOccasion, EatingOccasionSlot } from "../api/mealGeneration";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { eatingStructureFor } from "../../../../supabase/functions/_shared/keel/eating_structure.ts";

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

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
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

  it("⛔ LE VERROU DU PLANCHER NE MORD QU'À L'ÉGALITÉ", () => {
    // `<=` redeviendrait invisible en fiche neuve maintenant que la pré-coche
    // repart à l'égalité: il ne mordrait qu'après le PREMIER décochage,
    // c'est-à-dire chez la personne qui essaie de corriger la proposition.
    //
    // ⚠️ ON MESURE `floorBinds`, ET SEULEMENT LUI. `floorSpeaks` porte un `<=`
    // parfaitement juste — la phrase se dit tant qu'on est AU PLUS au compte —
    // et un grep large sur `tickedCount <=` confondrait les deux, donc
    // interdirait une ligne correcte. Le test s'est cassé exactement là.
    const binds = DIALOG.slice(
      DIALOG.indexOf("const floorBinds ="),
      DIALOG.indexOf(";", DIALOG.indexOf("const floorBinds =")),
    );
    expect(binds, "le verrou a disparu").toMatch(/tickedCount === floorCount/);
    expect(binds, "le `<=` est revenu sur le VERROU").not.toMatch(/tickedCount <=/);
  });
});

// ===========================================================================
// ⟳ 2026-09-08 (soir) — UNE PHRASE PAR ÉTAT, ET CHACUNE NE PROMET QUE LE GESTE
// QUI EXISTE.
//
// ⛔ LE DÉFAUT QUE CE BLOC FERME, SIGNALÉ MOT POUR MOT: « on peut pas décocher
// les repas imposés ». Trois phrases s'empilaient sous les six cases — le
// chiffre trois fois, « cochés » trois fois — et les deux premières invitaient
// à DÉCOCHER pendant que la troisième expliquait que les cases sont tenues.
// C'est la cicatrice du bouton mort prise par l'autre bout: on ne cache pas le
// refus, on promet son contraire.
// ===========================================================================

const LOCKED = ["household.mouth.rhythm_floor_locked", "household.mouth.rhythm_floor_locked_you"] as const;
const FREE = ["household.mouth.rhythm_derived", "household.mouth.rhythm_derived_you"] as const;

describe("une phrase par état, et jamais les deux", () => {
  it("⛔ L'ÉTAT LIBRE PROPOSE DE RETIRER, ET SEULEMENT ÇA", () => {
    for (const key of FREE) {
      expect(fr[key], `fr · ${key}`).toMatch(/décoche/i);
      expect(en[key], `en · ${key}`).toMatch(/untick/i);
    }
  });

  it("⛔ L'ÉTAT TENU NE PROPOSE JAMAIS DE RETIRER — c'est le défaut signalé", () => {
    // La garde du lot. Une phrase qui dit « décoche » sur des cases grisées
    // envoie quelqu'un buter contre un contrôle désactivé.
    for (const key of LOCKED) {
      expect(fr[key], `fr · ${key} invite à décocher`).not.toMatch(/décoche/i);
      expect(en[key], `en · ${key} invite à décocher`).not.toMatch(/untick/i);
    }
  });

  it("⛔ ET IL NOMME LA SORTIE: ajouter", () => {
    // Une case grise sans issue est un bouton mort — cicatrice mesurée trois
    // fois sur cet écran. La sortie est le seul geste possible: en cocher un
    // de plus.
    for (const key of LOCKED) {
      expect(fr[key], `fr · ${key}`).toMatch(/ajoute/i);
      expect(en[key], `en · ${key}`).toMatch(/add/i);
    }
  });

  it("⛔ ET IL PORTE LE POURQUOI, puisque la phrase autonome a disparu", () => {
    expect(fr["household.mouth.rhythm_floor_locked"]).toMatch(/une assiette ne peut pas tout porter/i);
    expect(en["household.mouth.rhythm_floor_locked"]).toMatch(/one plate can only hold so much/i);
    // ⛔ `rhythm_derived_why` N'EXISTE PLUS: elle se servait dans les deux
    // états, dont celui où elle n'expliquait rien de contraignant.
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
    for (const key of [...FREE, ...LOCKED]) {
      for (const [lang, pack] of [["fr", fr], ["en", en]] as const) {
        const words = pack[key].split(/\s+/).length;
        expect(words, `${lang} · ${key} fait ${words} mots`).toBeLessThanOrEqual(30);
      }
    }
  });

  it("⛔ ET L'ÉCRAN N'EN REND QU'UNE — l'empilement ne revient pas", () => {
    // La contradiction ne venait pas des mots, elle venait du `+`. Le rendu
    // choisit donc, il ne concatène plus.
    const block = DIALOG.slice(DIALOG.indexOf("{floorSpeaks"), DIALOG.indexOf("LE SHAKER COMPOSÉ"));
    expect(block).toMatch(/floorBinds\s*\?\s*"household\.mouth\.rhythm_floor_locked"/);
    expect(block, "les deux phrases se concatènent encore")
      .not.toMatch(/rhythm_derived_why/);
  });

  it("⛔ ET LE VERROU A UNE VOIX: il ne tutoie plus la fiche d'un tiers", () => {
    // « Tu en as coché 4 » s'affichait sous le prénom de quelqu'un d'autre.
    expect(fr["household.mouth.rhythm_floor_locked"]).toMatch(/\{who\}/);
    expect(fr["household.mouth.rhythm_floor_locked_you"]).not.toMatch(/\{who\}/);
    expect(en["household.mouth.rhythm_floor_locked"]).toMatch(/\{who\}/);
    expect(en["household.mouth.rhythm_floor_locked_you"]).not.toMatch(/\{who\}/);
  });
});
