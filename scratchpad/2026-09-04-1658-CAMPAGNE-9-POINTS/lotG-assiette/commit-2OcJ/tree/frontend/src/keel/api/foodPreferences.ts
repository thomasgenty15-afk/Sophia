// CE QUE L'ÉLÈVE A DIT SUR SA BOUFFE — de la conversation à la composition.
//
// ── LA BOUCLE OUVERTE QUE ÇA FERME ─────────────────────────────────────────
// L'élève écrit « je déteste le brocoli » dans la bulle. Le memorizer l'extrait
// (mesuré le 2026-08-03 sur un vrai élève KEEL: l'aversion, deux contextes de
// vie, et même une rétractation résolue). Et les deux générateurs de plan n'en
// savaient RIEN — vérifié par grep, aucune occurrence de `memory_items`. Le
// plan composé trois jours plus tard remettait du brocoli.
//
// ── MIROIR DE `_shared/keel/food_preference_promotion.ts` ──────────────────
// Même posture que `mealTicks.ts` vis-à-vis de `meal_tick.ts`: la règle vit
// côté serveur, ce fichier la reflète pour l'écran. Les tests des deux côtés
// portent les mêmes cas, et le module serveur reste la référence.
//
// ── AUCUNE FONCTION EDGE ───────────────────────────────────────────────────
// `rls_memory_items_select_own` autorise l'élève à lire ses propres souvenirs,
// et `student_goals` est déjà écrit depuis l'écran par les deux cartes
// voisines. Rien ici n'a besoin de service_role.

import { supabase } from "../../lib/supabase";
import { mergePracticalConstraints } from "./practicalConstraints";

/** La clé lue par les deux générateurs. */
export const FOOD_PREFERENCES_KEY = "food_preferences";
/** Les ids déjà traités. JAMAIS servi au modèle (garde côté serveur). */
export const FOOD_PREFERENCES_DISMISSED_KEY = "food_preferences_dismissed";
/** `texte normalisé → id du souvenir`. C'est ce qui rend le retrait possible. */
export const FOOD_PREFERENCES_ORIGIN_KEY = "food_preferences_origin";

/**
 * LES CLÉS QUI RENDENT UN SOUVENIR PROMOUVABLE. Miroir de
 * `PROMOTABLE_DOMAIN_KEYS` (module serveur), qui porte le raisonnement complet.
 *
 * En deux phrases: le critère n'est pas « ça parle de nourriture » mais « ça
 * décide QUAND, OÙ ou COMBIEN cet élève peut cuisiner et manger ». « Travaille
 * de nuit trois fois par semaine » ne porte pas `sante.alimentation` et décide
 * pourtant de tout — elle était invisible, donc absente du prompt des deux
 * générateurs.
 *
 * ⚠️ CETTE LISTE EST DUPLIQUÉE ET GARDÉE: `foodPreferences.int.test.ts` lit le
 * module Deno sur le disque et vérifie que les deux coïncident. Une clé
 * proposée ici que le serveur ignore est une ligne que l'élève garde dans le
 * vide; l'inverse est une contrainte qu'il ne voit jamais passer.
 */
export const PROMOTABLE_DOMAIN_KEYS = [
  "sante.alimentation",
  "travail.charge",
  "habitudes.environnement",
  "habitudes.planification",
  "sante.activite_physique",
];
/** Le memorizer refuse déjà de créer sous 0,55; on demande plus pour proposer. */
export const MIN_CONFIDENCE = 0.7;

/**
 * `candidate` EST ACCEPTÉ, et c'est un correctif mesuré.
 *
 * Le premier jour d'un élève, le SUJET de mémoire est créé dans le même lot
 * que ses souvenirs: le lien vaut 0,62 et tout sort `candidate`, quelle que
 * soit la confiance propre de l'item (0,95 pour « déteste le brocoli »). Trois
 * jours plus tard, les mêmes phrases sortent `active` à 0,88 de lien.
 * N'accepter que `active` rendait donc invisible TOUT ce qu'un élève neuf dit
 * sur sa bouffe — donc absent de sa toute première semaine. Le plancher de
 * confiance et la ligne médicale restent les deux vraies gardes, et proposer
 * n'est pas garder: c'est l'élève qui confirme.
 */
export const PROPOSABLE_STATUSES = ["active", "candidate"];

export interface FoodPreferenceProposal {
  memoryItemId: string;
  text: string;
  /** La ligne déjà gardée que celle-ci remplace, quand l'élève est revenu dessus. */
  replaces?: string;
  /** `YYYY-MM-DD` du jour où l'élève l'a dit. */
  seenAt?: string;
}

