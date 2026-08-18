/**
 * FF-043 — LA RÉSOLUTION FOYER : une cuisson, des assiettes qui divergent.
 *
 * Fiche: `docs/fonctionnalites/le-foyer/FF-043-la-resolution-foyer.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §4, arbitrage A3.
 * Autorité produit: `docs/keel/PIVOT-FOYER.md`.
 *
 * ── CE QUI REND CETTE LANE DIFFÉRENTE DE TOUTES LES AUTRES ───────────────
 * Une assiette qui diverge est lisible par tout le monde AUTOUR DE LA TABLE.
 * Ce n'est pas une question de nutrition, c'est une question de qui sait quoi
 * sur qui: si le tronc commun est dimensionné sur l'enveloppe de quelqu'un, la
 * personne protégée par un plancher mange la restriction d'un autre; et si les
 * différences se voient, l'objectif de chacun devient public au dîner.
 *
 * D'où l'ORDRE de ce fichier, qui est l'algorithme du design §4.1 et pas une
 * commodité: le verrou de lane AVANT tout calcul, le MIN plutôt que le
 * référent, et des deltas qui n'ajoutent jamais un plat séparé.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  childEnvelopeFromBody,
  type Envelope,
  maintenanceEnvelopeFromBody,
  type MouthBody,
} from "./meal_envelope.ts";
import type { MemberAgeState } from "./household.ts";
import type { MemberGoal, PortionMember } from "./household_portions.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// 1. LE VERROU DE LANE — évalué AVANT tout autre calcul
// ---------------------------------------------------------------------------

/** Une bouche, réduite à ce dont la résolution a besoin. */
export interface HouseholdMember {
  memberId: string;
  displayName: string;
  ageState: MemberAgeState;
  goal: MemberGoal | null;
  /**
   * L'enveloppe de CE membre, telle que `mouthEnvelope` l'a rendue — depuis
   * son compte quand il y en a un, depuis le corps de sa fiche sinon.
   *
   * `null` = aucune enveloppe calculable pour cette bouche (corps absent, âge
   * inconnu). Elle compte alors pour une part STANDARD, jamais réduite.
   */
  envelope: Envelope | null;
}

export type HouseholdLaneMode = "per_kg" | "per_portion";

/**
 * Le mode de la lane. **Le premier pas, jamais un `if` de fin.**
 *
 * ── POURQUOI UN SEUL MEMBRE FAIT TOUT DÉGRADER ───────────────────────────
 * Le tronc qu'une personne flaggée mange ne peut PAS être dimensionné sur les
 * enveloppes de déficit de ses co-membres. C'est le défaut fatal que deux des
 * designs candidats portaient, et la seule position sûre est celle-ci: la lane
 * ENTIÈRE passe en `per_portion`, directions de service qualitatives
 * existantes seulement.
 *
 * ── ET IL SE LIT SUR L'ENVELOPPE, PAS SUR UN DRAPEAU ─────────────────────
 * `envelopeFor` a DÉJÀ dégradé en `per_portion` pour un élève sous plancher —
 * par la même branche que pour un corps inconnu. Relire ici un
 * `restrictionFlag` séparé créerait une seconde source de vérité qui
 * divergerait, et surtout rendrait le statut LISIBLE dans cette fonction. On
 * lit donc le MODE, qui mélange les deux populations par construction.
 *
 * ── ET IL MÉLANGE LES DEUX POPULATIONS, COMME `envelope_mode` ────────────
 * `per_portion` est rendu dans DEUX cas: un membre dégradé, OU aucun adulte
 * dont l'enveloppe soit calculable. Ce n'est pas une commodité — c'est la
 * seule façon que le mode lui-même ne soit pas un signal.
 *
 * Le test de ce module est tombé dessus au premier passage: la version d'avant
 * rendait `per_kg` pour un foyer sans enveloppe et `per_portion` pour un foyer
 * protégé, donc l'enum DISAIT « quelqu'un ici est protégé » — à quiconque lit
 * la ligne, aujourd'hui ou dans six mois quand on l'agrégera. C'est
 * exactement la faute que `envelope_mode` (FF-039 R14) existe pour ne pas
 * commettre.
 *
 * Le mode ne coûte rien à l'appelant: quand aucune enveloppe n'est calculable,
 * il n'y avait de toute façon ni tronc dimensionné ni delta.
 */
