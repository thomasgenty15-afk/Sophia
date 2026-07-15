import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { runDirectEffectGate } from "../../../routers/direct_effect_gate.ts";
import type {
  TrackProgressCommittedEffect,
  TrackProgressDirectEffectResult,
  TrackProgressIntent,
  TrackProgressRequestedEffect,
  TrackProgressStatus,
  TrackProgressWrite,
} from "./contract.ts";
import type { TrackProgressSameDayEvidenceCheck } from "./db.ts";
import { binaryItemPartialClarifyQuestion } from "./db.ts";
import { executeTrackProgressWrite } from "./executor.ts";
import { requestedEffectFromIntake, runTrackProgressIntake } from "./intake.ts";
import {
  enforceTrackProgressReplyInvariant,
  renderTrackProgressClarification,
  renderTrackProgressContradictionClarification,
  renderTrackProgressLoggedReply,
} from "./renderer.ts";

export type TrackProgressPlanItemRouterInput = {
  turn_frame: TurnFrame;
  message: string;
  plan_snapshot: unknown;
  recent_writes_idempotency?: { source_message_ids: string[] };
  db_idempotency_check?: (key: string) => Promise<boolean>;
  // Lecture d'evidence meme-jour injectee (voir
  // createTrackProgressSameDayEvidenceCheck): detecte un outcome oppose deja
  // committe avant d'autoriser un write non confirme.
  same_day_evidence_check?: TrackProgressSameDayEvidenceCheck;
  // Fenetre d'evidence textuelle pour le grounding de cible (F2): les 2
  // derniers messages de la conversation (les deux roles). La cible doit
  // etre attestee dans le message courant ou cette fenetre, sinon clarify.
  evidence_messages?: string[];
  no_mutation_requested?: boolean;
  blocked_reason_code?: string | null;
  /**
   * P2-4a: dernier commit track du TOUR PRÉCÉDENT (freshLastTrackCommit) —
   * une bascule de cible à statut identique le même jour, sans flags de
   * correction, se clarifie au lieu de s'empiler (« en plus ou à la place ? »).
   */
  last_track_commit?: {
    target_item_id: string;
    target_title: string;
    progress_status: string;
  } | null;
  write_progress: TrackProgressWrite;
};

export type TrackProgressRuntimeStateResult = {
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
};

export type TrackProgressDispatcherSignal = {
  detected: boolean;
  target_item_id?: string | null;
  target_title?: string | null;
  status_hint?: string | null;
  value_hint?: number | null;
  date_hint?: string | null;
};

export type TrackProgressPlanItemRuntimeInput =
  & Omit<TrackProgressPlanItemRouterInput, "turn_frame">
  & {
    turn_frame: TurnFrame | null;
    temp_memory: any;
    source_message_id?: string | null;
    skip_reason_code?: string | null;
  };

export const TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY =
  "__track_progress_plan_item_runtime";

function hasTrackProgressEffect(turnFrame: TurnFrame): boolean {
  return turnFrame.direct_effects.some((effect) =>
    effect.effect_type === "track_progress_plan_item"
  );
}

export function dispatcherTrackProgressSignalFromTurnFrame(
  turnFrame: TurnFrame | null,
): TrackProgressDispatcherSignal {
  const effect = turnFrame?.direct_effects.find((candidate) =>
    candidate.effect_type === "track_progress_plan_item"
  );
  if (!effect) return { detected: false };
  const payload = effect.payload_hint &&
      typeof effect.payload_hint === "object" &&
      !Array.isArray(effect.payload_hint)
    ? effect.payload_hint as Record<string, unknown>
    : {};
  return {
    detected: true,
    target_item_id: typeof payload.target_item_id === "string"
      ? payload.target_item_id
      : null,
    target_title: typeof payload.target_title === "string"
      ? payload.target_title
      : null,
    status_hint: typeof payload.status_hint === "string"
      ? payload.status_hint
      : null,
    value_hint: typeof payload.value_hint === "number"
      ? payload.value_hint
      : null,
    date_hint: typeof payload.date_hint === "string" ? payload.date_hint : null,
  };
}

function emptyResult(reasonCode: string): TrackProgressDirectEffectResult {
  return {
    detected: false,
    intent: "ignore",
    status: "ignored",
    reply: null,
    executed_tools: [],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    debug: { reason_code: reasonCode },
  };
}

function blockedResult(params: {
  intent: TrackProgressIntent;
  reason_code: string;
  status?: "blocked" | "failed" | "ignored" | "needs_clarify";
  gate_reason?: string | null;
  requested_effects?: TrackProgressRequestedEffect[];
  allowed_effects?: TrackProgressRequestedEffect[];
  reply?: string | null;
  known_slots_extra?: Record<string, unknown>;
}): TrackProgressDirectEffectResult {
  return enforceTrackProgressReplyInvariant({
    detected: true,
    ...(params.known_slots_extra
      ? { known_slots_extra: params.known_slots_extra }
      : {}),
    intent: params.intent,
    status: params.status ?? "blocked",
    reply: params.reply ?? null,
    executed_tools: [],
    requested_effects: params.requested_effects ?? [],
    allowed_effects: params.allowed_effects ?? [],
    committed_effects: [],
    blocked_effects: [{
      type: "track_progress_plan_item",
      reason_code: params.reason_code,
    }],
    debug: {
      reason_code: params.reason_code,
      gate_reason: params.gate_reason ?? null,
    },
  });
}

function normalizeGateReasonCode(reasonCode: string): string {
  return reasonCode === "missing_time" ? "target_missing" : reasonCode;
}

function intentForProgressStatus(
  status: TrackProgressStatus,
): TrackProgressIntent {
  if (status === "missed") return "log_missed";
  if (status === "partial") return "log_partial";
  return "log_completed";
}

function planItems(
  planSnapshot: unknown,
): Array<
  {
    id: string;
    title: string;
    aliases: string[];
    strict_aliases: string[];
    kind: string;
    dimension: string;
    target_reps: number | null;
  }
> {
  const items = Array.isArray(planSnapshot)
    ? planSnapshot
    : Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  return items
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? ""),
      // nina-r7 B01: la garde partial-sur-binaire lit ces faits structures
      // du snapshot (jamais le texte du message).
      kind: String(item?.item_type ?? item?.kind ?? ""),
      dimension: String(item?.dimension ?? ""),
      target_reps: Number.isFinite(Number(item?.target_reps)) &&
          item?.target_reps !== null && item?.target_reps !== undefined
        ? Number(item.target_reps)
        : null,
      aliases: [
        // Vocabulaire user-facing structurel de l'item: aliases si presents,
        // et description (le snapshot V2 la porte) — reduit la friction
        // quand le user nomme l'action avec ses mots a lui.
        ...(Array.isArray(item?.aliases)
          ? item.aliases.map((alias: unknown) => String(alias ?? ""))
          : []),
        String(item?.description ?? ""),
      ].filter(Boolean),
      // Vocabulaire STRICT (sans description): un track NEGATIF exige que la
      // citation nomme l'action par son titre ou un alias structure — la
      // description matche trop large pour ecrire un echec (nina R1-B04).
      strict_aliases: (Array.isArray(item?.aliases)
        ? item.aliases.map((alias: unknown) => String(alias ?? ""))
        : []).filter(Boolean),
    }))
    .filter((item: { id: string; title: string }) => item.id && item.title);
}

