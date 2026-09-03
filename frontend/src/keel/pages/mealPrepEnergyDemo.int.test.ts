// KEEL — LA DÉMO D'ÉNERGIE DE `/meal-prep` DIT-ELLE LE MÊME NOMBRE QUE LE
// MOTEUR ?
//
// ── CE QUE CE FICHIER EMPÊCHE, ET C'EST DÉJÀ ARRIVÉ ICI ────────────────────
// Une page de vente qui calcule quelque chose se met à diverger du produit le
// jour où le produit bouge, et personne ne le voit: la page continue de rendre
// un nombre plausible. Ce dépôt a déjà payé exactement ça sur les CONSIGNES de
// service — `/meal-prep` et `/couples` affichaient deux traductions
// différentes de la même consigne du moteur, et la garde qui devait l'attraper
// ne lisait que le pack anglais.
//
// ── CE QUE `demoTarget` A LE DROIT DE FAIRE, ET RIEN DE PLUS ───────────────
// Elle APPELLE `maintenanceRange` puis `directedRange`. Elle ne réimplémente ni
// le décalage, ni son arrondi, ni le refus au plancher. La seule chose qu'elle
// décide est l'ÉCART QUOTIDIEN — parce que dans le produit il vient du rythme
// choisi par la personne, et qu'une page de vente n'a pas de rythme à demander.
// Les tests ci-dessous vérifient les deux moitiés séparément: que l'enveloppe
// est celle du moteur, et que l'écart est bien borné par les plafonds du
// moteur.

import { describe, expect, it } from "vitest";

import {
  directedRange,
  maintenanceRange,
} from "../../../../supabase/functions/_shared/keel/energy_target.ts";
import {
  MAX_DAILY_DEFICIT_KCAL,
  MAX_SURPLUS_FRACTION,
} from "../../../../supabase/functions/_shared/keel/meal_envelope.ts";
import { energyFloorFor } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";
import { ACTIVITY_LEVELS } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import { demoTarget, DEMO_WEIGHT_MAX, DEMO_WEIGHT_MIN } from "./MealPrepPage";

/**
 * Les poids balayés. Les deux bornes du curseur de la page, plus trois valeurs
 * au milieu — dont une qui ne tombe PAS sur un multiple de 50 après
 * multiplication, pour que l'arrondi soit réellement exercé.
 */
const WEIGHTS = [DEMO_WEIGHT_MIN, 61, 72, 97, DEMO_WEIGHT_MAX];