export function householdLaneMode(
  members: readonly HouseholdMember[],
): HouseholdLaneMode {
  for (const m of members) {
    if (m.envelope?.mode === "per_portion") return "per_portion";
  }
  // ── « TOUTE BOUCHE », PLUS « TOUT ADULTE » (2026-08-12) ─────────────────
  // La condition portait `m.ageState === "adult"`. Depuis que chaque bouche a
  // un corps et donc une enveloppe, un foyer d'un adulte sans corps et de deux
  // enfants avec corps est DIMENSIONNABLE — et c'est exactement le foyer que
  // ce lot répare.
  const dimensionable = members.some((m) =>
    m.envelope?.mode === "per_kg" && m.envelope.energy !== null
  );
  return dimensionable ? "per_kg" : "per_portion";
}

// ---------------------------------------------------------------------------
// 1 bis. L'ENVELOPPE D'UNE BOUCHE — la seule porte, pour toutes les bouches
// ---------------------------------------------------------------------------

/**
 * L'ENVELOPPE DE CETTE BOUCHE, ET IL N'Y A QU'UNE FAÇON DE L'OBTENIR.
 *
 * ── CE QUE CETTE FONCTION RÉPARE ─────────────────────────────────────────
 * Avant le 2026-08-12, une bouche sans compte n'avait pas de corps, donc pas
 * d'enveloppe, donc ni poids dans le MIN ni add-on. Dans le foyer « une mère en
 * `fat_loss` + deux enfants », le MIN se prenait sur la seule adulte: **la
 * casserole ÉTAIT une casserole de déficit, et les enfants la mangeaient**,
 * sans rien en plus. C'est le préjudice que FF-043 §1 nomme, et il n'était
 * fermé que pour les adultes.
 *
 * ── LES DEUX SOURCES, ET L'ORDRE ENTRE ELLES ─────────────────────────────
 *
 *   1. `accountEnvelope` — ce que `envelopeFor` a rendu depuis le compte de la
 *      personne: sa série de pesées, son plancher TCA, et son objectif quand il
 *      s'applique. **Elle gagne toujours**, y compris quand elle est dégradée:
 *      une enveloppe `per_portion` est la DÉCISION du plancher, pas une
 *      absence, et retomber sur la fiche derrière elle contournerait le
 *      plancher par la porte de service.
 *
 *   2. `lineBody` — le corps que le compte maître a saisi sur la fiche. Il
 *      n'achète qu'une **MAINTENANCE**, jamais un objectif: sans série de
 *      pesées il n'y a pas de plancher TCA derrière, donc rien qui puisse
 *      arrêter une restriction si on en exécutait une. Une maintenance ne peut
 *      ni creuser un déficit ni poser un plafond de densité — elle ne peut que
 *      faire descendre le tronc (protecteur) ou ouvrir un add-on (additif).
 *
 * ── UN MINEUR: MAINTENANCE PÉDIATRIQUE, TOUJOURS ─────────────────────────
 * `goal: null` par construction reste vrai, et c'est structurel: aucun jeton
 * d'objectif n'est passé à `childEnvelopeFromBody`, qui n'en accepte pas.
 * `fat_loss` écrit sur la fiche d'un enfant est donc **inerte**, pas ignoré par
 * une condition qu'on pourrait retirer.
 *
 * ── UN ÂGE INCONNU N'A PAS D'ENVELOPPE ───────────────────────────────────
 * Ni adulte ni enfant: on ne sait pas quelle équation appliquer, et les deux
 * donnent des résultats très différents sur le même poids. `null` = part
 * standard, jamais réduite — la direction sûre du reste du domaine.
 */
