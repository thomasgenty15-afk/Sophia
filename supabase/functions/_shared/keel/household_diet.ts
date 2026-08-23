/**
 * KEEL — LE RÉGIME À TABLE : quel plat commun, et qui n'en mange pas.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME, ET IL SE MESURE EN UNE LIGNE ───────────
 *
 *     grep -c "diet" supabase/functions/generate-household-meal-v1/index.ts → 0
 *     grep -c "diet" supabase/functions/generate-meal-v1/index.ts           → 3
 *
 * `dietary_regime.ts` — le moteur qui étend un régime en groupes exclus, écrit
 * sa consigne et nomme ce qu'il rend incouvrable — n'était importé QUE par la
 * lane individuelle. Un maître végane qui composait pour son foyer recevait de
 * la viande: la question lui était posée, sa réponse écrite, et RIEN ne la
 * lisait sur le chemin MAJORITAIRE du produit.
 *
 * ── CE FICHIER N'INVENTE AUCUN MOTEUR ─────────────────────────────────────
 * Il ne connaît ni les groupes exclus, ni les formes de surface, ni la phrase
 * de consigne: tout vient de `dietary_regime.ts`. Ce qu'il ajoute est ce que ce
 * module-là ne pouvait pas savoir — qu'il y a PLUSIEURS bouches autour d'une
 * seule casserole, et ce que ça décide.
 *
 * ── R4 · LE PLAT COMMUN SUIT LE PLUS RESTRICTIF DE LA TABLE ───────────────
 * Un omnivore peut manger un plat végétarien; l'inverse est faux. C'est
 * l'exacte symétrie de l'union des allergies, déjà en place, et du critère de
 * D6 — « une casserole peut toujours en donner moins, jamais plus qu'elle n'en
 * contient ».
 *
 * ── R5 · ET C'EST UN CAS DE DIVERGENCE ────────────────────────────────────
 * Sans cette moitié, un seul végane impose le végane à six personnes, en
 * silence. Avec, la personne dont la DIRECTION DE SERVICE ne sort plus de la
 * casserole descendue au plus strict reçoit son plat à elle — et seulement si
 * le temps de cuisine le permet, ce que l'appelant arbitre déjà (G5).
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  DIETARY_REGIMES,
  type DietaryRegime,
  dietaryRegimePromptLine,
  excludedGroupsFor,
  parseDietaryRegime,
} from "./dietary_regime.ts";
import { PROTEIN_SOURCES } from "./tokens.ts";
import {
  type AxisDemand,
  SERVING_AXES,
  SERVING_DEMANDS,
  type ServingAxisDemands,
  type ServingDemand,
} from "./household_portions.ts";

// ---------------------------------------------------------------------------
// 1. LE VOCABULAIRE — quatre réponses, dont une qui n'est pas un régime
// ---------------------------------------------------------------------------

/**
 * LES QUATRE RÉPONSES DE L'ÉCRAN. `omnivore` d'abord, parce que c'est celle
 * qu'on donne en ne se restreignant pas.
 *
 * ⚠️ `omnivore` EST UNE RÉPONSE, PAS UNE ABSENCE, et il n'est PAS un régime: il
 * n'exclut rien, il n'a pas de consigne, il ne peut jamais être « le plus
 * strict ». Il existe parce que `null` doit continuer de vouloir dire « personne
 * n'a demandé » — et sur une question de sécurité alimentaire, ces deux-là ne
 * sont pas la même chose (c'est le piège exact de l'accusé d'allergie, et il
 * coûte ici un plan de viande servi à un végétarien).
 *
 * Les trois autres sont `DIETARY_REGIMES`, LU et pas recopié: une seconde liste
 * de jetons divergerait de la première le jour où un quatrième régime arrive,
 * et c'est l'écran qui offrirait une case qu'aucun verrou n'honore.
 */
export const HOUSEHOLD_DIET_ANSWERS = [
  "omnivore",
  ...DIETARY_REGIMES,
] as const;
export type HouseholdDietAnswer = typeof HOUSEHOLD_DIET_ANSWERS[number];

