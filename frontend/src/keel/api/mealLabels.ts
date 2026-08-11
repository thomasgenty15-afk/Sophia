// KEEL — les libellés du MOTEUR DE REPAS, et pourquoi ils ne sont pas dans
// `labels.ts`.
//
// `api/labels.ts` traduit les jetons d'un PLAN PUBLIÉ, et il JETTE sur un jeton
// inconnu — à raison: un slug brut affiché à un élève est exactement le drop
// silencieux que R7 interdit. Mais son vocabulaire de créneaux est celui de
// `slot_vocabulary` (`on_waking`, `snack_am`, `snack_pm`, `before_bed`, ...),
// et celui du générateur de repas est plus court et distinct (`breakfast`,
// `lunch`, `dinner`, `snack`).
//
// Ajouter `snack` à la table des créneaux pour faire passer un plat mélangerait
// deux vocabulaires que la base tient séparés, et rendrait `slotLabel`
// tolérant à un jeton qu'aucun plan ne contient. Les deux tables restent donc
// distinctes, chacune fermée sur son propre vocabulaire.

const COPY = {
  "meals.result.in_pantry": "You have it",
  "meals.result.method": "How",
  // ── FF-053: DEUX CLÉS QUI ONT DÉMÉNAGÉ ──────────────────────────────────
  // Elles vivaient dans le `COPY` local de `MealBuilder`. Depuis que le rendu
  // d'un plan est un composant partagé (`plan/PlanResult`), monté sur
  // `/app/plan` ET dans la pop-up du brouillon, une copie locale à l'un des
  // deux appelants serait une copie que l'autre ne peut pas lire.
  //
  // ⚠️ `meals.result.empty` N'A PAS déménagé, et c'est une décision: il dit
  // « dis-moi par où commencer CI-DESSUS », ce qui est vrai sur l'écran du plan
  // et faux dans une pop-up qui n'a pas de formulaire. Le vide est donc un
  // texte de l'APPELANT (`emptyLabel`), pas du rendu.
  "meals.result.today": "Today",
  "meals.result.past": "Gone by",
  // Les sessions: le moment où l'on cuisine. Le déroulé est ce qu'on lit avant
  // de commencer, et aucun plat ne peut le porter — l'ordre des gestes se joue
  // ENTRE les préparations.
  "meals.sessions.title": "Your cooking sessions",
  "meals.sessions.subtitle":
    "Cook on these days and the rest of the week is assembling, not cooking.",
  "meals.sessions.makes": "— {n} servings",
  // ── LE TEMPS ──────────────────────────────────────────────────────────────
  // Deux nombres, jamais fondus en un. « 10 min hands-on » décide si on s'y met
  // ce soir; « 50 min in all » décide si on a la fenêtre. N'en montrer qu'un
  // ferait renoncer sur le mauvais critère.
  "meals.sessions.session_time": "about {n} min",
  "meals.sessions.active": "{n} min hands-on",
  "meals.sessions.total": "{n} min in all",
  "meals.sessions.recipe_show": "Recipe",
  "meals.sessions.recipe_hide": "Hide recipe",
  // ── CE QUI SE PASSE DANS LA CUISINE AUJOURD'HUI ───────────────────────────
  // `/app/today` répondait à « qu'est-ce que je mange » et pas à « qu'est-ce
  // que j'ai à faire ». Or les deux gestes qui DEMANDENT quelque chose à la
  // journée — cuisiner, faire les courses — n'existaient que sur `/app/plan`,
  // derrière deux boutons, dans une vue qui montre la semaine entière. Un
  // dimanche de cuisson ou un jeudi de courses ne se voyaient nulle part le
  // jour où ils tombent.
  //
  // DEMAIN EST DIT AUSSI, et c'est la moitié utile: on ne prépare pas une
  // session le matin même. La veille au soir est le moment où on décide de
  // sortir la viande ou de passer au magasin en rentrant.
  // ── LA GRILLE: QUELS REPAS, QUELS JOURS ───────────────────────────────────
  // Décocher veut dire « je ne mange pas ici » — pas « je gère moi-même ». Le
  // moment sort de la composition, de la liste de courses et des portions. La
  // copie doit le dire, sinon on décoche en croyant seulement masquer.
  "meals.picker.title": "Which meals, which days",
  "meals.picker.subtitle":
    "Everything you declared is on. Untick a meal you will not be eating at " +
    "home — nothing gets cooked for it, and nothing gets bought.",
  "meals.picker.meal": "Meal",
  "meals.picker.all_on": "Every meal is on. Untick the ones you are out for.",
  "meals.picker.some_off": "{n} meals off. They come back next time if you tick them.",
  "meals.picker.no_rhythm":
    "Set the moments you eat in «How your day runs» first — this grid is built " +
    "from them.",
  "meals.picker.open": "Pick the meals",
  "meals.picker.save": "Save",
  "meals.picker.saving": "…",
  "meals.picker.cancel": "Cancel",
  "meals.today.title": "In the kitchen",
  "meals.today.cook_today": "You cook today",
  "meals.today.cook_tomorrow": "You cook tomorrow",
  "meals.today.shop_today": "Shopping day",
  "meals.today.shop_tomorrow": "Shopping tomorrow",
  "meals.today.shop_on": "Shopping on {day}",
  // UNE COURSE PASSÉE SE DIT, et c'est le cas qui compte le plus. Ne rien
  // afficher parce que la date est derrière laisse quelqu'un dont le frigo est
  // vide devant un écran qui a l'air normal — pendant que le plan, lui,
  // suppose que les courses ont été faites. C'est la dégradation silencieuse
  // que ce dépôt paie le plus cher.
  "meals.today.shop_overdue": "Shopping was due {day}",
  "meals.today.shop_items": "{n} items on the list",
  "meals.today.shop_open": "Open the list",
  "meals.today.sessions_open": "See the week",
  "meals.today.makes": "Makes {titles}",
  // Le repli quand la journée ne demande rien: on ne dit pas « rien à faire »,
  // on dit CE QUI EST déjà fait — sinon l'élève croit qu'il manque quelque
  // chose, alors qu'une semaine bien préparée est justement une semaine où la
  // plupart des jours n'ont rien à cuisiner.
  "meals.today.assembling": "Nothing to cook today — today is assembling.",
  // Un plat qui puise dans une préparation n'affiche ni sa recette ni ses
  // quantités: les répéter ferait racheter et recuire ce qui est déjà prêt.
  "meals.result.from_prep": "From {title} — cooked on {day}.",
  // Le lot: ce qu'une seule session de cuisine produit, et les jours qu'elle
  // nourrit. Dit AVANT les quantités, sinon « 1,200 g » se lit comme une
  // portion.
  "meals.result.batch_makes": "Cooked once — makes {n} servings",
  "meals.result.batch_covers": "covers {days}",
  // Le jour de restes: la seule chose à faire est de sortir la boîte, donc la
  // carte n'affiche ni les ingrédients ni la recette. Les répéter ferait
  // racheter et recuire ce qui est déjà au frigo.
  "meals.result.from_batch": "From the batch you cooked on {day} — reheat a portion.",
  "meals.day.mon": "Monday",
  "meals.day.tue": "Tuesday",
  "meals.day.wed": "Wednesday",
  "meals.day.thu": "Thursday",
  "meals.day.fri": "Friday",
  "meals.day.sat": "Saturday",
  "meals.day.sun": "Sunday",
  "meals.slot.breakfast": "Breakfast",
  "meals.slot.snack_am": "Mid-morning",
  "meals.slot.lunch": "Lunch",
  "meals.slot.snack_pm": "Afternoon",
  "meals.slot.dinner": "Dinner",
  "meals.slot.before_bed": "Before bed",
  // LEGACY, gardé exprès. Plus aucun écran ne propose ce créneau, mais des
  // plats déjà composés le portent: le retirer les afficherait « snack », en
  // brut, dans une interface par ailleurs traduite.
  "meals.slot.snack": "Snack",
  // LA CASE. « I ate this » au passé et à la première personne: c'est l'élève
  // qui rapporte un fait, pas le produit qui lui demande de valider une
  // consigne. « Done » aurait fait du dîner une tâche.
  "meals.tick.label": "I ate this",
  "meals.tick.failed": "That did not save. Tap it again.",
  // ── LES RAYONS ────────────────────────────────────────────────────────────
  // MOT POUR MOT CEUX DU PDF (`_shared/keel/meal_pdf.ts`), et dans le même
  // ordre. L'élève lit la liste à l'écran, l'imprime, et fait ses courses avec
  // le papier: deux ordres de rayons différents entre les deux, c'est un
  // article qu'on cherche au mauvais bout du magasin.
  "meals.aisle.produce": "Fruit & veg",
  "meals.aisle.protein": "Meat & fish",
  "meals.aisle.dairy": "Dairy",
  "meals.aisle.grains": "Grains & bread",
  "meals.aisle.frozen": "Frozen",
  "meals.aisle.pantry": "Cupboard",
  "meals.aisle.other": "Other",
} as const;

