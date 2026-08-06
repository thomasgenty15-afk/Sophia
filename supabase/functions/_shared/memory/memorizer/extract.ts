import { generateWithGemini } from "../../gemini.ts";
import { DOMAIN_KEYS_V1_DEFINITIONS } from "../domain_keys.ts";
import { PROMPT_VERSIONS } from "../prompts/index.ts";
import { resolveTemporalReferences } from "../runtime/temporal_resolution.ts";
import type {
  ExtractedMemoryItem,
  ExtractionPayload,
  KnownEntity,
  KnownMemoryItem,
  KnownTopic,
  MemorizerMessage,
  PlanSignal,
  TemporalHint,
} from "./types.ts";
import {
  MEMORY_EXTRACTION_MODEL_DEFAULT,
  MEMORY_EXTRACTION_PROMPT_VERSION,
} from "./types.ts";

const EXTRACTION_PROMPT_V1 = `
Tu es un extracteur de souvenirs pour Sophia.
Retourne uniquement un JSON strict avec memory_items, entities, corrections et rejected_observations.
Contraintes: source_message_ids obligatoire, pas de diagnostic, pas d'emotion subjective en fact,
kind dans la liste fermee, domain_keys dans la taxonomie fournie, event_start_at obligatoire pour les events.
Sophia est l'assistant/l'application: ne remplace jamais "l'utilisateur" par "Sophia" dans content_text ou normalized_summary, sauf si le message dit explicitement que le nom de la personne est Sophia.
Schema obligatoire pour chaque memory_items[]:
{ "kind": "fact|statement|event|action_observation", "content_text": "...", "normalized_summary": "...", "domain_keys": [], "confidence": 0.75, "importance_score": 0.5, "sensitivity_level": "normal|sensitive|safety", "sensitivity_categories": [], "requires_user_initiated": false, "source_message_ids": ["message_id"], "evidence_quote": "...", "topic_hint": "theme court ou null" }
topic_hint: intitule de theme court (2 a 5 mots, francais, minuscules) qui regroupe ce souvenir dans la vie du user (ex: "anxiete de performance", "rythme de sommeil", "relation avec lina"). Si un des known_topics fournis correspond, reprends EXACTEMENT son title ou son slug. Mets null seulement si aucun theme ne se degage (petit fait isole).
N'utilise jamais kind="preference" ou kind="goal" : encode les preferences/boundaries/goals en kind="statement" avec metadata.statement_role.
Pour une action ponctuelle deja realisee avec une date claire ("hier", "dimanche soir", "aujourd'hui"), utilise kind="event" plutot que action_observation.
Un motif RECURRENT ou une fenetre de vulnerabilite ("le soir vers 19h je craque", "chaque dimanche", "souvent quand je suis seule") n'est PAS un event meme s'il contient une heure: c'est un kind="statement" (fait durable sur la personne), persistable sans date. Reserve kind="event" aux occurrences uniques datees.
LANGUE DE SORTIE (nina-global18 batch + QA agent 4): content_text, normalized_summary et topic_hint sont ecrits dans LA LANGUE DU USER, donnee par user_profile.locale (ex: "en-GB" => anglais, "fr-FR" => francais). Si user_profile.locale est absent, ecris en ANGLAIS: le produit est anglais, et le repli francais d'origine etait le comportement historique de la branche grand public, supprimee le 2026-08-04. Un repli qui rend la langue de ce prompt plutot que celle du produit redevient actif au premier incident de lecture de profil — et c'est exactement ce qui s'est produit (chargeur mort jusqu'au 2026-08-03, user_profile toujours null, memoire entierement francaise pour un eleve en-GB). UNE SEULE langue par item, sans melange: aucun token d'une autre langue ni d'un autre alphabet (une contamination « de plus en plus ხშირად » a ete persistee telle quelle). Si le user a employe un mot etranger, traduis-le ou cite-le entre guillemets. La regle d'origine figeait le francais EN DUR: mesure le 2026-08-03, un eleve en-GB recevait une memoire entierement francaise, qui lui serait reinjectee telle quelle dans des reponses anglaises.
CONTENU DE CRISE SAFETY (nina-global18 batch): ce qui est dit PENDANT un tour de crise (ideation, hotline, means-removal, messages d'effondrement aigu) n'est JAMAIS persiste en item actif — meme regle que la detresse transitoire ci-dessous, etendue a tout le contenu du pic: au mieux rejected_observation. REFORMULER le pic en motif recurrent ne le rend PAS persistable (paul-p3verify batch, INVALIDE observe: « Le soir, quand la personne est seule, elle se sent vraiment vide » persiste actif depuis les tours d'ideation — c'est le contenu du pic redige en pattern, pas un fait confie): si la seule source du motif est un ou des tours de crise/detresse aigue, rejected_observation, et pose sensitivity_level="sensitive" ou "safety" sur tout ce qui en derive. Les faits de vie STABLES mentionnes incidemment pendant la crise (metier, allergie, date) restent memorisables s'ils sont detachables du pic emotionnel.
GENRE ET STYLE DE REDACTION (nina-untested R1-B07): user_profile fourni dans le payload porte le prenom et le genre du user. Redige content_text/normalized_summary en accord avec ce genre ("Elle est allergique..." pour une utilisatrice) ou au prenom ("Nina est allergique..."). Si le genre n'est pas fourni, style neutre (prenom ou tournures epicenes) — n'infere JAMAIS le masculin par defaut: des items mal genres seraient reinjectes tels quels dans les reponses futures.
ETATS PRODUIT — exclusion stricte: l'etat d'un objet Sophia (rappel cree/annule/modifie, carte creee, plan ajuste, preference reglee) n'est JAMAIS un memory_item, meme si la conversation en parle: la base de donnees est la seule source de verite de ces etats, et la conversation peut decrire une action qui a ECHOUE (ex: "annule-le" suivi d'un refus — memoriser "rappel annule" serait faux). Ajoute ces observations a rejected_observations. Seul le fait personnel sous-jacent est memorisable (ex: "prefere ne pas preparer son sac le soir"), jamais l'etat de l'objet produit. Exemples INVALIDES observes (12/07): "Le 13 juillet a 8h, un rappel etait demande pour preparer le sac de sport" (objet rappel), "L'utilisateur veut, de facon durable, un rappel tous les matins a 8h" (volonte de rappel, contredite ensuite dans le meme run), "Prevoit de poser son telephone dans l'entree le 13/07 a 19h15" (c'est l'INSTRUCTION d'un rappel reformulee en intention, avec une heure JAMAIS commise — la vraie heure DB etait 18h45). Toute phrase dont le sujet reel est un rappel/checkin (sa demande, son annulation, son horaire, son contenu) va en rejected_observations; un filtre de persistance rejettera de toute facon ces items.
Meme exclusion pour l'EXECUTION D'UNE ACTION DU PLAN deja rapportee a Sophia ("j'ai fait ma marche", "10 min faites", "j'ai reussi a prendre un petit-dejeuner posé"): ce suivi vit dans la base plan (user_plan_item_entries), pas en memoire — n'en fais NI event, NI action_observation, NI aucun autre item, quel que soit le statut vise (nina-hard22 batch, INVALIDE observe: un report de complétion persiste en candidate avec une date FAUSSE — la base plan portait deja la vraie date). Rejected_observation, point. Cette exclusion tient MEME sous une intention memoire explicite ("retiens que j'ai fait ma marche", "note que mes 10 minutes comptent"): le wording "retiens/note" ne transforme pas un report d'action deja tracke en fait personnel — seule une information personnelle NOUVELLE autour de l'action (contexte, difficulte, decouverte) est memorisable. Et la GENERALISATION d'un report reste un report (P8-C/G, nina-hard23 batch, 3e observation INVALIDE: "boit son grand verre d'eau avant de grignoter", "petit-dejeuner reussi deux jours de suite" persistes actifs): reformuler l'execution d'une action du plan en habitude, reussite ou anecdote ne la rend pas memorisable — le critere est LA SOURCE (l'action du plan et son suivi), pas la tournure. Une DEMANDE D'AJUSTEMENT du plan ("ajuste mon plan", "corse le niveau", "allege la semaine") est une COMMANDE produit traitee a son tour, jamais un fait personnel: 0 memory_item.
MODALITE NON-ASSERTIVE — persistance INTERDITE (alex-untested22 T2): une QUESTION du user adressee a Sophia ("tu te souviens quel jour je vois mon frere ?") ou un enonce d'INCERTITUDE explicite ("j'arrive plus a savoir si c'est mardi ou mercredi", "je sais plus si c'est X ou Y") n'AFFIRME rien: n'en derive JAMAIS un fait d'habitude, de preference ou d'agenda — et ne CHOISIS jamais une option d'une alternative incertaine ("mardi ou mercredi" → ecrire "voit son frere le mercredi" est une CONFABULATION durable qui resurgira en recall confiant, l'erreur observee). Au mieux rejected_observation. Le critere est la MODALITE de l'enonce (interrogatif, hypothetique, incertain), pas des mots-cles. Anti-faux-positif: une assertion positive ("je vois mon frere le mercredi") se persiste normalement, et une question rhetorique qui AFFIRME ("je te l'ai deja dit non ? je cours le mardi") reste une assertion memorisable.
IDENTITE — garde anti-fossilisation: une auto-etiquette identitaire pathologisante ou figee ("je suis insomniaque chronique", "je suis nul", "c'est ma nature", "j'ai toujours ete comme ca") n'est JAMAIS un fait durable active. Distingue: le SYMPTOME contextualise ("temps d'endormissement ~90 min ces dernieres semaines") est memorisable en statement; l'ETIQUETTE ("est insomniaque chronique") ne l'est pas — au mieux rejected_observation, jamais un item que Sophia pourrait refleter au user comme une verite sur lui. Si Sophia a recadre l'etiquette dans la conversation, ne la persiste pas du tout. Cas special DETRESSE (nina-r7): une auto-devalorisation emise pendant un pic emotionnel aigu ("je suis faible", "je sers a rien", "ca sert a rien de me battre", "a quoi bon") est un ETAT TRANSITOIRE de ce moment, jamais un trait: ne la persiste sous AUCUNE forme (ni statement, ni observation du type "se decrit comme faible") — persister le creux fossiliserait la detresse et Sophia la refleterait plus tard comme une verite sur la personne. Le declencheur factuel non identitaire du creux (ex: "les horaires decales du nouveau travail pesent sur son sommeil") reste memorisable.
FAIT FUTUR DATE CONFIE — persistance OBLIGATOIRE: quand le user confie un evenement a venir avec une date ("garde en tete: le 20 juillet je pars 4 jours chez ma mere", "note que jeudi prochain j'ai mon entretien"), c'est un memory_item kind="event" avec event_start_at dans le futur (resous la date depuis l'ancre temporelle fournie) — JAMAIS abandonne ni absorbe dans un statement vague. Un event futur date explicitement confie qui manque a la sortie est une erreur d'extraction. S'il y a une duree ("4 jours"), pose aussi event_end_at.
CROYANCE CONTESTEE DANS L'ECHANGE: si une affirmation du user a ete CONTESTEE, nuancee ou recadree par l'assistant dans le meme echange (les messages assistant fournis en font foi), ne la persiste JAMAIS comme fait actif non qualifie. Au mieux: un statement explicitement qualifie ("affirme par l'utilisateur, non valide: ...") avec confidence basse, ou une rejected_observation si l'assistant l'a clairement refutee. Le critere est le desaccord visible dans la conversation, pas ton propre jugement du contenu.
ETAT TRANSITOIRE DATE — jamais active (eva-hard23/hard24 batch, nit recurrent x2: « le soir vers 22h elle se sent speed » persiste active): un ETAT PONCTUEL ou momentane rattache a un moment precis (« ce soir je suis speed », « la cette semaine je dors mal ») est au mieux candidate — il faut une recurrence affirmee par le user (« tous les soirs », « depuis des mois ») pour un statement active. Meme regime pour un ETAT TRANSITOIRE D'OUTIL (P12-G, rose-hard25 batch, INVALIDE observe: « L'utilisatrice veut deux potions distinctes » persiste active): une demande ou preference portant sur un ARTEFACT D'OUTIL en cours de session (potion, carte, rappel en cours de creation ou de discussion) n'est JAMAIS un fait durable sur la personne — c'est l'etat passager de la construction en cours: candidate au mieux, et jamais persistee comme preference. Le besoin de fond sous-jacent exprime comme durable (« l'apaisement m'aide le soir ») reste memorisable selon les regles preference ci-dessous.

PREFERENCES DE STYLE/LEVIER — anti-fossilisation (rose-r6 B05): une preference de style d'accompagnement ou de levier ("prefere les outils de motivation active", "aime pas les methodes douces") issue d'UN SEUL enonce n'est JAMAIS un statement active: il faut une recurrence (plusieurs occurrences) ou une confirmation explicite. Si la meme fenetre de messages contient un marqueur de retractation ou de tiedeur envers cet enonce ("bof", "on verra", "finalement non", changement d'avis), degrade en candidate ou rejette. Un fait personnel simple non-preference (metier, horaire, contexte) reste persistable des une occurrence — ne sur-corrige pas.
PRECISION DES FAITS CONFIES: quand le user confie explicitement un fait ("retiens que", "garde en tete", "note pour la suite"), persiste sa formulation PRECISE (heure, condition, exception: "c'est vers 23h que je craque, jamais en debut de soiree") — ne l'absorbe pas dans un statement plus vague deja connu; si un fait generique proche existe, utilise corrections[] operation_type="supersede" pour remplacer le vague par le precis.
Pour sensitivity_categories, utilise uniquement: addiction, mental_health, family, relationship, work, financial, health, sexuality, self_harm, shame, trauma, other_sensitive.
Si une correction contient la nouvelle verite correcte ("X est mon ex, pas ma soeur"), cree aussi un memory_item positif pour la nouvelle verite.
Corrections: si le user dit "oublie", "corrige", "en fait", "plutot", "pas X mais Y", "remplace l'ancien souvenir", ou une formulation equivalente visant une information deja connue, ajoute une entree corrections[]. Cela vaut AUSSI quand le fait corrige a ete dit plus tot dans CE MEME lot de messages ("je bosse en 3x8" puis plus loin "en fait je suis plus en horaires de nuit, poste de jour fixe"): emets la correction ET le memory_item de la nouvelle verite — deux faits contradictoires ne doivent jamais rester actifs ensemble.
RETRACTATION INTRA-LOT — persistance INTERDITE (eva-hard21 T8): un fait, un projet ou un exemple que le user a EXPLICITEMENT retire dans le meme lot ("oublie ce truc de la poterie, c'est mort", "laisse tomber ce que j'ai dit sur X", "c'est plus d'actualite") ne se persiste JAMAIS en memory_item active — ni comme fait principal, ni comme EXEMPLE a l'interieur d'un autre item (l'erreur observee: la poterie retractee ecrite active comme exemple d'un statement). La retractation CONSOMME le fait pour tout le lot: rejected_observation au mieux, plus une entree corrections[] operation_type="invalidate" si le fait existait deja en memoire. La regle vaut pour TOUTE CATEGORIE sans exception — fait, habitude, preference, projet, OBJECTIF, INTENTION FUTURE, anecdote (P8-C, paul-untested22 T10 INVALIDE observe: "oublie ca completement, le retiens surtout pas comme un objectif" sur un projet de club de rando → persiste quand meme active comme intention; la retractation d'un objectif/d'une intention invalide EXACTEMENT comme celle d'une habitude). Et persister "AVEC LA NUANCE" est la MEME faute (P8-C, eva-hard23 T11 INVALIDE observe: carnet du soir explicitement retracte — "le retiens surtout pas comme un truc sur moi" — persiste active en "...mais elle a arrete au bout de deux jours"): quand le user cible la MEMOIRE elle-meme ("le retiens pas", "garde pas ca sur moi", "c'est pas un objectif"), n'ecris NI la version brute, NI une version nuancee, NI le recit de l'abandon — zero memory_item sur ce fait, quel que soit son habillage. Anti-faux-positif: une hesitation ("je sais pas trop", "on verra") n'est pas une retractation — degrade en candidate, ne supprime pas; un echec raconte SANS instruction d'oubli ("j'ai arrete au bout de deux jours" seul) reste memorisable; et "je change d'avis sur Y" ne retracte que Y, jamais un autre fait X du lot.
Utilise operation_type="supersede" quand le message fournit une nouvelle verite de remplacement; utilise operation_type="invalidate" quand il faut seulement retirer l'ancienne information.
Dans corrections[].target_hint, cite les termes de l'ancien souvenir faux a retrouver, pas seulement la nouvelle verite.
Pour une correction d'action ("les pompes ne marchent pas apres petit-dejeuner, plutot avant la douche"), cree aussi un memory_item kind="action_observation" pour la nouvelle verite d'action, avec les bons source_message_ids.
`.trim();

