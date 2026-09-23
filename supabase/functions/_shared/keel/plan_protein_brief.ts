/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PLANCHER PROTÉIQUE, DIT AU MODÈLE **AVANT** LA PREMIÈRE GÉNÉRATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, ET IL EST MESURÉ SUR LA CAMPAGNE DU
 * 2026-09-11 (`docs/keel/CAMPAGNE-SIX-TIRS-2026-09-11.md`). **Quatre tirs sur
 * six** sortent sous le plancher protéique de leur bouche :
 *
 *   · tir 1 — −42 % et −43 % (deux journées) ;
 *   · tir 3 — −24 % et −18 % ;
 *   · tir 5 — −39 % et −30 % ;
 *   · tir 6 — −32 % sur le premier jour.
 *
 * La garde finale les COMPTE (`protein_floor_short`, `final_plan_gate.ts`) et
 * la livraison reste `deliverable_with_gaps`. Le nombre existait donc, et il
 * n'atteignait le modèle **à aucun moment** : ni avant qu'il compose, ni après.
 * Le prompt ne portait qu'une DENSITÉ par moment — une grandeur d'énergie, qui
 * ne dit rien de la protéine — et la ligne « a starch, a protein, a fat » du
 * bloc de recette, qui est exactement la « phrase vague » que le plan de
 * clôture interdit d'employer « comme substitut à la cible numérique
 * disponible » (§ C4, point 2).
 *
 * ── ⛔ AUCUN NOUVEAU BARÈME ───────────────────────────────────────────────
 * Rien n'est inventé ici. Les deux entrées viennent telles quelles de
 * `meal_envelope.ts::envelopeFor` (`proteinFloorG`, `proteinPerMealG`) et la
 * part couverte de `final_plan_audit.ts::proteinFloorAllocation` — **la même
 * fonction que la garde finale**, pour que la consigne et le contrôle ne
 * puissent pas diverger. Le seul calcul propre à ce fichier est une RÈGLE DE
 * TROIS : répartir le plancher de la journée couverte sur les cases couvertes
 * **au prorata de leur `composeKcal`**, c'est-à-dire exactement la clé que le
 * contrat utilise déjà pour l'énergie (`slot_nutrition_contract.ts`). Une
 * seconde clé de répartition serait un second barème ; celle-ci n'en est pas un.
 *
 * ── ⛔ ET LES PROTECTIONS INDIVIDUELLES NE BOUGENT PAS ────────────────────
 * Une enveloppe `per_portion` (plancher TCA, mineur protégé) rend
 * `dayFloorG: null` : `proteinFloorAllocation` répond `protected`, et ce module
 * **ne produit aucune ligne**. Aucun chiffre protéique ne paraît en face du nom
 * d'une bouche protégée — la même règle que `RequiredDensity.floorOnly`, pour
 * la même raison.
 *
 * ⚠️ CE MODULE NE PARLE À PERSONNE. PURE: no I/O, no clock, no randomness.
 */

import { proteinFloorAllocation } from "./final_plan_audit.ts";
import type { ProteinFloorReason } from "./final_plan_audit.ts";

/**
 * POURQUOI UNE BOUCHE N'A PAS DE LIGNE PROTÉIQUE. ⛔ VOCABULAIRE FERMÉ, et
 * chaque motif est COMPTÉ : « une valeur absente reste inconnue, jamais zéro »,
 * et une abstention muette est indiscernable d'un plancher atteint.
 */
export const PROTEIN_BRIEF_SILENCES = [
  /** L'enveloppe protège cette bouche : aucun chiffre en face de son nom. */
  "protected",
  /** Pas de corps lisible : on ne sait pas ce que cette bouche doit. */
  "no_body",
  /** Le contrat ne sait pas quelle part de la journée le plan couvre. */
  "coverage_unknown",
  /** Aucune case couverte à qui donner la part. */
  "no_covered_slot",
  /**
   * ⛔ LA PART EST CONNUE, SA RÉPARTITION NON. Au moins une case couverte n'a
   * pas de `composeKcal` : répartir au prorata d'un dénominateur troué
   * donnerait à l'autre case la protéine de celle qu'on ne sait pas peser.
   */
  "spread_unknown",
] as const;
export type ProteinBriefSilence = (typeof PROTEIN_BRIEF_SILENCES)[number];

