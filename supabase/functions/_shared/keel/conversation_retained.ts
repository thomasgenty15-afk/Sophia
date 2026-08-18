/**
 * LE MEMORIZER COMME PRODUCTEUR, ET LA REDIRECTION DU SIZING — lot 2C du
 * chantier « mémoire structurée ». Le PROMPT, la RELECTURE, et LA PHRASE DE
 * RENVOI. **Rien d'autre.**
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §5 **ligne ③**.
 * Socle: `retained_item.ts` (ce fichier ne le modifie pas et n'en réécrit rien).
 * Magasins: `food_preference_promotion.ts` (durable) et `retained_next_plan.ts`
 * (provisoire). Porte d'écriture serveur: `retained_items_io.ts`.
 * L'appel modèle et la persistance vivent dans `conversation_retained_io.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES DEUX MOITIÉS, ET POURQUOI ELLES SONT DANS LE MÊME FICHIER
 * ═══════════════════════════════════════════════════════════════════════════
 * Elles sont **la même règle, prise par ses deux bouts**: la ligne ③ de la
 * matrice dit ce que la conversation a le droit de proposer, et ce qu'elle doit
 * RENVOYER au lieu de le classer. Les séparer ferait deux fichiers dont l'un
 * porterait l'interdit et l'autre la seule chose qui rend l'interdit
 * supportable pour la personne — et le jour où la matrice bougerait, un seul
 * des deux suivrait.
 *
 *   A · CE QUE LE MEMORIZER PROPOSE — `food.*`, `method.*`, `rhythm.set`,
 *       `logistics.set`, `craving`. **Proposé, jamais gardé d'office.**
 *   B · CE QU'IL NE CLASSE PAS — `portion.adjust`. Il RENVOIE, en une phrase,
 *       vers le bilan de fin de plan.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ A · RIEN N'ENTRE SANS UN « KEEP », ET C'EST UNE JOINTURE, PAS UNE POLITIQUE
 * ═══════════════════════════════════════════════════════════════════════════
 * `memory_items` est un magasin **probabiliste** — confiance, ranking, statut
 * `candidate`. La confirmation est ce qui transforme une inférence en **fait
 * déclaré**, et c'est elle qui tient toute la promesse « rien d'opaque ».
 *
 * ── OÙ EST ÉCRIT LE « KEEP », ET POURQUOI ON NE LE REDEMANDE PAS ───────────
 * Il est **déjà en base**, et depuis longtemps: quand la personne garde une
 * proposition, `applyFoodPreferenceDecision({kind:"keep"})` écrit son texte dans
 * `food_preferences` ET une entrée d'origine
 * `food_preferences_origin[texte] = { item: <uuid du souvenir>, at, source }`.
 * Cette entrée EST le reçu de la confirmation. `keptMemoryLinesFrom` ci-dessous
 * ne fait que le lire, **par les primitives exportées du magasin**
 * (`retainedItemsFrom(...).legacyNotes` + `originOf`) — jamais par une seconde
 * lecture maison de la même structure, qui divergerait au premier changement de
 * forme (ce fichier-là a déjà payé `"[object Object]"`).
 *
 * ⚠️ **`item` VIDE PROTÈGE L'ENTRÉE, ET C'EST LA GARDE DE CE LOT.** Une ligne
 * dont l'origine porte `item: ""` est réputée **écrite par la personne**
 * (`source: "written"`): le memorizer ne peut pas la retirer, et il ne peut pas
 * davantage la RÉCLAMER. `keptMemoryLinesFrom` la laisse dehors, donc elle
 * n'entre dans aucun prompt de classification, donc aucun `RetainedItem`
 * `source: "conversation"` ne peut jamais la désigner. Elle lui appartient.
 * La garde tient aussi plus bas, à la porte: `written` impose `item: ""`, donc
 * la ligne n'a pas d'identifiant `(kind, item)` et aucune collision ne la vise.
 *
 * ── ⛔ LE SEUIL 0,70 N'EST PAS ICI, ET IL NE DOIT PAS Y ÊTRE ───────────────
 * `MIN_CONFIDENCE = 0.7` vit dans `food_preference_promotion.ts`, privé, et il
 * a **déjà mordu** avant que ce module ne voie quoi que ce soit: une ligne ne
 * peut porter une origine `memory` que parce que `proposeFoodPreferences` l'a
 * proposée, et il ne propose rien sous 0,70. Le reproduire ici serait un
 * **second seuil**, et un second seuil diverge — le socle le dit mot pour mot
 * (`RetainedItemBase.confidence`: « un second seuil dans un second fichier est
 * un seuil qui divergera »). Un test de source vérifie qu'aucun littéral de
 * seuil n'apparaît dans ce fichier.
 *
 * Ce module PORTE la confiance (le socle l'exige pour `source: "conversation"`,
 * et la refuse partout ailleurs), il ne la SEUILLE pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ B · LE SIZING NE SE CLASSE PAS: IL SE RENVOIE
 * ═══════════════════════════════════════════════════════════════════════════
 * `canProduce("conversation", "portion.adjust")` rend `false`, et c'est le point
 * central du chantier entier: **une mesure a besoin d'un sujet, et la
 * conversation ne sait pas l'attribuer.** « Les portions étaient trop grosses »,
 * dans un foyer de quatre, ne désigne personne. Le questionnaire, lui, pose la
 * question avec la liste du foyer sous les yeux — question fermée, pas
 * inférence.
 *
 * **Le produit préfère une question de plus à une part fausse.** Donc on ne
 * jette pas le retour en silence: on le dit, une phrase, une seule.
 *
 * ⛔ ── AUCUN MATCHER MAISON POUR DÉTECTER LE SIZING ───────────────────────
 * Le signal `plan_feedback` du dispatcher porte déjà `detected`, `kind`,
 * `detail` et `sentiment` (`router/dispatcher.ts`). On le LIT. Reconnaître
 * « les parts sont trop grosses » sur du texte libre, dans deux langues,
 * demanderait exactement le matcher que ce dépôt a mesuré faux: « laitue » ≠
 * « lait », 12 faux positifs sur 12.
 *
 * ⚠️ ── LA LANGUE, ET ELLE EST UNE CICATRICE CHIFFRÉE ──────────────────────
 * Deux packs entiers, jamais un repli mot à mot, et la langue arrive en
 * paramètre — `responseLocale`, résolu UNE FOIS par le tour. `profiles.locale`
 * vaut `fr-FR` par défaut sur ce produit: une phrase anglaise en dur serait
 * lue par la majorité des élèves. Le dépôt porte les deux mesures — une garde
 * testée dans une seule langue (`not` ne couvre pas `doesn't`), et une doctrine
 * `fr-FR` sortie en anglais.
 *
 * ⚠️ ── ET ELLE DOIT ÊTRE **DITE**, PAS SEULEMENT RENDUE ────────────────────
 * `appendSizingRedirect` est faite pour être appelée DANS `finalVisibleText`,
 * au même endroit et pour la même raison qu'`appendPhotoInvitation`: c'est le
 * seul entonnoir que les chemins de sortie traversent tous. Une lane voisine
 * (`plan_question`) capture 38 % des tours et rend sa propre réponse; une
 * phrase posée avant elle serait avalée. Posée là, elle sort quelle que soit la
 * lane qui a parlé.
 *
 * PURE MODULE: no I/O, no clock, no randomness. Le jour et la langue arrivent
 * TOUJOURS en paramètre.
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
  RHYTHM_OCCASIONS,
  VARIETY_LEVELS,
} from "./retained_item.ts";
import { isoMondayOf, type NextPlanEntry } from "./retained_next_plan.ts";
import { originOf, retainedItemsFrom } from "./food_preference_promotion.ts";
import { isFrenchLocale } from "./locale.ts";
import { DAY_TOKENS } from "./tokens.ts";

// ===========================================================================
// LE JETON DE LA MATRICE
// ===========================================================================

/**
 * ⛔ `"conversation"`, ET JAMAIS `"written"`.
 *
 * `canProduce("written", …)` rend `true` pour LES HUIT familles — c'est la
 * contrepartie exacte des trois interdits (la personne peut tout rendre durable
 * depuis sa carte, explicitement). Un producteur serveur qui se déclarerait
 * `written` contournerait donc **la matrice entière par un seul mot**: il
 * écrirait le `portion.adjust` que toute cette ligne existe pour empêcher, et
 * la carte l'afficherait « tu l'as écrit », ce qui serait faux (contrat §8
 * point 2).
 *
 * ⚠️ ÉPINGLÉ À SON LITTÉRAL PAR LE TEST. C'est le jumeau du jeton lu par
 * `canProduce`, par `parseRetainedItem` À LA LECTURE, par le port serveur
 * (`ServerRetainedSource`) et par la carte. Une constante qui a un jumeau
 * ailleurs et que rien ne relie laisse les tests verts pendant que l'écriture
 * part dans un mot que plus personne ne lit (leçon des bretelles, contrat §7.4).
 */