function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// P4-A (nina-p3reval R1-B01/B02): additif vs substitution. Un marqueur
// additif explicite (« aussi », « en plus », « les deux ») tranche la
// question que la garde de bascule pose — et INTERDIT le retarget: on
// n'invalide jamais une completion sous marqueur additif. Les marqueurs de
// substitution gardent la priorite quand les deux familles coexistent
// (« pas X, en plus je... » reste une correction).
const ADDITIVE_MARKERS = [
  " aussi ",
  " en plus ",
  " les deux ",
  " egalement ",
  " en meme temps ",
];
const SUBSTITUTION_MARKERS = [
  " a la place ",
  " au lieu de ",
  " au lieu d ",
  " plutot que ",
  " c etait pas ",
  " cetait pas ",
  " ce n etait pas ",
  " c est pas ",
  " je me suis trompe",
  " je me suis embrouille",
  " enleve le ",
  " enleve la ",
  " retire le ",
  " retire la ",
];

function paddedNormalized(message: string): string {
  return ` ${normalizeEvidenceText(message)} `;
}

export function trackMessageIsAdditive(message: string): boolean {
  const text = paddedNormalized(message);
  const additive = ADDITIVE_MARKERS.some((marker) => text.includes(marker));
  if (!additive) return false;
  // P6-C (eva-hard21 R1-B07): un marqueur additif ACCOLÉ au verbe de report
  // (« note aussi », « compte aussi ») prime sur un marqueur de substitution
  // qui vit AILLEURS dans la phrase comme simple description du contenu —
  // « j'ai lu AU LIEU DE scroller » décrit l'activité choisie, pas une
  // correction de suivi ; l'ancien arbitrage annulait l'additif et faisait
  // répéter le user (« EN PLUS ou À LA PLACE ? » sur un « note aussi »).
  if (
    / (note[sz]?|compte[sz]?|ajoute[sz]?|marque[sz]?|enregistre[sz]?) (bien |moi )?aussi /
      .test(text) ||
    / aussi (que )?j ai /.test(text)
  ) {
    return true;
  }
  return !SUBSTITUTION_MARKERS.some((marker) => text.includes(marker));
}

/**
 * P4-A (paul-p3verify R1-B01, alex-global19 R1-B04): resolution DETERMINISTE
 * d'une cible par appariement titre/alias ↔ textes de reference — jamais un
 * id LLM en confiance aveugle. Retourne l'item au meilleur recouvrement de
 * tokens significatifs s'il est UNIQUE, "ambiguous" si deux items sont a
 * egalite, null si rien ne matche.
 */
