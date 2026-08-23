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
  /**
   * LOT C ① — LE BLOC DES LIGNES QUI VISENT UNE **AUTRE** BOUCHE DE LA TABLE.
   *
   * `""` partout sauf sur un foyer dont une bouche porte un objectif que le
   * titulaire n'a pas ET dont le coach a écrit quelque chose pour cet
   * objectif-là. C'est-à-dire: `""` pour toute la lane individuelle, pour la
   * conversation, pour les crons, et pour la majorité des foyers.
   *
   * ⚠️ IL EST RENDU À PART DE `compiled`, ET PAS CONCATÉNÉ DEDANS. `compiled`
   * porte un `hash` qui est LA clé de cache et LE signal d'invalidation de la
   * doctrine du coach; y coller un texte qui dépend de QUI est à table
   * fabriquerait une clé par foyer pour une doctrine qui n'a pas bougé. La
   * jonction se fait une seule fois, dans `doctrineBlockFor`.
   */
  tableScopeBlock: string;
  /**
   * LOT C ① — LES CROYANCES DE CE BLOC-LÀ, pour que `doctrineBeliefsFor` puisse
   * les autoriser à la citation (`honours_belief_keys`).
   *
   * Sans elles, une ligne servie au modèle serait une ligne que le parseur
   * refuse de laisser citer: le plan porterait la conviction sans pouvoir la
   * tracer, et le CHECK `..._doctrine_traceable_check` la jetterait. Un bloc
   * injecté dont les clés sont interdites est un bloc qu'on paie sans l'avoir.
   */
  tableScopeBeliefs: readonly DoctrineBelief[];
}

/**
 * LOT C ① — UNE AUTRE BOUCHE À CETTE TABLE, ET L'OBJECTIF QU'ELLE PORTE.
 *
 * `who` est le PRÉNOM tel que le prompt le nomme déjà ailleurs (la liste d'ids,
 * le brief de portions, les règles de maison). Il est passé par l'appelant et
 * jamais relu ici: ce module ne connaît pas de foyer, il connaît des objectifs.
 * L'y résoudre ferait une seconde définition de « comment s'appelle cette
 * bouche », et ce dépôt a déjà payé deux prénoms pour une personne.
 */
export interface DoctrineTableMouth {
  goal: GoalToken;
  who: string;
}

