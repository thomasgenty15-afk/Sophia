/**
 * FF-001 — LES PRATIQUES QUOTIDIENNES DU COACH.
 *
 * ── LES DEUX OBJETS QUE CE MODULE SÉPARE ────────────────────────────────────
 * La doctrine dit comment COMPOSER: convictions, interdits, arbitrages,
 * aliments. « Protéine à chaque repas » gouverne UN PLAT, et `DoctrineBelief`
 * est son endroit — une ligne de plan la cite, la base refuse la ligne sans la
 * clé.
 *
 * « Quatre verres d'eau » ne gouverne aucun plat. Elle gouverne une JOURNÉE.
 * Aucune ligne de plan ne peut la porter, donc jusqu'ici l'élève ne l'entendait
 * jamais — pendant que le coach la répète en vrai à chacun de ses élèves.
 *
 * ── CE QUE CE MODULE DÉCIDE, ET CE QU'IL REFUSE DE DÉCIDER ──────────────────
 * Il décide QUELLE pratique part ce soir, SOUS QUELLE FORME, et CE QU'ON EN
 * DIT au modèle. Il ne décide PAS si le coach a raison: R8 est sans nuance —
 * « on ne refuse jamais une pratique sur la méthode ». Ce produit vend la
 * méthode du coach, pas la nôtre. « Jeûne jusqu'à midi » se RESTREINT par
 * objectif, il ne se refuse pas.
 *
 * Le seul refus qui existe ici est une INCOHÉRENCE INTERNE (R9): une pratique
 * qui EST, littéralement, une des surfaces que le plancher TCA suspend
 * (`weight_readout`, `calorie_readout`). Ce n'est pas un avis sur la méthode,
 * c'est le produit qui refuse de se contredire lui-même — et le motif NOMME la
 * ceinture, parce qu'un blocage qu'on ne peut pas expliquer au coach est un
 * blocage qu'il vivra comme de l'arbitraire.
 *
 * ── POURQUOI LA ROTATION EST SANS ÉTAT ──────────────────────────────────────
 * Un curseur en base par élève et par coach demanderait une écriture par envoi,
 * une migration, un backfill, et il divergerait le jour où un soir saute. La
 * rotation est donc une FONCTION de (jour local, empreinte de l'élève): rien à
 * écrire, rien à rattraper, et deux élèves du même coach ne reçoivent pas la
 * même pratique le même soir — une cohorte au garde-à-vous se remarque et se
 * commente entre élèves.
 *
 * PURE MODULE: no I/O, no clock (le caller passe la date locale), no randomness.
 */

import { type GoalToken, goalScopeApplies, parseGoalScope } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE (R1: jetons ASCII snake_case — ils vivent en jsonb)
// ---------------------------------------------------------------------------

/**
 * DE QUOI PARLE LA PRATIQUE. Classé, jamais deviné à l'envoi.
 *
 * R6 du CONTRACT — pas de valeur d'enum sans branche nommée qui la lit:
 * `PRACTICE_KINDS` sert la lecture du coach à l'écran (regrouper, reconnaître
 * ce que le modèle a compris) et la correction de son verdict. Aucune branche
 * de sélection n'en dépend, et c'est délibéré: le soir, ce qui décide est la
 * portée, la cadence et le statut — pas le sujet.
 */
export const PRACTICE_KINDS = [
  "hydration",
  "movement",
  "sleep",
  "subjective_state",
  "supplement",
  "meal_timing",
  "other",
] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];

/**
 * À QUELLE FRÉQUENCE ELLE REVIENT.
 *
 *   constant — le socle du coach: elle repasse plus souvent que les autres.
 *   rotating — chacune son tour.
 *
 * La branche nommée qui la lit est `practiceSlots`, et elle pèse en RÉPÉTANT la
 * pratique dans le cycle. Voir l'invariant de couverture là-bas.
 */
export const PRACTICE_CADENCES = ["constant", "rotating"] as const;
export type PracticeCadence = (typeof PRACTICE_CADENCES)[number];

/**
 * L'ÉTAT D'UNE PRATIQUE — DÉRIVÉ, jamais dicté par le modèle.
 *
 *   active       — elle part, et elle peut devenir une question.
 *   remind_only  — elle part, jamais en question (`askable: false`).
 *   needs_review — le coach doit la relire. ELLE NE PART PAS (R7).
 *   blocked      — collision avec une ceinture existante. ELLE NE PART PAS (R7).
 *
 * ⚠️ `needs_review` NE JETTE RIEN. La saisie du coach est conservée telle
 * quelle et s'affiche: §7 de FF-001 est explicite, « le coach ne perd pas sa
 * saisie ». Une classification ratée est un écran à relire, pas un texte perdu.
 */