/**
 * Le régime d'une bouche, ou `null`.
 *
 * ⚠️ REND `null` POUR `omnivore`, ET C'EST TOUT L'INTÉRÊT. Ce module ne
 * raisonne que sur des RESTRICTIONS: « je mange de tout » n'en pose aucune, et
 * le distinguer de « personne n'a demandé » est le travail de l'écran et de la
 * base, pas celui de la casserole.
 */
export function memberRegime(value: unknown): DietaryRegime | null {
  return parseDietaryRegime(value);
}

// ---------------------------------------------------------------------------
// 2. R4 — LE PLUS RESTRICTIF DE LA TABLE
// ---------------------------------------------------------------------------

/**
 * COMBIEN DE GROUPES CE RÉGIME RETIRE — lu sur le moteur, jamais compté à la
 * main. C'est ce nombre qui ordonne les régimes, et il n'a le droit de le faire
 * QUE parce que leurs exclusions sont emboîtées:
 *
 *     pescatarian ⊂ vegetarian ⊂ vegan
 *
 * Ce n'est pas une croyance: `household_diet_test.ts` le PROUVE sur la liste
 * fermée, paire par paire. Le jour où un régime non comparable entre (« pas de
 * poisson mais de la viande »), ce test rougit AVANT que ce classement ne
 * choisisse un plus-strict qui n'exclut pas tout ce que la table exclut.
 */
function exclusionCount(regime: DietaryRegime): number {
  return excludedGroupsFor(regime).length;
}

/**
 * R4 — LE RÉGIME QUE LE PLAT COMMUN DOIT SUIVRE. `null` = personne n'a rien
 * déclaré, et alors RIEN ne change: aucun bloc, aucune ligne, aucun jeton dans
 * le prompt. C'est le désarmement, et il est tenu par un test d'égalité de
 * chaîne.
 */
export function strictestRegimeAt(
  diets: readonly (unknown)[],
): DietaryRegime | null {
  let strictest: DietaryRegime | null = null;
  for (const raw of diets) {
    const regime = memberRegime(raw);
    if (regime === null) continue;
    if (strictest === null || exclusionCount(regime) > exclusionCount(strictest)) {
      strictest = regime;
    }
  }
  return strictest;
}

// ---------------------------------------------------------------------------
// 3. R5 — CE QUE LE PLUS STRICT RETIRE À UNE DIRECTION DE SERVICE
// ---------------------------------------------------------------------------

/**
 * LES ANCRES PROTÉIQUES VÉGÉTALES — le complément, écrit à la main et fermé.
 *
 * ⚠️ ON NOMME LES TROIS EXCEPTIONS, PAS LES SEPT AUTRES, et c'est le sens de la
 * liste. Le jour où un groupe animal rejoint `PROTEIN_SOURCES`, il est compté
 * ici SANS QU'ON Y TOUCHE; une liste d'animaux écrite à la main, elle, aurait
 * gardé l'ancien monde en silence. C'est la même discipline que
 * `PROTEIN_SOURCES` applique à `FOOD_GROUP_REFS`.
 *
 * `lean_protein` en fait partie parce qu'il est AMBIGU — le groupe désigne
 * aussi bien un blanc de poulet qu'un tofu, et `dietary_regime.ts` refuse
 * délibérément de l'exclure pour cette raison exacte. Le compter comme animal
 * rendrait TOUT régime incapable de le retirer, donc aucun régime ne
 * plafonnerait jamais rien.
 */
const PLANT_PROTEIN_ANCHORS: readonly string[] = [
  "legumes",
  "tofu_tempeh",
  "lean_protein",
];

/** Les ancres protéiques d'origine animale, DÉRIVÉES de `PROTEIN_SOURCES`. */
const ANIMAL_PROTEIN_ANCHORS: readonly string[] = PROTEIN_SOURCES.filter(
  (g) => !PLANT_PROTEIN_ANCHORS.includes(g),
);

