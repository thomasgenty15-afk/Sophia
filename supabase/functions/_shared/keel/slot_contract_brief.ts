/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONTRAT D'UNE CASE, DIT AU MODÈLE **AVANT** LA PREMIÈRE GÉNÉRATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE MODULE FERME, LU SUR LES PROMPTS RÉELLEMENT ARCHIVÉS. Le brief
 * du 2026-09-11 (`campagne-tir4-c6`, `prompt_envoye`) porte déjà, par bouche :
 *
 *   · le COULOIR de densité et sa visée — « 116 to 250 kcal per 100 g at
 *     breakfast (aim 127, not 170) » dans l'archive. ⟳ 2026-09-23 — la même
 *     ligne se lit aujourd'hui « 116 to 250 kcal per 100 g at breakfast
 *     (aim 125) »: la clause « not N » (« on demande la plus grande
 *     assiette ») est retirée de `household_portions.ts`, et la visée d'un
 *     repas est `max(TEMPLATE_DISH_KCAL_PER_100G ; Dmin)`
 *     (`densityCorridorFor`, `portion_sizing.ts`) ;
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
  /**
   * ⟳ 2026-09-23 — L'IDENTITÉ DE LA PERSONNE, pour regrouper ses lignes et
   * partager la coupe entre les personnes. ⛔ JAMAIS IMPRIMÉE : c'est `who`
   * que le modèle lit. Regrouper sur `who` fondrait deux personnes au même
   * prénom — ou deux prénoms manquants (`""`) — en une seule.
   */
  readonly memberId: string;
  /** Le nom lu à table. ⛔ Jamais un identifiant. */
  readonly who: string;
  /** Le jeton de jour du plan (`sun`). */
  readonly day: string;
  readonly slot: string;
  /** `contract.composeKcal` — ce qu'il reste à composer dans cette case. */
  readonly targetKcal: number | null;
  /**
   * `contract.bounds` — les grammes de l'assiette CUITE.
   *
   * ⟳ 2026-09-23 — `gramsAim` EST RETIRÉ : UNE SEULE VISÉE PAR LIGNE. La ligne
   * portait deux « aim », une masse (`bounds.preferred`) et une densité
   * (`corridor.preferredPer100G`), calculées par deux chemins; avec l'énergie
   * de la case, elles se contredisaient dès que la densité visée × la masse
   * visée ≠ l'énergie. Le modèle choisissait la masse — la plus facile à
   * tenir, celle qui fait les assiettes de 700 g. Reste la densité visée : la
   * seule que la recette décide (« la visée de chaque case devient la densité
   * de la personne du milieu », plan du 2026-09-23); la masse, c'est l'app
   * qui la sert.
   */
  readonly gramsMin: number | null;
  readonly gramsMax: number | null;
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
 *
 * ⟳ 2026-09-23 — CE COMMENTAIRE ANNONÇAIT LE REGROUPEMENT, ET LE CODE NE LE
 * FAISAIT PAS. Mesuré par l'audit des dosages (lot 4 f) : la liste était
 * coupée à 32 lignes dans l'ordre des personnes — 25 pour Thomas, 7 pour
 * Fabrice, **0 pour Christèle**. Le regroupement existe maintenant, et la
 * coupe TOURNE entre les personnes (`slotContractBrief`).
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

/**
 * Les morceaux d'une ligne, dans l'ordre énergie · masse · densité · protéine.
 * `[]` quand le moteur s'est abstenu sur tout. ⚠️ Ce sont eux, déjà arrondis,
 * qui décident si deux lignes sont identiques : deux cases qui DISENT la même
 * chose au modèle sont la même ligne.
 */
function morceauxOf(line: SlotContractLine): string[] {
  const morceaux: string[] = [];
  const kcal = n(line.targetKcal);
  if (kcal !== null) morceaux.push(`${kcal} kcal in one serving`);
  // ⟳ 2026-09-23 — LA MASSE EST UNE BANDE, SANS VISÉE (voir `gramsMin`).
  const masse = bande(line.gramsMin, line.gramsMax, "g cooked");
  if (masse !== null) morceaux.push(masse);
  const densite = bande(line.densityMin, line.densityMax, "kcal per 100 g");
  if (densite !== null) {
    const vise = n(line.densityAim);
    morceaux.push(vise === null ? densite : `${densite} (aim ${vise})`);
  }
  const proteine = n(line.proteinMinG);
  // ⛔ « AT LEAST », ET LA PHRASE QUI FERME L'ÉCHAPPATOIRE EST DANS LE BLOC,
  // PAS ICI: la répéter sur chaque ligne la ferait lire comme un détail.
  if (proteine !== null) morceaux.push(`at least ${proteine} g of protein`);
  return morceaux;
}

/**
 * La tête d'une ligne : `Max, sun breakfast` pour un jour, `Max, lunch on sun,
 * mon, tue` pour plusieurs — le moment d'abord, puisque c'est lui qui est
 * commun.
 */
function teteDe(who: string, days: readonly string[], slot: string): string {
  return days.length === 1 ? `${who}, ${days[0]} ${slot}` : `${who}, ${slot} on ${days.join(", ")}`;
}

/** Une ligne de contrat, ou `null` quand le moteur s'est abstenu sur tout. */
export function slotContractSentence(line: SlotContractLine): string | null {
  const morceaux = morceauxOf(line);
  if (morceaux.length === 0) return null;
  return `  · ${teteDe(line.who, [line.day], line.slot)}: ${morceaux.join(" · ")}`;
}

