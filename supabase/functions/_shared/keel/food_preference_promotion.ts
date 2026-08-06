/**
 * DE LA MÉMOIRE À LA COMPOSITION — promouvoir ce que l'élève a dit sur sa
 * bouffe en quelque chose que le générateur de plan lit.
 *
 * ---------------------------------------------------------------------------
 * LA BOUCLE OUVERTE QUE ÇA FERME
 * ---------------------------------------------------------------------------
 * L'élève écrit « je déteste le brocoli » dans la conversation. Le memorizer
 * l'extrait — mesuré le 2026-08-03 sur un vrai élève KEEL de 18 messages, il a
 * sorti seul l'aversion, deux contextes de vie, et a même résolu une
 * rétractation. Le rappel de conversation le ressort au bon moment.
 *
 * Et `generate-week-plan-v1` / `generate-meal-v1` n'en savent RIEN: vérifié par
 * grep, ni `memory_items` ni `memory_v2` ni `recall` n'apparaissent dans les
 * deux fonctions ni dans leurs constructeurs de prompt. Le plan composé trois
 * jours plus tard remet du brocoli.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI UNE PROMOTION, ET PAS UNE LECTURE DIRECTE
 * ---------------------------------------------------------------------------
 * Brancher `memory_items` sur le générateur aurait été plus court. C'est
 * exactement le motif que l'architecture s'interdit: `memory_items` est un
 * MAGASIN PROBABILISTE (confiance, ranking, statut `candidate`). Ce dépôt a la
 * cicatrice — avant le lot de correction, la seule trace qu'une allergie
 * laissait était un `memory_item` `candidate`, « le magasin probabiliste que
 * l'architecture interdit précisément pour ça »
 * (`safety-constraints-armed-belt-empty-vault`).
 *
 * La promotion passe donc par un écran: l'élève CONFIRME, et une inférence
 * devient un fait déclaré. C'est aussi ce qui rend la chose éditable et
 * évitable, ce qui est la moitié de la demande.
 *
 * ---------------------------------------------------------------------------
 * LA DESTINATION EXISTE DÉJÀ, ET C'EST CE QUI REND LE PONT COURT
 * ---------------------------------------------------------------------------
 * `student_goals.practical_constraints` est un jsonb LU PAR LES DEUX
 * générateurs, et `week_plan_generation.ts` le sérialise en entier dans le
 * prompt. Écrire une clé de plus suffit à ce que les deux la voient — aucun
 * câblage supplémentaire.
 *
 * COROLLAIRE, et c'est pour ça que les propositions ne sont PAS persistées:
 * tout ce qui entre dans ce jsonb part dans le prompt. Une proposition rangée
 * là serait servie au générateur comme un fait acquis avant que l'élève ne
 * l'ait vue. Les propositions se calculent donc à la volée; seul ce qui est
 * GARDÉ s'écrit.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

/** Une ligne de `memory_items`, réduite à ce que la promotion regarde. */
export interface MemoryItemForPromotion {
  id: string;
  kind: string;
  status: string;
  content_text: string;
  normalized_summary?: string | null;
  domain_keys?: readonly string[] | null;
  confidence?: number | null;
  sensitivity_level?: string | null;
}

/** Ce que l'écran propose à l'élève de garder. */
export interface FoodPreferenceProposal {
  /** L'id de l'item source — c'est lui qu'on retient si l'élève écarte. */
  memoryItemId: string;
  /** Le texte proposé, éditable avant d'être gardé. */
  text: string;
}

/**
 * LA CLÉ ALIMENTAIRE de la taxonomie (`memory/domain_keys.v1.json`).
 *
 * Une seule, et pas une liste élargie « au cas où »: `habitudes.execution` ou
 * `sante.energie` remonteraient des souvenirs vrais mais hors sujet, et une
 * carte de préférences alimentaires pleine de bruit est une carte que l'élève
 * ferme.
 */
export const FOOD_DOMAIN_KEY = "sante.alimentation";

