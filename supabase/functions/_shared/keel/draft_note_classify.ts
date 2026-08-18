/**
 * LE RETOUR SUR LE BROUILLON, CLASSÉ — lot 2B du chantier « mémoire
 * structurée ». Le PROMPT et la RELECTURE. **Rien d'autre.**
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §5 **ligne ①**.
 * Socle: `retained_item.ts` (ce fichier ne le modifie pas et n'en réécrit rien).
 * Magasin: `retained_next_plan.ts`. Porte d'écriture: `retained_items_io.ts`.
 * L'appel modèle et la persistance vivent dans `draft_note_classify_io.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'IL FERME — « UN RETOUR DIT DANS LE CHAT VIT LE TEMPS DU TOUR »
 * ═══════════════════════════════════════════════════════════════════════════
 * La phrase écrite sur un brouillon (`body.draft_note`) part au modèle par
 * `plan_draft_note.ts::draftNoteInstruction`, compose UN plan, et **disparaît
 * avec la requête**. Rien n'est persisté — `plan_draft_note.ts` l'écrit en
 * toutes lettres. Conséquence: la personne qui a écrit « pas de poisson cette
 * semaine » le réécrit au prochain plan de la même semaine, et au suivant.
 *
 * Ce module transforme cette phrase en `RetainedItem`, une fois, au moment où
 * le plan est ÉCRIT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ TOUT CE QU'IL PRODUIT EST `next_plan`, ET CE N'EST PAS UN CHOIX D'ICI
 * ═══════════════════════════════════════════════════════════════════════════
 * `defaultScopeFor("draft_note", kind)` rend `"next_plan"` pour LES SIX
 * familles que ce producteur a le droit d'écrire. Le magasin durable n'est donc
 * jamais touché par ce lot, et `durable` n'est jamais passé à la porte.
 *
 * Motif (§5, « Pourquoi ces trois interdits », point ①): un retour sur un
 * brouillon parle de CE plan. Le promouvoir en permanent transformerait une
 * humeur de mardi en règle de vie. La personne peut le rendre durable depuis sa
 * carte, **explicitement**.
 *
 * ⛔ `defaultScopeFor` PEUT RENDRE `null`, ET `null` EST UN REFUS. Jamais
 * `?? "next_plan"`: replier ce `null` réarmerait exactement l'interdit que
 * `canProduce` vient de poser. Le refus est compté, il n'est pas avalé.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LES DEUX FAMILLES INTERDITES, ET POURQUOI ELLES SONT L'ÉCHAPPATOIRE
 * ═══════════════════════════════════════════════════════════════════════════
 * `portion.adjust` et `rhythm.set` sont ⛔ pour ce producteur (§5 ligne ①), et
 * ce sont précisément les deux choses qu'on écrit le plus naturellement sur un
 * brouillon: « les parts sont trop grosses », « je ne petit-déjeune pas ».
 *
 * C'EST DONC L'ÉCHAPPATOIRE QU'ON MESURE. Elle est nommée dans le prompt **sur
 * la ligne même de la clé `"kind"`** — cicatrice chiffrée de ce dépôt: 0 % de
 * conformité quand la promesse et la clé de schéma sont éloignées dans le
 * prompt. Et elle est TENUE par `canProduce`, pas par le prompt: une règle qui
 * ne vit que dans un prompt régresse en réel, personne ne le voit, et on
 * découvre six semaines plus tard que le brouillon écrit des portions.
 *
 * Le compteur `refused.forbiddenKind` est ce qui rend la mesure lisible. Sans
 * lui, un lot désarmé ressemble trait pour trait à un lot qui marche.
 *
 * ⛔ ── AUCUN `kind` DE SÉCURITÉ, ET CE N'EST PAS NÉGOCIABLE ────────────────
 * Une allergie, une intolérance, un régime, une condition médicale ne naissent
 * JAMAIS d'un retour classé: elles ont leur table (`student_safety_constraints`),
 * synchrone, sans ranking, avec consentement. La liste fermée des huit `kind`
 * n'en porte aucune, et `parseRetainedKind` refuse tout le reste. Le prompt le
 * répète parce qu'un modèle à qui on montre « plus d'arachides, ça me rend
 * malade » a envie de le dire autrement.
 *
 * ⛔ ── AUCUN MATCHER MAISON, ET AUCUN PRÉNOM COMME CLÉ ─────────────────────
 * Le sujet est `household` (le défaut) ou `member:<uuid>`. L'uuid rendu par le
 * modèle est **joint par identifiant** au rôle passé en paramètre — une
 * égalité de chaînes sur un uuid, pas un rapprochement par ressemblance. Un id
 * hors rôle est un REFUS compté, jamais un repli sur `household`: replier
 * appliquerait à toute la table ce qui visait une bouche (§2 axe 3).
 * Cicatrice: « laitue » ≠ « lait », 12 faux positifs sur 12 mesurés.
 *
 * PURE MODULE: no I/O, no clock, no randomness. Le jour arrive TOUJOURS en
 * paramètre, et l'ancre de la semaine visée aussi.
 */

