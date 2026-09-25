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
// ⟳ 2026-09-12 · ÉTAPE C4 — le plancher protéique atteint le PREMIER JET.
// ⛔ Le rendu vit dans le même module que le calcul, pour la raison qui a fait
// vivre `densityFragment` dans `household_portions.ts`: deux rédactions du même
// nombre finiraient par diverger, et c'est celle qu'on relit le moins qui
// partirait au modèle.
import {
  PROTEIN_CONSEQUENCE,
  proteinFragment,
  type ProteinMouthBrief,
} from "./plan_protein_brief.ts";
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
// ⟳ 2026-09-23 — LES À-CÔTÉS: la ligne de case et le bloc viennent de leur
// module, jamais rédigés ici.
import type { SideCourseAsk } from "./side_courses_types.ts";
import {
  sideCoursesBlock,
  sideCoursesCell,
  sideCoursesGiven,
} from "./side_courses_prompt.ts";

/**
 * ⛔ SON PROPRE JETON, ET UN NOM DIFFÉRENT DE `HOUSEHOLD_PROMPT_VERSION`.
 *
 * `precedence_binding.ts::readHouseholdPromptVersion` exige **exactement une**
 * déclaration `export const HOUSEHOLD_PROMPT_VERSION = "…";` dans le fichier
 * v33. Un second nom ne la voit pas, donc v33 garde sa version, ses six
 * épingles ne bougent pas, et la ligne écrite en base dit laquelle des deux
 * structures a réellement été servie.
 *
 * ⟳ 2026-09-23 — `v34_one_card_per_person_the_engine_weighs` →
 * `v34_the_plate_is_not_the_meal`. Le texte servi change: la recette de
 * référence (la part du milieu), les phrases qui poussaient au féculent
 * retirées, l'étape 3 de la méthode (« denser is not better »), les à-côtés
 * sur les lignes du calendrier et leur bloc, le « sens du plan » par personne.
 * ⚠️ LA DÉCLARATION TIENT SUR UNE LIGNE: `precedence_binding.ts`
 * (`readHouseholdPromptV34Version`) la lit dans la source, ancrée au début de
 * ligne, et jette si elle n'en trouve pas exactement une.
 *
 * ⟳ 2026-09-23 — `v34_the_plate_is_not_the_meal` →
 * `v34_every_plate_splits_its_starch`, le même jour que
 * `HOUSEHOLD_PROMPT_VERSION` (v38) et pour la même raison: la recette servie ici
 * (`standardRecipeBlock`) demande le féculent à part pour TOUT déjeuner et tout
 * dîner, plus seulement pour une case partagée.
 *
 * ⟳ 2026-09-23 — `v34_every_plate_splits_its_starch` →
 * `v34_side_courses_come_in_families`, le même jour que
 * `HOUSEHOLD_PROMPT_VERSION` (v39) et pour la même raison: le bloc des
 * à-côtés servi ici (`sideCoursesBlock`) dit la règle de la table, son
 * exception, la règle des deux jours et le dessert d'un seul aliment.
 *
 * ⟳ 2026-09-23 — `v34_side_courses_come_in_families` →
 * `v34_the_table_shares_its_sides`, le même jour que
 * `HOUSEHOLD_PROMPT_VERSION` (v40) et pour la même raison: le bloc des
 * à-côtés servi ici retire le dessert dense de la prise, fait nommer
 * l'aliment exact, et sort le pain de la règle des deux jours.
 *
 * ⟳ 2026-09-23 — `v34_the_table_shares_its_sides` →
 * `v34_what_came_back_is_named`, le même jour que `HOUSEHOLD_PROMPT_VERSION`
 * (v41) et pour la même raison: la ligne « à éviter » suit l'envie.
 *
 * ⟳ 2026-09-25 — `v34_what_they_turned_down` →
 * `v34_the_box_is_already_packed`, le même jour que
 * `HOUSEHOLD_PROMPT_VERSION` (v43) et pour la même raison: la recette servie
 * ici (`standardRecipeBlock`) dit que l'app met plat et féculent dans UNE
 * boîte par repas.
 *
 * ⟳ 2026-09-25 — `v34_the_box_is_already_packed` →
 * `v34_a_teaspoon_is_the_least_oil`, le même jour que
 * `HOUSEHOLD_PROMPT_VERSION` (v44): la recette servie ici pose un plancher de
 * 5 ml sur l'huile ajoutée.
 *
 * ⟳ 2026-09-25 — `v34_a_teaspoon_is_the_least_oil` → `v34_we_say_tu`, le même
 * jour que `HOUSEHOLD_PROMPT_VERSION` (v45): le bloc de langue servi ici demande
 * le « tu » en français.
 */