/**
 * Sous ce seuil, le memorizer lui-même n'est pas sûr. Il refuse déjà de créer
 * un item sous 0,55; on demande davantage pour proposer quelque chose qui ira
 * gouverner une semaine de repas.
 */
const MIN_CONFIDENCE = 0.7;

/**
 * LES STATUTS QU'ON REFUSE, chacun pour une raison différente:
 *   `candidate`        — le système de mémoire lui-même ne l'a pas retenu. Le
 *                        promouvoir sauterait par-dessus sa propre validation.
 *   `hidden_by_user` /
 *   `deleted_by_user`  — l'élève a déjà dit non. Le reproposer serait insister.
 *   `superseded` /
 *   `invalidated` /
 *   `archived`         — remplacé ou périmé; ce n'est plus ce qu'il pense.
 */
const PROMOTABLE_STATUS = "active";

/**
 * LES `kind` PROMOUVABLES.
 *
 * `event` est exclu, et c'est le filtre le plus important de la liste: « j'ai
 * mangé une pizza mardi » est un fait daté, pas une préférence permanente. Le
 * promouvoir en contrainte de composition mettrait une pizza dans toutes les
 * semaines à venir.
 *
 * `action_observation` est exclu aussi: il décrit l'exécution d'une action du
 * plan, pas un goût.
 */
const PROMOTABLE_KINDS: readonly string[] = ["fact", "statement"];

/**
 * Les propositions à montrer, dans l'ordre où le memorizer les a rendues.
 *
 * @param kept les textes DÉJÀ gardés — on ne repropose pas ce qui est écrit.
 * @param dismissed les ids d'items DÉJÀ écartés — on ne réinsiste jamais.
 */