/** Ce qu'une case couverte doit porter, en grammes de protéine, pour UNE part. */
export interface ProteinSlotAsk {
  readonly slot: string;
  /** Les jetons de jour que cette ligne couvre. Jamais vide. */
  readonly days: readonly string[];
  /** Grammes de protéine dans UNE part servie ici. Entier. */
  readonly gramsPerServing: number;
  /**
   * ⟳ 2026-09-20 — LE PLUS QU'UNE PART PEUT PORTER ICI, en grammes. `null`
   * quand aucune borne n'existe (bouche sans plafond et case non partagée).
   * Jamais sous `gramsPerServing`.
   */
  readonly gramsMax: number | null;
  /**
   * ⟳ 2026-09-21 — L'ÉNERGIE DE LA PART À LAQUELLE CES GRAMMES SE LISENT
   * (`composeKcal` de la case, arrondi à 5). ⛔ SANS ELLE, LE CHIFFRE N'A PAS
   * DE SENS: mesuré sur le plan `504f58a3`, le modèle écrivait une part de
   * 460 kcal à 48 g pour « 33 to 41 g », et le moteur la doublait pour
   * atteindre les 980 kcal de la case — 86 g servis. Le chiffre est une
   * DENSITÉ, et l'énergie à côté est ce qui la rend lisible.
   */
  readonly kcalPerServing: number;
}

export interface ProteinMouthBrief {
  readonly memberId: string;
  /** Les cases, groupées par moment quand leur nombre est identique. */
  readonly slots: readonly ProteinSlotAsk[];
  /**
   * Le minimum par repas principal quand l'enveloppe en porte un
   * (`envelope.proteinPerMealG` — senior, entraînement). `null` sinon.
   */
  readonly perMealFloorG: number | null;
  /** Renseigné ⇔ `slots` est vide. Dit POURQUOI on s'est tu. */
  readonly silence: ProteinBriefSilence | null;
  /** Ce que la part couverte a répondu, par date. Pour le journal. */
  readonly byDate: readonly {
    readonly date: string;
    readonly dayToken: string;
    readonly coveredFloorG: number | null;
    readonly reason: ProteinFloorReason;
  }[];
  /**
   * ⟳ 2026-09-20 — CE QUE LE PLAFOND DE LA TABLE A RETIRÉ AUX DEMANDES.
   * `slots` = cases où la demande a été bornée; `gramsRemoved` = la somme des
   * grammes retirés. Zéro partout quand aucune case n'est partagée.
   */
  readonly capped: { readonly slots: number; readonly gramsRemoved: number };
  /**
   * ⟳ 2026-09-21 — CE QUE LE PLANCHER DE LA TABLE A FAIT CÉDER AU PLAFOND DE
   * CETTE BOUCHE. Sur une case où le plancher d'une autre bouche est plus
   * dense que le plafond de celle-ci, la borne haute de sa carte suit la
   * table: `slots` = cases concernées, `grams` = ce que la borne dépasse son
   * propre plafond réparti. Zéro partout quand aucune table ne collisionne.
   */
  readonly ceilingYielded: { readonly slots: number; readonly grams: number };
}

/** Une bouche telle que le plafond de la table la lit. */
export interface SharedProteinMouth {
  readonly memberId: string;
  /** `proteinCeilingGFor` — `null` = cette bouche ne borne personne. */
  readonly ceilingG: number | null;
  /**
   * ⟳ 2026-09-21 — `envelope.proteinFloorG` — `null` = pas de plancher lisible.
   * ⛔ REQUIS, JAMAIS `?`: sans lui, le plafond de la bouche la plus énergique
   * borne la table SOUS le plancher de la bouche en perte, et celle-ci mange
   * à 1,1 g/kg pendant qu'on la croit servie (mesuré: 92 g demandés pour un
   * plancher de 108, quatre `protein_floor_short` sur quatre jours).
   */
  readonly floorG: number | null;
  readonly days: readonly {
    readonly dayToken: string;
    readonly slots: readonly {
      readonly slot: string;
      readonly composeKcal: number | null;
    }[];
  }[];
}