/** D'où vient une ligne gardée, et de QUAND. */
export interface FoodPreferenceOrigin {
  item: string;
  at: string | null;
}

/**
 * LE PLAFOND de `food_preferences_dismissed`. Miroir de `MAX_DISMISSED`
 * (module serveur), qui porte le raisonnement: cette liste n'a que des `push`,
 * elle vit sur une ligne relue à chaque génération, et on coupe par le PLUS
 * ANCIEN parce que ces ids-là portent en majorité des souvenirs déjà archivés,
 * donc plus proposables.
 */
export const MAX_DISMISSED = 200;

export function capDismissed(ids: readonly string[]): string[] {
  const unique = [...new Set(ids.map((v) => String(v ?? "").trim()).filter(Boolean))];
  return unique.length <= MAX_DISMISSED ? unique : unique.slice(-MAX_DISMISSED);
}

function dayOf(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

interface MemoryRow {
  id: string;
  kind: string;
  status: string;
  content_text: string;
  normalized_summary: string | null;
  domain_keys: string[] | null;
  confidence: number | null;
  sensitivity_level: string | null;
  superseded_by_item_id: string | null;
  created_at: string | null;
}

export function keptFrom(pc: Record<string, unknown> | null | undefined): string[] {
  const raw = (pc ?? {})[FOOD_PREFERENCES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
}

export function dismissedFrom(
  pc: Record<string, unknown> | null | undefined,
): string[] {
  const raw = (pc ?? {})[FOOD_PREFERENCES_DISMISSED_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
}

/**
 * Accepte les DEUX formes: l'id nu de la première version (`"texte": "uuid"`)
 * et l'objet daté. Une entrée ancienne se lit comme une entrée sans date — ce
 * qui est exactement ce qu'elle est. Miroir de `originMapOf` côté serveur.
 */
export function originFrom(
  pc: Record<string, unknown> | null | undefined,
): Record<string, FoodPreferenceOrigin> {
  const raw = (pc ?? {})[FOOD_PREFERENCES_ORIGIN_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, FoodPreferenceOrigin> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k ?? "").trim().toLowerCase();
    if (!key) continue;
    if (typeof v === "string") {
      if (v.trim()) out[key] = { item: v.trim(), at: null };
      continue;
    }
    if (v && typeof v === "object") {
      const item = String((v as Record<string, unknown>).item ?? "").trim();
      if (item) out[key] = { item, at: dayOf((v as Record<string, unknown>).at) };
    }
  }
  return out;
}

/**
 * Les propositions à montrer.
 *
 * Elles ne sont JAMAIS persistées avant d'être gardées, et c'est délibéré: tout
 * ce qui entre dans `practical_constraints` part dans le prompt du générateur
 * de plan hebdo, qui sérialise le jsonb en entier. Une proposition rangée là
 * serait servie au modèle comme un fait acquis avant que l'élève ne l'ait vue.
 */
export async function loadFoodPreferenceProposals(args: {
  userId: string;
  practicalConstraints: Record<string, unknown> | null;
}): Promise<FoodPreferenceProposal[]> {
  const keptByKey = new Map<string, string>();
  for (const text of keptFrom(args.practicalConstraints)) {
    keptByKey.set(text.toLowerCase(), text);
  }
  const dismissed = new Set(dismissedFrom(args.practicalConstraints));
  const origin = originFrom(args.practicalConstraints);

  const { data, error } = await supabase
    .from("memory_items")
    .select(
      "id, kind, status, content_text, normalized_summary, domain_keys, confidence, sensitivity_level, superseded_by_item_id, created_at",
    )
    .eq("user_id", args.userId)
    // LA LIGNE MÉDICALE, posée DANS la requête et pas seulement au filtrage:
    // `sensitive` et `safety` ne doivent même pas traverser le réseau vers un
    // écran de préférences. Le dur a sa table.
    .eq("sensitivity_level", "normal")
    // `active` et `candidate`: voir `PROPOSABLE_STATUSES`. `hidden_by_user` et
    // `deleted_by_user` restent dehors — l'élève a déjà dit non. `superseded`
    // et `invalidated` aussi: ce n'est plus ce qu'il pense, et c'est la
    // réconciliation qui s'en occupe, pas une proposition.
    .in("status", PROPOSABLE_STATUSES)
    // `overlaps` (`ov`) et PAS `contains` (`cs`): on veut « porte AU MOINS UNE
    // de ces clés », pas « les porte TOUTES ». `contains` avec une liste de
    // cinq exigerait qu'un souvenir soit à la fois alimentaire, professionnel,
    // environnemental, planifié et sportif — c'est-à-dire aucun. Le filtre
    // aurait vidé la carte au lieu de l'élargir, et personne ne s'en serait
    // aperçu avant de voir un écran vide en production.
    .overlaps("domain_keys", PROMOTABLE_DOMAIN_KEYS)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`[keel/api] loadFoodPreferenceProposals: ${error.message}`);

  const rows = (data ?? []) as MemoryRow[];

  // CE QUE CETTE PROPOSITION REMPLACE. Le lien vit sur l'ANCIEN item
  // (`superseded_by_item_id`), qui n'est plus dans `rows` puisqu'il est
  // `superseded` — on le relit donc à part, restreint aux origines des lignes
  // déjà gardées. Sans ça, un revirement s'affiche comme un ajout et l'élève
  // se retrouve avec les deux moitiés de sa contradiction dans le plan.
  const keptOriginIds = Object.entries(origin)
    .filter(([key]) => keptByKey.has(key))
    .map(([, entry]) => entry.item);
  const replacesByNewId = new Map<string, string>();
  if (keptOriginIds.length > 0) {
    const { data: retired } = await supabase
      .from("memory_items")
      .select("id, superseded_by_item_id")
      .eq("user_id", args.userId)
      .in("id", keptOriginIds)
      .not("superseded_by_item_id", "is", null);
    for (const row of (retired ?? []) as Array<{ id: string; superseded_by_item_id: string }>) {
      const replacedKey = Object.entries(origin)
        .find(([, entry]) => entry.item === row.id)?.[0];
      const replacedText = replacedKey ? keptByKey.get(replacedKey) : undefined;
      if (replacedText) replacesByNewId.set(row.superseded_by_item_id, replacedText);
    }
  }

  const out: FoodPreferenceProposal[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id || dismissed.has(id)) continue;
    // `event` est un fait daté (« j'ai mangé une pizza mardi »), pas un goût:
    // le promouvoir mettrait une pizza dans toutes les semaines à venir.
    if (row.kind !== "fact" && row.kind !== "statement") continue;
    if (Number(row.confidence ?? 0) < MIN_CONFIDENCE) continue;

    const text = String(row.normalized_summary ?? "").trim() ||
      String(row.content_text ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (keptByKey.has(key) || seen.has(key)) continue;
    seen.add(key);
    const proposal: FoodPreferenceProposal = { memoryItemId: id, text };
    const replaces = replacesByNewId.get(id);
    if (replaces) proposal.replaces = replaces;
    const seenAt = dayOf(row.created_at);
    if (seenAt) proposal.seenAt = seenAt;
    out.push(proposal);
  }
  return out;
}

/**
 * RETIRE CE QUE LA MÉMOIRE A DÉMENTI, côté écran.
 *
 * Miroir de `reconcileFoodPreferences` (module serveur). Les deux existent, et
 * ce n'est pas une duplication gratuite: le serveur garantit que le PROMPT est
 * cohérent même si l'élève ne rouvre jamais cet écran; celui-ci garantit que
 * l'élève VOIT la ligne disparaître, et puisse la retaper si le memorizer
 * s'est trompé.
 *
 * ── CE QUE CET ÉCRAN NE TRANCHE PAS: `superseded` ─────────────────────────
 * Le retrait sur `superseded` demande un JUGEMENT — vérifier que le remplaçant
 * parle bien de la même chose. Mesuré au 4e run réel: le memorizer a rattaché
 * « Theo déteste le brocoli » à « Theo n'aime pas le porridge », et une
 * réconciliation qui croit le statut sur parole supprime une préférence vraie.
 * Ce contrôle vit côté serveur (`supersessionIsPlausible`), avec le prénom de
 * l'élève et le texte des deux items; le dupliquer ici en deux langues serait
 * la garantie de deux règles qui divergent.
 *
 * Cet écran ne retire donc que l'INDISCUTABLE: rétracté, archivé, masqué,
 * supprimé — des statuts sans remplaçant, donc sans rien à vérifier. Le
 * revirement, lui, se présente à l'élève comme un remplacement qu'il valide
 * (`replaces`), et le serveur nettoie le reste à la génération suivante.
 *
 * Une ligne sans origine n'est jamais retirée: elle appartient à l'élève.
 */
export async function reconcileKeptPreferences(args: {
  userId: string;
  practicalConstraints: Record<string, unknown> | null;
}): Promise<{
  kept: string[];
  origin: Record<string, FoodPreferenceOrigin>;
  changed: boolean;
}> {
  const kept = keptFrom(args.practicalConstraints);
  const origin = originFrom(args.practicalConstraints);
  const ids = [...new Set(Object.values(origin).map((o) => o.item))];
  if (kept.length === 0 || ids.length === 0) {
    return { kept, origin, changed: false };
  }

  const { data, error } = await supabase
    .from("memory_items")
    .select("id, status")
    .eq("user_id", args.userId)
    .in("id", ids);
  if (error) throw new Error(`[keel/api] reconcileKeptPreferences: ${error.message}`);

  const statusById = new Map(
    ((data ?? []) as Array<{ id: string; status: string }>).map((r) => [r.id, r.status]),
  );
  // `superseded` ABSENT, exprès — voir l'en-tête de cette fonction.
  const retired = new Set([
    "invalidated",
    "archived",
    "hidden_by_user",
    "deleted_by_user",
  ]);

  const nextOrigin = { ...origin };
  const nextKept = kept.filter((text) => {
    const key = text.toLowerCase();
    const sourceId = nextOrigin[key]?.item;
    if (!sourceId) return true;
    const status = statusById.get(sourceId);
    // Introuvable ≠ démenti (purge, lecture partielle): on garde.
    if (status === undefined || !retired.has(status)) return true;
    delete nextOrigin[key];
    return false;
  });

  return {
    kept: nextKept,
    origin: nextOrigin,
    changed: nextKept.length !== kept.length,
  };
}

/**
 * Écrit la décision, SANS écraser les autres clés.
 *
 * Motif des deux cartes voisines: chacune possède ses clés et fusionne le
 * reste. Deux cartes ouvertes côte à côte ne doivent pas se désécrire.
 */
export async function saveFoodPreferences(args: {
  userId: string;
  practicalConstraints: Record<string, unknown> | null;
  kept: readonly string[];
  dismissed: readonly string[];
  origin: Record<string, FoodPreferenceOrigin>;
}): Promise<void> {
  const kept = args.kept.map((k) => k.trim()).filter(Boolean);
  // L'ORIGINE EST TAILLÉE SUR CE QUI RESTE. Une entrée dont le texte n'est
  // plus gardé n'a plus rien à pointer, et la laisser ferait grossir le jsonb
  // d'un élève à chaque édition, indéfiniment.
  const keys = new Set(kept.map((k) => k.toLowerCase()));
  const origin: Record<string, FoodPreferenceOrigin> = {};
  for (const [key, entry] of Object.entries(args.origin ?? {})) {
    if (keys.has(key)) origin[key] = entry;
  }

  await mergePracticalConstraints({
    userId: args.userId,
    current: args.practicalConstraints,
    patch: {
      [FOOD_PREFERENCES_KEY]: kept,
      [FOOD_PREFERENCES_DISMISSED_KEY]: capDismissed(args.dismissed),
      [FOOD_PREFERENCES_ORIGIN_KEY]: origin,
    },
    source: "saveFoodPreferences",
  });
}

/**
 * L'ÉLÈVE A CONFIRMÉ — le souvenir cesse d'être un candidat.
 *
 * C'est la boucle dans l'autre sens, et elle est la contrepartie de
 * `PROPOSABLE_STATUSES`: si on propose un `candidate`, il faut que le « Keep »
 * compte pour quelque chose côté mémoire, sinon le même item revient candidat
 * pour toujours et le cron d'entretien finit par l'archiver à J+14 —
 * c'est-à-dire par effacer une préférence que l'élève venait de confirmer.
 *
 * `decideCandidatePromotion` traite déjà `explicit_confirmation` comme
 * suffisant pour promouvoir; ce clic EST cette confirmation.
 *
 * Silencieux en cas d'échec: la préférence est déjà écrite là où elle sert
 * (`student_goals`), et perdre l'écran pour une écriture d'entretien serait le
 * mauvais arbitrage.
 */
export async function confirmMemoryItem(memoryItemId: string): Promise<void> {
  const id = String(memoryItemId ?? "").trim();
  if (!id) return;
  await supabase
    .from("memory_items")
    .update({ status: "active" })
    .eq("id", id)
    .eq("status", "candidate");
}

// ---------------------------------------------------------------------------
// CE QU'ON DEMANDE À L'ÉLÈVE — miroir de `preferencesWorthRechecking`
// ---------------------------------------------------------------------------

/** Une ligne ancienne qu'une ligne plus récente recoupe. */
export interface PreferenceRecheck {
  text: string;
  at: string;
  newerText: string;
  newerAt: string;
}

/**
 * LES MOTS QUI NE DISTINGUENT RIEN. Miroir de `NON_DISTINCTIVE_TOKENS` côté
 * serveur, qui porte le raisonnement — dont le piège du prénom, que le
 * memorizer met en tête de CHAQUE résumé.
 *
 * Bilingue par construction: ce dépôt a déjà payé une garde écrite et testée
 * dans une seule langue, verte à cause de ça.
 */
const NON_DISTINCTIVE = new Set([
  "aime", "aimes", "adore", "deteste", "detestes", "prefere", "preferes",
  "mange", "manges", "boit", "boire", "manger", "supporte", "apprecie",
  "habitude", "toujours", "jamais", "parfois", "souvent", "plus", "pour",
  "avec", "sans", "dans", "chez", "quand", "cela", "elle", "leur", "tout",
  "tous", "toute", "toutes", "etre", "avoir", "fait", "faire", "peut",
  "likes", "like", "loves", "love", "hates", "hate", "dislikes", "dislike",
  "prefers", "prefer", "eats", "eat", "eating", "drinks", "drink", "does",
  "always", "never", "sometimes", "often", "with", "without", "when",
  "that", "this", "they", "them", "their", "have", "will", "would", "cannot",
  "student", "eleve",
]);

function words(text: string): string[] {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
}

function contentTokens(text: string, ignore?: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const word of words(text)) {
    if (word.length < 4) continue;
    if (NON_DISTINCTIVE.has(word)) continue;
    if (ignore?.has(word)) continue;
    out.add(word);
  }
  return out;
}