import {
  canProduce,
  defaultScopeFor,
  HOUSEHOLD_SUBJECT,
  LOGISTICS_FIELDS,
  memberSubject,
  parseRetainedDay,
  parseRetainedItem,
  parseRetainedKind,
  RECIPE_DIFFICULTIES,
  type RetainedItem,
  type RetainedKind,
  VARIETY_LEVELS,
} from "./retained_item.ts";
import { isoMondayOf, type NextPlanEntry } from "./retained_next_plan.ts";
import { DRAFT_NOTE_MAX_CHARS } from "./plan_draft_note.ts";
import { DAY_TOKENS } from "./tokens.ts";

// ===========================================================================
// LE JETON DE LA MATRICE
// ===========================================================================

/**
 * ⛔ `"draft_note"`, ET JAMAIS `"written"`.
 *
 * `canProduce("written", …)` rend `true` pour LES HUIT familles — c'est la
 * contrepartie exacte des trois interdits (la personne peut tout rendre durable
 * depuis sa carte, explicitement). Un producteur serveur qui se déclarerait
 * `written` contournerait donc **la matrice entière par un seul mot**, et la
 * ligne s'afficherait ensuite « tu l'as écrit », ce qui serait faux (contrat
 * §8 point 2).
 *
 * ⚠️ ÉPINGLÉ À SON LITTÉRAL PAR LE TEST. C'est le jumeau du jeton lu par
 * `canProduce`, par `parseRetainedItem` À LA LECTURE, par le port serveur et
 * par la carte (`known.source.draft_note`). Une constante qui a un jumeau
 * ailleurs et que rien ne relie laisse les tests verts pendant que l'écriture
 * part dans un mot que plus personne ne lit (leçon des bretelles, contrat §7.4).
 */
export const DRAFT_NOTE_PRODUCER = "draft_note" as const;

/**
 * LES FAMILLES QUE CE PRODUCTEUR A LE DROIT D'ÉCRIRE — **CALCULÉES**.
 *
 * ⚠️ DÉRIVÉES DE `canProduce`, JAMAIS RETAPÉES. Une seconde liste écrite à la
 * main ici serait une seconde matrice: le jour où la nomenclature bougerait,
 * l'une des deux resterait en arrière et c'est celle qu'on regarde le moins qui
 * déciderait. Le test épingle le RÉSULTAT contre une liste littérale — c'est
 * l'égalité qui est prouvée, pas la recopie.
 */
export const DRAFT_NOTE_KINDS: readonly RetainedKind[] = ([
  "food.exclude",
  "food.prefer",
  "method.avoid",
  "method.prefer",
  "portion.adjust",
  "rhythm.set",
  "logistics.set",
  "craving",
] as const).filter((kind) => canProduce(DRAFT_NOTE_PRODUCER, kind));

/**
 * LES DEUX FAMILLES INTERDITES À CE PRODUCTEUR — **CALCULÉES** elles aussi.
 *
 * Elles servent au PROMPT (les nommer est ce qui fait tomber le taux
 * d'échappatoire) et au TEST (un cas qui mord, un cas qui passe).
 */
export const DRAFT_NOTE_FORBIDDEN_KINDS: readonly RetainedKind[] = ([
  "portion.adjust",
  "rhythm.set",
] as const).filter((kind) => !canProduce(DRAFT_NOTE_PRODUCER, kind));