export interface SharedProteinCaps {
  /** `memberId` → (`dayToken|slot` → grammes maximum que SA carte réclame). */
  readonly byMember: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** Cases distinctes (`dayToken|slot`) vues sur la table. */
  readonly cells: number;
  /** Cases où au moins deux bouches mangent. */
  readonly shared: number;
  /** Cases partagées où une bouche plafonnable a produit une borne. */
  readonly constrained: number;
  /**
   * ⟳ 2026-09-21 — Cases partagées où le PLANCHER le plus exigeant à table
   * dépasse le plus petit plafond, et l'a emporté (`floorCells` les nomme).
   */
  readonly floorWins: number;
  /** Les cases (`dayToken|slot`) où le plancher a gagné. */
  readonly floorCells: ReadonlySet<string>;
}

/**
 * LE PLAFOND DE LA TABLE — 2026-09-20.
 *
 * ⛔ LE MÉCANISME QU'IL FERME, mesuré sur le plan `911994f7`: un plat partagé
 * n'a qu'UNE recette, et le moteur dimensionne chaque part à l'ÉNERGIE de sa
 * bouche. La protéine qu'une bouche reçoit vaut donc
 *
 *     densité de la recette (g/kcal) × énergie de sa part
 *
 * et la densité est celle que la carte la plus exigeante a réclamée: 144 g
 * sur 2 192 kcal pour l'homme en perte, soit 66 g pour 1 000 kcal, hérités
 * tels quels par l'homme en prise de masse à 3 386 kcal — 223 g/jour.
 *
 * LA BORNE, par case partagée: la densité que n'importe quelle carte peut
 * réclamer ne dépasse pas la plus PETITE des densités-plafond des bouches à
 * table (`ceilingG / énergie du jour`). Chaque bouche reçoit ensuite sa
 * borne en grammes, à l'énergie de SA case. Une bouche seule à sa case n'est
 * pas bornée: son plancher est toujours sous son plafond.
 *
 * ⟳ 2026-09-21 — ET LE PLANCHER GAGNE SUR LE PLAFOND. Mesuré sur le plan
 * `3e121b21`: le plafond de l'homme en prise de masse (144 g pour 3 386 kcal,
 * 42,5 g/1 000 kcal) bornait la table SOUS le plancher de l'homme en perte
 * (108 g pour 2 192 kcal, 49,3 g/1 000 kcal). Sa carte disait « 37 g, not
 * more » et il mangeait à 1,1 g/kg, quatre jours sur quatre sous son plancher,
 * sans aucune case seule pour rattraper. Un plancher est un besoin; un plafond
 * est une borne de confort. Quand les deux se croisent sur une même recette,
 * la densité de la table est celle du PLANCHER le plus exigeant, et la bouche
 * dont le plafond cède le voit sur sa carte (`ceilingYielded`) et dans la garde
 * (`protein_ceiling_over`, tolérance `PROTEIN_CEILING_TOLERANCE`).
 *
 * ⚠️ UNE BOUCHE SANS PLAFOND (mineur, corps illisible) NE BORNE PERSONNE:
 * on ne fabrique pas un nombre pour corriger l'absence d'un autre. Elle
 * RESTE bornée par les plafonds des autres, parce que sa carte écrit la même
 * recette qu'eux — la laisser réclamer plus haut ferait dépasser tout le
 * monde. Une bouche dont l'énergie du jour est illisible ne borne personne
 * non plus, et une case dont SON énergie est illisible ne reçoit pas de
 * borne: rien à multiplier.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sharedProteinCaps(
  mouths: readonly SharedProteinMouth[],
): SharedProteinCaps {
  /** `memberId` → `dayToken` → énergie à composer ce jour (`null` = illisible). */
  const dayTotal = new Map<string, Map<string, number | null>>();
  /** `dayToken|slot` → les bouches à cette case, avec leur énergie de case. */
  const cellEaters = new Map<
    string,
    { memberId: string; composeKcal: number | null }[]
  >();
  for (const m of mouths) {
    const totals = new Map<string, number | null>();
    for (const day of m.days) {
      let total: number | null = 0;
      for (const s of day.slots) {
        const k = s.composeKcal;
        if (total === null) break;
        if (k === null || !Number.isFinite(k) || k < 0) {
          total = null;
          break;
        }
        total += k;
      }
      totals.set(day.dayToken, total !== null && total > 0 ? total : null);
      for (const s of day.slots) {
        const key = `${day.dayToken}|${s.slot}`;
        const list = cellEaters.get(key) ?? [];
        list.push({ memberId: m.memberId, composeKcal: s.composeKcal });
        cellEaters.set(key, list);
      }
    }
    dayTotal.set(m.memberId, totals);
  }
  const ceilingOf = new Map(mouths.map((m) => [m.memberId, m.ceilingG]));
  const floorOf = new Map(mouths.map((m) => [m.memberId, m.floorG]));
  const byMember = new Map<string, Map<string, number>>();
  const floorCells = new Set<string>();
  let shared = 0;
  let constrained = 0;
  let floorWins = 0;
  for (const [key, eaters] of cellEaters) {
    if (eaters.length < 2) continue;
    shared += 1;
    const dayToken = key.slice(0, key.indexOf("|"));
    let density: number | null = null;
    let floorDensity: number | null = null;
    for (const e of eaters) {
      const total = dayTotal.get(e.memberId)?.get(dayToken) ?? null;
      if (total === null) continue;
      const ceiling = ceilingOf.get(e.memberId) ?? null;
      if (ceiling !== null && ceiling > 0) {
        const d = ceiling / total;
        density = density === null ? d : Math.min(density, d);
      }
      const floor = floorOf.get(e.memberId) ?? null;
      if (floor !== null && floor > 0) {
        const f = floor / total;
        floorDensity = floorDensity === null ? f : Math.max(floorDensity, f);
      }
    }
    if (density === null) continue;
    constrained += 1;
    // ⟳ 2026-09-21 — LE PLANCHER GAGNE. Voir l'en-tête: un besoin passe
    // devant une borne de confort, et la collision se compte.
    let wins = false;
    if (floorDensity !== null && floorDensity > density) {
      density = floorDensity;
      wins = true;
      floorWins += 1;
      floorCells.add(key);
    }
    for (const e of eaters) {
      const k = e.composeKcal;
      if (k === null || !Number.isFinite(k) || k <= 0) continue;
      const caps = byMember.get(e.memberId) ?? new Map<string, number>();
      // ⚠️ ARRONDI VERS LE HAUT QUAND LE PLANCHER GAGNE: la bouche dont c'est
      // le plancher ne doit pas se lire « bornée » d'un gramme par l'arrondi.
      // (`- 1e-9`: un produit exact comme 108 × 548 / 2192 = 27 ne doit pas
      // monter à 28 par une poussière de virgule flottante.)
      caps.set(key, wins ? Math.ceil(density * k - 1e-9) : Math.floor(density * k));
      byMember.set(e.memberId, caps);
    }
  }
  return {
    byMember,
    cells: cellEaters.size,
    shared,
    constrained,
    floorWins,
    floorCells,
  };
}