export interface ExtractionContext {
  messages: MemorizerMessage[];
  context_messages?: MemorizerMessage[];
  active_topic?: KnownTopic | null;
  known_topics?: KnownTopic[];
  known_entities?: KnownEntity[];
  injected_memory_items?: KnownMemoryItem[];
  temporal_hints?: TemporalHint[];
  plan_signals?: PlanSignal[];
  timezone?: string | null;
  /** P2-5c: prenom/genre pour la redaction des items (jamais infere). */
  user_profile?: {
    first_name?: string | null;
    gender?: string | null;
    /**
     * QA agent 4 — BCP-47 du profil. Décide la LANGUE des items écrits.
     *
     * `null` = inconnue -> le prompt retombe sur l'ANGLAIS depuis le
     * 2026-08-05. Le repli était le FRANÇAIS, hérité de la branche grand
     * public (supprimée le 2026-08-04). Ce n'est pas une préférence de style:
     * un repli qui rend la langue du PROMPT plutôt que celle du PRODUIT est
     * invisible tant que le profil se lit, et redevient actif au premier
     * incident — ce qui est exactement arrivé (chargeur mort jusqu'au
     * 2026-08-03, `user_profile` toujours null, mémoire entièrement française
     * pour un élève `en-GB`). Voir `memorizer-user-profile-loader-dead`.
     */
    locale?: string | null;
  } | null;
}

