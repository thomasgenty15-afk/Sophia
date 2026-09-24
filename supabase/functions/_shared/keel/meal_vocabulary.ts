// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LE VOCABULAIRE : MODES, MOMENTS, RYTHME, ABSENCES, PROSE DES JOURS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-1). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : les listes fermées (`MEAL_MODES`, `MEAL_SCOPES`,
// `EATING_OCCASIONS`, `MEAL_SLOTS`, `MEAL_SIZES`), le budget d'argent
// (`BUDGET_MAX`, `usableBudget`), le rythme (`parseEatingRhythm`,
// `DEFAULT_EATING_RHYTHM`, `householdGridSlots`), les absences
// (`parseAwayDays`, `isAway`), les jetons des jours (`DAY_TOKENS`) et leur
// prose (`dayProse`, `OCCASION_PROSE`, `occasionList`).
//
// ⚠️ UN SEUL MOT A CHANGÉ : `export` devant `DAY_TOKENS`, qui était privé.
// `parseAwayDays` (ici) et `parseGeneratedMeal` (dans `meal_parse.ts`
// depuis le lot 2d-2) le lisent tous les deux. Le fichier d'origine ne le
// ré-exporte pas.
//
// Ce module n'importe rien.

export const MEAL_MODES = ["from_pantry", "to_shop"] as const;
export type MealMode = (typeof MEAL_MODES)[number];

/**
 * Le périmètre d'une génération.
 *
 * ── POURQUOI `single_meal` N'EXISTE PLUS ────────────────────────────────
 * « Donne-moi une idée pour ce soir » est une QUESTION DE CONVERSATION, pas
 * une génération. L'élève l'écrit dans le chat, l'agent répond dans la méthode
 * de son coach, et c'est réglé en un tour. Le faire passer par un générateur,
 * une ligne en base et un PDF était une cérémonie disproportionnée.
 *
 * Ce que cette surface apporte commence à PLUSIEURS repas: c'est là qu'il y a
 * une liste de courses à agréger, des jours à répartir et un document à
 * emporter au magasin. (Arbitrage du 2026-08-04, migration
 * `20260804110000_meal_scope_drop_single_meal`.)
 */
export const MEAL_SCOPES = ["day", "several_days"] as const;
export type MealScope = (typeof MEAL_SCOPES)[number];

/**
 * LES MOMENTS OÙ ON MANGE — et pourquoi il y en a six et plus quatre.
 *
 * ── LE DÉFAUT QUE ÇA CORRIGE ────────────────────────────────────────────
 * Le vocabulaire était `breakfast | lunch | dinner | snack`. Un seul jeton
 * `snack` pour deux faims qui n'ont rien à voir: celle de 10h et celle de 17h.
 * Un élève qui s'effondre à 17h ne pouvait pas le dire, et le moteur ne pouvait
 * pas placer un vrai moment là — au mieux « un snack », quelque part.
 *
 * Ce n'est pas une invention: le dépôt porte DÉJÀ ce vocabulaire, dans
 * `slot_vocabulary`, pour les plans publiés (`on_waking`, `snack_am`,
 * `pre_workout`, `snack_pm`, `before_bed`...). Le moteur de repas en tenait un
 * second, plus pauvre, en parallèle. On aligne sur celui qui existe, en ne
 * gardant que ce qui décrit un MOMENT DE FAIM: `pre_workout`/`post_workout`
 * sont des constructions d'entraînement, pas des repas de la journée.
 *
 * ── `snack` RESTE ACCEPTÉ, ET N'EST PLUS PROPOSÉ ────────────────────────
 * Des lignes `student_generated_meals` en portent déjà. Le retirer de la liste
 * ferait que le parseur DROP ces plats à la relecture — un plan composé hier
 * deviendrait un plan troué. Il est donc accepté en lecture, absent de ce que
 * l'écran offre, et le modèle ne le voit plus dans le schéma de sortie.
 */
export const EATING_OCCASIONS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;
export type EatingOccasion = (typeof EATING_OCCASIONS)[number];