/**
 * L'ORDRE DES RAYONS — celui d'un magasin, pas l'alphabet.
 *
 * Copié de `AISLE_ORDER` du PDF. Le vocabulaire est FERMÉ côté moteur
 * (`SHOPPING_AISLES`), donc cette liste est exhaustive.
 */
export const SHOPPING_AISLE_ORDER = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "frozen",
  "pantry",
  "other",
] as const;

export type MealCopyKey = keyof typeof COPY;

export function mealCopy(key: MealCopyKey): string {
  return COPY[key];
}

/**
 * Le rayon, en mots. Un jeton inconnu rend « Other » au lieu de jeter.
 *
 * C'est l'INVERSE de `labels.ts`, qui jette sur un jeton inconnu, et la
 * différence est assumée: là-bas un jeton inconnu est un bug de vocabulaire
 * qu'il faut voir; ici c'est une carotte, et une carotte qu'on ne sait pas
 * ranger doit rester ACHETABLE plutôt que disparaître de la liste au
 * supermarché.
 */
export function aisleLabel(aisle: string): string {
  const key = `meals.aisle.${aisle}` as MealCopyKey;
  return key in COPY ? mealCopy(key) : mealCopy("meals.aisle.other");
}

/**
 * « tue » -> « Tuesday ». Rend `null` pour un plat sans jour, ce qui n'est pas
 * une anomalie: la portée « un jour » ne nomme aucun jour, et lui en inventer
 * un serait une prescription d'horaire que le moteur n'a pas faite.
 */
export function dishDayLabel(token: string | null): string | null {
  if (!token) return null;
  const key = `meals.day.${token}` as MealCopyKey;
  return key in COPY ? mealCopy(key) : token;
}

export function dishSlotLabel(slot: string | null): string | null {
  if (!slot) return null;
  const key = `meals.slot.${slot}` as MealCopyKey;
  return key in COPY ? mealCopy(key) : slot;
}
