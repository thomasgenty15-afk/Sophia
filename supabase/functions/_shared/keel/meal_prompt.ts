// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LE MESSAGE ENVOYÉ AU MODÈLE (`buildMealPrompt`)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-2). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : `buildMealPrompt`, seul. Le texte fixe qu'il assemble
// (prompt système, arbitrage, listes de champs, `SOLO_BOX_BLOCK`) vit dans
// `meal_prompt_text.ts`.

import {
  type SafetyConstraintTable,
  safetyConstraintsPromptBlock,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";
import { appendContentLanguageBlock } from "./locale.ts";
import { mealBodyBlocks, type MealBodyContext } from "./meal_body.ts";
import { type WeeklyAxis, WEEKLY_AXIS_LABELS_EN } from "./weekly_flow.ts";
import {
  daysOutOfBatchReach,
  sessionCeilingMinutes,
  singleSessionCookDay,
} from "./plan_feasibility.ts";
import { type RawReachCadence, rawReachLines } from "./raw_keeping.ts";
import type { FixedIntake } from "./fixed_intakes.ts";
import type { KitchenTool } from "./kitchen_equipment.ts";
import type { DayPropertyEntry } from "./day_properties.ts";
import { FREEZER_WINDOW_DAYS } from "./fridge_window.ts";
import { fixedIntakePromptLines } from "./fixed_intakes.ts";
import { kitchenEquipmentPromptLines } from "./kitchen_equipment.ts";
import { dayPropertyPromptLines } from "./day_properties.ts";
import {
  type AwayDay,
  dayProse,
  DEFAULT_EATING_RHYTHM,
  type EatingOccasionSlot,
  type MealMode,
  type MealScope,
  type MealSlot,
  OCCASION_PROSE,
} from "./meal_vocabulary.ts";
import type { PantryItem } from "./meal_types.ts";
import {
  addedCookDays,
  batchSessionBudget,
  dishBudgetFor,
  dishCapFor,
  MAX_FRIDGE_DAYS,
  type MergedEater,
  usableCookDays,
} from "./meal_budget.ts";
import { cellChecklistLines, emptySlotsIn } from "./meal_slots.ts";
import {
  MEAL_SYSTEM_PROMPT,
  MEAL_TOKEN_FIELDS,
  MEAL_TRANSLATABLE_FIELDS,
  PRECEDENCE_BLOCK,
  RECIPE_LEVEL_HINT,
  rhythmLines,
  SEVERITY_READING_BLOCK,
  SOLO_BOX_BLOCK,
  VARIETY_HINT,
} from "./meal_prompt_text.ts";

export function buildMealPrompt(args: {
  /**
   * FF-030 — LES CONTRAINTES DURES DE L'ÉLÈVE. `null` quand la lecture a
   * échoué; `[]` quand il n'en a aucune. Rendues EN TÊTE du message.
   *
   * ── CE QUE SON ABSENCE COÛTAIT, mesuré le 2026-08-08 ─────────────────────
   * `generate-meal-v1` chargeait bien `student_safety_constraints`, et ne les
   * passait qu'à `parseGeneratedMeal` — c'est-à-dire au VERROU DE SORTIE. Le
   * modèle composait donc à l'aveugle, et le verrou est BINAIRE: `clean` est
   * calculé sur la concaténation de TOUS les plats, donc un seul plat qui
   * touche l'allergène vide la semaine entière et rend `empty_meal` en 422.
   * L'élève allergique payait sa sécurité en semaines vides, sans explication.
   *
   * Les deux autres lanes injectaient déjà ce bloc (`week_plan_generation.ts`,
   * `sophia-brain/router/run.ts`), par la MÊME fonction. On copie le placement
   * plutôt que d'en inventer un: une seconde façon de rendre des contraintes
   * médicales divergerait de la première.
   *
   * REQUIS, `T | null`, jamais `T?` — voir `eatingRhythm` plus bas pour la
   * phrase que ce fichier a déjà payée trois fois. Ici la preuve d'un oubli
   * serait une assiette.
   */
  safetyConstraints: readonly StudentSafetyConstraint[] | null;
  /**
   * À QUI EST CHAQUE CONTRAINTE DURE — `null` quand il n'y a qu'une bouche.
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME, mesuré le 2026-08-19 ────────────────────
   * Sur la lane FOYER, ce même bloc titrait « THIS STUDENT'S HARD CONSTRAINTS »
   * pour une tablée de quatre, et chaque ligne était `- pistachio — allergy…`,
   * détachée de sa bouche. Deux runs réels, deux erreurs opposées: l'un devine
   * juste par chance, l'autre met 120 g de l'allergène dans la boîte de
   * l'allergique et écrit l'avertissement sur l'assiette du voisin. Les DÉGOÛTS
   * du même prompt, eux (`- Peregrine: never serve fennel`), sont attachés et
   * appliqués 4 fois sur 4.
   *
   * REQUIS, `T | null`, jamais `T?` — même phrase que `safetyConstraints`
   * au-dessus et que `eatingRhythm` plus bas, et pour la même raison: ici la
   * preuve d'un oubli serait une assiette. La lane individuelle passe `null`
   * EXPRÈS, et rend alors un bloc byte-identique à celui d'avant ce lot.
   */
  safetyConstraintTable: SafetyConstraintTable | null;
  /**
   * FF-030 — CE QU'ON SAIT DE LEUR CORPS, ou `null` quand on ne sait rien (et
   * sur la lane FOYER, qui compose pour plusieurs personnes: il n'y a pas UN
   * corps, et en choisir un dimensionnerait l'assiette de tout le monde sur
   * lui).
   *
   * C'est ce qui dimensionne une portion. Le prompt système DEMANDAIT de
   * dimensionner (« a full lunch or dinner for one adult is a plate of roughly
   * 600 to 750 g ») et rien ne lui disait de qui: `height_cm` avait un écran,
   * une colonne, une contrainte de bornes et zéro lecteur.
   *
   * ⟳ LOT C (2026-09-11) — CETTE PHRASE N'EXISTE PLUS, et le champ reste. Le
   * prompt ne donne plus AUCUN poids d'assiette: il donne la FORME (un tiers de
   * féculent, un quart de protéine, un gras, les légumes par-dessus) et laisse
   * la masse au moteur. Le corps continue donc de dimensionner, mais il le fait
   * seul — plus aucune phrase générique ne peut le contredire.
   *
   * REQUIS, `T | null`, jamais `T?`, et le type porte sa propre garde: le
   * plancher TCA est un champ OBLIGATOIRE de `MealBodyContext` (FF-030 R5).
   */
  body: MealBodyContext | null;
  /**
   * FF-030 — L'AXE QUE L'ÉLÈVE VEUT VOIR MONTER, ou `null`.
   *
   * Sans lui, `performance` et `health` n'ont aucun indicateur de direction:
   * le jeton `goal` dit « santé » et s'arrête là, pendant que `fat_loss` dit
   * au moins « ça descend ». La colonne est collectée depuis le 2026-08-05 et
   * n'était même pas dans le `select` de cette lane.
   *
   * REQUIS, même raison que les deux ci-dessus.
   */
  focusAxis: WeeklyAxis | null;
  /**
   * FF-042 — LA CONSIGNE DE RÉGIME, ou `""` quand personne n'en a déclaré.
   *
   * ── CE QUE SON ABSENCE COÛTAIT, mesuré le 2026-08-18 ─────────────────────
   * `dietary_regime.ts` existe depuis FF-042: il étend un régime en groupes
   * exclus, écrit sa consigne (`dietaryRegimePromptLine`) et nomme ce qu'il
   * rend incouvrable. La lane FOYER le lit (`household_diet.ts`). La lane
   * INDIVIDUELLE n'en appelait que `uncoverableSentinelsFor` — le drapeau de
   * carence — et le mot `regime` n'apparaissait pas une seule fois dans ce
   * fichier. Autrement dit: **on posait la question à l'élève, on écrivait sa
   * réponse en base (`student_safety_constraints.diet_ref`), on en déduisait
   * qu'il lui manquerait de la B12 — et on lui composait du poulet.**
   *
   * C'est le même défaut, à la lettre, que celui que `household_diet.ts`
   * décrit en tête pour la lane foyer. On le ferme du même côté.
   *
   * ── POURQUOI UN BLOC DÉJÀ RENDU, ET PAS LE JETON DU RÉGIME ───────────────
   * Parce que les deux lanes n'ont pas la même phrase à écrire, et qu'une
   * seule d'entre elles peut la calculer:
   *   · solo — `dietaryRegimePromptLine(regime)`, tel quel;
   *   · foyer — `householdDietBlock`, qui ajoute ce que ce fichier ne peut
   *     pas savoir: quelle bouche est la plus stricte de la table, et qui
   *     reçoit son propre plat. Il est déjà rendu, par `userSuffix`.
   * Recalculer ici un régime depuis `safetyConstraints` produirait donc, sur
   * la lane foyer, une SECONDE phrase de régime dans le même prompt.
   *
   * REQUIS, `string` et jamais `T?` — la cicatrice est écrite au call site du
   * foyer, sur `safetyConstraints`: « c'est le paramètre REQUIS qui a rendu
   * cet appelant visible: le compilateur l'a listé. Optionnel, il aurait gardé
   * son trou. » Ici la preuve d'un oubli serait une assiette de viande servie
   * à quelqu'un qui a déclaré ne pas en manger.
   */
  dietBlock: string;
  doctrineBlock: string;
  /**
   * LE MAPPING ALIMENTAIRE DU COACH — `protocolBlockFor()`, vide s'il n'a rien
   * coché.
   *
   * Il est SÉPARÉ du bloc de doctrine, et ce n'est pas une commodité de
   * plomberie: la doctrine dit ce que le coach PENSE, le mapping dit avec quoi
   * il CONSTRUIT. Les fondre ferait deviner au modèle lequel est une conviction
   * qu'il peut citer à l'élève et lequel est une contrainte de composition.
   *
   * Obligatoire et pas optionnel — un appelant qui l'oublie compose des plats
   * en ignorant les trente pastilles que le coach a cochées, sans que rien
   * n'échoue. C'était exactement l'état du produit avant ce câblage.
   */
  protocolBlock: string;
  /** Les clés offertes, pour que `honours_belief_keys` soit vérifiable. */
  beliefKeys: readonly string[];
  goal: string;
  situation: string | null;
  /**
   * CE QU'ILS VEULENT VRAIMENT, DANS LEURS MOTS — `student_goals.aspiration`.
   *
   * ── POURQUOI ELLE ARRIVE ICI LE 2026-08-18 ──────────────────────────────
   * `/app/plan` la demande (« pourquoi ça compte pour toi — mieux qu'un
   * nombre »), la colonne la porte, et `generate-week-plan-v1` l'injecte
   * depuis toujours. La lane REPAS, elle, ne sélectionnait même pas la
   * colonne: mesuré sur le run réel `798c5cd6-…`, un élève qui venait
   * d'écrire son aspiration composait son plan sans qu'un caractère en
   * arrive. Le bloc `-- WHAT THEY ARE AFTER --` n'avait alors QUE le jeton
   * `goal`, un axe que plus aucune dynamique ne lève (`focus_axis`) et une
   * `situation` qu'aucun écran ne sait plus écrire — c'est-à-dire, pour tout
   * compte neuf, une seule ligne utile.
   *
   * ⚠️ MÊME PHRASE QUE LA LANE SEMAINE, VOLONTAIREMENT: elle vient de
   * `week_plan_generation.ts` mot pour mot, parce que deux formulations pour
   * le même champ dérivent, et c'est celle qui est la moins relue qui garde
   * l'ancienne. Ce qui change est ce qu'on en fait — ici, CHOISIR des plats,
   * là-bas, choisir des convictions.
   *
   * `null` = rien d'écrit ⇒ aucune ligne ajoutée (patron du bloc entier).
   */
  aspiration?: string | null;
  /** Le contexte du MOMENT, en prose libre. C'est la demande produit. */
  context: string | null;
  /**
   * CE DONT ILS ONT ENVIE POUR CETTE COMPOSITION — « mezze d'été, plein de
   * carottes ». Daté, tapé au moment de générer.
   *
   * À ne pas confondre avec `foodPreferences`, qui est ce qu'ils ont dit de leur
   * bouffe EN CONVERSATION et qui vaut pour toutes leurs semaines. L'un est une
   * envie, l'autre un goût.
   */
  preferences?: string | null;
  mode: MealMode;
  scope: MealScope;
  slot: MealSlot | null;
  servings: number;
  pantry: readonly PantryItem[];
  /** Le jeton du jour de l'élève, dans SON fuseau. Jamais celui du serveur. */
  todayToken?: string | null;
  /**
   * LA DATE DU JOUR, dans le fuseau de l'élève — et pas seulement le jour de la
   * semaine.
   *
   * « mercredi » ne dit pas si on est en février ou en août. Sans la date, rien
   * dans ce prompt ne permettait au modèle de savoir ce qui pousse en ce moment,
   * et il proposait des blanquettes en plein été.
   */
  today?: string | null;
  /**
   * LA DATE D'OUVERTURE DE LA FENÊTRE (ISO), dans le fuseau de l'élève.
   *
   * ⛔ ELLE EXISTE PARCE QUE LES JETONS DE JOUR NE SUFFISENT PAS À SITUER UNE
   * SEMAINE. `mon`…`sun` sont SEPT noms: ils ordonnent les jours d'une fenêtre,
   * ils ne disent pas DE QUELLE semaine il s'agit. Tant que le produit
   * n'acceptait qu'un départ dans la semaine en cours, « today is: wed » suffisait
   * à l'ancrer. Depuis le 2026-09-06, le départ est LIBRE (seul le passé est
   * refusé), et deux fenêtres peuvent porter exactement la même liste de jetons —
   * à sept jours d'écart, le premier jeton est même celui d'AUJOURD'HUI.
   *
   * ⚠️ C'EST DONC ELLE QUI REMPLACE LA GARDE RETIRÉE, et pas une reformulation
   * de plus. `windowStartsBeyondDayTokens` refusait `400 window_beyond_this_week`
   * pour que la contradiction n'atteigne jamais le modèle; on la rend maintenant
   * IMPOSSIBLE en nommant la date, au lieu d'interdire le geste qui la produit.
   * Voir la tombe dans `meal_plan_window.ts`.
   *
   * `null`/absent ⇒ aucune ligne, et la liste des jours reste ordonnée par
   * elle-même — le comportement d'avant ce lot pour tout appelant qui ne la
   * passe pas.
   */
  windowStartsOn?: string | null;
  /**
   * LE PAYS OÙ L'ÉLÈVE FAIT SES COURSES (ISO-3166 alpha-2), ou `null`.
   *
   * Une saison n'existe pas dans l'absolu: août est l'été en France et l'hiver
   * en Argentine, et sous l'équateur la question ne se pose pas dans ces termes.
   * On transmet donc le PAYS et la DATE — des faits — plutôt que « c'est
   * l'été », qui serait notre déduction et qu'on aurait tort d'imposer.
   */
  country?: string | null;
  /** ⟳ 2026-09-20 — vrai quand `country` est DÉDUIT de la langue, faute de `profiles.country`. */
  countryAssumed?: boolean;
  /**
   * CE QUE L'ÉLÈVE PEUT VRAIMENT FAIRE — `practical_constraints`.
   *
   * Quatre entrées qui décidaient de tout et que le moteur devinait: les jours
   * où il peut cuisiner, le temps par session, le niveau de recette, le budget.
   * Un plan parfait et inapplicable est la première cause d'abandon.
   */
  cookDays?: readonly string[];
  cookingTimeMin?: number | null;
  recipeDifficulty?: string | null;
  variety?: string | null;
  /**
   * LES MOYENS DE CUISSON DÉCLARÉS — `practical_constraints.kitchen_equipment`.
   *
   * ⚠️ TROIS VALEURS, ET LA TROISIÈME EST LA GARDE. `null` = « on ne lui a
   * jamais posé la question » ⇒ AUCUNE ligne, prompt identique à avant ce lot
   * pour tous les comptes d'avant. Le tableau déclaré ⇒ ce qui n'y est pas est
   * déclaré ABSENT, et `kitchenEquipmentPromptLines` l'interdit nommément.
   *
   * `?:` À CONTRE-COURANT DE `fixedIntakes`/`dayProperties`, ET C'EST MOTIVÉ:
   * `buildMealPrompt` a DEUX appelants, et le second est la lane foyer, hors
   * du périmètre de ce lot (son prompt expire à 4 min, chaque bloc ajouté s'y
   * paie). Un paramètre requis forcerait une édition dans son fichier. Le
   * risque que ce lot-ci l'oublie est tenu par un test de SOURCE sur le site
   * d'appel solo — `kitchen_equipment_solo_lane_test.ts`, patron
   * `dietary_regime_solo_lane_test.ts`.
   */
  kitchenEquipment?: readonly KitchenTool[] | null;
  /**
   * L'ARGENT DE CE PLAN-LÀ, EN CHIFFRE — dans la monnaie du pays de l'élève,
   * que `country` ci-dessus porte déjà.
   *
   * ── CE QUE C'ÉTAIT: `budgetBand`, « tight / normal / comfortable » ────────
   * Le mot partait au modèle tel quel, et il ne dit rien: « serré » pour une
   * personne seule et « serré » pour une table de cinq ne désignent ni la même
   * somme ni le même arbitrage. Or c'est l'arbitrage qui est demandé — quand
   * il n'y a pas d'argent, on ne « fait pas attention », on renonce à la
   * viande. Un montant se compare à un panier; un adjectif ne se compare à
   * rien.
   *
   * ⚠️ PROPRIÉTÉ REQUISE, VALEUR NULLABLE, ET LA DISTINCTION EST LA GARDE.
   * `budgetBand` était `?:` — un appelant pouvait l'oublier, et la ligne de
   * prompt disparaissait sans que rien n'échoue. C'est la cicatrice
   * `safetyBand` du dépôt, à l'identique. Ici l'absence doit être ÉCRITE:
   * `null` est une réponse (« cette composition n'a pas de budget »), une
   * propriété manquante ne compile pas.
   */
  budgetAmount: number | null;
  /**
   * ⛔ LE PLANCHER DE CE PLAN-LÀ — sous lui, le plafond ne s'écrit PAS.
   *
   * ── POURQUOI UN PLAFOND IMPOSSIBLE EST PIRE QU'AUCUN PLAFOND ─────────────
   * Le modèle ne refuse jamais un budget: il COUPE, dans l'ordre que la ligne
   * suivante lui donne, et quand l'ordre ne suffit plus il rend un plan qui a
   * l'air de tenir. « budget for this plan: 1 » pour sept jours à quatre fait
   * donc arbitrer toute la composition contre une contrainte imaginaire, et le
   * seul poste qui reste à rogner est celui que tout le reste de ce prompt
   * calcule. Ne rien dire rend un plan honnête; dire l'impossible rend un
   * mensonge.
   *
   * ⚠️ PROPRIÉTÉ REQUISE, VALEUR NULLABLE — la même distinction que
   * `budgetAmount` juste au-dessus, et pour la même cicatrice (`safetyBand`).
   * `null` est une réponse: « cette demande n'a pas de plancher » (hors des
   * deux marchés de la grille de prix, ou rien à nourrir). Une propriété
   * manquante, elle, ne compile pas — et c'est ce qui a fait remonter les deux
   * appelants au compilateur.
   *
   * ⛔ ET CE N'EST PAS UN REFUS. La fonction edge continue de composer: le
   * refus appartient au CHAMP, sur les deux écrans qui composent, parce que
   * c'est le seul endroit où quelqu'un peut corriger sa réponse. Ici on cesse
   * seulement de faire semblant.
   */
  budgetFloor: number | null;
  /**
   * CE QUE L'ÉLÈVE A DIT SUR SA BOUFFE, promu depuis la conversation.
   *
   * ── POURQUOI C'EST UN ARGUMENT NOMMÉ ICI, ET PAS UN JSONB ─────────────
   * `generate-week-plan-v1` sérialise `practical_constraints` en entier, donc
   * il verrait cette clé sans rien changer. Ce générateur-ci lit des clés
   * NOMMÉES (`eating_rhythm`, capacité de cuisine): une clé de plus y est
   * invisible tant que personne ne la passe. C'est exactement le défaut que
   * `coach_food_rules` a produit — un écran, des gardes, trente tests, et
   * aucun lecteur au runtime.
   *
   * Vide = l'élève n'a rien confirmé, et le prompt est celui d'avant.
   */
  foodPreferences?: readonly string[];
  /**
   * CE QUE L'ÉLÈVE A TAPÉ LUI-MÊME — des consignes, pas des préférences.
   *
   * Même source que `foodPreferences` (`food_preferences`), mais l'autre
   * seau de `foodPreferencesByOrigin`: ces lignes-là portent
   * `origin.source === "written"`.
   *
   * ── OPTIONNEL, ET LA GARDE EST AILLEURS — C'EST UNE DÉCISION ──────────
   * Le commentaire de `foodPreferences` raconte pourquoi une clé NOMMÉE de
   * plus est invisible tant que personne ne la passe, et cite
   * `coach_food_rules` comme le mort de cette famille: un écran, des gardes,
   * trente tests, aucun lecteur au runtime. `coachNoteBlock` en tire un champ
   * REQUIS, pour que la casse de compilation recense les appelants.
   *
   * Ici la même leçon donne l'inverse, et il faut voir pourquoi. Un champ
   * requis prouve qu'un appelant a ÉCRIT `writtenInstructions: <quelque
   * chose>` — y compris `[]`, qui est très exactement l'état débranché qu'on
   * craint. Il recense les signatures, pas les branchements.
   *
   * Ce qui tient vraiment cette lane est dans `household_voices_test.ts`: un
   * test qui LIT la source de `generate-meal-v1` et exige d'y trouver
   * `writtenInstructions: readFoodPreferences(`. Celui-là rougit sur un `[]`
   * de complaisance, ce que le typage ne saurait pas faire. Il est donc
   * strictement plus fort, et le champ n'a pas besoin d'être requis pour être
   * gardé.
   *
   * Le `?? []` du corps suit: les fixtures tournent en `--no-check`, et un
   * champ absent y donnerait un `TypeError` sur `.length` — un rouge qui ne
   * dit pas ce qu'il veut.
   */
  writtenInstructions?: readonly string[];
  /**
   * ── LOT M4 · LE MÉMO — cinq lignes, pour ce qu'aucune famille ne porte ─────
   *
   * `[]` quand il est vide, ce qui est le cas ordinaire. Les textes SEULS: ni
   * date, ni source, ni citation — le modèle compose, il n'a pas à savoir d'où
   * vient une consigne, et lui donner la phrase source la lui ferait lire deux
   * fois.
   *
   * ⛔ C'EST LE SEUL BLOC DE TEXTE LIBRE SANS FAMILLE QUE CE PROMPT REÇOIT, et
   * c'est pour ça qu'il est PLAFONNÉ À CINQ à la source (`MEMO_MAX_LINES`).
   * Un champ texte caché, sans plafond, injecté dans chaque prompt est
   * exactement le magasin que ce chantier supprime, avec un autre chapeau — et
   * la chose la plus difficile à déboguer du produit.
   */
  memo?: readonly string[];
  /**
   * LA NOTE DU COACH SUR CET ÉLÈVE — mode 1:1 assumé, `null` quand il n'y en a
   * pas (le cas ordinaire). Produit par `coachNotePromptBlock`.
   *
   * REQUIS, `T | null`, jamais `T?` — contrairement à `foodPreferences` juste
   * au-dessus, et exprès. Le commentaire de `foodPreferences` explique
   * pourquoi une clé NOMMÉE de plus est invisible ici tant que personne ne la
   * passe, et cite `coach_food_rules` comme le mort de cette famille. Un champ
   * optionnel signerait le même défaut une deuxième fois, dans le fichier qui
   * le documente.
   */
  coachNoteBlock: string | null;
  /** Les jours à remplir, à partir d'aujourd'hui. Vide = le modèle décide. */
  daysToFill?: readonly string[];
  /**
   * Les moments d'une journée NORMALE pour cet élève. Vide = il ne l'a pas dit,
   * et on retombe sur les trois repas que le moteur imposait jusqu'ici.
   */
  eatingRhythm?: readonly EatingOccasionSlot[];
  /**
   * Les moments où l'élève NE MANGE PAS ICI. Vide = il mange tout ce que son
   * rythme nomme, tous les jours de la fenêtre.
   */
  awayDays?: readonly AwayDay[];
  /**
   * FF-051 — CE QUE L'ÉLÈVE MANGE DÉJÀ, hors de ce qu'on compose.
   *
   * REQUIS, avec `[]` pour « aucun », jamais `T?`. C'est la CINQUIÈME fois que
   * ce fichier écrit cette phrase, et il l'a payée les quatre précédentes
   * (`eatingRhythm`, `awayDays`, `cookingTimeMin`, `composition`): un paramètre
   * optionnel est un paramètre qu'un appelant oublie. Ici l'oubli coûte un
   * petit-déjeuner de trop tous les matins, à quelqu'un qui avait pris la peine
   * de le dire — et rien n'échouerait.
   */
  fixedIntakes: readonly FixedIntake[];
  /**
   * FF-052 — CE QUE CERTAINS JOURS SONT, en positif.
   *
   * REQUIS, `[]` pour « rien de déclaré ». Sixième fois que ce fichier écrit
   * cette phrase; l'oubli coûterait ici un dîner neuf composé un jour de
   * restes, c'est-à-dire la moitié d'un batch jetée.
   */
  dayProperties: readonly DayPropertyEntry[];
  /**
   * L4/D6 — LA BOUCHE REPRISE PAR LA FUSION, ou `null`.
   *
   * ⚠️ REQUIS, `T | null`, jamais `T?`, et la raison est MESURÉE. La fusion
   * ajoute des plats PAR CONSTRUCTION: sans ce champ, le même prompt annonce
   * « au plus 15 plats » et « donne-lui un SECOND plat ». Un champ facultatif
   * n'aurait fait remonter AUCUN appelant au compilateur — et le jour où une
   * troisième lane apparaît, elle hériterait du budget d'une table qui n'a pas
   * la bouche qu'on lui a ajoutée. Chaque appelant DIT ce qu'il veut.
   */
  merge: MergedEater | null;
  /**
   * LE PREMIER JOUR DE LA FENÊTRE EST-IL ENCORE CUISINABLE ?
   *
   * ── LE TROU QU'IL FERME ──────────────────────────────────────────────────
   * La branche `tooLate`, plus bas, ajoute d'office une session de cuisine sur
   * le PREMIER jour de la fenêtre quand tous les jours déclarés tombent après
   * lui. C'est juste — sauf à 21 h: on demande alors à quelqu'un de faire ses
   * courses dans un magasin fermé puis de cuisiner un lot, ce soir. La branche
   * vise alors le jour SUIVANT.
   *
   * ⚠️ REQUIS ET SANS DÉFAUT, `boolean`. `true` est une AFFIRMATION (« ce
   * premier jour est encore cuisinable »), pas un repli: un appelant qui
   * n'aurait pas su lire l'horloge doit le dire en passant `true` — le
   * comportement d'hier — et pas l'hériter d'un `?`. Septième fois que ce
   * fichier écrit cette phrase.
   *
   * Le calcul appartient à `plan_hours.ts::firstWindowDayIsCookable`, avec la
   * coupure nommée; il n'est PAS recopié ici. Une seconde définition de « 18 h »
   * dériverait de la première le jour où quelqu'un la change.
   */
  firstDayCookable: boolean;
  /**
   * CE FOYER A-T-IL DÉCLARÉ UN CONGÉLATEUR ? — 2026-09-01.
   *
   * ⛔ REQUIS, ET IL NE SE DÉRIVE PAS DE `kitchenEquipment` PLUS BAS. Celui-là
   * est OPTIONNEL et la lane FOYER ne le passe délibérément pas (elle écrit son
   * propre bloc de cuisine dans son enveloppe, et un test l'y tient pour éviter
   * la consigne en double). Le déduire ferait donc `hasFreezer: false` pour
   * TOUS les foyers — c'est-à-dire nommer hors de portée des journées que le
   * congélateur rend parfaitement atteignables, et défaire sur cette lane le
   * lot qui vient de les sauver.
   *
   * ⚠️ LES DEUX LANES LE CALCULENT PAR `hasFreezerDeclared()`, jamais à la
   * main: `false` (pas de congélateur) et `null` (jamais demandé) doivent
   * rendre le même `false`, et c'est cette fonction-là qui le garantit.
   */
  hasFreezer: boolean;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * LA CADENCE DE COURSES, TELLE QUE LE MOTEUR L'A DÉRIVÉE — 2026-09-09.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Neuvième fois que ce fichier écrit cette
   * phrase, et le cas mesuré est exactement celui qu'un `?` aurait laissé
   * passer: le plan de cuisine (`cooking_plan.ts`) savait « une course, trois
   * sessions, congélateur », le moteur des vagues congelait la dinde à
   * l'achat — et la consigne, qui n'en savait rien, faisait écrire au modèle
   * « acheter la dinde fraîche le jour même ». `usesFreezer` n'avait AUCUN
   * lecteur côté prompt.
   *
   * `null` = la cadence n'a jamais été déclarée (`capacity.plan === null`):
   * le bloc de la fenêtre crue est alors celui d'avant ce lot, au caractère
   * près. Sinon: la lecture de `capacity.plan`, jamais un second calcul.
   */
  groceryCadence: RawReachCadence | null;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * « TOUT DANS UNE SESSION DE CUISINE » — LA DEMANDE, 2026-09-01.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS ET SANS DÉFAUT, `boolean`. Un `?` aurait laissé passer les deux
   * lanes sans un mot du compilateur, et l'option se serait construite sans
   * être branchée — huitième fois que ce fichier écrit cette phrase.
   *
   * ⚠️ IL EST DÉJÀ TRANCHÉ QUAND IL ARRIVE ICI. L'appelant fait
   * `askedOneSession && hasFreezerDeclared(equipment)`; ce module ne refait pas
   * la porte. La raison est la même que pour `hasFreezer` juste au-dessus: une
   * seconde lecture de l'inventaire à cet endroit finirait par diverger de
   * celle qui compte, et c'est toujours celle qu'on regarde le moins qui garde
   * l'ancien comportement.
   *
   * ⚠️ CE N'EST PAS UN RÉGLAGE DE PROFIL. Il voyage avec la demande, comme le
   * budget et le mode de cuisson: « cette semaine-ci, je cuisine une fois » est
   * un arbitrage de semaine, et l'écrire dans `practical_constraints` le
   * rejouerait en silence sur celle où on reçoit du monde.
   */
  oneCookingSession: boolean;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * LE JOUR OÙ L'ON CUISINE ET OÙ RIEN NE SE MANGE — « je cuisine la veille ».
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `null` = pas de veille, et le prompt est alors byte-identique à celui
   * d'avant ce lot. Sinon: un jeton de jour, TOUJOURS le premier de
   * `daysToFill`, accordé par `withCookDayBefore` (`meal_plan_window.ts`).
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un champ facultatif ici aurait laissé
   * passer les deux lanes sans un mot du compilateur, et la veille se serait
   * construite sans atteindre le modèle — le plan aurait alors composé des
   * REPAS sur le jour de cuisine, et le parseur les aurait jetés.
   *
   * ⚠️ IL RESTE DANS `daysToFill`, ET C'EST OBLIGATOIRE. La fenêtre du cuit
   * compte les rangs sur `daysToFill`: en retirer la veille placerait la
   * casserole du jour 0 HORS fenêtre, donc `not_evaluated` — dont le seuil est
   * zéro. Il est retiré de ce que le modèle doit REMPLIR, jamais de ce qui
   * situe les jours les uns par rapport aux autres.
   */
  cookOnlyDay: string | null;
  /**
   * CETTE LANE RÉCLAME-T-ELLE DES CONTENANTS SANS NOM ? — 2026-09-01.
   *
   * `true` sur la lane INDIVIDUELLE, `false` sur la lane FOYER — qui a son
   * propre bloc (`boxSchemaBlock`, avec les `member_ids`) dans son enveloppe.
   *
   * ⛔ REQUIS ET SANS DÉFAUT. Les deux lanes doivent le DIRE: un `?` aurait
   * donné le bloc à personne (le défaut d'aujourd'hui) ou aux deux (deux
   * protocoles de boîte dans le même prompt, l'un nommant des bouches que
   * l'autre déclare inexistantes).
   */
  soloBoxes: boolean;
  /**
   * ⟳ 2026-09-07 — LE MODÈLE A-T-IL ÉCRIT UNE RECETTE STANDARD ? (v33)
   *
   * `true` quand le prompt lui a demandé UNE portion par plat et interdit les
   * boîtes: la relecture change alors sur deux points, et seulement deux.
   *
   * ⛔ REQUIS ET SANS DÉFAUT, comme `soloBoxes` juste au-dessus. Un `?` ferait
   * relire une sortie v33 avec les règles de v32 — c'est-à-dire jeter les
   * casseroles d'une seule portion, qui sont le CAS NOMINAL de v33.
   */
  standardRecipe: boolean;
  /**
   * LA LANGUE DANS LAQUELLE CES PLATS SONT ÉCRITS. REQUIS, jamais `T?`.
   *
   * Vient de `resolveArtifactLocale({studentProfile, tenantDefault})`, donc de
   * `profiles.locale` — la langue CHOISIE, celle que l'agent parle. Pas de
   * `student_goals.content_locale`, qui est la langue dans laquelle l'élève a
   * écrit sa situation (R3, troisième axe) et que tous ses écrivains sèment
   * `'en-GB'`.
   */
  contentLocale: string;
}): { systemPrompt: string; userMessage: string; contentLocale: string } {
  const rhythm = args.eatingRhythm && args.eatingRhythm.length > 0
    ? args.eatingRhythm
    : DEFAULT_EATING_RHYTHM;
  // `rhythm` RÉSOLU, jamais `args.eatingRhythm` brut: le plafond doit être celui
  // des moments que le prompt NOMME trois lignes plus haut. Passer le brut a
  // déjà produit la divergence exacte que `dishCapFor` documente — la consigne
  // demandait trois plats, le plafond en autorisait quatre.
  //
  // DEUX NOMBRES, ET ILS NE MESURENT PAS LA MÊME CHOSE.
  //   · `cap`     — les PLATS. Il compte la bouche reprise par la fusion, qui
  //                 en demande de son côté (`dishBudgetFor`).
  //   · `baseCap` — les SESSIONS, plus bas. Il ne la compte PAS, et c'est le
  //                 sujet: le barreau ② promet mot pour mot « one session at
  //                 the stove, two dishes out of it ». Dériver le budget de
  //                 sessions du plafond GONFLÉ contredirait la consigne servie,
  //                 dans le même message. Le barreau ③, lui, réclame bien une
  //                 session à part — elle se prend dans un budget qui est un
  //                 PLAFOND et non une cible (mesuré: 5 autorisées, 2 à 3
  //                 utilisées). Si un run montre que ③ manque de place, c'est
  //                 ici, en une ligne, que ça se répare.
  // ══════════════════════════════════════════════════════════════════════
  // LES JOURS À REMPLIR ≠ LES JOURS DE LA FENÊTRE — « je cuisine la veille »
  // ══════════════════════════════════════════════════════════════════════
  //
  // La veille est DANS la fenêtre (elle situe les casseroles, voir le pavé de
  // `cookOnlyDay`) et HORS des jours à remplir (rien ne s'y mange). Les deux
  // listes se séparent donc ici, une fois, et chaque lecteur prend la sienne:
  //
  //   · `daysToFill`  → les rangs, la fenêtre du cuit, les jours de cuisine;
  //   · `daysToEat`   → la commande faite au modèle, et le PLAFOND de plats.
  //
  // ⛔ LE PLAFOND SUIT `daysToEat`, ET C'EST LA MOITIÉ QUI COMPTE. Le laisser
  // sur la fenêtre entière autoriserait un jour de repas de plus que le plan
  // n'en porte — et le modèle remplit ce qu'on lui autorise: il aurait écrit
  // des plats sur le jour de cuisine, que le parseur jette ensuite.
  const windowDays = args.daysToFill ?? [];
  const daysToEat = args.cookOnlyDay === null
    ? windowDays
    : windowDays.filter((d) => d !== args.cookOnlyDay);
  const baseCap = dishCapFor(args.scope, rhythm, daysToEat.length || 7);
  const cap = dishBudgetFor({
    scope: args.scope,
    rhythm,
    daysToFill: daysToEat.length || 7,
    merge: args.merge,
  });
  // ══════════════════════════════════════════════════════════════════════
  // LA GRILLE — LES CASES À REMPLIR, ÉNUMÉRÉES
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ELLE SORT D'`emptySlotsIn`, APPELÉE AVEC ZÉRO PLAT, ET C'EST LE POINT.
  // Le constat de trous (`shown_plan_gaps`) et le contrôle final comptent déjà
  // leur grille avec cette fonction-là; un second calcul ici aurait divergé au
  // premier absent, au premier apport fixe ou au premier jour de cuisine — et
  // la consigne aurait alors réclamé des cases que le contrôle ne compte pas.
  //
  // ⚠️ `cookOnlyDay: null` PARCE QUE `daysToEat` L'A DÉJÀ RETIRÉ. Le repasser
  // ici le retirerait deux fois, ce qui est inoffensif aujourd'hui et faux le
  // jour où `daysToEat` cesse de le filtrer.
  const cellsToFill = emptySlotsIn({
    days: daysToEat,
    cookOnlyDay: null,
    rhythm,
    dishes: [],
    awayDays: args.awayDays ?? [],
    fixedIntakes: args.fixedIntakes,
  });
  // Les absences, en prose, une ligne par jour. Calculées ici pour être
  // insérées plus bas dans la même liste que le reste des contraintes.
  const awayLines = (args.awayDays ?? []).map((a) =>
    a.slots.length === 0
      ? `- ${dayProse(a.day)}: the whole day`
      : `- ${dayProse(a.day)}: ${a.slots.map((s) => OCCASION_PROSE[s]).join(", ")}`
  );
  const pantryLines = args.pantry
    .map((p) => (p.quantity ? `- ${p.term} (${p.quantity})` : `- ${p.term}`))
    .join("\n");

  // ── LES CONTRAINTES DURES, EN TÊTE ────────────────────────────────────────
  // Même placement que `buildWeekPlanPrompt`, et pour la raison qui y est
  // écrite: si le budget de prompt tronque quoi que ce soit, ce n'est pas la
  // ligne qui dit « pas d'arachide » qui doit sauter.
  const safetyBlock = safetyConstraintsPromptBlock(
    args.safetyConstraints,
    args.safetyConstraintTable,
  );

  // Le corps, en deux blocs qui atterrissent à deux rangs différents. Le
  // plancher TCA est appliqué DANS `mealBodyBlocks`, pas ici (FF-030 R5).
  const bodyBlocks = mealBodyBlocks(args.body);

  // ── LES CONTRAINTES DE CUISINE, calculées ici pour être posées sous
  //    `-- WHAT THEY CAN COOK --` ────────────────────────────────────────────
  // LES JOURS DE CUISINE, INTERSECTÉS AVEC LA FENÊTRE. Mesuré: un élève qui
  // déclare cuisiner « dimanche et mercredi », plan généré un JEUDI, recevait
  // une session le MERCREDI — un jour déjà passé. Ses jours de cuisine sont
  // une propriété de sa semaine type; la fenêtre est ce qu'il en reste, et
  // c'est l'intersection qui est exécutable.
  //
  // L'INTERSECTION VIDE RETOMBE SUR LA FENÊTRE, jamais sur rien: quelqu'un
  // qui ne cuisine que le lundi, un vendredi, doit quand même manger. Mieux
  // vaut une session posée un jour non déclaré — qu'il déplacera — qu'un plan
  // sans aucun jour de cuisine.
  //
  // ⚠️ LE COMMENTAIRE HISTORIQUE DE CE BLOC A DÉMÉNAGÉ dans `addedCookDays`,
  // avec le calcul qu'il décrit.
  // ══════════════════════════════════════════════════════════════════════
  // « TOUT DANS UNE SESSION DE CUISINE » — 2026-09-01
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ CALCULÉ ICI, ET LU PAR TROIS BLOCS. Le jour de la session unique décide
  // la consigne (juste en dessous), les journées hors de portée
  // (`daysOutOfBatchReach`) et le plafond de temps (`sessionCeilingMinutes`).
  // Le recalculer dans chacun ferait trois réponses à une seule question, et
  // c'est celle qu'on regarde le moins qui garderait l'ancienne.
  //
  // ⛔ L'UNION, JAMAIS LES SEULS JOURS DÉCLARÉS. `addedCookDays` vient
  // peut-être de poser le seul jour cuisinable de la fenêtre; l'ignorer rendrait
  // `null` — donc une session sans jour nommé — là où le moteur en a justement
  // un. C'est la même union que `daysOutOfBatchReach` réclame, et elle était
  // écrite deux fois en ligne: elle l'est maintenant une seule.
  const effectiveCookDays = [
    // ⛔ LA VEILLE EST UN JOUR DE CUISINE, ET C'EST LE SEUL QU'ELLE SOIT. Sans
    // cette ligne, un plan « je cuisine la veille » n'aurait AUCUN jour de
    // cuisine connu: `singleSessionCookDay` rendrait `null` (donc une session
    // sans jour nommé, alors qu'on vient de l'ajouter exprès) et
    // `daysOutOfBatchReach` se tairait sur une fenêtre dont il sait tout.
    ...(args.cookOnlyDay === null ? [] : [args.cookOnlyDay]),
    ...usableCookDays({
      declared: args.cookDays ?? [],
      window: args.daysToFill ?? [],
    }),
    ...addedCookDays({
      declared: args.cookDays ?? [],
      window: args.daysToFill ?? [],
      firstDayCookable: args.firstDayCookable,
    }),
  ];
  // ⟳ 2026-09-25 — les jours de cuisine, dédoublonnés, dans l'ordre de la
  // fenêtre: ceux que la ligne du nombre de sessions nomme.
  const chosenCookDays = (args.daysToFill ?? []).filter((d, i, all) =>
    effectiveCookDays.includes(d) && all.indexOf(d) === i
  );
  const singleSessionDay = args.oneCookingSession
    ? singleSessionCookDay({
      window: args.daysToFill ?? [],
      cookDays: effectiveCookDays,
    })
    : null;

  const cookDayLines = ((): string[] => {
    const window = args.daysToFill ?? [];
    const declared = args.cookDays ?? [];
    // ══════════════════════════════════════════════════════════════════
    // ⛔ L'OPTION REMPLACE CETTE CONSIGNE, ELLE NE S'Y AJOUTE PAS.
    // ══════════════════════════════════════════════════════════════════
    //
    // « they can only cook on: sun, wed » et « tout tient dans UNE session »
    // se contrediraient à trois lignes d'écart, et le run réel du 2026-09-01
    // a déjà montré ce que le modèle fait de deux consignes concurrentes: il
    // suit la plus permissive et le parseur jette la différence.
    //
    // ⚠️ ELLE PASSE AUSSI AVANT LE `declared.length === 0`. Quelqu'un qui n'a
    // coché aucun jour et qui demande une session unique demande quand même
    // UNE session: se taire ici lui rendrait le plan d'avant l'option, sans
    // qu'un seul mot ne le dise.
    if (args.oneCookingSession) {
      return [
        singleSessionDay
          ? `they want ALL the cooking for this stretch done in ONE session, ` +
            `on ${singleSessionDay}. Write exactly ONE entry in ` +
            `"cooking_sessions", on that day, and cook every preparation in ` +
            `it. No second cooking day, and nothing cooked on any other day ` +
            `beyond what a plate needs on the spot.`
          : `they want ALL the cooking for this stretch done in ONE session. ` +
            `Write exactly ONE entry in "cooking_sessions", as early in the ` +
            `stretch as you can, and cook every preparation in it. No second ` +
            `cooking day, and nothing cooked on any other day beyond what a ` +
            `plate needs on the spot.`,
        // ⚠️ LA CLÉ EST NOMMÉE, ET COLLÉE À SA PROMESSE. `kept: "freezer"`
        // existe depuis v20 et RIEN ne la réclamait: mesuré le 2026-09-01, le
        // modèle écrivait « FREEZE the rest » trois fois en prose et laissait
        // la clé vide — la prose ne garde rien, et huit repas sur vingt-et-un
        // étaient jetés. Une session unique ne tient QUE si cette clé est
        // écrite, donc elle est réclamée ici, en toutes lettres.
        `they have a freezer, and it is the only reason one session can feed ` +
        `this stretch: every serving eaten more than ${MAX_FRIDGE_DAYS - 1} ` +
        `days after that session MUST carry "kept": "freezer" on its entry in ` +
        `"uses". Saying it in the method is NOT enough -- a serving without ` +
        `that key is kept in the fridge, and it will be thrown away.`,
      ];
    }
    if (declared.length === 0) return [];
    // ⚠️ LA MÊME EXPRESSION QUE L'EXPLICATION, appelée. Ce filtre était écrit
    // ici, en ligne, et `plan_rationale` ne pouvait pas le lire: il affirmait
    // donc que les jours écartés avaient été « gardés ». Voir le pavé de
    // `usableCookDays`.
    const usable = usableCookDays({ declared, window });

    // ── LA CONTRAINTE DOIT RESTER SATISFAISABLE ─────────────────────────
    // MESURÉ: jours déclarés `sun, wed`, fenêtre jeudi→dimanche.
    // L'intersection ne laisse que DIMANCHE — le dernier jour. Le modèle a
    // donc fait manger jeudi, vendredi et samedi sur un lot cuisiné le
    // dimanche: quatre repas antérieurs à leur propre cuisson. Quatre
    // `issues` sur un vrai plan, et un plan inexécutable.
    //
    // Un jour de cuisine qui arrive APRÈS les repas qu'il doit nourrir n'est
    // pas une contrainte, c'est une impasse. On ajoute donc le PREMIER jour
    // de la fenêtre — et on DIT que c'est un ajout, pour que le modèle
    // n'aille pas croire que l'élève l'a déclaré. Le pire cas est une session
    // posée un jour non déclaré, qu'il déplacera; l'autre pire cas est une
    // semaine qu'il ne peut pas cuisiner.
    //
    // ⚠️ LE CALCUL VIT DANS `addedCookDays`, ET C'EST LA MOITIÉ QUI COMPTE.
    // La phrase ci-dessous demande au modèle de DIRE que le jour est un ajout;
    // le run réel du 2026-08-12 montre qu'il ne l'a pas dit. `plan_rationale`
    // le dit désormais de façon déterministe — et il doit nommer EXACTEMENT le
    // jour que cette consigne a demandé. Deux calculs du même ajout
    // divergeraient, et c'est l'explication qui aurait tort.
    const added = addedCookDays({
      declared,
      window,
      firstDayCookable: args.firstDayCookable,
    });
    const first = added[0];
    const tooLate = added.length > 0;

    if (usable.length === 0) {
      return [
        `they usually cook on ${declared.join(", ")}, but none of those days ` +
        "are left in this stretch. Put the cooking sessions on the days you " +
        "do have, as early as possible.",
      ];
    }
    if (tooLate) {
      return [
        `they usually cook on ${usable.join(", ")} -- all of which fall after ` +
        `${first}, so nothing cooked then can feed the days before it. Cook ` +
        `on ${first} as well, and say so: it is a day they did not ask for. ` +
        "Everything before their usual day is cooked fresh, not from a batch.",
      ];
    }
    return [
      `they can only cook on: ${usable.join(", ")}. Put every cooking ` +
      "session on those days, and no others.",
    ];
  })();

  // ══════════════════════════════════════════════════════════════════════
  // LES JOURS QU'AUCUN LOT N'ATTEINT, NOMMÉS — 2026-09-01
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA RÈGLE GÉNÉRALE EXISTAIT DÉJÀ, ET ELLE NE MORDAIT PAS. Le bloc
  // `== NOTHING IS EATEN BEFORE IT IS COOKED ==` dit, mot pour mot, que jeudi,
  // vendredi et samedi ne peuvent pas vivre d'un lot du dimanche. Mesuré le
  // 2026-09-01 sur « une session, sept jours »: le modèle a quand même écrit
  // huit plats qui puisent dans la casserole du dimanche, et le parseur les a
  // jetés — quatre journées réduites à leur petit-déjeuner.
  //
  // C'est la leçon d'`addedCookDays`, resservie: une règle générale ne se
  // compare pas, un jour NOMMÉ si. Ces jours-ci sont calculés, et par la MÊME
  // comparaison que la porte qui jette — `daysOutOfBatchReach` documente
  // pourquoi le `>=` doit être identique des deux côtés.
  //
  // ⛔ ET ON N'AJOUTE AUCUNE SESSION. Une session de plus est une vague de
  // courses de plus; la personne a dit ce qu'elle pouvait faire. C'est le
  // CONTENU de ces jours-là qui s'adapte — voir l'en-tête de
  // `plan_feasibility.ts`.
  const outOfReach = daysOutOfBatchReach({
    window: args.daysToFill ?? [],
    // L'UNION, jamais les seuls jours déclarés: `addedCookDays` vient peut-être
    // d'en poser un, et l'ignorer déclarerait hors de portée une journée que le
    // moteur rend justement atteignable. Elle est calculée plus haut, une fois.
    //
    // ⚠️ ET L'OPTION LA RÉDUIT À SON SEUL JOUR. Lire les trois jours cochés
    // pendant que la consigne n'en autorise qu'un ferait taire cette ligne sur
    // des journées que le plan ne pourra pas nourrir — le contraire exact de ce
    // pour quoi elle existe. `[]` quand aucun jour n'est connu: le module rend
    // alors `[]` lui aussi, et c'est la seule affirmation vraie (voir son
    // en-tête).
    cookDays: args.oneCookingSession
      ? (singleSessionDay === null ? [] : [singleSessionDay])
      : effectiveCookDays,
    hasFreezer: args.hasFreezer,
    maxFridgeDays: MAX_FRIDGE_DAYS,
    freezerWindowDays: FREEZER_WINDOW_DAYS,
  });

  // Le plafond de débordement, calculé UNE fois. `null` = pas de tension, et le
  // plafond déclaré reste le plafond, mot pour mot.
  const usableCookDayCount = usableCookDays({
    declared: args.cookDays ?? [],
    window: args.daysToFill ?? [],
  }).length;
  const sessionCeiling = sessionCeilingMinutes({
    cookingTimeMin: args.cookingTimeMin ?? null,
    outOfReachDays: outOfReach.length,
    cookDayCount: usableCookDayCount,
    // ⛔ SANS CETTE LIGNE, L'OPTION LIVRAIT DES JOURNÉES VIDES EN SILENCE. Avec
    // un congélateur, `outOfReach` est VIDE (la fenêtre congelée couvre le plan
    // entier), donc l'ancienne condition rendait `null` — et les trente minutes
    // déclarées restaient un plafond sec sur la seule session de la semaine.
    // Voir le pavé de `sessionCeilingMinutes`.
    singleSessionAsked: args.oneCookingSession,
  });

  const canCookLines = [
    ...cookDayLines,
    // ⚠️ SOUS LES JOURS DE CUISINE, PAS AILLEURS. Cette phrase est la
    // CONSÉQUENCE de la ligne du dessus; les séparer ferait deux faits sans
    // lien pour qui lit dans l'ordre.
    ...(outOfReach.length > 0
      ? [
        `nothing cooked in those sessions reaches ${outOfReach.join(", ")}: a ` +
        "batch does not keep that long. Those days cook for themselves on the " +
        "day, or they eat something that needs no batch at all. Do NOT write a " +
        "dish there that draws on a preparation -- it will be thrown away.",
      ]
      : []),
    // LES MOYENS DE CUISSON, JUSTE SOUS LES JOURS ET AU-DESSUS DU TEMPS.
    //
    // La place n'est pas cosmétique: « il ne peut cuisiner que mardi » et « il
    // n'a pas de four » sont la même question — ce qu'une session peut faire —
    // et le modèle décide de sa session en lisant ces lignes-là. Plus bas,
    // elles seraient sous le budget, c'est-à-dire après un arbitrage qui les
    // suppose déjà connues.
    //
    // Vide quand la question n'a jamais été posée (`null`): un compte d'avant
    // ce lot voit le prompt d'avant ce lot, au caractère près.
    ...kitchenEquipmentPromptLines(args.kitchenEquipment ?? null),
    // ══════════════════════════════════════════════════════════════════════
    // CE QU'UNE COURSE DU PREMIER JOUR PEUT ENCORE NOURRIR — 2026-09-01
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL: « ça me disait de cuisiner le
    // poulet acheté le lundi, le samedi ». La fenêtre crue existait
    // (`RAW_WINDOW_DAYS`) et `grocery_waves.ts` datait déjà l'achat de chaque
    // article — mais APRÈS, à la lecture, et le modèle ne l'avait jamais su. Il
    // posait ses sessions à l'aveugle.
    //
    // ⚠️ LES JOURS SONT NOMMÉS, pas la durée. Quatrième application de la leçon
    // d'`addedCookDays`: « une règle générale ne se compare pas, un jour NOMMÉ
    // si ». Le modèle ne reçoit pas « la volaille tient deux jours », il reçoit
    // « après jeudi, une volaille ne peut plus venir de la première course ».
    //
    // ⚠️ ET LA PHRASE PORTE LA SORTIE, PAS L'INTERDICTION: cuisiner du poulet le
    // samedi est légitime, ça demande une course le jeudi. Ce qu'on refuse est
    // le SILENCE. Vide sur une fenêtre courte, où aucune famille ne mord.
    // ⚠️ `windowDays`, PAS `daysToEat`, ET C'EST UN DÉCALAGE D'UN JOUR. La
    // « première course » tombe au rang 0 de la FENÊTRE — c'est-à-dire sur la
    // veille quand il y en a une, puisque c'est ce jour-là qu'on achète pour
    // cuisiner. Compter depuis le premier jour QUI PORTE DES REPAS donnerait
    // une journée de fraîcheur de trop, dans le sens permissif.
    // ⟳ 2026-09-09 — ET LA SORTIE EST CELLE DE LA CADENCE: « une course »
    // avec congélateur fait congeler à l'achat, pas racheter la veille. Voir
    // `RawReachCadence`.
    ...rawReachLines(windowDays, args.groceryCadence),
    ...(args.cookingTimeMin
      ? [
        // ⟳ 2026-09-25 — UN MAXIMUM QUAND LA PERSONNE A CHOISI UNE PLAGE. Le
        // nombre est la borne haute de « 1 h à 2 h » (`cooking_time_min`), et
        // la consigne système dit déjà « the session fits inside it. It is not
        // a target ». « about 120 minutes » se lisait comme une cible, à côté
        // d'une règle qui en fait un plafond. Sans plan dérivé (`groceryCadence`
        // nul), la phrase d'avant, au caractère près.
        // ⟳ 2026-09-25 (soir) — PLUS DE PLAGE: la personne choisit une durée
        // « environ » (30 min … 2 h 30). Le nombre reste un plafond pour le
        // modèle; le dépassement toléré est l'affaire de `plan_feasibility.ts`.
        args.groceryCadence !== null
          ? `time per cooking session: at most ${args.cookingTimeMin} minutes -- ` +
            "the time they chose. A session that does not fit is a " +
            "session they skip."
          : `time per cooking session: about ${args.cookingTimeMin} minutes. A ` +
            "session that does not fit is a session they skip.",
      ]
      : []),
    // ══════════════════════════════════════════════════════════════════════
    // QUAND LE TEMPS NE TIENT PAS, LA SESSION DÉBORDE — ET ELLE LE DIT.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ L'INTUITION ÉTAIT INVERSÉE, ET LE MOTEUR AUSSI. « Un seul jour de
    // cuisine et trente minutes ⇒ la session sera plus longue » semble évident;
    // la consigne faisait le contraire — les minutes sont un PLAFOND, « cook
    // LESS and put the rest on another cooking day ». Avec un seul jour, « le
    // rest » n'a nulle part où aller: le modèle cuisine moins, et la semaine
    // sous-nourrit. C'est la mesure déjà connue des plans qui n'atteignent pas
    // 72 % de leur propre enveloppe.
    //
    // ⚠️ LA PERMISSION EST BORNÉE ET CONDITIONNELLE, et les deux comptent.
    // Bornée: sans plafond, « tu peux déborder » rend le nombre déclaré
    // décoratif et on revient à la session de 55 minutes annoncée à 30.
    // Conditionnelle: `sessionCeilingMinutes` rend `null` dès qu'une autre
    // journée de cuisine existe — là, la sortie ordinaire est toujours la
    // bonne, et une permission générale serait une invitation à dépasser.
    ...(sessionCeiling !== null
      ? [
        // ⚠️ DEUX MOTIFS, DEUX PHRASES — et le mot compte. Sans l'option, la
        // tension est un CONSTAT (« la semaine ne peut pas être nourrie de ce
        // seul jour »); avec elle, c'est la DEMANDE de la personne, et lui
        // servir le constat lui dirait que son propre choix est un problème.
        (args.oneCookingSession
          ? "everything for this stretch is cooked in that single session, so "
          : "they cook on ONE day and this week cannot be fed from it, so ") +
        `that session is allowed to run long -- up to ${sessionCeiling} ` +
        'minutes. Put the real figure in "total_minutes". Cooking less is the ' +
        "wrong trade here: it leaves days with nothing on them.",
      ]
      : []),
    ...(args.recipeDifficulty
      ? [
        `recipe level they want: ${args.recipeDifficulty}` +
        (RECIPE_LEVEL_HINT[args.recipeDifficulty] ?? ""),
      ]
      : []),
    ...(args.variety
      ? [
        `repetition they accept: ${args.variety}` +
        (VARIETY_HINT[args.variety] ?? ""),
      ]
      : []),
    // LE BUDGET EST UN PLAFOND CHIFFRÉ, PAS UNE AMBIANCE.
    //
    // La monnaie n'est pas nommée: `country` est deux lignes plus haut dans ce
    // même prompt, et une table pays → devise tenue de notre côté serait une
    // liste fermée qui refuserait un pays légitime le jour où quelqu'un s'y
    // inscrit (voir `frontend/src/keel/api/countries.ts`).
    //
    // La consigne dit QUOI SACRIFIER, dans l'ordre. « Reste dans le budget »
    // seul laisse le modèle rogner sur les portions — c'est-à-dire sur la
    // seule chose que le reste de ce prompt calcule.
    // ⛔ SOUS LE PLANCHER, CE BLOC ENTIER DISPARAÎT — les deux lignes, pas
    // seulement le chiffre. Garder l'ordre de sacrifice sans le montant
    // demanderait au modèle de renoncer à la viande sans lui dire pourquoi,
    // c'est-à-dire d'appauvrir un plan au nom d'une contrainte qu'on vient de
    // juger inapplicable.
    ...(budgetReachesPrompt(args.budgetAmount, args.budgetFloor)
      ? [
        `budget for this plan: ${args.budgetAmount}, in the local currency of ` +
        "their country. It covers the WHOLE shopping list for this stretch, " +
        "for every serving asked for above — it is a ceiling, not a target.",
        "when that budget is tight for the number of servings and days, cut " +
        "in THIS order: expensive proteins first (swap to eggs, legumes, " +
        "tinned fish, cheaper cuts), then out-of-season and imported produce, " +
        "then variety (repeat a batch). NEVER cut the portions themselves: " +
        "the servings are computed from bodies and directions, and a plan " +
        "that shrinks them silently is a plan that starves someone to fit a " +
        "number.",
      ]
      : []),
  ];

  const userMessage = [
    // ── LES CONTRAINTES DURES AVANT TOUT LE RESTE ───────────────────────────
    // Avant la doctrine, avant l'élève, avant la demande. Elles gagnent sur
    // tout, y compris sur la méthode du coach: un coach dont la doctrine
    // recommande les fruits à coque n'a pas écrit ça pour un anaphylactique.
    // ⛔ v15 — LE SILENCE DES CONTRAINTES A ÉTÉ TENTÉ ICI, PUIS RENDU.
    //
    // ── LE TROU EST RÉEL, ET IL EST MESURÉ ────────────────────────────────
    // `generate-meal-v1:887-891` avale l'échec de lecture dans un
    // `catch (error) { console.warn(...) }` et laisse `constraints = null`.
    // `safetyConstraintsPromptBlock(null)` rend `null` — donc le prompt d'un
    // anaphylactique dont la table est injoignable est BYTE-IDENTIQUE à celui
    // d'un élève qui n'a rien déclaré. Et la seconde moitié du double verrou
    // tombe par le MÊME `null`: `applyKeelOutputLocks` voit
    // `constraints.length === 0` et rend `disarmed_no_constraints`. Un seul
    // `catch` muet désarme les deux moitiés à la fois. Le TYPE porte pourtant
    // la distinction (`readonly StudentSafetyConstraint[] | null`).
    //
    // ── POURQUOI LE PROMPT NE LA DIT PAS, ET POURQUOI JE NE L'AI PAS FORCÉ ─
    // `meal_body_test.ts::"sans contrainte, aucun bloc de contraintes — et pas
    // un en-tête vide"` exige `assertEquals(none.userMessage,
    // unreadable.userMessage)`, avec sa raison écrite: « la distinction est
    // une information d'exploitation, pas quelque chose à raconter au
    // modèle ». La version v15 qui écrivait deux en-têtes distincts rendait ce
    // test rouge — c'est-à-dire qu'elle renversait un arbitrage ÉCRIT, en
    // passant, dans un lot qui portait sur autre chose.
    //
    // Elle inventait en outre une politique que personne n'a tranchée: sur le
    // chemin `null`, « écarte les fruits à coque, l'arachide, le sésame, les
    // crustacés et l'œuf cru » est une liste que j'aurais choisie seul, et qui
    // aurait changé le plan de tous les élèves dont une lecture échoue.
    //
    // ⚠️ CE N'EST DONC PAS « RÉPARÉ », C'EST REMONTÉ. La question — faut-il
    // REFUSER de composer quand la lecture des contraintes est en panne ? —
    // appartient à un humain, et elle est posée dans le RAPPORT de l'étape ②.
    ...(safetyBlock ? [safetyBlock, "", SEVERITY_READING_BLOCK, ""] : []),
    // ── LE RÉGIME, JUSTE SOUS LES CONTRAINTES DURES ET AVANT LA DOCTRINE ────
    // Même argument que la ligne au-dessus, et il vaut ici mot pour mot: un
    // coach dont la méthode construit sur le poulet ne l'a pas écrite pour un
    // végane. Le régime doit donc gagner sur la doctrine, comme l'allergie —
    // et il doit survivre à une troncature du budget de prompt.
    //
    // ⚠️ IL EST SÉPARÉ DU BLOC DE CONTRAINTES DURES, ET ÇA N'EST PAS UN DÉTAIL
    // DE MISE EN PAGE. `safetyConstraintTokens` exclut délibérément `dietRef`:
    // verser « vegan » dans la liste d'évitement armerait la ceinture de
    // sortie sur le mot lui-même, et ferait rejeter toute réponse qui décrit
    // un plat comme végane — donc précisément les bonnes, et seulement pour
    // les véganes. Ce dépôt a payé ce défaut en run réel avec
    // `allergen_ref='diabetes'`. La ceinture reçoit l'EXPANSION
    // (`excludedSurfaceFormsFor`), jamais le nom du régime.
    ...(args.dietBlock.trim() ? [args.dietBlock.trim(), ""] : []),
    args.doctrineBlock.trim(),
    // Le mapping suit IMMÉDIATEMENT la doctrine, et avant tout ce qui est
    // propre à l'élève: c'est la partie commune à toute la cohorte du coach,
    // donc la partie cacheable, et le budget de prompt tronque par la queue.
    ...(args.protocolBlock.trim() ? ["", args.protocolBlock.trim()] : []),
    "",
    "== THE CONVICTION KEYS YOU MAY NAME ==",
    JSON.stringify(args.beliefKeys),
    "",
    // LA NOTE DU COACH, entre la méthode et l'élève — même placement que dans
    // `buildWeekPlanPrompt`: après tout ce qui est collectif et cacheable,
    // avant tout ce que l'élève a dit de lui-même. Absente, aucune ligne.
    ...(args.coachNoteBlock ? [args.coachNoteBlock, ""] : []),
    // ── CE QUI EST DURABLE, ET CE QUI EST DATÉ, NE SE LISENT PLUS AU MÊME
    //    RANG ─────────────────────────────────────────────────────────────
    // Tout ce qui suit tenait dans une seule liste plate sous cet en-tête: la
    // cantine du midi, le mariage de mardi, la balance de dimanche et le
    // budget serré, à égalité. Une contrainte d'une semaine s'y lisait comme
    // une propriété permanente.
    //
    // Le dépôt avait déjà tranché ce problème une fois, en séparant
    // `situation` (stable) de `context` (daté). Les sous-sections généralisent
    // cet arbitrage: ce qu'ils SONT, ce qu'ils VISENT, où ils EN SONT, comment
    // leur journée TOURNE — puis, en dernier, ce qui n'est vrai que cette fois.
    //
    // UNE SOUS-SECTION SANS CONTENU N'EXISTE PAS. Un en-tête vide est du bruit
    // qui coûte du cache, et « height: not stated » est pire que le silence:
    // ça occupe le rang d'une contrainte et ça invite le modèle à commenter
    // une absence.
    "== THIS STUDENT ==",
    // ⛔ v15 — NOMMER L'IGNORANCE DU CORPS A ÉTÉ TENTÉ ICI, PUIS RENDU.
    //
    // Le constat tenait: pour un compte neuf, la section entière disparaît, et
    // rien ne dit au modèle qu'il ne sait rien — pendant que le prompt système
    // lui DEMANDAIT de dimensionner (« a full lunch or dinner for one adult is
    // a plate of roughly 600 to 750 g ») sans jamais dire de qui.
    //
    // ⟳ LOT C (2026-09-11) — LA MOITIÉ QUI RENDAIT CE TROU COÛTEUX EST PARTIE.
    // Le prompt système ne demande plus de masse d'assiette du tout: il demande
    // une FORME, et c'est `applySizing` qui décide des grammes. Ne rien savoir
    // du corps ne fait donc plus écrire de nombre au hasard — ça fait écrire une
    // recette, ce qui est exactement ce qu'on veut d'un compte neuf.
    //
    // ⚠️ ET LA LIGNE QUI LE DIRAIT EST INTERDITE PAR UNE RAISON DE SÉCURITÉ,
    // pas par du goût. `meal_body_test.ts::"un corps entièrement inconnu SOUS
    // plancher rend la même chose encore"`: le PLANCHER TCA (`restrictionFlag`)
    // blanchit le corps. Si l'absence portait un en-tête, le plancher
    // deviendrait OBSERVABLE dans le prompt — un élève à risque et un compte
    // neuf cesseraient d'être indiscernables, et « un modèle qui remarque une
    // absence la commente ». Le silence n'est pas un oubli ici: c'est la garde.
    //
    // Ce qui reste vrai et non couvert: le REPLI de dimensionnement n'est écrit
    // nulle part. Il pourrait l'être dans le prompt SYSTÈME, qui est le même
    // pour tout le monde et ne révèle donc rien de personne. Hors périmètre de
    // ce lot, nommé dans le RAPPORT.
    ...(bodyBlocks.whoTheyAre.length > 0
      ? ["", "-- WHO THEY ARE --", ...bodyBlocks.whoTheyAre]
      : []),
    "",
    "-- WHAT THEY ARE AFTER --",
    `goal: ${args.goal}`,
    // L'AXE, ET CE QU'IL AUTORISE À FAIRE. Repris de `buildWeekPlanPrompt`, y
    // compris son garde-fou: un axe que le coach n'a jamais traité ne donne
    // PAS le droit d'inventer un conseil dessus. Le produit du coach est sa
    // méthode; un axe est une direction dans laquelle la chercher, pas une
    // permission d'en écrire une.
    ...(args.focusAxis
      ? [
        `the one thing they want to see improve: ${
          WEEKLY_AXIS_LABELS_EN[args.focusAxis] ?? args.focusAxis
        }. Let it rank your choices among the dishes the method allows. If the ` +
        `coach has taught nothing that bears on it, say nothing about it rather ` +
        `than teaching something he never taught.`,
      ]
      : []),
    // L'ASPIRATION AVANT LA SITUATION: ce qu'il veut, puis ce qui l'empêche.
    // L'ordre est celui de `week_plan_generation.ts`, et il n'est pas
    // cosmétique — un modèle qui lit d'abord les contraintes compose une
    // semaine qui les contourne.
    ...(args.aspiration && args.aspiration.trim()
      ? [
        `what they are actually after, in their words: ${args.aspiration.trim()}. ` +
        `Let it rank your choices among the dishes the method allows — never ` +
        `at the cost of a hard constraint, and never as a reason to add a ` +
        `dish they did not ask for.`,
      ]
      : []),
    args.situation
      ? `their situation, in their words: ${args.situation}`
      : "their situation: not stated.",
    ...(bodyBlocks.whereTheyAreNow.length > 0
      ? ["", "-- WHERE THEY ARE NOW --", ...bodyBlocks.whereTheyAreNow]
      : []),
    "",
    // ── LA FORME DE LEUR JOURNÉE ────────────────────────────────────────
    // Sa propre sous-section, et pas une ligne perdue dans « what to cook »:
    // c'est la contrainte qui décide COMBIEN de plats existent et QUAND. Une
    // faim de 17h qu'on ne nomme pas est une faim qu'on comble ailleurs, et le
    // plan le plus juste du monde s'écroule dessus.
    "-- HOW THEIR DAY RUNS --",
    rhythmLines(rhythm),
    args.eatingRhythm && args.eatingRhythm.length > 0
      ? "Those are the moments they actually eat. Do not add a meal they did " +
        "not name, and do not drop one they did: an extra meal is a meal they " +
        "skip, a missing one is the hour they raid the cupboard."
      : "They have not told us their rhythm, so this is the default assumption " +
        "— treat it as ordinary, not as something they chose.",
    // ── CE QU'ILS NE MANGENT PAS ICI ──────────────────────────────────────
    // Nommé moment par moment, et en NÉGATIF explicite: « skip » plutôt qu'une
    // liste de ce qu'il reste. Le modèle qui reçoit une liste positive la
    // complète — c'est le comportement même d'un modèle de composition, et
    // c'est pour ça que le parseur revérifie derrière (voir `isAway`).
    ...(awayLines.length > 0
      ? [
        "",
        "-- WHEN THEY ARE NOT HERE --",
        "they are NOT eating here at these moments — compose nothing, buy " +
        "nothing, and count no portion for them:",
        ...awayLines,
      ]
      : []),
    // ── CE QU'ILS MANGENT DÉJÀ ────────────────────────────────────────────
    // Le PENDANT POSITIF de la section au-dessus, et posé juste après elle
    // pour qu'elles se lisent ensemble: « pas ici » et « déjà ça » sont les
    // deux façons dont une case de la grille peut être prise avant que le
    // modèle n'y touche.
    ...fixedIntakePromptLines(args.fixedIntakes),
    // ── CE QUE CERTAINS JOURS SONT ────────────────────────────────────────
    // Troisième façon dont une case de la grille peut être décidée avant que
    // le modèle n'y touche — et la seule des trois qui soit POSITIVE.
    ...dayPropertyPromptLines(args.dayProperties),
    // LES CONTRAINTES DE CUISINE. Elles décrivent une CAPACITÉ durable (les
    // jours où il peut cuisiner, le temps qu'il a, ce qu'il sait faire, ce
    // qu'il peut dépenser), donc elles vivent avec l'élève et non avec la
    // demande. Un plan parfait et inapplicable est la première cause
    // d'abandon.
    // ── v15 · IDEM POUR LA CAPACITÉ ─────────────────────────────────────
    // Six entrées disparaissaient ensemble et en silence: les jours de
    // cuisine, l'équipement, les minutes, le niveau, la répétition et le
    // BUDGET. Un modèle qui ne lit rien ici compose avec un four, un
    // dimanche entier et une somme illimitée — et rien ne lui dit qu'il
    // suppose. Mesuré sur le scénario « minimum vital »
    // (`2a000000-2100-4000-8000-000000000001`, 5 368 car.): 7 préparations,
    // 2 sessions, un four, aucun budget, aucune trace d'une hésitation.
    ...(canCookLines.length > 0
      ? ["", "-- WHAT THEY CAN COOK --", ...canCookLines]
      : [
        "",
        "-- WHAT THEY CAN COOK --",
        "they have told us NOTHING about their kitchen, their cooking days, " +
        "the time they have or the money they can spend. Assume an ordinary " +
        "kitchen and an ordinary week — and because it is an assumption, keep " +
        "the sessions short and the shopping list plain rather than betting " +
        "on equipment or an evening they may not have.",
      ]),
    // ══════════════════════════════════════════════════════════════════════
    // LA MOITIÉ « CONSIGNE » DES CONTENANTS SOLO — 2026-09-01, second passage
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ MESURÉ, ET C'EST LE PATRON DÉJÀ ÉCRIT DANS CE DÉPÔT. Le premier
    // passage n'a servi que le SCHÉMA (`SOLO_BOX_BLOCK`, prompt système). Run
    // réel `2235786d-…`, plan solo de sept jours: « 17 meals take from a batch
    // and NOT ONE carries a box -- 17 containers were owed, zero came back ».
    //
    // C'est exactement ce que `boxSchemaBlock` annonce en tête de sa propre
    // définition: « `member_portions` a ces DEUX moitiés et il est rempli 100 %
    // du temps; `for_member_id` n'avait que celle-ci et il est resté à zéro sur
    // douze générations. On copie le patron qui marche. » Le schéma dit qu'une
    // clé EXISTE; il ne dit pas de l'écrire.
    //
    // ⚠️ SUR LE MESSAGE, PAS SUR LE SYSTÈME, et la place n'est pas
    // interchangeable: le système est cacheable et partagé, le message porte ce
    // qu'on DEMANDE cette fois-ci. C'est la même répartition que côté foyer.
    //
    // ⛔ AUCUN NOM SUR LE COUVERCLE, redit ici: le jour et le moment sont ce qui
    // fait reconnaître un bac quand on mange seul.
    ...(args.soloBoxes
      ? [
        "",
        "-- WEIGH IT ONCE, INTO CONTAINERS NAMED BY MEAL --",
        "Nothing is weighed at mealtime. Everything is weighed at the cooking " +
        "session, straight into containers, and a meal later just takes its box " +
        "out of the fridge.",
        'Every dish that takes from a preparation carries "boxes": ONE container ' +
        "holding everything that meal takes out -- all its preparations together " +
        "in the same box, not one tub per pan. Count them before you answer: as " +
        "many boxes as you have dishes that draw on a preparation.",
        "They eat alone, so no lid carries a name -- the day and the meal are " +
        "what tells them which one to open. Its grams are that meal's portion: " +
        "they open it and eat, and nothing is weighed at the table.",
        "The cooking session run_through is the ORDER of the gestures, and " +
        "nothing else: no weights, no gram figures, no portion counts. Those " +
        "live in the boxes, each already carrying what is in it and how much.",
        'A dish that cooks from scratch on the day has no "boxes": nothing was ' +
        "weighed ahead for it.",
      ]
      : []),
    // CE QU'IL A DIT LUI-MÊME, et il l'a confirmé sur un écran. Ce ne sont ni
    // des interdits du coach (ceux-là sont dans la doctrine, avec leur double
    // verrou) ni des contraintes médicales (celles-là sont maintenant en tête
    // du message): ce sont des goûts et des contextes de vie, et ils décident
    // si une semaine est vivable.
    // ── DEUX PROVENANCES, ET LE RANG EST LA MOITIÉ DU MESSAGE ─────────────
    // Ce que quelqu'un PREND LA PEINE D'ÉCRIRE sur son alimentation ne pèse
    // pas comme une remarque glanée en conversation qu'on lui a fait
    // confirmer d'un bouton. Servies en un seul sac, les deux sont
    // indépartageables — le modèle n'a aucun moyen, même en principe, de
    // savoir laquelle il a le droit d'arbitrer.
    //
    // Et le dire ne suffit pas: la consigne du prompt REGRESSE en réel (le
    // verrou des règles de maison existe pour ça). D'où la demande explicite
    // de NOMMER ce qu'il n'a pas pu honorer — que `written_instruction_check.ts`
    // vérifie ensuite sur la sortie, déterministiquement. C'est le double
    // verrou de la doctrine, pointé sur une autre liste.
    ...((args.writtenInstructions ?? []).length > 0 ||
        (args.foodPreferences?.length ?? 0) > 0 ||
        (args.memo?.length ?? 0) > 0
      ? [
        "",
        "-- WHAT THEY HAVE TOLD ME --",
        ...((args.writtenInstructions ?? []).length > 0
          ? [
            "what they WROTE THEMSELVES about their eating. treat these as " +
            "instructions, not as suggestions:",
            ...(args.writtenInstructions ?? []).map((p) => `- ${p}`),
            // ⚠️ v15 — L'EXCEPTION EST NOMMÉE ICI, PAS SEULEMENT PLUS HAUT.
            // « name the thing you could not do » est l'ordre qui a produit
            // la phrase qui a détruit le plan du run `2a000000-3100-…`. La
            // règle générale reste (dire ce qu'on n'a pas pu faire est le
            // contrat), mais elle porte maintenant sa seule exception, à
            // l'endroit où elle est lue. Sans ça, deux consignes du même
            // message se contredisent et c'est la plus proche qui gagne.
            // ⛔ S2 (2026-08-22) — L'EXCEPTION EST DOUBLE DEPUIS QUE LA
            // CEINTURE COUVRE `strict`. « the ONE exception » nommait un seul
            // cran et laissait le modèle nommer librement un aliment
            // `severity=strict`, c'est-à-dire écrire la phrase exacte qui
            // vide désormais la semaine. Même correction, même raison, que
            // `SEVERITY_READING_BLOCK` plus haut dans ce fichier.
            "if you cannot honour one of those, say so in the \"why\" of the " +
            "dish it affects, name the thing you could not do, and say what " +
            "you did instead. do not drop it in silence. the exceptions are " +
            "a severity=medical food: for those, write \"one of the foods on " +
            "your medical list\" and never the food itself. and a " +
            "severity=strict food: for those, write \"one of the foods you " +
            "keep off your plate\" and never the food itself.",
          ]
          : []),
        ...((args.foodPreferences?.length ?? 0) > 0
          ? [
            ...((args.writtenInstructions ?? []).length > 0
              ? ["", "what came up in conversation and they confirmed. treat " +
                "these as preferences:"]
              : ["what they have told you about their eating, in their own words:"]),
            ...(args.foodPreferences ?? []).map((p) => `- ${p}`),
          ]
          : []),
        // ── LOT M4 · LE MÉMO, EN DERNIER DE LA SECTION ────────────────────
        //
        // ⚠️ APRÈS LES DEUX AUTRES SEAUX, ET C'EST DÉLIBÉRÉ. Une ligne de mémo
        // n'a NI famille NI valeur structurée: c'est ce que la personne a
        // demandé et qu'aucune case du produit ne porte. La placer devant une
        // consigne écrite ferait passer un résidu avant une instruction.
        //
        // ⛔ « FACTS ABOUT THEIR WEEK », PAS « PREFERENCES ». Le mémo n'entre
        // que pour du FACTUEL et de l'ACTIONNABLE (ses deux premières
        // conditions d'entrée); l'annoncer au modèle comme un goût lui
        // donnerait le droit de l'arbitrer contre autre chose, alors qu'une
        // ligne comme « danse le mardi, donc gros repas ce jour-là » se
        // respecte ou se dit.
        ...((args.memo?.length ?? 0) > 0
          ? [
            "",
            "facts about their week that no other field carries. these are " +
            "not preferences to weigh: honour them, or say in the \"why\" of " +
            "the dish it affects that you could not, and what you did instead:",
            ...(args.memo ?? []).map((p) => `- ${p}`),
            // ⛔ LOT A (2026-09-03) — NOMMER LE JOUR NE SUFFIT PAS, IL FAUT
            // CONTREDIRE L'A PRIORI. Cicatrice `named-day-calendar-vs-model-prior`:
            // le modèle lisse les jours quand on lui donne la donnée sans lui
            // dire que ce jour-là est l'exception. La phrase vit ICI, collée aux
            // lignes qu'elle gouverne, pas dans une section « règles » plus bas.
            "when a line names a day or a meal, that day or that meal is the " +
            "exception: compose it differently from the other days instead of " +
            "keeping every day the same.",
          ]
          : []),
      ]
      : []),
    // ── CE QUI N'EST VRAI QUE CETTE FOIS ──────────────────────────────────
    // En DERNIER de la section, et c'est le point de la séparation: le
    // contexte est daté (« mariage mardi »), l'envie a été tapée il y a dix
    // secondes, le garde-manger est l'état d'un placard ce soir. Les fondre
    // avec ce qui précède ferait traiter un mariage comme une habitude de vie
    // — et « mezze d'été cette semaine » reviendrait en février.
    "",
    "-- THIS TIME --",
    args.context
      ? `what is going on for them RIGHT NOW: ${args.context}`
      : "nothing special going on this week.",
    // ── ② L'ENVIE PORTE ENFIN SON RANG ─────────────────────────────────
    // C'était la SEULE ligne de désir du message sans un mot de rang.
    // L'aspiration porte « never at the cost of a hard constraint », la
    // saison porte « It ranks your choices; it does not veto anything »,
    // l'axe porte « Let it rank your choices among the dishes the method
    // allows ». L'envie, elle, arrivait nue — et à trois lignes de la fin,
    // c'est-à-dire à la place que ce dépôt a mesurée comme la plus
    // contraignante du message.
    //
    // MESURÉ, run `2a000000-3100-4000-8000-000000000001`: une envie qui
    // nomme l'allergène MÉDICAL de l'élève (« a proper tahini and sesame
    // noodle bowl ») ressort 21 fois dans la sortie, et la phrase qui a
    // sauvé l'assiette est venue du modèle, pas du prompt.
    //
    // La formulation est celle de l'aspiration, mot pour mot là où elle
    // dit la même chose: deux phrases différentes pour le même arbitrage
    // dérivent, et c'est la moins relue qui garde l'ancienne.
    ...(args.preferences
      ? [
        `what they feel like eating THIS TIME: ${args.preferences}. Let it ` +
        `rank your choices among the dishes everything above already allows ` +
        `— never at the cost of a hard constraint, of their diet, or of this ` +
        `coach's method. If you cannot serve what they asked for, compose the ` +
        `nearest dish that IS allowed and say so in that dish's "why".`,
      ]
      : []),
    `people at the table: ${args.servings}`,
    // LE GARDE-MANGER EST UNE SOUS-SECTION, PAS UNE SECTION. Il portait un
    // en-tête `==` posé au milieu de sous-titres `--`: pour un modèle qui lit
    // une hiérarchie, ça ferme `== THIS STUDENT ==` au mauvais endroit et
    // rattache la suite à autre chose. Le niveau suit maintenant le rang.
    // ⚠️ L'EN-TÊTE A CHANGÉ LE 2026-08-18, ET C'ÉTAIT UNE COLLISION MESURÉE.
    // Il s'appelait `-- WHAT THEY ALREADY HAVE --`, mot pour mot le même que
    // celui des APPORTS FIXES (`fixed_intakes.ts`), quarante lignes plus haut
    // dans le MÊME message. Vu sur le run réel `798c5cd6-…`: un élève avec un
    // shaker qui compose en `from_pantry` reçoit deux sections homonymes qui
    // demandent l'inverse l'une de l'autre — « compte-les comme déjà mangés et
    // ne les mets PAS sur la liste de courses » d'un côté, « voilà ce qu'il a
    // dans le placard, cuisine avec » de l'autre.
    //
    // Le mot qui distingue est le LIEU (un placard), pas la possession.
    args.mode === "from_pantry"
      ? [
        "",
        "-- WHAT IS ALREADY IN THEIR CUPBOARDS --",
        pantryLines || "- (they listed nothing)",
      ].join("\n")
      : "\n-- THEY HAVE NOT SHOPPED YET: give the full list --",
    "",
    // ── LA SAISON, ET CE QUI POUSSE LÀ OÙ ILS SONT ──────────────────────
    //
    // ON DONNE LES FAITS, PAS NOTRE DÉDUCTION. La tentation était d'écrire
    // « c'est l'été » — ce qui aurait demandé une table d'hémisphères, se serait
    // trompé sous l'équateur, et aurait imposé notre lecture à un modèle qui
    // connaît déjà les calendriers agricoles. On transmet la DATE et le PAYS;
    // ce qui pousse en Bretagne le 5 août, il le sait mieux que nous.
    //
    // ET C'EST UNE PRÉFÉRENCE, PAS UNE CONTRAINTE — c'est dit deux fois, parce
    // que ce prompt porte de vraies interdictions (allergènes, doctrine) et
    // qu'une consigne de saison lue avec le même poids ferait REFUSER des plats.
    // Personne ne doit s'entendre dire « pas de tomates, ce n'est pas la
    // saison »: la saison choisit vers quoi on tend, jamais ce qu'on écarte.
    "== WHAT IS IN SEASON WHERE THEY ARE ==",
    args.today ? `today's date: ${args.today}` : "today's date: not known.",
    args.country
      ? (args.countryAssumed === true
        ? `they shop in: ${args.country} (ISO-3166 country code — assumed from ` +
          "the language they write in, not confirmed by them)"
        : `they shop in: ${args.country} (ISO-3166 country code)`)
      : "where they shop: not known — reason about season only if their " +
        "situation says where they are.",
    // ⟳ 2026-09-20 — LE PAYS N'EST PAS QUE LA SAISON. Le même code dit dans
    // quelle unité leur four parle, comment leurs boucheries nomment un morceau
    // et dans quels formats leurs magasins vendent. Sans cette phrase, « FR »
    // ne servait qu'aux fruits et légumes.
    ...(args.country
      ? [
        "That country also sets the cooking conventions: the unit their oven " +
        "reads (°C or °F), the names cuts and products go by in their shops, " +
        "and the sizes those shops sell in. Write the recipes the way a cook " +
        "there would read them.",
      ]
      : []),
    "PREFER fruit and vegetables in season there at that date, and produce " +
    "that grows in that country over what has to be flown in. Let the season " +
    "set the WEIGHT of a dish too: a long-braised winter stew in midsummer is " +
    "food nobody wants to cook or eat when it is hot.",
    "This is a PREFERENCE and never a rule. Never drop a dish the method calls " +
    "for to honour it, never refuse an ingredient the student asked for " +
    "because it is out of season, and never tell them a food is unavailable — " +
    "you are not looking at their shops. It ranks your choices; it does not " +
    "veto anything.",
    "",
    // ── LA DEMANDE, EN DERNIER ────────────────────────────────────────────
    // Ce bloc ne décrit plus l'élève: il décrit ce qu'on demande MAINTENANT.
    // Tout ce qui appartenait à la personne (son rythme, sa capacité de
    // cuisine, ses parts, ses placards) est remonté sous `== THIS STUDENT ==`.
    //
    // Et il reste EN DERNIER exprès: ce dépôt a mesuré qu'un modèle lit la
    // consigne la plus proche de la fin comme la plus contraignante (la raison
    // est écrite dans `household_meal_generation.ts`, et le bloc satiété a été
    // déplacé pour ça après un run rouge). La chose la plus contraignante
    // ici, c'est la commande.
    "== WHAT TO COOK ==",
    `mode: ${args.mode}`,
    `how much: ${args.scope} (at most ${cap} dish${cap > 1 ? "es" : ""})`,
    // LES DEUX CONSIGNES QUI NE TIENNENT PAS DANS LE PROMPT SYSTÈME.
    //
    // Elles y étaient, et elles se perdaient: mesuré deux fois de suite, une
    // semaine demandée rendait 17 à 20 plats cuisinés SÉPARÉMENT (zéro lot) et
    // laissait des déjeuners vides. Un prompt système long dilue une règle; une
    // consigne posée juste à côté de la DEMANDE est lue.
    //
    // Elles sont chiffrées exprès. « Peu de sessions » se négocie, « au plus
    // cinq » ne se négocie pas — et le dépôt a déjà payé le fait qu'une règle
    // qualitative dans un prompt est une règle que le modèle applique quand ça
    // l'arrange.
    ...(args.scope === "several_days"
      ? [
        // LE RYTHME DE CET ÉLÈVE, PAS CELUI DE TOUT LE MONDE.
        //
        // Cette ligne disait « every day needs breakfast, lunch and dinner ».
        // Codée en dur, pour tous. Quelqu'un qui mange deux fois recevait un
        // repas de trop; quelqu'un qui s'effondre à 17h n'avait aucun endroit
        // où le dire, et sa journée s'arrêtait au déjeuner puis reprenait au
        // dîner. La règle est la même — pas de trou — mais sur SA journée.
        // ── ⛔ LA GRILLE EST ÉNUMÉRÉE, ET SON NOMBRE EST UN PLANCHER ───────
        //
        // Cette consigne était UNE PHRASE — « every day of the stretch needs
        // breakfast, lunch and dinner » — et le seul NOMBRE que le modèle
        // lisait était `at most ${cap}`, c'est-à-dire un PLAFOND. Rien ne lui
        // disait combien de plats il DEVAIT rendre.
        //
        // Mesuré le 2026-09-18 sur le foyer `5e0c3825` (6 jours du dimanche au
        // vendredi, 3 bouches, aucun rythme déclaré donc 18 cases): **12 plats
        // rendus sur 18**, le dimanche entier sauté, puis 422
        // `plan_not_deliverable` après 197 s et deux réparations. Le modèle
        // n'avait enfreint AUCUN chiffre: 12 plats sur 18 autorisés, 3 sessions
        // de cuisine sur 6. Il avait obéi aux trois règles chiffrées — plafond
        // de plats, plafond de sessions, une recette cuisinée une seule fois —
        // et laissé tomber la seule qui était en prose.
        //
        // ⛔ ON LUI DONNE DONC LA LISTE, PLUS LA RÈGLE. Les cases sont
        // énumérées `jour/moment` dans l'ordre de la fenêtre, leur nombre est
        // dit PLANCHER en toutes lettres, et la relecture est demandée avant la
        // réponse. Une liste se coche; une règle se négocie.
        //
        // ⚠️ LE PLANCHER NE PEUT PAS DÉPASSER LE PLAFOND, par construction:
        // `cellsToFill` retire les absents et les apports fixes de la grille
        // dont `baseCap` est le produit entier, et `cap` vaut `baseCap` plus le
        // supplément de fusion. Les deux nombres ne peuvent donc que se
        // rejoindre, jamais se croiser.
        `cells to fill: ${cellsToFill.length}. One line per moment, with how ` +
        "many days it covers -- count them:",
        ...cellChecklistLines(
          cellsToFill,
          rhythm.map((o) => String(o.slot)),
          daysToEat,
        ),
        `Return one dish for EACH of those ${cellsToFill.length} cells. ` +
        `${cellsToFill.length} is a FLOOR, not a number to approach: a cell ` +
        "left without a dish is a hole, and this table did not ask for a " +
        "partial stretch. Before you answer, take the lines above ONE BY ONE " +
        "and count your dishes for that moment against the number in " +
        "brackets; compose whatever is short.",
        // ── ⛔ LA CASE EST REMPLIE PAR LE PLAT DE LA TABLE, PAS PAR UN PLAT
        //    À QUELQU'UN — 2026-09-18, foyer `fagenty` ───────────────────────
        //
        // Mesuré: mercredi `before_bed`, la SEULE chose posée était « Tisane
        // aux herbes séchées » portant `for_member_id` = fabrice. La case
        // comptait donc comme remplie (`cell_without_dish` regarde s'il existe
        // UN plat à ce jour/moment), et les deux autres bouches n'avaient rien
        // — `mouth_unfed: unfed:not_named` et `cell_without_portion`. Les six
        // autres soirs portaient bien le plat de la table.
        //
        // ⚠️ LA PHRASE EST ICI, collée au plancher qu'elle corrige, et pas
        // dans `dedicatedDishBlock`: c'est CE nombre-là qu'elle qualifie. Un
        // « un plat par case » que le dédié satisfait est un plancher désarmé.
        //
        // ⚠️ ET ELLE EST ADDITIVE, PAS DISSUASIVE. La phrase vit 20 000
        // caractères AVANT le bloc « A DISH OF THEIR OWN », qui est celui qui
        // ORDONNE les plats dédiés (38 sur ce foyer). S'arrêter à « un plat
        // `for_member_id` ne prend jamais la place de celui de la table » la
        // laisse se lire comme une mise en garde CONTRE la clé, si loin de
        // l'ordre qui la réclame. La dernière ligne renvoie donc à ce bloc au
        // lieu de laisser le modèle arbitrer entre les deux.
        //
        // ⛔ ET CE CONTRÔLE-LÀ NE BLOQUE PAS. `own_meal_dish_missing` est de
        // sévérité `count`: un plan qui perdrait ses 38 plats dédiés serait
        // livré en 200 avec 38 écarts nommés. Un troc entre les deux moitiés
        // de cette consigne ne se verrait donc PAS dans le verdict — il se
        // compte, plat par plat, dans `member_id`.
        "Each of those cells needs the TABLE's dish -- a dish with NO " +
        "`for_member_id`. That dish is what fills the cell. A dish that " +
        "carries `for_member_id` is one person's own: it comes ON TOP of the " +
        "table's dish for that same cell and never takes its place -- a cell " +
        "whose only dish carries `for_member_id` is a cell where everyone " +
        "else eats nothing. Where a block below orders someone a dish of " +
        "their own, write BOTH dishes on that cell: the table's, and theirs.",
        // `baseCap`, PAS `cap` — voir les deux nombres en tête de fonction.
        //
        // ⟳ 2026-09-25 — LE NOMBRE QU'ILS ONT CHOISI, QUAND ILS L'ONT CHOISI.
        // Mesuré sur `a0481b9c`: la personne avait demandé deux sessions, la
        // consigne nommait vendredi et dimanche… et disait « at most 7 » dix
        // lignes plus bas, pendant que la consigne système conseille « two or
        // three sessions in a week ». Trois nombres pour une réponse. Le nombre
        // choisi est dit ici, avec SES jours dans la même phrase (une promesse
        // loin de sa clé ne tient pas), et il remplace le conseil général.
        // Sans plan dérivé (`groceryCadence` nul), la phrase d'avant.
        args.groceryCadence !== null
          ? `cooking sessions: exactly ${args.groceryCadence.sessions} for the whole ` +
            `stretch -- the number they chose` +
            (chosenCookDays.length > 0 ? `, on ${chosenCookDays.join(", ")}` : "") +
            ". This replaces any general advice on how many sessions to aim for. " +
            "Most lunches and dinners must therefore come from BATCHES — one " +
            "cooking session, several servings, several days, declared in `batch`."
          : `cooking sessions: at most ${batchSessionBudget(baseCap)} for the whole ` +
            "stretch. Most lunches and dinners must therefore come from BATCHES — " +
            "one cooking session, several servings, several days, declared in " +
            "`batch`. Seventeen separately-cooked dishes is not a plan anybody cooks.",
        // ── ⛔ UNE RECETTE SE CUISINE UNE FOIS DANS LA FENÊTRE — 2026-09-07 ──
        //
        // Mesuré sur le run `be373339…` (foyer de trois, six jours): TROIS
        // casseroles de muffins aux œufs, une par session (lundi, mercredi,
        // vendredi), 18 œufs chacune, et le même petit-déjeuner six matins de
        // suite. Le modèle avait respecté la lettre de « never three days in a
        // row »: il avait renommé ses casseroles « du lundi », « du mercredi »,
        // « du vendredi » et changé un légume. Rapporté à l'écran: « pourquoi il
        // y a des muffins aux œufs toute la semaine ».
        //
        // Décision produit, mot pour mot: « le but est de varier, il ne peut pas
        // y avoir deux identiques cuisinés la même semaine (dans deux sessions de
        // cuisine différentes bien entendu) ». Un LOT qui couvre plusieurs jours
        // reste le geste voulu — c'est la phrase juste au-dessus —; ce qui est
        // refusé est de REFAIRE la même préparation dans une autre session.
        //
        // ⚠️ ELLE NOMME L'ÉCHAPPATOIRE MESURÉE (renommer par le jour), et elle
        // dit que les petits-déjeuners comptent: « main dish » dans la ligne de
        // variété laissait le modèle en exclure le matin. Sans les deux, une
        // règle qualitative est une règle qu'il applique quand ça l'arrange.
        "A batch may feed several days, but a recipe is cooked ONCE in the " +
        "stretch: no two cooking sessions make the same preparation, and " +
        "renaming it by its day (\"Monday's egg muffins\", \"Wednesday's egg " +
        "muffins\") or swapping one vegetable does not make it a different " +
        "one. Breakfasts count like any other meal. When the same slot needs " +
        "covering again later in the stretch, cook something else.",
        // ⟳ 2026-09-25 — LA MÊME RÈGLE, DITE POUR CE QU'ELLE N'ATTRAPAIT PAS.
        // Mesuré sur `54aec009` (une personne, sept jours, trois sessions): le
        // couscous cuit dans les TROIS sessions, deux fois le vendredi dans
        // deux casseroles; le haut de cuisse de poulet dans quatre des six
        // plats cuisinés (9 déjeuners et dîners sur 14); le même goûter sept
        // jours de suite. Sur les 16 plans des 8 jours d'avant: 6 cuisaient un
        // féculent dans plusieurs sessions, 4 le cuisaient deux fois dans la
        // même, 3 mettaient une protéine dans trois préparations ou plus, 2
        // servaient le même goûter trois jours de suite. Chaque cas est dit avec
        // son nombre: une règle qualitative est appliquée quand ça arrange.
        "The same holds for what goes around the batches. Each starch -- rice, " +
        "pasta, couscous, potatoes, bulgur, quinoa, barley -- is cooked in ONE " +
        "session of the stretch, in ONE pot: two dishes of that session that " +
        "take it share that pot, and another session cooks another starch. A " +
        "protein is the main of at most TWO preparations in the stretch: chicken " +
        "in two sessions means the third one cooks something else. A breakfast " +
        "or a snack is never the same three days in a row.",
      ]
      : []),
    args.slot ? `meal: ${args.slot}` : "meal: whichever fits",
    // LE JOUR OÙ L'ON EST, et il n'y était pas. Le modèle repartait de lundi
    // par habitude: un plan généré le mercredi rendait trois jours déjà passés.
    ...(args.todayToken ? [`today is: ${args.todayToken}`] : []),
    // ── ⛔ LA CONSIGNE DES JOURS, ET ELLE A CHANGÉ DE PIVOT (2026-09-06) ──
    //
    // Elle finissait par « Do not start earlier than today ». Cette phrase
    // n'était juste que tant que la fenêtre commençait forcément dans la
    // semaine en cours: demandée un mercredi pour un départ mardi prochain,
    // elle disait au modèle de ne pas commencer avant `wed` au-dessus d'une
    // liste qui commence par `tue`. Il a refusé EN TOUTES LETTRES — `422
    // empty_meal`, `lock: disarmed_empty_text`, **après 6,2 s facturées**
    // (mesuré en HTTP réel le 2026-08-12). Ce n'était pas de la
    // désobéissance: les deux lignes se contredisaient, et aucune réponse
    // n'était juste.
    //
    // Le lot du 2026-08-12 a répondu en INTERDISANT le geste
    // (`windowStartsBeyondDayTokens`). Le 2026-09-06 a renversé cette décision
    // — un départ libre est une demande produit, « n'importe qui peut
    // sélectionner la date de début librement » —, donc la contradiction doit
    // être réparée plutôt qu'évitée.
    //
    // ⛔ LE PIVOT EST LA FENÊTRE, PLUS AUJOURD'HUI. La liste est ancrée par sa
    // DATE d'ouverture, qui est un fait non ambigu, et non par sa position
    // relative à `today`. « today is: … » et « today's date: … » restent
    // au-dessus: ils servent la saison et le ton, ils ne commandent plus
    // l'ordre.
    //
    // ⚠️ ET « ne décale pas pour commencer aujourd'hui » REMPLACE LA MOITIÉ
    // UTILE de l'ancienne phrase. Elle existait aussi contre un défaut réel —
    // le modèle repartait de lundi par habitude et rendait des jours déjà
    // passés. Une liste ancrée sur une date dit la même chose sans jamais
    // pouvoir se contredire.
    ...(daysToEat.length > 0
      ? [
        ...(args.windowStartsOn
          ? [`the stretch opens on ${args.windowStartsOn} (ISO date)`]
          : []),
        `days to fill, in this order: ${daysToEat.join(", ")}`,
        // ⛔ NOMMER LE JOUR NE SUFFIT PAS, IL FAUT CONTREDIRE L'A PRIORI.
        // La liste commençait par `sun` et portait déjà « ne décale pas pour
        // commencer aujourd'hui »; le modèle a quand même composé lundi →
        // vendredi et rendu zéro plat le dimanche (2026-09-18, foyer
        // `5e0c3825`). Une donnée qui contredit l'habitude du modèle sans la
        // NOMMER se fait lisser. Cette ligne dit l'habitude, puis la dément.
        ...(daysToEat[0] !== undefined && daysToEat[0] !== "mon"
          ? [
            `This stretch does NOT start on Monday. Its first day is ` +
            `${dayProse(daysToEat[0])}, and that ${dayProse(daysToEat[0])} ` +
            "carries its meals exactly like every other day of the list. A " +
            "plan whose first dish falls on Monday is a plan that dropped its " +
            "opening day.",
          ]
          : []),
        "Do not use any other day token. Fill exactly those days, in that " +
        "order, starting at the first one -- do not shift the list to begin " +
        "today, and do not add a day before it.",
      ]
      : []),
    // ── LE JOUR DE CUISINE QUI NE PORTE AUCUN REPAS ────────────────────────
    // ⚠️ IL EST DIT DEUX FOIS, ET C'EST VOULU: une fois ici (« n'écris aucun
    // plat ce jour-là »), une fois dans le bloc de cuisine (« c'est là que la
    // session a lieu »). La liste au-dessus ne le contient déjà plus; cette
    // phrase existe parce qu'une ABSENCE ne s'obéit pas — le modèle connaît le
    // jour par la date de départ du plan, et l'a déjà rempli quand rien ne le
    // lui interdisait.
    ...(args.cookOnlyDay !== null
      ? [
        `the stretch opens on ${args.cookOnlyDay}, and that day is a COOKING ` +
        "day only: they cook ahead on it and eat NOTHING from it. Write no " +
        `dish on ${args.cookOnlyDay} -- not a breakfast, not a snack. It is ` +
        "the day the batches are made, for the days listed above.",
      ]
      : []),
    // ── ① L'ARBITRAGE, EN DERNIER, PARCE QUE C'EST LÀ QU'IL EST LU ────────
    // Voir l'en-tête de `PRECEDENCE_BLOCK`. Il vient APRÈS la commande et
    // non avant: la commande dit QUOI produire, celui-ci dit comment
    // trancher entre deux lignes du message qui demandent l'inverse — c'est
    // la dernière chose à savoir avant d'écrire, donc la dernière écrite.
    "",
    PRECEDENCE_BLOCK,
  ].join("\n");

  return {
    // ⚠️ DEUX VARIANTES CACHEABLES, PAS UNE. Le bloc des contenants solo est un
    // SCHÉMA (il décrit une clé de sortie), donc il vit avec les autres règles
    // de forme; le poser dans le message utilisateur en aurait fait la seule
    // règle de forme ailleurs. Le prix est un second préfixe de cache, et la
    // lane foyer garde EXACTEMENT le prompt d'avant — un test le tient.
    systemPrompt: args.soloBoxes
      ? `${MEAL_SYSTEM_PROMPT}\n\n${SOLO_BOX_BLOCK}`
      : MEAL_SYSTEM_PROMPT,
    // Le bloc de langue en DERNIER, sur le `userMessage` (récence), jamais sur
    // le `systemPrompt` (cacheable, partagé par tous les élèves).
    //
    // ⚠️ `generate-meal-v1` colle un `hungerSuffix` APRÈS ce message avant
    // d'appeler le modèle. `appendContentLanguageBlock` étant idempotent, la
    // remise du bloc après ce suffixe est faite là-bas — ici on garantit qu'il
    // existe, là-bas qu'il est bien le dernier.
    userMessage: appendContentLanguageBlock(
      userMessage,
      args.contentLocale,
      MEAL_TRANSLATABLE_FIELDS,
      MEAL_TOKEN_FIELDS,
    ),
    // Le motif `maxNutrition` appliqué à la langue: la valeur qui a servi
    // RESSORT, et c'est elle que l'appelant écrit en base. Une seule
    // expression, donc aucune divergence possible.
    contentLocale: args.contentLocale,
  };
}

/**
 * ⟳ 2026-09-25 — LE BUDGET ENTRE-T-IL DANS LA CONSIGNE ? Une seule décision,
 * lue par la consigne (le bloc budget ci-dessus) ET par le texte d'explication
 * du plan (`budgetAmount` de `explainPlanChoices`, lane du foyer).
 *
 * Banc des trois foyers : sous le plancher, le bloc disparaissait de la
 * consigne, mais le texte lu par la personne disait encore « Le budget des
 * courses est X. Pour y tenir, ce sont d'abord les protéines chères… » — un
 * arbitrage que le modèle n'avait jamais reçu.
 */
export function budgetReachesPrompt(
  amount: number | null,
  floor: number | null,
): amount is number {
  return amount !== null && (floor === null || amount >= floor);
}