export const CONVERSATION_PRODUCER = "conversation" as const;

/**
 * LES FAMILLES QUE CE PRODUCTEUR A LE DROIT DE PROPOSER — **CALCULÉES**.
 *
 * ⚠️ DÉRIVÉES DE `canProduce`, JAMAIS RETAPÉES. Une seconde liste écrite à la
 * main ici serait une seconde matrice: le jour où la nomenclature bougerait,
 * l'une des deux resterait en arrière et c'est celle qu'on regarde le moins qui
 * déciderait. Le test épingle le RÉSULTAT contre une liste littérale — c'est
 * l'égalité qui est prouvée, pas la recopie.
 */
export const CONVERSATION_KINDS: readonly RetainedKind[] = ([
  "food.exclude",
  "food.prefer",
  "method.avoid",
  "method.prefer",
  "portion.adjust",
  "rhythm.set",
  "logistics.set",
  "craving",
] as const).filter((kind) => canProduce(CONVERSATION_PRODUCER, kind));

/**
 * LA SEULE FAMILLE INTERDITE À CE PRODUCTEUR — **CALCULÉE** elle aussi.
 *
 * Elle sert au PROMPT (la nommer est ce qui fait tomber le taux d'échappatoire),
 * au TEST (un cas qui mord, un cas qui passe) et au RENVOI: c'est elle que la
 * phrase de la moitié B redirige.
 */