export function mouthEnvelope(args: {
  ageState: MemberAgeState;
  /** ⚠️ REQUIS. `null` = cette bouche n'a pas de compte, ou rien à en tirer. */
  accountEnvelope: Envelope | null;
  /** ⚠️ REQUIS. `null` = le corps de la fiche n'est pas renseigné. */
  lineBody: MouthBody | null;
}): Envelope | null {
  if (args.accountEnvelope !== null) return args.accountEnvelope;
  if (args.lineBody === null) return null;
  if (args.ageState === "minor") return childEnvelopeFromBody(args.lineBody);
  if (args.ageState === "adult") return maintenanceEnvelopeFromBody(args.lineBody);
  return null;
}

// ---------------------------------------------------------------------------
// 2. LE MEMBRE DE RÉFÉRENCE — déclaré, jamais dérivé
// ---------------------------------------------------------------------------

/**
 * Qui gouverne la doctrine du tronc.
 *
 * ── DÉCLARÉ, ET LE DÉFAUT EST LE COMPOSITEUR ─────────────────────────────
 * Jamais dérivé d'une métrique ni d'un ordre d'objectifs. Un ordre
 * déterministe + la doctrine du référent citée dans le plan = l'objectif le
 * plus bas du foyer devient lisible par tous à table, et le plan lui-même est
 * le canal de divulgation. Le défaut est **le membre qui compose la session**:
 * composer est un geste visible de tous, donc aucune information cachée ne
 * fuit.
 *
 * ── UN MINEUR N'EST JAMAIS RÉFÉRENT ──────────────────────────────────────
 * Ni par déclaration, ni par défaut. Sa doctrine gouvernerait l'assiette
 * d'adultes, et son objectif — qui n'existe pas par construction — ne peut
 * rien gouverner.
 */
export function referenceMemberId(
  members: readonly HouseholdMember[],
  declared: string | null,
  composerMemberId: string | null,
): string | null {
  const eligible = members.filter((m) => m.ageState !== "minor");
  const pick = (id: string | null) =>
    id && eligible.some((m) => m.memberId === id) ? id : null;
  return pick(declared) ?? pick(composerMemberId) ?? null;
}

// ---------------------------------------------------------------------------
// 3. LE TRONC — dimensionné sur le MIN, jamais sur le référent
// ---------------------------------------------------------------------------

export interface TrunkSizing {
  /**
   * La bande sur laquelle le tronc se compose. `null` = cas NOMINAL: le tronc
   * se compose comme aujourd'hui, structure seulement.
   */
  energy: { low: number; high: number } | null;
  /** Combien de BOUCHES ont pesé dans le MIN. Pour la mesure, jamais affiché. */
  mouthsCounted: number;
  /** Combien comptent pour « portion standard ». */
  mouthsStandard: number;
}

/**
 * Le tronc, sur le **MIN des enveloppes adultes calculables**.
 *
 * ── POURQUOI LE MIN, ET PAS LE RÉFÉRENT NI LA MOYENNE ────────────────────
 * C'est la seule arithmétique compatible avec « on ajoute, on ne retire
 * jamais ». Le référent imposerait son déficit à tous; une moyenne servirait à
 * quelqu'un une portion plus petite que la sienne. Le MIN garantit que
 * PERSONNE ne reçoit moins que ce qui lui convient — ce qui manque se rattrape
 * en delta additif.
 *
 * ── UN ADULTE SANS ENVELOPPE COMPTE « STANDARD », JAMAIS RÉDUIT ──────────
 * Ne pas savoir n'est pas une raison de servir moins. C'est la direction
 * d'erreur choisie, et elle est la seule sûre.
 *
 * ── ZÉRO ENVELOPPE CALCULABLE EST LE CAS NOMINAL ────────────────────────
 * Pas une dégradation: Gorin 2018 — composer le foyer autour d'une structure
 * saine bénéficie à tous sans cible. Et c'est l'état de la majorité des
 * foyers.
 *
 * ── ⚠️ LE MIN PORTE SUR TOUTES LES BOUCHES DEPUIS LE 2026-08-12 ─────────
 * Il ne portait que sur les ADULTES, et c'était le trou: un mineur n'avait ni
 * enveloppe ni delta, donc il mangeait le tronc — c'est-à-dire, dans un foyer
 * d'une mère en `fat_loss` et de deux enfants, **le déficit de sa mère**. Le
 * MIN sur toutes les bouches garantit que le tronc ne dépasse le besoin de
 * personne, et l'add-on rend à chacun ce qui lui manque.
 *
 * Conséquence à connaître: un tout-petit à table TIRE LE TRONC VERS LE BAS, et
 * les adultes récupèrent l'écart en add-on. C'est l'arithmétique voulue (« on
 * ajoute, on ne retire jamais »), mais elle rend la casserole commune plus
 * petite à mesure que la plus petite bouche est petite. Instrumenté par
 * `residualGaps`; voir FF-043 §11.
 */
