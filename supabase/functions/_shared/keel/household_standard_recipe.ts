// ═══════════════════════════════════════════════════════════════════════════
// LE PROMPT DU FOYER — RESTRICTIONS, FAITS DÉJÀ TRANCHÉS, RECETTE STANDARD
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_meal_generation.ts` (découpage
// des gros fichiers, lot 2c). Aucune logique changée, aucun octet de prompt
// changé. `household_meal_generation.ts` ré-exporte tout ce qui est exporté
// ici : les appelants continuent d'importer depuis lui.
//
// Ce qui est ici : le type `HouseholdRestriction`, le bloc `DECIDED BEFORE YOU`
// (`DecidedBeforeYou`, `decidedBeforeYouBlock`), les deux planchers de densité
// (`NORMAL_DISH_MIN_KCAL_PER_100G`, `LIGHT_DISH_MIN_KCAL_PER_100G`) et
// `standardRecipeBlock`.
//
// ⚠️ `STANDARD_RECIPE_BLOCK` (la forme calculée au chargement) reste DÉFINI
// dans `household_meal_generation.ts`, qui l'assemble à partir d'ici.
//
// Ce module n'importe rien.

export interface HouseholdRestriction {
  memberId: string;
  memberDisplayName: string;
  label: string;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUI EST DÉJÀ TRANCHÉ QUAND LE MODÈLE COMMENCE — 2026-09-04.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE BLOC N'EST PAS UN RAPPEL, C'EST UNE FRONTIÈRE. Le modèle écrit
 * maintenant une prose sur SES arbitrages (`explanation`); sans savoir ce que
 * le moteur a déjà décidé, il l'explique aussi — et il l'explique de travers,
 * parce qu'il ne sait pas POURQUOI. C'est la cicatrice
 * `redirect-appends-contradict-the-model-guess` prise à l'endroit: on donne le
 * fait AVANT la génération plutôt que de coller une phrase après.
 *
 * ⚠️ TOUS LES CHAMPS SONT DÉJÀ CALCULÉS quand le prompt s'assemble. On ne
 * recalcule rien ici — deux calculs du même fait divergent, et c'est
 * l'explication qui a tort (trois fois dans ce dépôt: `usableCookDays`,
 * `addedCookDays`, la liste des jours de cuisine de la veille).
 */
export interface DecidedBeforeYou {
  /** `same_morning` | `starts_tomorrow` | `day_before`. */
  readonly timing: string;
  /** Le jour retiré parce qu'il était déjà dépensé, ou `null`. */
  readonly droppedDay: string | null;
  /** Les moments d'aujourd'hui qui ne sont plus au plan. `[]` = aucun. */
  readonly slotsDroppedToday: readonly string[];
  /** Les jours où une session de cuisine est posée. */
  readonly cookDays: readonly string[];
  /** Les jours qu'aucun lot ne peut atteindre — ils se cuisinent frais. */
  readonly daysOutOfReach: readonly string[];
  /** La ligne alimentaire la plus stricte de la table, ou `null`. */
  readonly strictestRegime: string | null;
  /**
   * LE SENS DU PLAN, PAR PERSONNE: `down` | `up` | `null` (rien de visé).
   *
   * ⛔ UNE DIRECTION, JAMAIS UN OBJECTIF. « fat_loss » est un fait sur la
   * personne, et la garde du bloc interdit au modèle d'en écrire un. Lui donner
   * le mot qu'il ne doit pas répéter serait le lui faire répéter.
   *
   * ⟳ 2026-09-23 — UNE LIGNE PAR PERSONNE, ET PLUS CELLE DU SEUL TITULAIRE.
   * Le champ portait `direction`, la direction de la personne qui compose. Sur
   * le foyer de l'audit (Thomas en prise, Christèle en maintien, Fabrice en
   * perte), le bloc disait « this plan leans: bigger » pour les trois — et le
   * modèle composait la table entière comme celle de Thomas. Chacun porte
   * maintenant sa ligne.
   *
   * ⚠️ REQUIS, et `direction` a disparu du type: un appelant qui passait
   * l'ancien champ casse à la compilation au lieu de servir une ligne muette.
   * `[]` n'écrit aucune ligne de sens.
   */
  readonly directions: readonly {
    readonly name: string;
    readonly direction: string | null;
  }[];
  /** Une envie a-t-elle été servie au modèle pour cette semaine ? */
  readonly wishServed: boolean;
}

/**
 * LES FAITS, EN QUELQUES LIGNES — et la clé qui les complète, dans CE message.
 *
 * ⛔ ELLE EST NOMMÉE ICI AUSSI, et ce n'est pas une redondance: un « ci-dessus »
 * ne traverse pas la frontière système/utilisateur. Ce dépôt l'a mesuré à 0 %
 * trois fois — la promesse vit dans un message, la clé dans l'autre, et le
 * modèle écrit ce qu'il a sous les yeux.
 *
 * ⚠️ `null` REND UNE CHAÎNE VIDE, donc un `userSuffix` byte-identique à celui
 * d'avant ce lot. C'est ce qui rend l'ajout mesurable: un appelant qui ne passe
 * pas les faits produit le prompt de v25, et le compteur `asked` le dit.
 */
export function decidedBeforeYouBlock(decided: DecidedBeforeYou | null): string {
  if (decided === null) return "";
  const or = (xs: readonly string[], none: string) =>
    xs.length === 0 ? none : xs.join(", ");
  return [
    "== DECIDED BEFORE YOU (facts, already explained to them -- do not re-decide) ==",
    `- The plan starts: ${decided.timing}.` +
    (decided.droppedDay === null
      ? " No day was dropped."
      : ` ${decided.droppedDay} was dropped: it was already spent.`),
    `- Not eaten here today: ${or(decided.slotsDroppedToday, "nothing")}.`,
    `- Cooking session(s) on: ${or(decided.cookDays, "days you choose")}.`,
    `- Days no batch can reach (cooked fresh that day): ${
      or(decided.daysOutOfReach, "none")
    }.`,
    decided.strictestRegime === null
      ? "- No declared diet at this table."
      : `- The shared dish follows the ${decided.strictestRegime} line.`,
    // ⟳ 2026-09-23 — UNE LIGNE PAR PERSONNE (voir `DecidedBeforeYou.directions`).
    ...(decided.directions ?? []).map((d) =>
      `- Which way this plan leans for ${d.name}: ${
        d.direction === "down" ? "lighter" : d.direction === "up" ? "bigger" : "steady"
      }.`
    ),
    `- A wish for this week was given to you: ${decided.wishServed ? "yes" : "no"}.`,
    "",
    'Explain only what YOU chose among what these leave open, in "explanation".',
  ].join("\n");
}

/**
 * LA DENSITÉ MINIMALE D'UN PLAT ORDINAIRE, EN KCAL POUR 100 G SERVIS.
 *
 * ⛔ POURQUOI UN PLANCHER DE DENSITÉ PLUTÔT QU'UN PLANCHER DE KCAL. Le modèle
 * n'a plus le corps de personne: il ne peut pas viser un nombre de calories, et
 * lui en donner un rouvrirait exactement la porte que v33 ferme. Une DENSITÉ,
 * elle, est une propriété du plat — vraie quelle que soit la personne qui le
 * mange — et c'est la seule contrainte de ce genre qu'on puisse lui donner sans
 * lui redonner le corps.
 *
 * ⚠️ DÉRIVÉ, PAS MESURÉ: un repas d'adulte plausible pèse 650 g pour ~650 kcal,
 * soit 100 kcal/100 g. Les plats réels du corpus tiennent entre 113 et 156
 * kcal/100 g — le plancher est donc sous la population, ce qui est la place
 * d'un plancher. ⛔ Si la réparation du lot 5 se met à mordre souvent, c'est
 * CE nombre qu'il faut relever, pas la borne d'assiette.
 */
export const NORMAL_DISH_MIN_KCAL_PER_100G = 100;

/**
 * LE MÊME PLANCHER POUR UN MOMENT MARQUÉ « LÉGER ».
 *
 * ⚠️ 60 ET PAS 0. « Léger » veut dire « moins que d'habitude », jamais « une
 * soupe claire »: sous 60 kcal/100 g, la quantité à manger pour atteindre même
 * une petite cible devient énorme, et c'est le défaut que ce plancher existe
 * pour empêcher. Une pomme de terre, un filet d'huile, une cuillère de crème
 * suffisent à le franchir.
 */
export const LIGHT_DISH_MIN_KCAL_PER_100G = 60;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * v33 · « ÉCRIS UNE RECETTE, PAS UNE PORTION » — le bloc du lot 3
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ MESSAGE UTILISATEUR, ET COLLÉ AU BRIEF DE PORTIONS. La promesse et la clé
 * de schéma doivent se toucher: ce dépôt a mesuré 0 % de conformité quand une
 * consigne était séparée de la phrase qui promet la matière, et un « ci-dessus »
 * ne traverse pas la frontière système↔utilisateur.
 *
 * ⛔ L'ÉCHAPPATOIRE EST NOMMÉE, littéralement. « Écris une recette standard »
 * sans dire ce qu'on refuse se fait satisfaire par « une portion standard pour
 * Alex ». Les trois interdits sont donc écrits en toutes lettres: jamais une
 * portion pour une personne nommée, jamais une boîte, jamais un chiffre par
 * personne.
 *
 * ⚠️ LES DEUX PLANCHERS SONT INTERPOLÉS, jamais recopiés. Une consigne qui
 * promet 100 et une garde qui accepte 90 laisseraient passer un plat que le
 * moteur devra réparer — et le modèle aurait raison contre le moteur.
 */
/**
 * ⟳ 2026-09-08 — LES PLANCHERS ENTRENT EN ARGUMENT, ET LE BLOC DEVIENT UNE
 * FONCTION.
 *
 * ⛔ CE N'EST PAS UNE GÉNÉRALISATION GRATUITE. Une bouche sous plancher TCA a
 * une densité requise qu'on ne peut écrire en face de son nom
 * (`RequiredDensity.floorOnly`); le seul endroit où son exigence peut atteindre
 * le modèle est ce plancher COMMUN, où elle se confond avec celle des autres.
 * Sans ce paramètre, la protéger d'un chiffre revenait à la sous-nourrir.
 *
 * `STANDARD_RECIPE_BLOCK` reste, avec les planchers de base: c'est ce que
 * `household_prompt_v34.ts` joint, et ce que les tests du prompt v33 lisent.
 */
/**
 * ⟳ 2026-09-23 — LA RECETTE DE RÉFÉRENCE, ET LE PLAT QUI N'EST PLUS TOUT LE
 * REPAS (audit `docs/keel/AUDIT-DOSAGES-2026-09-23.md`).
 *
 * ⛔ CE QUE LE BLOC POUSSAIT, MESURÉ. Trois phrases disaient au modèle
 * d'atteindre la densité PAR LE FÉCULENT (« Reach the density with the
 * starch », « the energy of a plate comes from the starch », « more starch »),
 * une quatrième visait l'assiette la plus petite (« aim 200 g »), et rien ne
 * disait ce qu'est UNE part. Résultat sur les plans de l'audit: 150 g de
 * céréale sèche par part (médiane), et une recette commune écrite pour le plus
 * gros mangeur — Thomas à 700 g d'assiette par construction.
 *
 * ⛔ LA PART EST CELLE DE LA PERSONNE DU MILIEU (décision du propriétaire,
 * point 4). Le moteur multiplie ensuite: une recette écrite pour le plus gros
 * mangeur donne au plus petit une assiette trop dense, et l'inverse une
 * assiette trop grosse. La référence est écrite en GRAMMES — jamais en kcal
 * (garde de fuite `first_draft_contract_test.ts`).
 *
 * ⚠️ LE FÉCULENT DE RÉFÉRENCE EST DANS LA PHRASE QUI NOMME `separable_side`:
 * la promesse et la clé de schéma doivent se toucher (`starch_side_wiring_test`
 * ⑤ mesure l'écart en caractères).
 *
 * ⟳ 2026-09-23 — v38: CETTE PHRASE VAUT POUR TOUT DÉJEUNER ET TOUT DÎNER,
 * mangé seul ou partagé. Il n'y a plus de branche « ONE person … ONE dish ».
 * À table, une case mangée par une seule bouche d'un foyer reste hors du
 * partage (`starchAsideCellsOf` exige deux mangeurs): ses deux casseroles sont
 * servies au même facteur (`partFactorOf` avec `starchSide: null`).
 *
 * ⚠️ `sides.served` EST REQUIS. La phrase « the app serves a side course
 * beside it (SIDE COURSES) » renvoie au bloc `side_courses_prompt.ts`; servie
 * sans lui, elle renverrait à un bloc absent — la cicatrice du « ci-dessus »
 * qui ne pointe nulle part. Sans à-côté, la phrase dit seulement qu'on n'en
 * ajoute pas au plat.
 */
export function standardRecipeBlock(
  floors: { normal: number; light: number },
  sides: { served: boolean },
): readonly string[] {
  return Object.freeze([
    "== WRITE ONE STANDARD RECIPE PER DISH ==",
    "Write every dish and every preparation as ONE standard recipe: ingredients in",
    "grams (or ml, units, spoons) with their state, raw as bought for rice, pasta,",
    "dry legumes, meat and fish. A preparation is written for the dishes that draw",
    "on it; each dish draws one serving. The app multiplies each recipe to what the",
    "person eats and works out the batch and the shopping.",
    // ⛔ MESURÉ AU PREMIER TIR v33 (2026-09-07): sur 4 plats, 2 sont devenus
    // ILLISIBLES parce que le modèle listait « poulet rôti », « semoule cuite »
    // et « légumes rôtis » comme ingrédients du PLAT, sans quantité, en plus de
    // citer les trois casseroles dans `uses`. Il nommait le contenu du pot deux
    // fois. `dishEnergy` voit une quantité manquante et s'abstient sur le plat
    // ENTIER — `missing_quantity`, 2 sur 4.
    //
    // ⚠️ CE N'EST PAS UNE DÉSOBÉISSANCE, C'EST UNE AMBIGUÏTÉ DE LA CONSIGNE
    // au-dessus: « each dish draws one serving » se lit aussi comme « dis ce que
    // le plat contient ». La phrase qui suit lève l'ambiguïté au lieu de gronder.
    "When a dish draws on a preparation, that link is the whole statement: do NOT",
    "also list the preparation's food among the dish's own ingredients. The dish's",
    "ingredients are only what is added fresh on top of it.",
    "Never write a portion for a named person, never a box, never a per-person",
    "figure. Those are computed, not written.",
    // ⟳ 2026-09-23 — LA RECETTE DE RÉFÉRENCE. Une part = l'assiette ordinaire
    // de la personne du MILIEU de la table; le moteur la multiplie pour les
    // autres. Écrite en grammes crus, jamais en kcal.
    "THE TEMPLATE: one serving is the ordinary plate of the person in the MIDDLE",
    "of the table, never the biggest eater's; the app scales it for everyone.",
    "  · main pot, per serving: 110 to 130 g of lean protein, raw (tofu 100 to",
    "    150 g), 180 to 200 g of vegetables, 10 ml of oil, at most 15 g of cheese;",
    "  · breakfast, per serving: 50 to 60 g of oat flakes or muesli; 125 g of skyr",
    "    or fromage blanc, or 200 ml of milk; one fruit of 100 to 120 g; 15 to 20 g",
    "    of nuts or seeds; at most 2 eggs. Skyr and fromage blanc carry the protein;",
    "    greek yogurt does not (whole milk, little protein). A frittata with 300 g",
    "    of tomato per serving is not a breakfast.",
    // ⟳ 2026-09-22 · LOT C — LE FÉCULENT À CÔTÉ SUR UNE CASE PARTAGÉE.
    // ⛔ LA RÈGLE « ONE dish » FAISAIT MÉLANGER le féculent, cuit à part, dans
    // la casserole du poulet: une seule composition, donc une seule densité
    // protéique pour toute la table — celle du plancher le plus exigeant. Mesuré
    // sur `6e4e5548`: `protein_ceiling.over` 9 jours-bouche sur 15, pire +46 %.
    // Deux casseroles se servent en deux proportions (`starch_side.ts`).
    // ⚠️ LES CLÉS DU SCHÉMA SONT DANS LA PHRASE (`uses`, `components`,
    // `separable_side`): une promesse loin de sa clé est suivie à 0 %.
    // ⟳ 2026-09-23 — ET LE FÉCULENT DE RÉFÉRENCE AUSSI, dans la même phrase.
    // ⟳ 2026-09-23 — v38: UNE SEULE RÈGLE, SEUL OU À PLUSIEURS. La phrase
    // « A lunch or dinner eaten by ONE person is a complete plate in ONE dish »
    // est retirée. Mesuré sur le brouillon `1461270e` (une personne seule, en
    // perte de poids): aucun plat n'avait son féculent dans une casserole à
    // part, céréale sèche médiane 69 g, part d'énergie du féculent 0,35 alors
    // que la forme d'assiette de la perte vise 0,30 au plus. Le moteur sait
    // servir cette forme à une personne seule (`soloStarchSideOf`), mais
    // seulement sur un plat écrit en deux casseroles.
    "Every lunch and dinner, eaten alone or shared, is ONE main preparation (the",
    "protein, the vegetables, the sauce, in the amounts of THE TEMPLATE's main pot)",
    "AND its starch as a SEPARATE preparation, cooked in its own pot: rice, pasta,",
    "semolina, bulgur, quinoa or potatoes. The",
    "starch preparation has one component, role \"separable_side\", and the dish",
    "\"uses\" BOTH preparations; one serving of that starch is 60 to 70 g of dry",
    "grain, OR 220 to 250 g of potatoes (never at a table where a card says muscle",
    "gain), OR 80 to 90 g of bread -- never more. Check it: divide each pot by its",
    "\"servings_made\"; one serving must land in THE TEMPLATE. Never stir the starch",
    "into the main pot: the app serves each person more or less starch beside the",
    "same main. The session \"run_through\" says so: the starch cooks in its own",
    "pot. The app then puts the main and the starch side by side in ONE container",
    "per meal. Two dishes of the same session that take the same starch share",
    "ONE pot of it: never two pots of the same starch in one session.",
    `A normal dish carries at least ${floors.normal} kcal per 100 g as served. A soup is`,
    "possible but it comes complete (croutons, grated cheese, a poached egg, or",
    "bread and cheese beside it).",
    // ⟳ 2026-09-20 — LA GRAISSE EST UN FILET, PAS UN LEVIER DE DENSITÉ. Mesuré
    // sur le plan `836afa60`: 30 ml d'huile et 85 g de parmesan PAR PART pour
    // atteindre la densité demandée — 1,4 litre d'huile sur la liste de trois
    // personnes. Le chiffre est ici parce qu'une consigne sans chiffre se fait
    // satisfaire par son échappatoire.
    // ⟳ 2026-09-23 — « with the starch » RETIRÉ: c'était l'une des trois
    // phrases qui envoyaient le modèle au féculent (audit du 2026-09-23).
    "The fat of a plate is a drizzle: 5 to 15 ml of oil, or 15 to 30 g of cheese,",
    "per serving -- never both at full size. Reach the density with what THE",
    "TEMPLATE gives, not by pouring oil or grating cheese until the figure is met.",
    // ⟳ 2026-09-25 — v44: UNE HUILE AJOUTÉE SE VERSE. Mesuré sur les plans
    // servis en v35/v36: 10 lignes d'huile ajoutée sur 13 sous 2,5 ml (0,3 ml
    // pour tenir « never both at full size » à côté d'un fromage). Personne ne
    // verse 0,3 ml; le plancher est dit à côté de la règle qu'il borne.
    "Oil a dish adds fresh on the day is at least 5 ml, one teaspoon: less cannot",
    "be poured. A plate that cannot take 5 ml more adds no oil.",
    // ⟳ 2026-09-21 — CE QU'UN NUTRITIONNISTE A REFUSÉ SUR LE PLAN `3e121b21`,
    // ET LES CHIFFRES QUI L'INTERDISENT. Deux légumes sur toute la semaine
    // (oignon, poivron), 170 à 220 g de légumes par jour et par bouche, de la
    // saucisse à quatre repas sur huit pour l'homme en perte, aucun poisson
    // sauf dans les goûters solo, la même casserole midi et soir. Aucune de
    // ces choses n'était bornée; chaque phrase ci-dessous porte son nombre,
    // et `generated_from.food_quality` mesure chacune sur le plan livré.
    "Every lunch and dinner serving carries at least 150 g of vegetables (raw",
    "weight, before cooking: leaves, cabbages, roots, peppers, tomatoes,",
    "courgettes, green beans, mushrooms). Across the plan, use at least four",
    "different vegetables. Onion is a seasoning, not the vegetable of a dish.",
    "Cured and processed meat (sausages, ham, bacon, pate, salami, chorizo,",
    "merguez) is a FAT, not the protein of a dish: at most ONE dish in seven",
    "days carries it. Red meat (beef, pork, lamb, veal) is the protein of at",
    "most three lunches or dinners in seven days, two in five. The rest is",
    "poultry, fish, eggs, dairy and legumes.",
    "At least one shared lunch or dinner in any five days is a fish dish, and a",
    "seven-day plan carries one fatty fish (salmon, sardines, mackerel, trout,",
    "herring). Tuna, tinned or fresh, is served to the same person at most twice",
    "in seven days.",
    "The same preparation is never served twice in one day to the same person.",
    "Breakfast alternates at least two different bases across the plan -- not",
    "the same bowl with a different fruit.",
    // ⟳ 2026-09-21 — RELU SUR LE PLAN `c1ce4658`: 1,8 kg de maquereau pour six
    // parts (300 g chacune, deux jours de suite), 1 265 g de dinde pour 925 g
    // de couscous SANS légume dans la casserole, 5,3 kg de petits-suisses dans
    // 12 plats sur 20 (350 g dans un bol du matin, 235 g dans un goûter). La
    // protéine dépassait le plafond de 56 % et les légumes tenaient dans des
    // garnitures de 28 g. Chaque phrase porte son nombre et
    // `generated_from.food_quality` le mesure.
    // ⟳ 2026-09-23 — « the energy of a plate comes from the starch » RETIRÉ
    // (audit du 2026-09-23). La borne de la viande reste; sa justification
    // renvoyait au féculent.
    "A serving of meat, poultry or fish is 100 to 150 g raw, never more, and",
    "never a bigger piece to reach a density. A preparation that feeds lunches or",
    "dinners carries its vegetables INSIDE the pot, at least 150 g raw per",
    // ⟳ 2026-09-22 · LOT C — la casserole-féculent d'un plat partagé n'en
    // porte pas: ses légumes sont dans la casserole principale.
    // ⟳ 2026-09-23 — v38: « of a shared dish » retiré. Tout déjeuner et tout
    // dîner a maintenant sa casserole-féculent; garder « shared » aurait exigé
    // 150 g de légumes dans le riz d'une personne seule.
    "serving (the starch pot excepted: its vegetables are in",
    "the main pot); a fresh topping of 20 or 30 g is a garnish, not the vegetable of",
    "a dish. Fresh dairy (yogurt, petit-suisse, fromage blanc, skyr, cottage) is",
    "at most 250 g per person per day across all meals, and at most 150 g in a",
    "snack. No single ingredient appears in more than half of the plan's dishes.",
    // ⟳ 2026-09-21 — RELU SUR LE PLAN `94c93ca9`, décision du propriétaire:
    // du thon au petit-déjeuner, 195 g de tofu au réveil, quatre plats de
    // poisson gras en quatre jours, un pot de bœuf servi trois fois, et des
    // légumes à 150 g pile qui tombent à 120 sur la plus petite assiette.
    "Fish belongs to lunch and dinner: no fish at breakfast, in the morning or",
    "in the afternoon, unless a person's card or a note asks for it. Breakfast",
    "and snacks carry no meat either; their protein comes from dairy, eggs (unless",
    "excluded), nuts or a little tofu, and they respect the figure on the card.",
    "Fatty fish (salmon, mackerel, sardines, herring, trout) appears in at most",
    "two dishes in seven days; the other fish is lean (cod, hake, pollock) or",
    "shellfish. A red-meat preparation is drawn on by at most two dishes.",
    // ⟳ 2026-09-23 — « the SMALLEST serving … aim 200 g » RETIRÉ: il faisait
    // écrire la casserole pour la plus PETITE assiette, donc la recette entière
    // pour le rapport le plus grand. THE TEMPLATE dit 180 à 200 g de légumes
    // pour la part du milieu.
    `A slot marked (light) calls for a light recipe: still nourishing, at least ${floors.light} kcal`,
    "per 100 g as served (a potato, a drizzle of oil, a spoon of cream). Below that",
    "the amount to eat becomes enormous.",
    // ⟳ 2026-09-23 — « There is no starter: the dish is the unit » RETIRÉ. Le
    // plat n'est plus tout le repas: le moteur sert un à-côté à part
    // (`side_courses_prompt.ts`). Le renvoi n'est écrit que si le bloc l'est.
    sides.served
      ? "The dish is not the whole meal: the app serves a side course beside it (SIDE COURSES). Never add a dessert, bread or a starter to a dish."
      : "Never add a dessert, bread or a starter to a dish: the dish is what you write for a meal.",
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-10 — LA MÉTHODE DE CALCUL, ET LA TABLE SUR LAQUELLE LA POSER
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE MODÈLE NE CALCULAIT PAS, IL DEVINAIT — MESURÉ. Sur 40 densités
    // demandées puis mesurées (`qa-genty-clone`, 2026-09-09/10), l'écart entre
    // la consigne et la recette rendue va de **−23 % à +63 %**; médiane +3,1 %,
    // 17 en dessous, 23 au-dessus. Une médiane juste et une amplitude pareille,
    // c'est la signature d'un tirage au sort, pas d'une visée.
    //
    // ⚠️ UNE MARGE NE RÉPARE PAS ÇA. `REPAIR_DENSITY_HEADROOM` déplace le
    // centre; ici le centre est bon et c'est la dispersion qui coûte. On ne
    // corrige pas une dispersion en poussant la cible.
    //
    // ⛔ ON NOMME CIQUAL PARCE QUE C'EST *NOTRE* SOURCE. `food_composition_refs`
    // porte 881 lignes `ciqual` sur 943: la table de l'ANSES est exactement ce
    // avec quoi le moteur pèse ensuite. Sans elle, le modèle calcule avec les
    // valeurs qu'il a en tête et les deux calculs ne parlent pas de la même
    // chose. Elle est publique, et il la connaît.
    //
    // ⛔ ET ON DIT « CUIT », PARCE QUE « AS SERVED » NE SUFFISAIT PAS. 100 g de
    // riz sec font 350 kcal/100 g; cuits, 130. Un modèle qui pose son calcul sur
    // le cru se croit dense et rend une recette qui ne l'est pas — c'est la
    // moitié basse de la dispersion mesurée.
    "",
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT C (2026-09-11) — LE PRORATA DE CHAQUE CASSEROLE, ÉCRIT
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ L'ÉTAPE 1 DISAIT « chaque ingrédient de chaque préparation », SANS
    // DIRE COMBIEN ON EN PREND. L'enquête du 2026-09-11 le nomme: « le bloc de
    // calcul n'explicite pas le prorata de chaque préparation partagée; la
    // réparation cite des quantités de casseroles ENTIÈRES sans afficher le
    // nombre de tirages ni la contribution de chaque composant ». Un modèle qui
    // additionne la casserole entière calcule une densité de CASSEROLE et la
    // déclare comme une densité d'ASSIETTE.
    //
    // ⚠️ SON IMPACT CHIFFRÉ N'EST PAS ISOLÉ, et l'enquête le dit aussi. On
    // répare une ambiguïté ÉVITABLE du contrat, pas un coût mesuré: c'est faux,
    // donc ça part. Prétendre le contraire serait inventer une mesure.
    //
    // ⛔ ET LE NOMBRE DE TIRAGES EST DIT PAR SON NOM DE CLÉ (`servings_made`),
    // pas par une périphrase: la promesse et la clé de schéma doivent se
    // toucher, ce dépôt a mesuré 0 % de conformité quand elles étaient séparées.
    "HOW TO CHECK A DISH'S DENSITY, AND DO IT BEFORE YOU MOVE ON:",
    "  1. For EACH preparation the dish draws on: take the WHOLE pot, its cooked",
    "     grams and its kcal, and divide BOTH by that pot's \"servings_made\".",
    "     That quotient is the one serving this dish takes from it. A dish takes",
    "     ONE serving from each pot it names — never the whole pot.",
    "  2. Add the dish's OWN ingredients, at full weight: they are added fresh on",
    "     the day, so nothing divides them.",
    "  3. Use the CIQUAL food composition table (ANSES, the French reference) for",
    "     their energy. It is the table this kitchen weighs with.",
    "  4. Weigh them COOKED, ready to serve — not raw. Dry rice is 350 kcal per",
    "     100 g; cooked it is about 130. Meat and vegetables lose water too.",
    "  5. density = (total kcal) ÷ (total cooked grams) × 100.",
    "Write that number in EVERY dish's \"density_check\" field — it is required,",
    "and a dish without it is an unchecked dish.",
    // ⛔ CE QUE `density_check` EST, DIT AU MODÈLE LUI-MÊME. Le chantier
    // l'exige: « `density_check` reste une déclaration, jamais une preuve ». Le
    // taire laisse croire qu'écrire le nombre suffit — et l'enquête a mesuré
    // exactement ça: 141 déclarés contre 105,4 pesés, 159 contre 92,2.
    "That number is what you DECLARE, not what you prove. The app weighs the",
    "dish again from the ingredients you wrote, and compares the two. A number",
    "you did not actually compute buys nothing: it only hides which dish to fix.",
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-10 — LES DEUX CÔTÉS, PARCE QU'UN SEUL A ÉTÉ MESURÉ INSUFFISANT
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ « SI C'EST TROP BAS » N'A PAS DE HAUT. Sur 40 densités demandées puis
    // pesées, 23 étaient AU-DESSUS de la consigne, jusqu'à +63 %. Un plat trop
    // dense n'est pas un bonus: la part tient dans trois cuillères, passe sous
    // le plancher d'assiette, et déclenche une réparation « allège » qui coûte
    // le même appel qu'une réparation « densifie ».
    //
    // ⚠️ ET LE REMÈDE N'EST PAS SYMÉTRIQUE. Descendre se fait en ajoutant du
    // légume et de l'eau; monter se fait en retirant de l'eau. Dire « ajuste »
    // sans dire le geste laisse le modèle servir moins — ce qui rabote
    // l'assiette par l'autre bout au lieu de changer la recette.
    // ⟳ 2026-09-23 — « more starch » RETIRÉ du remède « trop bas » (audit du
    // 2026-09-23). Le geste dit maintenant ce qui densifie SANS toucher la
    // forme de l'assiette, et nomme les deux échappatoires qu'on refuse.
    "If your number is OUTSIDE the range the line above asks for, fix the recipe",
    "BEFORE you answer, and fix the RECIPE, not the amount served:",
    "  · below the range: less cooking water, legumes in the main pot or 10 g",
    "    more cheese; never more starch than THE TEMPLATE, never fewer vegetables;",
    "  · above the range: more vegetable and more water-rich food, less oil and",
    "    less dense starch.",
    "Do not answer with a dish you already know is outside its range.",
  ]);
}