export function resolvePlanItemByNaming(args: {
  items: Array<{ id: string; title: string; aliases: string[] }>;
  reference_texts: Array<string | null | undefined>;
  exclude_item_id?: string | null;
}): { item: { id: string; title: string } } | { ambiguous: true } | null {
  const referenceTokens = new Set(
    args.reference_texts
      .filter(Boolean)
      .flatMap((text) => normalizeEvidenceText(String(text)).split(/[^a-z0-9]+/))
      .filter((token) => token.length >= 3),
  );
  if (referenceTokens.size === 0) return null;
  let best: { id: string; title: string } | null = null;
  let bestScore = 0;
  let tie = false;
  for (const item of args.items) {
    if (args.exclude_item_id && item.id === args.exclude_item_id) continue;
    const itemTokens = new Set(
      [item.title, ...item.aliases]
        .flatMap((source) => normalizeEvidenceText(source).split(/[^a-z0-9]+/))
        .filter((token) => token.length >= 3),
    );
    let score = 0;
    for (const token of itemTokens) {
      if (referenceTokens.has(token)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { id: item.id, title: item.title };
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  if (!best || bestScore === 0) return null;
  if (tie) return { ambiguous: true };
  return { item: best };
}

function looksLikeUuid(value: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(
    String(value ?? "").trim(),
  );
}

/**
 * P4-B (rose-hard16 R1-B02, paul-p3verify R1-B02): une LISTE EXPLICITE de
 * jours (« hier et avant-hier », « ces deux derniers soirs ») se déplie en
 * une entrée PAR jour — le contrat mono-effet aplatissait au premier jour
 * pendant que la confirmation affirmait les deux (sous-comptage durable
 * masqué). Détection déterministe des formes observées, bornée à 3 jours;
 * toute autre plage reste mono-entrée (repli honnête côté composeur).
 * Retourne les jours ISO (YYYY-MM-DD) du plus récent au plus ancien, ou null
 * si le message ne porte pas de liste explicite.
 */
export function resolveExplicitTrackDayList(args: {
  message: string;
  user_local_date: string | null;
}): string[] | null {
  const localDate = String(args.user_local_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  // P5-C: la ponctuation devient espace — « vendredi, samedi et dimanche »
  // doit matcher les tokens ` vendredi ` / ` samedi ` (la normalisation
  // d'évidence ne touche pas la ponctuation).
  const text = paddedNormalized(
    args.message.replace(/[^\p{L}\p{N}]+/gu, " "),
  );
  const dayOffsetISO = (offset: number): string =>
    new Date(Date.parse(`${localDate}T12:00:00Z`) - offset * 86_400_000)
      .toISOString().slice(0, 10);
  // P5-C: un jour NIÉ ou SUBSTITUÉ (« pas hier », « plutôt avant-hier ») ne
  // compte jamais dans la liste — une correction de substitution reste
  // mono-jour (chemin nominal), seule la liste affirmée se déplie.
  const negatedAvantHier = / (pas|plutot|sauf) avant hier /.test(text);
  const hasAvantHier = / avant hier /.test(text) && !negatedAvantHier;
  const textSansAvantHier = text.replace(/ avant hier /g, " ");
  const hasHierStandalone = / hier /.test(textSansAvantHier) &&
    !/ (pas|plutot|sauf) hier /.test(textSansAvantHier);
  if (hasAvantHier && hasHierStandalone) {
    // P8-A (eva-hard23 R1-B02): « hier soir, avant-hier soir ET le soir
    // d'avant » — le 3e jour relatif (J-3, « le soir/jour d'avant » qui suit
    // avant-hier) n'était couvert par aucune forme: 2 entrées committées, le
    // rendu affirmait 3 dates dont une fantôme. La queue « d'avant » n'étend
    // la liste QUE dans la combinaison hier+avant-hier déjà affirmée (jamais
    // seule), reste bornée à 3 (doctrine P4) et respecte la négation.
    const hasJourDavantTail =
      / (le |celui d )?(soir|soiree|jour|journee|matin|matinee|nuit) d avant /
        .test(textSansAvantHier) &&
      !/ (pas|plutot|sauf) (le |celui d )?(soir|soiree|jour|journee|matin|matinee|nuit) d avant /
        .test(textSansAvantHier);
    if (hasJourDavantTail) {
      return [dayOffsetISO(1), dayOffsetISO(2), dayOffsetISO(3)];
    }
    return [dayOffsetISO(1), dayOffsetISO(2)];
  }
  if (
    / ces (deux|2) dernier(s|es)? (soirs?|jours?|matins?|soirees?|nuits?) /
      .test(text)
  ) {
    return [dayOffsetISO(1), dayOffsetISO(2)];
  }
  if (
    / ces (trois|3) dernier(s|es)? (soirs?|jours?|matins?|soirees?|nuits?) /
      .test(text)
  ) {
    return [dayOffsetISO(1), dayOffsetISO(2), dayOffsetISO(3)];
  }
  // P6-D (eva-hard21 R1-B01): « hier soir ET ce soir, les deux » — la
  // combinaison HIER + AUJOURD'HUI n'était couverte par aucune forme. Exige
  // un marqueur d'affirmation double (« les deux », « deux soirs », « ce
  // soir aussi ») pour ne jamais compter un « ce soir je vais… » (intention
  // future) comme une complétion du jour.
  if (
    hasHierStandalone &&
    / (ce soir|aujourd hui) /.test(text) &&
    / (les deux|deux soirs|deux jours|(ce soir|aujourd hui) aussi) /.test(text)
  ) {
    return [dayOffsetISO(1), dayOffsetISO(0)];
  }
  // P5-C (alex-untested20 R1-B01, nina-global20 B02): liste de JOURS DE
  // SEMAINE NOMMÉS (« vendredi, samedi et dimanche ») — chaque jour nommé
  // non nié se résout au plus récent PASSÉ (aujourd'hui inclus) vs l'horloge
  // user. ≥2 jours distincts = dépliage (borné 3, doctrine P4) ; un seul
  // jour nommé reste le chemin nominal (date_hint dispatcher).
  const WEEKDAY_INDEX: Record<string, number> = {
    dimanche: 0,
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6,
  };
  const namedDays = Object.keys(WEEKDAY_INDEX).filter((name) =>
    new RegExp(` ${name} `).test(text) &&
    !new RegExp(` (pas|plutot|sauf) ${name} `).test(text)
  );
  if (namedDays.length >= 2) {
    const todayIdx = new Date(Date.parse(`${localDate}T12:00:00Z`))
      .getUTCDay();
    const resolved = namedDays.map((name) =>
      dayOffsetISO((todayIdx - WEEKDAY_INDEX[name] + 7) % 7)
    );
    const unique = [...new Set(resolved)].sort().slice(0, 3);
    if (unique.length >= 2) return unique;
  }
  return null;
}

/**
 * Grounding de cible v2 (G1, contrat 3d-ter): le dispatcher fournit la
 * PREUVE — payload_hint.target_evidence, citation verbatim des mots du user
 * qui nomment l'action visee. Le runtime ne porte AUCUNE connaissance
 * metier (zero liste, zero pattern): il verifie seulement que la citation
 * existe telle quelle dans le message courant ou la fenetre recente
 * (normalisation accents/casse/espaces uniquement, pour tolerer une
 * citation aux accents pres). Toute la semantique — quel item, quels mots
 * le nomment — reste dans le prompt. Citation absente ou introuvable =
 * cible non prouvee → clarification (contrat O + re-arm 3g).
 */
export function trackTargetEvidenceVerified(args: {
  target_evidence: string | null;
  target_title: string;
  target_aliases?: string[];
  texts: string[];
  /**
   * P2-4b (nina-untested R1-B03): pour un report POSITIF, la cible que
   * SOPHIA vient de nommer dans la fenêtre d'évidence vaut nommage — le user
   * qui CONFIRME (« bah si je te confirme, note-la ») n'a pas à retaper le
   * titre. Jamais activé pour `missed` (P1-1: nommage strict par le user).
   */
  allow_window_title_match?: boolean;
}): boolean {
  if (args.allow_window_title_match) {
    const normalizedTitle = normalizeEvidenceText(args.target_title);
    if (
      normalizedTitle.length >= 6 &&
      args.texts.some((text) =>
        normalizeEvidenceText(text).includes(normalizedTitle)
      )
    ) {
      return true;
    }
    // P4-A (probe P4-1 passe 3): pour un report POSITIF, une COUVERTURE
    // forte des tokens du titre dans le message vaut nommage — la citation
    // verbatim du dispatcher est parfois recopiée de travers (« boire un
    // grand verre » cité pour « j'ai bu mon grand verre ») et la clarify
    // re-bloquait un report manifeste. Jamais pour `missed` (P1-1).
    // P5-E (paul-p4verify Y1): la couverture tolère la MORPHOLOGIE française
    // (« j'ai préparé » nomme « Préparer ses affaires » — préfixe commun ≥5)
    // et ignore les déterminants/possessifs du titre (« ses », « les ») qui
    // diluaient le ratio sous les 60 % sur une action pourtant nommée mot
    // pour mot.
    const TITLE_COVERAGE_STOPWORDS = new Set([
      "les",
      "des",
      "ses",
      "mes",
      "tes",
      "nos",
      "vos",
      "son",
      "une",
      "aux",
    ]);
    const titleTokens = [
      ...new Set(
        normalizeEvidenceText(args.target_title)
          .split(/[^a-z0-9]+/)
          .filter((token) =>
            token.length >= 3 && !TITLE_COVERAGE_STOPWORDS.has(token)
          ),
      ),
    ];
    if (titleTokens.length >= 2) {
      const textTokens = [
        ...new Set(
          args.texts.flatMap((text) =>
            normalizeEvidenceText(text).split(/[^a-z0-9]+/)
          ).filter((token) => token.length >= 3),
        ),
      ];
      const textTokenSet = new Set(textTokens);
      const tokenCovered = (token: string): boolean =>
        textTokenSet.has(token) ||
        (token.length >= 5 && textTokens.some((candidate) =>
          candidate.length >= 5 && candidate.slice(0, 5) === token.slice(0, 5)
        ));
      const covered = titleTokens.filter(tokenCovered).length;
      // P5-E/P5-V (probe P5-3 passe 3): un titre LONG à clause contextuelle
      // (« Boire un grand verre d'eau avant de grignoter ») dilue le ratio —
      // « j'ai bu mon grand verre d'eau » couvre 3 tokens pleins (grand,
      // verre, eau) et nomme l'action sans ambiguïté. ≥3 tokens couverts
      // valent nommage pour un report POSITIF (jamais missed, P1-1).
      // P7-V (probes P7-4/P7-9): un titre à DEUX tokens significatifs
      // (« Marcher 20 minutes » — « 20 » tombe sous la longueur min) n'entrait
      // JAMAIS dans la couverture, et un titre long nommé par verbe+objet
      // (« coupé les écrans » pour « Couper les écrans 30 min avant le lit »)
      // restait sous 60 % — la citation dispatcher compensait tant qu'elle
      // était émise. Report POSITIF: 2 tokens couverts avec ratio ≥ 0.4
      // valent nommage (un titre court couvert = 100 %); un seul token ne
      // suffit jamais (anti-FP P1-1 intact).
      const ratio = covered / titleTokens.length;
      if (ratio >= 0.6 || covered >= 3 || (covered >= 2 && ratio >= 0.4)) {
        return true;
      }
    }
  }
  const quote = normalizeEvidenceText(String(args.target_evidence ?? ""));
  if (!quote) return false;
  const quoteExists = args.texts.some((text) =>
    normalizeEvidenceText(text).includes(quote)
  );
  if (!quoteExists) return false;
  // Coherence citation ↔ cible choisie (observed: le modele cite la
  // reference vague elle-meme, "un autre truc du plan", comme evidence).
  // Une citation qui ne partage AUCUN mot avec le titre de l'item choisi ne
  // peut pas le nommer. Intersection ensembliste pure entre deux chaines du
  // contrat — zero liste, zero connaissance metier, rien a maintenir.
  // Les aliases structures de l'item comptent comme son nom: c'est le
  // vocabulaire user-facing prevu par le produit ("ma marche" pour "Faire
  // 10 min de mouvement en rentrant").
  const titleTokens = new Set(
    [args.target_title, ...(args.target_aliases ?? [])]
      .flatMap((source) =>
        normalizeEvidenceText(source).split(/[^a-z0-9]+/)
      )
      .filter((token) => token.length >= 3),
  );
  if (titleTokens.size === 0) return true;
  const quoteTokens = quote.split(/[^a-z0-9]+/).filter((token) =>
    token.length >= 3
  );
  return quoteTokens.some((token) => titleTokens.has(token));
}

export async function runTrackProgressPlanItemDirectEffect(
  input: TrackProgressPlanItemRouterInput,
): Promise<TrackProgressDirectEffectResult> {
  if (!hasTrackProgressEffect(input.turn_frame)) {
    return emptyResult("no_track_progress_direct_effect");
  }

  const intake = runTrackProgressIntake({
    turn_frame: input.turn_frame,
    message: input.message,
  });

  if (input.blocked_reason_code) {
    return blockedResult({
      intent: "ignore",
      reason_code: input.blocked_reason_code,
    });
  }

  if (input.no_mutation_requested) {
    return blockedResult({
      intent: "ignore",
      reason_code: "global_no_mutation_context",
    });
  }

  if (intake.intent === "status_question") {
    return blockedResult({
      intent: "status_question",
      status: "ignored",
      reason_code: "status_question",
    });
  }

  if (intake.intent === "future_intent") {
    return blockedResult({
      intent: "future_intent",
      reason_code: "future_intent",
    });
  }

  if (!intake.detected) return emptyResult(intake.reason_code);

  const items = planItems(input.plan_snapshot);
  const additiveIntent = trackMessageIsAdditive(input.message);
  // P4-A (paul-p3verify R1-B01): résolution DÉTERMINISTE de la cible —
  // l'id émis par le LLM se valide contre le plan actif; absent ou corrompu
  // (id halluciné à un caractère près, target_title = l'id lui-même), la
  // cible se résout par titre/évidence, jamais en confiance aveugle.
  let resolvedTargetItemId = intake.target_item_id;
  if (
    resolvedTargetItemId &&
    !items.some((candidate) => candidate.id === resolvedTargetItemId)
  ) {
    const fromPayload = resolvePlanItemByNaming({
      items,
      reference_texts: [
        looksLikeUuid(intake.target_title) ? null : intake.target_title,
        intake.target_evidence,
      ],
    });
    const named = fromPayload && "item" in fromPayload
      ? fromPayload
      : resolvePlanItemByNaming({
        items,
        reference_texts: [input.message],
      });
    if (named && "item" in named) {
      resolvedTargetItemId = named.item.id;
    }
  }
  // P5-E (eva-p4verify R1-B03/B04): un id LLM VALIDE mais contredit par
  // l'ÉVIDENCE NOMMÉE du message perd — biais de récence observé (la cible
  // se résolvait sur le dernier item tracké au lieu de l'action citée, sur
  // additif comme sur multi-intent). Le nommage user prime quand il résout
  // de façon UNIQUE un item différent ; évidence vague ou ambiguë = id LLM
  // conservé. Jamais sur un tour de correction/retarget (l'évidence peut y
  // citer la SOURCE — la mécanique P4-A dédiée fait foi).
  if (
    resolvedTargetItemId && intake.target_evidence &&
    !intake.is_correction && !intake.retarget_from_item_id
  ) {
    const namedByEvidence = resolvePlanItemByNaming({
      items,
      reference_texts: [intake.target_evidence],
    });
    if (
      namedByEvidence && "item" in namedByEvidence &&
      namedByEvidence.item.id !== resolvedTargetItemId
    ) {
      resolvedTargetItemId = namedByEvidence.item.id;
    }
  }
  // P6-C (paul-hard21 R1-B01): ISOLATION PAR EFFET — la cible du track ne se
  // résout jamais depuis le texte du RAPPEL co-listé du même tour. Quand la
  // cible choisie est nommée par l'instruction du rappel (« préparer mon sac
  // de sport » → item « Préparer ses affaires ») et pas par le report, on
  // ré-résout depuis le message SANS les tokens du rappel ; item distinct
  // unique → bascule ; rien → clarify, jamais un commit de cible polluée.
  {
    const coListedReminderInstruction = String(
      ((input.turn_frame.direct_effects ?? []).find((effect) =>
        effect.effect_type === "create_one_shot_reminder"
      )?.payload_hint as Record<string, unknown> | undefined)
        ?.instruction_hint ?? "",
    ).trim();
    if (resolvedTargetItemId && coListedReminderInstruction) {
      const namedByReminder = resolvePlanItemByNaming({
        items,
        reference_texts: [coListedReminderInstruction],
      });
      const pollutedByReminder = namedByReminder && "item" in namedByReminder &&
        namedByReminder.item.id === resolvedTargetItemId;
      if (pollutedByReminder) {
        const reminderTokens = new Set(
          normalizeEvidenceText(coListedReminderInstruction)
            .split(/[^a-z0-9]+/).filter((token) => token.length >= 3),
        );
        const strippedMessage = normalizeEvidenceText(input.message)
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length > 0 && !reminderTokens.has(token))
          .join(" ");
        const renamed = resolvePlanItemByNaming({
          items,
          reference_texts: [strippedMessage],
          exclude_item_id: resolvedTargetItemId,
        });
        if (renamed && "item" in renamed) {
          resolvedTargetItemId = renamed.item.id;
        } else {
          // Aucune action distincte nommée hors du segment rappel: cible
          // invérifiable → clarify (le G1 aval passerait à tort, le message
          // CONTIENT le texte du rappel qui matche le mauvais titre).
          return blockedResult({
            intent: "clarify",
            status: "needs_clarify",
            reason_code: "target_not_evidenced",
            reply: renderTrackProgressClarification("target_missing"),
          });
        }
      }
    }
  }
  // P5-E (rose-hard17 R1-B03): « enlève de X et mets-le sur Y » émis avec
  // cible = retarget_from = X (la source) — l'arrivée Y n'était pas mappée
  // et la clarify citait l'item à RETIRER. Quand la cible émise EST la
  // source du retarget, l'arrivée se résout par nommage (source exclue) ;
  // introuvable/ambiguë → la clarify aval reste, mais nommera l'arrivée.
  if (
    !additiveIntent && intake.retarget_from_item_id &&
    resolvedTargetItemId === intake.retarget_from_item_id
  ) {
    const arrival = resolvePlanItemByNaming({
      items,
      reference_texts: [intake.target_evidence, input.message],
      exclude_item_id: intake.retarget_from_item_id,
    });
    if (arrival && "item" in arrival) {
      resolvedTargetItemId = arrival.item.id;
    }
  }
  const itemForRequest = items.find((candidate) =>
    candidate.id === resolvedTargetItemId
  );
  const requested = requestedEffectFromIntake({
    intake: { ...intake, target_item_id: resolvedTargetItemId },
    target_title: itemForRequest?.title ?? intake.target_title ??
      resolvedTargetItemId ?? "",
    source_message_id: input.turn_frame.source_message_id,
  });
  const requestedEffects = requested ? [requested] : [];

  const gate = await runDirectEffectGate({
    effect_type: "track_progress_plan_item",
    turn_frame: input.turn_frame,
    recent_writes_idempotency: input.recent_writes_idempotency ??
      { source_message_ids: [] },
    db_idempotency_check: input.db_idempotency_check ?? (async () => false),
  });
  if (gate.decision === "blocked") {
    const reasonCode = normalizeGateReasonCode(gate.reason_code);
    return blockedResult({
      intent: "ignore",
      reason_code: reasonCode,
      gate_reason: gate.reason_code,
      requested_effects: requestedEffects,
    });
  }
  if (gate.decision === "needs_clarify") {
    const reasonCode = normalizeGateReasonCode(gate.reason_code);
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: reasonCode,
      gate_reason: gate.reason_code,
      reply: gate.suggested_clarification ??
        renderTrackProgressClarification(reasonCode),
      requested_effects: requestedEffects,
    });
  }

  if (intake.reason_code === "status_missing") {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: "status_missing",
      reply: renderTrackProgressClarification("status_missing"),
      requested_effects: requestedEffects,
    });
  }

  if (!requested) {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: intake.target_item_id ? "status_missing" : "target_missing",
      reply: renderTrackProgressClarification(
        intake.target_item_id ? "status_missing" : "target_missing",
      ),
    });
  }

  const item = itemForRequest;
  if (!item) {
    return blockedResult({
      intent: "ignore",
      reason_code: "target_not_in_plan",
      requested_effects: requestedEffects,
    });
  }

  // Grounding de cible (G1, contrat 3d-ter): le dispatcher doit fournir la
  // citation verbatim des mots du user qui nomment la cible. Citation
  // absente (cible devinee, « un autre truc du plan ») ou introuvable
  // (fabriquee) → on n'ecrit pas, on demande (contrat O: la question part au
  // composeur + re-arm 3g au tour suivant). Zero sous-flow, zero etat.
  if (
    !trackTargetEvidenceVerified({
      target_evidence: intake.target_evidence,
      target_title: item.title,
      // P1-1 (nina R1-B04): un track NEGATIF ecrit un echec durable — la
      // citation doit nommer l'action par son TITRE ou un alias structure;
      // la description (vocabulaire large) ne suffit pas (« placards »
      // matchait la description d'une action jamais nommee → missed non
      // consenti). Les reports positifs gardent la tolerance description.
      target_aliases: requested.progress_status === "missed"
        ? item.strict_aliases
        : item.aliases,
      texts: [input.message, ...(input.evidence_messages ?? [])],
      allow_window_title_match: requested.progress_status !== "missed",
    })
  ) {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: "target_not_evidenced",
      reply:
        `Tu parles de quelle action exactement ? Je pensais a "${item.title}" mais je prefere que tu me la nommes avant de la noter.`,
      requested_effects: requestedEffects,
    });
  }

  // P2-4a (alex-untested R1-B01) + P3-C (paul-untested16 R1-B01): une
  // CORRECTION DE CIBLE à moitié émise (correction=true sans retarget_from)
  // faisait un append silencieux. Résolution en plusieurs temps :
  // 1. P4-A (nina-p3reval R1-B01): un marqueur ADDITIF explicite (« aussi »,
  //    « en plus », « les deux ») INTERDIT le retarget — le flag correction
  //    parasite tombe, on n'invalide JAMAIS une complétion sous additif ;
  // 2. le commit du TOUR PRÉCÉDENT sur une AUTRE cible est la cible
  //    d'origine évidente → retarget_from complété automatiquement ;
  // 3. P4-A (alex-global19 R1-B04): « c'est Y, pas X » nomme la cible
  //    d'origine DANS le message — un item du plan (≠ cible) nommé sans
  //    ambiguïté vaut retarget_from, on ne re-demande pas ;
  // 4. sans candidat ET sans entrée du jour sur la cible corrigée
  //    (distinction avec la correction de STATUT, même item), on demande.
  let effectiveRetargetFrom = additiveIntent
    ? null
    : intake.retarget_from_item_id;
  // P4-A (paul-p3reval): retarget_from émis mais hors plan (id LLM) →
  // résolution par nommage, sinon abandon (le bloc correction re-demande).
  if (
    effectiveRetargetFrom &&
    !items.some((candidate) => candidate.id === effectiveRetargetFrom)
  ) {
    const namedSource = resolvePlanItemByNaming({
      items,
      reference_texts: [input.message],
      exclude_item_id: requested.target_item_id,
    });
    effectiveRetargetFrom = namedSource && "item" in namedSource
      ? namedSource.item.id
      : null;
  }
  if (
    !additiveIntent && intake.is_correction && !effectiveRetargetFrom &&
    requested.progress_status !== "missed"
  ) {
    if (
      input.last_track_commit &&
      input.last_track_commit.target_item_id !== requested.target_item_id
    ) {
      effectiveRetargetFrom = input.last_track_commit.target_item_id;
    }
    if (!effectiveRetargetFrom) {
      const namedSource = resolvePlanItemByNaming({
        items,
        reference_texts: [input.message],
        exclude_item_id: requested.target_item_id,
      });
      if (namedSource && "item" in namedSource) {
        effectiveRetargetFrom = namedSource.item.id;
      }
    }
    if (!effectiveRetargetFrom && input.same_day_evidence_check) {
      const sameTargetPrior = await input.same_day_evidence_check({
        target_item_id: requested.target_item_id,
        progress_status: requested.progress_status,
        date_hint: requested.date_hint ?? null,
      });
      if (!sameTargetPrior) {
        return blockedResult({
          intent: "clarify",
          status: "needs_clarify",
          reason_code: "correction_retarget_missing",
          reply:
            `Ok pour "${item.title}" — mais c'était à la place de quelle action que je l'avais noté ? Dis-moi laquelle et je corrige les deux d'un coup.`,
          requested_effects: requestedEffects,
        });
      }
    }
  }

  // P2-4a (alex-untested R1-B01, garde finale): le dispatcher n'émet pas
  // toujours les flags de correction (« c'était pas le carnet, c'est les
  // écrans » émis en report nu malgré 3h-bis + last_track_commit structuré).
  // Déterminisme du runtime: un report SAME-STATUS sur une AUTRE cible que le
  // commit du TOUR PRÉCÉDENT, même jour, sans flags = indécidable entre
  // « en plus » et « à la place » → on demande, on n'empile jamais. Les
  // known_slots portent la cible d'origine pour que la réponse re-arme soit
  // le report additif, soit le retarget (3g).
  // P3-C: un date_hint posé sur AUJOURD'HUI ne contourne plus la garde (le
  // dispatcher date souvent le jour courant explicitement — c'est le trou
  // par lequel paul-untested16 T2 est passé).
  const localToday = String(
    (input.turn_frame.direct_effect_time_context as
      | { user_local_datetime?: string }
      | undefined)?.user_local_datetime ?? "",
  ).slice(0, 10);
  const dateHintIsTodayOrAbsent = !requested.date_hint ||
    (localToday.length === 10 && requested.date_hint === localToday);
  // P4-A (nina-p3reval R1-B02): « aussi / en plus » tranche la question que
  // cette garde pose — un marqueur additif explicite commit directement en
  // plus, sans clarify.
  if (
    !additiveIntent &&
    !intake.is_correction && input.last_track_commit &&
    input.last_track_commit.target_item_id !== requested.target_item_id &&
    input.last_track_commit.progress_status === requested.progress_status &&
    dateHintIsTodayOrAbsent
  ) {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: "target_switch_ambiguous",
      reply:
        `Juste pour être sûre d'enregistrer juste : "${item.title}", c'est EN PLUS de "${input.last_track_commit.target_title}" que je viens de noter, ou À LA PLACE ?`,
      requested_effects: requestedEffects,
      known_slots_extra: {
        retarget_from_candidate: input.last_track_commit.target_item_id,
        retarget_from_title: input.last_track_commit.target_title,
      },
    });
  }

  // nina-r7 B01 (arbitrage 2026-07-08): « j'ai avance » ≠ « j'ai fini ». Sur
  // un item tout-ou-rien, un report partiel n'a aucun etat intermediaire a
  // ecrire → question de confirmation, zero write. Garde ici (outcome
  // needs_clarify de premiere classe, re-armable au tour suivant via 3g) —
  // le double de db.ts reste en ceinture pour les autres chemins d'ecriture.
  const partialClarify = binaryItemPartialClarifyQuestion({
    status: requested.progress_status,
    item: {
      kind: item.kind,
      dimension: item.dimension,
      target_reps: item.target_reps ?? null,
      title: item.title,
    },
    fallbackTitle: requested.target_item_id,
  });
  if (partialClarify) {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: "partial_on_binary_item",
      reply: partialClarify.question,
      requested_effects: requestedEffects,
    });
  }

  // Invariant d'integrite d'evidence: un outcome oppose deja committe le meme
  // jour (daily review, dashboard, tour precedent) exige une correction
  // explicite (payload_hint.correction, contrat dispatcher 3h). Sans elle, on
  // demande confirmation au lieu d'ecrire une evidence contradictoire.
  if (input.same_day_evidence_check && !intake.is_correction) {
    const conflicting = await input.same_day_evidence_check({
      target_item_id: requested.target_item_id,
      progress_status: requested.progress_status,
      date_hint: requested.date_hint ?? null,
    });
    if (conflicting) {
      // Blocked, pas clarify (paul-r5 B02): la confirmation qu'un clarify
      // inviterait est inexecutable (pas d'override same-day en chat, V1) —
      // l'offrir creait une boucle morte T14→T15.
      return blockedResult({
        intent: "ignore",
        status: "blocked",
        reason_code: "contradicts_same_day_evidence",
        reply: renderTrackProgressContradictionClarification({
          target_title: item.title,
          existing_outcome: conflicting.outcome,
          requested_status: requested.progress_status,
        }),
        requested_effects: requestedEffects,
      });
    }
  }

  const allowed: TrackProgressRequestedEffect = {
    ...requested,
    target_title: item.title,
    // P7-F (paul-p6reval R1-B05b): « aujourd'hui » par défaut = la date
    // LOCALE USER (client_now_iso), jamais l'horloge serveur — un report du
    // 14/07 à 21h32 locale s'écrivait au 13/07 quand le serveur retardait.
    // Cohérence avec le fan-out multi-dates et les rappels (P3-B).
    date_hint: requested.date_hint ||
      (localToday.length === 10 ? localToday : requested.date_hint),
    // P3-C: retarget résolu automatiquement depuis le commit du tour
    // précédent quand le dispatcher a émis la correction à moitié.
    // P4-A: un retarget non résolu contre le plan ne part JAMAIS tel quel
    // (id LLM), et un tour additif ne porte ni retarget ni correction.
    retarget_from_item_id: additiveIntent
      ? null
      : effectiveRetargetFrom ?? null,
    correction: additiveIntent ? false : requested.correction,
  };
  // P4-B (rose-hard16 R1-B02, paul-p3verify R1-B02): liste EXPLICITE de
  // jours → une entrée PAR jour, confirmation = jours réellement committés.
  // Jamais combinée à un retarget. P5-C (rose-hard17 R1-B02): le gate
  // is_correction est TOMBÉ — une correction ADDITIVE de jours (« je l'ai
  // pas fait qu'aujourd'hui, note aussi hier et avant-hier ») est exactement
  // le cas multi-jours ; la substitution (« pas hier, plutôt avant-hier »)
  // est neutralisée PAR le resolver (jours niés exclus → <2 jours → nominal).
  const explicitDayList = !allowed.retarget_from_item_id
    ? resolveExplicitTrackDayList({
      message: input.message,
      user_local_date: localToday || null,
    })
    : null;
  if (explicitDayList && explicitDayList.length > 1) {
    const multiCommitted: TrackProgressCommittedEffect[] = [];
    const multiAllowed: TrackProgressRequestedEffect[] = [];
    for (const day of explicitDayList) {
      const dailyEffect: TrackProgressRequestedEffect = {
        ...allowed,
        date_hint: day,
      };
      multiAllowed.push(dailyEffect);
      const dailyExecution = await executeTrackProgressWrite({
        requested_effect: dailyEffect,
        user_id: input.turn_frame.user_id,
        idempotency_key: `${gate.idempotency_key}:${day}`,
        write_progress: input.write_progress,
      });
      if (dailyExecution.status === "committed") {
        multiCommitted.push({
          ...dailyExecution.committed_effect,
          date_hint: day,
        });
      } else if (dailyExecution.status === "already_logged") {
        // Le jour est déjà noté (autre message): l'état durable voulu existe,
        // il compte dans la confirmation sans ré-écriture.
        multiCommitted.push({
          type: "track_progress_plan_item",
          logged_progress_id: dailyExecution.existing_progress_id,
          target_item_id: allowed.target_item_id,
          target_title: allowed.target_title ?? "",
          progress_status: allowed.progress_status,
          value: allowed.value,
          date_hint: day,
        });
      }
    }
    if (multiCommitted.length === 0) {
      return blockedResult({
        intent: intake.intent,
        status: "failed",
        reason_code: "write_failed",
        requested_effects: requestedEffects,
        allowed_effects: multiAllowed,
      });
    }
    const statusLabel = allowed.progress_status === "missed"
      ? "raté"
      : allowed.progress_status === "partial"
      ? "partiel"
      : "fait";
    const dayLabels = multiCommitted.map((effect) => {
      const day = String(effect.date_hint ?? "");
      return `le ${day.slice(8, 10)}/${day.slice(5, 7)}`;
    });
    return enforceTrackProgressReplyInvariant({
      detected: true,
      intent: intake.intent,
      status: "logged",
      reply: `C'est noté : ${allowed.target_title} est marqué comme ${statusLabel} pour ${
        dayLabels.length
      } jours (${dayLabels.join(" et ")}).`,
      executed_tools: ["track_progress_plan_item"],
      requested_effects: requestedEffects,
      allowed_effects: multiAllowed,
      committed_effects: multiCommitted,
      blocked_effects: [],
      debug: {
        reason_code: "logged",
        gate_reason: null,
      },
    });
  }
  const execution = await executeTrackProgressWrite({
    requested_effect: allowed,
    user_id: input.turn_frame.user_id,
    idempotency_key: gate.idempotency_key,
    write_progress: input.write_progress,
  });
  if (execution.status === "failed") {
    return blockedResult({
      intent: intake.intent,
      status: "failed",
      reason_code: execution.reason_code,
      requested_effects: requestedEffects,
      allowed_effects: [allowed],
    });
  }
  if (execution.status === "already_logged") {
    // Le progres demande est deja en DB pour ce jour (autre message): rien de
    // re-ecrit. Le composeur confirme l'existant via le contexte de
    // confirmation au lieu de re-committer ou de nier (Paul r1 T15).
    return blockedResult({
      intent: intake.intent,
      reason_code: "already_tracked_today",
      requested_effects: requestedEffects,
      allowed_effects: [allowed],
    });
  }

  const committed = execution.committed_effect;
  // P4-A (rose-hard16 R1-B01): la moitié « retrait » du retarget devient
  // VISIBLE — titre de la source sur le committed (rendu) + entrée
  // superseded au ledger (comptabilité: l'invalidation n'est plus muette).
  if (committed.retarget_from_item_id) {
    committed.retarget_from_title = items.find((candidate) =>
      candidate.id === committed.retarget_from_item_id
    )?.title ?? null;
  }
  return enforceTrackProgressReplyInvariant({
    detected: true,
    intent: intake.intent,
    status: "logged",
    reply: renderTrackProgressLoggedReply(committed),
    executed_tools: ["track_progress_plan_item"],
    requested_effects: requestedEffects,
    allowed_effects: [allowed],
    committed_effects: [committed],
    blocked_effects: [],
    superseded_effects: committed.retarget_invalidated
      ? [{
        type: "track_progress_plan_item",
        reason_code: "superseded_by_retarget",
        target_item_id: committed.retarget_from_item_id ?? null,
        target_title: committed.retarget_from_title ?? null,
      }]
      : [],
    debug: {
      reason_code: "logged",
      gate_reason: null,
    },
  });
}