export const PRACTICE_STATUSES = [
  "active",
  "remind_only",
  "needs_review",
  "blocked",
] as const;
export type PracticeStatus = (typeof PRACTICE_STATUSES)[number];

/** Les deux statuts qui atteignent un élève. Le reste attend le coach (R7). */
const SHIPPABLE_STATUSES: readonly PracticeStatus[] = ["active", "remind_only"];

/**
 * LES CEINTURES QU'UNE PRATIQUE PEUT LITTÉRALEMENT ÊTRE (R9).
 *
 * Sous-ensemble STRICT et volontairement court de `SUPPRESSED_STUDENT_SURFACES`
 * (`restriction_guard.ts`). Ce sont les quatre surfaces qu'une pratique peut
 * incarner: se peser, compter ses calories, tenir une série, viser un score.
 *
 * ⚠️ `compliance_reminder` N'Y EST PAS, ET SON ABSENCE EST LA DÉCISION LA PLUS
 * IMPORTANTE DE CETTE LISTE. R4 le dit noir sur blanc: « as-tu bu tes 4
 * verres ? » EST un `compliance_reminder`. Le mettre ici bloquerait donc
 * absolument toutes les pratiques, et la fonctionnalité entière serait morte
 * dans son propre garde-fou. Ce cas n'est pas traité par un blocage, il est
 * traité par le MODE: plancher TCA levé ⇒ plus aucune question, le rappel
 * survit (`decidePracticeMode`).
 */
export const PRACTICE_BLOCKING_SURFACES = [
  "weight_readout",
  "calorie_readout",
  "streak_display",
  "adherence_score",
] as const;
export type PracticeBlockingSurface = (typeof PRACTICE_BLOCKING_SURFACES)[number];

/** LE PLAFOND (R2). Au-delà, la rotation devient illisible pour le coach. */
export const MAX_DAILY_PRACTICES = 7;

// ---------------------------------------------------------------------------
// LA FORME
// ---------------------------------------------------------------------------

/**
 * UNE pratique quotidienne, telle qu'elle vit dans
 * `coach_doctrines.daily_practices`.
 */
export interface DailyPractice {
  /** LES MOTS DU COACH, VERBATIM. Jamais réécrits par un modèle. */
  label: string;
  kind: PracticeKind;
  quantified: boolean;
  /** Le nombre, quand il y en a un. C'est LUI qui rejoint `allowedNumbers` (R10). */
  target: number | null;
  /** « verres », « minutes ». Prose: il se lit, il ne se compare pas. */
  unit: string | null;
  /** Vide = toute la cohorte. Même sémantique que `DoctrineBelief.goalScope`. */
  goalScope: readonly string[];
  cadence: PracticeCadence;
  /** Certaines pratiques ne deviennent jamais une question. */
  askable: boolean;
  minorSafe: boolean;
  /**
   * LE MINI-PROMPT, PAS UNE PHRASE FIGÉE.
   *
   * Une phrase toute faite redonne exactement la répétition qu'on cherche à
   * supprimer: quatre soirs et c'est du papier peint — la cicatrice écrite en
   * tête de `daily_recap.ts` à propos du compliment quotidien, à l'identique.
   * Le brief INSTRUIT; la phrase se génère le soir même, dans le même appel que
   * le fait de la journée.
   */
  brief: string;
  status: PracticeStatus;
  /** La ceinture en conflit quand `status === "blocked"` (R9). `null` sinon. */
  collidesWith: PracticeBlockingSurface | null;
}

// ---------------------------------------------------------------------------
// R9 — LA COLLISION, DÉTECTÉE DÉTERMINISTEMENT ET DANS LES DEUX LANGUES
// ---------------------------------------------------------------------------

/**
 * Repli de diacritiques + minuscules, tout le reste devient une espace.
 *
 * Copié de `restriction_guard.foldText` dans son intention: un accent ne doit
 * jamais servir à passer sous une garde, et chaque motif ci-dessous s'écrit en
 * ASCII replié pour cette raison.
 */
function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Les motifs qui disent « cette pratique EST une surface suspendue ».
 *
 * ── ÉCRITS EN DEUX LANGUES, PARCE QU'UNE GARDE MONOLINGUE EST UNE GARDE À
 *    MOITIÉ ARMÉE ─────────────────────────────────────────────────────────
 * Le coach écrit dans SA langue (`content_locale`), et ce dépôt porte déjà la
 * cicatrice `guard-tested-in-one-language-only`. Un motif anglais seul
 * laisserait passer « pèse-toi tous les matins », qui est LITTÉRALEMENT
 * l'exemple de R9.
 *
 * ── ÉTROITS, PARCE QU'UN FAUX BLOCAGE COÛTE PLUS CHER QU'UN FAUX PASSAGE ───
 * Un blocage de trop supprime en silence une pratique que le coach a écrite, et
 * il l'apprendra en constatant que ses élèves n'en entendent jamais parler.
 * D'où la réflexivité exigée sur le poids: « pèse-toi », « weigh yourself »,
 * « monte sur la balance » — jamais « pèse tes portions », qui est une
 * instruction de cuisine et pas une lecture de balance sur un corps.
 */