export const CONVERSATION_FORBIDDEN_KINDS: readonly RetainedKind[] = ([
  "portion.adjust",
] as const).filter((kind) => !canProduce(CONVERSATION_PRODUCER, kind));

// ===========================================================================
// A · LE REÇU DU « KEEP » — ce que la personne a confirmé, et rien d'autre
// ===========================================================================

/**
 * UNE LIGNE CONFIRMÉE, telle qu'elle est lisible dans `practical_constraints`.
 *
 * ⚠️ `memoryItemId` N'EST JAMAIS VIDE ICI, PAR CONSTRUCTION. Une ligne sans
 * souvenir d'origine est une ligne que la personne a tapée, et elle ne rentre
 * pas dans cette liste — voir `keptMemoryLinesFrom`.
 */
export type KeptLineRef = {
  /** L'uuid du `memory_items` que la personne a confirmé. Jamais `""`. */
  readonly memoryItemId: string;
  /** Le texte GARDÉ, tel qu'il s'affiche. C'est lui qu'on donne à classer. */
  readonly text: string;
  /** `YYYY-MM-DD` du jour où elle l'a dit, ou `null` (forme ancienne). */
  readonly at: string | null;
};

/**
 * LES LIGNES QUE LA PERSONNE A CONFIRMÉES — LA PORTE D'ENTRÉE DE TOUT LE LOT.
 *
 * ── CE QUI ENTRE ──────────────────────────────────────────────────────────
 * Une ligne de `food_preferences` dont l'entrée d'origine porte un `item` non
 * vide. Ça veut dire: le memorizer l'a proposée (donc elle a passé le seuil de
 * promotion et la ligne médicale), et **la personne a appuyé sur « Keep »**.
 *
 * ── ⛔ CE QUI N'ENTRE PAS, ET C'EST LA GARDE ──────────────────────────────
 *   · une ligne SANS entrée d'origine — provenance inconnue, donc pas un
 *     « Keep » qu'on puisse citer;
 *   · une ligne dont l'origine porte `item: ""` — **elle est réputée écrite par
 *     la personne** (`source: "written"`), et ce vide-là est exactement ce qui
 *     la protège du memorizer. La réclamer ici la ferait rentrer par une porte
 *     qui n'a jamais rien confirmé, et la carte l'afficherait ensuite « je l'ai
 *     retenu de mardi » sur une phrase que quelqu'un a tapée.
 *
 * ⚠️ AUCUN RAPPROCHEMENT PAR LE TEXTE. La jointure est `texte gardé → entrée
 * d'origine`, c'est-à-dire la clé que le magasin utilise déjà lui-même, lue par
 * `originOf`. On ne devine rien.
 *
 * PURE: aucun I/O. Les phrases plates viennent de `retainedItemsFrom`, qui est
 * la lecture NOMMÉE du magasin (`legacyNotes`); en refaire une seconde ici
 * serait la faute que ce fichier-là documente deux fois.
 */
export function keptMemoryLinesFrom(
  constraints: Record<string, unknown> | null | undefined,
): KeptLineRef[] {
  const { legacyNotes } = retainedItemsFrom(constraints);
  const out: KeptLineRef[] = [];
  const seen = new Set<string>();
  for (const text of legacyNotes) {
    const origin = originOf(constraints, text);
    if (!origin) continue;
    const memoryItemId = String(origin.item ?? "").trim();
    // ⛔ LE VIDE PROTÈGE. Voir le bloc ci-dessus: c'est la ligne de la personne.
    if (memoryItemId === "") continue;
    // Un même souvenir ne se classe pas deux fois: la porte le refuserait
    // (`alreadyStored`, identité `(kind, item)`) après avoir payé un tour de
    // modèle pour rien.
    if (seen.has(memoryItemId)) continue;
    seen.add(memoryItemId);
    out.push({ memoryItemId, text, at: origin.at ?? null });
  }
  return out;
}

/**
 * UNE LIGNE CONFIRMÉE, JOINTE À SON SOUVENIR. Ce que la classification reçoit.
 *
 * ⚠️ `confidence` VIENT DU SOUVENIR, PAS D'UNE ESTIMATION D'ICI. Le socle
 * l'exige pour `source: "conversation"` et la refuse partout ailleurs: une
 * confiance accrochée à un fait déclaré est une erreur de catégorie. Elle est
 * **portée**, jamais seuillée — le seuil a mordu en amont (voir l'en-tête).
 */
export type KeptMemoryLine = KeptLineRef & {
  /** `YYYY-MM-DD`. Requis ici: le socle refuse un `at` illisible. */
  readonly at: string;
  /** La confiance du memorizer, telle qu'elle est en base. */
  readonly confidence: number;
};

// ===========================================================================
// A · LE PROMPT — la promesse TOUCHE la clé de schéma
// ===========================================================================

/** Une bouche, réduite à ce dont ce prompt a besoin. */
export type ConversationMember = {
  /** L'uuid du membre. C'est LUI que le modèle recopie, jamais le prénom. */
  readonly memberId: string;
  /** Comment la personne l'appelle. Sert au modèle à LIRE, pas à écrire. */
  readonly label: string;
};