export interface DoctrineLoadOptions {
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT C ① — LES AUTRES BOUCHES DE LA TABLE. MESURÉ LE 2026-08-19.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT QUE CE CHAMP FERME. La doctrine est compilée sur l'objectif du
   * TITULAIRE DU COMPTE — c'est `student_goals.goal` que ce fichier lit trente
   * lignes plus bas — et le foyer entier reçoit cette variante-là. Sur le foyer
   * de l'étape ⑤ (titulaire en `fat_loss`, un athlète en `muscle_gain` à
   * table), la croyance `starch_follows_the_session`, `goal_scope:
   * ["muscle_gain"]`, était ABSENTE des 6 prompts sur 6:
   *
   *     == THE CONVICTION KEYS YOU MAY NAME ==
   *     ["name_the_plate_out_loud","one_loud_vegetable"]
   *
   * La ligne que le coach a écrite EXPRÈS pour la prise de muscle n'atteint
   * jamais le plan d'un foyer où quelqu'un prend du muscle, sauf si c'est le
   * titulaire. Ce n'est pas un branchement mort — `goalScopeApplies` est bien
   * appelé, 84 occurrences vivantes — c'est une PORTÉE MAL CHOISIE.
   *
   * ⚠️ CE N'EST PAS UNE SECONDE DOCTRINE, ET C'EST LA CONTRAINTE DURE. Un foyer
   * suit UNE méthode, celle du référent: le coach, son bloc, sa voix, ses
   * interdits et son nom ne bougent pas d'un octet. Ce qui suit la bouche est le
   * FILTRE PAR OBJECTIF appliqué à ses croyances — rien d'autre.
   *
   * ⚠️ LES LIGNES AINSI RETROUVÉES NE REJOIGNENT PAS LE BLOC PRINCIPAL, elles
   * partent dans une section À PART qui NOMME la bouche. Les fondre dans
   * « WHAT THIS COACH BELIEVES » ferait appliquer à toute la table une ligne
   * écrite pour un seul objectif — c'est-à-dire échanger une portée trop
   * étroite contre une portée trop large, sur un prompt qui annonce déjà
   * « goal: fat_loss » quinze lignes plus haut.
   *
   * ⚠️ OPTIONNEL, ET LE DÉFAUT EST LE COMPORTEMENT CORRECT — même arbitrage,
   * mot pour mot, que `goalOverride` juste en dessous. Onze appelants sur douze
   * n'ont pas de table: leur omission doit rendre le bloc d'AVANT ce lot, octet
   * pour octet, et un test le tient. La lane qui en a une passe par
   * `loadHouseholdDoctrine` (`household_doctrine.ts`), dont le paramètre est
   * REQUIS — c'est là que la casse de compilation recense les appelants qui
   * comptent.
   */
  tableGoals?: readonly DoctrineTableMouth[];
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
 * LA BORNE D'UNE EXCLUSION, quand le coach en a posé une.
 *
 * Rend `""` pour une exclusion absolue — le cas de loin le plus courant, et
 * celui où le bloc ne doit rien gagner: `- Lentilles` doit rester `- Lentilles`,
 * octet pour octet, pour tous les coachs qui n'ont pas touché aux gabarits.
 *
 * Elle est rédigée en anglais, comme TOUT l'échafaudage de
 * `compileDoctrineBlock` (« also: », « Never suggest these to the student »):
 * c'est une consigne au modèle, pas une phrase montrée à l'élève. Le contenu du
 * coach, lui, reste dans sa langue.
 *
 * R7 par omission volontaire: un gabarit connu dont la colonne obligatoire
 * manque rend `""` plutôt qu'une borne à moitié écrite. Le CHECK
 * `coach_food_items_slots_match_frequency` garantit l'appariement à l'écriture;
 * si une ligne y échappait, une exclusion ABSOLUE est la lecture prudente — on
 * ne relâche jamais une exclusion sur une donnée qu'on n'a pas su lire.
 */