const COLLISION_PATTERNS: ReadonlyArray<{
  surface: PracticeBlockingSurface;
  pattern: RegExp;
}> = [
  {
    surface: "weight_readout",
    pattern:
      /\b(weigh|weighing)\s+(yourself|in)\b|\b(step|stepping|get|getting|hop|hopping)\s+on\s+(the\s+)?(scale|scales)\b|\bpese\s*(toi|vous)\b|\bse\s+peser\b|\b(monte|montez|monter)\s+sur\s+(la\s+)?balance\b|\bpesee\s+(quotidienne|du\s+matin|matinale)\b|\b(daily|morning)\s+weigh\b/,
  },
  {
    surface: "calorie_readout",
    pattern:
      /\b(count|counting|track|tracking|log|logging|tally|tallying)\s+(your\s+|the\s+|his\s+|her\s+|their\s+)?(calories|kcal|macros)\b|\b(compte|compter|comptez|note|noter|notez|suis|suivre|suivez)\s+(tes|les|ses|vos)\s+(calories|kcal|macros)\b|\bcalorie\s+(count|counting|target|budget)\b/,
  },
  {
    surface: "streak_display",
    pattern:
      /\b(don\s*t|do\s+not|never)\s+break\s+(the|your)\s+(chain|streak)\b|\b(keep|hold|build|maintain)\s+(your|the|a)\s+streak\b|\b(ne\s+casse\s+pas|sans\s+casser)\s+(la\s+)?(chaine|serie)\b/,
  },
];

/**
 * LA CEINTURE EN CONFLIT, OU `null`. Déterministe, sans modèle dans la boucle.
 *
 * ── POURQUOI ELLE EXISTE ALORS QUE LE CLASSIFIEUR PROPOSE DÉJÀ UNE COLLISION ─
 * Parce qu'une règle de prompt sans vérificateur est une intention, et que ce
 * dépôt a déjà expédié assez de gardes vertes et désarmées. Le classifieur
 * PROPOSE; ce matcher, lui, TIENT — il retourne sur la pratique à CHAQUE
 * lecture (`parseDailyPractices`), donc un `status` réécrit à la main en base
 * ou un jsonb bricolé ne peut pas lever le blocage.
 */
export function detectBeltCollision(label: string): PracticeBlockingSurface | null {
  const folded = fold(label);
  if (!folded) return null;
  for (const { surface, pattern } of COLLISION_PATTERNS) {
    // Les motifs ne sont pas globaux: `test` repart du début à chaque appel, et
    // deux consommateurs ne se volent pas leur `lastIndex`.
    if (pattern.test(folded)) return surface;
  }
  return null;
}

// ---------------------------------------------------------------------------
// LA LECTURE — forme fermée, plafond, et rien de deviné
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function oneOf<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | null {
  const token = str(raw);
  return (allowed as readonly string[]).includes(token) ? (token as T) : null;
}

export interface ParsedDailyPractices {
  practices: readonly DailyPractice[];
  /** Ce qui a été écarté ou dégradé, et pourquoi. Rendu au coach à l'écran. */
  issues: string[];
}

/**
 * Lit `coach_doctrines.daily_practices`.
 *
 * ── TROIS ARBITRAGES, ET ILS NE VONT PAS DANS LE MÊME SENS ─────────────────
 *
 *   label absent          → LÂCHÉ. Il n'y a rien à montrer au coach et rien à
 *                           dire à l'élève: une entrée sans les mots du coach
 *                           n'est pas une pratique amputée, c'est du bruit.
 *
 *   champ illisible       → GARDÉ en `needs_review`. C'est l'inverse du premier,
 *                           et c'est §7: « la pratique est STOCKÉE (le coach ne
 *                           perd pas sa saisie) et l'écran le montre ». Elle ne
 *                           part pas, elle attend une relecture.
 *
 *   au-delà de 7 (R2)     → LÂCHÉES, et COMPTÉES. Le plafond existe pour que le
 *                           coach puisse prédire ce que sa cohorte reçoit; le
 *                           lui appliquer en silence détruirait justement cette
 *                           prédictibilité.
 *
 * ── LE BLOCAGE SE REJOUE ICI, À CHAQUE LECTURE ────────────────────────────
 * `detectBeltCollision` retourne sur le label et FORCE `blocked`, quel que soit
 * le statut stocké. C'est ce qui rend la ceinture structurelle plutôt que
 * déclarative: un `status: "active"` écrit à la main dans le jsonb ne la lève
 * pas.
 */
