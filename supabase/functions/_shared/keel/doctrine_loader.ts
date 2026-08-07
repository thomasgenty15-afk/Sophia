/**
 * PIVOT NUTRITION §3.3 — charger la doctrine PUBLIÉE du coach d'un élève.
 *
 * La coquille d'I/O de `doctrine.ts`, séparée pour la même raison que partout
 * ailleurs dans `_shared/keel/`: la décision est pure et testable, la lecture
 * ne l'est pas.
 *
 * ── L'ARBITRAGE D'ABSENCE, CORRIGÉ LE 2026-08-05 ─────────────────────────
 * Que fait-on quand il n'y a pas de doctrine à injecter ?
 *
 * La première réponse de ce module était un bloc de PRUDENCE qui disait au
 * modèle « ne donne pas de conseil nutritionnel prescriptif, dis que c'est au
 * coach de trancher et invite l'élève à lui demander ». Mesuré en conversation
 * réelle, ça donne ceci, mot pour mot:
 *
 *   élève  : « I need some food advices »
 *   Sophia : « there isn't a coach method loaded right now, so I can't give
 *             you a prescribed nutrition protocol. Ask your coach. »
 *
 * Trois choses fausses dans une seule phrase, et la troisième est structurelle:
 *   1. l'élève repart sans réponse à une question qu'un livre de nutrition
 *      règle en deux lignes;
 *   2. « demande à ton coach » désigne une porte qui n'existe pas — il n'y a
 *      AUCUN canal 1:1 coach → élève (docs/keel/MODEL.md);
 *   3. la prudence protégeait le coach d'être CONTREDIT. Sans doctrine, il n'y
 *      a rien à contredire. On payait le prix d'un risque absent.
 *
 * Le bloc dit donc maintenant l'inverse: RÉPONDS, avec tes propres
 * connaissances, exactement comme si cet élève n'avait pas de coach. Ce qui
 * reste interdit est le seul vrai risque de la situation, et il est étroit:
 * mettre ses mots dans la bouche du coach. On répond en son nom propre, jamais
 * au nom d'une méthode qu'on n'a pas lue.
 *
 * Corollaire IMPORTANT côté verrou: quand la doctrine est absente, la ceinture
 * de sortie ne peut évidemment pas vérifier des interdits qu'elle n'a pas.
 * Le verrou MÉDICAL, lui, ne dépend pas de cette lecture (il vient de
 * `student_safety_constraints`) et reste armé. C'est l'asymétrie voulue: la
 * sécurité de l'élève ne s'appuie jamais sur la disponibilité d'une table du
 * coach — et c'est ELLE, pas le bâillon, qui protège l'élève.
 */

import {
  type CoachDoctrine,
  compileDoctrineBlock,
  type CompiledDoctrine,
  type DoctrineBelief,
  parseCoachDoctrine,
} from "./doctrine.ts";
import { type DoctrineOwner, resolveDoctrineOwner } from "./doctrine_delegation.ts";
import { GOAL_TOKENS, type GoalToken, goalScopeApplies } from "./tokens.ts";

export const DOCTRINE_LOAD_REASONS = [
  "loaded",
  "no_coach",
  "no_published_doctrine",
  "load_failed",
  "empty_doctrine",
  // La doctrine est là, elle est pleine, et RIEN dedans ne vise cet élève.
  // Distinct de `empty_doctrine` parce que les deux ne se disent pas pareil:
  // « ton coach n'a rien publié » est faux ici.
  "empty_for_goal",
] as const;
export type DoctrineLoadReason = (typeof DOCTRINE_LOAD_REASONS)[number];

/** D'où vient l'objectif qui a choisi la variante. Tracé, jamais deviné. */
export type DoctrineGoalSource =
  /** `student_goals.goal` de cet élève. */
  | "student_goals"
  /** Le coach en mode test a demandé une variante précise. */
  | "override"
  /** Pas d'objectif déclaré, ou lecture en panne: variante `default`. */
  | "none";

