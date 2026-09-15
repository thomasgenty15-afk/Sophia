/**
 * FF-027 — LA FAIM BRANCHÉE AU PLAN.
 *
 * ── LE PROBLÈME, EN UNE LIGNE ───────────────────────────────────────────────
 * Quelqu'un tape « Rough → Hunger » trois soirs dans la semaine. La ligne est
 * écrite dans `student_daily_checkins`… et c'est tout. Personne ne consomme le
 * signal, et le plan de la semaine suivante est identique à celui qui affamait.
 * C'est le cas d'école de la règle mère du domaine: une donnée collectée sans
 * consommateur. Deux issues — couper la question, ou la BRANCHER. Ce module est
 * le branchement.
 *
 * ── LA GARDE QUI GOUVERNE TOUT LE FICHIER (R2) ──────────────────────────────
 * La seule direction possible est « PLUS RASSASIANT ». Le chemin « moins de
 * nourriture » n'existe pas: il n'y a dans ce module AUCUNE fonction, AUCUN
 * paramètre et AUCUNE branche capable de produire une réduction. Ce n'est pas
 * une consigne de prompt — une consigne se contourne au premier tirage; c'est
 * une propriété de la surface exportée, et `hunger_signal_test.ts` la vérifie
 * en énumérant TOUTES les entrées possibles de `satietyPromptBlock` (le bloc
 * est un littéral gelé, donc l'énumération est exhaustive par construction).
 *
 * Pourquoi si dur: « s'il a faim on augmente, s'il n'a pas faim on diminue » est
 * la symétrie que quelqu'un proposera. L'absence de faim n'est pas un signal, et
 * un plan qu'on réduit automatiquement est la zone exacte du risque TCA.
 *
 * ── POURQUOI LE BLOC NE PORTE AUCUN NOMBRE ──────────────────────────────────
 * Ni kcal (contrat, non-input #4) — ça, c'était acquis. Mais pas non plus le
 * DÉCOMPTE lui-même (« faim rapportée 3 soirs sur 7 »), et c'est une décision,
 * pas un oubli. Trois raisons qui pointent dans le même sens:
 *
 *   1. LE PLAFOND (§10, contre-mesure). Un bloc qui porte N est un bloc qui
 *      ESCALADE avec N: le modèle qui lit « 6 soirs sur 7 » compose plus gros
 *      que celui qui lit « 2 soirs sur 7 ». Une personne qui rapporte de la faim
 *      chaque semaine ferait alors grossir son plan indéfiniment. En retirant N,
 *      le plafond n'est plus une consigne — le bloc est littéralement le MÊME
 *      texte pour 2 comme pour 7.
 *   2. LA FUITE (§9, « le chiffre qui revient par la satiété »). Ce qui entre
 *      dans un prompt finit par sortir dans un texte: « puisque tu as eu faim
 *      3 soirs » dans le rationnel d'un plat est à un tirage de distance.
 *   3. R5. Sous plancher de restriction, la satiété s'applique et RIEN ne
 *      s'affiche. Un bloc sans nombre et avec sa consigne de silence tient R5
 *      pour tout le monde, par construction, au lieu de la tenir par une branche
 *      conditionnelle qu'un appelant oubliera de passer.
 *
 * ── LE DÉCOMPTE EST DÉRIVÉ, JAMAIS ENTRETENU ────────────────────────────────
 * `countHungerDays` recalcule à la lecture, à partir de faits datés. Aucune
 * colonne ne porte de compteur, aucun trait « gros mangeur » n'est écrit nulle
 * part. Un compteur stocké divergerait de sa fenêtre au premier jour qui sort —
 * et « cette personne a souvent faim » serait faux le mois suivant (R4). Le
 * signal décrit une FENÊTRE, pas une personne.
 *
 * PURE MODULE: pas d'I/O, pas d'horloge (l'appelant passe la date du jour), pas
 * d'aléa. Les lectures vivent dans `hunger_signal_io.ts`.
 */