export function parseDailyPractices(raw: unknown): ParsedDailyPractices {
  const issues: string[] = [];
  const rows = Array.isArray(raw) ? raw : [];
  if (!Array.isArray(raw) && raw !== null && raw !== undefined) {
    issues.push(
      "daily_practices is not a list, read as empty — no practice reaches anybody",
    );
  }

  const practices: DailyPractice[] = [];
  for (const [i, entry] of rows.entries()) {
    const where = `daily_practices[${i}]`;
    const row = (entry ?? {}) as Record<string, unknown>;

    const label = str(row.label);
    if (!label) {
      issues.push(`${where}: empty label, dropped (nothing to show, nothing to say)`);
      continue;
    }

    if (practices.length >= MAX_DAILY_PRACTICES) {
      issues.push(
        `${where}: ${JSON.stringify(label)} is over the cap of ` +
          `${MAX_DAILY_PRACTICES} practices, dropped — it reaches nobody`,
      );
      continue;
    }

    // Chaque champ illisible DÉGRADE en `needs_review` au lieu de choisir un
    // défaut. Un défaut deviné produirait une phrase imprévisible dans la voix
    // du coach, ce que R7 refuse explicitement.
    let review = false;

    const kind = oneOf(row.kind, PRACTICE_KINDS);
    if (kind === null) {
      issues.push(`${where}: unknown kind ${JSON.stringify(row.kind)}, needs review`);
      review = true;
    }

    const cadence = oneOf(row.cadence, PRACTICE_CADENCES);
    if (cadence === null) {
      issues.push(`${where}: unknown cadence ${JSON.stringify(row.cadence)}, needs review`);
      review = true;
    }

    const quantified = row.quantified === true;
    let target: number | null = null;
    let unit: string | null = null;
    if (quantified) {
      const n = Number(row.target);
      // Un `target` non fini, nul ou négatif entre dans `allowedNumbers` et en
      // ressort dans la bulle. Mieux vaut une relecture qu'un « 0 verres ».
      if (!Number.isFinite(n) || n <= 0) {
        issues.push(`${where}: quantified practice with no usable target, needs review`);
        review = true;
      } else {
        target = n;
      }
      unit = str(row.unit) || null;
      if (!unit) {
        issues.push(`${where}: quantified practice with no unit, needs review`);
        review = true;
      }
    }

    const brief = str(row.brief);
    if (!brief) {
      issues.push(`${where}: no brief — nothing to instruct the model with, needs review`);
      review = true;
    }

    const goalScope = parseGoalScope(row.goal_scope ?? row.goalScope, where, issues);

    const storedStatus = oneOf(row.status, PRACTICE_STATUSES);
    if (storedStatus === null) {
      issues.push(`${where}: unknown status ${JSON.stringify(row.status)}, needs review`);
      review = true;
    }

    // R9 — LA COLLISION GAGNE SUR TOUT LE RESTE, y compris sur un `needs_review`
    // et sur ce que le stockage prétend. Une pratique bloquée qui remonterait en
    // `needs_review` inviterait le coach à la « corriger » alors qu'il n'y a
    // rien à corriger: il doit lire QUELLE ceinture, pas « réessaie ».
    const collision = detectBeltCollision(label) ??
      oneOf(row.collides_with ?? row.collidesWith, PRACTICE_BLOCKING_SURFACES);

    // ── UN BLOCAGE SANS NOM N'EST PAS UN BLOCAGE (R9) ────────────────────
    // « On bloque uniquement en collision avec une ceinture existante, ET ON LA
    // NOMME. » Une ligne stockée en `blocked` dont aucune ceinture ne se
    // retrouve ne peut pas s'expliquer au coach: la lui présenter comme bloquée
    // l'inviterait à chercher ce qu'il a fait de mal, alors que ce qui est
    // cassé est la ligne. Elle repart donc en relecture — elle ne part pas plus
    // pour autant, et le motif dit pourquoi.
    const unnamedBlock = collision === null && storedStatus === "blocked";
    if (unnamedBlock) {
      issues.push(
        `${where}: stored as blocked with no belt to name (R9), sent back to review`,
      );
    }

    const status: PracticeStatus = collision !== null
      ? "blocked"
      : review || storedStatus === null || unnamedBlock
      ? "needs_review"
      : storedStatus;

    practices.push({
      label,
      kind: kind ?? "other",
      quantified,
      target,
      unit,
      goalScope,
      cadence: cadence ?? "rotating",
      // `askable` par DÉFAUT à faux quand il n'est pas explicitement vrai: une
      // question mal placée est plus chère qu'un rappel de trop, et le silence
      // d'un champ n'est pas une permission.
      askable: row.askable === true,
      // Même sens d'échec, pour une raison plus lourde: un `minor_safe` absent
      // ne doit pas ouvrir une pratique à un mineur (R5).
      minorSafe: row.minor_safe === true || row.minorSafe === true,
      brief,
      status,
      collidesWith: collision,
    });
  }

  return { practices, issues };
}

