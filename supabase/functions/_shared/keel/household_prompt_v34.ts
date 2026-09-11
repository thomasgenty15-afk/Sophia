/**
 * LE BRIEF DU FOYER, EN QUATRE TEMPS — cartes, calendrier, méthode, schéma.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ LOT 11 (2026-09-07) — POURQUOI UNE SECONDE STRUCTURE, ET PAS UNE BRANCHE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * v33 empile vingt et un blocs dans l'ordre où ils sont arrivés au produit. Ça
 * marche tant que le modèle DÉCIDE — qui mange, qui a un plat à part, combien
 * chacun reçoit. La méthode du foyer lui retire ces trois décisions: le moteur
 * les prend avant le prompt (`household_cells.ts`), et le modèle ne compose
 * plus que des recettes. Un brief qui donne des faits déjà tranchés ne se lit
 * pas comme un brief qui demande des arbitrages: il se lit comme une FICHE DE
 * TRAVAIL, et c'est la forme que ce module écrit.
 *
 * ── ⛔ POURQUOI UN FICHIER À PART ─────────────────────────────────────────
 * Trois gardes lisent `household_meal_generation.ts` COMME DU TEXTE
 * (`swap_presence_test.ts` cherche quatre phrases littérales et une adjacence
 * à la clé `"boxes"`; `precedence_binding.ts` lit sa déclaration de version au
 * ancrée sur le nom exact). Un fichier qu'on ne modifie pas ne casse aucune
 * d'elles. Et les quinze épreuves d'identité de v33 (« entrée absente ⇒ bloc
 * absent ⇒ suffixe inchangé ») restent vraies par construction, puisque leur
 * constructeur n'a pas bougé.
 *
 * ── CE QUI EST REPRIS VERBATIM, ET POURQUOI ───────────────────────────────
 * Tous les VERROUS alimentaires viennent de v33, appelés, jamais recopiés:
 * régime partagé, règles de maison, contact croisé, cuisine, traditions,
 * notes, envie, faits déjà décidés. Deux raisons: leur texte est le produit de
 * défauts mesurés qu'on ne veut pas rejouer; et `precedence_tail.ts` CITE
 * TROIS DE LEURS EN-TÊTES mot pour mot (`WHAT THE SHARED BASE MUST RESPECT`,
 * `HOUSE RULES`, `THE SAME KITCHEN, TWO DISHES`) — les renommer changerait
 * l'empreinte d'arbitrage.
 *
 * ── ⛔ CE QUI N'Y EST PAS, ET C'EST LA MOITIÉ DU LOT ──────────────────────
 *   · aucun fait de corps (ni taille, ni poids, ni âge en nombre);
 *   · aucun kcal, sauf les deux planchers de densité, qui sont des faits sur
 *     un PLAT et non sur une personne;
 *   · aucun schéma de boîte, aucune portion nommée: le moteur autore les
 *     couvercles.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  dedicatedDishBlock,
  decidedBeforeYouBlock,
  dishOwnerSchemaBlock,
  EXPLANATION_SCHEMA_BLOCK,
  type HouseholdPromptBlocks,
  type HouseholdPromptInput,
  kitchenBlock,
  memberIdRosterLines,
  notesBlock,
  restrictionBlock,
  LIGHT_DISH_MIN_KCAL_PER_100G,
  NORMAL_DISH_MIN_KCAL_PER_100G,
  standardRecipeBlock,
  whyRuleBlock,
  whyRuleSchemaBlock,
  workLunchBlock,
} from "./household_meal_generation.ts";
import {
  cellDensityOf,
  cellDensitySentence,
  DENSITY_CONSEQUENCE,
  densityFloorsOf,
  densityFragment,
} from "./household_portions.ts";
import type { RequiredDensity, SlotDensity } from "./portion_sizing.ts";
import { buildHouseholdVoices } from "./household_voices.ts";
import { buildEnvyBlock } from "./household_envies.ts";
import { traditionBlock } from "./household_traditions.ts";
import { crossContactBlock } from "./cross_contact.ts";
import {
  habitFragment,
  habitNoteFragment,
  HABIT_CONSEQUENCE,
} from "./household_habits.ts";
import type { HouseholdCell } from "./household_cells.ts";

/**
 * ⛔ SON PROPRE JETON, ET UN NOM DIFFÉRENT DE `HOUSEHOLD_PROMPT_VERSION`.
 *
 * `precedence_binding.ts::readHouseholdPromptVersion` exige **exactement une**
 * déclaration `export const HOUSEHOLD_PROMPT_VERSION = "…";` dans le fichier
 * v33. Un second nom ne la voit pas, donc v33 garde sa version, ses six
 * épingles ne bougent pas, et la ligne écrite en base dit laquelle des deux
 * structures a réellement été servie.
 */