export function applyTrackProgressDirectEffectRuntimeState(args: {
  temp_memory: any;
  result: TrackProgressDirectEffectResult;
  source_message_id?: string | null;
}): TrackProgressRuntimeStateResult {
  const { temp_memory: tempMemory, result, source_message_id } = args;
  if (!result.detected || result.status === "ignored") {
    return { toolExecution: "none", executedTools: [] };
  }

  if (result.status === "logged") {
    const committed = result.committed_effects[0] ?? null;
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "logged",
      message: result.reply ?? "",
      target: committed?.target_title ?? "",
      status: committed?.progress_status ?? "",
      source_message_id: source_message_id ?? null,
      committed_effects: result.committed_effects,
      // P2-4a: fraîcheur en tours — la garde de bascule de cible ne regarde
      // que le commit du TOUR PRÉCÉDENT (vieilli par run.ts à chaque tour).
      committed_turns_ago: 0,
    };
    return {
      toolExecution: "success",
      executedTools: [...result.executed_tools],
    };
  }

  if (result.status === "needs_clarify") {
    const requestedSnapshot = result.requested_effects[0] ?? null;
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "needs_clarify",
      message: result.reply ??
        "Impossible de logger automatiquement. Oriente vers le dashboard pour mise a jour immediate, ou propose d'attendre le prochain bilan.",
      reason_code: result.debug.reason_code,
      source_message_id: source_message_id ?? null,
      // Slots deja etablis: le dispatcher peut re-emettre l'effet complete
      // quand le user repond a la clarification (chantier O4, eva-r2 B01).
      known_slots: requestedSnapshot || result.known_slots_extra
        ? {
          target_item_id: requestedSnapshot?.target_item_id ?? null,
          target_title: requestedSnapshot?.target_title ?? null,
          progress_status: requestedSnapshot?.progress_status ?? null,
          date_hint: requestedSnapshot?.date_hint ?? null,
          // P2-4a: cible d'origine candidate au retarget (« à la place »).
          ...(result.known_slots_extra ?? {}),
        }
        : null,
    };
    return { toolExecution: "blocked", executedTools: [] };
  }

  if (result.status === "failed") {
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "failed",
      reason_code: result.debug.reason_code,
      source_message_id: source_message_id ?? null,
    };
    return { toolExecution: "failed", executedTools: [] };
  }

  (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
    mode: "blocked",
    reason_code: result.debug.reason_code,
    source_message_id: source_message_id ?? null,
  };
  return { toolExecution: "blocked", executedTools: [] };
}

