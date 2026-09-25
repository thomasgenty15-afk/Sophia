import { DAY_TOKENS, type DayToken } from "./tokens.ts";

// ===========================================================================
// COMBIEN DE FOIS ON CUISINE, COMBIEN DE TEMPS, ET COMBIEN DE COURSES
// ===========================================================================
//
// ⟳ 2026-09-25 — DEUX QUESTIONS DIRECTES REMPLACENT LE STYLE DE CUISINE.
// Décision du propriétaire, le 2026-09-25.
//
// Jusqu'ici, « Comment tu cuisines » (le moins possible / un juste milieu /
// j'aime cuisiner, `practical_constraints.cooking_style`, posé le 2026-09-03)
// DÉDUISAIT en silence quatre réglages: le nombre de sessions
// (`sessionsForStyle`), les minutes par session, la difficulté des recettes et
// la variété. Le nombre de sessions n'était montré qu'une fois le plan composé:
// six jours et « j'aime cuisiner » donnaient quatre sessions de deux heures
// sans que personne l'ait demandé. On demande maintenant:
//
//   · COMBIEN DE FOIS on cuisine — `cooking_sessions ∈ {1..4}`, envoyé AVEC LA
//     DEMANDE. Il dépend de la longueur du plan (« quatre fois » n'a pas de
//     sens sur deux jours), donc il ne s'enregistre pas. Il remplace aussi la
//     case `one_cooking_session`: « une fois » est une réponse comme les autres.
//   · COMBIEN DE TEMPS par session — une PLAGE, dont la borne haute part dans
//     `practical_constraints.cooking_time_min`, la clé que le moteur lit déjà.
//     Réponse DURABLE.
//
// Les deux sont BORNÉES par le plan, avec la mécanique de l'offre de courses:
// une option impossible reste visible, grisée, et une phrase dit pourquoi.
//   · sans congélateur, au moins une session tous les `maxFridgeDays` jours
//     (`offerableCookingSessions`);
//   · une plage n'est proposée que si elle suffit à la plus grosse session
//     (`minimumSessionMinutes`). Pour le modèle, le temps est un MAXIMUM: trop
//     court, il cuisine moins et les derniers jours manquent de nourriture.
//
// La difficulté et la variété se DÉDUISENT de la marge entre le temps choisi et
// ce minimum (`cookingEffort`): peu de marge, recettes simples et plats qui
// reviennent; beaucoup, recettes élaborées et variées.
//
// `grocery_runs ∈ {1, 2, 3, "any"}` reste, DURABLE, et borné par les sessions.
//
// ⚠️ `cooking_style` N'EST PLUS LU PAR LE MOTEUR. La clé reste en base sur les
// comptes qui l'ont reçue; rien ne l'efface et rien ne la relit.
//
// ── UNE SEULE DÉFINITION, ET LE FRONT LA RÉEXPORTE ────────────────────────
// `frontend/src/keel/api/cookingPlan.ts` importe ce fichier et ne fait que
// réexporter — même discipline que `groceryWaves.ts` depuis le lot 8 du
// chantier foyer. Si tu ajoutes une règle là-bas, tu as recréé le jumeau que ce
// dépôt a déjà supprimé une fois.
//
// ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
// Il ne décide pas à la place de la personne. Il ne RELÈVE une réponse (une
// session de plus, une plage plus longue) que lorsqu'elle est impossible — ce
// que l'écran ne propose déjà pas —, et chaque relèvement porte sa note, donc
// sa phrase dans la rationale.
//
// PURE: no I/O, no clock, no randomness.

/**
 * COMBIEN DE FOIS ON ACCEPTE D'ALLER AU MAGASIN. Une, deux ou trois.
 *
 * ⛔ PAS DE ZÉRO, ET PAS DE QUATRE. Zéro course est un plan qu'on ne peut pas
 * faire; au-delà de trois, ce n'est plus une cadence, c'est du quotidien — et
 * le module des vagues ne sait de toute façon pas produire plus d'une vague par
 * session.
 */
export const GROCERY_RUNS = [1, 2, 3] as const;
export type GroceryRuns = typeof GROCERY_RUNS[number];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « PEU IMPORTE » — une RÉPONSE, et surtout pas une absence de réponse.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI CE N'EST PAS `null`, ET LA RAISON EST DANS LE CODE JUSTE EN BAS.
 * `resolveCookingCapacity` rend `plan: null` quand `runs === null` — il faut
 * les trois réponses pour dériver —, donc AUCUN plan de cuisine n'est dérivé. Mapper « peu importe » sur `null` ne ferait donc pas « le
 * moteur choisit »: ça éteindrait la dérivation entière, et le prompt partirait
 * muet sur les sessions. C'est le piège exact de la cicatrice
 * `jsonb default '[]' cache « répondu » vs « pas demandé »`, pris par le
 * nombre plutôt que par le tableau.
 *
 * ⚠️ ET CE N'EST PAS NON PLUS UN QUATRIÈME NOMBRE. « Peu importe » ne dit pas
 * « trois »: il dit « je n'impose rien ». La différence se voit le jour où le
 * plafond de l'offre bouge — un `3` figé garderait l'ancien monde, `"any"` suit.
 */
export const GROCERY_RUNS_ANY = "any" as const;
export type GroceryRunsAnswer = GroceryRuns | typeof GROCERY_RUNS_ANY;

/**
 * Le plafond dur du nombre de sessions, quel que soit ce qu'on demande.
 *
 * Les COURSES, elles, restent à trois au plus (`GROCERY_RUNS`): une quatrième
 * session se nourrit de la troisième course.
 */
export const MAX_COOKING_SESSIONS = 4;

/**
 * ⟳ 2026-09-25 — LES RÉPONSES À « COMBIEN DE FOIS TU VEUX CUISINER ».
 *
 * ⚠️ ÉCRITES EN DUR, PAS DÉRIVÉES DE `MAX_COOKING_SESSIONS`: le type en a
 * besoin, parce que chaque valeur a son libellé à l'écran et que le compilateur
 * doit les réclamer. `cooking_plan_test` tient que la dernière vaut le plafond.
 */
export const COOKING_SESSION_COUNTS = [1, 2, 3, 4] as const;
export type CookingSessionCount = typeof COOKING_SESSION_COUNTS[number];

/**
 * ⟳ 2026-09-25 — LES CINQ DURÉES PAR SESSION, « ENVIRON ».
 *
 *    30 min · 1 h · 1 h 30 · 2 h · 2 h 30
 *
 * ⟳ 2026-09-25 (soir) — ELLES REMPLACENT LES PLAGES (moins de 30 min … 3 h à
 * 4 h), décision du propriétaire: pas de session de plus de 3 h, et des durées
 * approximatives plutôt que des plages. Le nombre part dans `cooking_time_min`.
 * Une ancienne réponse (180, 240) est lue comme 2 h 30 (`sessionTimeBoundFor`).
 */
export const SESSION_TIME_BOUNDS = [30, 60, 90, 120, 150] as const;
export type SessionTimeBound = typeof SESSION_TIME_BOUNDS[number];

/**
 * ⟳ 2026-09-25 — LE TEMPS QU'UN REPAS DEMANDE DANS UNE SESSION, en minutes.
 *
 * ⚠️ UNE HYPOTHÈSE, PAS UNE MESURE, validée par le propriétaire le 2026-09-25,
 * puis ramenée de 12 à 10 le soir même: « trois sessions pour sept jours, une
 * heure doit suffire » (3 jours × 2 repas × 10 = 60). Une session de 2 h couvre
 * alors six jours de déjeuners et dîners. Les durées écrites par le
 * modèle ne peuvent pas la calibrer: il a annoncé 95 min pour une session unique
 * de dix préparations couvrant six jours. À ajuster à l'usage, ici et nulle part
 * ailleurs.
 *
 * ⛔ LE NOMBRE DE PERSONNES N'ENTRE PAS: ce sont les mêmes plats, dans de plus
 * grandes casseroles.
 */