// ---------------------------------------------------------------------------
// QUI REÇOIT QUOI
// ---------------------------------------------------------------------------

/**
 * Les pratiques qui peuvent atteindre CET élève ce soir.
 *
 * TROIS FILTRES, dans cet ordre, et chacun porte une règle:
 *
 *   1. le STATUT (R7)     — `needs_review` et `blocked` ne partent pas. Ce
 *                           filtre est ici plutôt que dans la sélection pour
 *                           qu'AUCUN appelant (aperçu coach compris) ne puisse
 *                           lire cette liste comme « ce que la cohorte reçoit »
 *                           en y trouvant une pratique mal comprise.
 *   2. la PORTÉE          — `goalScopeApplies`, la fonction que la doctrine
 *                           utilise déjà. Pas une seconde: FF-001 exige la même
 *                           sémantique, et deux implémentations divergeraient.
 *   3. `minor_safe` (R5)  — registre éducatif, jamais correctif sur le corps.
 *
 * `goal` et `isMinor` sont REQUIS. Un `isMinor` optionnel valant `false` par
 * défaut serait une garde désarmée par oubli — la classe de défaut la plus
 * fréquente de ce dépôt (`safetyBand: null`, documenté dans `daily_pulse.ts`).
 */
export function practicesFor(
  practices: readonly DailyPractice[],
  goal: GoalToken | null,
  isMinor: boolean,
): readonly DailyPractice[] {
  return practices.filter((p) =>
    SHIPPABLE_STATUSES.includes(p.status) &&
    goalScopeApplies(p.goalScope, goal) &&
    (!isMinor || p.minorSafe)
  );
}

// ---------------------------------------------------------------------------
// R6 — LA ROTATION SANS ÉTAT
// ---------------------------------------------------------------------------

/** Jours depuis l'époque, à partir d'une date locale `YYYY-MM-DD`. */
function dayNumber(localDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(localDate));
  if (!m) {
    // R7: une rotation qui se trompe de jour sert la mauvaise pratique tous les
    // soirs, sans qu'aucune erreur n'existe. On refuse de deviner.
    throw new Error(
      `[keel/daily_practices] localDate is not YYYY-MM-DD: ${JSON.stringify(localDate)}`,
    );
  }
  return Math.round(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000,
  );
}

/**
 * L'EMPREINTE DE L'ÉLÈVE — FNV-1a 32 bits sur son identifiant.
 *
 * Stable par construction (aucune horloge, aucun hasard, aucun état), ce qui
 * est l'exigence entière de R6: le même élève, le même jour, la même pratique,
 * y compris quand le job rejoue. Ce n'est ni une primitive de sécurité ni une
 * distribution: c'est un décalage.
 */