export const HOUSEHOLD_PROMPT_V34_VERSION =
  "v34_one_card_per_person_the_engine_weighs";

/**
 * LE PLANCHER DE BOUCHES À PARTIR DUQUEL v34 EST SERVI.
 *
 * ⚠️ `2` AUJOURD'HUI, ET C'EST UNE DÉCISION DE SÉQUENCE, PAS DE FOND. Une
 * bouche seule reçoit déjà v33 + `STANDARD_RECIPE_BLOCK`, mesuré et vert au
 * banc solo; la refaire passer par les cartes le même jour mélangerait deux
 * changements dans un seul run. Le lot 15 descend cette borne à 1, et le tir
 * `qa-solo` compare les deux structures sur le même foyer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE CETTE BORNE COÛTE AUJOURD'HUI — TROUVÉ LE 2026-09-08
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `platedMembers` n'est PAS le roster du foyer. Il part de `composedMembers`
 * et retire encore les bouches absentes toute la fenêtre. **Un foyer de DEUX
 * personnes dont l'une est absente toute la semaine — ou qui a pris la main sur
 * son propre plan — rend `platedMembers.length === 1`**, et bascule donc en
 * silence des cartes (v34) au brief de portions (v33).
 *
 * ⚠️ CE N'EST PLUS THÉORIQUE DEPUIS LA BASCULE: un foyer de deux bouches
 * atteint `portion_v1` depuis l'écran. La structure de son brief change donc
 * le jour où quelqu'un part en déplacement, et rien ne le lui dit.
 *
 * ⛔ ET LA DESCENDRE À 1 NE PEUT PAS ÊTRE MESURÉE CE SOIR: le banc du foyer ne
 * porte que `duo`, `quatre` et `cinq` — aucune fixture à UNE bouche plated. La
 * changer sans tir serait exactement ce que ce commentaire interdit deux
 * paragraphes plus haut. Le lot 15 doit d'abord fabriquer cette fixture.
 */
export const PORTION_V34_MIN_MOUTHS = 2;

/** Ce que le calendrier a besoin de savoir d'une bouche pour la nommer. */
export interface V34Naming {
  memberId: string;
  displayName: string;
}

export interface HouseholdPromptV34Input extends HouseholdPromptInput {
  /** La grille du lot 9 — la SEULE source de « qui mange quand ». */
  cells: readonly HouseholdCell[];
  /**
   * CE QUE LA CARTE D'UNE BOUCHE PORTE EN PLUS de ce que `PortionMember` sait.
   *
   * ⛔ REQUIS, jamais `?`. Un défaut silencieux ferait des cartes muettes sur
   * le régime et sur ce que la personne mange déjà à côté — c'est-à-dire un
   * brief qui a l'air complet et qui a perdu la moitié de ce qu'il devait
   * dire. `{}` est une valeur légitime et explicite; l'absence ne l'est pas.
   *
   * ⚠️ AUCUN FAIT DE CORPS N'ENTRE ICI, et le type le rend impossible: rien
   * qu'un régime en mot et des lignes de prose déjà écrites par l'appelant.
   */
  cardFacts: Readonly<
    Record<
      string,
      {
        diet: string | null;
        /**
         * ⛔ REQUIS-NULLABLE, jamais optionnel (2026-09-08). L'appelant DOIT
         * dire s'il a une densité pour cette personne. Une clé absente se
         * relirait comme « pas de densité » là où la vraie réponse peut être
         * « personne ne l'a calculée » — et c'est exactement le silence qui a
         * fait servir 850 g à un adolescent.
         */
        requiredDensity: RequiredDensity | null;
      }
    >
  >;
}