/** Le vocabulaire ACCEPTÉ sur un plat: les six moments, plus le legacy. */
export const MEAL_SLOTS = [...EATING_OCCASIONS, "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * LA TAILLE D'UN MOMENT — liste fermée, et facultative.
 *
 * ── CE QUI ÉTAIT LÀ AVANT, ET POURQUOI ÇA A SAUTÉ ─────────────────────────
 * Ce champ portait une HEURE (« 17:00 »). Vérifié le 2026-08-07: elle n'était
 * lue qu'à UN endroit, `rhythmLines`, qui en faisait une annotation de prose
 * (`- afternoon snack (17:00)`). Elle ne gouvernait ni le plafond de plats, ni
 * le choix des créneaux, ni la composition. Une question posée à chaque élève,
 * un champ dans le jsonb, une contrainte de format à valider — pour une
 * parenthèse.
 *
 * La taille, elle, décide de quelque chose: « petit-déjeuner léger, gros
 * dîner » et « trois repas égaux » ne se composent pas pareil, à rythme et
 * objectif identiques. C'est la même case, au même endroit, qui rapporte.
 *
 * ── CE N'EST PAS UNE QUANTITÉ, ET LA DISTINCTION COMPTE ───────────────────
 * `small`/`medium`/`large` est RELATIF et sans unité: c'est une préférence de
 * composition déclarée par l'élève, de la même famille que `cooking_time_min`
 * ou `budget_band`. Les règles de CONTRACT.md sur les quantités portent sur
 * les chiffres d'ÉNERGIE tirés de ce qui a été mangé (analyse de repas,
 * photos) — un autre couloir, et rien ici n'y touche.
 */
export const MEAL_SIZES = ["small", "medium", "large"] as const;
export type MealSize = (typeof MEAL_SIZES)[number];

/**
 * UN MOMENT DE LA JOURNÉE DE CET ÉLÈVE, avec sa taille si elle a été donnée.
 *
 * La taille est FACULTATIVE et le reste: « je grignote l'après-midi » est une
 * information utile sans savoir si c'est gros ou petit. Exiger la taille ferait
 * inventer une précision que l'élève n'a pas — et une précision inventée, le
 * moteur la traite comme une contrainte.
 */
/**
 * LES BORNES D'UN BUDGET, ET LEUR AUTORITÉ EST ICI.
 *
 * ── POURQUOI UN PLAFOND ───────────────────────────────────────────────────
 * Il ne juge le train de vie de personne. Il attrape le zéro de trop — « 5000 »
 * tapé pour « 500 » — avant qu'il ne parte au modèle comme une consigne, où il
 * ne produit pas une erreur mais un plan au homard. Une borne haute qu'on peut
 * atteindre légitimement serait un refus injuste; celle-ci ne l'est pas.
 *
 * ── ET POURQUOI ELLE EST RECOPIÉE CÔTÉ NAVIGATEUR ────────────────────────
 * Le navigateur et Deno ne partagent aucun module dans ce dépôt.
 * `frontend/src/keel/api/onboarding.ts` porte donc la même borne, avec un
 * commentaire qui désigne CE fichier comme autorité. La copie qui compte est
 * celle-ci: c'est elle qui décide de ce qui entre dans le prompt, et un client
 * plus permissif ne peut rien faire passer.
 */
export const BUDGET_MAX = 5000;

/**
 * LE MONTANT UTILISABLE, ou `null` — jamais une valeur de repli.
 *
 * ⚠️ `Number(null)` VAUT 0 ET EST FINI. Un test `!= null` sur la valeur brute
 * laisserait donc « budget: 0 » descendre dans le prompt comme une consigne, et
 * le dépôt a déjà payé exactement ce piège sur une taille pré-remplie à 0.
 */
export function usableBudget(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > BUDGET_MAX) return null;
  return n;
}

export interface EatingOccasionSlot {
  slot: EatingOccasion;
  /** « large », ou `null` quand l'élève n'a rien dit. */
  size: MealSize | null;
}

/**
 * UN MOMENT OÙ L'ÉLÈVE NE MANGE PAS ICI — cantine, restaurant, absent.
 *
 * ── CE QUE ÇA VEUT DIRE, ET CE QUE ÇA NE VEUT PAS DIRE ────────────────────
 * « Je ne mange pas ici » : aucun plat composé, rien dans la liste de courses,
 * aucune portion. Ce n'est PAS « je mange mais je gère moi-même » — un moment
 * écarté sort complètement de la composition.
 *
 * ── PAR JOUR DE SEMAINE, ET C'EST SANS AMBIGUÏTÉ ──────────────────────────
 * Une fenêtre de plan fait AU PLUS sept jours (`MAX_WINDOW_DAYS`, et la base
 * l'impose: `duration_days between 1 and 7`). Chaque jour de semaine y apparaît
 * donc au plus une fois, et « ce mardi » et « les mardis » désignent la même
 * case. C'est ce qui rend cette clé lisible à la fois comme un choix ponctuel
 * dans la grille et comme une habitude d'une génération à l'autre.
 *
 * `slots` VIDE VAUT LA JOURNÉE ENTIÈRE. C'est la forme que FF-002 avait posée
 * pour l'absence récurrente, et la grille du constructeur écrit dans la même
 * clé: deux mécanismes pour « je ne mange pas ici » divergeraient, et c'est
 * celui qu'on regarde le moins qui garderait l'ancien état.
 */