// ---------------------------------------------------------------------------
// LES DEUX CONSTANTES DE CALIBRAGE — exportées et testées (fiche §11)
// ---------------------------------------------------------------------------

/**
 * LA FENÊTRE, EN JOURS, aujourd'hui compris.
 *
 * La fiche laisse le choix ouvert entre 7 et 14 (§11) et demande une constante
 * exportée plutôt qu'un nombre semé dans les requêtes. 7 pour commencer, parce
 * que le consommateur est la composition de LA SEMAINE SUIVANTE: une fenêtre de
 * 14 jours ferait peser sur la semaine qui vient une faim qui appartenait à
 * l'avant-dernière, c'est-à-dire à un plan qu'on a déjà changé.
 *
 * À recalibrer sur les premières données réelles, pas à l'intuition.
 */
export const HUNGER_WINDOW_DAYS = 7;

/**
 * LE SEUIL DE RÉCURRENCE — le nombre de JOURS DISTINCTS de la fenêtre qui
 * portent un signal pour que le bloc satiété existe.
 *
 * 2, et le choix se lit dans les deux directions:
 *   — au-dessus de 1, parce que la fiche l'exige en toutes lettres (§7: « un
 *     seul soir de faim isolé → pas de bloc, le seuil est la récurrence, pas
 *     l'occurrence ») et parce que la sur-réaction — un soir de faim, un plan
 *     bouleversé — est un rabbit hole nommé (§9);
 *   — pas plus haut, parce que le tap du soir n'est pas quotidien: exiger 3
 *     jours sur 7 d'une surface qui n'est pas remplie tous les soirs, c'est
 *     rendre le seuil inatteignable pour l'élève réel et faire mourir la donnée
 *     par un autre chemin.
 *
 * À recalibrer sur les premières données réelles (§11).
 */
export const HUNGER_RECURRENCE_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// LE FAIT DATÉ, ET LE SIGNAL QUI S'EN DÉRIVE
// ---------------------------------------------------------------------------

/** D'où vient un jour de faim. Table fermée. */
export type HungerSignalSource = "evening_tap" | "chat";

/**
 * UN JOUR DE FAIM, tel qu'il sort de la base.
 *
 * `localDate` est la journée de l'ÉLÈVE, jamais celle du serveur: un fait dont
 * la date dépend de la machine qui l'a écrit est la famille de bugs nocturnes
 * que ce dépôt a déjà payée.
 */
export type HungerDay = {
  localDate: string;
  source: HungerSignalSource;
};

/**
 * LE SIGNAL DE LA FENÊTRE — dérivé, jamais stocké.
 *
 * `days` est un décompte de JOURS DISTINCTS et pas de lignes: un tap du soir et
 * une phrase en conversation le même jour sont UN jour de faim. Compter deux
 * fois ferait franchir le seuil de récurrence à une occurrence unique, ce qui
 * est exactement ce que le seuil existe pour empêcher.
 */
export type HungerWindowSignal = {
  /** Jours DISTINCTS portant un signal, dans la fenêtre. */
  days: number;
  /** `days >= HUNGER_RECURRENCE_THRESHOLD`. La seule chose que le bloc lit. */
  recurrent: boolean;
  /** Les bornes effectivement appliquées, pour que le log soit relisible. */
  windowStart: string;
  windowEnd: string;
};

/** `YYYY-MM-DD` + n jours, sans dépendre d'un fuseau. */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** La borne basse de la fenêtre pour une date de fin donnée. */
export function hungerWindowStart(todayLocalDate: string): string {
  return shiftDate(todayLocalDate, -(HUNGER_WINDOW_DAYS - 1));
}