export function trunkSizing(members: readonly HouseholdMember[]): TrunkSizing {
  let low: number | null = null;
  let high: number | null = null;
  let counted = 0;
  for (const m of members) {
    // Un mode `per_portion` ne devrait pas arriver ici — le verrou de lane a
    // déjà tout dégradé — mais on ne s'en remet pas à l'ordre des appels: une
    // garde qui dépend d'un appelant est une garde qu'un appelant oublie.
    if (m.envelope?.mode !== "per_kg" || !m.envelope.energy) continue;
    counted++;
    low = low === null ? m.envelope.energy.low : Math.min(low, m.envelope.energy.low);
    high = high === null ? m.envelope.energy.high : Math.min(high, m.envelope.energy.high);
  }
  return {
    energy: low !== null && high !== null ? { low, high } : null,
    mouthsCounted: counted,
    mouthsStandard: members.length - counted,
  };
}

// ---------------------------------------------------------------------------
// 4. LA SÉCURITÉ DU TRONC — les interdits, jamais les opinions
// ---------------------------------------------------------------------------

/** Ce qu'une doctrine gouvernante apporte au tronc. */
export interface MemberDoctrineTerms {
  memberId: string;
  /** Les interdits. GLOBAUX par construction: ils gouvernent le tronc. */
  forbidden: readonly string[];
  /** Les aliments déconseillés. Ils ne gouvernent QUE l'add-on de ce membre. */
  discouraged: readonly string[];
}

export interface TrunkSafety {
  /** L'union des interdits de TOUTES les doctrines gouvernantes. */
  forbidden: string[];
  /** Par membre: ce qui ne gouverne que SON add-on. */
  discouragedByMember: Map<string, string[]>;
}

/**
 * Ce qui gouverne le tronc, et ce qui ne gouverne qu'un add-on.
 *
 * ── LA LIGNE QUI COMPTE ──────────────────────────────────────────────────
 * Un INTERDIT est global par construction: un coach qui interdit un aliment ne
 * l'interdit pas « pour son élève quand il mange seul ». Il entre donc dans
 * l'union du tronc.
 *
 * Un DÉCONSEILLÉ est une OPINION. Les opinions d'un coach n'ont pas prise sur
 * l'assiette commune d'élèves d'AUTRES coachs — elles gouvernent les add-ons
 * de leur propre membre. C'est le correctif du « veto doux » qu'un des designs
 * candidats portait: sans lui, le coach le plus prescriptif du foyer décide de
 * ce que tout le monde mange.
 */
export function trunkSafety(
  terms: readonly MemberDoctrineTerms[],
): TrunkSafety {
  const forbidden: string[] = [];
  const discouragedByMember = new Map<string, string[]>();
  for (const t of terms) {
    for (const f of t.forbidden) {
      const v = String(f ?? "").trim();
      if (v && !forbidden.includes(v)) forbidden.push(v);
    }
    discouragedByMember.set(
      t.memberId,
      [...new Set(t.discouraged.map((d) => String(d ?? "").trim()).filter(Boolean))],
    );
  }
  return { forbidden: forbidden.sort(), discouragedByMember };
}

/** Le motif de refus, quand l'union rend le tronc incomposable. */
export const TRUNK_UNSATISFIABLE = "household_trunk_unsatisfiable";