/**
 * Fenetre de re-arm (chantier O4): apres un needs_clarify, le tour suivant
 * peut completer l'ecriture si le user repond a la question. On expose la
 * clarification en attente au dispatcher global UNE seule fois (le tour
 * d'apres), avec les slots deja etablis pour qu'il re-emette l'effet complet.
 * Marque l'etat comme expose (mutation volontaire du runtime key, persistee
 * avec temp_memory) pour ne pas polluer les tours ulterieurs.
 */
export function pendingTrackProgressClarificationForDispatcher(
  tempMemory: unknown,
): {
  effect_type: "track_progress_plan_item";
  reason_code: string;
  clarify_question: string;
  known_slots: Record<string, unknown> | null;
} | null {
  const runtime = (tempMemory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY];
  if (!runtime || runtime.mode !== "needs_clarify") return null;
  if (runtime.clarification_exposed_to_dispatcher === true) return null;
  runtime.clarification_exposed_to_dispatcher = true;
  return {
    effect_type: "track_progress_plan_item",
    reason_code: String(runtime.reason_code ?? "needs_clarify"),
    clarify_question: String(runtime.message ?? ""),
    known_slots: runtime.known_slots &&
        typeof runtime.known_slots === "object"
      ? runtime.known_slots as Record<string, unknown>
      : null,
  };
}

