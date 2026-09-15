/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONTRAT D'UNE CASE, DIT AU MODÈLE **AVANT** LA PREMIÈRE GÉNÉRATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE MODULE FERME, LU SUR LES PROMPTS RÉELLEMENT ARCHIVÉS. Le brief
 * du 2026-09-11 (`campagne-tir4-c6`, `prompt_envoye`) porte déjà, par bouche :
 *
 *   · le COULOIR de densité et sa visée — « 116 to 250 kcal per 100 g at
 *     breakfast (aim 127, not 170) » ;
 *   · le PLANCHER protéique par moment — « at least 25 g of protein in the
 *     breakfast dish » ;
 *   · le référentiel avec ses facteurs cru→cuit (« x2.6 ») et ses poids
 *     unitaires.
 *
 * Il ne porte NI l'énergie visée de la case, NI les bornes de masse. Le modèle
 * compose donc une densité sans savoir contre quelle assiette elle sera
 * mesurée : les deux nombres que la garde finale lui reprochera ensuite
 * (`cell_energy_off`, `cell_bounds_off`) ne lui ont jamais été dits.
 *
 * ⛔ CE MODULE NE CALCULE RIEN. Il TRADUIT en texte ce que le moteur a déjà
 * mesuré — `slot_nutrition_contract.ts` (`composeKcal`), `portion_sizing.ts`
 * (`PlateBounds`, `DensityCorridor`), `plan_protein_brief.ts`. Un septième
 * calcul serait un septième avis, et c'est celui qu'on relit le moins qui
 * finirait par décider.
 *
 * ⛔ ET IL NE DEMANDE PAS DE MAXIMISER LA PROTÉINE. La revue de clôture C6 § 7
 * mesure 276–292 g servis pour un plancher de 176 g : « sans conclure à un
 * risque médical, cette marge n'est pas un critère de meilleure recette ». Le
 * plancher est donc présenté comme un MINIMUM À SATISFAIRE, avec la phrase qui
 * ferme l'échappatoire habituelle — « en mettre beaucoup plus n'est pas
 * mieux ». Ce dépôt a mesuré qu'une consigne dont l'échappatoire n'est pas
 * nommée se fait satisfaire par elle.
 *
 * ⚠️ PURE: no I/O, no clock, no randomness.
 */

/**
 * CE QU'UNE CASE A COMME CONTRAT. Les champs `null` sont des ABSTENTIONS du
 * moteur (case couverte par un apport fixe, plancher protégé, corps absent) —
 * jamais des zéros, et la phrase les saute au lieu d'écrire « 0 ».
 */
export interface SlotContractLine {
  /** Le nom lu à table. ⛔ Jamais un identifiant. */
  readonly who: string;
  /** Le jeton de jour du plan (`sun`). */
  readonly day: string;
  readonly slot: string;
  /** `contract.composeKcal` — ce qu'il reste à composer dans cette case. */
  readonly targetKcal: number | null;
  /** `contract.bounds` — les grammes de l'assiette CUITE. */
  readonly gramsMin: number | null;
  readonly gramsMax: number | null;
  readonly gramsAim: number | null;
  /** `contract.corridor` — kcal pour 100 g de l'assiette CUITE. */
  readonly densityMin: number | null;
  readonly densityMax: number | null;
  readonly densityAim: number | null;
  /** Le plancher protéique de CE moment, en grammes servis. */
  readonly proteinMinG: number | null;
}

/**
 * ⛔ LE PLAFOND DE LIGNES. Au-delà, un bloc cesse d'être lu — la même règle que
 * `REPAIR_MAX_BLOCKS` (`plan_defect_pass.ts`, qui comptait des LIGNES sous le
 * nom `REPAIR_MAX_LINES` jusqu'au 2026-09-13 et compte des BLOCS depuis, pour
 * qu'une troncature ne fasse plus disparaître une personne). Un foyer de
 * 4 bouches × 3 moments × 3 jours ferait 36
 * lignes ; on les regroupe par personne, ce qui ramène à une ligne par
 * (personne, moment).
 */
export const SLOT_CONTRACT_MAX_LINES = 32;

/**
 * ⛔ LA PHRASE QUI DIT QUELLE BALANCE ON PARLE. Le référentiel du prompt donne
 * des valeurs POUR 100 g CRU et un facteur cru→cuit ; les bornes et le couloir
 * portent sur l'assiette CUITE. Sans cette phrase, les deux se confondent — et
 * une confusion de 2,6× sur du riz suffit à faire sortir une case de ses
 * bornes sans qu'aucune consigne n'ait été violée.
 */
export const RAW_COOKED_SENTENCE = [
  "⛔ TWO WEIGHTS, AND THEY ARE NOT THE SAME ONE. The food list gives kcal and",
  "protein per 100 g RAW, with the raw-to-cooked factor next to it (\"x2.6\" means",
  "100 g raw becomes 260 g cooked). Every range below is about the plate AS",
  "EATEN, cooked. Write your ingredient amounts in the state the food list uses,",
  "and check the ranges against the cooked plate.",
].join("\n");

