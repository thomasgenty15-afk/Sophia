// ═══════════════════════════════════════════════════════════════════════════
// LA BIFURCATION — LES BOUCHES: `PortionMember`, `MemberPortion`, les objectifs
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_portions.ts` (découpage des gros
// fichiers, lot 2b). Aucune logique changée. `household_portions.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// L'en-tête qui explique la bifurcation reste dans `household_portions.ts`.
//
// Ce module n'importe que des types, plus `GOAL_TOKENS`, et aucune valeur de
// `household_portions.ts`. `RequiredDensity` vient de `portion_sizing.ts` en
// import de TYPE seulement: `portion_sizing` → `mouth_anchor` →
// `household_portions` → `portion_sizing` est une boucle, sans danger tant
// que ce dernier lien reste un type.

import { GOAL_TOKENS, type GoalToken } from "./tokens.ts";
import type { MemberAgeState } from "./household.ts";
import type { MealBodyContext } from "./meal_body.ts";
import type { RequiredDensity } from "./portion_sizing.ts";
import type { ProteinMouthBrief } from "./plan_protein_brief.ts";
import type { MemberHabit } from "./household_habits.ts";
import type { EatingOccasionSlot } from "./meal_generation.ts";

/**
 * Reflet du CHECK `household_members_goal_check`, lui-même aligné sur
 * `student_goals_goal_check` — trois valeurs depuis la migration
 * `20260818100000`.
 *
 * ⚠️ CE N'EST PLUS UNE SECONDE LISTE. Elle est dérivée de `GOAL_TOKENS`, qui
 * est le vocabulaire du dépôt: deux copies d'une énumération fermée est le
 * mode d'échec que `tokens.ts` documente en tête de fichier, et celle-ci en
 * était une — elle a survécu au passage de six à trois uniquement parce que le
 * lot est allé la chercher.
 */
export const MEMBER_GOALS = GOAL_TOKENS;
export type MemberGoal = GoalToken;