// ===========================================================================
// LE PROMPT — la promesse TOUCHE la clé de schéma
// ===========================================================================

/**
 * ⚠️ LA PROMESSE ET LA CLÉ DE SCHÉMA SE TOUCHENT, ET C'EST MESURÉ.
 *
 * Cicatrice de ce dépôt: **0 % de conformité** quand la promesse (« ne rends
 * jamais X ») et la clé qui la porte (`"kind"`) sont éloignées dans le prompt.
 * Les deux interdits sont donc écrits SUR la ligne de `"kind"`, pas dans une
 * section « règles » plus bas.
 *
 * ── CE QUE LE MODÈLE NE REND PAS, ET POURQUOI CE N'EST PAS UN OUBLI ────────
 * Il ne rend **ni `scope`, ni `source`, ni `at`, ni `confidence`, ni `item`**.
 *   · `scope` vient de `defaultScopeFor` — un modèle qui pourrait écrire
 *     `"durable"` transformerait une humeur de mardi en règle de vie, ce que le
 *     §5 interdit, et il le ferait sans qu'aucune garde ne morde;
 *   · `source` est le jeton de la matrice: le laisser au modèle, ce serait
 *     laisser une règle de sécurité à une chaîne de caractères;
 *   · `at` est le jour LOCAL de la personne, que ce module reçoit;
 *   · `confidence` est refusée hors `conversation` par le socle — une phrase
 *     que quelqu'un vient de taper n'est pas vraie à 82 %.
 */
export const DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT = [
  "You read ONE short note someone wrote on a DRAFT meal plan, and you FILE what it asks for. You are a filing clerk. You are not a nutritionist, you do not write the plan, and you have no opinion on what they want.",
  "",
  "The plan has ALREADY been composed with their note in front of it. Your only job is to keep what they asked for, so the next plan of the same week still knows it. Nothing you return changes the plan they are looking at.",
  "",
  "Return ONE JSON object, and nothing else. No prose, no code fence.",
  "",
  '{ "items": [ ... ] }',
  "",
  "Each entry of \"items\" is exactly this, and nothing more:",
  "{",
  `  "kind": exactly one of ${
    DRAFT_NOTE_KINDS.join(" | ")
  } — and NEVER ${
    DRAFT_NOTE_FORBIDDEN_KINDS.join(", NEVER ")
  }, not even when the note is plainly about how big a serving was, or about a meal that should or should not exist. Those two are asked somewhere else, in a closed question, with the list of people at the table in front of the person — because a measure needs to know WHO, and a rhythm is not a mood. When the note is about one of those two, return NOTHING for it: leave it out of "items" entirely. Filing it under a neighbouring kind would be worse than losing it,`,
  '  "text": the thing you are filing, in THEIR language and as close to THEIR OWN WORDS as you can. This is the line they will read on their own memory card, and they can edit it. Never a sentence you invented, never longer than what they wrote,',
  '  "member_id": null when it is for everyone at the table — that is the normal answer and the right one most of the time. An id COPIED EXACTLY from the roster below only when the note names that person. NEVER a first name,',
  '  "value": null for every kind except logistics.set (see below)',
  "}",
  "",
  "WHAT EACH KIND IS FOR:",
  "- food.exclude — a food or a dish they do not want any more.",
  "- food.prefer — a food or a dish they want to see again.",
  "  DIRECTION FIRST, AND WHEN IN DOUBT DROP IT. These two are opposites, and getting them backwards makes the next plan serve MORE of the very thing they just rejected. French « plus de X » means BOTH \"no more X\" and \"more X\" — the negation is routinely dropped in speech, and the sentence alone does not always say which. When you cannot tell the direction, leave the item out of \"items\". Being asked once more costs them a sentence; being served more of what they rejected costs them a week.",
  "- method.avoid — a preparation that does not work for them (fried, raw, spicy).",
  "- method.prefer — a preparation they like.",
  "- logistics.set — which days they cook, how long, how hard, how varied, what they spend.",
  "- craving — one specific thing they want soon: \"fajitas next week\".",
  "",
  "logistics.set — and ONLY logistics.set — carries a value:",
  `  { "field": one of ${LOGISTICS_FIELDS.join(" | ")}, "value": ... }`,
  `  cook_days takes a list of ${DAY_TOKENS.join(" | ")}.`,
  "  cooking_time_min takes a whole number of minutes. budget_amount takes a number.",
  `  recipe_difficulty takes ${RECIPE_DIFFICULTIES.join(" | ")}. variety takes ${
    VARIETY_LEVELS.join(" | ")
  }.`,
  "  NEVER invent a number they did not write. If they wrote no number, this is not a logistics.set.",
  "",
  "NEVER file an allergy, an intolerance, a diet, or a medical condition. Those are asked directly, with consent, and they live somewhere this list cannot reach. \"no peanuts, they make me ill\" is at most a food.exclude — you are filing a preference, never a medical fact.",
  "",
  "Return an EMPTY list when there is nothing to file: a compliment, a thank-you, a question, a remark about the plan being long or short. An empty list is a correct answer and it is a frequent one. Filing something that is not there is worse than filing nothing.",
].join("\n");