/**
 * LE DÉCOMPTE FENÊTRÉ — recalculé à chaque lecture, à partir des faits datés.
 *
 * Il FILTRE lui-même la fenêtre au lieu de faire confiance à la requête qui l'a
 * alimenté. Deux lectures du même intervalle (le `where` SQL et ce filtre)
 * finiraient par diverger, et la divergence se paierait sur le seul nombre qui
 * décide de tout. Une ligne du futur (horloge de QA, fuseau exotique) est
 * écartée pour la même raison: elle ne décrit pas la fenêtre écoulée.
 */
export function countHungerDays(
  days: readonly HungerDay[],
  todayLocalDate: string,
): HungerWindowSignal {
  const windowEnd = String(todayLocalDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(windowEnd)) {
    throw new Error(
      `[keel/hunger_signal] invalid todayLocalDate ${JSON.stringify(todayLocalDate)}`,
    );
  }
  const windowStart = hungerWindowStart(windowEnd);
  const distinct = new Set<string>();
  for (const day of days ?? []) {
    const d = String(day?.localDate ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (d < windowStart || d > windowEnd) continue;
    distinct.add(d);
  }
  const count = distinct.size;
  return {
    days: count,
    recurrent: count >= HUNGER_RECURRENCE_THRESHOLD,
    windowStart,
    windowEnd,
  };
}

// ---------------------------------------------------------------------------
// LE BLOC SATIÉTÉ — un littéral gelé, et c'est ce qui fait la garantie
// ---------------------------------------------------------------------------

/**
 * LE TEXTE, ET RIEN D'AUTRE.
 *
 * Un tableau de lignes gelé, pas un gabarit: il n'y a aucun trou où un nombre
 * pourrait entrer. Relire les quatre choses qu'il fait:
 *
 *  1. Il dit la DIRECTION, en aliments et en volume — protéines, fibres,
 *     légumes à volonté, portions plus généreuses. Jamais une énergie.
 *  2. Il interdit la direction inverse EXPLICITEMENT, en plus de l'interdire
 *     structurellement. La ceinture de code tient déjà; la phrase existe pour
 *     que le modèle ne « compense » pas de lui-même ailleurs dans la journée.
 *  3. Il interdit le CHIFFRE, nommément (kcal, grammes, pourcentages).
 *  4. Il interdit d'EN PARLER. C'est R5 rendue inconditionnelle: sous plancher
 *     de restriction la satiété s'applique et rien ne s'affiche — et hors
 *     plancher, il n'y a de toute façon aucune raison de commenter. Le plan se
 *     voit dans l'assiette, pas dans une phrase sur la faim de quelqu'un.
 *  5. Il SE SUBORDONNE, en toutes lettres, et cette ligne a été payée.
 *
 * ── 🔴 LE DÉFAUT MESURÉ QUI A AJOUTÉ LA LIGNE 5 (run réel, 2026-08-08) ──────
 * Élève avec « I do not eat pasta, rice, bread or potatoes » dans ses
 * préférences ET trois jours de faim. La semaine composée portait:
 *
 *   « Choose whole starches when you add a starchy side, such as potatoes,
 *     brown rice, oats, or beans, rather than refined versions. »
 *
 * Le MÊME élève SANS signal de faim, joué trois fois, ne recevait aucun aliment
 * refusé — 3/3. Le bloc était donc bien la cause: ses EXEMPLES (« root
 * vegetables », « whole grains ») ont été lus comme une consigne, et une
 * consigne plus proche de la fin du prompt se lit comme plus contraignante que
 * les préférences plus haut.
 *
 * Deux correctifs, appliqués ensemble parce qu'un seul serait une convention:
 *   — le bloc se déclare SUBORDONNÉ à ce que la personne ne mange pas, et ses
 *     exemples se disent exemples;
 *   — sa PLACE change (`week_plan_generation.ts`): il passe AVANT les
 *     contraintes pratiques, pour que les préférences gardent le dernier mot.
 *
 * C'est aussi la lecture exacte de R2 étendue: la seule direction est « plus
 * rassasiant », et élargir l'ensemble des aliments autorisés n'est pas une
 * direction — c'est une porte dérobée.
 */
const SATIETY_BLOCK_LINES: readonly string[] = Object.freeze([
  "== SATIETY PRIORITY ==",
  "This person has recently reported being hungry on their plan, more than once.",
  "Compose so that they finish their meals full:",
  "- generous portions of the protein anchor at every eating occasion",
  "- vegetables without limit — volume is the point",
  "- fibre-dense sides over refined ones (for example pulses or whole grains,",
  "  but ONLY where they suit this person)",
  "- whole foods that take time to eat over soft, fast ones",
  "HARD RULES for this block:",
  "- This block is SUBORDINATE. It never overrides a hard constraint, a coach",
  "  rule, or anything this person has said they do not eat. Every food named",
  "  above is an EXAMPLE, never an instruction: if one of them is off the table",
  "  for them, reach for another food that does the same job and never name the",
  "  excluded one.",
  "- Never make the plan smaller, lighter, or lower in anything. The only",
  "  direction this block allows is MORE filling.",
  "- Never write a calorie, kilojoule, gram, macro or percentage figure. Say it",
  "  in food and in volume.",
  "- Never mention hunger, appetite, or this adjustment anywhere in your output.",
  "  No dish title, no rationale, no note refers to it. The plan shows it; the",
  "  words never do.",
]);

/**
 * LE BLOC À GREFFER SUR LE PROMPT DU GÉNÉRATEUR — ou `null`.
 *
 * ── LA SIGNATURE EST LA GARANTIE ────────────────────────────────────────────
 * Elle prend le SIGNAL et rend un `string | null`. Il n'existe pas de paramètre
 * d'intensité, pas d'énumération de direction, pas de variante. Le corps a
 * exactement une branche, et sa sortie non nulle est un littéral. C'est ce qui
 * rend R2 vérifiable au lieu d'être promise: aucune valeur d'entrée ne peut
 * produire autre chose que `null` ou CE texte-là.
 *
 * ── PAS D'ESCALADE ──────────────────────────────────────────────────────────
 * `signal.days` n'est PAS lu. Seul `recurrent` l'est. Deux soirs et sept soirs
 * produisent le même bloc — c'est le plafond de §10, écrit en code plutôt qu'en
 * intention. La faim qui persiste malgré deux adaptations n'appelle pas un
 * troisième agrandissement: elle appelle un changement de STRUCTURE, qui est le
 * travail de FF-028 (voir `hungerSignalProvenance`).
 */
export function satietyPromptBlock(signal: HungerWindowSignal): string | null {
  if (!signal?.recurrent) return null;
  return SATIETY_BLOCK_LINES.join("\n");
}

/**
 * LA MÊME CHOSE, EN SUFFIXE À CONCATÉNER — pour les générateurs dont le
 * constructeur de prompt ne prend pas ce bloc en paramètre nommé.
 *
 * Même forme que `buildHouseholdPromptBlocks().userSuffix`, et pour la même
 * raison de plomberie. `""` quand il n'y a pas de signal: une chaîne vide se
 * concatène sans condition chez l'appelant, et un appelant qui n'a pas de
 * condition à écrire n'a pas de condition à se tromper.
 */
export function satietyUserSuffix(signal: HungerWindowSignal): string {
  const block = satietyPromptBlock(signal);
  return block ? `\n\n${block}` : "";
}

/**
 * CE QUI S'ARCHIVE AVEC LA COMPOSITION (`generated_from`), et pourquoi ça
 * n'est PAS un compteur stocké.
 *
 * FF-028 doit pouvoir répondre à « la faim persiste-t-elle MALGRÉ des
 * adaptations ? » (§10, contre-mesure) — une question qui a besoin de savoir
 * combien de compositions ont déjà consommé le signal. Deux façons de la
 * servir:
 *
 *   — un compteur sur l'élève: c'est le trait durable que R4 interdit, et il
 *     divergerait de sa fenêtre au premier jour qui sort;
 *   — la PROVENANCE de chaque composition, archivée avec elle: un fait daté de
 *     plus, qui s'efface avec le plan et qui ne dit rien de la personne.
 *
 * C'est la seconde. `generated_from.satiety_priority = true` se lit en comptant
 * des lignes de plan, exactement comme le décompte de faim se lit en comptant
 * des jours: dérivé à la lecture, des deux côtés.
 *
 * ⚠️ `days` est archivé ICI et n'entre PAS dans le prompt. L'archive sert à
 * relire trois semaines plus tard pourquoi cette semaine avait cette forme;
 * c'est ce que `generated_from` est. Le prompt, lui, n'en a pas besoin — voir
 * l'en-tête de ce module.
 */
export function hungerSignalProvenance(
  signal: HungerWindowSignal,
): Record<string, unknown> {
  return {
    satiety_priority: signal.recurrent,
    hunger_days: signal.days,
    hunger_window_days: HUNGER_WINDOW_DAYS,
    hunger_window_start: signal.windowStart,
    hunger_window_end: signal.windowEnd,
  };
}

// ---------------------------------------------------------------------------
// LE PLANCHER DÉTERMINISTE DU SPONTANÉ (R6)
// ---------------------------------------------------------------------------

/**
 * ── POURQUOI UN PLANCHER, ET PAS LE DISPATCHER ──────────────────────────────
 * Même raison que les quatre planchers voisins (`meal_declaration_floor`,
 * `body_measure_floor`, `medical_condition_floor`, allergie): ce qui OUVRE un
 * effet durable ne transite pas par le LLM du dispatcher. Mesuré ailleurs dans
 * ce dépôt sur une phrase IDENTIQUE jouée quatre fois: `[0, 3, 3, 0]` en
 * français et `[0, 0, 0, 0]` en anglais. Une instabilité sur une phrase
 * identique prouve un tirage, pas une règle.
 *
 * ── LA PORTE EST ÉTROITE, ET L'ASYMÉTRIE LE DIT ─────────────────────────────
 * Sur-déclarer un jour de faim déplace un seuil de récurrence, donc peut faire
 * grossir un plan sur une phrase mal lue. Sous-déclarer perd un signal que le
 * tap du soir attrapera peut-être demain. Le premier coûte plus cher — la porte
 * est donc étroite: il faut une expression de faim PREMIÈRE PERSONNE, dans un
 * cadre temporel qui en fait un fait de fenêtre (passé, ou récurrence), sans
 * négation, sans conditionnel, et sans passé lointain.
 *
 * ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
 * Il ne lit pas l'horloge (l'appelant date le fait), il ne devine aucun aliment,
 * il ne produit AUCUN texte visible. FF-027 §3: « pas de conversation sur la
 * faim » — le chat ne demande jamais, et il n'accuse pas réception non plus.
 * Un accusé serait un accusé sur un fait dont l'élève ne sait rien, et ce dépôt
 * a déjà payé la famille des accusés fantômes.
 */
export type HungerReportHit = {
  /** Le fragment qui a ouvert la porte, pour que le log soit lisible. */
  matched: string;
  /** Ce qui a fait de l'expression un fait de fenêtre. */
  gate: "past_tense" | "recurrence";
  /** Les mots de l'élève, tels quels. */
  studentNote: string;
};

/**
 * La normalisation du dépôt: minuscules, diacritiques jetés, apostrophes
 * transformées en espace (« j'ai » → « j ai », « I've » → « i ve »), le reste en
 * espaces.
 *
 * ⚠️ L'APOSTROPHE DEVIENT UN ESPACE, ET C'EST LA MOITIÉ DE LA GARDE BILINGUE.
 * `\b` ne mord pas après « é » (cicatrice `guard-tested-in-one-language-only`),
 * et « wasn't » qui resterait collé ne serait jamais couvert par une liste qui
 * contient « not ». Toutes les formes contractées sont donc écrites en clair,
 * séparées, dans les listes ci-dessous.
 */
function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Les intensificateurs tolérés entre le sujet et la faim. Liste FERMÉE. */
const FR_INTENS = "(?:tres |trop |si |tellement |vraiment |super |hyper |grave |encore |souvent |toujours |carrement )*";
// ⚠️ AUCUN DIMINUTIF ICI (« a bit », « kind of », « un peu »). « J'ai été un peu
// affamé » est une nuance, pas un rapport de faim, et le seuil de récurrence se
// déplacerait sur des nuances. La porte reste étroite du côté qui coûte cher.
const EN_INTENS = "(?:so |really |very |super |quite |pretty |always |constantly |still |already |properly |too |way |far |seriously |absolutely |totally )*";

/**
 * EXPRESSIONS DE FAIM AU PASSÉ, PREMIÈRE PERSONNE. Elles suffisent seules: un
 * passé est un fait de fenêtre.
 *
 * Le sujet est DANS le motif, jamais vérifié à côté. C'est ce qui désarme les
 * tiers par construction plutôt que par liste noire: « mon fils a eu faim » ne
 * peut pas mordre, parce qu'aucun de ces motifs ne commence autrement que par
 * « j… », « je… » ou « i… ». Une liste noire de tiers aurait toujours un membre
 * de famille en moins.
 */
const HUNGER_PAST_PATTERNS: readonly RegExp[] = Object.freeze([
  // --- français ---
  new RegExp(`\\bj ai eu ${FR_INTENS}faim\\b`),
  new RegExp(`\\bj avais ${FR_INTENS}faim\\b`),
  new RegExp(`\\bj ai eu (?:des |une |la )?(?:fringales?|dalle)\\b`),
  new RegExp(`\\bj avais (?:des |une |la )?(?:fringales?|dalle)\\b`),
  new RegExp(`\\bj ai ete ${FR_INTENS}affamee?s?\\b`),
  new RegExp(`\\bj etais ${FR_INTENS}affamee?s?\\b`),
  new RegExp(`\\bje crevais (?:la dalle|de faim)\\b`),
  new RegExp(`\\bje mourais de faim\\b`),
  new RegExp(`\\bnous avons eu ${FR_INTENS}faim\\b`),
  new RegExp(`\\bon a eu ${FR_INTENS}faim\\b`),
  // --- anglais ---
  new RegExp(`\\bi (?:was|were) ${EN_INTENS}(?:hungry|starving|famished|ravenous)\\b`),
  new RegExp(`\\bi (?:have |ve |had )?been ${EN_INTENS}(?:hungry|starving|famished|ravenous)\\b`),
  new RegExp(`\\bi (?:got|felt|went) ${EN_INTENS}(?:hungry|starving|famished|ravenous)\\b`),
  new RegExp(`\\bwe (?:was|were) ${EN_INTENS}(?:hungry|starving|famished|ravenous)\\b`),
]);

/**
 * EXPRESSIONS DE FAIM AU PRÉSENT, PREMIÈRE PERSONNE. Elles NE SUFFISENT PAS:
 * il leur faut un marqueur de récurrence.
 *
 * C'est §7 de la fiche, mot pour mot: « j'ai faim » au présent à 18 h n'est pas
 * un signal de fenêtre, c'est une conversation. FF-023 répond, et rien ne
 * s'écrit. Mais « j'ai faim tous les soirs » EST un signal de fenêtre, même au
 * présent — c'est la récurrence qui le fait, pas le temps du verbe.
 */
const HUNGER_PRESENT_PATTERNS: readonly RegExp[] = Object.freeze([
  // --- français ---
  new RegExp(`\\bj ai ${FR_INTENS}faim\\b`),
  new RegExp(`\\bj ai (?:des |une |la )?(?:fringales?|dalle)\\b`),
  new RegExp(`\\bje suis ${FR_INTENS}affamee?s?\\b`),
  new RegExp(`\\bje creve (?:la dalle|de faim)\\b`),
  new RegExp(`\\bje meurs de faim\\b`),
  new RegExp(`\\bje reste sur ma faim\\b`),
  // --- anglais ---
  new RegExp(`\\bi (?:am|m) ${EN_INTENS}(?:hungry|starving|famished|ravenous)\\b`),
  new RegExp(`\\bi (?:keep |end up )(?:getting|feeling|being) ${EN_INTENS}(?:hungry|starving|famished|ravenous)\\b`),
  new RegExp(`\\bi (?:get|feel) ${EN_INTENS}(?:hungry|starving|famished|ravenous)\\b`),
]);

/**
 * LES MARQUEURS DE RÉCURRENCE OU DE FENÊTRE.
 *
 * Ils font d'une expression présente un fait de fenêtre. Écrits en formes
 * normalisées (« ces jours ci », « i ve » n'apparaît pas ici mais « lately »
 * oui), et bilingues d'entrée: T9 du domaine — toute garde est testée dans les
 * deux langues, et une garde qui ne mord que dans une langue est une garde qui
 * n'existe pas pour la moitié des gens.
 */
const RECURRENCE_MARKERS: readonly string[] = Object.freeze([
  // --- français ---
  "tous les soirs",
  "tous les jours",
  "toutes les nuits",
  "chaque soir",
  "chaque jour",
  "chaque nuit",
  "ces derniers jours",
  "ces derniers soirs",
  "ces jours ci",
  "cette semaine",
  "toute la semaine",
  "plusieurs soirs",
  "plusieurs jours",
  "le soir",
  "les soirs",
  "en permanence",
  "tout le temps",
  "non stop",
  "souvent",
  "regulierement",
  "depuis",
  "en ce moment",
  // --- anglais ---
  "every evening",
  "every night",
  "every day",
  "every afternoon",
  "all week",
  "all the time",
  "most nights",
  "most evenings",
  "most days",
  "these last few days",
  "these past few days",
  "the last few days",
  "the past few days",
  "last few days",
  "past few days",
  "these days",
  "this week",
  "lately",
  "constantly",
  "keep",
  "keeps",
  "again and again",
  "in the evenings",
  "at night",
  "for days",
  "for a few days",
  "since",
  "nonstop",
  "non stop",
]);

/**
 * LES DÉSARMEURS — chacun avec sa raison, aucun « au cas où ».
 *
 * ⚠️ LA NÉGATION EST BILINGUE ET CONTRACTÉE. C'est la cicatrice exacte du dépôt:
 * une garde française passait par accident de grammaire parce que `not` ne
 * couvrait pas `doesn't`. Après normalisation « wasn't » vaut « wasn t », donc
 * chaque forme contractée est écrite telle qu'elle sort du normaliseur.
 *
 * Les distances (`{0,3}`) sont bornées et petites: une négation à huit mots de
 * la faim ne la nie généralement pas, et une fenêtre large désarmerait le
 * plancher sur des phrases parfaitement affirmatives.
 */
const NEGATION_PATTERNS: readonly RegExp[] = Object.freeze([
  // français — « je n'ai pas eu faim », « jamais faim », « plus faim »
  /\b(?:pas|jamais|plus|aucune|point)\s+(?:[a-z]+\s+){0,3}(?:faim|affamee?s?|fringales?|dalle)\b/,
  /\b(?:faim|affamee?s?|fringales?|dalle)\b\s+(?:[a-z]+\s+){0,2}\b(?:pas|jamais)\b/,
  // anglais — toutes les formes contractées, telles que normalisées
  /\b(?:not|never|no|nor|hardly|barely|rarely|seldom|wasn t|weren t|isn t|aren t|am not|didn t|don t|doesn t|haven t|hasn t|hadn t|wouldn t|couldn t|cannot|can t)\s+(?:[a-z]+\s+){0,3}(?:hungry|starving|famished|ravenous)\b/,
  /\b(?:hungry|starving|famished|ravenous)\b\s+(?:[a-z]+\s+){0,2}\b(?:not|never)\b/,
]);

/**
 * LE CONDITIONNEL ET L'HYPOTHÈSE. « Si j'ai faim le soir, je fais quoi ? » est
 * une QUESTION sur une éventualité, pas le rapport d'un fait. L'écrire comme un
 * jour de faim ferait grossir un plan sur une question.
 */
const HYPOTHETICAL_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bsi j ai\b/,
  /\bsi je suis\b/,
  /\bsi jamais j\b/,
  /\bau cas ou j\b/,
  /\bif i (?:m|am|get|feel|was|were|end up)\b/,
  /\bin case i\b/,
  /\bwhat if i\b/,
]);