/**
 * ⚠️ LA PROMESSE ET LA CLÉ DE SCHÉMA SE TOUCHENT, ET C'EST MESURÉ.
 *
 * Cicatrice de ce dépôt: **0 % de conformité** quand la promesse (« ne rends
 * jamais X ») et la clé qui la porte (`"kind"`) sont éloignées dans le prompt.
 * L'interdit est donc écrit SUR la ligne de `"kind"`, pas dans une section
 * « règles » plus bas.
 *
 * ── CE QUE LE MODÈLE NE REND PAS, ET POURQUOI CE N'EST PAS UN OUBLI ────────
 * Il ne rend **ni `scope`, ni `source`, ni `at`, ni `confidence`, ni `item`**.
 *   · `scope` vient de `defaultScopeFor`;
 *   · `source` est le jeton de la matrice: le laisser au modèle, ce serait
 *     laisser une règle de sécurité à une chaîne de caractères;
 *   · `at` est le jour où la personne l'a DIT — il vient du souvenir;
 *   · `confidence` et `item` viennent du souvenir aussi. Un modèle qui les
 *     écrirait fabriquerait la traçabilité au lieu de la porter.
 *
 * ⚠️ IL NE CHOISIT PAS NON PLUS **QUOI** CLASSER. On lui donne exactement les
 * lignes confirmées, et il les RANGE. Lui laisser proposer des phrases neuves
 * rouvrirait la porte que le « Keep » ferme.
 */
export const CONVERSATION_CLASSIFY_SYSTEM_PROMPT = [
  "You are a filing clerk. Someone said things about their food in conversation, and they have ALREADY confirmed, one by one, the lines below — they pressed Keep on each of them. Your only job is to put each confirmed line in the right drawer, so the next meal plan knows what it is.",
  "",
  "You do not add lines. You do not invent lines. You do not judge what they want. Every line you return must be one of the lines given to you, filed — never a new thought of yours.",
  "",
  "Return ONE JSON object, and nothing else. No prose, no code fence.",
  "",
  '{ "items": [ ... ] }',
  "",
  'Each entry of "items" is exactly this, and nothing more:',
  "{",
  '  "memory_id": the id COPIED EXACTLY from the line you are filing. Never invented, never edited. A line you cannot file is simply left out,',
  `  "kind": exactly one of ${
    CONVERSATION_KINDS.join(" | ")
  } — and NEVER ${
    CONVERSATION_FORBIDDEN_KINDS.join(", NEVER ")
  }, not even when the line is plainly about a serving being too big or too small. That one is asked somewhere else, in a closed question, with the list of the people at the table in front of the person — because a measure needs to know WHO, and a sentence said in passing does not name anyone. When a line is about how much is on a plate, return NOTHING for it: leave it out of "items" entirely. Filing it under a neighbouring kind would be worse than losing it,`,
  '  "text": the line as it is written below, or a shorter version of it in THEIR language. This is what they will read on their own memory card, and they can edit it. Never a sentence you invented, never longer than the line you were given,',
  '  "member_id": null when it is for everyone at the table — that is the normal answer and the right one most of the time. An id COPIED EXACTLY from the roster below only when the line names that person. NEVER a first name,',
  '  "value": null for every kind except rhythm.set and logistics.set (see below)',
  "}",
  "",
  "WHAT EACH KIND IS FOR:",
  "- food.exclude — a food or a dish they do not want any more.",
  "- food.prefer — a food or a dish they want to see again.",
  "- method.avoid — a preparation that does not work for them (fried, raw, spicy).",
  "- method.prefer — a preparation they like.",
  "- rhythm.set — a moment of the day that exists, or does not exist, for someone.",
  "- logistics.set — which days they cook, how long, how hard, how varied, what they spend.",
  "- craving — one specific thing they want soon: \"fajitas next week\".",
  "",
  "rhythm.set carries a value:",
  `  { "occasion": one of ${RHYTHM_OCCASIONS.join(" | ")}, "present": true or false }`,
  "logistics.set carries a value:",
  `  { "field": one of ${LOGISTICS_FIELDS.join(" | ")}, "value": ... }`,
  `  cook_days takes a list of ${DAY_TOKENS.join(" | ")}.`,
  "  cooking_time_min takes a whole number of minutes. budget_amount takes a number.",
  `  recipe_difficulty takes ${RECIPE_DIFFICULTIES.join(" | ")}. variety takes ${
    VARIETY_LEVELS.join(" | ")
  }.`,
  "  NEVER invent a number they did not say. If they said no number, this is not a logistics.set.",
  "",
  "NEVER file an allergy, an intolerance, a diet, or a medical condition. Those are asked directly, with consent, and they live somewhere this list cannot reach. \"no peanuts, they make me ill\" is at most a food.exclude — you are filing a preference, never a medical fact.",
  "",
  "Return an EMPTY list when none of the lines fits a drawer. An empty list is a correct answer. Filing a line in the wrong drawer is worse than leaving it out.",
].join("\n");