/** Une journée couverte, telle que le contrat de créneau la connaît déjà. */
export interface ProteinBriefDay {
  readonly date: string;
  readonly dayToken: string;
  readonly dayTargetKcal: number | null;
  /** ⛔ LE BRUT, comme la garde finale. Voir `proteinFloorAllocation`. */
  readonly coveredBudgetGrossKcal: number | null;
  /** Les protéines des apports fixes de cette journée. `null` = inconnu. */
  readonly fixedProteinG: number | null;
  /**
   * ⟳ 2026-09-23 — LES PROTÉINES ESTIMÉES DES À-CÔTÉS DE CETTE JOURNÉE
   * (Σ `proteinEstG` des contrats, avant le modèle). `0` = aucun à-côté.
   *
   * ⛔ JAMAIS DANS `fixedProteinG`: la garde finale lit les apports fixes pour
   * sa propre allocation, et les à-côtés y seraient comptés deux fois (une
   * fois ici, une fois servis). Ils se retranchent du plancher COUVERT, une
   * fois, avant la répartition sur les plats: le plat n'a pas à porter la
   * protéine que le fromage apporte déjà.
   *
   * ⛔ REQUIS, JAMAIS `?`: un champ facultatif reprendrait en silence la
   * règle d'avant — des plats qui visent tout le plancher à côté d'à-côtés
   * qui en portent une part.
   */
  readonly sideProteinG: number;
  /** Par case couverte : ce qu'il reste à composer. `null` = illisible. */
  readonly slots: readonly { readonly slot: string; readonly composeKcal: number | null }[];
}