// ═══════════════════════════════════════════════════════════════════════════
// A — UNE CARTE PAR PERSONNE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE MOT D'ÂGE, ET RIEN QUE LE MOT.
 *
 * ⛔ JAMAIS UN NOMBRE. Un âge sert ici à la COMPOSITION (les épices, le piment,
 * l'alcool de cuisine, ce qu'un enfant mange volontiers), jamais à la
 * quantité — celle-là est calculée. Écrire « 9 ans » rouvrirait la porte que
 * v33 a fermée en retirant les faits de corps, et il n'y a aucune recette qui
 * se compose mieux avec le nombre qu'avec le mot.
 */
function ageWordOf(ageState: string): string | null {
  return ageState === "minor" ? "a child or teenager" : null;
}

function cardFor(
  m: HouseholdPromptInput["members"][number],
  extras: {
    diet: string | null;
    voices: readonly string[];
    /**
     * ⛔ LA DENSITÉ REQUISE DE CETTE PERSONNE, MOMENT PAR MOMENT (2026-09-08).
     *
     * Elle manquait, et c'était la cause mesurée du débordement des assiettes:
     * le foyer ne recevait que les DEUX planchers génériques du bloc de recette
     * (100 kcal/100 g en normal, 60 en léger). Or l'ado du foyer `quatre` a
     * besoin de 984 kcal au déjeuner dans 650 g au plus, soit **151 kcal/100 g**.
     * Le modèle a écrit une recette à 116 — au-dessus du plancher qu'on lui
     * avait donné, et très en dessous de ce qu'il fallait: 850 g servis.
     *
     * ⚠️ CE N'EST PAS UN FAIT DE CORPS. C'est un fait sur le PLAT servi à ce
     * moment-là, exactement comme sur la ligne de portion v33 — d'où la même
     * fonction de rendu, `densityFragment`, et pas une seconde rédaction.
     */
    density: string;
  },
): string[] {
  const out: string[] = [`== ${m.displayName} (${m.memberId}) ==`];
  if (extras.diet) out.push(`  diet: ${extras.diet}`);
  const age = ageWordOf(String(m.ageState));
  if (age) out.push(`  who: ${age}`);
  // Les moments, avec leur caractère. ⛔ JAMAIS `size` (small/medium/large):
  // le produit l'a écarté, et deux vocabulaires de taille dans la même ligne
  // se contrediraient.
  const slots = m.eatingSlots ?? null;
  if (slots !== null && slots.length > 0) {
    const light = new Set(m.lightSlots ?? []);
    out.push(
      `  eats at ${
        slots.map((o) => light.has(o.slot) ? `${o.slot} (light)` : o.slot).join(", ")
      } only`,
    );
  }
  // Les habitudes, par les MÊMES fonctions que v33 — pas une seconde prose.
  const own = habitFragment(m.habits ?? []).trim();
  if (own) out.push(`  ${own.replace(/^—\s*/, "")}`);
  const said = habitNoteFragment(m.habitNote ?? null).trim();
  if (said) out.push(`  ${said.replace(/^—\s*/, "")}`);
  for (const v of extras.voices) out.push(`  said: ${v}`);
  // ⛔ EN DERNIER SUR LA CARTE, ET C'EST VOULU: la densité est une CONSÉQUENCE
  // de tout ce qui précède (ce qu'elle mange, et quand). La mettre en tête la
  // ferait lire comme une préférence.
  if (extras.density !== "") out.push(` ${extras.density.replace(/^\s*—\s*/, "— ")}`);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// B — LE CALENDRIER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE CALENDRIER — ce que le moteur a DÉJÀ tranché, cellule par cellule.
 *
 * ⛔ LES CASES VIDES SONT NOMMÉES, ET C'EST LE POINT. « Personne ne mange ici,
 * n'écris pas de plat » est une consigne; l'absence de ligne n'en est pas une,
 * et un modèle comble les silences. Mesuré à l'envers sur v33: le plan servait
 * des dîners que personne n'avait déclarés.
 *
 * ⚠️ LA PHRASE D'EN-TÊTE PORTE LA MOITIÉ DU CHANGEMENT. Sans elle, un
 * calendrier qui dit « 4 mangent » se lit « écris une recette pour quatre » —
 * c'est-à-dire exactement ce que v33 demandait, et ce que la méthode retire.
 */
function calendarBlock(
  cells: readonly HouseholdCell[],
  nameOf: ReadonlyMap<string, string>,
  /**
   * ⟳ LOT C · C3 (2026-09-11) — LES COULOIRS NOMMÉS DE CHAQUE BOUCHE.
   *
   * ⛔ REQUIS, `Map` vide pour « personne n'en a », jamais optionnel. Une carte
   * absente et une carte sans densité se liraient pareil, et la conséquence
   * serait un calendrier muet sur la seule contrainte qui décide de la taille
   * des assiettes. `{}` est une valeur légitime; l'absence ne l'est pas.
   *
   * ⛔ `named` SEULEMENT, comme sur les cartes. `floorOnly` porte la densité
   * d'une bouche sous plancher TCA, qui ne doit paraître en face d'aucun nom —
   * et une ligne de case NOMME ses mangeurs. Elle atteint le modèle par le
   * plancher COMMUN du bloc de recette, où elle se confond avec les autres.
   */
  corridorsOf: ReadonlyMap<string, readonly SlotDensity[]>,
): string {
  if (cells.length === 0) return "";
  const who = (id: string) => nameOf.get(id) ?? id;
  const rows: string[] = [];
  // ⚠️ L'EN-TÊTE SUIT LES LIGNES, IL NE LES DEVINE PAS. Il n'est écrit que si
  // au moins une case a REÇU des chiffres — une phrase qui annonce des figures
  // au-dessus d'un calendrier qui n'en porte aucune est du bruit, et le bruit
  // dévalue les consignes qui l'entourent.
  let anyCorridor = false;
  for (const c of cells) {
    if (c.empty) {
      rows.push(`${c.day} ${c.slot}: nobody eats — write NO dish.`);
      continue;
    }
    const mark = c.character === "light" ? " (light)" : "";
    const names = c.eaters.map(who).join(", ");
    let line = `${c.day} ${c.slot}${mark}: ${c.eaters.length} eat — ${names}.`;
    if (c.dedicated.length > 0) {
      line += ` A dish of their own is ordered for ${
        c.dedicated.map((d) => `${who(d.memberId)} (${d.memberId})`).join(", ")
      }.`;
    }
    // ── LE COULOIR DE LA CASSEROLE COMMUNE ────────────────────────────────
    // ⛔ LES BOUCHES QUI ONT LEUR PROPRE PLAT SORTENT DE L'INTERSECTION: elles
    // ne mangent pas dans cette casserole, et les y garder resserrerait la
    // bande au nom de quelqu'un qui n'y puise pas.
    const ownDish = new Set(c.dedicated.map((d) => d.memberId));
    const sharers = c.eaters.filter((id) => !ownDish.has(id)).map((id) => ({
      name: who(id),
      slots: corridorsOf.get(id) ?? [],
    }));
    // ⟳ 2026-09-11 · LOT B — LA CASE DIT SON JOUR. Un moment peut porter deux
    // couloirs (deux grappes de jours); prendre « le premier dîner trouvé »
    // servirait la bande d'une autre date.
    const density = cellDensityOf(sharers, String(c.slot), String(c.day));
    // ⚠️ DEUX MANGEURS AU MINIMUM POUR LA LIGNE NOMINALE, ET C'EST UN CHOIX DE
    // BUDGET ARGUMENTÉ: à un seul mangeur, l'intersection EST son couloir, déjà
    // écrit sur sa carte. Le répéter sur chaque case coûterait vingt fois pour
    // zéro information. Un CONFLIT, lui, sort toujours — il ne peut pas
    // apparaître à un seul mangeur, et il est ce que le modèle ne peut pas
    // déduire.
    if (density !== null && (density.empty || density.eatersWithCorridor >= 2)) {
      line += cellDensitySentence(density);
      anyCorridor = true;
    }
    rows.push(line);
  }
  // ⚠️ L'UNITÉ EST DITE ICI, UNE FOIS. Vingt et une cases × « kcal per 100 g »
  // feraient une ligne qu'on saute — la propriété que `densityFragment` tient
  // déjà sur ses moments (`one(d, i === 0)`). La garde du brief (« aucun kcal
  // nu ») reste satisfaite: le seul `kcal` de ce bloc est suivi de `per 100 g`.
  return [
    "== THE CALENDAR — WHO EATS, CELL BY CELL ==",
    "The engine worked this out from what each person declared. Do not re-decide",
    "it, and do not fill a cell it leaves empty.",
    "The number of eaters NEVER changes a recipe: every dish is written for ONE.",
    ...(anyCorridor
      ? [
        "Where a cell carries figures, they are kcal per 100 g of that dish as",
        "served, and they are the band EVERY eater of that cell can live with at",
        "once — already worked out from their cards, so you do not have to.",
      ]
      : []),
    "",
    ...rows,
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// C — LA MÉTHODE, EN SIX TEMPS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'ORDRE EST LA CONSIGNE. Chaque étape ne dépend que de ce qui précède, et ce
 * que le moteur a déjà tranché n'est plus une question. C'est ce qui distingue
 * une méthode d'une liste de contraintes: on peut la SUIVRE.
 */
function methodBlock(anyDedicated: boolean): string {
  return [
    "== THE METHOD, IN ORDER ==",
    "",
    "1. HARD LINES FIRST. An allergy of anyone who eats a dish applies to that",
    "   dish and to every preparation it draws on. A dish of someone's own frees",
    "   only that person. Something a person keeps off their plate applies to",
    "   every dish THEY eat, and not to the others'. The shared dish of a cell",
    "   follows the diet the calendar prints for that cell. The blocks headed",
    "   WHAT THE SHARED BASE MUST RESPECT, HOUSE RULES and THE SAME KITCHEN,",
    "   TWO DISHES below are the last word on all of this.",
    "",
    "2. LAY OUT THE COOKING SESSIONS. Which days you cook, which preparations,",
    "   and which cells each preparation feeds. A preparation must be cooked",
    "   before the first meal that draws on it.",
    "",
    "3. COMPOSE EACH CELL, IN CALENDAR ORDER. The shared dish first, then any",
    "   dish of someone's own the calendar orders" +
    (anyDedicated ? " (see A DISH OF THEIR OWN)." : "."),
    "   The shared dish of a cell must suit EVERY one of its eaters at once.",
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ LE MAXIMUM, PAS LA MOYENNE — MESURÉ AU TIR `DENSITE` (2026-09-08)
    // ══════════════════════════════════════════════════════════════════════
    //
    // Les cartes portent enfin la densité de CHAQUE personne, et le plan s'est
    // beaucoup amélioré (850 g → 724 g sur l'assiette de l'ado). Mais deux
    // assiettes dépassaient encore, et toujours les mêmes: celles de la
    // personne la plus exigeante de la table.
    //
    // Au déjeuner, les quatre cartes demandaient 105, 122, 139 et **167**
    // kcal/100 g. Le modèle a écrit **136** — c'est-à-dire à peu près la
    // moyenne, ce qui satisfait trois personnes sur quatre et laisse la
    // quatrième avec 724 g dans l'assiette.
    //
    // ⚠️ IL NE POUVAIT PAS DEVINER: le calendrier dit qui mange où, les cartes
    // disent ce que chacun exige, et rien ne disait qu'un plat PARTAGÉ doit
    // atteindre le PLUS HAUT de ces chiffres. Une exigence de densité n'est pas
    // une préférence qu'on moyenne: en dessous, l'assiette de cette personne-là
    // devient énorme, et elle est la seule à le subir.
    "   A shared dish has to reach the HIGHEST density asked by any of its",
    "   eaters at that moment, not the average of them: read their cards, take",
    "   the largest figure, write the recipe at least that dense. Below it, that",
    "   one person ends up with an enormous plate and nobody else notices.",
    "",
    "4. WRITE EACH DISH AS A RECIPE, NEVER AS A SERVING, and give it the shape",
    "   the next block asks for: see WRITE ONE STANDARD RECIPE PER DISH. It",
    "   carries the plate rule and the two density floors, and a cell marked",
    "   (light) in the calendar is what that block calls a light slot.",
    "",
    "5. THEN MAKE IT GOOD. Rotate the proteins and the starches across the",
    "   stretch, serve what the cards say people like, and keep what they",
    "   dislike out of the shared dishes when you can.",
    "",
    "6. READ YOUR OWN PLAN BACK, AND FIX IT BEFORE ANSWERING.",
    "   - every cell the calendar fills has its dish, and no cell it leaves",
    "     empty has one;",
    "   - no dish contains anything forbidden to one of ITS eaters;",
    "   - every dish reaches the density floor of its cell;",
    "   - every preparation is drawn on by at least one dish, and cooked before;",
    "   - every ingredient carries a number, a unit and a state.",
    "   Never mention someone's absence, and never explain a gap in the plan.",
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ASSEMBLAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ LA QUEUE NE BOUGE PAS. Les verrous alimentaires restent les DERNIERS
 * blocs du message utilisateur, dans leur ordre de v33: « la contrainte la plus
 * proche de la fin est lue comme la plus contraignante » est l'invariant qui
 * les protège, et `movePrecedenceToTail` colle ensuite l'arbitrage derrière eux.
 * La méthode les NOMME (étape 1) au lieu de les déplacer.
 */
export function buildHouseholdPromptBlocksV34(
  input: HouseholdPromptV34Input,
): HouseholdPromptBlocks {
  const voices = buildHouseholdVoices(input.voices);
  const notes = notesBlock(input.notes);
  const dishOwner = dishOwnerSchemaBlock(input.dishBearers);
  const whyRuleSchema = whyRuleSchemaBlock(input.ruleHolders);
  const envy = buildEnvyBlock(input.envyLine);
  const kitchen = kitchenBlock(input.kitchenEquipment);
  const workLunch = workLunchBlock(input.members, input.workLunch ?? []);
  const traditions = traditionBlock(input.traditions, input.daysInWindow);
  const crossContact = crossContactBlock({
    medicalMouths: input.medicalMouths,
    unnamedMedical: input.crossContactUnnamedMedical,
    dishBearers: input.dishBearers,
  });
  // ⛔ LA LISTE D'IDS SORT DÈS QUE QUELQUE CHOSE Y RENVOIE — ici le schéma du
  // plat dédié. Même règle qu'en v33: promettre « l'id ci-dessus » sans la
  // liste faisait recopier des prénoms.
  const idRoster = memberIdRosterLines(input.members, dishOwner.length > 0);

  const nameOf = new Map(input.members.map((m) => [m.memberId, m.displayName]));
  // ⟳ LOT C · C3 — LES COULOIRS NOMMÉS, INDEXÉS PAR BOUCHE. Construits UNE
  // fois ici et passés au calendrier: les recalculer là-bas ferait une seconde
  // lecture de `cardFacts`, et c'est celle qu'on relit le moins qui garderait
  // l'ancienne règle (`named` seulement, jamais `floorOnly`).
  const corridorsOf = new Map<string, readonly SlotDensity[]>(
    input.members.map((m) => [
      m.memberId,
      input.cardFacts[m.memberId]?.requiredDensity?.named ?? [],
    ]),
  );
  const voicesByMember = new Map(voices.heard.map((v) => [v.memberId, v.lines]));

  // ── A — LES CARTES ─────────────────────────────────────────────────────
  const cards: string[] = ["== THE HOUSEHOLD — ONE CARD PER PERSON =="];
  for (const m of input.members) {
    cards.push(
      "",
      ...cardFor(m, {
        diet: input.cardFacts[m.memberId]?.diet ?? null,
        voices: voicesByMember.get(m.memberId) ?? [],
        // ⛔ `named` SEULEMENT, comme en v33: `floorOnly` porte la densité d'une
        // bouche sous plancher TCA, qui ne doit jamais paraître en face d'un
        // nom. Elle atteint le modèle par le plancher COMMUN, plus bas.
        density: densityFragment(
          input.cardFacts[m.memberId]?.requiredDensity?.named ?? [],
        ),
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ⛔ CE QUE CHAQUE FAIT INTERDIT — LES TROIS PHRASES QUI MANQUAIENT
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ TROUVÉ LE 2026-09-08 EN COMPARANT LES DEUX LANES. v34 a repris tous les
  // FAITS du brief v33 sur ses cartes — le rythme, l'habitude, la densité — et
  // **aucune** des phrases qui disent ce que chacun INTERDIT. C'est le principe
  // que `household_portions.ts` énonce trois fois dans ses propres
  // commentaires: « une contrainte qu'on énonce sans dire ce qu'elle INTERDIT
  // est une contrainte décorative. »
  //
  // Mesuré: le foyer recevait « at least 167 kcal per 100 g at lunch » au bout
  // d'une carte, et n'avait jamais lu que cette grandeur porte sur le PLAT,
  // qu'on l'atteint par ce dont le plat est FAIT, et surtout qu'on ne
  // l'atteint PAS en servant une assiette plus petite. Le modèle rendait 117.
  //
  // ⚠️ CHACUNE EST GARDÉE PAR SON FAIT, comme en v33: une conséquence servie
  // sans le fait qui l'appelle est du bruit, et le bruit dévalue les consignes
  // qui l'entourent.
  const anyRhythm = input.members.some((m) => (m.eatingSlots ?? []).length > 0);
  const anyHabit = input.members.some((m) => (m.habits ?? []).length > 0);
  const anyDensity = input.members.some((m) =>
    (input.cardFacts[m.memberId]?.requiredDensity?.named ?? []).length > 0
  );
  const consequences: string[] = [
    ...(anyRhythm
      ? [
        'When a person is marked "eats at ... only", give them NO serving at any',
        "other moment — do not shift their meal, do not compensate elsewhere.",
      ]
      : []),
    ...(anyHabit ? [...HABIT_CONSEQUENCE] : []),
    ...(anyDensity ? [...DENSITY_CONSEQUENCE] : []),
  ];
  if (consequences.length > 0) cards.push("", ...consequences);

  const anyDedicated = input.cells.some((c) => c.dedicated.length > 0);

  const parts = [
    cards.join("\n"),
    calendarBlock(input.cells, nameOf, corridorsOf),
    methodBlock(anyDedicated),
    // ── L'ÉTAPE 4, COLLÉE À LA MÉTHODE QUI LA NOMME ─────────────────────
    // « La promesse et la clé de schéma doivent se toucher »: l'étape 4 dit
    // « voir ci-dessous », et ce bloc EST le ci-dessous. Les séparer par le
    // calendrier ou les verrous remettrait la promesse et la forme à deux
    // endroits du prompt.
    // ⛔ LES PLANCHERS SONT CALCULÉS, PAS CONSTANTS (2026-09-08). Une bouche
    // sous plancher TCA ne peut recevoir aucun chiffre en face de son nom;
    // son exigence passe donc par le plancher COMMUN, où elle se confond avec
    // celle de tout le monde. Le foyer servait `STANDARD_RECIPE_BLOCK` nu,
    // c'est-à-dire les deux planchers génériques et rien d'autre.
    standardRecipeBlock(
      densityFloorsOf(
        // ⚠️ `densityFloorsOf` ne lit QUE `requiredDensity` — le cast dit ce
        // qu'on lui donne, et le test d'empreinte tient le reste.
        input.members.map((m) => ({
          requiredDensity: input.cardFacts[m.memberId]?.requiredDensity ?? null,
        })) as unknown as Parameters<typeof densityFloorsOf>[0],
        { normal: NORMAL_DISH_MIN_KCAL_PER_100G, light: LIGHT_DISH_MIN_KCAL_PER_100G },
      ),
    ).join("\n"),
    dedicatedDishBlock(input.dishBearers, input.dedicatedDishesAsked),
    workLunch.block,
    traditions.block,
    notes.block,
    envy,
    decidedBeforeYouBlock(input.decided ?? null),
    kitchen.block,
    // ── LA QUEUE: LES VERROUS, DANS L'ORDRE DE v33 ──────────────────────
    input.dietBlock,
    restrictionBlock(input.restrictions),
    whyRuleBlock(input.ruleHolders),
    crossContact.block,
  ].filter((p) => p && p.trim().length > 0);

  return {
    promptVersion: HOUSEHOLD_PROMPT_V34_VERSION,
    userSuffix: `\n\n${parts.join("\n\n")}`,
    systemSuffix: `\n\n${
      [
        ...(idRoster.length === 0 ? [] : [...idRoster, ""]),
        // ⛔ NI `member_portions`, NI `boxes`. Le moteur autore les couvercles
        // (lot 12) et les grammes viennent de lui seul. En demander au modèle
        // ferait écrire une sortie qu'on jette — et un modèle à qui on jette
        // la moitié de sa sortie finit par mal écrire l'autre.
        ...EXPLANATION_SCHEMA_BLOCK,
        ...(dishOwner.length === 0 ? [] : ["", ...dishOwner]),
        ...(whyRuleSchema.length === 0 ? [] : ["", ...whyRuleSchema]),
      ].join("\n")
    }`,
    envyLineUsed: envy.trim().length > 0,
    voiceIssues: voices.issues,
    voiceCounts: voices.counts,
    voicesHeard: voices.heard.length,
    notesServed: notes.served,
    kitchenMissing: kitchen.missing,
    // ⛔ `eatingOut` À ZÉRO, ET C'EST UN FAIT, PAS UN OUBLI. Le bloc « un repas
    // pris dehors n'est pas une absence » est REPLIÉ dans le calendrier: une
    // bouche qui déjeune au restaurant n'a simplement pas de case ce midi-là
    // (`away.effective` la porte déjà). Le compteur dit donc « aucune ligne de
    // repas dehors servie », ce qui est vrai de cette structure.
    eatingOut: { mouths: 0, cells: 0 },
    workLunch: { mouths: workLunch.mouths, cold: workLunch.cold },
    whyRuleHolders: input.ruleHolders.length,
    crossContact,
  };
}