export type ExtractionLlmProvider = (args: {
  system_prompt: string;
  user_payload: string;
  model_name: string;
  prompt_version: string;
}) => Promise<string>;

export function buildExtractionPrompt(ctx: ExtractionContext): {
  system_prompt: string;
  user_payload: string;
} {
  const temporal = ctx.temporal_hints?.length
    ? ctx.temporal_hints
    : ctx.messages.flatMap((message) =>
      resolveTemporalReferences(message.content, {
        timezone: ctx.timezone ?? "Europe/Paris",
        // P12-E (rose-hard25 R1-B04): l'ancre temporelle est l'horloge du
        // MESSAGE — le batch memorizer tourne des heures après l'énoncé
        // (« samedi » dit mercredi se résout depuis mercredi, jamais depuis
        // l'horloge du batch).
        now: message.created_at ?? undefined,
        // P12-E (alex-untested24 R1-B11): mois nommé nu / jour de semaine nu
        // résolus dans les hints fournis au LLM (mêmes règles que le gate).
        includeBareUnits: true,
      })
    );
  return {
    system_prompt: EXTRACTION_PROMPT_V1,
    user_payload: JSON.stringify({
      prompt_version: PROMPT_VERSIONS.extraction,
      messages: ctx.messages,
      context_messages: ctx.context_messages ?? [],
      active_topic: ctx.active_topic ?? null,
      known_topics: ctx.known_topics ?? [],
      known_entities: ctx.known_entities ?? [],
      injected_memory_items: ctx.injected_memory_items ?? [],
      temporal_resolutions: temporal,
      plan_signals: ctx.plan_signals ?? [],
      user_profile: ctx.user_profile ?? null,
      domain_keys_taxonomy: DOMAIN_KEYS_V1_DEFINITIONS,
    }),
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeItemKind(value: unknown): ExtractedMemoryItem["kind"] {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "preference" || raw === "goal" || raw === "boundary" ||
    raw === "habit_preference"
  ) return "statement";
  return raw as ExtractedMemoryItem["kind"];
}

function coerceConfidence(value: unknown): number {
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (raw === "high") return 0.82;
    if (raw === "medium") return 0.68;
    if (raw === "low") return 0.35;
  }
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSensitivityCategory(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("addictions.") || raw === "cannabis" || raw === "alcool" || raw === "drogue") {
    return "addiction";
  }
  if (raw.startsWith("relations.") || raw === "couple") return "relationship";
  if (raw === "famille" || raw === "relations.famille") return "family";
  if (raw.startsWith("travail.")) return "work";
  if (raw.startsWith("sante.") || raw === "medical") return "health";
  if (raw.startsWith("psychologie.") || raw === "psy") return "mental_health";
  return raw;
}