/**
 * LE PLAFOND QU'UN RÉGIME POSE SUR L'AXE PROTÉINE — ARBITRAGE, ÉCRIT UNE FOIS.
 *
 * ── CE QUI EST AFFIRMÉ, ET CE QUI NE L'EST PAS ────────────────────────────
 * On n'affirme PAS qu'un plat sans protéine animale manque de protéine: c'est
 * faux, et `dietary_regime.ts` a déjà refusé de le dire (il n'exclut même pas
 * `lean_protein`, pour ne pas interdire le tofu à un végétarien).
 *
 * Ce qu'on affirme est une propriété de CASSEROLE COMMUNE, et elle est
 * structurelle: quand toutes les ancres animales sont retirées, la protéine du
 * plat vient des légumineuses et du soja — qui portent leur féculent avec eux.
 * L'axe protéine ne se pousse alors plus INDÉPENDAMMENT: servir « une plus
 * grande part de protéine » à quelqu'un, c'est lui servir une plus grande part
 * de tout. `full` reste servable (on lui donne toute sa part); `larger` ne
 * l'est pas, parce qu'il demande une part SUPÉRIEURE à celle de la table sur un
 * seul axe.
 *
 * ── POURQUOI ÇA S'ARRÊTE À `full` ET PAS PLUS BAS ─────────────────────────
 * `full` est déjà au-dessus de `balanced` (« toujours servable » au sens de
 * `servingConflicts`), et le descendre à `balanced` ferait diverger un
 * `fat_loss` ou un `recomposition` à chaque table végane — c'est-à-dire
 * fabriquer un second plat pour presque tout le monde. Le temps de cuisine
 * paierait pour une distinction que la casserole sait tenir.
 *
 * ⚠️ SEUL L'AXE PROTÉINE EST PLAFONNÉ. Un régime ne retire ni féculent ni
 * légume: y poser un plafond serait une opinion sans mécanique derrière.
 */
const REGIME_PROTEIN_CEILING: ServingDemand = "full";

/**
 * CE RÉGIME RETIRE-T-IL TOUTE ANCRE PROTÉIQUE ANIMALE ?
 *
 * LU sur `excludedGroupsFor`, jamais écrit ici. Aujourd'hui: `vegan` oui,
 * `vegetarian` non (il garde les œufs et le yaourt), `pescatarian` non. C'est
 * EXACTEMENT ce qui sépare les deux cas de la vérification — une table
 * végétarienne compose un seul plat, une table végane peut en composer deux.
 */
export function regimeCapsProtein(regime: DietaryRegime): boolean {
  const excluded = new Set<string>(excludedGroupsFor(regime));
  return ANIMAL_PROTEIN_ANCHORS.every((g) => excluded.has(g));
}

/** Le rang d'une demande sur l'échelle du dépôt. `-1` = hors échelle. */
function demandRank(demand: AxisDemand): number {
  if (demand === null || demand === undefined || demand === "unreadable") return -1;
  return (SERVING_DEMANDS as readonly string[]).indexOf(demand);
}

/**
 * R5 — LES AXES SUR LESQUELS LA CASSEROLE DESCENDUE AU PLUS STRICT NE PEUT PAS
 * SERVIR CETTE BOUCHE.
 *
 * ⚠️ MÊME VOCABULAIRE DE SORTIE QUE `servingConflicts` (`axis:demand_above_…`),
 * parce que les deux répondent à la même question et finissent dans le même
 * journal. Un second vocabulaire aurait rendu les traces incomparables.
 *
 * ⚠️ `unreadable` NE COMPTE PAS ICI, ET C'EST DÉLIBÉRÉ. `servingConflicts` le
 * traite déjà comme un conflit, sur le MÊME membre et dans le MÊME appelant:
 * le compter une seconde fois ferait lever un plat dédié « pour le régime » à
 * quelqu'un dont c'est la direction qu'on n'a pas su lire. Une raison fausse
 * dans une trace coûte une journée à celui qui la relit.
 */