export interface AwayDay {
  /** `mon`…`sun`. */
  day: string;
  /** Les moments écartés. Vide = toute la journée. */
  slots: EatingOccasion[];
}

/**
 * Les absences lues depuis `practical_constraints.away_days`.
 *
 * MÊME POSTURE QUE `parseEatingRhythm`: ce qui n'est pas reconnu est écarté,
 * jamais deviné. Un jeton de jour inconnu fait tomber SON entrée et garde les
 * autres — une absence illisible ne doit pas faire disparaître les absences
 * lisibles, sinon un plan compose un repas que l'élève a dit ne pas prendre.
 */
export function parseAwayDays(raw: unknown): AwayDay[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<string, Set<EatingOccasion>>();
  const wholeDay = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const day = String(e.day ?? "").trim().toLowerCase();
    if (!DAY_TOKENS.includes(day)) continue;
    // ── « AUCUN CRÉNEAU DEMANDÉ » ET « AUCUN CRÉNEAU LISIBLE » NE SONT PAS
    //    LA MÊME CHOSE ────────────────────────────────────────────────────
    // Sans clé `slots`, ou avec une liste vide, l'élève dit « toute la
    // journée ». Avec une liste dont RIEN n'est reconnu, il a nommé des
    // moments et on ne sait pas lesquels — traiter ça comme une journée
    // entière transformerait une faute de frappe en absence complète, et
    // supprimerait des repas que personne n'a demandé de supprimer.
    const askedSlots = Array.isArray(e.slots) && e.slots.length > 0;
    const slots = askedSlots
      ? (e.slots as unknown[])
        .map((s) => String(s ?? "").trim().toLowerCase())
        .filter((s): s is EatingOccasion =>
          (EATING_OCCASIONS as readonly string[]).includes(s)
        )
      : [];
    if (askedSlots && slots.length === 0) continue;
    if (!askedSlots) {
      wholeDay.add(day);
      byDay.delete(day);
      continue;
    }
    if (wholeDay.has(day)) continue;
    const set = byDay.get(day) ?? new Set<EatingOccasion>();
    slots.forEach((s) => set.add(s));
    byDay.set(day, set);
  }
  const out: AwayDay[] = [];
  for (const day of DAY_TOKENS) {
    if (wholeDay.has(day)) out.push({ day, slots: [] });
    else if (byDay.has(day)) {
      out.push({
        day,
        slots: EATING_OCCASIONS.filter((s) => byDay.get(day)!.has(s)),
      });
    }
  }
  return out;
}

/** Ce moment-là, ce jour-là, est-il écarté ? */
export function isAway(
  away: readonly AwayDay[],
  day: string | null,
  slot: string | null,
): boolean {
  if (!day) return false;
  const row = away.find((a) => a.day === day);
  if (!row) return false;
  // Journée entière: le créneau ne compte pas, et un plat SANS créneau nommé
  // tombe aussi — c'est bien un repas de ce jour-là.
  if (row.slots.length === 0) return true;
  if (!slot) return false;
  return (row.slots as readonly string[]).includes(slot);
}

/**
 * Le rythme par défaut, quand l'élève n'a rien déclaré.
 *
 * C'est EXACTEMENT ce que le moteur imposait à tout le monde avant d'avoir la
 * question. Le garder comme repli est ce qui rend ce chantier additif: un élève
 * qui ne remplit rien reçoit la même semaine qu'hier.
 */
export const DEFAULT_EATING_RHYTHM: readonly EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