export interface SlotContractBrief {
  /** Le bloc à coller dans le message. Vide = rien à dire. */
  readonly text: string;
  readonly counters: {
    /** Les lignes écrites, après regroupement et coupe. */
    readonly lines: number;
    /** ⛔ LES CASES SUR LESQUELLES LE MOTEUR S'EST ABSTENU SUR TOUT. */
    readonly silent: number;
    /** Les lignes (déjà regroupées) laissées dehors par le plafond. */
    readonly truncated: number;
    readonly chars: number;
    /**
     * ⟳ 2026-09-23 — les cases fondues dans la ligne d'une autre (même
     * personne, même moment, mêmes nombres, un autre jour).
     */
    readonly merged: number;
    /** ⟳ 2026-09-23 — les personnes qui ont au moins une ligne écrite. */
    readonly people: number;
    /**
     * ⟳ 2026-09-23 — ⛔ DOIT RESTER À ZÉRO : une personne qui avait des
     * lignes et dont la coupe n'en a gardé aucune. C'était Christèle.
     */
    readonly people_cut_to_zero: number;
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
 * ⟳ 2026-09-23 — TROIS GESTES, DANS CET ORDRE (audit des dosages, lot 4 f) :
 *   ① les lignes identiques d'une personne à un moment, sur plusieurs jours,
 *     n'en font qu'une (« Christèle, lunch on sun, mon, tue: … ») ;
 *   ② la coupe à `maxLines` TOURNE entre les personnes : chacune reçoit sa
 *     ligne suivante à chaque tour, tant qu'il reste de la place ;
 *   ③ le rendu reste groupé par personne, et chaque coupe nomme la personne à
 *     qui elle a pris des lignes.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function slotContractBrief(args: {
  readonly lines: readonly SlotContractLine[];
  readonly maxLines?: number;
}): SlotContractBrief {
  const plafond = args.maxLines ?? SLOT_CONTRACT_MAX_LINES;
  // ── ① LE REGROUPEMENT : même personne, même moment, mêmes nombres ──────
  // ⚠️ L'ORDRE EST CELUI DE L'ENTRÉE : les personnes dans l'ordre où elles
  // apparaissent, leurs lignes dans l'ordre de leur premier jour.
  type Groupe = { who: string; slot: string; days: string[]; corps: string };
  const parPersonne = new Map<string, Groupe[]>();
  const parCle = new Map<string, Groupe>();
  let muettes = 0;
  let fondues = 0;
  for (const l of args.lines) {
    const morceaux = morceauxOf(l);
    if (morceaux.length === 0) {
      muettes++;
      continue;
    }
    const corps = morceaux.join(" · ");
    const cle = `${l.memberId}\u0000${l.slot}\u0000${corps}`;
    const deja = parCle.get(cle);
    if (deja !== undefined) {
      if (!deja.days.includes(l.day)) deja.days.push(l.day);
      fondues++;
      continue;
    }
    const groupe: Groupe = { who: l.who, slot: l.slot, days: [l.day], corps };
    parCle.set(cle, groupe);
    const liste = parPersonne.get(l.memberId) ?? [];
    liste.push(groupe);
    parPersonne.set(l.memberId, liste);
  }
  const personnes = [...parPersonne.values()];
  const total = personnes.reduce((acc, g) => acc + g.length, 0);
  if (total === 0) {
    return {
      text: "",
      counters: {
        lines: 0,
        silent: muettes,
        truncated: 0,
        chars: 0,
        merged: fondues,
        people: 0,
        people_cut_to_zero: 0,
      },
    };
  }

  // ── ② LA COUPE TOURNE ENTRE LES PERSONNES ──────────────────────────────
  // ⛔ Un tour prend la ligne suivante de CHAQUE personne, puis on recommence.
  // Couper dans l'ordre de l'entrée donnait tout à la première personne listée
  // et rien à la dernière (audit du 2026-09-23 : 25 / 7 / 0).
  // ⚠️ LE NOMBRE DE TOURS EST BORNÉ PAR LA PLUS LONGUE LISTE : la boucle
  // s'arrête même si une règle de prise venait à ne plus rien prendre.
  const gardees = personnes.map(() => 0);
  const tours = Math.max(...personnes.map((g) => g.length));
  let pris = 0;
  for (let tour = 0; tour < tours && pris < plafond; tour++) {
    for (const [k, groupes] of personnes.entries()) {
      if (pris >= plafond) break;
      if (tour < groupes.length) {
        gardees[k]++;
        pris++;
      }
    }
  }

  // ── ③ LE RENDU, PERSONNE PAR PERSONNE ──────────────────────────────────
  // ⚠️ LA TRONCATURE SE DIT, ET À QUI ELLE A PRIS : « … and 4 more plate(s)
  // for Thomas ». Un bloc coupé en silence ferait composer à l'aveugle les
  // cases qui n'y sont plus.
  const phrases: string[] = [];
  let coupees = 0;
  let aZero = 0;
  for (const [k, groupes] of personnes.entries()) {
    for (const g of groupes.slice(0, gardees[k])) {
      phrases.push(`  · ${teteDe(g.who, g.days, g.slot)}: ${g.corps}`);
    }
    const reste = groupes.length - gardees[k];
    if (reste > 0) {
      coupees += reste;
      phrases.push(`  … and ${reste} more plate(s) for ${groupes[0].who}, not listed here.`);
    }
    if (gardees[k] === 0) aZero++;
  }
  const corps = [
    "== WHAT EACH PLATE HAS TO COME OUT AT ==",
    "These are the numbers the app will measure your recipes against. They are",
    "not a preference and they are not a suggestion: a dish outside them comes",
    "back to you.",
    RAW_COOKED_SENTENCE,
    ...phrases,
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
      lines: pris,
      silent: muettes,
      truncated: coupees,
      chars: corps.length,
      merged: fondues,
      people: gardees.filter((g) => g > 0).length,
      people_cut_to_zero: aZero,
    },
  };
}