export const MINUTES_PER_COOKED_MEAL = 10;

/**
 * ⟳ 2026-09-25 — « 30 MIN » N'EST PROPOSÉE QUE SI LA PLUS GROSSE SESSION COUVRE
 * AU PLUS CE NOMBRE DE JOURS. Décision du propriétaire: c'est le grand maximum,
 * la recette sera très simple (`cookingEffort` rend `simple`). Au-delà, même un
 * seul repas par jour ne tient pas en 30 min.
 */
export const SHORTEST_SESSION_MAX_DAYS = 2;

/**
 * ⟳ 2026-09-25 — LES REPAS CUISINÉS PAR JOUR: les déjeuners et dîners parmi les
 * moments de la maison. Petit-déjeuner et collations s'assemblent sans vraie
 * cuisson; ils ne comptent pas.
 *
 * ⚠️ AUCUN MOMENT CONNU ⇒ 2, parce que c'est ce que le moteur composera: son
 * rythme par défaut (`DEFAULT_EATING_RHYTHM`) porte un déjeuner et un dîner. Et
 * jamais moins de 1: une maison qui ne déclare qu'un petit-déjeuner cuisine
 * quand même.
 *
 * @param slots les moments de TOUTES les bouches, doublons permis.
 */
export function cookedMealsPerDay(slots: readonly string[]): number {
  if (slots.length === 0) return 2;
  const main = new Set(slots.filter((slot) => slot === "lunch" || slot === "dinner"));
  return Math.max(1, main.size);
}

/**
 * ⟳ 2026-09-25 — LE TEMPS MINIMUM D'UNE SESSION, en minutes.
 *
 *   ⌈jours ÷ sessions⌉ × repas cuisinés par jour × `MINUTES_PER_COOKED_MEAL`
 *
 * ⚠️ LA PLUS GROSSE SESSION, PAS LA MOYENNE. Le temps choisi vaut pour toutes
 * les sessions: sept jours en trois sessions, ce sont des tranches de 3, 2 et 2
 * jours (`deriveCookingPlan`, ④), et c'est celle de 3 qui doit tenir — 1 h,
 * pas 47 min.
 *
 * ⟳ 2026-09-25 — JAMAIS PLUS QUE 30 MIN QUAND LA SESSION COUVRE AU PLUS
 * `SHORTEST_SESSION_MAX_DAYS` JOURS: « 30 min » y est proposée même pour deux
 * jours de déjeuners et dîners (40 min au calcul), et le minimum le dit, sans
 * quoi le moteur relèverait le temps choisi.
 */
export function minimumSessionMinutes(input: {
  daysToEat: number;
  sessions: number;
  mealsPerDay: number;
}): number {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isFinite(value)) {
      throw new Error(`[keel/cooking_plan] ${name} non fini: ${JSON.stringify(value)}`);
    }
  }
  const days = Math.max(1, Math.floor(input.daysToEat));
  const sessions = Math.max(1, Math.floor(input.sessions));
  const meals = Math.max(1, Math.floor(input.mealsPerDay));
  const daysPerSession = Math.ceil(days / sessions);
  const raw = daysPerSession * meals * MINUTES_PER_COOKED_MEAL;
  return daysPerSession <= SHORTEST_SESSION_MAX_DAYS
    ? Math.min(raw, SESSION_TIME_BOUNDS[0])
    : raw;
}

/** La plus petite durée qui atteint `minutes` — la plus longue au-delà. */
export function sessionTimeBoundFor(minutes: number): SessionTimeBound {
  return SESSION_TIME_BOUNDS.find((bound) => bound >= minutes) ??
    SESSION_TIME_BOUNDS[SESSION_TIME_BOUNDS.length - 1];
}

/**
 * ⟳ 2026-09-25 — CE QUI A RETIRÉ DES SESSIONS DE L'OFFRE. Il existe pour être
 * DIT: une option grisée sans motif se lit comme une panne.
 *
 * Un seul motif aujourd'hui. Une fenêtre courte ne grise rien: elle retire les
 * nombres au-delà du nombre de jours, et « trois fois » pour deux jours ne se
 * cherche pas.
 */
export type CookingSessionsLimit =
  /** Sans congélateur, un plat ne tient que `maxFridgeDays` jours. */
  "freezer";