/** Une bouche, réduite à ce dont ce prompt a besoin. */
export type DraftNoteMember = {
  /** L'uuid du membre. C'est LUI que le modèle recopie, jamais le prénom. */
  readonly memberId: string;
  /** Comment la personne l'appelle. Sert au modèle à LIRE la note, pas à écrire. */
  readonly label: string;
};

/**
 * LE TOUR « UTILISATEUR »: la note, la langue, et le rôle.
 *
 * ⚠️ `members` EST REQUIS, ET `[]` EST UNE RÉPONSE. `[]` dit « personne d'autre
 * à table » (l'entrée du produit est à une bouche); `undefined` dirait « je
 * n'ai pas su lire le foyer », et les deux n'autorisent pas la même chose. Ce
 * dépôt a sept cicatrices nommées « paramètre de garde optionnel = garde
 * désarmée ».
 */
export function buildDraftNoteClassifyPrompt(args: {
  note: string;
  contentLocale: string;
  members: readonly DraftNoteMember[];
}): string {
  const lines: string[] = [];
  lines.push(
    `The note, exactly as they typed it: ${JSON.stringify(String(args.note ?? ""))}`,
  );
  lines.push(
    `They write in ${
      String(args.contentLocale ?? "").trim() || "en"
    }. Write "text" in that language.`,
  );
  const roster = (args.members ?? []).filter((m) =>
    String(m?.memberId ?? "").trim() !== ""
  );
  if (roster.length === 0) {
    // ⚠️ DIT EXPLICITEMENT, PAS OMIS. Un rôle absent laisserait le modèle
    // supposer qu'il existe des convives dont on ne lui a pas donné la liste,
    // et inventer un `member_id`. Le dire ferme la porte.
    lines.push(
      'There is nobody else at this table. "member_id" is null on every item.',
    );
  } else {
    lines.push(
      "The people at this table — copy an id EXACTLY, never a name: " +
        roster
          .map((m) =>
            JSON.stringify({ member_id: m.memberId, called: String(m.label ?? "") })
          )
          .join(", "),
    );
  }
  return lines.join("\n");
}

// ===========================================================================
// LA RELECTURE — et rien ne se perd en silence
// ===========================================================================

/**
 * CE QUI N'EST PAS ENTRÉ, MOTIF PAR MOTIF.
 *
 * ⚠️ « Champ déclaré par le modèle = compteur obligatoire ». `kind`, `text`,
 * `member_id` et `value` sont TOUS déclarés par le modèle: on ne peut pas
 * SAVOIR d'avance à quelle fréquence il les remplit bien, seulement le mesurer.
 * Sans ces nombres, un prompt que le modèle ignore rendrait une liste vide,
 * rien ne serait écrit, et le lot ressemblerait trait pour trait à un lot qui
 * marche — la carte dirait exactement ce qu'elle disait avant.
 */
export interface DraftNoteRefusals {
  /** La somme des motifs ci-dessous. */
  readonly total: number;
  /** `kind` hors de la liste fermée des huit. */
  readonly unknownKind: number;
  /**
   * ⛔ L'ÉCHAPPATOIRE MESURÉE: `portion.adjust` ou `rhythm.set`.
   * `canProduce(draft_note, kind)` a mordu, ou `defaultScopeFor` a rendu `null`.
   */
  readonly forbiddenKind: number;
  /** `member_id` qui n'est dans le rôle d'aucune bouche de ce foyer. */
  readonly unknownMember: number;
  /** `text` vide, ou plus long que la note dont il est censé sortir. */
  readonly badText: number;
  /** `parseRetainedItem` a refusé l'item assemblé (`value`, forme, invariants). */
  readonly malformed: number;
}