/**
 * LE PLANCHER PROTÉIQUE D'UNE BOUCHE, RÉPARTI SUR SES CASES COUVERTES.
 *
 * ⛔ LA RÉPARTITION EST CELLE DE L'ÉNERGIE, PAS UNE MOYENNE. Un petit-déjeuner
 * à 350 kcal et un dîner à 900 ne portent pas la même protéine ; couper le
 * plancher en parts égales mettrait 44 g dans un bol de flocons — c'est-à-dire
 * poserait une consigne intenable, et une consigne intenable apprend au modèle
 * que ces nombres-là sont décoratifs (cicatrice mesurée de ce dépôt : 389
 * demandés au dîner, 126,7 rendus).
 *
 * ⚠️ LES JOURNÉES SE FONDENT QUAND LEUR NOMBRE EST LE MÊME. Deux dîners à 55 g
 * font une ligne ; deux dîners à 55 et 71 g en font deux, chacune avec ses
 * jours — la règle exacte de `densityFragment` pour les couloirs, parce qu'un
 * brief qui répète cesse d'être lu et que « les cases concernées restent
 * identifiables » est une phrase du chantier.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function proteinBriefFor(args: {
  memberId: string;
  /** `envelope.proteinFloorG`. `null` = enveloppe `per_portion` ou sans corps. */
  dayFloorG: number | null;
  /** `envelope.proteinPerMealG`. `null` hors des cas qui le portent. */
  perMealFloorG: number | null;
  /** L'abstention de l'enveloppe, telle que la garde finale la nomme. */
  abstention: "none" | "protected" | "no_body";
  days: readonly ProteinBriefDay[];
  /**
   * ⟳ 2026-09-20 — LE PLAFOND DE LA TABLE pour CETTE bouche, par case
   * (`dayToken|slot`), en grammes. Vient de `sharedProteinCaps`. Absent =
   * aucune case partagée, ou aucune bouche plafonnable à cette table.
   */
  slotCapG?: ReadonlyMap<string, number>;
  /**
   * ⟳ 2026-09-21 — LES CASES OÙ LE PLANCHER DE LA TABLE A GAGNÉ
   * (`SharedProteinCaps.floorCells`). Sur ces cases, la borne haute de la
   * carte est celle de la table, même au-dessus du propre plafond réparti
   * de cette bouche — sinon sa carte contredirait la recette que la table
   * exige, et le modèle apprendrait que l'un des deux chiffres est décoratif.
   * Va avec `slotCapG`; absent = aucune collision.
   */
  tableFloorCells?: ReadonlySet<string>;
  /**
   * ⟳ 2026-09-20 — LE PLAFOND DU JOUR DE CETTE BOUCHE (`proteinCeilingGFor`),
   * réparti par case comme le plancher. Il borne aussi les cases NON
   * partagées. `null` = pas de plafond lisible.
   */
  dayCeilingG?: number | null;
}): ProteinMouthBrief {
  let cappedSlots = 0;
  let gramsRemoved = 0;
  let yieldedSlots = 0;
  let yieldedGrams = 0;
  const byDate: {
    date: string;
    dayToken: string;
    coveredFloorG: number | null;
    reason: ProteinFloorReason;
  }[] = [];
  /** `slot` → grammes, par journée. Rempli seulement si TOUT est lisible. */
  const perDaySlots: {
    dayToken: string;
    slot: string;
    grams: number;
    max: number | null;
    kcal: number;
  }[] = [];
  let silence: ProteinBriefSilence | null = null;

  for (const day of args.days) {
    const allocation = proteinFloorAllocation({
      dayFloorG: args.dayFloorG,
      perMealFloorG: args.perMealFloorG,
      abstention: args.abstention,
      coveredBudgetGrossKcal: day.coveredBudgetGrossKcal,
      dayTargetKcal: day.dayTargetKcal,
      fixedProteinG: day.fixedProteinG,
      dayCeilingG: args.dayCeilingG ?? null,
    });
    byDate.push({
      date: day.date,
      dayToken: day.dayToken,
      coveredFloorG: allocation.coveredFloorG,
      reason: allocation.reason,
    });
    const covered = allocation.coveredFloorG;
    if (covered === null || !(covered > 0)) {
      // ⛔ LE MOTIF DE LA GARDE FINALE EST REPRIS TEL QUEL. Le traduire ici
      // ferait deux vocabulaires pour un seul fait, et c'est celui qu'on relit
      // le moins qui finirait par décider.
      silence ??= allocation.reason === "protected"
        ? "protected"
        : allocation.reason === "coverage_unknown"
        ? "coverage_unknown"
        : "no_body";
      continue;
    }
    // ⟳ 2026-09-23 — CE QUE LES À-CÔTÉS PORTENT DÉJÀ, retranché UNE fois, du
    // plancher COUVERT, avant la répartition sur les plats. ⚠️ Une valeur
    // illisible compte zéro: le côté prudent pour un plancher.
    const sideG = Number.isFinite(day.sideProteinG) && day.sideProteinG > 0 ? day.sideProteinG : 0;
    const floor = Math.max(0, covered - sideG);
    // Les à-côtés couvrent le plancher à eux seuls: rien à demander aux plats.
    if (!(floor > 0)) continue;
    if (day.slots.length === 0) {
      silence ??= "no_covered_slot";
      continue;
    }
    // ⛔ UN SEUL TROU SUFFIT À FAIRE TAIRE LA JOURNÉE ENTIÈRE. Répartir sur les
    // cases lisibles seulement donnerait à celles-là la protéine de celle qu'on
    // ne sait pas peser — c'est-à-dire inventerait une exigence.
    let total = 0;
    let readable = true;
    for (const s of day.slots) {
      if (s.composeKcal === null || !Number.isFinite(s.composeKcal) || s.composeKcal < 0) {
        readable = false;
        break;
      }
      total += s.composeKcal;
    }
    if (!readable || !(total > 0)) {
      silence ??= "spread_unknown";
      continue;
    }
    for (const s of day.slots) {
      const share = (s.composeKcal as number) / total;
      const asked = Math.round(floor * share);
      // ⟳ 2026-09-20 — LA BORNE DE LA TABLE MORD ICI, et se compte.
      const cap = args.slotCapG?.get(`${day.dayToken}|${s.slot}`);
      const grams = cap !== undefined && Number.isFinite(cap) && cap < asked
        ? cap
        : asked;
      if (grams !== asked) {
        cappedSlots += 1;
        gramsRemoved += asked - grams;
      }
      // ⟳ 2026-09-20 — LE PLUS QUE CETTE PART PEUT PORTER: la plus petite des
      // deux bornes, celle de la table et celle du propre plafond de la
      // bouche, réparti comme le plancher. Jamais sous la demande.
      const own = args.dayCeilingG !== undefined && args.dayCeilingG !== null &&
          args.dayCeilingG > 0
        ? Math.round(args.dayCeilingG * share)
        : null;
      const bornes = [cap, own].filter((v): v is number =>
        v !== undefined && v !== null && Number.isFinite(v)
      );
      let max = bornes.length === 0 ? null : Math.max(grams, Math.min(...bornes));
      // ⟳ 2026-09-21 — SUR UNE CASE OÙ LE PLANCHER DE LA TABLE A GAGNÉ, la
      // borne haute est celle de la table, et ce qu'elle dépasse du propre
      // plafond de la bouche se compte (`ceilingYielded`).
      if (
        cap !== undefined && Number.isFinite(cap) &&
        args.tableFloorCells?.has(`${day.dayToken}|${s.slot}`) === true
      ) {
        max = Math.max(grams, cap);
        if (own !== null && cap > own) {
          yieldedSlots += 1;
          yieldedGrams += cap - own;
        }
      }
      // ⚠️ UNE CASE À ZÉRO GRAMME NE SE DIT PAS. Elle est déjà couverte par un
      // apport fixe (`composeKcal` à 0) : lui demander « au moins 0 g » est du
      // bruit, et le bruit dévalue les lignes qui l'entourent.
      if (grams <= 0) continue;
      perDaySlots.push({
        dayToken: day.dayToken,
        slot: s.slot,
        grams,
        max,
        kcal: Math.round((s.composeKcal as number) / 5) * 5,
      });
    }
  }

  // ── LES GRAPPES: MÊME MOMENT, MÊME NOMBRE ⇒ UNE SEULE LIGNE ──────────────
  const clusters = new Map<
    string,
    { slot: string; grams: number; max: number | null; kcal: number; days: string[] }
  >();
  for (const row of perDaySlots) {
    const key = `${row.slot}|${row.grams}|${row.max ?? ""}|${row.kcal}`;
    const seen = clusters.get(key);
    if (seen === undefined) {
      clusters.set(key, {
        slot: row.slot,
        grams: row.grams,
        max: row.max,
        kcal: row.kcal,
        days: [row.dayToken],
      });
    } else if (!seen.days.includes(row.dayToken)) {
      seen.days.push(row.dayToken);
    }
  }
  const slots: ProteinSlotAsk[] = [...clusters.values()]
    .sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || a.grams - b.grams)
    .map((c) => ({
      slot: c.slot,
      days: c.days,
      gramsPerServing: c.grams,
      gramsMax: c.max,
      kcalPerServing: c.kcal,
    }));

  return {
    memberId: args.memberId,
    slots,
    // ⚠️ LE MINIMUM PAR REPAS NE SORT QUE S'IL Y A UNE LIGNE. Sans elle, la
    // bouche est protégée ou illisible — et un « jamais moins de 30 g » servi
    // seul serait un chiffre en face d'un nom qu'on venait de taire.
    perMealFloorG: slots.length === 0
      ? null
      : (args.perMealFloorG !== null && args.perMealFloorG > 0
        ? Math.round(args.perMealFloorG)
        : null),
    silence: slots.length === 0 ? (silence ?? "no_covered_slot") : null,
    byDate,
    capped: { slots: cappedSlots, gramsRemoved },
    ceilingYielded: { slots: yieldedSlots, grams: yieldedGrams },
  };
}