export interface PortionMember {
  /**
   * L'identité de la bouche, PAS son compte. Une bouche sans compte en a un;
   * c'est tout l'objet du re-clavetage du 2026-08-10.
   */
  memberId: string;
  displayName: string;
  /**
   * `null` = aucune direction dérivée d'un objectif. Vrai pour tout mineur,
   * pour toute bouche dont l'âge est inconnu, et pour tout majeur qui n'a rien
   * déclaré.
   */
  goal: MemberGoal | null;
  /** Trois états. Sert le libellé d'âge et la garde, jamais un calcul. */
  ageState: MemberAgeState;
  /**
   * CE QU'ON SAIT DE SON CORPS — lot 3B.
   *
   * `null` pour une bouche sans compte (les mesures et le profil restent clés
   * sur `auth.users`), pour un compte dont la lecture a échoué, et pour un
   * compte qui n'a rien saisi. Les trois se ressemblent volontairement: voir
   * `buildPortionBrief`.
   *
   * ⚠️ REQUIS, jamais optionnel. « Paramètre de garde optionnel = garde
   * désarmée » est une leçon déjà payée par ce dépôt: un champ facultatif
   * n'aurait fait remonter aucun appelant au compilateur, et le lot serait
   * construit sans être branché — le mode d'échec n°1 d'ici.
   */
  body: MealBodyContext | null;
  /**
   * ⟳ 2026-09-07 — LES MOMENTS QU'ELLE A MARQUÉS « LÉGER ».
   *
   * ⛔ REQUIS, jamais `?`, pour la raison écrite juste au-dessus pour `body`:
   * un champ facultatif ne fait remonter aucun appelant au compilateur, et le
   * marqueur `(light)` serait écrit, testé, servi à personne.
   *
   * `[]` = aucun moment marqué. C'est le cas de toute la base d'avant le lot 2.
   */
  lightSlots: readonly string[];
  /**
   * ⟳ 2026-09-08 — CE QUE LES PLATS SERVIS À CETTE BOUCHE DOIVENT PESER EN
   * ÉNERGIE, moment par moment (`requiredDensityFor`, `portion_sizing.ts`).
   *
   * ── POURQUOI UNE DENSITÉ ET PAS UNE CIBLE ─────────────────────────────
   * « au moins 182 kcal pour 100 g » est un fait sur une CASSEROLE; « tu vises
   * 3 180 kcal » est un fait sur quelqu'un. Le premier peut se dire au modèle
   * (v33 lui a retiré le corps de tout le monde, et ce champ ne le lui rend
   * pas); le second ne sort jamais du moteur. Mesuré le 2026-09-07: sans ce
   * fait, le modèle écrit des plats à 113 kcal/100 g pour une cible qui en
   * demande 159, et 383 kcal sur 3 080 meurent au plafond d'assiette.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un champ facultatif ne fait remonter
   * AUCUN appelant au compilateur: la ligne serait écrite, testée, et servie à
   * personne — le mode d'échec n°1 de ce fichier, déjà payé par `body`.
   *
   * `null` = PERSONNE N'A CALCULÉ (chemin legacy, référentiel absent), ce qui
   * n'est pas « le calcul n'a rien trouvé » — ce cas-là rend un objet dont les
   * deux listes sont vides et dont `reason` dit pourquoi.
   */
  requiredDensity: RequiredDensity | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · ÉTAPE C4 — CE QUE LES PLATS SERVIS À CETTE BOUCHE DOIVENT
   * PORTER EN **PROTÉINE**, moment par moment (`plan_protein_brief.ts`).
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE JUMEAU EXACT DE `requiredDensity` JUSTE AU-DESSUS, ET POUR LA MÊME
   * RAISON MESURÉE. « au moins 46 g de protéine dans une part » est un fait sur
   * une ASSIETTE; « tu dois 176 g de protéine par jour » est un fait sur
   * quelqu'un. Le premier peut se dire au modèle, le second ne sort jamais du
   * moteur. Mesuré sur la campagne du 2026-09-11: sans ce fait, **4 plans sur
   * 6** sortent sous leur plancher protéique, la garde finale les compte, et
   * rien ne répare.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un champ facultatif ne fait remonter
   * AUCUN appelant au compilateur: la ligne serait écrite, testée, et servie à
   * personne — le mode d'échec n°1 de ce fichier.
   *
   * `null` = PERSONNE N'A CALCULÉ. Une bouche PROTÉGÉE, elle, rend un objet
   * dont `slots` est vide et dont `silence` dit `protected`: aucun chiffre ne
   * paraît alors en face de son nom.
   */
  proteinBrief: ProteinMouthBrief | null;
  /**
   * LES MOMENTS OÙ CETTE BOUCHE MANGE — `null` quand personne ne l'a dit.
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME ──────────────────────────────────────
   * Le rythme était UNE valeur, posée sur la ligne du maître, et l'écran
   * l'assumait: « demandé une fois, pour toute la maison ». Un ado qui saute
   * le petit-déjeuner et un petit qui goûte à 16 h recevaient donc la même
   * journée — et le foyer composait un repas pour quelqu'un qui n'en prend
   * pas.
   *
   * ⚠️ `null` ET TABLEAU VIDE NE VEULENT PAS DIRE LA MÊME CHOSE, et la base
   * refuse le second (`empty_rhythm`). `null` = « personne ne l'a dit » ⇒
   * cette bouche mange aux moments de la maison, ce qui est le repli du
   * produit et pas une supposition sur elle. Un tableau vide dirait « elle ne
   * mange jamais », et aucun écran ne doit pouvoir l'écrire par inadvertance.
   *
   * ⚠️ REQUIS, jamais optionnel — même raison que `body` ci-dessus: un champ
   * facultatif ne fait remonter aucun appelant au compilateur, et le lot se
   * construit sans être branché.
   *
   * ── LA TAILLE VOYAGE AVEC LE MOMENT (2026-08-14) ──────────────────────
   * C'était `readonly string[]`, et la taille tombait ici. Un compte pouvait
   * dire « gros dîner » (`rhythmLines`, lane individuelle); une bouche du
   * foyer disait seulement QUAND. Le champ porte donc le même
   * `EatingOccasionSlot` que le reste du moteur — le type auquel
   * `parseEatingRhythm` rend déjà — et `buildPortionBrief` dit la taille sur
   * la ligne où il dit le moment. Sans ça, cet écran aurait demandé une
   * donnée que personne ne lit, la faute exacte que ce chantier a corrigée
   * deux fois.
   */
  eatingSlots: readonly EatingOccasionSlot[] | null;
  /**
   * G4 — CE QU'ELLE MANGE QUAND ELLE NE MANGE PAS LE PLAT DE LA MAISON.
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME, ET IL A UNE DATE ────────────────────
   * Un plan réel a servi des ŒUFS BROUILLÉS SEPT MATINS D'AFFILÉE à une femme
   * qui mange une pomme. Le plan n'a pas ignoré son habitude: personne ne la
   * lui a demandée, et il n'existait aucun champ pour la ranger. `body` savait
   * sa taille, `eatingSlots` savait qu'elle prend un petit-déjeuner — rien ne
   * savait ce qu'elle y mange.
   *
   * ⚠️ `[]` EST LE CAS MAJORITAIRE, ET IL N'Y A PAS DE `null`. Contrairement à
   * `eatingSlots`, les deux valeurs diraient ici la MÊME chose: « personne n'a
   * rien dit » et « elle mange le plat de la maison partout » produisent le
   * même prompt, la même assiette et la même liste de courses. Deux
   * représentations d'un seul fait finissent toujours par être testées à
   * moitié; celle-ci n'en a qu'une.
   *
   * ⚠️ REQUIS, jamais optionnel — même raison que `body` et `eatingSlots`
   * au-dessus. Un `?` n'aurait fait remonter aucun appelant au compilateur, et
   * le lot se serait construit sans être branché: la table remplie, l'écran
   * livré, et le brief inchangé.
   */
  habits: readonly MemberHabit[];
  /**
   * G4 — SA LIGNE LIBRE, ou `null`. UNE ligne, durable, par bouche (B3).
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — la troisième fois dans cette
   * interface. `null` dit « elle n'a rien ajouté »; `""` ne doit jamais arriver
   * ici, la garde d'entrée le rend `null`.
   *
   * ⚠️ ELLE A DÉJÀ PASSÉ `readHabitText` QUAND ELLE ARRIVE. Ce module n'ouvre
   * aucune seconde garde de texte: `gateMemberHabits` est la porte, et une
   * seconde ici divergerait de la première dans la semaine.
   */
  habitNote: string | null;
}