export function studentFingerprint(userId: string): number {
  const text = str(userId);
  if (!text) {
    throw new Error("[keel/daily_practices] studentFingerprint: empty userId");
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = (h ^ text.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * LE CYCLE — une pratique par soir, pondéré par la cadence.
 *
 * `constant` occupe DEUX créneaux, `rotating` un seul. Le socle du coach revient
 * donc deux fois plus souvent que le reste, ce qui est le sens du mot.
 *
 * ── L'INVARIANT DE COUVERTURE, ÉCRIT PARCE QU'IL SE MESURE ────────────────
 * Le cycle a pour longueur la somme des poids (L). Sur L soirs consécutifs, un
 * même élève parcourt L créneaux consécutifs, donc TOUTES les pratiques passent
 * au moins une fois. Avec sept pratiques `rotating`, L vaut 7 et c'est
 * exactement le critère d'acceptation de FF-001 (« 7 pratiques, 7 soirs,
 * chacune au moins une fois »).
 *
 * ⚠️ CE QUI N'EST PAS VRAI, ET QU'IL NE FAUT PAS CROIRE: la couverture n'est
 * PAS garantie sur `practices.length` soirs quand une pratique est `constant` —
 * L est alors plus grand que le nombre de pratiques, et une fenêtre plus courte
 * que le cycle peut en manquer une. C'est le prix, assumé, du mot « souvent ».
 *
 * ── ET L'INVARIANT D'ADJACENCE, QUI A COÛTÉ LA CONSTRUCTION NAÏVE ─────────
 * « Toutes, puis les `constant` en plus » donne `[core, a, b, core]`: le cycle
 * boucle, et l'élève reçoit `core` deux soirs de suite au passage. Deux soirs
 * identiques d'affilée, c'est le papier peint que ce module existe pour éviter.
 *
 * On remplit donc les positions PAIRES puis les IMPAIRES, en parcourant le
 * multi-ensemble trié par poids décroissant. `[core, core, a, b]` devient
 * `[core, a, core, b]`: aucune pratique ne se touche, bouclage compris, DÈS QUE
 * son poids tient dans la moitié du cycle. Au-delà (deux pratiques dont une
 * `constant`: 2 créneaux sur 3) l'adjacence est arithmétiquement inévitable, et
 * c'est le seul cas où elle survit.
 */
function practiceSlots(
  practices: readonly DailyPractice[],
): readonly DailyPractice[] {
  if (practices.length === 0) return [];

  // Poids décroissant, puis l'ordre du coach. Le second critère est ce qui rend
  // le tri stable: `Array.sort` ne l'est pas garanti sur toutes les runtimes, et
  // une rotation qui change d'ordre entre deux déploiements enverrait la
  // mauvaise pratique le même soir aux mêmes élèves.
  const multiset: DailyPractice[] = [];
  const ranked = practices
    .map((p, index) => ({ p, index, weight: p.cadence === "constant" ? 2 : 1 }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { p, weight } of ranked) {
    for (let k = 0; k < weight; k++) multiset.push(p);
  }

  const out: DailyPractice[] = new Array(multiset.length);
  let cursor = 0;
  for (let pos = 0; pos < multiset.length; pos += 2) out[pos] = multiset[cursor++];
  for (let pos = 1; pos < multiset.length; pos += 2) out[pos] = multiset[cursor++];
  return out;
}

/**
 * LA PRATIQUE DE CE SOIR, pour cet élève, sans un octet d'état.
 *
 * `(jour local + empreinte de l'élève) % L`. Le jour fait tourner, l'empreinte
 * décale: deux élèves du même coach le même soir tombent sur des créneaux
 * différents dès que leurs empreintes diffèrent modulo L, et une cohorte au
 * garde-à-vous — que les élèves se racontent entre eux — n'a pas lieu.
 *
 * Rend `null` quand il n'y a rien à servir. Le message du soir est alors,
 * EXACTEMENT, celui qu'il était avant ce lot.
 */
export function selectPracticeForEvening(args: {
  practices: readonly DailyPractice[];
  userId: string;
  localDate: string;
}): DailyPractice | null {
  const slots = practiceSlots(args.practices);
  if (slots.length === 0) return null;
  const offset = dayNumber(args.localDate) + studentFingerprint(args.userId);
  // `%` de JS garde le signe du dividende: une date antérieure à 1970 donnerait
  // un index négatif et une exception d'accès silencieuse en `undefined`.
  const index = ((offset % slots.length) + slots.length) % slots.length;
  return slots[index];
}

// ---------------------------------------------------------------------------
// LE MODE — rappel, question, ou rien
// ---------------------------------------------------------------------------

/**
 *   remind — la pratique est ÉNONCÉE. Aucune réponse n'est attendue.
 *   ask    — la pratique se termine en question. Un seul « ? » dans la bulle.
 *   none   — elle ne part pas.
 */
export type PracticeMode = "remind" | "ask" | "none";

/**
 * L'ALTERNANCE, ET POURQUOI ELLE NE PEUT PAS ENTRER EN COLLISION AVEC LE PULSE.
 *
 * Le message du soir est quotidien, la QUESTION du pulse ne l'est pas
 * (`PULSE_ASK_INTERVAL_DAYS = 3`). Deux soirs sur trois, le pulse ne demande
 * rien: c'est là que se loge la question de pratique. L'alternance tombe donc
 * d'une décision qui EXISTE DÉJÀ, au lieu d'inventer une seconde cadence
 * capable d'entrer en collision avec la première.
 *
 * L'ORDRE EST LE CONTRAT:
 *
 *   1. statut (R7)         — `needs_review` / `blocked` ⇒ rien. Une pratique mal
 *                            comprise produirait une phrase imprévisible dans la
 *                            voix du coach.
 *   2. plancher TCA (R4)   — levé ⇒ PLUS AUCUNE QUESTION, le rappel survit.
 *                            « As-tu bu tes 4 verres ? » est un
 *                            `compliance_reminder`, déjà listé dans
 *                            `SUPPRESSED_STUDENT_SURFACES`. Le rappel, lui, ne
 *                            demande rien et ne mesure rien: le supprimer
 *                            priverait l'élève de la voix de son coach au
 *                            moment précis où elle vaut le plus.
 *   3. le pulse demande (R3) — une seule question par bulle. Deux questions dans
 *                            un message du soir, c'est le formulaire quotidien
 *                            qu'on vient de démonter, en pire.
 *   4. `askable`           — certaines pratiques ne deviennent jamais une
 *                            question, et c'est le coach qui le dit.
 *
 * `restrictionFlag` est REQUIS. Une garde à paramètre optionnel est une garde
 * désarmée: ce dépôt a expédié `safetyBand` en optionnel, l'unique appelant de
 * production ne le passait pas, et la garde était verte et morte.
 */
export function decidePracticeMode(args: {
  /** Le pulse pose-t-il SA question ce soir ? (`decideDailyPulse().ask`) */
  pulseAsks: boolean;
  /** Le plancher TCA est-il levé pour cet élève ? REQUIS. */
  restrictionFlag: boolean;
  practice: DailyPractice;
}): PracticeMode {
  const p = args.practice;
  if (!SHIPPABLE_STATUSES.includes(p.status)) return "none";
  if (args.restrictionFlag) return "remind";
  if (args.pulseAsks) return "remind";
  if (!p.askable || p.status === "remind_only") return "remind";
  return "ask";
}

// ---------------------------------------------------------------------------
// LE BLOC INJECTÉ
// ---------------------------------------------------------------------------

/**
 * Ce que le prompt du soir reçoit à propos de la pratique.
 *
 * `numbers` voyage AVEC le bloc et pas à côté: c'est R10, et c'est le piège le
 * plus cher du lot parce qu'il est silencieux. La ceinture de sortie n'autorise
 * que les nombres qu'elle peut justifier; un `target` oublié ferait rejeter des
 * messages PARFAITEMENT CORRECTS, le repli déterministe deviendrait le cas
 * nominal, et le symptôme lu par tout le monde serait « la voix du coach a
 * disparu » — jamais « un nombre a été refusé ».
 */
export interface PracticeInjection {
  block: string;
  /** `remind` ou `ask`: `none` ne produit pas d'injection du tout. */
  mode: Exclude<PracticeMode, "none">;
  /** Les nombres que la pratique autorise dans le texte (R10). */
  numbers: readonly number[];
  /**
   * Les nombres que le texte n'a PAS le droit de porter (R5).
   *
   * ── POURQUOI UNE LISTE NÉGATIVE EXISTE À CÔTÉ DE LA POSITIVE ─────────────
   * `allowedNumbers` ne vérifie un nombre que devant un nom COMPTABLE
   * (`meals`, `dishes`, `days`…). « 4 verres » ne matche aucun de ces noms:
   * pour un mineur, retirer 4 des nombres autorisés n'interdit donc RIEN — la
   * ceinture ne regarde même pas.
   *
   * Ce champ est ce qui rend le critère d'acceptation vérifiable au lieu
   * d'espéré: « le chiffre n'apparaît pas dans le message » devient un refus
   * déterministe, quelle que soit la phrase que le modèle a écrite autour.
   */
  forbiddenNumbers: readonly number[];
}

// ---------------------------------------------------------------------------
// R5 — LE CHIFFRE, RETIRÉ DE CE QUE LE MODÈLE LIT
// ---------------------------------------------------------------------------

/**
 * Les mots-nombres qu'on retire, et celui qu'on ne retire pas.
 *
 * ⚠️ `un` / `une` NE SONT PAS DANS LA LISTE, et c'est la seule asymétrie de ce
 * module. Ce sont les articles indéfinis français: les retirer transformerait
 * « bois un verre à chaque repas » en « bois verre à chaque repas » sur des
 * dizaines de pratiques qui ne portent aucun chiffre. On préfère laisser passer
 * le cas dégénéré `target = 1` dans le PROMPT — la ceinture de sortie, elle,
 * refuse toujours le chiffre dans le TEXTE.
 */
const NUMBER_WORDS_TO_REDACT =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|deux|trois|quatre|cinq|sept|huit|neuf|dix|onze|douze)\b/gi;

/**
 * Ce que le modèle lit d'un texte du coach quand l'élève est mineur.
 *
 * ── POURQUOI CETTE FONCTION A DÛ EXISTER ────────────────────────────────────
 * Le premier jet retirait le chiffre du bloc et laissait le `label` VERBATIM
 * juste au-dessus — or le label EST « 4 verres d'eau dans la journée ». La règle
 * était écrite, la garde était verte, et le chiffre arrivait quand même sous les
 * yeux du modèle par la porte à côté. C'est exactement la classe de défaut que
 * ce dépôt collectionne: une garde qui protège tout sauf le chemin réel.
 *
 * Le texte redacté est LU PAR UN MODÈLE, jamais par un humain: une phrase un
 * peu boiteuse (« verres d'eau dans la journée ») n'a aucun coût, là où un
 * nombre laissé en place en a un.
 */
export function redactQuantities(text: string): string {
  return String(text ?? "")
    .replace(/\d+(?:[.,]\d+)?/g, "")
    .replace(NUMBER_WORDS_TO_REDACT, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * LE BLOC, tel que le modèle le lit — et le chiffre en moins pour un mineur.
 *
 * ── R5, ET POURQUOI LE CHIFFRE PART AU LIEU DE LA PRATIQUE ────────────────
 * « Bouge trente minutes » et « bouge un peu tous les jours » ne disent pas la
 * même chose à un adolescent. Le registre reste éducatif tant qu'il n'y a pas
 * de dose; une dose sur un corps de mineur est correctif, et c'est ce que
 * PIVOT-FOYER §8.4 refuse. On garde donc la pratique et on retire le nombre,
 * plutôt que de retirer les deux — la voix du coach passe, la prescription non.
 *
 * ⚠️ LE CHIFFRE RETIRÉ DU BLOC EST AUSSI RETIRÉ DE `numbers`. Le laisser dans
 * les nombres autorisés serait une permission accordée à un texte qui n'a plus
 * le droit de le porter: la ceinture deviendrait complice de la fuite qu'elle
 * est censée voir.
 */
export function practiceBriefBlock(
  practice: DailyPractice,
  mode: PracticeMode,
  isMinor: boolean,
): string {
  if (mode === "none") return "";
  const lines: string[] = [];
  lines.push("── ONE DAILY PRACTICE FROM THIS COACH ──");
  // Le label du coach est VERBATIM pour un adulte, et REDACTÉ pour un mineur —
  // il porte le chiffre lui-même (« 4 verres d'eau »), et le laisser passer
  // ferait de R5 une règle écrite sur une porte grande ouverte.
  lines.push(
    `The coach's own words for it: "${isMinor ? redactQuantities(practice.label) : practice.label}"`,
  );
  lines.push(
    `What they want conveyed tonight: ${
      isMinor ? redactQuantities(practice.brief) : practice.brief
    }`,
  );

  const quantity = practice.quantified && practice.target !== null && practice.unit
    ? `${practice.target} ${practice.unit}`
    : null;
  if (quantity && !isMinor) {
    lines.push(`The figure that goes with it: ${quantity}`);
  }

  lines.push("");
  lines.push("HOW IT ENTERS THE MESSAGE — same discard rule as everything above:");
  lines.push(
    "- ONE sentence about this practice, after the fact of the day. It never replaces the fact, and it is never the opening.",
  );
  if (mode === "ask") {
    lines.push(
      "- Turn it into a question: end the message with exactly ONE question about this practice, and no other question anywhere.",
    );
  } else {
    lines.push(
      "- State it. Do not ask about it, not even rhetorically, and do not end the message with a question.",
    );
  }
  lines.push(
    "- You do NOT know whether they did it, today or any other day. Never say they did, never say they did not, never count days.",
  );
  lines.push(
    "- No praise and no warning about it. Say the practice; the coach's words are the whole point.",
  );
  if (quantity && isMinor) {
    // Dit au modèle, ET vérifié par la ceinture: le nombre n'est pas dans
    // `numbers`, donc un texte qui le sortirait quand même est rejeté.
    // « a minor » et pas « under 18 »: le bloc entier doit pouvoir s'éprouver
    // par « aucun chiffre nulle part », et un 18 dans NOTRE consigne rendrait
    // cette vérification impossible à écrire — en plus d'être un nombre de plus
    // sous les yeux d'un modèle à qui on demande de n'en écrire aucun.
    lines.push(
      "- This student is a minor: state NO number, NO target and NO quantity for this practice. Name the practice, never the dose.",
    );
  }
  return lines.join("\n");
}

/** Les nombres que la pratique met légitimement dans la bulle (R10 + R5). */
export function practiceAllowedNumbers(
  practice: DailyPractice,
  mode: PracticeMode,
  isMinor: boolean,
): readonly number[] {
  if (mode === "none" || isMinor) return [];
  if (!practice.quantified || practice.target === null) return [];
  return [practice.target];
}

/** Les nombres que la pratique INTERDIT dans la bulle (R5). Miroir du précédent. */
export function practiceForbiddenNumbers(
  practice: DailyPractice,
  mode: PracticeMode,
  isMinor: boolean,
): readonly number[] {
  if (mode === "none" || !isMinor) return [];
  if (!practice.quantified || practice.target === null) return [];
  return [practice.target];
}

/**
 * Le tout d'un coup: le bloc, le mode et les nombres, ou `null`.
 *
 * Un seul point d'assemblage pour que les trois ne puissent pas diverger — un
 * bloc qui dit « 4 verres » à côté d'une liste de nombres vide est exactement
 * le rejet silencieux que R10 décrit.
 */
export function practiceInjectionFor(args: {
  practice: DailyPractice | null;
  mode: PracticeMode;
  isMinor: boolean;
}): PracticeInjection | null {
  if (!args.practice || args.mode === "none") return null;
  return {
    block: practiceBriefBlock(args.practice, args.mode, args.isMinor),
    mode: args.mode,
    numbers: practiceAllowedNumbers(args.practice, args.mode, args.isMinor),
    forbiddenNumbers: practiceForbiddenNumbers(args.practice, args.mode, args.isMinor),
  };
}