export interface CookingSessionsOffer {
  /** Ce que l'écran liste: de 1 au nombre de jours, `MAX_COOKING_SESSIONS` au plus. */
  shown: CookingSessionCount[];
  /** Ce qu'il laisse choisir, croissant. JAMAIS vide. Le reste de `shown` est grisé. */
  values: CookingSessionCount[];
  /** La seule réponse possible, ou `null` tant qu'il reste un choix. */
  forced: CookingSessionCount | null;
  /** Le plus petit nombre de sessions que le plan peut tenir. */
  minimum: number;
  limit: CookingSessionsLimit | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-25 — COMBIEN DE SESSIONS ON A LE DROIT DE PROPOSER.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   `max = min(MAX_COOKING_SESSIONS, jours)`
 *   `min = 1` avec congélateur, `⌈jours ÷ conservation⌉` sans
 *
 * La conservation est la même règle que `offerableGroceryRuns` et que la case
 * « tout cuisiner en une seule fois » qu'elle remplace: un plat cuisiné tient
 * `maxFridgeDays` jours, jour de cuisson compris. Sans congélateur, une seule
 * session sur sept jours laissait quatre journées qu'aucun lot n'atteint
 * (huit repas sur vingt et un jetés, mesuré le 2026-09-01).
 *
 * ⚠️ `null` (jamais demandé) COMPTE COMME « SANS », la porte de
 * `deriveCookingPlan`: on ne promet pas une semaine au congélateur à quelqu'un
 * dont on ignore s'il en a un.
 *
 * @param maxFridgeDays PASSÉE, jamais importée — voir `offerableGroceryRuns`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function offerableCookingSessions(input: {
  daysToEat: number;
  freezer: boolean | null;
  maxFridgeDays: number;
}): CookingSessionsOffer {
  if (input.freezer !== true && input.freezer !== false && input.freezer !== null) {
    throw new Error(
      "[keel/cooking_plan] `freezer` est REQUIS: true, false, ou null (jamais demandé) — " +
        "un `?` en ferait une garde désarmée",
    );
  }
  if (!Number.isFinite(input.daysToEat)) {
    throw new Error(`[keel/cooking_plan] daysToEat non fini: ${JSON.stringify(input.daysToEat)}`);
  }
  if (!Number.isFinite(input.maxFridgeDays) || input.maxFridgeDays < 1) {
    throw new Error(
      "[keel/cooking_plan] `maxFridgeDays` est REQUIS et >= 1: " +
        JSON.stringify(input.maxFridgeDays),
    );
  }
  const days = Math.max(1, Math.floor(input.daysToEat));
  const max = Math.min(MAX_COOKING_SESSIONS, days);
  const minimum = input.freezer === true
    ? 1
    : Math.min(max, Math.ceil(days / input.maxFridgeDays));
  const shown = COOKING_SESSION_COUNTS.filter((count) => count <= max);
  const values = shown.filter((count) => count >= minimum);
  return {
    shown,
    values,
    forced: values.length === 1 ? values[0] : null,
    minimum,
    limit: minimum > 1 ? "freezer" : null,
  };
}

export interface SessionTimeOffer {
  /** Les plages proposables, croissantes. JAMAIS vide. */
  values: SessionTimeBound[];
  /** Le minimum, en minutes. Il n'est jamais affiché: l'écran nomme `shortest`. */
  minimum: number;
  /** La plus courte plage proposable — celle que la phrase nomme. */
  shortest: SessionTimeBound;
  /** Les jours que couvre la plus grosse session. */
  daysPerSession: number;
}

/**
 * ⟳ 2026-09-25 — QUELLES DURÉES ON A LE DROIT DE PROPOSER.
 *
 * Une durée est proposée si elle atteint le minimum; « 30 min » seulement si la
 * plus grosse session couvre au plus `SHORTEST_SESSION_MAX_DAYS` jours. Les
 * durées plus longues le restent toujours: plus de temps, ce sont des recettes
 * plus élaborées (`cookingEffort`), pas une erreur. Jamais vide: si le minimum
 * dépassait 2 h 30, la plus longue resterait proposée.
 *
 * Le tableau validé le 2026-09-25 (déjeuner et dîner, durée la plus courte):
 *
 *   jours │ 1 fois  2 fois  3 fois  4 fois
 *     1   │ 30 min
 *     2   │ 30 min  30 min
 *     3   │ 1 h     30 min  30 min
 *     4   │ 1 h 30  30 min  30 min  30 min
 *     5   │ 2 h     1 h     30 min  30 min
 *     6   │ 2 h     1 h     30 min  30 min
 *     7   │ 2 h 30  1 h 30  1 h     30 min
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function offerableSessionTimes(input: {
  daysToEat: number;
  sessions: number;
  mealsPerDay: number;
}): SessionTimeOffer {
  const minimum = minimumSessionMinutes(input);
  const days = Math.max(1, Math.floor(input.daysToEat));
  const sessions = Math.max(1, Math.floor(input.sessions));
  const daysPerSession = Math.ceil(days / sessions);
  const fits = SESSION_TIME_BOUNDS.filter((bound) =>
    bound >= minimum &&
    (bound !== SESSION_TIME_BOUNDS[0] || daysPerSession <= SHORTEST_SESSION_MAX_DAYS)
  );
  const values: SessionTimeBound[] = fits.length > 0
    ? fits
    : [SESSION_TIME_BOUNDS[SESSION_TIME_BOUNDS.length - 1]];
  return {
    values,
    minimum,
    shortest: values[0],
    daysPerSession,
  };
}

/**
 * ⟳ 2026-09-25 — L'EFFORT, DÉDUIT DE LA MARGE entre le temps choisi et le
 * minimum. Il remplace le style pour la difficulté et la variété (décision du
 * propriétaire, 2026-09-25).
 *
 *   marge sous ×1,5  → `simple`  recettes courtes, des plats qui reviennent
 *   marge sous ×3    → `normal`
 *   au-delà          → `keen`    recettes élaborées, de la variété
 *
 * Exemples, pour sept jours et deux repas par jour: une session de « 2 h 30 »
 * (minimum 2 h 20) est `simple`; quatre sessions de « 1 h 30 » (minimum 30 min)
 * sont `keen`.
 *
 * ⚠️ `simple` PLAFONNE AUSSI LA FORME À UN SEUL PLAT (`generate-household-meal-v1`,
 * `styleCappedShape`), comme « le moins possible » avant lui: séparer les plats
 * coûte du temps que la personne n'a pas donné.
 */
export type CookingEffort = "simple" | "normal" | "keen";

export const EFFORT_MARGIN_NORMAL = 1.5;
export const EFFORT_MARGIN_KEEN = 3;

/**
 * Les deux réglages que le moteur lit déjà, par effort. Ce sont les
 * vocabulaires fermés de `recipe_difficulty` et `variety`: rien de neuf n'est
 * fabriqué, on les dérive d'une réponse qu'on sait donner.
 */
export const COOKING_EFFORT_PROFILE: Readonly<
  Record<CookingEffort, {
    readonly difficulty: "simple" | "normal" | "keen";
    readonly variety: "repeat" | "some" | "varied";
  }>
> = Object.freeze({
  simple: { difficulty: "simple", variety: "repeat" },
  normal: { difficulty: "normal", variety: "some" },
  keen: { difficulty: "keen", variety: "varied" },
});

export function cookingEffort(minutes: number, minimum: number): CookingEffort {
  if (!Number.isFinite(minutes) || !Number.isFinite(minimum)) {
    throw new Error(
      `[keel/cooking_plan] cookingEffort: ${JSON.stringify({ minutes, minimum })}`,
    );
  }
  const margin = minutes / Math.max(1, minimum);
  if (margin < EFFORT_MARGIN_NORMAL) return "simple";
  if (margin < EFFORT_MARGIN_KEEN) return "normal";
  return "keen";
}

// ---------------------------------------------------------------------------
// LA LECTURE DE `practical_constraints` — et le troisième état
// ---------------------------------------------------------------------------

/**
 * ⟳ 2026-09-25 — LE NOMBRE DE SESSIONS DEMANDÉ, ou `null` = pas de réponse.
 *
 * ⚠️ UN NOMBRE OU SA CHAÎNE, RIEN D'AUTRE. `Number(true)` vaut 1: sans le test
 * de type, un booléen venu du réseau deviendrait « une seule fois ».
 */
export function readCookingSessions(raw: unknown): CookingSessionCount | null {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const count = Number(raw);
  return (COOKING_SESSION_COUNTS as readonly number[]).includes(count)
    ? count as CookingSessionCount
    : null;
}

/**
 * ⟳ 2026-09-25 — LA PLAGE DE TEMPS DÉCLARÉE, lue dans `cooking_time_min`, ou
 * `null` = jamais répondu.
 *
 * ⚠️ UNE VALEUR HORS BORNE EST RAMENÉE À LA DURÉE AU-DESSUS, pas jetée. Les
 * comptes d'avant le 2026-09-25 portent 15, 30, 45, 120, 180 ou 240 (l'ancienne
 * question, la dérivation du style, puis les plages), et le chat peut écrire
 * 35: 35 devient « 1 h », 180 et 240 « 2 h 30 », la plus longue.
 * `0`, `NaN`, une chaîne vide ⇒ `null` — `Number(null)` vaut 0.
 */
export function readSessionTimeBound(
  pc: Record<string, unknown> | null | undefined,
): SessionTimeBound | null {
  const raw = pc?.cooking_time_min;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return sessionTimeBoundFor(minutes);
}

/**
 * LE NOMBRE DE COURSES DÉCLARÉ, ou `null` = jamais demandé.
 *
 * ⚠️ MÊME TROISIÈME ÉTAT QUE LE STYLE, et il compte plus encore ici: `0` est
 * une valeur JSON parfaitement écrivable, et `Number(null)` vaut `0`. Un
 * `!= null` laisserait passer « zéro course », c'est-à-dire un plan qu'on ne
 * peut pas faire.
 */
export function readGroceryRuns(
  pc: Record<string, unknown> | null | undefined,
): GroceryRuns | null {
  const raw = Number(pc?.grocery_runs);
  return (GROCERY_RUNS as readonly number[]).includes(raw)
    ? raw as GroceryRuns
    : null;
}

/**
 * LA RÉPONSE TELLE QU'ELLE A ÉTÉ DONNÉE — nombre, « peu importe », ou `null`.
 *
 * ⛔ CE LECTEUR-CI DISTINGUE TROIS ÉTATS; `readGroceryRuns` n'en distingue que
 * deux, ET C'EST VOULU. Les deux existent côte à côte parce qu'ils répondent à
 * deux questions différentes:
 *
 *   · `readGroceryRuns`       → « quel NOMBRE a été demandé ? » — `null` pour
 *                               « peu importe », qui n'en demande aucun.
 *   · `readGroceryRunsAnswer` → « la question a-t-elle une RÉPONSE ? » — c'est
 *                               celui que l'écran et la garde de l'entonnoir
 *                               lisent, sinon « peu importe » bloquerait le
 *                               parcours comme un champ vide.
 *
 * ⚠️ UN APPELANT QUI SE TROMPE DE LECTEUR NE PLANTE PAS, il se trompe en
 * silence — d'où les deux noms explicites plutôt qu'un drapeau.
 */
export function readGroceryRunsAnswer(
  pc: Record<string, unknown> | null | undefined,
): GroceryRunsAnswer | null {
  if (pc?.grocery_runs === GROCERY_RUNS_ANY) return GROCERY_RUNS_ANY;
  return readGroceryRuns(pc);
}

/**
 * CE QUE « PEU IMPORTE » VAUT POUR LE MOTEUR — LE HAUT DE L'OFFRE.
 *
 * ⛔ CONTRE L'OFFRE, ET PAS CONTRE LE PLAFOND DU STYLE — DÉFAUT MESURÉ LE
 * 2026-09-09, SIGNALÉ AVANT D'AVOIR MORDU EN RÉEL.
 *
 * Première version: « peu importe » valait `COOKING_STYLE_PROFILE[style]
 * .sessionCap`. Le style, tout seul, ne sait rien de la FENÊTRE. Mesuré, en
 * `balanced`:
 *
 *     plan     l'écran offre    résolvait à    le plan sortait
 *     2 jours  [1]              3              runs=2 + note « raboté »
 *     3 jours  [1]              3              runs=3, AUCUNE note
 *     5 jours  [1, 2]           3              runs=3, AUCUNE note
 *
 * Deux défauts, et le second est le pire. À 2 jours, la note
 * `runs_capped_by_sessions` dit « tu en as demandé plus, j'ai raboté » à
 * quelqu'un qui n'a RIEN demandé — c'est le sens même de « peu importe ». À 3
 * et 5 jours, rien ne rabote: trois passages au magasin pour un plan que
 * l'écran annonce couvrable en une seule course, et pas une phrase pour
 * l'expliquer.
 *
 * ⚠️ LA CORRECTION N'EST PAS UNE SECONDE RÈGLE. On lit `offerableGroceryRuns`
 * — LA MÊME fonction que le champ à l'écran — et on prend le haut de sa liste.
 * L'écran et le moteur ne peuvent donc plus diverger par construction: « peu
 * importe » vaut exactement « le maximum de ce qu'on m'aurait proposé ».
 * Recopier ici `min(styleCap, ceil(jours / conservation))` aurait refait le
 * jumeau que ce dépôt a déjà supprimé une fois.
 *
 * ⛔ ET LES RABOTS FINS RESTENT EN AVAL. `deriveCookingPlan` borne encore
 * (`runs <= sessions`, congélateur) et NOMME chaque coup. Résoudre au haut de
 * l'offre ne saute aucune garde: ça donne au moteur la marge que la personne
 * lui laisse, sans lui faire dire qu'elle a réclamé quoi que ce soit.
 */
export function resolveGroceryRunsAnswer(
  answer: GroceryRunsAnswer | null,
  offer: GroceryRunsOffer,
): GroceryRuns | null {
  if (answer === null) return null;
  if (answer !== GROCERY_RUNS_ANY) return answer;
  // ⚠️ UNE OFFRE VIDE N'EXISTE PAS (le module en rend toujours au moins une),
  // mais s'y fier sans le dire ferait un `undefined` silencieux dans un champ
  // qui décide du nombre de courses.
  const top = offer.values[offer.values.length - 1];
  return top ?? null;
}

// ---------------------------------------------------------------------------
// LA DÉRIVATION
// ---------------------------------------------------------------------------

/**
 * CE QUE LA DÉRIVATION A DÛ CORRIGER, EN VOCABULAIRE FERMÉ.
 *
 * ⛔ CHAQUE NOTE EST UNE PHRASE DE `plan_rationale` (rang 2 de
 * `SYNTHESE-GENERATION-PLAN.md §6`: rien de dérivé ne part sans une ligne). Une
 * note sans phrase se lit comme un bug; une phrase sans note serait une
 * affirmation que rien ne produit.
 *
 * ⟳ 2026-09-25 — `style_caps_sessions` A ÉTÉ RETIRÉE avec le style: plus rien
 * ne plafonne les sessions sous ce que la personne a demandé, hormis la
 * fenêtre.
 */
export type CookingPlanNote =
  /** « 1 course » demandait le congélateur, il n'est pas déclaré ⇒ 2 courses. */
  | "runs_1_needs_freezer"
  /** La fenêtre est trop courte pour autant de sessions que demandé. */
  | "days_cap_sessions"
  /**
   * ⟳ LOT C (2026-09-04) — les courses demandées dépassaient les sessions, et
   * le plan les a ramenées. On ne va pas au magasin plus souvent qu'on ne
   * cuisine: c'est l'invariant `runs <= sessions`, tranché par l'utilisateur.
   */
  | "runs_capped_by_sessions"
  /**
   * ⟳ LOT 3 (2026-09-06) — des jours de cuisine DÉCLARÉS tombent dans la fenêtre :
   * ils placent les sessions et en fixent le nombre.
   */
  | "cook_days_declared"
  /** ⟳ LOT 3 — des jours déclarés, mais aucun dans la fenêtre : la dérivation s'applique, et c'est dit. */
  | "cook_days_out_of_window"
  /**
   * ⟳ 2026-09-25 — moins de sessions que le frigo n'en permet sans congélateur:
   * le plan en ajoute jusqu'au minimum. L'écran ne le propose pas; la note
   * existe pour une demande qui arrive par le réseau.
   */
  | "sessions_need_freezer"
  /**
   * ⟳ 2026-09-25 — la plage choisie ne suffit pas à la plus grosse session: le
   * plan prend la plus courte qui suffit. Même motif que la note précédente.
   */
  | "time_raised_to_minimum";

export interface CookingPlan {
  /** Combien de fois on cuisine. `1..MAX_COOKING_SESSIONS`. */
  sessions: number;
  /** Les jours de cuisine, en jetons, dans l'ordre du plan. */
  cookDays: DayToken[];
  /**
   * ⟳ LOT C (2026-09-04) — COMBIEN DE FOIS LE PLAN VA AU MAGASIN, borné par
   * les sessions: `runs <= sessions`, toujours.
   *
   * ⚠️ CE N'EST PAS « la personne n'ira pas plus souvent ». Elle en a le droit,
   * et `unusedGroceryRuns` compte exactement cet écart pour que la rationale le
   * DISE. Ce nombre est ce que le PLAN organise — les vagues de la liste de
   * courses — pas ce que quelqu'un a le droit de faire de sa semaine.
   */
  runs: GroceryRuns;
  /** Ce qui part dans `cooking_time_min`: la borne haute de la plage retenue. */
  sessionMinutes: number;
  /** ⟳ 2026-09-25 — le minimum de la plus grosse session (`minimumSessionMinutes`). */
  minimumMinutes: number;
  /** ⟳ 2026-09-25 — la marge entre les deux (`cookingEffort`). */
  effort: CookingEffort;
  difficulty: "simple" | "normal" | "keen";
  variety: "repeat" | "some" | "varied";
  /**
   * ⚠️ « CE PLAN S'APPUIE SUR LE CONGÉLATEUR », pas « il y en a un ». Vrai quand
   * une seule session couvre plus de jours que le frigo n'en tient, ou quand on
   * fait les courses moins souvent qu'on ne cuisine.
   */
  usesFreezer: boolean;
  notes: CookingPlanNote[];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE PLAN DE CUISINE D'UNE FENÊTRE — sessions, jours, minutes, difficulté.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LA RÈGLE ⟳ 2026-09-25 ─────────────────────────────────────────────────
 *   `sessions = la réponse`, relevée au minimum de la conservation, bornée
 *               aux jours mangés
 *   `runs     = min(coursesDemandées, sessions)`, et « 1 course » exige le
 *               congélateur — sinon deux, et on le DIT
 *   `minutes  = la plage choisie`, relevée à la plus courte qui suffit
 *   `effort   = la marge entre les deux`
 *
 * Avant le 2026-09-25, le STYLE semait les sessions et les minutes; il n'existe
 * plus (voir l'en-tête du module).
 *
 * ── CE QUI A ÉTÉ RENVERSÉ LE 2026-09-04, ET QUI TIENT TOUJOURS ────────────
 * Jusqu'au 2026-09-04, `runs` SEMAIT les sessions: « une seule course » forçait
 * « une seule session ». Cette règle interdisait la configuration que le
 * congélateur sert: on achète tout le dimanche, on CONGÈLE ce dont mercredi
 * aura besoin, et on cuisine deux fois. L'invariant tranché est
 * **`runs <= sessions`**: on ne va pas au magasin plus souvent qu'on ne
 * cuisine, et les courses ne décident plus des sessions.
 *
 * ── OÙ TOMBENT LES JOURS DE CUISINE ───────────────────────────────────────
 * La première session est au **rang 0** de la fenêtre — **la veille** quand il
 * y en a une (A1, 2026-09-03). Les suivantes découpent les jours MANGÉS en
 * tranches aussi égales que possible, et cuisinent le premier jour de chacune.
 * La plus grosse tranche fait ⌈jours ÷ sessions⌉ jours: c'est elle que
 * `minimumSessionMinutes` mesure.
 *
 * ⚠️ SUR LES JOURS MANGÉS, PAS SUR LE CALENDRIER NU. `daysToEat` est ce que
 * l'appelant a réellement à couvrir.
 *
 * @param windowDays la fenêtre ENTIÈRE en jetons, rang 0 en tête (la veille
 *   quand il y en a une). REQUIS: ce module ne sait pas dater.
 * @param leadDay `true` quand le rang 0 est un jour de CUISINE SANS REPAS
 *   (P1). Il change le découpage: les tranches portent sur les jours mangés,
 *   qui commencent au rang 1.
 * @param freezer `true`/`false` déclaré, `null` = jamais demandé. `null` et
 *   `false` refusent tous deux une session qui couvre plus que le frigo: on ne
 *   promet pas une semaine au congélateur à quelqu'un dont on ignore s'il en a
 *   un.
 */
export function deriveCookingPlan(input: {
  /** ⟳ 2026-09-25 — combien de fois la personne veut cuisiner. REQUIS. */
  sessions: CookingSessionCount;
  /** ⟳ 2026-09-25 — la borne haute de la plage choisie. REQUIS. */
  minutes: SessionTimeBound;
  /** ⟳ 2026-09-25 — `cookedMealsPerDay` sur les moments de la maison. REQUIS. */
  mealsPerDay: number;
  runs: GroceryRuns;
  freezer: boolean | null;
  windowDays: readonly DayToken[];
  leadDay: boolean;
  daysToEat: number;
  /**
   * ⟳ LOT 3 (2026-09-06) — LES JOURS QUE LA PERSONNE A DONNÉS (« les jours où vous
   * cuisinez », `practical_constraints.cook_days`). Optionnel : un appelant qui
   * ne les porte pas obtient la dérivation sans eux.
   *
   * ⛔ D2.4 EST RENVERSÉ ICI, ET LA RAISON EST MESURÉE. La dérivation avait
   * remplacé les jours déclarés parce que « l'écran écrit `[]` » ; M13 (duo,
   * 05/09) déclarait le dimanche et recevait trois sessions dim/mar/jeu sans
   * qu'une phrase le dise. Un jour déclaré est un fait de la maison, pas une
   * suggestion : il place la session, et tout écart est nommé.
   */
  declaredCookDays?: readonly string[];
  /** `MAX_FRIDGE_DAYS`, PASSÉE — ce module ne l'importe pas. REQUIS. */
  maxFridgeDays: number;
}): CookingPlan {
  if (!(COOKING_SESSION_COUNTS as readonly number[]).includes(input.sessions)) {
    throw new Error(
      `[keel/cooking_plan] sessions hors 1..${MAX_COOKING_SESSIONS}: ${JSON.stringify(input.sessions)}`,
    );
  }
  if (!(SESSION_TIME_BOUNDS as readonly number[]).includes(input.minutes)) {
    throw new Error(`[keel/cooking_plan] minutes hors plages: ${JSON.stringify(input.minutes)}`);
  }
  if (!Number.isFinite(input.mealsPerDay) || input.mealsPerDay < 1) {
    throw new Error(
      `[keel/cooking_plan] mealsPerDay est REQUIS et >= 1: ${JSON.stringify(input.mealsPerDay)}`,
    );
  }
  if (!(GROCERY_RUNS as readonly number[]).includes(input.runs)) {
    throw new Error(`[keel/cooking_plan] runs hors 1..3: ${JSON.stringify(input.runs)}`);
  }
  if (typeof input.leadDay !== "boolean") {
    throw new Error("[keel/cooking_plan] `leadDay` est REQUIS et booléen");
  }
  if (input.freezer !== true && input.freezer !== false && input.freezer !== null) {
    throw new Error(
      "[keel/cooking_plan] `freezer` est REQUIS: true, false, ou null (jamais demandé) — " +
        "un `?` en ferait une garde désarmée",
    );
  }

  const notes: CookingPlanNote[] = [];
  const eaten = Math.max(1, Math.round(input.daysToEat));

  // ── ① LES SESSIONS DEMANDÉES, bornées par la conservation et la fenêtre ──
  // ⛔ LA MÊME OFFRE QUE L'ÉCRAN, pas une seconde règle. Ce que l'écran grise,
  // le moteur le relève — et le dit.
  const offer = offerableCookingSessions({
    daysToEat: eaten,
    freezer: input.freezer,
    maxFridgeDays: input.maxFridgeDays,
  });
  let wanted: number = input.sessions;
  if (wanted < offer.minimum) {
    wanted = offer.minimum;
    notes.push("sessions_need_freezer");
  }
  // Deux sessions sur deux jours mangés est déjà limite; trois est impossible.
  // Le refus est nommé plutôt que silencieux: sinon deux jours de cuisine
  // tomberaient sur la même date et `planGroceryWaves` rendrait une vague de
  // moins que ce que la rationale annonce.
  if (wanted > eaten) {
    wanted = eaten;
    notes.push("days_cap_sessions");
  }

  // ── ② LES JOURS DÉCLARÉS (LOT 3), dans l'ordre de la fenêtre, dédoublonnés ──
  const declared = [
    ...new Set(
      (input.declaredCookDays ?? []).filter((d) => (DAY_TOKENS as readonly string[]).includes(d)),
    ),
  ] as DayToken[];
  const declaredInWindow = input.windowDays.filter((d, i, all) =>
    declared.includes(d) && all.indexOf(d) === i
  );
  let useDeclared = false;
  if (declared.length > 0) {
    if (declaredInWindow.length > 0) {
      useDeclared = true;
      notes.push("cook_days_declared");
      wanted = Math.min(declaredInWindow.length, MAX_COOKING_SESSIONS);
      if (wanted > eaten) {
        wanted = eaten;
        if (!notes.includes("days_cap_sessions")) notes.push("days_cap_sessions");
      }
    } else {
      notes.push("cook_days_out_of_window");
    }
  }
  const sessions = Math.max(1, wanted);

  // ── ③ LES COURSES, BORNÉES PAR LES SESSIONS ⟳ LOT C ────────────────────
  // ⛔ LA PORTE DU CONGÉLATEUR EST CELLE QUI EXISTE, pas une quatrième.
  // `hasFreezerDeclared` vit dans `kitchen_equipment.ts` et l'appelant la lit;
  // ici on ne fait que constater son verdict (`freezerMirror.int.test.ts`).
  //
  // « Une seule course » sans congélateur reste impossible sur un plan long —
  // rien ne tiendrait sept jours au frais —, et le remède est d'aller au
  // magasin une seconde fois, pas de cuisiner une fois de moins.
  //
  // ⟳ 2026-09-25 — SEULEMENT AU-DELÀ DE CE QUE LE FRIGO TIENT, comme l'offre
  // (`offerableGroceryRuns`, ②bis). En deçà, l'écran dit « une seule course:
  // ce que tu cuisines au départ tient jusqu'à la fin », et le moteur en
  // organisait deux dès qu'il y avait deux sessions — écart connu depuis le
  // 2026-09-24, devenu courant quand le nombre de sessions est demandé.
  let runs: number = input.runs;
  if (runs === 1 && input.freezer !== true && eaten > input.maxFridgeDays) {
    runs = 2;
    notes.push("runs_1_needs_freezer");
  }
  if (runs > sessions) {
    runs = sessions;
    notes.push("runs_capped_by_sessions");
  }

  // ── ④ LES JOURS ─────────────────────────────────────────────────────────
  const days = [...input.windowDays];
  const lead = input.leadDay && days.length > 0 ? 1 : 0;
  const derivedCookDays: DayToken[] = [];
  for (let i = 0; i < sessions; i++) {
    // La PREMIÈRE session est au rang 0 — la veille quand il y en a une.
    const index = i === 0 ? 0 : lead + Math.floor((i * eaten) / sessions);
    const token = days[Math.min(index, days.length - 1)];
    if (token !== undefined && !derivedCookDays.includes(token)) derivedCookDays.push(token);
  }
  // ⟳ LOT 3 — déclarés dans la fenêtre : ce sont eux, bornés au nombre de sessions.
  const cookDays: DayToken[] = useDeclared ? declaredInWindow.slice(0, sessions) : derivedCookDays;

  // ── ⑤ LES MINUTES, ET L'EFFORT QU'ELLES LAISSENT ⟳ 2026-09-25 ──────────
  // ⚠️ PLUS DE « ×2 POUR UNE SESSION UNIQUE ». Il existait parce que le style
  // donnait le même budget à une session qui porte trois jours et à une qui en
  // porte sept. Le minimum compte maintenant les jours de la plus grosse
  // session: une session unique sur sept jours n'a plus de durée sous 2 h 30.
  // Le dépassement toléré sur ce que le modèle ÉCRIT reste l'affaire de
  // `plan_feasibility.ts` (`SESSION_OVERRUN_FACTOR`).
  //
  // ⟳ 2026-09-25 — LE RELÈVEMENT LIT L'OFFRE, pas le seul minimum: « 30 min »
  // a aussi une limite en jours (`SHORTEST_SESSION_MAX_DAYS`). C'est la même
  // fonction que l'écran, donc une durée proposée n'est jamais relevée.
  const minimumMinutes = minimumSessionMinutes({
    daysToEat: eaten,
    sessions,
    mealsPerDay: input.mealsPerDay,
  });
  const timeOffer = offerableSessionTimes({
    daysToEat: eaten,
    sessions,
    mealsPerDay: input.mealsPerDay,
  });
  let sessionMinutes: number = input.minutes;
  if (!(timeOffer.values as readonly number[]).includes(sessionMinutes)) {
    sessionMinutes = timeOffer.shortest;
    notes.push("time_raised_to_minimum");
  }
  const effort = cookingEffort(sessionMinutes, minimumMinutes);

  return {
    sessions,
    runs: runs as GroceryRuns,
    cookDays,
    sessionMinutes,
    minimumMinutes,
    effort,
    difficulty: COOKING_EFFORT_PROFILE[effort].difficulty,
    variety: COOKING_EFFORT_PROFILE[effort].variety,
    // ⚠️ « CE PLAN S'APPUIE SUR LE CONGÉLATEUR », pas « il y en a un ».
    //
    // ⟳ 2026-09-25 — UNE SESSION UNIQUE NE S'APPUIE SUR LUI QUE SI ELLE COUVRE
    // PLUS QUE LE FRIGO. Avant, `sessions === 1` suffisait: une session unique
    // sur deux jours, congélateur déclaré, faisait congeler un plat qui tenait
    // très bien au frigo.
    //
    // ⟳ LOT C · L'AUTRE MOITIÉ: on s'appuie AUSSI sur le congélateur quand on
    // fait les courses moins souvent qu'on ne cuisine — le cru de la session
    // suivante est acheté d'avance, donc congelé à l'achat.
    usesFreezer: input.freezer === true &&
      ((sessions === 1 && eaten > input.maxFridgeDays) || runs < sessions),
    notes,
  };
}

/**
 * L'ÉCART DE COURSES QUE LE PLAFOND LAISSE — ou `0`.
 *
 * « Trois courses, deux sessions » n'est PAS une erreur: la troisième course
 * est du frais du jour, et la personne a le droit d'y aller. Ce que la
 * rationale doit dire, c'est que le plan n'en a **pas besoin** — sinon deux
 * vagues de courses sous une réponse « trois » se lisent comme une option
 * ignorée.
 *
 * ⚠️ IL SE COMPTE SUR `runs`, PAS SUR `wanted`: le congélateur manquant a déjà
 * poussé « 1 » vers « 2 », et cet écart-là porte son propre nom
 * (`runs_1_needs_freezer`). Les confondre ferait dire « une course de trop »
 * à quelqu'un qui en avait demandé une seule.
 */
export function unusedGroceryRuns(runs: GroceryRuns, plan: CookingPlan): number {
  // ⟳ LOT C — CONTRE `plan.runs`, PLUS CONTRE `plan.sessions`. Les deux étaient
  // le même nombre tant que les courses semaient les sessions; ils ont divergé
  // avec le renversement, et c'est bien l'écart entre CE QUI A ÉTÉ DEMANDÉ et
  // CE QUE LE PLAN ORGANISE que la rationale doit dire.
  return Math.max(0, runs - plan.runs);
}

// ---------------------------------------------------------------------------
// CE QU'ON A LE DROIT DE PROPOSER — l'offre, 2026-09-04
// ---------------------------------------------------------------------------

/**
 * CE QUI A RESSERRÉ LA LISTE. Il existe pour être DIT, jamais pour être deviné
 * à l'écran: une option qui disparaît sans motif se lit comme une panne.
 */
export type GroceryRunsLimit =
  /** Une seule session de cuisine est demandée. */
  | "one_session"
  /** La fenêtre est plus courte que trois jours. */
  | "days"
  /**
   * ⟳ 2026-09-25 — Moins de sessions que trois: on ne va pas au magasin plus
   * souvent qu'on ne cuisine. Il remplace le motif `style`.
   */
  | "sessions";
// ⟳ 2026-09-25 — LE MOTIF `freezer` A ÉTÉ RETIRÉ (décision du propriétaire).
// Sans congélateur, « une course » reste hors de l'offre au-delà de ce que le
// frigo tient, mais le champ Courses ne le dit plus: « Combien de fois tu veux
// cuisiner », juste au-dessus, parle déjà du congélateur, et la phrase répétée
// sous Courses renvoyait vers une case pour « tout acheter en une fois ».

export interface GroceryRunsOffer {
  /**
   * Les cadences proposables, croissantes. JAMAIS vide. `1` en sort sans
   * congélateur sur un plan plus long que la conservation — sans motif propre
   * (voir `GroceryRunsLimit`).
   */
  values: GroceryRuns[];
  /** La seule réponse possible, ou `null` tant qu'il reste un choix. */
  forced: GroceryRuns | null;
  /** Ce qui a resserré, ou `null` quand les trois tiennent. */
  limit: GroceryRunsLimit | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMBIEN DE COURSES ON A LE DROIT DE PROPOSER — et quand il n'y a plus rien
 * à demander.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QU'ELLE FERME ───────────────────────────────────────────────
 * L'écran proposait les TROIS cadences à tout le monde, puis le moteur
 * rabotait en silence (`deriveCookingPlan` plafonne), et la personne lisait
 * dans l'explication du plan le refus d'une option qu'on lui avait proposée.
 *
 * ── LA RÈGLE, EN UNE LIGNE ⟳ 2026-09-25 ───────────────────────────────────
 *   `max = min(3, sessions, ⌈jours ÷ conservation⌉)`, et `1` pour une seule
 *   session.
 *
 * Les sessions sont celles que la personne vient de choisir juste au-dessus;
 * elles remplacent le plafond du style.
 *
 * ── ⚠️ LE PLAFOND DE FENÊTRE N'EST PAS « LE NOMBRE DE JOURS » ─────────────
 * Il l'a été une demi-journée, le 2026-09-04, et c'était faux — mesuré à
 * l'écran sur un plan du 4 au 5 septembre: DEUX courses proposées pour DEUX
 * jours, alors qu'un seul lot les couvre tous les deux. La vraie question est
 * « combien il en FAUT », et c'est la CONSERVATION qui la tranche: un plat
 * cuisiné tient `maxFridgeDays` jours (jour de cuisson compris, décision
 * produit n° 14).
 *
 * ⛔ ELLE EST LE MIROIR DE `deriveCookingPlan`, PAS UNE SECONDE RÈGLE, et
 * c'est pour ça qu'elle vit dans CE fichier. Écrite dans le composant, elle
 * aurait recopié `2` et `3` en dur — le jumeau que ce dépôt a déjà supprimé une
 * fois (`groceryWaves.ts`, 2026-08-10).
 *
 * ── ⚠️ CE QU'ELLE COÛTE ───────────────────────────────────────────────────
 * `unusedGroceryRuns` existe pour dire « trois courses, deux sessions n'est
 * PAS une erreur ». Cette offre REND CE CAS INATTEIGNABLE depuis l'écran (décision
 * produit du 2026-09-04). `unusedGroceryRuns` reste appelée: une réponse
 * « trois » déjà enregistrée n'est jamais effacée.
 *
 * ⟳ 2026-09-24 — SANS CONGÉLATEUR, « une course » n'est plus PROPOSÉE dès que
 * le plan dépasse ce qu'un plat cuisiné tient au frigo (`daysToEat >
 * maxFridgeDays`). La porte lit `freezer !== true`, la même que
 * `deriveCookingPlan` (③): `null` (jamais demandé) compte comme « sans ».
 *
 * @param sessions les sessions CHOISIES À L'ÉCRAN, `null` = pas encore
 *   répondu ⇒ aucun plafond. C'est une intention de semaine, et l'offre suit ce
 *   que la personne vient de dire, pas ce que le moteur en fera.
 * @param daysToEat combien de jours la fenêtre demande.
 * @param maxFridgeDays `MAX_FRIDGE_DAYS` — combien de jours un plat cuisiné
 *   tient, jour de cuisson compris.
 *
 *   ⛔ PASSÉE, JAMAIS IMPORTÉE, et c'est la posture EXPLICITE de ce dépôt
 *   (`fridge_window.ts`, en-tête): la constante vit dans `meal_generation.ts`
 *   depuis l'origine et cinq fichiers la ré-exportent. En importer une ici
 *   ferait entrer tout le moteur dans le paquet du navigateur — ce module est
 *   monté par des composants React —, et la redéclarer en ferait une SECONDE
 *   définition, « celle qu'on regarde le moins qui garde l'ancienne ».
 *   Côté test, elle est épinglée par un LITTÉRAL: paramétrer le test par sa
 *   propre constante le laisserait vert le jour où elle change.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function offerableGroceryRuns(input: {
  sessions: number | null;
  daysToEat: number;
  maxFridgeDays: number;
  /** LE CONGÉLATEUR, REQUIS: `true`, `false`, ou `null` (jamais demandé). */
  freezer: boolean | null;
}): GroceryRunsOffer {
  if (input.freezer !== true && input.freezer !== false && input.freezer !== null) {
    throw new Error(
      "[keel/cooking_plan] `freezer` est REQUIS: true, false, ou null (jamais demandé) — " +
        "un `?` en ferait une garde désarmée",
    );
  }
  if (!Number.isFinite(input.daysToEat)) {
    throw new Error(
      `[keel/cooking_plan] daysToEat non fini: ${JSON.stringify(input.daysToEat)}`,
    );
  }
  if (!Number.isFinite(input.maxFridgeDays) || input.maxFridgeDays < 1) {
    throw new Error(
      "[keel/cooking_plan] `maxFridgeDays` est REQUIS et >= 1: " +
        JSON.stringify(input.maxFridgeDays),
    );
  }
  if (input.sessions !== null && !Number.isFinite(input.sessions)) {
    throw new Error(
      "[keel/cooking_plan] `sessions` est REQUIS: un nombre, ou `null` (pas encore répondu) — " +
        JSON.stringify(input.sessions),
    );
  }

  // Le plafond de l'OFFRE est celui des courses (trois), pas celui des
  // sessions (quatre): une quatrième session mange la troisième course.
  let max: number = GROCERY_RUNS[GROCERY_RUNS.length - 1];
  let limit: GroceryRunsLimit | null = null;

  // ── ① LES SESSIONS PLAFONNENT, quand elles ont été choisies ─────────────
  // On ne va pas au magasin plus souvent qu'on ne cuisine (`runs <= sessions`).
  if (input.sessions !== null && input.sessions < max) {
    max = Math.max(1, Math.floor(input.sessions));
    limit = "sessions";
  }

  // ── ② LA CONSERVATION PLAFONNE AUSSI ────────────────────────────────────
  // ⛔ COMBIEN DE COURSES IL EN FAUT, pas combien il en tiendrait.
  //
  // ⚠️ `<=` ET PAS `<`, ET C'EST LE MOTIF QUI EST LU À L'ÉCRAN. Quand les deux
  // plafonds tombent sur le même nombre, c'est la FENÊTRE qu'on nomme: elle
  // est concrète, datée, et la personne vient de la régler plus haut.
  const days = Math.max(1, Math.floor(input.daysToEat));
  const needed = Math.ceil(days / input.maxFridgeDays);
  if (needed < GROCERY_RUNS[GROCERY_RUNS.length - 1] && needed <= max) {
    max = needed;
    limit = "days";
  }

  // ── ②bis SANS CONGÉLATEUR, « UNE COURSE » NE COUVRE PAS UN PLAN LONG ─────
  // ⟳ 2026-09-24 — décision produit. Le plancher passe à 2; `needed >= 2`
  // garantit qu'il reste au moins une cadence.
  //
  // ⟳ 2026-09-25 — IL NE NOMME PLUS RIEN. Le motif reste celui qui a raboté
  // le haut (fenêtre ou sessions): c'est lui que la phrase sous le champ dit.
  // Le congélateur est déjà dit par « Combien de fois tu veux cuisiner ».
  let min = 1;
  if (input.freezer !== true && days > input.maxFridgeDays) {
    min = 2;
  }

  // ── ③ UNE SEULE SESSION TRANCHE, ET ELLE PASSE DERNIÈRE ─────────────────
  // Une seule cuisson veut dire une seule vague de courses: le module des
  // vagues ne sait pas en produire plus d'une par session. Elle gagne sur les
  // autres motifs parce que c'est la réponse que la personne vient de donner
  // juste au-dessus — et elle garde la liste non vide quand une réponse
  // impossible (une session, sept jours, pas de congélateur) est encore à
  // l'écran.
  if (input.sessions === 1) {
    max = 1;
    min = 1;
    limit = "one_session";
  }

  const values = GROCERY_RUNS.filter((runs) => runs >= min && runs <= max);
  return {
    values,
    forced: values.length === 1 ? values[0] : null,
    limit,
  };
}

/**
 * LES JOURS DE FRIGO QUE LE DÉCOUPAGE DEMANDE À TENIR — le plus long écart
 * entre deux sessions, en jours.
 *
 * Il n'est PAS une garde: `grocery_waves.ts` décide déjà quand acheter quoi, et
 * un écart long veut simplement dire que la vague suivante portera le frais.
 * Il existe pour la rationale et pour les tests, qui doivent pouvoir dire
 * « cette découpe demande cinq jours de conservation » sans recalculer les
 * rangs.
 */
export function longestFridgeStretch(
  plan: CookingPlan,
  windowDays: readonly DayToken[],
): number {
  const ranks = plan.cookDays
    .map((d) => windowDays.indexOf(d))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (ranks.length === 0) return 0;
  let longest = windowDays.length - ranks[ranks.length - 1];
  for (let i = 1; i < ranks.length; i++) {
    longest = Math.max(longest, ranks[i] - ranks[i - 1]);
  }
  return longest;
}

// ---------------------------------------------------------------------------
// CE QUE LES DEUX LANES LISENT — une seule résolution, appelée deux fois
// ---------------------------------------------------------------------------

/** Ce que `readCookingCapacity` rend aujourd'hui, dans les deux lanes. */
export interface DeclaredCookingCapacity {
  cookDays: string[];
  cookingTimeMin: number | null;
  recipeDifficulty: string | null;
  variety: string | null;
  /**
   * ⚠️ IL TRAVERSE SANS ÊTRE TOUCHÉ, et il est dans le type EXPRÈS. Le budget
   * n'a rien à voir avec la cuisine, mais il vit dans le même objet
   * chez les deux appelants: l'omettre du type obligerait chacun à recomposer
   * `{...capacity, ...resolved}` à la main, et c'est très exactement le genre
   * de recopie où un champ se perd en silence.
   */
  budgetAmount: number | null;
}

export interface ResolvedCookingCapacity extends DeclaredCookingCapacity {
  /**
   * LE PLAN DÉRIVÉ, ou `null` = **une des trois réponses manque** (sessions,
   * plage de temps, courses).
   *
   * `null` rend les champs déclarés tels quels, et aucune phrase de rationale
   * ne s'ajoute.
   */
  plan: CookingPlan | null;
  /**
   * ⟳ LOT C (2026-09-04) — `impliesOneSession` A ÉTÉ RETIRÉ, PAS OUBLIÉ.
   *
   * Il portait « une seule course vaut tout dans une session ». C'est
   * exactement la règle que ce lot renverse: acheter une fois n'oblige plus à
   * cuisiner une fois, parce qu'un congélateur déclaré permet d'acheter le
   * dimanche et de cuisiner aussi le mercredi. ⟳ 2026-09-25 — la demande
   * explicite est `cooking_sessions = 1`, lue par l'appelant.
   *
   * ⛔ On ne le garde pas à `false`: un champ toujours faux est une garde
   * désarmée qui ressemble à une garde. Cette fonction ne reçoit pas la case
   * explicite, donc elle ne peut plus répondre à cette question — elle se tait.
   */
}

/**
 * LES RÉPONSES, APPLIQUÉES À CE QUI EST DÉCLARÉ.
 *
 * ⛔ UNE SEULE RÉSOLUTION. `readCookingCapacity` a longtemps été dupliquée
 * entre deux lanes sans test qui les compare; la dérivation, elle, vit ici et
 * nulle part ailleurs.
 *
 * ── CE QUI CHANGE, ET CE QUI NE CHANGE PAS ────────────────────────────────
 *   · `cookDays` devient la DÉRIVATION (rang 0 = la veille, puis les tranches);
 *     c'est ce qui réveille `cookDayLines`, `daysOutOfBatchReach` et
 *     `weeklyCookingMinutes`;
 *   · `cookingTimeMin` devient la plage retenue (relevée au minimum si besoin);
 *   · `recipeDifficulty` et `variety` deviennent CELLES DE L'EFFORT.
 *
 * ⚠️ **UN `...spread` REND UN CHAMP INVISIBLE À `grep`.** Les deux derniers
 * voyagent par `...capacity` jusqu'à `buildMealPrompt`, qui les émet en toutes
 * lettres (« recipe level they want: … », « repetition they accept: … »). Les
 * laisser déclarés ferait dire au prompt « recettes simples » à quelqu'un qui
 * vient de donner trois heures pour deux jours de repas.
 *
 * ⛔ SANS LES TROIS RÉPONSES, RIEN NE CHANGE. Sessions, plage ou courses
 * absentes ⇒ `plan: null`, et les champs déclarés ressortent tels quels.
 *
 * @param freezer déjà réduit à un booléen par `hasFreezerDeclared` chez
 *   l'appelant — « pas de congélateur » et « jamais demandé » y rendent le
 *   même `false`, et c'est la direction fail-closed voulue.
 */
export function resolveCookingCapacity(input: {
  declared: DeclaredCookingCapacity;
  /** ⟳ 2026-09-25 — `readCookingSessions(body.cooking_sessions)`. */
  sessions: CookingSessionCount | null;
  /**
   * ⟳ 2026-09-09 — ACCEPTE « peu importe » EN PLUS D'UN NOMBRE. La résolution
   * se fait ICI et nulle part ailleurs, contre l'offre que l'écran a montrée.
   */
  runs: GroceryRunsAnswer | null;
  freezer: boolean;
  windowDays: readonly DayToken[];
  leadDay: boolean;
  daysToEat: number;
  /** ⟳ 2026-09-25 — `cookedMealsPerDay` sur les moments de la maison. REQUIS. */
  mealsPerDay: number;
  /** La conservation, REÇUE — ce module ne l'importe pas (voir son en-tête). */
  maxFridgeDays: number;
}): ResolvedCookingCapacity {
  const runs = resolveGroceryRunsAnswer(
    input.runs,
    offerableGroceryRuns({
      sessions: input.sessions,
      daysToEat: input.daysToEat,
      maxFridgeDays: input.maxFridgeDays,
      freezer: input.freezer,
    }),
  );
  // ⟳ 2026-09-25 — la plage vient de la colonne déjà lue, ramenée à sa borne.
  const minutes = input.declared.cookingTimeMin === null
    ? null
    : sessionTimeBoundFor(input.declared.cookingTimeMin);
  if (input.sessions === null || runs === null || minutes === null) {
    return { ...input.declared, plan: null };
  }
  const plan = deriveCookingPlan({
    sessions: input.sessions,
    minutes,
    mealsPerDay: input.mealsPerDay,
    // ⟳ LOT 3 — les jours déclarés ENTRENT dans la dérivation au lieu d'être
    // remplacés par elle (voir `deriveCookingPlan`, et D2.4 renversé).
    declaredCookDays: input.declared.cookDays,
    runs,
    freezer: input.freezer,
    windowDays: input.windowDays,
    leadDay: input.leadDay,
    daysToEat: input.daysToEat,
    maxFridgeDays: input.maxFridgeDays,
  });
  return {
    ...input.declared,
    cookDays: [...plan.cookDays],
    cookingTimeMin: plan.sessionMinutes,
    recipeDifficulty: plan.difficulty,
    variety: plan.variety,
    plan,
  };
}