/** Les moments qu'une grille de foyer porte, et d'où ils viennent. */
export interface HouseholdGridSlots {
  /** Les moments de LA MAISON: ceux du maître, ou le repli s'il s'est tu. */
  readonly base: readonly EatingOccasion[];
  /** `base` ∪ ce que chaque bouche déclare EN PLUS. Ordre de la journée. */
  readonly union: readonly EatingOccasion[];
  /** Ce qu'une bouche ajoute et que la maison n'a pas. Témoin, pas décor. */
  readonly addedByMembers: readonly EatingOccasion[];
  /** ⛔ `true` = le maître n'a rien déclaré, la base est le repli. */
  readonly baseIsDefault: boolean;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES MOMENTS DE LA GRILLE D'UN FOYER — base de la maison, puis les ajouts
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⛔ LE DÉFAUT QU'ELLE FERME, ET IL A ÉTÉ MESURÉ (2026-09-13) ────────────
 * La lane calculait l'union NUE des rythmes déclarés, sur la prémisse écrite
 * en commentaire: « une bouche à `null` n'ajoute rien: elle mange aux moments
 * de la maison, ce qui est exactement ce que l'union contient déjà. »
 *
 * **Cette prémisse est fausse quand la maison elle-même n'a rien déclaré.**
 * Une bouche à `null` n'apporte AUCUN moment à l'union, et le repli
 * `DEFAULT_EATING_RHYTHM` ne s'applique que si l'union est VIDE.
 *
 * Mesuré sur un foyer de quatre (compte de banc `lot2v1`): le maître ne
 * déclare rien, trois bouches non plus, et la quatrième déclare `lunch,
 * dinner`. L'union valait `{lunch, dinner}` — le calendrier envoyé au modèle
 * portait **4 cases sur 6**, et les DEUX petits-déjeuners du foyer
 * disparaissaient POUR TOUT LE MONDE parce qu'une bouche secondaire avait
 * rempli sa carte. « Tom prend un goûter » ajoutait un moment à la maison;
 * « Iris ne déjeune pas ici le matin » en retirait un à tous.
 *
 * ── LA RÈGLE ──────────────────────────────────────────────────────────────
 *     base  = ce que le MAÎTRE a déclaré, ou `DEFAULT_EATING_RHYTHM` s'il
 *             s'est tu ;
 *     union = base ∪ ce que CHAQUE bouche déclare en plus.
 *
 * ⚠️ CE QUI NE BOUGE PAS, ET C'EST LA MOITIÉ QUI COMPTE. Un maître qui
 * déclare `lunch, dinner` garde EXACTEMENT sa grille de deux moments: la base
 * est la sienne, et le repli ne répond qu'à son silence. C'est le cas solo, et
 * il ne doit pas changer d'un créneau.
 *
 * ⚠️ ET LA GRILLE D'UNE BOUCHE RESTE LA SIENNE. Cette fonction décide des
 * moments que le PLAN couvre, pas de la présence de chacun case par case.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function householdGridSlots(args: {
  /** `student_goals.practical_constraints.eating_rhythm` du maître, brut. */
  readonly ownerRhythm: unknown;
  /** Les moments déclarés par les bouches, bruts et à plat. */
  readonly memberSlots: readonly unknown[];
}): HouseholdGridSlots {
  const duMaitre = new Set<EatingOccasion>(
    parseEatingRhythm(args.ownerRhythm).map((o) => o.slot),
  );
  const baseIsDefault = duMaitre.size === 0;
  const base = baseIsDefault
    ? DEFAULT_EATING_RHYTHM.map((o) => o.slot)
    : EATING_OCCASIONS.filter((s) => duMaitre.has(s));
  const desBouches = new Set<EatingOccasion>(
    parseEatingRhythm([...args.memberSlots]).map((o) => o.slot),
  );
  const enBase = new Set<EatingOccasion>(base);
  return {
    base,
    union: EATING_OCCASIONS.filter((s) => enBase.has(s) || desBouches.has(s)),
    addedByMembers: EATING_OCCASIONS.filter((s) =>
      desBouches.has(s) && !enBase.has(s)
    ),
    baseIsDefault,
  };
}

/**
 * Le rythme lu depuis `student_goals.practical_constraints.eating_rhythm`.
 *
 * DÉFENSIF DANS UNE SEULE DIRECTION: ce qui n'est pas reconnu est laissé de
 * côté, jamais deviné. Un jeton inconnu deviendrait un moment que le rendu ne
 * sait pas nommer, et une taille mal formée deviendrait une contrainte fausse.
 * Un rythme entièrement illisible rend `[]`, et l'appelant retombe sur le
 * défaut — jamais sur une journée vide.
 *
 * DEUX FORMES D'ENTRÉE, ET C'EST DÉLIBÉRÉ. `{"slot":"lunch","size":"large"}`
 * est ce qu'écrit la carte; `"lunch"` tout court est ce qu'écrivent les jsonb
 * posés à la main (fixtures, seeds). La migration qui a créé cette clé a
 * renoncé au CHECK de forme en écrivant que « le lecteur sait déjà réparer » —
 * il ne réparait pas, il JETAIT, et le coût était invisible parce que le repli
 * ressemble à une réponse: la fixture d'un élève déclaré SANS petit-déjeuner
 * (`["lunch","dinner"]`) rendait `[]`, retombait sur le défaut, et servait un
 * petit-déjeuner. Toute la flotte QA validait le défaut en croyant tester trois
 * rythmes distincts. La chaîne nue vaut donc le moment SANS taille — c'est la
 * seule lecture possible, il n'y a rien à deviner.
 *
 * L'ANCIENNE CLÉ `at` EST IGNORÉE, PAS MIGRÉE. Les lignes écrites avant le
 * 2026-08-07 portent une heure; elle ne servait qu'à une parenthèse de prose
 * (voir `MEAL_SIZES`). La lire pour en déduire une taille serait deviner —
 * « 20:00 » ne dit pas si le dîner est gros. Le moment est gardé, l'heure
 * tombe, et l'élève reverra une carte où il peut dire la taille s'il veut.
 *
 * L'ORDRE EST CELUI DE LA JOURNÉE, pas celui du tableau reçu. On lit sa journée
 * du réveil au coucher; laisser l'ordre de saisie décider ferait lire un dîner
 * avant un petit-déjeuner.
 */
export function parseEatingRhythm(raw: unknown): EatingOccasionSlot[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, MealSize | null>();
  for (const entry of raw) {
    // La chaîne nue: un moment pris, sans taille. Traitée AVANT le rejet des
    // non-objets, qui la mangeait en silence.
    if (typeof entry === "string") {
      const slot = entry.trim().toLowerCase();
      if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
      // Conditionnel: une chaîne nue ne porte pas de taille, et ne doit pas
      // effacer celle qu'une entrée objet du même tableau aurait déjà posée
      // pour ce moment.
      if (!bySlot.has(slot as EatingOccasion)) {
        bySlot.set(slot as EatingOccasion, null);
      }
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    const size = String(e.size ?? "").trim().toLowerCase();
    // La liste est FERMÉE. Une taille qu'on ne sait pas lire n'annule pas le
    // moment: « je grignote l'après-midi » reste vrai sans elle.
    const valid = (MEAL_SIZES as readonly string[]).includes(size)
      ? (size as MealSize)
      : null;
    bySlot.set(slot as EatingOccasion, valid);
  }
  return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => ({
    slot: s,
    size: bySlot.get(s) ?? null,
  }));
}

export const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * « breakfast, lunch and dinner » — la liste des moments, en anglais lisible.
 *
 * En prose et pas en JSON: cette phrase est une CONSIGNE au modèle (« chaque
 * jour a besoin de ceci »), et une consigne se lit. Le JSON est réservé à ce
 * qu'il doit RENDRE.
 */
export function occasionList(rhythm: readonly EatingOccasionSlot[]): string {
  const names = rhythm.map((o) => OCCASION_PROSE[o.slot]);
  if (names.length === 0) return "breakfast, lunch and dinner";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Le jour, en mots. Même raison que `OCCASION_PROSE`: le modèle lit de
 * l'anglais, et « tue » dans une phrase se lit aussi bien comme un verbe.
 */
const DAY_PROSE: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * EXPORTÉ depuis D14 (2026-08-12), et pour une raison de fond: le bloc de
 * présence du foyer (`household_presence.ts`) nomme les mêmes jours et les
 * mêmes moments dans le même prompt. Une seconde table de prose y dirait
 * « Saturday » ici et « Sat » là, dans deux blocs que le modèle lit à la
 * suite — c'est-à-dire deux jours pour lui.
 */
export function dayProse(day: string): string {
  return DAY_PROSE[day] ?? day;
}

/** Le jeton, en mots. Le modèle lit de l'anglais, pas des slugs. */
export const OCCASION_PROSE: Record<EatingOccasion, string> = {
  breakfast: "breakfast",
  snack_am: "a mid-morning bite",
  lunch: "lunch",
  snack_pm: "an afternoon bite",
  dinner: "dinner",
  before_bed: "something before bed",
};