function exclusionBound(row: Record<string, unknown>): string {
  const template = String(row.frequency_template ?? "").trim();
  if (template === "not_after") {
    const cutoff = String(row.cutoff_local ?? "").trim().slice(0, 5);
    return cutoff ? `not after ${cutoff}, fine before that` : "";
  }
  if (template === "at_slot") {
    const slot = String(row.slot_key ?? "").trim();
    return slot ? `at the ${slot.replaceAll("_", " ")} slot only` : "";
  }
  return "";
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C ① — LA SECTION QUI REND SA LIGNE À LA BOUCHE QUI LA PORTE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Elle ne rend QUE ce que la variante du titulaire a laissé tomber: une entrée
 * déjà gardée par `goalScopeApplies(scope, goal)` n'y entre jamais, sinon elle
 * paraîtrait deux fois dans le même prompt, une fois pour tout le monde et une
 * fois nommée — et le modèle lit une répétition comme une insistance.
 *
 * ⚠️ ELLE NOMME LA BOUCHE, ET C'EST TOUTE LA DIFFÉRENCE AVEC UN FILTRE ÉLARGI.
 * « Sur une phase de prise de muscle l'amidon va où est l'entraînement » servi
 * nu, dans un prompt qui annonce `goal: fat_loss` à la table, est une consigne
 * que le modèle applique à la casserole commune. Servi comme
 * `- Ivar (muscle_gain): …`, c'est une consigne qui a un destinataire, et le
 * prompt nomme déjà Ivar quatre fois ailleurs avec le même prénom.
 *
 * ⚠️ LA DERNIÈRE PHRASE DU BLOC N'EST PAS DÉCORATIVE. Tout ce qui nomme une
 * personne ET une raison finit, mesuré quatre runs sur quatre, dans un champ lu
 * à voix haute à table (`dishes[].why`, `portion_note`). Le bloc porte donc son
 * propre interdit de sortie, au plus près de ce qu'il autorise.
 *
 * ⚠️ AUCUN OBJECTIF N'EST DEVINÉ ICI. Les jetons arrivent déjà validés contre
 * `GOAL_TOKENS` par leur lecteur (le roster, ou `student_goals`); ce module ne
 * fait que grouper. Un `who` vide fait tomber la bouche — un bloc qui dirait
 * « (muscle_gain): … » sans nom serait exactement la ligne anonyme qu'on
 * remplace.
 */
export function tableScopeSection(
  doctrine: CoachDoctrine,
  goal: GoalToken | null,
  tableGoals: readonly DoctrineTableMouth[],
): { block: string; beliefs: DoctrineBelief[]; mouths: DoctrineTableMouth[] } {
  const mouths: DoctrineTableMouth[] = [];
  const seen = new Set<string>();
  for (const raw of tableGoals) {
    const who = String(raw?.who ?? "").trim().slice(0, 60);
    const g = raw?.goal;
    if (!who || !(GOAL_TOKENS as readonly string[]).includes(String(g))) continue;
    // LA VARIANTE DU TITULAIRE COUVRE DÉJÀ CETTE BOUCHE: rien à rattraper.
    if (g === goal) continue;
    const key = `${g}|${who}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mouths.push({ goal: g as GoalToken, who });
  }
  if (mouths.length === 0) return { block: "", beliefs: [], mouths: [] };

  /** Qui, à cette table, rend cette portée applicable — dans l'ordre du roster. */
  const carriers = (scope: readonly string[]): DoctrineTableMouth[] =>
    mouths.filter((m) => goalScopeApplies(scope, m.goal));

  const beliefs = doctrine.beliefs.filter(
    (b) => !goalScopeApplies(b.goalScope, goal) && carriers(b.goalScope).length > 0,
  );
  const arbitrations = doctrine.arbitrations.filter(
    (a) => !goalScopeApplies(a.goalScope, goal) && carriers(a.goalScope).length > 0,
  );
  if (beliefs.length === 0 && arbitrations.length === 0) {
    return { block: "", beliefs: [], mouths };
  }

  const label = (scope: readonly string[]): string =>
    carriers(scope).map((m) => `${m.who} (${m.goal})`).join(", ");

  const lines: string[] = [
    "-- WHAT THIS COACH WROTE FOR SOME OF THESE MOUTHS ONLY --",
    "This is the SAME coach and the SAME method as above. Each line below is " +
      "written for one goal, and only the people named in front of it carry " +
      "that goal at this table.",
    "Apply it to THEIR share and to their own dish. Never to the table's dish, " +
      "and never to anyone else — the people not named do not follow it.",
    "Never write the goal, the reason, or the fact that a line is theirs in " +
      "anything read at the table.",
  ];
  for (const b of beliefs) {
    const claim = b.rationale ? `${b.claim} (${b.rationale})` : b.claim;
    lines.push(`- ${label(b.goalScope)}: ${claim}`);
  }
  for (const a of arbitrations) {
    lines.push(`- ${label(a.goalScope)} — situation: ${a.situation}`);
    lines.push(`  He answers: ${a.coachAnswer}`);
  }
  return { block: lines.join("\n"), beliefs, mouths };
}

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
      // LOT C ① — TRACÉ MÊME À ZÉRO. Sans ce nombre sur les chemins vides,
      // « ce foyer n'a pas d'autre objectif à table » et « l'appelant a oublié
      // de passer la table » laissent la même trace, et ils se réparent
      // différemment.
      table_goals: 0,
      table_scope_beliefs: 0,
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
      // Pas de doctrine lue ⇒ rien à rattraper pour personne. Le repli servi
      // est un bloc entier (`NO_COACH_METHOD_BLOCK`), pas un bloc à compléter.
      tableScopeBlock: "",
      tableScopeBeliefs: [],
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
  //
  // ── LE GABARIT VOYAGE AVEC L'ALIMENT, ET IL NE LE FAISAIT PAS ────────────
  //
  // Ce `select` ne prenait que `label`. `coach_food_items` porte pourtant un
  // `frequency_template` sous CHECK (`..._slots_match_frequency`), dont deux
  // valeurs BORNENT l'exclusion au lieu de la rendre absolue: `not_after`
  // (avec `cutoff_local`) et `at_slot` (avec `slot_key`).
  //
  // MESURÉ LE 2026-08-13, run `doctrine5`: un coach dont TOUT le parti pris est
  // une heure (« matin chargé, soir minimal ») avait posé « Viande rouge au
  // dîner », `not_after 19:00`. Le bloc servi à son élève disait:
  //     -- FOODS THIS COACH DOES NOT PUT ON A PLATE --
  //     Never suggest these to the student.
  //     - Viande rouge au dîner
  // Le coach a écrit « pas après 19h »; l'agent lisait « jamais ». Sur cette
  // doctrine-là, c'est la doctrine elle-même qui sortait déformée.
  //
  // ⚠️ LA BORNE VA DANS `reason`, JAMAIS DANS `term`. `term` est ce que le
  // VERROU DÉTERMINISTE de sortie matche dans la prose générée
  // (`forbidden_matcher.ts`); y coller « (pas après 19:00) » changerait la
  // chaîne cherchée et désarmerait le verrou sur l'aliment lui-même.
  // `compileDoctrineBlock` rend `- ${term} — ${reason}`: la borne arrive donc
  // dans le prompt, à côté de l'aliment, sans toucher à ce qui est matché.
  //
  // ⚠️ LE `why` DU COACH N'EST PAS ÉCRASÉ: quand il en a écrit un, les deux se
  // suivent. Perdre sa phrase pour poser une heure serait échanger un défaut
  // contre un autre.
  let excludedFoods: Array<{ term: string; reason: string | null }> = [];
  try {
    const { data, error } = await client
      .from("coach_food_items")
      .select("label, why, frequency_template, cutoff_local, slot_key")
      .eq("coach_id", owner.doctrineCoachId)
      .eq("stance", "excluded");
    if (error) throw error;
    excludedFoods = ((data ?? []) as Array<Record<string, unknown>>)
      .map((r) => {
        const bound = exclusionBound(r);
        const why = String(r.why ?? "").trim();
        const reason = [bound, why].filter(Boolean).join(" — ") || null;
        return { term: String(r.label ?? "").trim(), reason };
      })
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
  // LOT C ① — CE QUE LA VARIANTE DU TITULAIRE A LAISSÉ TOMBER, ET QUI VISE
  // QUELQU'UN D'AUTRE À CETTE TABLE. `[]` hors foyer ⇒ `{block: "", ...}`, et le
  // reste de cette fonction est alors byte-identique à celui d'avant ce lot.
  const tableScope = tableScopeSection(doctrine, goal, options.tableGoals ?? []);

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
    //
    // ⚠️ LOT C ① — LA RAISON SUIT LE BLOC RÉELLEMENT SERVI. Une doctrine
    // entièrement écrite pour `muscle_gain`, servie à un foyer dont le
    // titulaire est en `fat_loss` et dont l'athlète est à table, N'EST PAS
    // « vide pour cet objectif »: elle a du contenu pour cette table. Laisser
    // `empty_for_goal` ici ferait injecter `NO_DOCTRINE_FOR_THIS_GOAL_BLOCK` À
    // LA PLACE du bloc qu'on vient de reconstituer — un lot branché puis
    // désarmé par le champ d'à côté.
    reason: doctrineReasonFor(compiled, tableScope.block),
    beliefs_kept: doctrine.beliefs.filter((b) => goalScopeApplies(b.goalScope, goal)).length,
    beliefs_total: doctrine.beliefs.length,
    arbitrations_kept:
      doctrine.arbitrations.filter((a) => goalScopeApplies(a.goalScope, goal)).length,
    arbitrations_total: doctrine.arbitrations.length,
    empty_for_goal: compiled.emptyForGoal,
    // LOT C ① — DEUX NOMBRES, ET ILS NE DISENT PAS LA MÊME CHOSE. « La table a
    // trois autres objectifs » et « le coach a écrit trois lignes pour eux »
    // sont deux faits distincts: le premier à zéro veut dire « personne d'autre
    // n'a d'objectif ici », le second à zéro veut dire « ce coach n'a rien
    // écrit pour eux ». Un seul compteur rendrait le même zéro pour les deux.
    table_goals: tableScope.mouths.length,
    table_scope_beliefs: tableScope.beliefs.length,
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
    // ⚠️ LOT C ① — LA MÊME EXPRESSION QUE LA LIGNE DE JOURNAL, ET C'EST LE
    // POINT: elle valait `compiled.emptyForGoal ? … : …` ici et là-haut, deux
    // copies d'une même règle. Une seule fonction, deux lecteurs.
    reason: doctrineReasonFor(compiled, tableScope.block),
    issues,
    goal,
    goalSource,
    tableScopeBlock: tableScope.block,
    tableScopeBeliefs: tableScope.beliefs,
  };
}

/**
 * LOT C ① — LA RAISON SERVIE, EN UN SEUL ENDROIT.
 *
 * Elle se lit à DEUX endroits (la ligne de journal, la valeur de retour) et
 * elle y était écrite deux fois. Ce lot lui ajoute une troisième entrée — le
 * bloc de table — et deux copies d'une règle à trois branches divergent au
 * premier changement, en silence, du côté qu'on regarde le moins.
 *
 * ⚠️ LE BLOC DE TABLE FAIT PENCHER VERS `loaded`, ET C'EST DÉLIBÉRÉ. Une
 * doctrine dont TOUTES les croyances visent `muscle_gain`, lue pour un
 * titulaire en `fat_loss`, rendait `empty_for_goal` — donc le bloc « ton coach
 * n'a rien écrit sur ce sujet ». Si l'athlète est à table, c'est faux: on a
 * quelque chose à servir, nommé, et c'est ce bloc-là qui doit partir.
 */
function doctrineReasonFor(
  compiled: CompiledDoctrine,
  tableScopeBlock: string,
): DoctrineLoadReason {
  if (tableScopeBlock.length > 0) return "loaded";
  if (compiled.emptyForGoal) return "empty_for_goal";
  if (compiled.isEmpty) return "empty_doctrine";
  return "loaded";
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
  if (loaded.reason === "loaded" && loaded.compiled) {
    // LOT C ① — LA JONCTION, ET ELLE N'A QU'UN SEUL ENDROIT. `tableScopeBlock`
    // vaut `""` pour toute la lane individuelle, la conversation et les crons:
    // la chaîne rendue y est alors `compiled.text` sans un octet de plus, et un
    // test le tient par égalité de chaîne.
    return loaded.tableScopeBlock
      ? `${loaded.compiled.text}\n\n${loaded.tableScopeBlock}`
      : loaded.compiled.text;
  }
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
 *
 * ⚠️ LOT C ① — « LE BLOC SERVI » INCLUT LE BLOC DE TABLE, et l'oublier ici
 * aurait désarmé le lot par le champ d'à côté: le modèle recevrait la ligne
 * écrite pour l'athlète, composerait un plat qui s'en réclame, et le parseur
 * jetterait la clé parce qu'elle n'est pas dans la liste autorisée. Le plan
 * porterait la conviction sans pouvoir la tracer — c'est-à-dire qu'on paierait
 * le bloc sans le recevoir.
 */
export function doctrineBeliefsFor(loaded: LoadedDoctrine): readonly DoctrineBelief[] {
  if (loaded.reason !== "loaded" || !loaded.doctrine) return [];
  const own = loaded.doctrine.beliefs.filter((b) => goalScopeApplies(b.goalScope, loaded.goal));
  // `tableScopeBeliefs` est DÉJÀ disjointe de `own` par construction
  // (`tableScopeSection` écarte tout ce que la variante du titulaire garde),
  // donc la concaténation ne peut pas produire de doublon. Un `Set` ici
  // masquerait une régression de ce côté-là plutôt que de la faire voir.
  return loaded.tableScopeBeliefs.length === 0
    ? own
    : [...own, ...loaded.tableScopeBeliefs];
}