/**
 * LE PASSÉ LOINTAIN. « J'avais faim quand j'étais petit » est une biographie,
 * pas une fenêtre de sept jours. Sans ce désarmeur, un motif au passé suffirait
 * — c'est la seule famille où le passé ne prouve PAS la proximité.
 */
const REMOTE_PAST_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bquand j etais\b/,
  /\ba l epoque\b/,
  /\bil y a (?:des |plusieurs )?(?:mois|ans|annees)\b/,
  /\bl an dernier\b/,
  /\bl annee derniere\b/,
  /\bwhen i was\b/,
  /\bas a (?:kid|child|teenager)\b/,
  /\byears? ago\b/,
  /\bmonths? ago\b/,
  /\blast year\b/,
  /\bback then\b/,
]);

/**
 * LA MÉTAPHORE. « Hungry for success », « une faim de reconnaissance ». Le mot
 * est le même, le fait n'existe pas. Étroit exprès: on ne désarme que sur la
 * construction qui rend la métaphore, pas sur le mot.
 */
const METAPHOR_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bhungry for\b/,
  /\bstarving for\b/,
  /\bfaim de (?:reconnaissance|succes|victoire|revanche|justice|liberte|savoir|apprendre|vivre)\b/,
  /\bfaim de loup\b/,
]);