/**
 * LE TOUR « UTILISATEUR »: les lignes confirmées, la langue, et le rôle.
 *
 * ⚠️ `members` EST REQUIS, ET `[]` EST UNE RÉPONSE. `[]` dit « personne d'autre
 * à table » (l'entrée du produit est à une bouche); `undefined` dirait « je
 * n'ai pas su lire le foyer », et les deux n'autorisent pas la même chose. Ce
 * dépôt a plusieurs cicatrices nommées « paramètre de garde optionnel = garde
 * désarmée ».
 */
export function buildConversationClassifyPrompt(args: {
  kept: readonly KeptMemoryLine[];
  contentLocale: string;
  members: readonly ConversationMember[];
}): string {
  const lines: string[] = [];
  lines.push("The lines they confirmed, one JSON object each — file these and only these:");
  for (const line of args.kept ?? []) {
    lines.push(
      JSON.stringify({
        memory_id: line.memoryItemId,
        line: line.text,
        said_on: line.at,
      }),
    );
  }
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
// A · LA RELECTURE — et rien ne se perd en silence
// ===========================================================================

/**
 * CE QUI N'EST PAS ENTRÉ, MOTIF PAR MOTIF.
 *
 * ⚠️ « Champ déclaré par le modèle = compteur obligatoire ». `memory_id`,
 * `kind`, `text`, `member_id` et `value` sont TOUS déclarés par le modèle: on ne
 * peut pas SAVOIR d'avance à quelle fréquence il les remplit bien, seulement le
 * mesurer. Sans ces nombres, un prompt que le modèle ignore rendrait une liste
 * vide, rien ne serait écrit, et le lot ressemblerait trait pour trait à un lot
 * qui marche — la carte dirait exactement ce qu'elle disait avant.
 */
export interface ConversationRefusals {
  /** La somme des motifs ci-dessous. */
  readonly total: number;
  /**
   * ⛔ LA GARDE DU « KEEP », COMPTÉE. Le `memory_id` rendu ne désigne aucune
   * ligne confirmée: le modèle a inventé une entrée, ou en a réclamé une que la
   * personne n'a pas gardée. Un nombre non nul ici veut dire que le prompt ne
   * tient pas — jamais qu'on peut assouplir la jointure.
   */
  readonly notKept: number;
  /** `kind` hors de la liste fermée des huit. */
  readonly unknownKind: number;
  /**
   * ⛔ L'ÉCHAPPATOIRE MESURÉE: `portion.adjust`.
   * `canProduce(conversation, kind)` a mordu, ou `defaultScopeFor` a rendu
   * `null`. C'est le nombre que la moitié B rend visible à la personne.
   */
  readonly forbiddenKind: number;
  /** `member_id` qui n'est dans le rôle d'aucune bouche de ce foyer. */
  readonly unknownMember: number;
  /** `text` vide, ou plus long que la ligne dont il est censé sortir. */
  readonly badText: number;
  /** `parseRetainedItem` a refusé l'item assemblé (`value`, forme, invariants). */
  readonly malformed: number;
}

/** LE COMPTEUR À TROIS NOMBRES, plus le détail des refus. */
export interface ConversationClassification {
  /** Ce que le modèle a proposé — la longueur brute de sa liste. */
  readonly proposed: number;
  /** Ce qui est ressorti en `RetainedItem`, prêt pour la porte. */
  readonly kept: number;
  /** `proposed - kept`, ventilé. */
  readonly refused: ConversationRefusals;
  /** Les items DURABLES — `food.*`, `method.*`, `rhythm.set`, `logistics.set`. */
  readonly durable: readonly RetainedItem[];
  /** Les entrées PROVISOIRES, `{item, anchor}` — les `craving`. */
  readonly nextPlan: readonly NextPlanEntry[];
}

/** Un refus de la classification ENTIÈRE, avant même de regarder les items. */
export type ConversationClassifyRefusal =
  /** La charge du modèle n'est pas un objet portant une liste `items`. */
  | "unreadable_payload"
  /** La semaine visée n'est pas lisible: on ne saurait pas dire quand ça meurt. */
  | "bad_anchor";

export interface ConversationClassifyOutcome {
  readonly ok: boolean;
  /** `null` quand `ok`. Un échec est DICIBLE, jamais un silence. */
  readonly refusal: ConversationClassifyRefusal | null;
  readonly classification: ConversationClassification;
}

const EMPTY_REFUSALS: ConversationRefusals = {
  total: 0,
  notKept: 0,
  unknownKind: 0,
  forbiddenKind: 0,
  unknownMember: 0,
  badText: 0,
  malformed: 0,
};

const EMPTY_CLASSIFICATION: ConversationClassification = {
  proposed: 0,
  kept: 0,
  refused: EMPTY_REFUSALS,
  durable: [],
  nextPlan: [],
};

/**
 * LIT CE QUE LE MODÈLE A RENDU, ET N'EN GARDE QUE CE QUE LA MATRICE PERMET.
 *
 * ── L'ORDRE DES PORTES, ET IL COMPTE ──────────────────────────────────────
 *  1. l'ancre, une fois pour toute la charge — sans elle un `craving` ne peut
 *     pas mourir, et il n'y a rien à sauver item par item;
 *  2. **le « Keep »** — `memory_id` joint PAR IDENTIFIANT aux lignes confirmées.
 *     C'est la première porte parce que c'est la seule qui parle de consentement;
 *  3. `kind` dans la liste fermée;
 *  4. **la matrice** — `canProduce`, puis `defaultScopeFor`, dont le `null` est
 *     un REFUS et jamais un `?? "durable"`;
 *  5. le sujet, JOINT PAR IDENTIFIANT au rôle;
 *  6. `text`, non vide et pas plus long que la ligne d'où il sort;
 *  7. `parseRetainedItem` — LE SOCLE EST LE DERNIER MOT. Il revérifie la
 *     matrice, la forme du `value`, les deux invariants de `scope`, et il exige
 *     une `confidence` lisible sur une ligne de conversation. Ce module ne
 *     réécrit aucune de ces règles: un second parseur diverge du premier.
 *
 * @param targetWeek un jour de la SEMAINE VISÉE par les `craving`. L'ancre
 *   stockée en est le lundi ISO. ⚠️ CE N'EST PAS forcément le jour de la
 *   classification: quelqu'un qui dit le dimanche « des fajitas la semaine
 *   prochaine » vise la semaine SUIVANTE, et ancrer sur le jour du traitement
 *   ferait mourir son envie le lendemain matin (§7 de la nomenclature).
 */
export function readConversationClassification(args: {
  raw: unknown;
  kept: readonly KeptMemoryLine[];
  members: readonly ConversationMember[];
  targetWeek: string;
}): ConversationClassifyOutcome {
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

  // LE REÇU DU « KEEP », indexé par identifiant. ⛔ Aucun rapprochement par le
  // texte: c'est une jointure sur un uuid, comme partout ailleurs.
  const confirmed = new Map<string, KeptMemoryLine>();
  for (const line of args.kept ?? []) {
    const id = String(line?.memoryItemId ?? "").trim().toLowerCase();
    if (id) confirmed.set(id, line);
  }

  // Le rôle, réduit à un ENSEMBLE D'IDENTIFIANTS.
  const roster = new Set<string>();
  for (const member of args.members ?? []) {
    const id = String(member?.memberId ?? "").trim().toLowerCase();
    if (id) roster.add(id);
  }

  let notKept = 0;
  let unknownKind = 0;
  let forbiddenKind = 0;
  let unknownMember = 0;
  let badText = 0;
  let malformed = 0;
  const durable: RetainedItem[] = [];
  const nextPlan: NextPlanEntry[] = [];

  for (const row of rows) {
    const record = row && typeof row === "object" && !Array.isArray(row)
      ? row as Record<string, unknown>
      : null;
    if (!record) {
      malformed += 1;
      continue;
    }

    // ── ⛔ LA PORTE DU « KEEP », ET ELLE EST LA PREMIÈRE ────────────────────
    // Un `memory_id` qui ne désigne aucune ligne confirmée est un REFUS, pas
    // une ligne à sauver: elle entrerait sans que personne ne l'ait gardée.
    const memoryId = String(record.memory_id ?? "").trim().toLowerCase();
    const source = memoryId === "" ? undefined : confirmed.get(memoryId);
    if (!source) {
      notKept += 1;
      continue;
    }

    const kind = parseRetainedKind(record.kind);
    if (!kind) {
      unknownKind += 1;
      continue;
    }

    // ── LA MATRICE, ET SES DEUX MOITIÉS ────────────────────────────────────
    // ⛔ `canProduce` d'abord. C'est ici que `portion.adjust` tombe, et c'est le
    //    nombre que la moitié B rend visible à la personne.
    if (!canProduce(CONVERSATION_PRODUCER, kind)) {
      forbiddenKind += 1;
      continue;
    }
    // ⛔ PUIS `defaultScopeFor`, DONT LE `null` EST UN REFUS. Jamais
    //    `?? "durable"`. Aujourd'hui cette branche est inatteignable — les deux
    //    fonctions partagent `canProduce` — et elle reste écrite: le jour où la
    //    nomenclature séparerait les deux, le repli aurait réarmé l'interdit en
    //    silence.
    const scope = defaultScopeFor(CONVERSATION_PRODUCER, kind);
    if (scope === null) {
      forbiddenKind += 1;
      continue;
    }

    // ── LE SUJET — jointure par identifiant, jamais par prénom ─────────────
    const rawMember = String(record.member_id ?? "").trim().toLowerCase();
    let subject: string = HOUSEHOLD_SUBJECT;
    if (rawMember !== "" && rawMember !== "null") {
      // ⛔ UN ID HORS RÔLE EST UN REFUS, PAS UN REPLI SUR `household`. Replier
      //    appliquerait à toute la table ce qui visait une bouche (§2 axe 3).
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

    // `text` sort de la ligne confirmée: il ne peut pas être plus long qu'elle.
    // Une phrase plus longue n'est plus « ce qu'elle a gardé », c'est une
    // phrase que le modèle a écrite par-dessus.
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (text === "" || text.length > source.text.trim().length) {
      badText += 1;
      continue;
    }

    // ── LE SOCLE EST LE DERNIER MOT ────────────────────────────────────────
    // ⚠️ ON N'ASSEMBLE PAS UN `RetainedItem` À LA MAIN. Un `as RetainedItem`
    // désarmerait le typecheck (cicatrice mesurée: `200` au log, `null` en
    // silence). L'objet nu passe par `parseRetainedItem`, qui revérifie la
    // matrice, la forme du `value`, les deux invariants de `scope`, ET la
    // présence d'une `confidence` lisible sur une ligne de conversation.
    const item = parseRetainedItem({
      kind,
      scope,
      subject,
      text,
      value: record.value ?? null,
      source: CONVERSATION_PRODUCER,
      // ⚠️ LE JOUR OÙ ELLE L'A DIT, pas le jour du traitement. Le memorizer
      // tourne à minuit sur les 30 dernières heures: dater sur son passage
      // ferait dire « je l'ai retenu de mercredi » d'une phrase de mardi soir.
      at: source.at,
      // ⚠️ L'UUID DU SOUVENIR, OBLIGATOIRE POUR CETTE SOURCE. C'est lui qui
      // rend la ligne traçable (« je l'ai retenu de mardi ») et rétractable
      // quand le souvenir est démenti. Le socle le refuse vide.
      item: source.memoryItemId,
      // ⚠️ PORTÉE, PAS SEUILLÉE. Le seuil a mordu en amont — voir l'en-tête.
      confidence: source.confidence,
    });
    if (!item) {
      malformed += 1;
      continue;
    }

    // ⚠️ LA CEINTURE DES MAGASINS. Chaque famille va dans le sien; la porte
    // compterait `misfiled` sans qu'on sache pourquoi si on les mélangeait.
    if (item.scope === "next_plan") nextPlan.push({ item, anchor });
    else durable.push(item);
  }

  const refused: ConversationRefusals = {
    total: notKept + unknownKind + forbiddenKind + unknownMember + badText +
      malformed,
    notKept,
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
      kept: durable.length + nextPlan.length,
      refused,
      durable,
      nextPlan,
    },
  };
}

/**
 * LA LISTE `items` DE LA CHARGE, ou `null` quand la charge est illisible.
 *
 * ⚠️ `null` ET `[]` NE SONT PAS LA MÊME CHOSE. `[]` veut dire « le modèle a lu
 * les lignes et n'a rien su ranger » — une réponse correcte. `null` veut dire
 * « il n'a pas rendu la forme demandée », c'est-à-dire un prompt qui ne tient
 * pas. Les confondre à `[]` ferait ressembler un prompt cassé à un produit calme.
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
 * `refused.notKept > 0` = le modèle réclame des lignes que personne n'a gardées.
 */
export function conversationClassifyTrace(
  classification: ConversationClassification,
): Record<string, number> {
  return {
    proposed: classification.proposed,
    kept: classification.kept,
    durable: classification.durable.length,
    next_plan: classification.nextPlan.length,
    refused: classification.refused.total,
    refused_not_kept: classification.refused.notKept,
    refused_unknown_kind: classification.refused.unknownKind,
    refused_forbidden_kind: classification.refused.forbiddenKind,
    refused_unknown_member: classification.refused.unknownMember,
    refused_bad_text: classification.refused.badText,
    refused_malformed: classification.refused.malformed,
  };
}

// ===========================================================================
// B · LE RENVOI DU SIZING — une phrase, une seule, dans SA langue
// ===========================================================================

/**
 * LA PHRASE, DANS LES DEUX LANGUES. Deux packs entiers, jamais un repli mot à
 * mot — patron de `QUESTION_LABELS` (`plan_feedback.ts`) et de `COPY`
 * (`plan_question/renderer.ts`).
 *
 * ── CE QU'ELLE DIT, ET CE QU'ELLE NE DIT PAS ──────────────────────────────
 * Elle dit **où ça va** et **pourquoi on ne le range pas tout de suite**. Elle
 * ne promet pas d'avoir enregistré quoi que ce soit — ce serait un accusé sans
 * effet, exactement ce que la ceinture d'accusé fantôme retire. Et elle ne
 * demande rien ici: la question fermée appartient au questionnaire, qui a la
 * liste du foyer sous les yeux.
 *
 * ⛔ AUCUN PRÉNOM, AUCUN CHIFFRE. Le sujet est précisément ce qu'on ne sait
 * pas; en nommer un serait l'inventer.
 */
export const SIZING_REDIRECT_SENTENCES = {
  en:
    "I'm noting that for the end-of-plan review rather than filing it now — for a serving I need to know who it's for, and the review asks that with everyone at your table in front of you.",
  fr:
    "Je garde ça pour le bilan de fin de plan plutôt que de le ranger tout de suite — pour une portion j'ai besoin de savoir pour qui, et le bilan pose la question avec tout ton foyer sous les yeux.",
} as const;

/**
 * La phrase dans la langue de la personne.
 *
 * ⚠️ `isFrenchLocale` ET PAS `startsWith("fr")`. C'est le seul prédicat de
 * langue autorisé dans ce dépôt (`locale.ts`), et il normalise avant de couper.
 * ⚠️ ET PAS `localePackKey`: celui-là LÈVE sur une langue non livrée, et une
 * phrase d'accompagnement ne doit jamais faire tomber un tour.
 */
export function sizingRedirectSentence(locale: string | null | undefined): string {
  return isFrenchLocale(locale)
    ? SIZING_REDIRECT_SENTENCES.fr
    : SIZING_REDIRECT_SENTENCES.en;
}

/**
 * LE SIGNAL DU DISPATCHER, RÉDUIT À CE QUE CETTE RÈGLE REGARDE.
 *
 * ⛔ AUCUN MATCHER MAISON. Ce module ne lit pas le message de la personne: il
 * lit le verdict que le dispatcher a déjà rendu. « laitue » ≠ « lait », 12 faux
 * positifs sur 12 mesurés dans ce dépôt.
 */
export type SizingFeedbackSignal = {
  readonly detected: boolean;
  readonly kind?: string | null;
  readonly detail?: string | null;
  readonly sentiment?: string | null;
};

/**
 * LES JETONS DE `plan_feedback.kind` QUI PARLENT D'UNE PART. Liste FERMÉE.
 *
 * ⚠️ ELLE EST FERMÉE POUR LA MÊME RAISON QUE `RETAINED_KINDS`: un jeton inconnu
 * ne se devine pas. Un `kind` absent ou hors liste ne déclenche RIEN — le
 * silence est la bonne réponse quand on ne sait pas de quoi le tour parlait, et
 * poser la phrase « au cas où » la ferait sortir sur des tours qui ne parlent
 * pas de portions du tout.
 */
export const SIZING_FEEDBACK_KINDS: readonly string[] = [
  "portion",
  "portions",
  "portion_size",
  "serving",
  "serving_size",
  "sizing",
];

/**
 * FAUT-IL RENVOYER CE TOUR VERS LE QUESTIONNAIRE ?
 *
 * ⚠️ LES DEUX MOITIÉS SONT NÉCESSAIRES, et `detected` seul ne suffit pas: le
 * signal `plan_feedback` couvre tout retour sur une ligne de plan (« ce plat
 * était bon »), pas seulement les portions. Renvoyer sur `detected` seul ferait
 * sortir la phrase sur des compliments.
 *
 * PURE: aucun I/O, aucune horloge, aucune lecture du message.
 */
export function sizingFeedbackDetected(
  signal: SizingFeedbackSignal | null | undefined,
): boolean {
  if (!signal || signal.detected !== true) return false;
  const kind = String(signal.kind ?? "").trim().toLowerCase();
  if (kind === "") return false;
  return SIZING_FEEDBACK_KINDS.includes(kind);
}

/**
 * LA PHRASE À DIRE SUR CE TOUR, ou `null`.
 *
 * ⚠️ `isKeelStudent` EST REQUIS, JAMAIS OPTIONNEL — cicatrice « paramètre de
 * garde optionnel = garde désarmée ». Hors élève KEEL il n'y a ni plan, ni
 * bilan de fin de plan, ni foyer: la phrase renverrait vers un écran qui
 * n'existe pas.
 */
export function sizingRedirectFor(args: {
  signal: SizingFeedbackSignal | null | undefined;
  locale: string | null | undefined;
  isKeelStudent: boolean;
}): string | null {
  if (args.isKeelStudent !== true) return null;
  if (!sizingFeedbackDetected(args.signal)) return null;
  return sizingRedirectSentence(args.locale);
}

/**
 * L'AJOUT À LA RÉPONSE, par le runtime et pas par le modèle.
 *
 * ── POURQUOI UN AJOUT DÉTERMINISTE, ET PAS UNE CONSIGNE DE PROMPT ──────────
 * *« Une règle de prompt n'est pas une ceinture »* (`turn_ledger.ts`). Une
 * consigne « dis-lui d'aller au bilan » régresse en réel: le modèle l'oublie,
 * personne ne le voit, et le retour de la personne disparaît sans un mot —
 * c'est-à-dire exactement le défaut que ce lot existe pour fermer.
 *
 * ── ET POURQUOI DANS `finalVisibleText` ───────────────────────────────────
 * C'est le seul entonnoir que TOUS les chemins de sortie traversent. Une lane
 * voisine (`plan_question`) capture une part importante des tours et rend sa
 * propre réponse; une phrase posée en amont d'elle serait avalée sans trace.
 * Posée ici, elle sort quelle que soit la lane qui a parlé — et le test de
 * câblage épingle l'appel.
 *
 * CONDITION DE DÉSARMEMENT: sans phrase armée, la fonction rend le texte
 * INCHANGÉ et n'en retire jamais rien. Elle ne peut donc pas appauvrir une
 * réponse; au pire elle n'ajoute rien.
 */
export function appendSizingRedirect(
  text: string,
  sentence: string | null | undefined,
): string {
  const source = String(text ?? "");
  const redirect = String(sentence ?? "").trim();
  if (!redirect) return source;
  // Déjà présente (rejeu, ou composeur qui a recopié le gabarit): ne pas la
  // doubler. Comparaison EXACTE sur un gabarit fermé — pas une heuristique de
  // sens, une égalité de chaîne.
  if (source.includes(redirect)) return source;
  const body = source.trim();
  return body ? `${body}\n\n${redirect}` : redirect;
}