export function parseExtractionJson(raw: string): ExtractionPayload {
  let parsed: any;
  try {
    parsed = JSON.parse(String(raw ?? "").trim());
  } catch (error) {
    throw new Error(
      `memory_v2_extraction_invalid_json:${(error as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("memory_v2_extraction_invalid_shape");
  }
  return {
    memory_items: asArray(parsed.memory_items).map((
      item: any,
    ): ExtractedMemoryItem => ({
      kind: normalizeItemKind(item.kind),
      content_text: firstText(
        item.content_text,
        item.text,
        item.memory,
        item.preference,
        item.statement,
        item.summary,
        item.normalized_summary,
      ),
      normalized_summary: firstText(
          item.normalized_summary,
          item.summary,
          item.content_text,
          item.text,
          item.preference,
          item.statement,
        ) === ""
        ? null
        : firstText(
          item.normalized_summary,
          item.summary,
          item.content_text,
          item.text,
          item.preference,
          item.statement,
        ),
      domain_keys: asArray(item.domain_keys).map(String),
      confidence: coerceConfidence(item.confidence),
      importance_score: Number(item.importance_score ?? 0),
      sensitivity_level:
        (item.sensitivity_level ?? "normal") as ExtractedMemoryItem[
          "sensitivity_level"
        ],
      sensitivity_categories: asArray(item.sensitivity_categories).map(
        normalizeSensitivityCategory,
      ).filter(Boolean) as ExtractedMemoryItem["sensitivity_categories"],
      requires_user_initiated: Boolean(item.requires_user_initiated),
      source_message_ids: asArray(item.source_message_ids).map(String),
      evidence_quote: item.evidence_quote == null
        ? null
        : String(item.evidence_quote),
      event_start_at: item.event_start_at == null
        ? null
        : String(item.event_start_at),
      event_end_at: item.event_end_at == null
        ? null
        : String(item.event_end_at),
      time_precision: item.time_precision == null
        ? null
        : String(item.time_precision),
      entity_mentions: asArray(item.entity_mentions).map(String),
      topic_hint: item.topic_hint == null ? null : String(item.topic_hint),
      canonical_key_hint: item.canonical_key_hint == null
        ? null
        : String(item.canonical_key_hint),
      metadata: item.metadata && typeof item.metadata === "object"
        ? item.metadata
        : {},
    })),
    entities: asArray(parsed.entities).map((entity: any) => ({
      entity_type: entity.entity_type ?? "other",
      display_name: String(entity.display_name ?? ""),
      aliases: asArray(entity.aliases).map(String),
      relation_to_user: entity.relation_to_user == null
        ? null
        : String(entity.relation_to_user),
      confidence: Number(entity.confidence ?? 0),
      metadata: entity.metadata && typeof entity.metadata === "object"
        ? entity.metadata
        : {},
    })),
    corrections: asArray(parsed.corrections).map((correction: any) => ({
      operation_type: correction.operation_type,
      target_hint: String(correction.target_hint ?? ""),
      reason: correction.reason == null ? null : String(correction.reason),
      source_message_ids: asArray(correction.source_message_ids).map(String),
    })),
    rejected_observations: asArray(parsed.rejected_observations).map((
      row: any,
    ) => ({
      reason: row.reason ?? "other",
      text: String(row.text ?? ""),
      existing_memory_item_id: row.existing_memory_item_id == null
        ? null
        : String(row.existing_memory_item_id),
      source_message_ids: asArray(row.source_message_ids).map(String),
      metadata: row.metadata && typeof row.metadata === "object"
        ? row.metadata
        : {},
    })),
  };
}

function enrichEventDatesFromSources(
  payload: ExtractionPayload,
  ctx: ExtractionContext,
): ExtractionPayload {
  const messagesById = new Map(ctx.messages.map((message) => [message.id, message]));
  const contextById = new Map(
    (ctx.context_messages ?? []).map((message) => [message.id, message]),
  );
  const hintsByMessage = new Map<string, TemporalHint[]>();
  const getHints = (id: string): TemporalHint[] => {
    if (hintsByMessage.has(id)) return hintsByMessage.get(id) ?? [];
    const message = messagesById.get(id) ?? contextById.get(id);
    const hints = message
      ? resolveTemporalReferences(message.content, {
        timezone: ctx.timezone ?? "Europe/Paris",
        // P12-E (rose-hard25 R1-B04 / alex-untested24 R1-B11): V3-2 étendu —
        // l'ancre est l'horloge du MESSAGE source (jamais celle du batch), et
        // les unités nues (mois nommé, jour de semaine + contexte verbal) se
        // résolvent AVANT que validate ne rejette `event_missing_date`.
        now: message.created_at ?? undefined,
        includeBareUnits: true,
      })
      : [];
    hintsByMessage.set(id, hints);
    return hints;
  };
  // P12-E: ancre déterministe pour les textes d'item (evidence_quote /
  // content_text) — l'horloge la plus récente des messages SOURCE de l'item,
  // à défaut celle du lot ; jamais Date.now() quand une horloge explicite
  // existe (le batch nocturne peut avoir changé de jour).
  const batchAnchorMs = [...ctx.messages, ...(ctx.context_messages ?? [])]
    .map((message) => Date.parse(String(message.created_at ?? "")))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => b - a)[0];
  const anchorForSources = (ids: string[]): string | undefined => {
    const stamps = ids
      .map((id) => messagesById.get(id) ?? contextById.get(id))
      .map((message) => Date.parse(String(message?.created_at ?? "")))
      .filter((ts) => Number.isFinite(ts));
    if (stamps.length > 0) return new Date(Math.max(...stamps)).toISOString();
    return Number.isFinite(batchAnchorMs)
      ? new Date(batchAnchorMs).toISOString()
      : undefined;
  };
  const isCompletedTemporalObservation = (item: ExtractedMemoryItem): boolean =>
    item.kind === "action_observation" &&
    /\b(a|ai|annule|annulé|reporte|reporté|marche|marché|fait|teste|testé|clarifie|clarifié)\b/i
      .test(item.content_text);
  // Ceinture v4 (alex-r1 B01, probe V3): quand le LLM encode un fait futur
  // date en STATEMENT au lieu d'un event, un texte portant une date ABSOLUE
  // unique (jamais un motif recurrent « chaque/tous les ») reste promouvable
  // en event date — la doctrine prompt decide, cette garde rattrape.
  const RECURRENCE_MARKER = /\b(chaque|tous les|toutes les|les (lundis|mardis|mercredis|jeudis|vendredis|samedis|dimanches))\b/i;
  const isAbsoluteDatedStatement = (item: ExtractedMemoryItem): boolean =>
    item.kind === "statement" &&
    !RECURRENCE_MARKER.test(item.content_text) &&
    !RECURRENCE_MARKER.test(item.evidence_quote ?? "");
  return {
    ...payload,
    memory_items: payload.memory_items.map((item) => {
      const absoluteDatedStatement = isAbsoluteDatedStatement(item);
      if (
        item.kind !== "event" &&
        !isCompletedTemporalObservation(item) &&
        !absoluteDatedStatement
      ) {
        return item;
      }
      if (
        item.kind === "event" &&
        item.event_start_at &&
        item.time_precision
      ) {
        return item;
      }
      // Fallback (alex-r1 B01): si les messages source ne donnent rien, la
      // date peut vivre dans le texte normalise par l'extraction elle-meme
      // (evidence_quote/content_text portent souvent « le 18 juillet »,
      // parfois avec l'annee resolue). Jamais rejeter un event date sans
      // avoir tente ces textes.
      const itemTextHints = [item.evidence_quote, item.content_text]
        .filter((t): t is string => typeof t === "string" && t.length > 0)
        .flatMap((t) =>
          resolveTemporalReferences(t, {
            timezone: ctx.timezone ?? "Europe/Paris",
            // P12-E: même ancre et mêmes unités nues que les messages source.
            now: anchorForSources(item.source_message_ids ?? []),
            includeBareUnits: true,
          })
        );
      const allHints = [
        ...item.source_message_ids.flatMap(getHints),
        ...itemTextHints,
      ].sort((a, b) => b.confidence - a.confidence);
      // Un statement ne se promeut QUE sur une date absolue explicite.
      const hint = absoluteDatedStatement
        ? allHints.find((h) => h.kind === "absolute_date")
        : allHints[0];
      if (!hint) return item;
      const kind = item.kind === "action_observation" ||
          (absoluteDatedStatement && hint.kind === "absolute_date")
        ? "event"
        : item.kind;
      return {
        ...item,
        kind,
        event_start_at: item.event_start_at ?? hint.resolved_start_at,
        event_end_at: item.event_end_at ?? hint.resolved_end_at,
        time_precision: item.time_precision ?? hint.precision,
        metadata: {
          ...(item.metadata ?? {}),
          ...(item.kind === "action_observation"
            ? {
              promoted_from_kind: "action_observation",
              promotion_reason: "temporal_completed_observation",
            }
            : {}),
          ...(absoluteDatedStatement && kind === "event"
            ? {
              promoted_from_kind: "statement",
              promotion_reason: "absolute_dated_statement",
            }
            : {}),
          temporal_resolution_raw: hint.raw,
          temporal_resolution_confidence: hint.confidence,
          temporal_resolution_timezone: hint.timezone,
        },
      };
    }),
  };
}

export async function extractMemoryCandidates(
  ctx: ExtractionContext,
  opts: {
    llm_provider?: ExtractionLlmProvider;
    model_name?: string;
    request_id?: string | null;
    user_id?: string | null;
    force_real_ai?: boolean;
  } = {},
): Promise<ExtractionPayload> {
  const modelName = opts.model_name ?? MEMORY_EXTRACTION_MODEL_DEFAULT;
  const prompt = buildExtractionPrompt(ctx);
  const raw = opts.llm_provider
    ? await opts.llm_provider({
      ...prompt,
      model_name: modelName,
      prompt_version: MEMORY_EXTRACTION_PROMPT_VERSION,
    })
    : await generateWithGemini(
      prompt.system_prompt,
      prompt.user_payload,
      0.1,
      true,
      [],
      "json",
      {
        requestId: opts.request_id ?? undefined,
        model: modelName,
        source: "memory-v2:memorizer_extraction",
        userId: opts.user_id ?? undefined,
        forceRealAi: opts.force_real_ai,
        forceInitialModel: true,
      },
    );
  const parsed = parseExtractionJson(String(raw));
  return enrichEventDatesFromSources(parsed, ctx);
}