/** LE COMPTEUR À TROIS NOMBRES, plus le détail des refus. */
export interface DraftNoteClassification {
  /** Ce que le modèle a proposé — la longueur brute de sa liste. */
  readonly proposed: number;
  /** Ce qui est ressorti en `RetainedItem`, prêt pour la porte. */
  readonly kept: number;
  /** `proposed - kept`, ventilé. */
  readonly refused: DraftNoteRefusals;
  /**
   * LES ENTRÉES PROVISOIRES, `{item, anchor}`.
   *
   * ⚠️ IL N'Y A PAS DE LISTE `durable`, ET C'EN EST LA PREUVE:
   * `defaultScopeFor("draft_note", …)` rend `"next_plan"` pour les six familles
   * autorisées. Un jour où elle rendrait autre chose, `assertNextPlan` ci-dessous
   * ferait tomber l'item dans `malformed` plutôt que de le ranger de travers.
   */
  readonly nextPlan: readonly NextPlanEntry[];
}

/** Un refus de la classification ENTIÈRE, avant même de regarder les items. */
export type DraftNoteClassifyRefusal =
  /** La charge du modèle n'est pas un objet portant une liste `items`. */
  | "unreadable_payload"
  /** `at` n'est pas un jour propre: on ne saurait pas dire « retenu de mardi ». */
  | "bad_day"
  /** La semaine visée n'est pas lisible: on ne saurait pas dire quand ça meurt. */
  | "bad_anchor";

export interface DraftNoteClassifyOutcome {
  readonly ok: boolean;
  /** `null` quand `ok`. Un échec est DICIBLE, jamais un silence. */
  readonly refusal: DraftNoteClassifyRefusal | null;
  readonly classification: DraftNoteClassification;
}

const EMPTY_REFUSALS: DraftNoteRefusals = {
  total: 0,
  unknownKind: 0,
  forbiddenKind: 0,
  unknownMember: 0,
  badText: 0,
  malformed: 0,
};

const EMPTY_CLASSIFICATION: DraftNoteClassification = {
  proposed: 0,
  kept: 0,
  refused: EMPTY_REFUSALS,
  nextPlan: [],
};

/**
 * LIT CE QUE LE MODÈLE A RENDU, ET N'EN GARDE QUE CE QUE LA MATRICE PERMET.
 *
 * ── L'ORDRE DES PORTES, ET IL COMPTE ──────────────────────────────────────
 *  1. le jour et l'ancre, une fois pour toute la charge — sans eux, aucun item
 *     ne peut être daté ni mourir, et il n'y a rien à sauver item par item;
 *  2. `kind` dans la liste fermée;
 *  3. **la matrice** — `canProduce`, puis `defaultScopeFor`, dont le `null` est
 *     un REFUS et jamais un `?? "next_plan"`;
 *  4. le sujet, JOINT PAR IDENTIFIANT au rôle;
 *  5. `text`, non vide et pas plus long que la note d'où il sort;
 *  6. `parseRetainedItem` — LE SOCLE EST LE DERNIER MOT. Il revérifie la
 *     matrice, la forme du `value`, les deux invariants de `scope`. Ce module
 *     ne réécrit aucune de ces règles: un second parseur diverge du premier.
 *
 * @param today le jour LOCAL de la personne, `YYYY-MM-DD`. Ce module ne lit
 *   aucune horloge.
 * @param targetWeek un jour de la SEMAINE VISÉE — en pratique le premier jour
 *   du plan qu'on vient d'écrire. L'ancre stockée en est le lundi ISO.
 *   ⚠️ CE N'EST PAS `today`: quelqu'un qui adopte le dimanche un plan qui
 *   commence lundi vise la semaine SUIVANTE, et ancrer sur le jour de la frappe
 *   ferait mourir son envie le lendemain matin (§7 de la nomenclature).
 */
