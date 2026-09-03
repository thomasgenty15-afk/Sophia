// CALORIE_REVERSAL §5, couche 4, CÔTÉ ÉCRAN — un kcal affiché porte sa base.
//
// ══ POURQUOI CETTE CEINTURE VIT DANS LE PACK i18n ════════════════════════
//
// Le harnais Deno prouve la propriété sur le texte que le SERVEUR rend
// (`no_calorie_to_student_property_test.ts`, couche 4). L'écran est un second
// rendu, et il a son propre chemin: `TodayPage` relit `recognized` et compose
// sa ligne à partir d'une clé i18n.
//
// La garantie structurelle choisie est que **la base est DANS la clé**: la
// phrase est nommée par la base (`photo.energy.<basis>`) et interpole le nombre
// à l'intérieur. Il n'existe donc pas de chemin où le nombre s'affiche et la
// base non — ce sont le même message. Ce fichier éprouve exactement ça, dans
// les DEUX langues, parce qu'une propriété transverse qui ne regarde que
// l'anglais devient verte-et-aveugle le jour où le produit répond en français.

import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";

/** Les deux bases, et il n'y en a pas de troisième (`EnergyBasis`). */
const BASES = ["photo_estimate", "declared_quantities"] as const;

describe("un kcal affiché porte sa base", () => {
  for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
    it(`${name}: chaque phrase d'énergie porte le nombre ET sa base`, () => {
      for (const basis of BASES) {
        const line = pack[`photo.energy.${basis}` as keyof typeof pack] as string;
        // ① le trou du nombre est là — sinon les assertions suivantes seraient
        //    vraies sur une phrase qui n'affiche rien.
        expect(line, `${name}/${basis}`).toContain("{kcal}");
        expect(line, `${name}/${basis}`).toContain("kcal");
        // ② et la phrase dit d'où vient le chiffre, dans la même chaîne.
        const marker = basis === "photo_estimate"
          ? (name === "fr" ? "photo" : "photo")
          : (name === "fr" ? "quantités" : "quantities");
        expect(line.toLowerCase(), `${name}/${basis}`).toContain(marker);
      }
    });

    it(`${name}: la base DEVINÉE et la base DÉCLARÉE ne se disent pas pareil`, () => {
      // Les rendre identiques habillerait une estimation à −26,6 % de biais
      // avec la fiabilité d'un calcul à 2,3 % de MAPE. C'est le mensonge exact
      // que ce chantier existe pour empêcher, et il serait invisible.
      expect(pack["photo.energy.photo_estimate"])
        .not.toEqual(pack["photo.energy.declared_quantities"]);
    });

    it(`${name}: la note de bas de panneau ne contredit pas un chiffre affiché`, () => {
      // « une photo me dit quoi, pas combien » est vrai TANT QU'aucun chiffre
      // n'est affiché. La seconde note la remplace dès qu'il y en a un, et elle
      // dit la DIRECTION du biais: sans direction, on laisse croire à une
      // erreur symétrique, alors qu'elle est systématiquement flatteuse.
      const withEstimate = pack["photo.no_quantity_note_estimate"].toLowerCase();
      expect(withEstimate).not.toEqual(pack["photo.no_quantity_note"].toLowerCase());
      expect(withEstimate).toContain(name === "fr" ? "tirent vers le bas" : "run low");
    });
  }

  /**
   * LES CLÉS QUI ONT LE DROIT D'ÉCRIRE UN CHIFFRE D'ÉNERGIE, NOMMÉES.
   *
   * ⚠️ CE N'EST PAS UNE LISTE D'EXCEPTIONS, C'EST L'INVENTAIRE DES DEUX BASES.
   * Le produit affiche des kcal à deux titres, et les deux portent la leur:
   *
   *   · `photo.energy.*` ......... base `photo_estimate` / `declared_quantities`
   *     (ce chantier, CALORIE_REVERSAL);
   *   · `mealprep.energy.range_*` .. base `weight_range` /
   *     `weight_range_with_direction` — ce qu'un CORPS dépense, pas ce qu'une
   *     assiette contient (`ENERGY_TARGET_BASES`);
   *   · tout le reste ci-dessous . base `plan_quantities` — les quantités que le
   *     produit a lui-même ÉCRITES dans le plan, recalculées en grammes (MAPE
   *     2,3 %). C'est FF-059, et sa base est épinglée côté serveur par
   *     `PLAN_ENERGY_BASIS`, gardée par les quatre portes et par la couche 4 du
   *     harnais Deno.
   *
   * Une clé neuve qui écrit un kcal tombe ici, et c'est le but: il faut alors
   * dire À QUELLE BASE elle appartient, au lieu d'ajouter un chiffre nu de plus.
   */
  /**
   * ⚠️ LA TROISIÈME CATÉGORIE, ET ELLE N'EST PAS UNE BASE. Un message qui
   * REFUSE un chiffre nomme des BORNES DE PLAUSIBILITÉ (« un repas doit être
   * entre 1 et 5 000 kcal »): il ne rapporte aucune lecture, donc il n'a pas
   * de base à porter — exiger qu'il en cite une l'obligerait à mentir.
   *
   * Elle est listée à part plutôt que fondue dans l'inventaire ci-dessous:
   * fondues, on ne saurait plus dire quelles clés RAPPORTENT un chiffre et
   * lesquelles en refusent un, et c'est la première question qu'on se pose en
   * relisant.
   */
  const ENERGY_KEYS_THAT_REFUSE = ["chat.kcalfix.error.range"];

  const ENERGY_KEYS_WITH_A_BASIS = [
    "coach.student.numbers.maintenance_value",
    "household.mouth.shaker_summary",
    // ⚠️ LA VITRINE — base `weight_range` / `weight_range_with_direction`
    // (`ENERGY_TARGET_BASES`, `_shared/keel/energy_target.ts`). C'est la
    // TROISIÈME base du produit, et la seule qui parle d'un CORPS plutôt que
    // d'une assiette: `/meal-prep` montre la fourchette qu'un poids et un cran
    // d'activité dépensent, déplacée par l'objectif.
    // Les deux clés sont nommées PAR leur base, comme `photo.energy.*` — donc
    // il n'existe aucun chemin où le nombre s'affiche sans elle.
    // ⚠️ `mealprep.energy.moved_down` était dans cette liste et en est SORTIE
    // le 2026-09-01: elle citait « 500 kcal » (le plafond de déficit) dans une
    // clé qui ne porte pas de base. Le plafond y est maintenant dit en mots.
    "mealprep.energy.range_directed",
    "mealprep.energy.range_weight",
    "meals.energy.day",
    "meals.energy.day_partial",
    "meals.energy.day_with_addon",
    "meals.energy.dish",
    ...BASES.map((b) => `photo.energy.${b}`),
    ...ENERGY_KEYS_THAT_REFUSE,
  ].sort();

  it("un message qui REFUSE un chiffre ne prétend à aucune base", () => {
    // Le cas qui passe pour la catégorie du dessus: la phrase parle de bornes,
    // et elle ne doit citer ni « photo » ni « quantités ».
    for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
      for (const key of ENERGY_KEYS_THAT_REFUSE) {
        const value = (pack as Record<string, string>)[key];
        expect(value, `${name}/${key}`).toBeTruthy();
        for (const basis of BASES) {
          expect(
            value.toLowerCase(),
            `${name}/${key} emprunte les mots de ${basis}`,
          ).not.toContain(
            (pack as Record<string, string>)[`photo.energy.${basis}`]
              .split("{kcal}")[1].trim().slice(0, 12).toLowerCase(),
          );
        }
      }
    }
  });

  it("l'inventaire des clés qui écrivent un kcal est CLOS", () => {
    // ⛔ LA MOITIÉ NÉGATIVE, ET C'EST ELLE QUI TIENT DANS LE TEMPS. La couche 4
    // ne vaut rien si un second endroit de l'app peut écrire un nombre
    // d'énergie sans que personne ne se demande d'où il vient.
    const found = new Set<string>();
    for (const pack of [en, fr]) {
      for (const [key, value] of Object.entries(pack)) {
        if (typeof value !== "string") continue;
        // Un CHIFFRE à côté du mot, ou le trou qui en portera un. « riche en
        // protéines » reste licite et doit le rester: un pack qui bannirait le
        // vocabulaire forcerait le produit à être muet plutôt qu'honnête.
        if (/(\d|\{\w+\})\s*(kcal|calories?)\b/i.test(value)) found.add(key);
      }
    }
    expect([...found].sort()).toEqual(ENERGY_KEYS_WITH_A_BASIS);
  });

  it("dans le namespace PHOTO, seules les deux clés de base écrivent un chiffre", () => {
    // La contrainte propre à CE chantier, plus étroite que l'inventaire
    // ci-dessus: le chemin photo n'a que deux phrases autorisées, et un
    // troisième libellé `photo.*` qui écrirait un kcal serait, lui, un chiffre
    // qui a échappé à `photoEnergyLine`.
    const allowed = new Set(BASES.map((b) => `photo.energy.${b}`));
    const offenders: string[] = [];
    for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
      for (const [key, value] of Object.entries(pack)) {
        if (!key.startsWith("photo.") || allowed.has(key)) continue;
        if (typeof value !== "string") continue;
        if (/(\d|\{\w+\})\s*(kcal|calories?)\b/i.test(value)) {
          offenders.push(`${name}/${key}: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