/**
 * P2-4a (alex-untested R1-B01, 2e occurrence live): le dispatcher n'appliquait
 * pas 3h-bis (correction de cible émise SANS correction/retarget_from) — il
 * devait retrouver l'item corrigé en fouillant recent_messages. Ce fait
 * STRUCTURÉ (dernier commit track) rend la règle exécutable: retarget_from =
 * last_track_commit.target_item_id, fourni clé en main (même mécanique que
 * les known_slots du 3g).
 */
export function lastTrackCommitForDispatcher(
  tempMemory: unknown,
): {
  target_item_id: string;
  target_title: string;
  progress_status: string;
} | null {
  const runtime = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] as
      | Record<string, unknown>
      | undefined;
  if (!runtime || runtime.mode !== "logged") return null;
  const committed = Array.isArray(runtime.committed_effects)
    ? runtime.committed_effects[0] as Record<string, unknown> | undefined
    : undefined;
  const targetItemId = String(committed?.target_item_id ?? "").trim();
  if (!targetItemId) return null;
  return {
    target_item_id: targetItemId,
    target_title: String(committed?.target_title ?? ""),
    progress_status: String(committed?.progress_status ?? ""),
  };
}

/** Le dernier commit track s'il date du TOUR PRÉCÉDENT (fraîcheur 1 tour). */
export function freshLastTrackCommit(
  tempMemory: unknown,
): {
  target_item_id: string;
  target_title: string;
  progress_status: string;
} | null {
  const runtime = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] as
      | Record<string, unknown>
      | undefined;
  if (Number(runtime?.committed_turns_ago ?? Number.NaN) !== 0) return null;
  return lastTrackCommitForDispatcher(tempMemory);
}