// ⟳ 2026-09-25 — `v34_we_say_tu` → `v34_the_sessions_they_chose`, le même
// jour que `HOUSEHOLD_PROMPT_VERSION` v46 et pour la même raison.
// ⟳ 2026-09-25 — `v34_the_sessions_they_chose` → `v34_one_starch_one_session`,
// le même jour que `HOUSEHOLD_PROMPT_VERSION` (v47) et pour la même raison.
// ⟳ 2026-09-25 — `v34_one_starch_one_session` → `v34_off_the_table_not_at`, le
// même jour que `HOUSEHOLD_PROMPT_VERSION` (v48) et pour la même raison.
export const HOUSEHOLD_PROMPT_V34_VERSION = "v34_off_the_table_not_at";

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
        /**
         * ══════════════════════════════════════════════════════════════════
         * ⟳ 2026-09-12 · ÉTAPE C4 — LE PLANCHER PROTÉIQUE, AVANT LA PREMIÈRE
         * GÉNÉRATION
         * ══════════════════════════════════════════════════════════════════
         *
         * ⛔ REQUIS-NULLABLE, jamais optionnel — exactement la même raison que
         * `requiredDensity` juste au-dessus, et la même cicatrice: « paramètre
         * de garde optionnel = garde désarmée ». Une clé absente se relirait
         * « pas de plancher » là où la vraie réponse peut être « personne ne
         * l'a calculé », et c'est ce silence-là qui a coûté quatre plans sur
         * six à la campagne du 2026-09-11.
         *
         * ⚠️ `null` OU MUET = RIEN NE SORT. Une bouche protégée (plancher TCA,
         * mineur) rend `silence: "protected"` et aucun chiffre ne paraît en
         * face de son nom — la règle de `RequiredDensity.floorOnly`.
         */
        proteinBrief: ProteinMouthBrief | null;
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

/** L'objectif en mots, jamais le jeton : le modèle lit une fiche, pas une base. */
export function goalWordOf(goal: string | null | undefined): string {
  switch (goal) {
    case "fat_loss":
      return "fat loss — they want to lose weight";
    case "muscle_gain":
      return "muscle gain — they want to build muscle";
    case "maintenance":
      return "maintenance — keep their weight where it is";
    default:
      return "no stated goal — feed them as usual";
  }
}

/**
 * ⟳ 2026-09-21 — CE QUE L'OBJECTIF CHANGE À CE QU'ON MET DANS L'ASSIETTE.
 *
 * ⛔ MESURÉ SUR LE PLAN `3e121b21`: la seule chose que l'objectif changeait
 * était l'ÉNERGIE de la part. L'homme en perte mangeait la même recette que
 * l'homme en prise de masse, à 2,1 kcal/g, avec 184 g de légumes par jour et
 * de la saucisse à quatre repas; l'homme en prise de masse prenait son
 * énergie en thon. La densité de la table est fixée ailleurs (le couloir);
 * ici on dit AVEC QUOI la remplir. Jamais un nombre de corps.
 */