/** L'ordre de la journée, le même que `densityFragment`. */
const SLOT_RANK: Readonly<Record<string, number>> = Object.freeze({
  breakfast: 0,
  morning_snack: 1,
  lunch: 2,
  afternoon_snack: 3,
  dinner: 4,
  evening_snack: 5,
});
function slotRank(slot: string): number {
  const v = SLOT_RANK[slot];
  return v === undefined ? 99 : v;
}

/**
 * LA LIGNE QUI PART SUR LA CARTE D'UNE BOUCHE.
 *
 * ⛔ « UNE PART SERVIE », PAS « CETTE PERSONNE ». La forme est celle que
 * `densityFragment` a fixée et qu'un test du prompt garde : on décrit ce que le
 * PLAT servi là doit porter, jamais un corps. v33 a retiré les corps du prompt
 * exprès ; une protéine par part est une propriété de l'assiette, au même titre
 * qu'une densité.
 *
 * ⛔ ET ON DIT COMMENT L'ATTEINDRE, PARCE QUE LE CONTRAIRE A ÉTÉ MESURÉ. « Une
 * contrainte qu'on énonce sans dire ce qu'elle INTERDIT est une contrainte
 * décorative » (`household_portions.ts`, trois fois). La phrase d'interdit vit
 * dans `PROTEIN_CONSEQUENCE`, servie une fois pour toute la table.
 *
 * Vide quand le brief est muet : rien à dire, on ne dit rien.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function proteinFragment(brief: ProteinMouthBrief | null): string {
  if (brief === null || brief.slots.length === 0) return "";
  const lignesParMoment = new Map<string, number>();
  for (const s of brief.slots) {
    lignesParMoment.set(s.slot, (lignesParMoment.get(s.slot) ?? 0) + 1);
  }
  const perMeal = brief.perMealFloorG === null
    ? ""
    : `, and no main dish under ${brief.perMealFloorG} g`;
  const jours = (s: ProteinSlotAsk) =>
    (lignesParMoment.get(s.slot) ?? 1) >= 2 && s.days.length > 0
      ? ` on ${[...s.days].join("/")}`
      : "";
  // ⟳ 2026-09-21 — L'ÉNERGIE DE LA PART EST ÉCRITE À CÔTÉ DES GRAMMES. Sans
  // elle, « 33 to 41 g » se lisait pour une part de n'importe quelle taille:
  // le modèle écrivait 48 g dans 460 kcal, et le moteur doublait la part.
  const where = (s: ProteinSlotAsk) =>
    `per ${s.kcalPerServing} kcal in the ${s.slot} dish${jours(s)}`;
  // ── SANS AUCUNE BORNE HAUTE: « at least » une fois, en tête ──────────────
  if (brief.slots.every((s) => s.gramsMax === null)) {
    const parts = brief.slots.map((s, i) => {
      const unit = i === 0 ? " g of protein" : " g";
      return `${s.gramsPerServing}${unit} ${where(s)}`;
    });
    return ` — one serving here carries at least ${parts.join(", ")}${perMeal}`;
  }
  // ── ⟳ 2026-09-20 — AVEC UNE BORNE HAUTE: une fourchette, ou « not more » ──
  // ⛔ « AT LEAST » SEUL FAISAIT DÉPASSER: 38 g demandés au déjeuner, 63 g
  // rendus par part, et chaque bouche de la table les héritait. Le chiffre
  // haut est celui que l'application mesure.
  const parts = brief.slots.map((s, i) => {
    const unit = i === 0 ? " g of protein" : " g";
    if (s.gramsMax === null) return `at least ${s.gramsPerServing}${unit} ${where(s)}`;
    if (s.gramsMax <= s.gramsPerServing) {
      return `${s.gramsPerServing}${unit} ${where(s)}, not more`;
    }
    return `${s.gramsPerServing} to ${s.gramsMax}${unit} ${where(s)}`;
  });
  return ` — one serving here carries ${parts.join(", ")}${perMeal}`;
}

/**
 * CE QUE LA LIGNE PROTÉIQUE INTERDIT — servie UNE fois, et seulement si au
 * moins une bouche en porte une.
 *
 * ⛔ LES DEUX ÉCHAPPATOIRES SONT NOMMÉES LITTÉRALEMENT, parce que ce dépôt a
 * mesuré qu'une consigne dont l'échappatoire n'est pas nommée se fait satisfaire
 * par elle : « écris une recette standard » a rendu « une portion standard pour
 * Alex ». Ici les deux sorties faciles sont (a) servir une assiette plus grosse
 * et (b) empiler de la viande jusqu'au compte — et le plan de clôture interdit
 * la seconde en toutes lettres (« ne pas ajouter mécaniquement de la viande »).
 */