export function proposeFoodPreferences(args: {
  items: readonly MemoryItemForPromotion[];
  kept?: readonly string[];
  dismissed?: readonly string[];
}): FoodPreferenceProposal[] {
  const dismissed = new Set(
    (args.dismissed ?? []).map((d) => String(d ?? "").trim()).filter(Boolean),
  );
  const keptNormalized = new Set(
    (args.kept ?? []).map((k) => String(k ?? "").trim().toLowerCase()).filter(Boolean),
  );

  const out: FoodPreferenceProposal[] = [];
  const seen = new Set<string>();

  for (const item of args.items) {
    const id = String(item?.id ?? "").trim();
    if (!id || dismissed.has(id)) continue;

    if (String(item.status ?? "") !== PROMOTABLE_STATUS) continue;
    if (!PROMOTABLE_KINDS.includes(String(item.kind ?? ""))) continue;

    // ── LA LIGNE MÉDICALE, ET ELLE NE BOUGE PAS ────────────────────────────
    // `sensitive` et `safety` ne montent JAMAIS dans une carte souple et
    // éditable. Le dur a sa table — `student_safety_constraints`, synchrone,
    // sans cache, sans ranking — et une allergie qui arriverait ici serait
    // exactement la confusion des deux couches que le pivot a tranchée.
    if (String(item.sensitivity_level ?? "normal") !== "normal") continue;

    const keys = (item.domain_keys ?? []).map((k) => String(k ?? "").trim());
    if (!keys.includes(FOOD_DOMAIN_KEY)) continue;

    const confidence = Number(item.confidence ?? 0);
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) continue;

    // Le résumé normalisé quand il existe: c'est la forme courte, celle qui
    // tient sur une ligne d'écran. Le texte brut sinon.
    const text = String(item.normalized_summary ?? "").trim() ||
      String(item.content_text ?? "").trim();
    if (!text) continue;

    const key = text.toLowerCase();
    if (keptNormalized.has(key) || seen.has(key)) continue;
    seen.add(key);

    out.push({ memoryItemId: id, text });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Ce qui s'écrit dans `practical_constraints`
// ---------------------------------------------------------------------------

/** La clé lue par les deux générateurs, via la sérialisation du jsonb. */
export const FOOD_PREFERENCES_KEY = "food_preferences";
/** Les ids écartés. Jamais servi au modèle — voir `constraintsForPrompt`. */
export const FOOD_PREFERENCES_DISMISSED_KEY = "food_preferences_dismissed";

/**
 * Fusionne une décision de l'élève dans `practical_constraints`, SANS écraser
 * les autres clés.
 *
 * Le motif vient des deux cartes qui existent déjà (`EatingRhythmCard`,
 * `CookingCapacityCard`): chacune possède UNE clé et fusionne le reste. Deux
 * cartes ouvertes côte à côte ne doivent pas se désécrire l'une l'autre.
 */
export function applyFoodPreferenceDecision(
  constraints: Record<string, unknown> | null | undefined,
  decision:
    | { kind: "keep"; text: string; memoryItemId?: string | null }
    | { kind: "dismiss"; memoryItemId: string }
    | { kind: "remove"; text: string }
    | { kind: "edit"; from: string; to: string },
): Record<string, unknown> {
  const base = { ...(constraints ?? {}) } as Record<string, unknown>;
  const kept = Array.isArray(base[FOOD_PREFERENCES_KEY])
    ? (base[FOOD_PREFERENCES_KEY] as unknown[]).map((v) => String(v ?? "").trim())
      .filter(Boolean)
    : [];
  const dismissed = Array.isArray(base[FOOD_PREFERENCES_DISMISSED_KEY])
    ? (base[FOOD_PREFERENCES_DISMISSED_KEY] as unknown[]).map((v) =>
      String(v ?? "").trim()
    ).filter(Boolean)
    : [];

  if (decision.kind === "keep") {
    const text = String(decision.text ?? "").trim();
    if (text && !kept.some((k) => k.toLowerCase() === text.toLowerCase())) {
      kept.push(text);
    }
    // Gardé ET marqué comme traité: sans ça la proposition reviendrait à
    // chaque ouverture de l'écran, puisqu'elle n'est pas persistée.
    const id = String(decision.memoryItemId ?? "").trim();
    if (id && !dismissed.includes(id)) dismissed.push(id);
  }

  if (decision.kind === "dismiss") {
    const id = String(decision.memoryItemId ?? "").trim();
    if (id && !dismissed.includes(id)) dismissed.push(id);
  }

  if (decision.kind === "remove") {
    const text = String(decision.text ?? "").trim().toLowerCase();
    const at = kept.findIndex((k) => k.toLowerCase() === text);
    if (at >= 0) kept.splice(at, 1);
  }

  if (decision.kind === "edit") {
    const from = String(decision.from ?? "").trim().toLowerCase();
    const to = String(decision.to ?? "").trim();
    const at = kept.findIndex((k) => k.toLowerCase() === from);
    if (at >= 0 && to) kept[at] = to;
    else if (at >= 0) kept.splice(at, 1);
  }

  base[FOOD_PREFERENCES_KEY] = kept;
  base[FOOD_PREFERENCES_DISMISSED_KEY] = dismissed;
  return base;
}

/**
 * `practical_constraints` TEL QUE LE MODÈLE DOIT LE VOIR.
 *
 * ── POURQUOI CETTE FONCTION EXISTE ────────────────────────────────────────
 * Les deux générateurs sérialisent le jsonb ENTIER dans leur prompt
 * (`week_plan_generation.ts`: `JSON.stringify(practicalConstraints)`). Une clé
 * de plus est donc servie au modèle automatiquement — c'est ce qui rend le pont
 * court, et c'est aussi le piège: `food_preferences_dismissed` est une liste
 * d'UUID de comptabilité interne. Servie au modèle, elle occupe du budget de
 * prompt pour du bruit, et un modèle qui voit « dismissed » à côté de
 * préférences peut très bien décider de les appliquer à l'envers.
 *
 * Ce filtre est donc une garde de PROMPT, pas une préférence d'affichage.
 */
export function constraintsForPrompt(
  constraints: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out = { ...(constraints ?? {}) } as Record<string, unknown>;
  delete out[FOOD_PREFERENCES_DISMISSED_KEY];
  return out;
}