export function dietServingConflicts(
  regime: DietaryRegime,
  demands: ServingAxisDemands,
): string[] {
  if (!regimeCapsProtein(regime)) return [];
  const conflicts: string[] = [];
  for (const axis of SERVING_AXES) {
    if (axis !== "protein") continue;
    const want = demands[axis];
    const rank = demandRank(want);
    if (rank < 0) continue;
    if (rank > demandRank(REGIME_PROTEIN_CEILING)) {
      conflicts.push(`${axis}:${String(want)}_above_regime`);
    }
  }
  return conflicts;
}

/**
 * R5 — CETTE BOUCHE DOIT-ELLE RECEVOIR SON PLAT À ELLE ?
 *
 * DEUX PRÉMISSES, ET LES DEUX SONT ARMÉES:
 *
 *   ① LE PLUS STRICT DE LA TABLE EST PLUS STRICT QUE LE SIEN. Une personne qui
 *      porte elle-même le régime le plus strict n'est privée de rien: le plat
 *      commun EST son plat. Sans cette prémisse, une table entièrement végane
 *      lèverait un second plat pour un végane en prise de masse — un plat végane
 *      de plus, cuisiné à côté d'un plat végane.
 *   ② SA DIRECTION NE SORT PLUS DE LA CASSEROLE. C'est `dietServingConflicts`,
 *      et c'est ce qui empêche ce lot de fabriquer un plat par différence de
 *      régime: un omnivore sans objectif à une table végane mange le plat
 *      végane, comme avant, et personne ne cuisine deux fois.
 *
 * ⚠️ LE TEMPS N'EST PAS ICI, ET IL NE DOIT PAS Y ÊTRE. `timeAllowsASecondDish`
 * plafonne DÉJÀ, une seule fois, chez l'appelant (G5). Le relire ici ferait deux
 * endroits qui décident du même second plat, et le jour où le seuil bouge, un
 * seul des deux le saurait.
 */
export function dietDiverges(args: {
  strictest: DietaryRegime | null;
  /** Le régime de CETTE bouche, déjà résolu par le roster. */
  own: DietaryRegime | null;
  demands: ServingAxisDemands;
}): boolean {
  const { strictest, own, demands } = args;
  if (strictest === null) return false;
  const ownCount = own === null ? 0 : exclusionCount(own);
  if (ownCount >= exclusionCount(strictest)) return false;
  return dietServingConflicts(strictest, demands).length > 0;
}

// ---------------------------------------------------------------------------
// 4. LE BLOC DE PROMPT — la consigne du moteur, jamais une phrase neuve
// ---------------------------------------------------------------------------

/**
 * LE BLOC QUI PART DANS LE PROMPT DU FOYER, ou `""` quand personne n'a rien
 * déclaré.
 *
 * ⚠️ LA CONSIGNE EST CELLE DE `dietaryRegimePromptLine`, MOT POUR MOT. C'est
 * elle qui nomme les familles UNE PAR UNE et qui dit que la règle vaut jusque
 * dans les fonds, les sauces et les garnitures — c'est-à-dire très exactement
 * là où passent le nuoc-mâm, la gélatine et le bouillon de volaille d'une soupe
 * « de légumes ». Une phrase neuve écrite ici aurait compté sur la culture du
 * modèle pour dériver la liste, et le fichier voisin documente ce que ça coûte.
 *
 * ⚠️ ELLE DIT « This student is ». Le foyer n'a pas d'élève, et la ligne
 * d'encadrement au-dessus est là POUR ÇA: elle dit que ce qui suit gouverne LE
 * PLAT PARTAGÉ, pas une personne. On ne récrit pas la phrase du moteur pour un
 * pronom — deux versions d'une même consigne divergeraient sur le contenu, qui
 * est la moitié qui protège.
 *
 * ⚠️ AUCUN NOM DE RÉGIME NE PART DANS UNE LISTE D'ÉVITEMENT depuis ici, et le
 * fichier voisin dit pourquoi en majuscules: armer une ceinture sur « vegan »
 * ferait rejeter toute réponse qui décrit un plat comme végan — donc précisément
 * les bonnes réponses, et seulement pour les végans.
 */