function firstMatch(
  patterns: readonly RegExp[],
  haystack: string,
): string | null {
  for (const re of patterns) {
    const m = re.exec(haystack);
    if (m) return m[0];
  }
  return null;
}

/**
 * LE PLANCHER. Rend le fait, ou `null`.
 *
 * L'ordre est celui du coût: on désarme AVANT de reconnaître. Un message nié,
 * hypothétique, lointain ou métaphorique n'a pas à être analysé plus loin — et
 * placer les désarmeurs en premier rend impossible le défaut classique « on
 * reconnaît, puis on oublie de vérifier ».
 */
export function detectHungerReport(text: string): HungerReportHit | null {
  const raw = String(text ?? "");
  const haystack = normalize(raw);
  if (!haystack) return null;

  if (
    firstMatch(NEGATION_PATTERNS, haystack) ||
    firstMatch(HYPOTHETICAL_PATTERNS, haystack) ||
    firstMatch(REMOTE_PAST_PATTERNS, haystack) ||
    firstMatch(METAPHOR_PATTERNS, haystack)
  ) {
    return null;
  }

  const past = firstMatch(HUNGER_PAST_PATTERNS, haystack);
  if (past) {
    return { matched: past, gate: "past_tense", studentNote: raw.trim() };
  }

  const present = firstMatch(HUNGER_PRESENT_PATTERNS, haystack);
  if (!present) return null;
  const hasRecurrence = RECURRENCE_MARKERS.some((marker) =>
    haystack.includes(marker)
  );
  if (!hasRecurrence) return null;
  return { matched: present, gate: "recurrence", studentNote: raw.trim() };
}