describe("la fourchette montrée par `/meal-prep`", () => {
  it("à objectif neutre, est EXACTEMENT celle du moteur", () => {
    // La ceinture de la ceinture: si `ACTIVITY_LEVELS` rendait un tableau vide,
    // la boucle ne s'exécuterait pas et le test verdirait sur zéro comparaison.
    expect(ACTIVITY_LEVELS.length).toBeGreaterThan(0);

    for (const level of ACTIVITY_LEVELS) {
      for (const weightKg of WEIGHTS) {
        const engine = maintenanceRange({
          weightKg,
          weightWeekStart: null,
          activityLevel: level,
        });
        expect(engine.range, `le moteur n'a pas de fourchette pour ${weightKg} kg`)
          .not.toBeNull();
        expect(
          demoTarget(weightKg, level, "maintenance").range,
          `${level} à ${weightKg} kg: la page et le moteur divergent`,
        ).toEqual(engine.range);
      }
    }
  });

  it("rend la fourchette de l'ignorance quand aucun cran n'est choisi", () => {
    // `activityLevel: null` est le cas nominal de toute la base existante, et
    // c'est celui dont la LARGEUR est l'argument du panneau « Hypothèses »
    // (« cette largeur est l'aveu qu'on ne sait pas »).
    for (const weightKg of WEIGHTS) {
      const engine = maintenanceRange({
        weightKg,
        weightWeekStart: null,
        activityLevel: null,
      });
      expect(demoTarget(weightKg, null, "maintenance").range).toEqual(engine.range);
    }
  });

  /**
   * ⚠️ LE TEST QUI EXISTE PARCE QUE LE DÉFAUT A ÉTÉ VU À L'ÉCRAN.
   *
   * La première version de la démonstration montrait la fourchette d'entretien
   * quel que soit l'objectif: on choisissait « perdre du gras » et le nombre ne
   * bougeait pas. Une démonstration qui contredit la phrase qu'elle illustre
   * vaut moins que pas de démonstration.
   */
  it("descend sur une perte, monte sur une prise, et les trois diffèrent", () => {
    for (const weightKg of WEIGHTS) {
      const keep = demoTarget(weightKg, "on_feet", "maintenance").range!;
      const down = demoTarget(weightKg, "on_feet", "fat_loss").range!;
      const up = demoTarget(weightKg, "on_feet", "muscle_gain").range!;

      // La prise monte toujours: son plafond est une FRACTION de l'entretien,
      // donc il ne peut pas être nul pour un corps qui mange.
      expect(up.low, `${weightKg} kg: la prise ne monte pas`).toBeGreaterThan(keep.low);
      // ⚠️ LA PERTE NE DESCEND PAS TOUJOURS, ET CE TEST A CORRIGÉ MA LECTURE.
      // À 45 kg « debout », l'entretien est 1 250–1 400 et le plancher 1 350:
      // l'écart exécutable tombe à zéro AVANT tout décalage, et `directedRange`
      // rend alors `no_pace` — pas `below_energy_floor`, qui n'est atteint que
      // si un décalage NON NUL aurait percé le plancher. Les deux motifs
      // existent, ils ne sont pas interchangeables, et la page les traite
      // ensemble parce qu'ils disent la même chose au lecteur.
      const shifted = demoTarget(weightKg, "on_feet", "fat_loss");
      if (shifted.direction === null) {
        expect(down, `${weightKg} kg: un refus doit rendre l'entretien intact`).toEqual(keep);
        expect(
          shifted.directionGap,
          `${weightKg} kg: un refus doit être NOMMÉ, jamais un silence`,
        ).not.toBeNull();
      } else {
        expect(down.low, `${weightKg} kg: la perte ne descend pas`).toBeLessThan(keep.low);
      }
      // Et dans tous les cas, l'ordre que la page promet au lecteur: perdre ne
      // lit jamais plus que prendre.
      expect(down.low, `${weightKg} kg: perdre doit lire moins que prendre`)
        .toBeLessThan(up.low);
    }
  });

  it("borne l'écart par les plafonds du moteur, pas par un nombre à elle", () => {
    // ⚠️ CE QUI ANCRE L'HYPOTHÈSE DE RYTHME. La page choisit l'écart — c'est sa
    // seule liberté — mais il doit être celui que `executedPaceFor` accepterait
    // d'exécuter au plus vite. Changer `MAX_DAILY_DEFICIT_KCAL` ou
    // `MAX_SURPLUS_FRACTION` déplace l'attente ET la page; recopier l'un des
    // deux dans la page casse ici.
    const floor = energyFloorFor(null);
    for (const weightKg of WEIGHTS) {
      const keep = maintenanceRange({ weightKg, weightWeekStart: null, activityLevel: "on_feet" });
      const mid = (keep.range!.low + keep.range!.high) / 2;

      const expectedUp = directedRange({
        maintenance: keep,
        direction: "up",
        dailyDeltaKcal: mid * MAX_SURPLUS_FRACTION,
        energyFloorKcal: floor,
        cancelled: null,
      });
      expect(demoTarget(weightKg, "on_feet", "muscle_gain").range).toEqual(expectedUp.range);

      const expectedDown = directedRange({
        maintenance: keep,
        direction: "down",
        dailyDeltaKcal: Math.max(0, Math.min(MAX_DAILY_DEFICIT_KCAL, mid - floor)),
        energyFloorKcal: floor,
        cancelled: null,
      });
      expect(demoTarget(weightKg, "on_feet", "fat_loss").range).toEqual(expectedDown.range);
    }
  });

  it("ne DÉPLACE jamais une fourchette sous le plancher d'énergie", () => {
    // ⚠️ LA PROPRIÉTÉ PORTE SUR LE DÉCALAGE, PAS SUR L'ENTRETIEN — et ce test
    // a corrigé ma lecture. À 45 kg « assis toute la journée », l'entretien
    // vaut déjà 1 150–1 300, sous le plancher de 1 350: c'est ce que ce corps
    // DÉPENSE, et le moteur n'a jamais prétendu le remonter. Ce que le plancher
    // interdit, c'est de PRESCRIRE moins. On ne vérifie donc la borne que là où
    // un décalage a réellement eu lieu.
    const floor = energyFloorFor(null);
    let shiftedCases = 0;
    for (let weightKg = DEMO_WEIGHT_MIN; weightKg <= DEMO_WEIGHT_MAX; weightKg++) {
      for (const level of ACTIVITY_LEVELS) {
        const target = demoTarget(weightKg, level, "fat_loss");
        if (target.direction === null || target.range === null) continue;
        shiftedCases++;
        expect(target.range.low, `${level} à ${weightKg} kg: prescrit sous le plancher`)
          .toBeGreaterThanOrEqual(floor);
      }
    }
    // La ceinture de la ceinture: si aucun cas n'était décalé, la boucle
    // ci-dessus ne vérifierait rien et le test verdirait sur du vide.
    expect(shiftedCases, "aucun décalage exercé — le test ne regarde rien").toBeGreaterThan(0);
  });
});