/** Un nombre lisible, ou rien. ⛔ Jamais `0` pour « on ne sait pas ». */
function n(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return String(Math.round(v));
}

/** `120 to 180 g`, `at least 120 g`, ou `null` si aucune borne. */
function bande(
  min: number | null,
  max: number | null,
  unit: string,
): string | null {
  const a = n(min);
  const b = n(max);
  if (a !== null && b !== null) return `${a} to ${b} ${unit}`;
  if (a !== null) return `at least ${a} ${unit}`;
  if (b !== null) return `at most ${b} ${unit}`;
  return null;
}

/** Une ligne de contrat, ou `null` quand le moteur s'est abstenu sur tout. */
export function slotContractSentence(line: SlotContractLine): string | null {
  const morceaux: string[] = [];
  const kcal = n(line.targetKcal);
  if (kcal !== null) morceaux.push(`${kcal} kcal in one serving`);
  const masse = bande(line.gramsMin, line.gramsMax, "g cooked");
  if (masse !== null) {
    const vise = n(line.gramsAim);
    morceaux.push(vise === null ? masse : `${masse} (aim ${vise})`);
  }
  const densite = bande(line.densityMin, line.densityMax, "kcal per 100 g");
  if (densite !== null) {
    const vise = n(line.densityAim);
    morceaux.push(vise === null ? densite : `${densite} (aim ${vise})`);
  }
  const proteine = n(line.proteinMinG);
  // ⛔ « AT LEAST », ET LA PHRASE QUI FERME L'ÉCHAPPATOIRE EST DANS LE BLOC,
  // PAS ICI: la répéter sur chaque ligne la ferait lire comme un détail.
  if (proteine !== null) morceaux.push(`at least ${proteine} g of protein`);
  if (morceaux.length === 0) return null;
  return `  · ${line.who}, ${line.day} ${line.slot}: ${morceaux.join(" · ")}`;
}

export interface SlotContractBrief {
  /** Le bloc à coller dans le message. Vide = rien à dire. */
  readonly text: string;
  readonly counters: {
    readonly lines: number;
    /** ⛔ LES CASES SUR LESQUELLES LE MOTEUR S'EST ABSTENU SUR TOUT. */
    readonly silent: number;
    readonly truncated: number;
    readonly chars: number;
  };
}

/**
 * LE BLOC DE CONTRAT, POUR TOUTES LES CASES D'UN PLAN.
 *
 * ⛔ IL SE COLLE AU BLOC QUI DEMANDE LA RECETTE, PAS EN QUEUE DU MESSAGE. « La
 * promesse et la clé de schéma doivent se toucher » : ce dépôt a mesuré **0 %**
 * de conformité quand une consigne était séparée de la phrase qui promet la
 * matière, et un « ci-dessus » ne traverse pas la frontière système↔utilisateur.
 * Le point d'ancrage existe déjà dans le générateur (`CATALOG_ANCHOR`,
 * `== WRITE ONE STANDARD RECIPE PER DISH ==`) — voir la note de câblage.
 *
 * ⚠️ LA TRONCATURE SE DIT. Un bloc coupé en silence ferait composer à l'aveugle
 * les cases qui n'y sont plus.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function slotContractBrief(args: {
  readonly lines: readonly SlotContractLine[];
  readonly maxLines?: number;
}): SlotContractBrief {
  const plafond = args.maxLines ?? SLOT_CONTRACT_MAX_LINES;
  const phrases: string[] = [];
  let muettes = 0;
  for (const l of args.lines) {
    const p = slotContractSentence(l);
    if (p === null) {
      muettes++;
      continue;
    }
    phrases.push(p);
  }
  if (phrases.length === 0) {
    return {
      text: "",
      counters: { lines: 0, silent: muettes, truncated: 0, chars: 0 },
    };
  }
  const coupees = Math.max(0, phrases.length - plafond);
  const corps = [
    "== WHAT EACH PLATE HAS TO COME OUT AT ==",
    "These are the numbers the app will measure your recipes against. They are",
    "not a preference and they are not a suggestion: a dish outside them comes",
    "back to you.",
    RAW_COOKED_SENTENCE,
    ...phrases.slice(0, plafond),
    ...(coupees > 0 ? [`  … and ${coupees} more plate(s) on the same pattern.`] : []),
    "⛔ Reach every one of these by what the dish is MADE OF — the balance of",
    "starch, protein, fat, vegetable and water in it. Not by serving more or",
    "less: the app decides how much goes on each plate.",
    // ⛔ LA PROTÉINE EST UN PLANCHER, ET RIEN DE PLUS. Revue C6 § 7: 276–292 g
    // servis pour un plancher de 176 g. « Cette marge n'est pas un critère de
    // meilleure recette. »
    "⛔ The protein figure is a FLOOR to reach, not a score to beat. Once a dish",
    "is at or just above it, it is done — going far above costs the calories and",
    "the weight the same plate owes, and the app will refuse it for that.",
  ].join("\n");
  return {
    text: corps,
    counters: {
      lines: Math.min(phrases.length, plafond),
      silent: muettes,
      truncated: coupees,
      chars: corps.length,
    },
  };
}