export interface LoadedDoctrine {
  doctrine: CoachDoctrine | null;
  compiled: CompiledDoctrine | null;
  coachId: string | null;
  /**
   * `coaches.display_name`, ou `null` s'il est vide ou illisible.
   *
   * Il était lu ici et consommé UNIQUEMENT par le bloc compilé. Il ressort
   * maintenant, parce qu'un second consommateur en a besoin: la substitution du
   * verrou (`resolveDoctrineReplacement`) poste les mots du coach mot pour mot
   * et les postait sans nom. Le re-lire ailleurs aurait donné deux requêtes et
   * deux définitions de « le nom du coach de cet élève ».
   *
   * `null` EST UNE VALEUR UTILE, pas un échec: un coach sans nom affiché ne se
   * signe pas. « — the coach » serait pire que rien.
   */
  coachDisplayName: string | null;
  reason: DoctrineLoadReason;
  /** Malformed entries dropped at parse time. Surfaced on the coach screen. */
  issues: string[];
  /** LA VARIANTE SERVIE. `null` = `default`. */
  goal: GoalToken | null;
  goalSource: DoctrineGoalSource;
}

export interface DoctrineLoadOptions {
  /**
   * LE MODE TEST DU COACH — la variante qu'il veut éprouver.
   *
   * §3.3: quand un coach parle à son propre agent, il n'a pas d'objectif, et
   * lui servir la `default` en silence l'empêcherait de vérifier précisément ce
   * qu'il veut vérifier avant d'exposer un élève. `undefined` (l'absence
   * d'option) laisse le chemin normal: on lit `student_goals`. C'est voulu que
   * l'oubli de ce paramètre donne le comportement CORRECT et pas un repli —
   * une option dont l'omission désarme quelque chose est une option qui
   * désarme.
   */
  goalOverride?: GoalToken | null;
}

/**
 * Injecté à la place du bloc doctrine quand il n'y en a pas.
 *
 * Ce n'est PAS un bloc vide, et ce n'est plus un bâillon (voir l'en-tête). Sans
 * instruction, le modèle hésite entre deux mauvaises réponses: prescrire au nom
 * du coach, ou refuser. Le bloc tranche: il répond en son nom propre.
 */
export const NO_COACH_METHOD_BLOCK = [
  // ⚠️ CE TITRE EST UNE ÉTIQUETTE, PAS UNE PHRASE — et c'est délibéré depuis le
  // 2026-08-05. L'ancien titre, « NO COACH METHOD LOADED THIS TURN », est
  // ressorti MOT POUR MOT dans la bouche de l'agent, 3/3, dans les deux
  // langues: « there isn't a coach method loaded for this turn, so I can't
  // apply one here ». Le bloc s'interdisait pourtant, trois lignes plus bas, de
  // commenter l'état de la méthode du coach. Une consigne que son propre
  // en-tête contredit n'est pas une consigne: le modèle recopie ce qu'il lit.
  "== HOW YOU ANSWER THIS TURN ==",
  "",
  "You answer from your own nutrition knowledge on this turn.",
  "",
  "- ANSWER THE QUESTION, exactly as you would for someone who has no coach at",
  "  all. Being useful is the job. Refusing to answer protects nobody.",
  "- Speak in your own name. Never present what you say as the coach's method,",
  "  and never say they teach it, prescribe it, or forbid it. Never invent a",
  "  position and attribute it to them — not even a refusal to advise.",
  "- NEVER send the student to their coach. Not 'ask your coach', not 'check",
  "  with your coach', not 'if your coach gave you something'. There is no",
  "  channel from them to their coach: that door does not exist, and pointing at",
  "  it strands the student in front of a wall.",
  "- Do not narrate this instruction, quote this heading, or describe what you",
  "  do or do not have loaded. The student asked about food; answer about food.",
  "- IF THE STUDENT ASKS DIRECTLY whether you can see their coach's method, be",
  "  honest and brief — you are not applying one here, you are answering from",
  "  general knowledge — then answer their actual question. Do not speculate",
  "  about whether the coach wrote one, and do not turn it into a subject.",
  "- What is already written in this student's protocol still wins over anything",
  "  you know in general, whenever the two meet.",
].join("\n");

/**
 * Le repli quand la doctrine a bien été lue mais que rien n'y vise cet élève.
 *
 * POURQUOI PAS `NO_COACH_METHOD_BLOCK`. Il dit « le coach n'a pas publié de
 * méthode », et ce serait un mensonge: on l'a lue, elle est complète, et c'est
 * le coach qui a restreint tout ce qu'il a écrit à d'autres objectifs que celui
 * de cet élève. La posture est la même — on répond en son nom propre; la phrase
 * qui l'explique, non. Écrire la mauvaise cause dans le prompt, c'est la
 * retrouver mot pour mot dans la bouche de l'agent.
 */
