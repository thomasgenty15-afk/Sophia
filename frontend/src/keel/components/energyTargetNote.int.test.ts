// FF-059 LOT 4 (2026-09-01) — CE QUE LA FOURCHETTE **DIT**, ET DANS LES DEUX
// LANGUES.
//
// Ce que ces tests protègent, dans l'ordre de ce que ça coûte quand ça casse:
//
//   * LA PHRASE D'ENTRETIEN POSÉE SOUS UN DÉFICIT — « à peu près ce qu'un corps
//     de ta taille dépense » sous une fourchette qu'on vient de décaler est
//     fausse mot pour mot, et elle rassure sur une propriété qui n'existe plus.
//     C'est le pire des trois: une garde qui a survécu à sa cause;
//   * LA CLÉ ABSENTE D'UNE LANGUE — le produit sort en français par défaut
//     (`profiles.locale`), et une clé oubliée dans `fr.ts` rendrait la clé BRUTE
//     à l'écran, sous un chiffre de calories. Cicatrice « garde testée dans une
//     seule langue »;
//   * LA PHRASE RECOPIÉE — deux clés distinctes qui portent le même texte
//     seraient un lot désarmé qui ressemble à un lot qui marche: la direction
//     voyagerait, changerait de clé, et ne changerait rien à l'écran.
//
// ⚠️ POURQUOI DES CLÉS ET PAS UN RENDU. Ce dépôt n'a aucun harnais de rendu
// front — ni testing-library, ni jsdom, ni un seul `.test.tsx`. Les deux
// décisions sont donc EXTRAITES du JSX (`energyTargetRangeKey`,
// `energyTargetNoteKey`) et un test lit la SOURCE du composant pour prouver
// qu'il les appelle vraiment, au lieu de porter ses propres littéraux.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  energyTargetNoteKey,
  energyTargetRangeKey,
} from "./plan/EnergyReadout";
import { ENERGY_TARGET_DIRECTIONS } from "../api/mealEnergy";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

const COMPONENT_SOURCE = readFileSync(
  fileURLToPath(new URL("./plan/EnergyReadout.tsx", import.meta.url)),
  "utf8",
);