export function directionFoodsOf(goal: string | null | undefined): string | null {
  switch (goal) {
    case "fat_loss":
      return "builds the plate LOW: vegetables first (half the plate, 150 g or " +
        "more before cooking at lunch and dinner), lean protein, whole grains, " +
        "water-rich dishes (soups, stews, big salads with a starch). Where a " +
        "line gives two density figures, the LOWER one is theirs.";
    case "muscle_gain":
      return "takes the extra energy in their OWN dishes and snacks, as " +
        "energy-dense whole foods: oats, nuts and nut butter, dried fruit, " +
        "olive oil, full-fat dairy, bread, rice -- never as a second main dish " +
        "or a tin of fish. The shared dish stays as the table needs it.";
    default:
      return null;
  }
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
    /**
     * ⟳ 2026-09-12 · ÉTAPE C4 — LA PROTÉINE DE CE QUI EST SERVI LÀ, EN GRAMMES.
     *
     * ⛔ ELLE MANQUAIT, ET C'ÉTAIT LA CAUSE MESURÉE DES QUATRE PLANS SOUS
     * PLANCHER. Le prompt portait une DENSITÉ — une grandeur d'énergie — et la
     * ligne « a starch, a protein, a fat » du bloc de recette, c'est-à-dire
     * très exactement la « phrase vague » que le plan de clôture interdit
     * d'employer « comme substitut à la cible numérique disponible ».
     *
     * ⚠️ CE N'EST PAS UN FAIT DE CORPS, pour la même raison que la densité:
     * c'est une propriété du PLAT servi à ce moment-là. Même rendu partagé
     * (`proteinFragment`), jamais une seconde rédaction.
     */
    protein: string;
  },
): string[] {
  const out: string[] = [`== ${m.displayName} (${m.memberId}) ==`];
  if (extras.diet) out.push(`  diet: ${extras.diet}`);
  const age = ageWordOf(String(m.ageState));
  if (age) out.push(`  who: ${age}`);
  // ⟳ 2026-09-20 — L'OBJECTIF EST ÉCRIT SUR CHAQUE FICHE. Il ne l'était que
  // pour le titulaire (`-- WHAT THEY ARE AFTER --`) ; les autres bouches
  // n'avaient que leurs densités et leurs planchers de protéines, c'est-à-dire
  // la CONSÉQUENCE de l'objectif sans son nom. Un mineur n'a pas d'objectif
  // (`goal` = null) et la fiche le dit tel quel.
  out.push(`  after: ${goalWordOf(m.goal)}`);
  // ⟳ 2026-09-21 — et avec quoi remplir l'assiette, selon la direction.
  const foods = directionFoodsOf(m.goal);
  if (foods !== null) out.push(`  ${foods}`);
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
  // ⛔ JUSTE APRÈS LA DENSITÉ, ET JAMAIS AVANT. Les deux parlent du même plat:
  // la densité dit combien d'énergie tient dans 100 g, la protéine dit de quoi
  // ces grammes sont faits. Séparées par autre chose, elles se liraient comme
  // deux contraintes sans rapport — et ce dépôt a mesuré ce que coûte une
  // consigne détachée de la phrase qui la porte (0 % de conformité).
  if (extras.protein !== "") out.push(` ${extras.protein.replace(/^\s*—\s*/, "— ")}`);
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
  /**
   * ⟳ 2026-09-23 — LES À-CÔTÉS DEMANDÉS PAR LE MOTEUR, toutes cases confondues.
   *
   * ⛔ REQUIS, `[]` pour « aucun ». Le calendrier est le seul endroit de v34 où
   * la répartition s'écrit: une case la porte en fin de ligne (« Side courses:
   * Thomas cheese + dessert; Christèle dessert. »), pour les MANGEURS de cette
   * case seulement. Une demande qui ne tombe sur aucun mangeur n'est pas
   * écrite, et elle n'est pas rendue dans `placed`.
   */
  sideAsks: readonly SideCourseAsk[],
): { text: string; placed: SideCourseAsk[]; named: number; sideCells: number } {
  if (cells.length === 0) return { text: "", placed: [], named: 0, sideCells: 0 };
  const who = (id: string) => nameOf.get(id) ?? id;
  const rows: string[] = [];
  const placed: SideCourseAsk[] = [];
  let named = 0;
  let sideCells = 0;
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
      // ⟳ 2026-09-20 — QUAND CHAQUE MANGEUR A SON PLAT, LA TABLE EST VIDE.
      // Mesuré en local : une bouche seule en milieu de matinée, avec son plat
      // à elle, recevait AUSSI un plat de table — sans boîte, pour personne —
      // parce que l'étape 3 dit « le plat commun d'abord » et que rien ne
      // l'exceptait. L'écran l'affichait « Pour la table », et toute la
      // famille se retrouvait avec une collation. La phrase est sur la ligne
      // de la case, comme « write NO dish » l'est sur une case vide.
      if (c.dedicated.length === c.eaters.length) {
        line += " Every eater here has their own dish: write NO shared dish for this cell.";
      }
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
    // ── ⟳ 2026-09-23 · LES À-CÔTÉS DE LA CASE, EN FIN DE LIGNE ────────────
    // Dans l'ordre des MANGEURS de la case: une demande pour quelqu'un qui ne
    // mange pas ici n'a pas de ligne où s'écrire, et elle n'est pas écrite.
    const here: SideCourseAsk[] = [];
    for (const id of c.eaters) {
      for (const a of sideAsks) {
        if (a.memberId === id && a.dayToken === String(c.day) && a.slot === String(c.slot)) {
          here.push(a);
        }
      }
    }
    const side = sideCoursesCell(here, nameOf);
    if (side.text !== "") {
      line += side.text;
      named += side.named;
      sideCells++;
      placed.push(...here);
    }
    rows.push(line);
  }
  // ⚠️ L'UNITÉ EST DITE ICI, UNE FOIS. Vingt et une cases × « kcal per 100 g »
  // feraient une ligne qu'on saute — la propriété que `densityFragment` tient
  // déjà sur ses moments (`one(d, i === 0)`). La garde du brief (« aucun kcal
  // nu ») reste satisfaite: le seul `kcal` de ce bloc est suivi de `per 100 g`.
  const text = [
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
  return { text, placed, named, sideCells };
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
    // ⟳ 2026-09-21 — LA SESSION EST LE SOIR. Mesuré sur le plan `c1ce4658`:
    // les deux sessions tombaient mardi et jeudi et le PREMIER plat qui
    // puisait dans chaque casserole était le déjeuner du même jour — courses
    // puis 55 min de cuisine avant midi, un jour de semaine, chez trois
    // personnes de bureau. « Cuit avant le premier repas » était vrai jour
    // contre jour ; il manquait l'heure.
    "   A session happens in the EVENING: the first meal that draws on a",
    "   preparation cooked on day D is D's dinner. A lunch draws on a",
    "   preparation cooked on an EARLIER day, or is a no-cook dish assembled on",
    "   the spot (a salad with a starch, a sandwich, a bowl). The only",
    "   exception is a plan that starts today with the shop in the morning.",
    "",
    "3. COMPOSE EACH CELL, IN CALENDAR ORDER. The shared dish first, then any",
    "   dish of someone's own the calendar orders" +
    (anyDedicated ? " (see A DISH OF THEIR OWN)." : "."),
    ...(anyDedicated
      ? [
        "   A cell where EVERY eater has a dish of their own gets NO shared dish:",
        "   the calendar says so on that line, and a shared dish there feeds nobody.",
      ]
      : []),
    "   The shared dish of a cell must suit EVERY one of its eaters at once.",
    // ⟳ 2026-09-21 — LA CASE VIDE N'EST PAS UNE RÉPONSE. Mesuré sur le plan
    // `d65f57e2`: mardi midi, premier déjeuner du plan, sans casserole
    // disponible (la session est le soir), le modèle n'a rien écrit; la
    // réparation a échoué deux fois (`no_improvement`). Une case listée par
    // le calendrier reçoit un plat, et sans casserole c'est un plat sans
    // cuisson.
    "   Every cell the calendar lists gets a dish. An EMPTY cell is never an",
    "   answer: when no preparation can serve a lunch, write a no-cook dish",
    "   (tinned fish or legumes, bread, raw vegetables, cheese, a dressing).",
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
    // ⟳ 2026-09-21 — ET LA VISÉE EST LA PLUS BASSE QUI TIENNE LE PLANCHER DE
    // CHACUN. « Le plus haut » visait la carte de l'homme en prise de masse et
    // rétrécissait l'assiette de l'homme en perte (570 g au lieu de 626 pour
    // les mêmes calories). Le plancher de chaque carte est ce qui garde chaque
    // assiette sous sa borne; au-dessus de tous les planchers, plus bas est
    // mieux pour tout le monde: plus de légumes, plus de volume, la même
    // énergie. La ligne « Shared dish A-B, aim C » du calendrier porte déjà ce
    // calcul; la méthode dit comment le lire.
    // ⟳ 2026-09-23 — LA VISÉE EST L'ASSIETTE ORDINAIRE, PLUS LA PLUS GROSSE.
    // « the largest plate each person's bounds allow » faisait lire la visée
    // comme une invitation à remplir l'assiette jusqu'à sa borne: sur les plans
    // de l'audit du 2026-09-23, 700 g pour Thomas par construction. La visée
    // de case est maintenant la densité de la personne du MILIEU
    // (`cellDensityOf`), c'est-à-dire celle de THE TEMPLATE; plus dense n'est
    // pas mieux, et l'énergie en plus passe par les à-côtés.
    "   A shared dish has to reach the HIGHEST density FLOOR asked by any of",
    "   its eaters at that moment, never the average: below someone's floor,",
    "   that one person ends up with an enormous plate and nobody else notices.",
    "   Above every floor, write it at the calendar's aim for that cell: the",
    "   density of an ordinary plate (the template); denser is not better.",
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
  // ⟳ 2026-09-23 — la ligne « à éviter », telle que `avoidLineOf` l'a écrite.
  const avoid = (input.avoidLine ?? "").trim();
  // ⟳ 2026-09-24 — la ligne des plats refusés, juste après celle « à éviter ».
  const rejected = (input.rejectedDishesLine ?? "").trim();
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
        // ⟳ 2026-09-12 · ÉTAPE C4 — le plancher protéique de cette bouche,
        // réparti sur ses cases couvertes. Muet quand elle est protégée.
        protein: proteinFragment(input.cardFacts[m.memberId]?.proteinBrief ?? null),
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
  const anyProtein = input.members.some((m) =>
    (input.cardFacts[m.memberId]?.proteinBrief?.slots ?? []).length > 0
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
    // ⛔ GARDÉE PAR SON FAIT, comme les trois autres. « Une conséquence servie
    // sans le fait qui l'appelle est du bruit, et le bruit dévalue les consignes
    // qui l'entourent » — et une table où personne ne porte de plancher
    // apprendrait qu'il existe une grandeur qu'on impose parfois.
    ...(anyProtein ? [...PROTEIN_CONSEQUENCE] : []),
  ];
  if (consequences.length > 0) cards.push("", ...consequences);

  const anyDedicated = input.cells.some((c) => c.dedicated.length > 0);

  // ── ⟳ 2026-09-23 · LES À-CÔTÉS: LE CALENDRIER LES ÉCRIT, LE BLOC LES EXPLIQUE
  // `?? []` = champ non passé ⇒ aucune ligne, aucun bloc, et `given: 0` le dit.
  // Le bloc ne reçoit QUE les demandes que le calendrier a écrites: il promet
  // « the calendar marks "Side courses:" », et une demande sans case ferait
  // lister l'id de quelqu'un que rien ne marque.
  const sideAsks = input.sideCourses ?? [];
  const calendar = calendarBlock(input.cells, nameOf, corridorsOf, sideAsks);
  const sides = sideCoursesBlock({ asks: calendar.placed, nameOf, perDay: false });
  const sidesGiven = sideCoursesGiven(sideAsks);
  const recipe = standardRecipeBlock(
    densityFloorsOf(
      // ⚠️ `densityFloorsOf` ne lit QUE `requiredDensity` — le cast dit ce
      // qu'on lui donne, et le test d'empreinte tient le reste.
      input.members.map((m) => ({
        requiredDensity: input.cardFacts[m.memberId]?.requiredDensity ?? null,
      })) as unknown as Parameters<typeof densityFloorsOf>[0],
      { normal: NORMAL_DISH_MIN_KCAL_PER_100G, light: LIGHT_DISH_MIN_KCAL_PER_100G },
    ),
    { served: sides.block !== "" },
  ).join("\n");

  const parts = [
    cards.join("\n"),
    calendar.text,
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
    // ⟳ 2026-09-23 — calculé une fois plus haut (`recipe`): il part aussi dans
    // `repairContext.standardRecipe`.
    recipe,
    // ── ⟳ 2026-09-23 · LES À-CÔTÉS, JUSTE SOUS LA RECETTE ──────────────────
    // La recette renvoie à « (SIDE COURSES) »; ce bloc est le renvoi et porte
    // la clé `side_courses`. `""` sans demande écrite: filtré en fin de tableau.
    sides.block,
    dedicatedDishBlock(input.dishBearers, input.dedicatedDishesAsked),
    workLunch.block,
    traditions.block,
    notes.block,
    envy,
    // ⟳ 2026-09-23 — juste après l'envie, qu'elle cite (« above »): même place
    // qu'en v33.
    avoid,
    // ⟳ 2026-09-24 — les plats refusés, juste après: même place qu'en v33.
    rejected,
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
    avoidLineUsed: avoid.length > 0,
    rejectedLineUsed: rejected.length > 0,
    voiceIssues: voices.issues,
    voiceCounts: voices.counts,
    voicesHeard: voices.heard.length,
    notesServed: notes.served,
    kitchenMissing: kitchen.missing,
    workLunch: { mouths: workLunch.mouths, cold: workLunch.cold },
    whyRuleHolders: input.ruleHolders.length,
    crossContact,
    // ⟳ 2026-09-23 — compté sur les lignes du CALENDRIER, là où la
    // répartition s'écrit en v34.
    sideCourses: {
      given: sidesGiven,
      prompt_asked: calendar.named,
      cells: calendar.sideCells,
      unplaced: Math.max(0, sidesGiven - calendar.named),
    },
    // ⟳ 2026-09-23 — les TEXTES servis. ⚠️ La répartition des à-côtés est
    // rendue UNE LIGNE PAR JOUR (`perDay: true`) sur les MÊMES demandes que le
    // calendrier a écrites: la réparation n'a pas le calendrier sous les yeux,
    // et un bloc qui renverrait à « the calendar marks » y pointerait dans le
    // vide.
    repairContext: {
      cards: cards.join("\n"),
      notes: notes.block,
      standardRecipe: recipe,
      sideCourses: sideCoursesBlock({ asks: calendar.placed, nameOf, perDay: true }).block,
    },
  };
}