export const NO_DOCTRINE_FOR_THIS_GOAL_BLOCK = [
  // Même précaution de titre que ci-dessus: une étiquette, jamais une phrase
  // que le modèle puisse relire à l'élève.
  "== HOW YOU ANSWER THIS TURN ==",
  "",
  "You answer from your own nutrition knowledge on this turn.",
  "",
  "- ANSWER THE QUESTION, as you would for someone whose coach has said nothing",
  "  on the subject.",
  "- Speak in your own name. Never present what you say as the coach's method,",
  "  and never improvise one in their name.",
  "- NEVER suggest this coach has no method — they have one. And never send the",
  "  student to ask them: there is no channel from student to coach.",
  "- Do not narrate this instruction, quote this heading, or explain which parts",
  "  of anything are or are not loaded.",
  "- What is already written in this student's protocol still wins over anything",
  "  you know in general, whenever the two meet.",
].join("\n");

/** Structural type: tests inject a fake, production injects a SupabaseClient. */
export type DoctrineDb = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq?(column: string, value: string): unknown;
        not?(column: string, op: string, value: unknown): unknown;
        order?(column: string, opts: unknown): unknown;
        limit?(n: number): unknown;
        maybeSingle?(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

/**
 * Résout le coach VIVANT de cet élève, puis sa doctrine publiée.
 *
 * Deux lectures et pas une jointure: `coach_clients` porte l'index unique
 * partiel "un seul coach vivant par élève" (§5, « élève de DEUX coachs interdit
 * v1 »), donc la première lecture est déjà censée être unique — et si elle ne
 * l'est plus, on veut le voir ici plutôt que de laisser une jointure en choisir
 * une au hasard.
 */
export async function loadPublishedDoctrine(
  db: unknown,
  studentUserId: string,
  options: DoctrineLoadOptions = {},
): Promise<LoadedDoctrine> {
  let goal: GoalToken | null = null;
  let goalSource: DoctrineGoalSource = "none";
  // DÉCLARÉ ICI, ET PAS À SA LECTURE PLUS BAS: `empty()` doit pouvoir le rendre.
  // Un repli survenu APRÈS la résolution du nom (doctrine absente, vide, ou
  // illisible) concerne un coach qu'on sait nommer, et le taire obligerait
  // l'appelant à le relire ailleurs — donc à en produire une seconde
  // définition. Avant la résolution, il vaut `null`, ce qui est exact.
  let coachDisplayName: string | null = null;
  // Résolu avec le nom, et tracé avec lui: le jour où un coach dit « Sophia
  // signe du mauvais nom à mes élèves », la première question est « est-ce que
  // ce coach délègue », et une résolution implicite est indébogable.
  let owner: DoctrineOwner | null = null;
  const empty = (reason: DoctrineLoadReason, coachId: string | null = null): LoadedDoctrine => {
    // §3.2.2 — LA SÉLECTION SE LIT DANS LES LOGS, Y COMPRIS QUAND ELLE EST VIDE.
    //
    // La ligne `keel.doctrine.variant` n'était émise que sur le chemin nominal:
    // `no_coach`, `no_published_doctrine` et `load_failed` sortaient AVANT elle.
    // Autrement dit, le cas précisément sous test lors de la campagne du
    // 2026-08-05 — l'élève dont le coach n'a rien publié — ne laissait AUCUNE
    // trace: 0 ligne sur 18 tours. On ne pouvait pas distinguer « le bloc de
    // repli a été servi » de « le chargeur n'a jamais tourné ».
    console.info("keel.doctrine.variant", {
      coach_id: coachId,
      variant: goal ?? "default",
      goal_source: goalSource,
      cache_key: null,
      reason,
      doctrine_coach_id: owner?.doctrineCoachId ?? null,
      delegated: owner?.delegated ?? false,
      beliefs_kept: 0,
      beliefs_total: 0,
      arbitrations_kept: 0,
      arbitrations_total: 0,
      empty_for_goal: false,
    });
    return {
      doctrine: null,
      compiled: null,
      coachId,
      coachDisplayName,
      reason,
      issues: [],
      goal,
      goalSource,
    };
  };

  const id = String(studentUserId ?? "").trim();
  if (!id) return empty("no_coach");

  // deno-lint-ignore no-explicit-any
  const client = db as any;

  // ── L'OBJECTIF, ET POURQUOI IL SE LIT ICI ───────────────────────────────
  //
  // Il aurait pu être un argument que chaque appelant passe. Trois appelants le
  // passeraient, et le quatrième — celui qu'on ajoutera dans six mois — servira
  // la mauvaise doctrine sans que rien n'échoue. Ce dépôt a déjà payé « la
  // doctrine ne gouvernait qu'une lane sur trois ». La lecture est donc DANS le
  // chargeur: un consommateur ne peut plus l'oublier, il peut seulement la
  // remplacer explicitement (mode test).
  if (options.goalOverride !== undefined) {
    goal = options.goalOverride;
    goalSource = goal === null ? "none" : "override";
  } else {
    try {
      const { data, error } = await client
        .from("student_goals")
        .select("goal")
        .eq("user_id", id)
        .maybeSingle();
      if (error) throw error;
      const raw = String((data as Record<string, unknown> | null)?.goal ?? "").trim();
      if (raw && (GOAL_TOKENS as readonly string[]).includes(raw)) {
        goal = raw as GoalToken;
        goalSource = "student_goals";
      } else if (raw) {
        // Un objectif que ce build ne connaît pas: on sert la `default`. Servir
        // une variante au hasard serait pire, et prétendre qu'il n'a pas
        // d'objectif est exactement ce qu'on fait — c'est vrai du point de vue
        // de la doctrine, qui n'a rien écrit pour celui-là.
        console.warn("[keel/doctrine] unknown student goal, serving default variant", raw);
      }
    } catch (error) {
      // Une lecture d'objectif en panne DÉGRADE vers la variante `default`,
      // elle n'interrompt pas le tour. Direction sûre: l'élève perd les
      // croyances ciblées, il n'en reçoit jamais qui ne le visent pas.
      console.warn("[keel/doctrine] student goal unreadable, serving default variant", error);
    }
  }

  let coachId: string | null = null;
  try {
    const { data, error } = await client
      .from("coach_clients")
      .select("coach_id")
      .eq("student_user_id", id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    coachId = String((data as Record<string, unknown> | null)?.coach_id ?? "").trim() || null;
  } catch (error) {
    console.warn("[keel/doctrine] coach lookup failed", error);
    return empty("load_failed");
  }
  if (!coachId) return empty("no_coach");

  // LE NOM DU COACH, ET LA DOCTRINE QU'IL SERT — la même résolution.
  //
  // `coach_doctrines` ne porte pas de nom — c'est `coaches.display_name` qui
  // l'a. Sans cette lecture, le bloc compilé s'ouvre sur "THE COACH'S METHOD"
  // au lieu de "MARC'S METHOD", et le produit qu'on vend est précisément que
  // l'élève parle à l'agent DE SON COACH. Trouvé par la semaine simulée §7.4,
  // qui assertait le nom dans le bloc: les tests unitaires passaient le nom en
  // argument et ne pouvaient pas voir qu'aucun appelant réel ne le faisait.
  //
  // LES DEUX RÉPONSES SORTENT ENSEMBLE, et c'est le point: un coach qui DÉLÈGUE
  // à la maison sert la doctrine de la maison ET signe de son nom. Les séparer
  // permettrait l'état incohérent — la méthode de la maison sous le nom du
  // coach — qui est exactement le mensonge que la délégation existe pour éviter.
  owner = await resolveDoctrineOwner(client, coachId);
  coachDisplayName = owner.displayName;
  // Un coach qui délègue alors que la maison est introuvable n'a AUCUNE
  // doctrine à servir. Retomber sur la sienne — qui dort, exprès, pour que la
  // bascule soit réversible — servirait à ses élèves une méthode qu'il a
  // explicitement retirée. Voir `decideDoctrineOwner`.
  if (!owner.doctrineCoachId) return empty("no_published_doctrine", coachId);

  let row: Record<string, unknown> | null = null;
  try {
    const { data, error } = await client
      .from("coach_doctrines")
      .select(
        // `foods` et `qa` font partie de la sélection, sinon le parseur les
        // voit absentes et le VERROU sur les aliments déconseillés se retrouve
        // désarmé — sans que rien ne le signale.
        //
        // `daily_practices` (FF-001) est là pour la MÊME raison, et son oubli
        // aurait le même goût: le message du soir cesserait de porter la voix du
        // coach, sans erreur nulle part, et le symptôme lu serait « la
        // fonctionnalité ne marche pas » plutôt que « une colonne manque au
        // SELECT ». C'est la classe de défaut la plus chère de ce fichier.
        "coach_id, version, beliefs, forbidden, vocabulary, arbitrations, foods, qa, " +
          "daily_practices, voice, " +
          "compiled_prompt, compiled_prompt_hash, content_locale, published_at",
      )
      .eq("coach_id", owner.doctrineCoachId)
      .not("published_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = (data ?? null) as Record<string, unknown> | null;
  } catch (error) {
    console.warn("[keel/doctrine] doctrine load failed", error);
    return empty("load_failed", coachId);
  }
  if (!row) return empty("no_published_doctrine", coachId);

  // ── LES ALIMENTS ÉCARTÉS VIENNENT DE L'ÉCRAN ALIMENTS, PLUS DE LA DOCTRINE ──
  //
  // « Quels aliments tu écartes » n'est pas une conviction, c'est une liste. La
  // poser dans l'entretien de doctrine mélangeait une opinion et un inventaire,
  // et obligeait le coach à la tenir à deux endroits: une fois en prose ici, une
  // fois en pastilles sur `/coach/protocol`.
  //
  // La source est désormais UNIQUE: `coach_food_items` en `stance='excluded'`
  // — l'écran l'affiche « Never ». Le verrou de sortie ne change pas d'un iota:
  // il lit toujours `doctrine.foods.discouraged`, qui est simplement alimenté
  // d'ailleurs.
  //
  // ⚠️ CE QU'ON PERD, ET POURQUOI C'EST ACCEPTABLE ICI. Un `DoctrineFood` porte
  // des `surfaceForms` — les autres façons d'écrire un aliment, qui rendent le
  // matcher capable d'attraper « huile végétale » sur un interdit posé comme
  // « huiles de graines ». Un item d'aliment n'en a pas: il porte un `label`.
  //
  // C'est tolérable parce que les deux cas ne se ressemblent pas. La prose que
  // le coach tapait dans l'entretien était libre, donc il FALLAIT lui demander
  // ses variantes. Un item vient d'un CATALOGUE FERMÉ (`food_items`), avec un
  // libellé curé et stable — il n'y a pas de variante à deviner.
  //
  // NE THROW JAMAIS: une lecture d'aliments cassée dégrade la liste, elle ne
  // doit pas coûter sa doctrine au coach. Même arbitrage de panne que le nom.
  //
  // ⚠️ LU POUR `owner.doctrineCoachId`, PAS POUR `coachId`. Un coach qui délègue
  // à la maison remplace la source ENTIÈRE de sa doctrine — ses propres aliments
  // écartés partent avec le reste. Lire les siens ici produirait un hybride que
  // personne n'a écrit: la méthode de la maison, plus les exclusions d'un coach
  // dont l'agent ne prononce même plus le nom.
  let excludedFoods: Array<{ term: string }> = [];
  try {
    const { data, error } = await client
      .from("coach_food_items")
      .select("label")
      .eq("coach_id", owner.doctrineCoachId)
      .eq("stance", "excluded");
    if (error) throw error;
    excludedFoods = ((data ?? []) as Array<Record<string, unknown>>)
      .map((r) => ({ term: String(r.label ?? "").trim() }))
      .filter((f) => f.term.length > 0);
  } catch (error) {
    console.warn("[keel/doctrine] excluded foods unreadable", error);
  }

  const { doctrine, issues } = parseCoachDoctrine({
    ...row,
    // La colonne `foods` de `coach_doctrines` n'est plus la source. On la
    // REMPLACE au lieu de fusionner: deux sources pour une même liste, c'est
    // la divergence garantie le jour où un coach retire un aliment d'un écran
    // et le voit rester actif parce que l'autre le porte encore.
    foods: { discouraged: excludedFoods },
    coach_display_name: coachDisplayName,
  });
  const compiled = compileDoctrineBlock(doctrine, goal);

  // §3.2.2 — LA SÉLECTION SE LIT DANS LES LOGS.
  //
  // Le jour où un coach dit « Sophia ne dit pas ça à mes élèves », la première
  // question est « laquelle de tes six variantes a servi, et pourquoi ». Sans
  // cette ligne, la réponse demande de rejouer le tour en devinant l'état de
  // `student_goals` à ce moment-là. `goal_source` est là pour distinguer
  // « il est en perte de gras » de « on n'a pas su lire son objectif ».
  console.info("keel.doctrine.variant", {
    coach_id: coachId,
    variant: goal ?? "default",
    goal_source: goalSource,
    cache_key: compiled.hash,
    // De QUI vient la doctrine servie, et sous quel nom elle sort. Sans ces
    // deux champs, une délégation est invisible dans les logs et « pourquoi
    // mon agent signe Sophia » se rejoue à la main.
    doctrine_coach_id: owner.doctrineCoachId,
    delegated: owner.delegated,
    // Même clé que sur les chemins vides, pour qu'un `grep` unique réponde à
    // « quelle variante, et pourquoi » sans avoir à connaître deux formats.
    reason: compiled.emptyForGoal
      ? "empty_for_goal"
      : compiled.isEmpty
      ? "empty_doctrine"
      : "loaded",
    beliefs_kept: doctrine.beliefs.filter((b) => goalScopeApplies(b.goalScope, goal)).length,
    beliefs_total: doctrine.beliefs.length,
    arbitrations_kept:
      doctrine.arbitrations.filter((a) => goalScopeApplies(a.goalScope, goal)).length,
    arbitrations_total: doctrine.arbitrations.length,
    empty_for_goal: compiled.emptyForGoal,
  });

  return {
    doctrine,
    compiled,
    coachId,
    coachDisplayName,
    // A published-but-empty doctrine is a real state (the coach clicked
    // publish on a blank form) and it must not be reported as "loaded": the
    // no-method block is the right injection, exactly as if none existed.
    //
    // `empty_for_goal` s'en sépare: la doctrine EXISTE, elle est simplement
    // toute entière écrite pour d'autres objectifs. Même prudence, autre
    // phrase (voir `NO_DOCTRINE_FOR_THIS_GOAL_BLOCK`).
    reason: compiled.emptyForGoal ? "empty_for_goal" : compiled.isEmpty ? "empty_doctrine" : "loaded",
    issues,
    goal,
    goalSource,
  };
}

/**
 * Le bloc à injecter dans la couche `[DOCTRINE COACH]`, quel que soit le
 * résultat de la lecture. Un seul appel, jamais de `?? ""` chez l'appelant.
 *
 * Le `?? ""` reste interdit, mais pour la raison INVERSE d'avant. On ne craint
 * plus que le modèle réponde de sa culture générale — c'est exactement ce qu'on
 * lui demande quand il n'y a pas de méthode. On craint qu'il le fasse SANS
 * cadre: sans ce bloc, rien ne lui dit de parler en son nom propre plutôt qu'au
 * nom d'un coach qu'il n'a pas lu.
 */
export function doctrineBlockFor(loaded: LoadedDoctrine): string {
  if (loaded.reason === "loaded" && loaded.compiled) return loaded.compiled.text;
  if (loaded.reason === "empty_for_goal") return NO_DOCTRINE_FOR_THIS_GOAL_BLOCK;
  return NO_COACH_METHOD_BLOCK;
}

/**
 * LES CROYANCES QUI S'APPLIQUENT À CET ÉLÈVE — et pourquoi cette fonction
 * existe alors que `loaded.doctrine.beliefs` est juste là.
 *
 * ── LE TROU QU'ELLE FERME ────────────────────────────────────────────────
 * Le bloc de prompt est filtré par la portée; la LISTE de croyances, non. Or
 * deux appelants ne lisent pas le bloc, ils lisent la liste:
 *
 *   `generate-week-plan-v1` — chaque ligne de semaine est TRACÉE à la clé de
 *      la conviction qui la produit (CHECK `..._doctrine_traceable_check`).
 *   `generate-meal-v1`      — même chose pour une ligne de méthode d'un plat.
 *
 * Sans filtrage, un élève `health` recevait un plan dont les lignes se
 * réclament d'une conviction écrite pour `fat_loss`: la portée tenait dans la
 * conversation et fuyait dans le plan. C'est la forme exacte de la cicatrice
 * « la doctrine ne gouvernait qu'une lane sur trois », et elle serait revenue
 * par la porte de derrière.
 *
 * Elle rend la liste EXACTEMENT alignée sur le bloc servi: ce que l'agent a
 * dans son prompt est ce que le générateur peut citer, et rien d'autre.
 */
export function doctrineBeliefsFor(loaded: LoadedDoctrine): readonly DoctrineBelief[] {
  if (loaded.reason !== "loaded" || !loaded.doctrine) return [];
  return loaded.doctrine.beliefs.filter((b) => goalScopeApplies(b.goalScope, loaded.goal));
}