describe("FF-059 lot 4 — la phrase suit la direction", () => {
  it("chaque direction a SA phrase, et l'absence garde celle d'hier", () => {
    expect(energyTargetRangeKey("down")).toBe("meals.energy.target_range_down");
    expect(energyTargetRangeKey("up")).toBe("meals.energy.target_range_up");
    // ⚠️ LE REPLI EST LE COMPORTEMENT D'AVANT CE CHAMP, pas un silence: la
    // phrase de maintenance était vraie hier et le reste.
    expect(energyTargetRangeKey(null)).toBe("meals.energy.target_range");
  });

  it("la NOTE bascule avec le nombre, et pas seulement la phrase du haut", () => {
    // ⛔ LE DÉFAUT LE PLUS DISCRET DU LOT. Si la note ne suivait pas, l'écran
    // dirait « Autour de 2 300–2 750 pour perdre à ton rythme » puis, deux
    // lignes plus bas, « à peu près ce qu'un corps de ta taille dépense » —
    // c'est-à-dire la définition de l'ENTRETIEN sous un déficit.
    expect(energyTargetNoteKey(null)).toBe("meals.energy.target_note");
    for (const direction of ENERGY_TARGET_DIRECTIONS) {
      expect(energyTargetNoteKey(direction)).toBe(
        "meals.energy.target_note_directed",
      );
    }
  });

  it("toutes les clés existent DANS LES DEUX packs, et ne sont pas vides", () => {
    const keys = [
      ...ENERGY_TARGET_DIRECTIONS.map(energyTargetRangeKey),
      energyTargetRangeKey(null),
      ...ENERGY_TARGET_DIRECTIONS.map(energyTargetNoteKey),
      energyTargetNoteKey(null),
    ];
    for (const key of keys) {
      expect(en[key], `absente de en.ts: ${key}`).toBeTruthy();
      expect(fr[key], `absente de fr.ts: ${key}`).toBeTruthy();
    }
  });

  it("les deux gabarits de fourchette gardent {low} et {high}", () => {
    // Un gabarit qui perdrait un jeton rendrait « Autour de {low}–2 750 » à
    // l'écran, sous un chiffre de calories, dans une seule des deux langues.
    for (const direction of [null, ...ENERGY_TARGET_DIRECTIONS] as const) {
      const key = energyTargetRangeKey(direction);
      for (const [lang, pack] of [["en", en], ["fr", fr]] as const) {
        expect(pack[key], `${lang}/${key}`).toContain("{low}");
        expect(pack[key], `${lang}/${key}`).toContain("{high}");
      }
    }
  });

  it("les phrases dirigées ne sont pas des COPIES de celle d'entretien", () => {
    // ⛔ Deux clés distinctes portant le même texte: la direction voyagerait,
    // changerait de clé, et ne changerait RIEN à l'écran. Un lot désarmé qui
    // ressemble trait pour trait à un lot qui marche.
    for (const [lang, pack] of [["en", en], ["fr", fr]] as const) {
      const neutral = pack["meals.energy.target_range"];
      for (const direction of ENERGY_TARGET_DIRECTIONS) {
        expect(pack[energyTargetRangeKey(direction)], `${lang}/${direction}`)
          .not.toBe(neutral);
      }
      expect(pack["meals.energy.target_note_directed"], lang)
        .not.toBe(pack["meals.energy.target_note"]);
    }
  });

  it("la note d'entretien ne promet plus que le plan ne vise pas la cible", () => {
    // ⛔ CORRECTION DE FAIT, PAS DE TON. « ton plan n'est pas construit pour
    // l'atteindre » est FAUX depuis le 2026-08-18: la cible contraint les
    // GRAMMAGES (`household_portions.ts`, lot L8). La phrase est restée à
    // l'écran en promettant le contraire de ce que le moteur faisait.
    expect(fr["meals.energy.target_note"]).not.toContain("construit pour");
    expect(en["meals.energy.target_note"]).not.toContain("not built to hit");
    // Et ce qui RESTE vrai doit rester dit: ce n'est pas un objectif.
    expect(fr["meals.energy.target_note"]).toContain("pas un objectif");
    expect(en["meals.energy.target_note"]).toContain("not a goal");
  });

  it("AUCUNE phrase de ce chemin ne porte un reste", () => {
    // « Il te reste 680 kcal » est LA phrase d'un tracker, et elle n'existe sur
    // aucun chemin de ce produit — y compris les phrases neuves du lot 4.
    const forbidden = ["il te reste", "il reste", "left today", "kcal left", "remaining"];
    const keys = [
      "meals.energy.target_range",
      "meals.energy.target_range_down",
      "meals.energy.target_range_up",
      "meals.energy.target_note",
      "meals.energy.target_note_directed",
    ] as const;
    for (const key of keys) {
      for (const [lang, pack] of [["en", en], ["fr", fr]] as const) {
        const text = String(pack[key]).toLowerCase();
        for (const word of forbidden) {
          expect(text.includes(word), `${lang}/${key} contient « ${word} »`).toBe(false);
        }
      }
    }
  });

  it("le composant APPELLE les deux choix, il ne recopie aucune clé", () => {
    // ⚠️ SANS CE TEST, LES SIX AU-DESSUS SERAIENT VRAIS ET INUTILES: un
    // composant qui aurait gardé ses littéraux en ligne les laisserait tous
    // verts pendant qu'il rend la mauvaise phrase.
    //
    // ⟳ 2026-09-10 · LOT 3 — L'ARGUMENT N'EST PLUS `target.direction` NU, et
    // c'est le sujet du cas suivant: il passe par `paceMissing`, qui rabat la
    // direction sur `null` quand le rythme n'a pas pu être calculé. La
    // propriété gardée ici est INCHANGÉE — l'appel passe par les deux
    // fonctions de choix, aucun littéral n'est posé en ligne.
    expect(COMPONENT_SOURCE).toMatch(/energyTargetRangeKey\(\s*paceMissing \? null : target\.direction,?\s*\)/);
    expect(COMPONENT_SOURCE).toContain(
      "energyTargetNoteKey(paceMissing ? null : target.direction)",
    );
    // Et les clés dirigées n'apparaissent QUE dans les deux fonctions de choix:
    // une occurrence ailleurs serait un second point de décision.
    for (const key of ["meals.energy.target_range_down", "meals.energy.target_range_up"]) {
      const count = COMPONENT_SOURCE.split(key).length - 1;
      expect(count, `${key} apparaît ${count} fois dans le composant`).toBe(1);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 · LOT 3 — UN RYTHME QUI NE S'EXÉCUTE PAS NE S'ANNONCE PAS
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT, MESURÉ CÔTÉ SERVEUR: sans taille, la cible passe par le
  // raccourci au poids — une fourchette SORT — pendant que l'entretien du
  // rythme rend `null`, donc l'écart vaut ZÉRO. L'écran annonçait « pour perdre
  // à ton rythme » au-dessus de nombres d'entretien: l'objectif de la personne
  // était annulé sans un mot.

  it("`paceMissing` est lu de `target.paceUnavailable`, et il rabat la direction", () => {
    // ⚠️ LA PRÉMISSE, ARMÉE: le motif est bien LU du champ, pas d'un état
    // d'écran. Sans cette ligne, le rabattement pourrait porter sur n'importe
    // quoi et les deux `toMatch` du dessus resteraient verts.
    expect(COMPONENT_SOURCE).toContain(
      "const paceMissing = target.paceUnavailable !== null;",
    );
  });

  it("⚠️ ET LE MOTIF SE DIT — sinon le rabattement est un silence de plus", () => {
    // ⛔ LE CAS QUI PASSE, ET IL EST LA MOITIÉ QUI COMPTE. Retomber sur la
    // phrase du poids sans rien dire remplacerait un énoncé faux par un énoncé
    // muet: la personne verrait sa fourchette cesser de parler de son objectif,
    // sans jamais savoir pourquoi ni quoi faire.
    expect(COMPONENT_SOURCE).toContain("meals.energy.target_pace_missing_body");
    for (const [lang, pack] of [["en", en], ["fr", fr]] as const) {
      const text = String(pack["meals.energy.target_pace_missing_body"]);
      expect(text.length, `${lang}: la phrase est vide`).toBeGreaterThan(0);
      // ⛔ ELLE NOMME LA DONNÉE QUI MANQUE. Un motif qui ne dit pas quoi faire
      // est un mur muet — cicatrice « refus loin du geste » de `SetupPage`.
      expect(
        /height|taille/i.test(text),
        `${lang}: la phrase ne nomme pas la donnée qui manque`,
      ).toBe(true);
      // ⛔ ET ELLE N'ANNONCE AUCUN RESTE. Même interdit que les cinq clés
      // du cas « AUCUNE phrase de ce chemin ne porte un reste ».
      for (const word of ["il te reste", "left today", "remaining"]) {
        expect(text.toLowerCase().includes(word), `${lang} contient « ${word} »`)
          .toBe(false);
      }
    }
  });
});