export function readDraftNoteClassification(args: {
  raw: unknown;
  today: string;
  targetWeek: string;
  members: readonly DraftNoteMember[];
  /** La note d'origine — elle borne `text`. Voir `badText`. */
  note: string;
}): DraftNoteClassifyOutcome {
  const at = parseRetainedDay(args.today);
  if (!at) {
    return { ok: false, refusal: "bad_day", classification: EMPTY_CLASSIFICATION };
  }
  // ⚠️ L'ANCRE EST CALCULÉE ICI, PAS RECALÉE PLUS TARD. `withNextPlanEntries`
  // et `partitionForNextPlanStore` REFUSENT une ancre qui n'est pas un lundi
  // ISO (« strict à l'écriture, tolérant à la lecture »): un producteur qui
  // enverrait le premier jour du plan tel quel verrait ses entrées comptées
  // `misfiled` par la porte, sans un mot de plus.
  const anchor = isoMondayOf(args.targetWeek);
  if (!anchor) {
    return { ok: false, refusal: "bad_anchor", classification: EMPTY_CLASSIFICATION };
  }

  const rows = itemsOf(args.raw);
  if (rows === null) {
    return {
      ok: false,
      refusal: "unreadable_payload",
      classification: EMPTY_CLASSIFICATION,
    };
  }

  // Le rôle, réduit à un ENSEMBLE D'IDENTIFIANTS. C'est une jointure: égalité
  // de chaînes sur un uuid. ⛔ Aucun rapprochement par le prénom ni par le texte.
  const roster = new Set<string>();
  for (const member of args.members ?? []) {
    const id = String(member?.memberId ?? "").trim().toLowerCase();
    if (id) roster.add(id);
  }

  const noteLength = String(args.note ?? "").trim().length;
  // La borne de `text` est DÉRIVÉE, pas inventée: l'item sort d'une note
  // elle-même plafonnée à `DRAFT_NOTE_MAX_CHARS` par la garde d'entrée. Un
  // `text` plus long que sa source ne peut pas être « ses mots à elle ». On
  // prend le plus étroit des deux, et jamais zéro (une note vide n'arrive pas
  // ici: `hasDraftNote` a déjà mordu chez l'appelant).
  const textMax = Math.min(
    DRAFT_NOTE_MAX_CHARS,
    noteLength > 0 ? noteLength : DRAFT_NOTE_MAX_CHARS,
  );

  let unknownKind = 0;
  let forbiddenKind = 0;
  let unknownMember = 0;
  let badText = 0;
  let malformed = 0;
  const nextPlan: NextPlanEntry[] = [];

  for (const row of rows) {
    const record = row && typeof row === "object" && !Array.isArray(row)
      ? row as Record<string, unknown>
      : null;
    if (!record) {
      malformed += 1;
      continue;
    }

    const kind = parseRetainedKind(record.kind);
    if (!kind) {
      unknownKind += 1;
      continue;
    }

    // ── LA MATRICE, ET SES DEUX MOITIÉS ────────────────────────────────────
    // ⛔ `canProduce` d'abord. C'est ici que `portion.adjust` et `rhythm.set`
    //    tombent, et c'est le nombre qu'on regarde.
    if (!canProduce(DRAFT_NOTE_PRODUCER, kind)) {
      forbiddenKind += 1;
      continue;
    }
    // ⛔ PUIS `defaultScopeFor`, DONT LE `null` EST UN REFUS. Jamais
    //    `?? "next_plan"`. Aujourd'hui cette branche est inatteignable — les
    //    deux fonctions partagent `canProduce` — et elle reste écrite: le jour
    //    où la nomenclature séparerait les deux, le repli aurait réarmé
    //    l'interdit en silence.
    const scope = defaultScopeFor(DRAFT_NOTE_PRODUCER, kind);
    if (scope === null) {
      forbiddenKind += 1;
      continue;
    }

    // ── LE SUJET — jointure par identifiant, jamais par prénom ─────────────
    const rawMember = String(record.member_id ?? "").trim().toLowerCase();
    let subject: string = HOUSEHOLD_SUBJECT;
    if (rawMember !== "" && rawMember !== "null") {
      // ⛔ UN ID HORS RÔLE EST UN REFUS, PAS UN REPLI SUR `household`. Replier
      //    appliquerait à toute la table une demande qui visait une bouche.
      if (!roster.has(rawMember)) {
        unknownMember += 1;
        continue;
      }
      const named = memberSubject(rawMember);
      if (!named) {
        unknownMember += 1;
        continue;
      }
      subject = named;
    }

    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (text === "" || text.length > textMax) {
      badText += 1;
      continue;
    }

    // ── LE SOCLE EST LE DERNIER MOT ────────────────────────────────────────
    // ⚠️ ON N'ASSEMBLE PAS UN `RetainedItem` À LA MAIN. Un `as RetainedItem`
    // désarmerait le typecheck (cicatrice mesurée: `200` au log, `null` en
    // silence). L'objet nu passe par `parseRetainedItem`, qui revérifie la
    // matrice, la forme du `value` et les deux invariants de `scope`.
    const item = parseRetainedItem({
      kind,
      scope,
      subject,
      text,
      value: record.value ?? null,
      source: DRAFT_NOTE_PRODUCER,
      at,
      // ⚠️ `""` — ce producteur ne cite AUCUNE ligne de `memory_items`: la
      // note n'est pas un souvenir, c'est une phrase que la personne vient
      // d'écrire. Le socle l'accepte pour `draft_note` (`parseOriginItem`).
      item: "",
      // ⚠️ `null` OBLIGATOIRE hors `conversation`. Une confiance sur un fait
      // déclaré est une erreur de catégorie, et le socle la REFUSE.
      confidence: null,
    });
    if (!item) {
      malformed += 1;
      continue;
    }
    // ⚠️ LA CEINTURE DU MAGASIN. `defaultScopeFor` rend `next_plan` pour les
    // six familles d'aujourd'hui; si ça changeait, l'item irait dans le mauvais
    // magasin et la porte le compterait `misfiled` sans qu'on sache pourquoi.
    if (item.scope !== "next_plan") {
      malformed += 1;
      continue;
    }
    nextPlan.push({ item, anchor });
  }

  const refused: DraftNoteRefusals = {
    total: unknownKind + forbiddenKind + unknownMember + badText + malformed,
    unknownKind,
    forbiddenKind,
    unknownMember,
    badText,
    malformed,
  };

  return {
    ok: true,
    refusal: null,
    classification: {
      proposed: rows.length,
      kept: nextPlan.length,
      refused,
      nextPlan,
    },
  };
}