export function householdDietBlock(args: {
  strictest: DietaryRegime | null;
  /** Les prénoms des bouches qui portent le régime le plus strict. */
  heldBy: readonly string[];
  /** Les prénoms des bouches qui reçoivent leur plat à elles (R5). */
  divergingNames: readonly string[];
}): string {
  if (args.strictest === null) return "";
  const held = args.heldBy.filter((n) => String(n ?? "").trim().length > 0);
  const lines = [
    "== WHAT THE SHARED DISH MUST RESPECT ==",
    // R4, DIT AU MODÈLE COMME UNE RÈGLE DE CASSEROLE ET PAS COMME UNE OPINION.
    "The dish the table shares follows the STRICTEST line declared at this",
    "table. The next sentence is about that SHARED DISH, not about one person:",
    dietaryRegimePromptLine(args.strictest),
  ];
  if (held.length > 0) {
    // LE FAIT, PAS LE REPROCHE — et il sert à quelque chose: sans le nom, le
    // modèle écrit « pour respecter le régime » dans des consignes lues à voix
    // haute à table. Avec, il sait que c'est une ligne de quelqu'un et n'a
    // aucune raison de la commenter.
    lines.push(
      `This is the line of: ${held.join(", ")}. Never write it as a reason in`,
      "anything read at the table.",
    );
  }
  if (args.divergingNames.length > 0) {
    lines.push(
      `${args.divergingNames.join(", ")} cannot be served from that shared dish`,
      "(their line above says so): their OWN dish is not bound by the sentence",
      "above, and may use what the shared dish leaves out.",
    );
    // ══ L'EXCEPTION À « NEVER NONE », NOMMÉE — ET ELLE EST LA CAUSE ═══════
    //
    // ⛔ MESURÉ CINQ PLANS SUR CINQ (2026-08-19): un enfant VÉGANE de 9 ans
    // reçoit `Rich Smoky Beef Stew 207 g` dans la phrase lue à table. Le
    // modèle n'a pas désobéi — IL A OBÉI. Le brief des boîtes lui ordonne, en
    // toutes lettres, « That is 4 people to weigh out on EVERY preparation …
    // Every name above is in exactly ONE box of each preparation -- never
    // two, never none. » Dès que le barreau ② ouvre un plat DÉDIÉ (donc non
    // borné par la ligne ci-dessus), cette consigne exige une boîte au nom du
    // végane sur la casserole de bœuf. Deux ordres contradictoires dans un
    // seul prompt, et c'est toujours celui qu'on ne relit pas qui gagne.
    //
    // ⚠️ TROIS LIGNES, ET SEULEMENT SOUS LA DIVERGENCE. La lane foyer frôle le
    // mur de temps du worker: sans plat dédié, toute préparation suit la ligne
    // stricte, il n'y a rien à excepter, et le prompt reste byte-identique à
    // celui d'avant ce lot. Un test tient cette égalité.
    //
    // ⚠️ L'ÉCHAPPATOIRE EST NOMMÉE LITTÉRALEMENT (« never none »), parce que
    // ce dépôt a mesuré qu'une consigne qui dit seulement « sois cohérent »
    // se fait satisfaire par une paraphrase (run E1, découpage de classe
    // réduit de 2,0:1 à 1,5:1 au lieu d'être abandonné).
    //
    // ⚠️ ET LA CEINTURE NE DÉPEND PAS DE CES LIGNES. Elles réduisent le
    // travail du parseur; elles ne le remplacent pas. « Une consigne de prompt
    // régresse en réel » est la phrase fondatrice du verrou voisin.
    if (held.length > 0) {
      lines.push(
        `${held.join(", ")} take no box and no share of those own dishes: on a`,
        "preparation that breaks the line above they are left out on purpose,",
        'and the other names still get theirs -- the one exception to "never none".',
      );
    }
  }
  return lines.join("\n");
}