/**
 * P2-4a: vieillissement du marqueur de commit — appelé par run.ts en fin de
 * tour (mutation in-place, seule forme qui survit à la reconstruction de
 * temp_memory par le companion). Un tour qui re-committe re-pose 0.
 */
export function ageLastTrackCommitMarker(
  tempMemory: unknown,
  currentSourceMessageId: string | null,
): void {
  const runtime = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] as
      | Record<string, unknown>
      | undefined;
  if (!runtime || runtime.mode !== "logged") return;
  const commitSource = String(runtime.source_message_id ?? "");
  if (currentSourceMessageId && commitSource === currentSourceMessageId) {
    return;
  }
  runtime.committed_turns_ago =
    Number(runtime.committed_turns_ago ?? 0) + 1;
}

export function applyTrackProgressDirectEffectFailureState(args: {
  temp_memory: any;
  source_message_id?: string | null;
  reason_code?: string | null;
}): TrackProgressRuntimeStateResult {
  (args.temp_memory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
    mode: "failed",
    reason_code: args.reason_code ?? "track_progress_direct_effect_failed",
    source_message_id: args.source_message_id ?? null,
  };
  return { toolExecution: "failed", executedTools: [] };
}

export async function maybeRunTrackProgressPlanItemRuntime(
  input: TrackProgressPlanItemRuntimeInput,
): Promise<TrackProgressRuntimeStateResult> {
  if (!input.turn_frame) {
    return { toolExecution: "none", executedTools: [] };
  }
  const turnFrame = input.turn_frame;
  if (input.skip_reason_code) {
    return { toolExecution: "none", executedTools: [] };
  }

  const sourceMessageId = input.source_message_id ??
    turnFrame.source_message_id;
  const alreadyLogged =
    (input.temp_memory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
      ?.source_message_id &&
    sourceMessageId &&
    (input.temp_memory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
        .source_message_id ===
      sourceMessageId;
  if (alreadyLogged) return { toolExecution: "none", executedTools: [] };

  try {
    const previousSourceMessageId = String(
      (input.temp_memory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
        ?.source_message_id ?? "",
    ).trim();
    const result = await runTrackProgressPlanItemDirectEffect({
      turn_frame: turnFrame,
      message: input.message,
      plan_snapshot: input.plan_snapshot,
      db_idempotency_check: input.db_idempotency_check,
      same_day_evidence_check: input.same_day_evidence_check,
      no_mutation_requested: input.no_mutation_requested,
      blocked_reason_code: input.blocked_reason_code,
      last_track_commit: input.last_track_commit ??
        freshLastTrackCommit(input.temp_memory),
      write_progress: input.write_progress,
      recent_writes_idempotency: input.recent_writes_idempotency ?? {
        source_message_ids: previousSourceMessageId
          ? [previousSourceMessageId]
          : [],
      },
    });
    return applyTrackProgressDirectEffectRuntimeState({
      temp_memory: input.temp_memory,
      result,
      source_message_id: sourceMessageId,
    });
  } catch (_error) {
    return applyTrackProgressDirectEffectFailureState({
      temp_memory: input.temp_memory,
      source_message_id: sourceMessageId,
      reason_code: "track_progress_direct_effect_failed",
    });
  }
}

export async function runTrackProgressPlanItemFromWeeklyCorrection(args: {
  user_id: string;
  target_item_id: string;
  target_title: string;
  progress_status: "completed" | "missed" | "partial";
  value: number;
  date_hint?: string | null;
  source_message_id: string;
  write_progress: TrackProgressWrite;
}): Promise<TrackProgressDirectEffectResult> {
  const requested: TrackProgressRequestedEffect = {
    type: "track_progress_plan_item",
    target_item_id: args.target_item_id,
    target_title: args.target_title,
    progress_status: args.progress_status,
    value: args.value,
    date_hint: args.date_hint ?? null,
    source_message_id: args.source_message_id,
  };
  const execution = await executeTrackProgressWrite({
    requested_effect: requested,
    user_id: args.user_id,
    idempotency_key: `weekly:${args.source_message_id}:${args.target_item_id}:${
      args.date_hint ?? "none"
    }`,
    write_progress: args.write_progress,
  });
  if (execution.status === "committed") {
    const committed = execution.committed_effect;
    return enforceTrackProgressReplyInvariant({
      detected: true,
      intent: intentForProgressStatus(args.progress_status),
      status: "logged",
      reply: null,
      executed_tools: [],
      requested_effects: [requested],
      allowed_effects: [requested],
      committed_effects: [committed],
      blocked_effects: [],
      debug: { reason_code: "weekly_correction_logged" },
    });
  }
  if (execution.status === "already_logged") {
    // Commit idempotent: l'evidence demandee existe deja pour (item, jour,
    // outcome) — on l'expose comme preuve au lieu de re-ecrire.
    const committed: TrackProgressCommittedEffect = {
      type: "track_progress_plan_item",
      logged_progress_id: execution.existing_progress_id,
      target_item_id: args.target_item_id,
      target_title: args.target_title,
      progress_status: args.progress_status,
      value: args.value,
    };
    return enforceTrackProgressReplyInvariant({
      detected: true,
      intent: intentForProgressStatus(args.progress_status),
      status: "logged",
      reply: null,
      executed_tools: [],
      requested_effects: [requested],
      allowed_effects: [requested],
      committed_effects: [committed],
      blocked_effects: [],
      debug: { reason_code: "weekly_correction_already_logged" },
    });
  }
  return blockedResult({
    intent: "ignore",
    status: "failed",
    reason_code: execution.reason_code,
    requested_effects: [requested],
    allowed_effects: [requested],
  });
}