/** Normalise des mots à ignorer (typiquement le prénom de l'élève). */
export function ignorableTokens(...values: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    for (const word of words(value ?? "")) {
      if (word.length >= 2) out.add(word);
    }
  }
  return out;
}

/**
 * LES LIGNES SUR LESQUELLES L'ÉLÈVE EST REVENU DEPUIS.
 *
 * ── LE TROU QUE ÇA COUVRE ─────────────────────────────────────────────────
 * `reconcileKeptPreferences` ne retire que ce que le memorizer a EXPLICITEMENT
 * relié, et ce lien est NON DÉTERMINISTE: mesuré le 2026-08-06, le même
 * scénario a produit un `superseded` en français et AUCUN lien en anglais.
 * Quand il manque, les deux lignes restent ici pour toujours, et seul un
 * `Remove` manuel les nettoie — c'est-à-dire jamais.
 *
 * La vue datée du prompt suffit au MODÈLE. Elle ne suffit pas à l'ÉCRAN.
 *
 * ── CE QUE ÇA N'AFFIRME PAS ───────────────────────────────────────────────
 * Pas « ces deux lignes se contredisent »: décider que deux phrases libres
 * s'opposent est un jugement de langue qu'on ferait mal, en silence, sur une
 * donnée que l'élève a gardée exprès. On affirme ce que les données disent —
 * **« tu es revenu sur ce sujet plus tard »** — et on lui laisse trancher.
 */
export function preferencesWorthRechecking(args: {
  practicalConstraints: Record<string, unknown> | null;
  ignoreTokens?: ReadonlySet<string>;
}): PreferenceRecheck[] {
  const kept = keptFrom(args.practicalConstraints);
  if (kept.length < 2) return [];
  const origin = originFrom(args.practicalConstraints);

  const dated = kept
    .map((text) => ({ text, at: origin[text.toLowerCase()]?.at ?? null }))
    .filter((r): r is { text: string; at: string } => Boolean(r.at));

  const out: PreferenceRecheck[] = [];
  for (const older of dated) {
    let best: { text: string; at: string } | null = null;
    for (const newer of dated) {
      if (newer.text === older.text || newer.at <= older.at) continue;
      const mine = contentTokens(older.text, args.ignoreTokens);
      if (mine.size === 0) continue;
      const theirs = contentTokens(newer.text, args.ignoreTokens);
      let overlaps = false;
      for (const token of mine) {
        if (theirs.has(token)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps && (!best || newer.at > best.at)) best = newer;
    }
    if (best) {
      out.push({ text: older.text, at: older.at, newerText: best.text, newerAt: best.at });
    }
  }
  return out;
}