export interface PreparationShare {
  preparationId: string;
  note: string;
}

export interface MemberPortion {
  memberId: string;
  displayName: string;
  /**
   * `null` = part standard. DÉLIBÉRÉMENT PAS une phrase par défaut: une phrase
   * écrite ici serait dans UNE langue, et ce dépôt a déjà payé « confirmation
   * STOP codée en dur en français ». L'écran rend son propre libellé.
   */
  portionNote: string | null;
  preparationShares: PreparationShare[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LES MOMENTS OÙ CETTE BOUCHE MANGE, TELS QU'ILS ÉTAIENT À LA COMPOSITION.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT QUE ÇA FERME (2026-08-19) ──────────────────────────────
   * L'écran nomme les bouches sous chaque plat. Il les nommait TOUTES, sans
   * jamais demander si elles mangent à ce moment-là: Christèle, qui a déclaré
   * déjeuner et dîner, se retrouvait marquée au petit-déjeuner à côté d'iku.
   *
   * ⛔ ET C'EST LE PLAN QUI LES PORTE, PAS UNE RELECTURE DU FOYER À
   * L'AFFICHAGE. Demandé mot pour mot: « il faut que le plan respecte les
   * créneaux qui sont renseignés AU MOMENT DE FAIRE LE PLAN ». Un écran qui
   * relirait le roster montrerait les créneaux d'AUJOURD'HUI sous un plan
   * composé la semaine dernière — et c'est précisément la divergence que ce
   * dépôt paie à chaque fois qu'une même question a deux sources.
   *
   * ⚠️ `null` = elle n'a rien déclaré, donc elle suit la maison. Ce n'est PAS
   * « elle ne mange jamais »: les deux se rendraient pareil à l'écran, et
   * confondre les deux ferait disparaître une bouche muette de tous ses repas.
   * Le repli sur le rythme de la maison est celui du moteur, à l'identique.
   */
  eatingSlots: readonly EatingOccasionSlot[] | null;
}