export const PROTEIN_CONSEQUENCE: readonly string[] = Object.freeze([
  // ⟳ 2026-09-21 — LE CHIFFRE EST UNE DENSITÉ, ET L'ÉNERGIE À CÔTÉ LE DIT.
  // Mesuré sur le plan `504f58a3`: une part de 460 kcal à 48 g pour « 33 to
  // 41 g », doublée par le moteur jusqu'aux 980 kcal de la case — 86 g servis.
  "The protein figure is a property of the DISH: grams of protein for one",
  "serving of the energy written next to it. Write the recipe at that energy,",
  "or scale the grams with the energy you choose — the app multiplies each",
  "recipe to what a person eats, and the protein grows with it. A 500 kcal",
  "serving that carries the figure meant for 1000 kcal doubles once served.",
  "Reach it by what the dish is MADE OF — meat, fish, eggs, dairy,",
  "legumes, or a denser mix of them — inside the same calories and the same",
  "cooked weight. Do NOT reach it by serving a bigger plate: the app decides how",
  "much each person is served, and a bigger plate breaks the energy target.",
  "Do NOT reach it by piling on meat either: swap or rebalance the components so",
  "the plate stays a plate.",
  // ⟳ 2026-09-20 — LA TROISIÈME ÉCHAPPATOIRE, NOMMÉE: dépasser. « At least »
  // sans borne haute rendait 63 g par part pour 38 demandés, et chaque bouche
  // de la table l'héritait à sa propre énergie. La borne haute est un CHIFFRE
  // sur la carte (« 38 to 48 g », « 37 g, not more »), pas une exhortation.
  "When a line gives a range, or says \"not more\", the upper figure is a",
  "CEILING the app measures the dish against. Every serving of a shared dish",
  "is sized from the same recipe, so a dish written above the highest ceiling",
  "at its table overshoots everyone who shares it. Reach the figure, then stop.",
  // ⟳ 2026-09-21 — LA QUATRIÈME ÉCHAPPATOIRE, MESURÉE: la collation. Plan
  // `3e121b21`: « 12 to 15 g per 360 kcal in the snack_pm dish » et le modèle
  // rendait 149 g de thon (47 g de protéine) — tous les jours. La journée
  // dépassait son plafond de 44 %, et rien ne le nommait sur la carte.
  "A snack, or a dish of someone's own between meals, is starch, fruit, nuts or",
  "dairy with a LITTLE protein: it carries the figure of its line and not more.",
  "A snack written like a main dish (a tin of fish, a slab of cheese) is how a",
  "day overshoots its ceiling. The app measures the day, snacks included.",
]);