/**
 * LA LISTE `items` DE LA CHARGE, ou `null` quand la charge est illisible.
 *
 * ⚠️ `null` ET `[]` NE SONT PAS LA MÊME CHOSE. `[]` veut dire « le modèle a lu
 * la note et n'a rien trouvé à ranger » — la réponse correcte et fréquente.
 * `null` veut dire « il n'a pas rendu la forme demandée », c'est-à-dire un
 * prompt qui ne tient pas. Les confondre à `[]` ferait ressembler un prompt
 * cassé à un produit calme.
 */
function itemsOf(raw: unknown): unknown[] | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const items = (value as Record<string, unknown>).items;
  if (items === undefined || items === null) return null;
  return Array.isArray(items) ? items : null;
}

/**
 * LA LIGNE DE JOURNAL, en un objet. Les trois nombres se lisent ENSEMBLE.
 *
 * `proposed > 0 && kept === 0` = le prompt ne tient pas.
 * `refused.forbiddenKind > 0` = l'échappatoire mesurée, celle qu'on suit.
 * `proposed === 0` sur une note non vide = le modèle n'a rien vu à ranger.
 */
export function draftNoteClassifyTrace(
  classification: DraftNoteClassification,
): Record<string, number> {
  return {
    proposed: classification.proposed,
    kept: classification.kept,
    refused: classification.refused.total,
    refused_unknown_kind: classification.refused.unknownKind,
    refused_forbidden_kind: classification.refused.forbiddenKind,
    refused_unknown_member: classification.refused.unknownMember,
    refused_bad_text: classification.refused.badText,
    refused_malformed: classification.refused.malformed,
  };
}

/** Le type d'un item ressorti d'ici, pour les appelants qui veulent l'écrire. */
export type DraftNoteItem = RetainedItem;