/**
 * Le message d'un tronc incomposable.
 *
 * ── IL NOMME DES ALIMENTS, JAMAIS DES GENS ───────────────────────────────
 * Pas un prénom, pas un nom de coach, pas un objectif. Un message qui nomme un
 * membre transforme une contrainte en accusation, et le fait à table. La règle
 * est généralisée à TOUT message d'échec de cette lane.
 */
export function trunkUnsatisfiableMessage(foods: readonly string[]): string {
  const list = [...new Set(foods.map((f) => String(f ?? "").trim()).filter(Boolean))]
    .sort();
  return list.length === 0
    ? "There is no dish everyone at this table can share."
    : `There is no dish everyone at this table can share without ${list.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// 5. LES DELTAS ADDITIFS — catalogue fermé, SANS slot de dressage (A3)
// ---------------------------------------------------------------------------

/**
 * LES DEUX CANAUX DE LA PREMIÈRE SAISON.
 *
 * ── L'ORDRE EST DICTÉ PAR LE STIGMATE, PAS PAR LA COMMODITÉ ──────────────
 * Une quantité DIFFÉRENTE du même aliment est neutre à table; un aliment
 * DIFFÉRENT se voit. D'où:
 *   (a) `more_of_the_same` — part protéique élargie, féculent doublé;
 *   (b) `usual_side`       — accompagnement usuel servi à part (pain, riz).
 *
 * ── (c) LE SLOT DE DRESSAGE N'EXISTE PAS — ARBITRAGE A3 ──────────────────
 * Pas de « filet d'huile, copeaux de fromage » la première saison. Ce n'est
 * pas un oubli: c'est une extension du contrat du générateur (`GeneratedDish`
 * n'a que title/slot/day/ingredients), et sa condition d'armement est une
 * MESURE — l'écart résiduel instrumenté ci-dessous — pas une intuition.
 */
export const DELTA_CHANNELS = ["more_of_the_same", "usual_side"] as const;
export type DeltaChannel = (typeof DELTA_CHANNELS)[number];

/**
 * Un add-on. **Des grammes d'ALIMENT, structurés, sans prose à assainir.**
 *
 * `moment` distingue ce qui entre dans la casserole de ce qui se sert à part.
 * Ce n'est PAS le slot de dressage d'A3: servir le pain à part est un geste de
 * table ordinaire, personnaliser une assiette au dressage est un canal de
 * divergence visible.
 */
export interface MemberDelta {
  memberId: string;
  /** Un slug de `food_composition_refs`, jamais un texte libre. */
  foodRef: string;
  grams: number;
  moment: "cooking" | "plating";
  channel: DeltaChannel;
}

/** L'écart qui reste après les deltas — L'INSTRUMENTATION D'A3. */
export interface ResidualGap {
  memberId: string;
  /** kcal/jour manquants après add-ons. 0 = comblé. Négatif = jamais (on n'ôte pas). */
  gapKcalPerDay: number;
}

export interface HouseholdResolution {
  mode: HouseholdLaneMode;
  referenceMemberId: string | null;
  trunk: TrunkSizing;
  deltas: MemberDelta[];
  /** LA MESURE qui armera ou non le slot de dressage (A3). */
  residualGaps: ResidualGap[];
  /** Un mineur est-il à table ? Les add-ons énergétiques passent en service familial. */
  familyService: boolean;
  issues: string[];
}

/**
 * LE CATALOGUE FERMÉ des aliments qu'un delta peut ajouter.
 *
 * Deux entrées seulement, et c'est le point: « plus du même » n'a pas besoin
 * d'un catalogue riche, il a besoin d'aliments que tout le monde a déjà dans
 * l'assiette. Un catalogue large recréerait le canal (c) par la bande.
 *
 * Les densités sont des ordres de grandeur, en kcal pour 100 g CRUS,
 * cohérentes avec `food_composition_refs`. Elles servent à DIMENSIONNER un
 * ajout, jamais à afficher un chiffre.
 */
const DELTA_CATALOGUE: ReadonlyArray<
  { foodRef: string; kcalPer100g: number; moment: MemberDelta["moment"]; channel: DeltaChannel; step: number }
> = [
  // (a) plus du même: le féculent du plat, en cuisine.
  { foodRef: "white_rice", kcalPer100g: 350, moment: "cooking", channel: "more_of_the_same", step: 30 },
  // (b) accompagnement usuel, servi à part.
  { foodRef: "wholemeal_bread", kcalPer100g: 250, moment: "plating", channel: "usual_side", step: 40 },
];

/** Le plus petit ajout qui vaille la peine d'être écrit sur une assiette. */
const MIN_DELTA_KCAL = 120;

/**
 * La résolution complète d'un foyer.
 *
 * L'ordre des étapes EST l'algorithme du design §4.1. Le verrou de lane est
 * évalué en premier, et rien d'autre ne tourne quand il mord: évalué après le
 * dimensionnement, il faudrait DÉFAIRE des enveloppes déjà posées, et un
 * défaisage se rate en silence.
 */
export function resolveHousehold(args: {
  members: readonly HouseholdMember[];
  declaredReferenceMemberId: string | null;
  composerMemberId: string | null;
  /** Combien de jours la génération couvre. Au moins 1. */
  daysCovered: number;
}): HouseholdResolution {
  const issues: string[] = [];
  const mode = householdLaneMode(args.members);
  const familyService = args.members.some((m) => m.ageState === "minor");

  if (mode === "per_portion") {
    // ── TOUTE LA LANE DÉGRADE ─────────────────────────────────────────────
    // Aucune enveloppe, aucun delta dimensionné, directions de service
    // qualitatives existantes seulement. Et le résultat est INDISCERNABLE d'un
    // foyer sans aucune enveloppe calculable — c'est ce qui empêche le verrou
    // de devenir un signal (« pourquoi notre foyer n'a plus de portions ? »).
    return {
      mode,
      referenceMemberId: referenceMemberId(
        args.members,
        args.declaredReferenceMemberId,
        args.composerMemberId,
      ),
      trunk: { energy: null, mouthsCounted: 0, mouthsStandard: 0 },
      deltas: [],
      residualGaps: [],
      familyService,
      issues,
    };
  }

  const trunk = trunkSizing(args.members);
  const deltas: MemberDelta[] = [];
  const residualGaps: ResidualGap[] = [];

  if (trunk.energy !== null) {
    for (const m of args.members) {
      // ── LA LIGNE QUI A DISPARU LE 2026-08-12, ET CE QU'ELLE COÛTAIT ────
      // Il y avait ici `if (m.ageState !== "adult") continue;`. Un mineur
      // n'avait donc NI enveloppe NI delta: il mangeait le tronc, c'est-à-dire
      // — dans le foyer d'une mère en `fat_loss` — le déficit de sa mère, sans
      // rien en plus. La garde qu'elle croyait tenir (« aucun delta dérivé d'un
      // objectif ») est tenue AILLEURS et mieux: `mouthEnvelope` ne passe aucun
      // jeton d'objectif à l'équation pédiatrique, qui n'en accepte pas. Le
      // delta d'un enfant se dimensionne sur sa MAINTENANCE, jamais sur une
      // direction.
      if (m.envelope?.mode !== "per_kg" || !m.envelope.energy) continue;
      // Ce qui manque à CE membre par rapport au tronc, en bas de bande: le
      // tronc est le MIN, donc l'écart est toujours ≥ 0. On n'ôte jamais.
      const gap = m.envelope.energy.low - trunk.energy.low;
      if (gap < MIN_DELTA_KCAL) {
        residualGaps.push({ memberId: m.memberId, gapKcalPerDay: Math.max(0, gap) });
        continue;
      }
      let remaining = gap;
      for (const item of DELTA_CATALOGUE) {
        if (remaining < MIN_DELTA_KCAL) break;
        const grams = Math.round(remaining / (item.kcalPer100g / 100) / item.step) * item.step;
        if (grams <= 0) continue;
        deltas.push({
          memberId: m.memberId,
          foodRef: item.foodRef,
          grams,
          // ── SERVICE FAMILIAL QUAND UN MINEUR EST À TABLE ─────────────
          // L'adulte décide quoi/quand/où, l'enfant décide combien (Satter).
          // Un add-on énergétique dressé en cuisine devant un enfant est
          // exactement la divergence qu'on ne veut pas rendre lisible.
          moment: familyService ? "plating" : item.moment,
          channel: item.channel,
        });
        remaining -= grams * (item.kcalPer100g / 100);
      }
      // ── L'INSTRUMENTATION D'A3 ─────────────────────────────────────────
      // Ce qui reste après les deux canaux. C'est LE chiffre qui armera ou non
      // le slot de dressage en 2e itération; sans lui, la décision se
      // prendrait à l'aveugle.
      residualGaps.push({
        memberId: m.memberId,
        gapKcalPerDay: Math.max(0, Math.round(remaining)),
      });
    }
  }

  if (trunk.mouthsStandard > 0) {
    // Compté, pas silencieux: c'est la part du foyer qui reçoit « standard »
    // faute d'enveloppe, et elle explique un tronc plus généreux qu'attendu.
    // Renommé d'`household_adults_without_envelope` le 2026-08-12: il comptait
    // des adultes quand le MIN ne portait que sur eux, et il compterait des
    // gens en croyant compter des adultes depuis que toute bouche pèse.
    issues.push(`household_mouths_without_envelope:${trunk.mouthsStandard}`);
  }

  return {
    mode,
    referenceMemberId: referenceMemberId(
      args.members,
      args.declaredReferenceMemberId,
      args.composerMemberId,
    ),
    trunk,
    deltas,
    residualGaps,
    familyService,
    issues,
  };
}

/**
 * Le payload des deltas, en base. R1: clés ASCII, snake_case.
 *
 * ⚠️ NE SORT JAMAIS: la raison d'un delta, l'objectif d'un membre, un
 * différentiel lisible, toute mention de corps ou de flag. Ce payload porte un
 * aliment et des grammes, comme n'importe quelle ligne de recette.
 */
export function memberDeltasPayload(
  deltas: readonly MemberDelta[],
): Array<Record<string, unknown>> {
  return deltas.map((d) => ({
    member_id: d.memberId,
    food_ref: d.foodRef,
    grams: d.grams,
    moment: d.moment,
    channel: d.channel,
  }));
}

/**
 * Les groupes sentinelles vérifiés AU NIVEAU DU TRONC.
 *
 * Couverts là, ils couvrent tout le foyer gratuitement — c'est le seul endroit
 * de ce chantier où une vérification collective coûte moins qu'une
 * vérification par personne.
 *
 * ⚠️ Vrai TANT QUE tout le monde mange le tronc. Un membre qui saute le repas
 * n'est pas couvert, et rien ne le sait (FF-043 §11 n°2).
 */
export function trunkSentinelGaps(
  missingAtTrunk: readonly FoodGroupRef[],
): FoodGroupRef[] {
  return [...missingAtTrunk];
}

/**
 * Un membre, tel que la lane foyer le fournit à la résolution.
 *
 * ⚠️ `lineBody` EST REQUIS ET POSITIONNEL, jamais optionnel. C'est le seul
 * mécanisme qui recense les appelants: le jour où ce lot est livré, une
 * fonction edge qui ne passe pas le corps de la fiche ne compile pas, au lieu
 * de continuer à composer des enfants sans enveloppe pendant six mois. « Un
 * paramètre de garde optionnel est une garde désarmée » est une cicatrice de ce
 * dépôt, et c'est exactement ce fichier-ci qui l'a payée.
 */
export function toHouseholdMember(
  member: PortionMember,
  accountEnvelope: Envelope | null,
  lineBody: MouthBody | null,
): HouseholdMember {
  return {
    memberId: member.memberId,
    displayName: member.displayName,
    ageState: member.ageState,
    goal: member.goal,
    envelope: mouthEnvelope({
      ageState: member.ageState,
      accountEnvelope,
      lineBody,
    }),
  };
}
