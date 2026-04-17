import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import {
  buildPhase1Context,
  loadPhase1GenerationContext,
  mergePhase1Payload,
} from "../_shared/v2-phase1.ts";
import { extractStructuredCalibrationFields } from "../_shared/v2-calibration-fields.ts";
import {
  buildDefenseCardUserPrompt,
  DEFENSE_CARD_SYSTEM_PROMPT,
  validateDefenseCardOutput,
} from "../_shared/v2-prompts/defense-card.ts";
import { buildLabSurfaceUserPrompt } from "../_shared/v2-prompts/lab-surfaces.ts";
import { loadLabScopeContext } from "../_shared/v2-lab-context.ts";
import type { AttackCardContent, DefenseCardContent } from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
});

class PreparePhase1LabError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PreparePhase1LabError";
    this.status = status;
  }
}

const DEFENSE_PACK_SYSTEM_PROMPT = `${DEFENSE_CARD_SYSTEM_PROMPT}

Tu ne dois pas générer une seule carte mais EXACTEMENT 3 cartes candidates.

Objectif:
- proposer 3 angles de defense distincts et crédibles pour les premiers jours du plan
- chaque carte doit être assez différente pour donner un vrai choix à l'utilisateur
- les 3 cartes doivent toutes rester très pertinentes pour la transformation active

Différenciation obligatoire:
- une carte peut être plus orientée environnement / friction
- une autre peut être plus orientée fatigue / charge mentale / récupération
- une autre peut être plus orientée pensées automatiques / auto-négociation / émotion
- adapte ces angles au cas réel, sans forcer ces mots si un autre découpage est plus juste
- les 3 cartes doivent rester centrées sur la transformation active
- n'injecte pas les autres transformations du cycle dans plusieurs cartes
- exception rare: si un autre sujet est un obstacle massif et evident pour cette transformation, tu peux le mentionner sur UNE seule carte maximum

Retourne uniquement un JSON valide:
{
  "cards": [
    {
      "title": "Nom court de la carte",
      "rationale": "Pourquoi cette carte peut parler a l'utilisateur maintenant",
      "content": {
        "impulses": [
          {
            "impulse_id": "impulse-1",
            "label": "Nom court",
            "triggers": [
              {
                "trigger_id": "trigger-1-1",
                "label": "Nom court",
                "situation": "...",
                "signal": "...",
                "defense_response": "...",
                "plan_b": "..."
              }
            ],
            "generic_defense": "..."
          }
        ]
      }
    }
  ]
}`;

const ATTACK_PACK_SYSTEM_PROMPT = `Tu conçois les cartes d'attaque Sophia pour le démarrage d'un plan.

Tu dois générer EXACTEMENT 3 cartes d'attaque candidates.

Une carte d'attaque:
- sert a prendre de l'avance
- installe des objets, gestes ou dispositifs concrets
- ne sert pas a reagir a chaud, mais a rendre l'action plus probable avant que la friction monte

Tu disposes de ce catalogue de techniques:
- texte_recadrage
- mantra_force
- ancre_visuelle
- visualisation_matinale
- preparer_terrain
- pre_engagement

Pour chaque carte candidate:
- donne un titre court
- donne une rationale courte
- donne un summary court
- choisis exactement 3 technique_keys distinctes
- les 3 cartes doivent être suffisamment différentes entre elles
- les 3 cartes doivent rester strictement centrées sur la transformation active
- n'injecte pas les autres transformations du cycle dans plusieurs cartes
- exception rare: si un autre sujet est un obstacle massif et evident pour cette transformation, tu peux le mentionner sur UNE seule carte maximum

Retourne uniquement un JSON valide:
{
  "cards": [
    {
      "title": "Nom court",
      "rationale": "Pourquoi cette carte colle bien au démarrage",
      "summary": "Utilité courte et concrète",
      "technique_keys": ["preparer_terrain", "visualisation_matinale", "pre_engagement"]
    }
  ]
}`;

const ATTACK_TECHNIQUE_CATALOG = {
  texte_recadrage: {
    technique_key: "texte_recadrage",
    title: "Le texte magique",
    pour_quoi:
      "Faire disparaitre le combat interieur quand tu commences a te trouver des excuses ou a negocier avec toi-meme.",
    objet_genere:
      "Un texte a ecrire jusqu'a ce que le combat baisse et que l'action redevienne evidente.",
    questions: [
      "Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?",
      "Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?",
      "Dans quel etat tu veux te remettre en ecrivant ce texte ?",
    ],
    mode_emploi:
      "Ecris-le au moment ou tu sens la resistance monter, jusqu'a ce que ce soit moins un combat.",
  },
  mantra_force: {
    technique_key: "mantra_force",
    title: "Mantra de force",
    pour_quoi:
      "Installer doucement plus de force interieure face a ce que tu as a faire, au lieu d'attendre d'etre fort sur le moment.",
    objet_genere:
      "Une phrase a te repeter pour faire evoluer peu a peu ton rapport a l'action.",
    questions: [
      "Par rapport a quelle action ou quel effort tu veux devenir plus solide ?",
      "Pourquoi c'est important pour toi d'arreter de reculer la-dessus ?",
      "Tu veux un mantra plutot calme, noble ou percutant ?",
    ],
    mode_emploi:
      "Repete-le trois fois le matin, ou matin midi et soir si tu veux l'ancrer plus fort.",
  },
  ancre_visuelle: {
    technique_key: "ancre_visuelle",
    title: "Ancre visuelle",
    pour_quoi:
      "Utiliser ton environnement consciemment pour qu'il te rappelle les engagements que tu as pris envers toi-meme.",
    objet_genere:
      "Un repere visuel simple a utiliser, avec une phrase a te dire quand tu le vois.",
    questions: [
      "Quel engagement envers toi-meme tu veux garder vivant ?",
      "Dans quel lieu ou sur quel objet tu pourrais l'accrocher a ton quotidien ?",
      "Quelle phrase courte devrait revenir quand tu le vois ?",
    ],
    mode_emploi:
      "Place-la dans ton environnement pour qu'elle te recadre naturellement quand ton regard tombe dessus.",
  },
  visualisation_matinale: {
    technique_key: "visualisation_matinale",
    title: "Meditation de 5 minutes",
    pour_quoi:
      "Installer une image mentale claire et calme du bon comportement avant que la journee, les excuses ou la friction prennent toute la place.",
    objet_genere:
      "Une courte meditation guidee pour te visualiser en train de faire l'action de facon naturelle.",
    questions: [
      "Quelle action ou habitude tu veux te voir faire naturellement ?",
      "A quel moment du matin pourrais-tu prendre 5 minutes pour te projeter calmement ?",
      "Quelles sensations ou images t'aideraient a te voir deja en train de faire l'action ?",
    ],
    mode_emploi:
      "Prends 5 minutes le matin pour te visualiser en train de faire l'action de facon calme, concrete et deja normale pour toi.",
  },
  preparer_terrain: {
    technique_key: "preparer_terrain",
    title: "Preparer le terrain",
    pour_quoi: "Installer les bonnes conditions avant que la friction n'arrive.",
    objet_genere:
      "Un environnement qui t'invite a faire la bonne chose quand le moment arrive.",
    questions: [
      "Par rapport a quelle action tu veux te rendre la vie plus simple ?",
      "Qu'est-ce que tu pourrais preparer en avance pour enlever de la friction ?",
      "Quand le moment arrive, qu'est-ce qui devrait deja etre pret autour de toi ?",
    ],
    mode_emploi:
      "Prepare le terrain suffisamment tot pour que le bon geste devienne plus simple.",
  },
  pre_engagement: {
    technique_key: "pre_engagement",
    title: "Mot de bascule",
    pour_quoi:
      "Avoir un mot simple a envoyer pour que Sophia comprenne tout de suite que tu es dans un moment ou tu peux craquer et t'aide a tenir.",
    objet_genere:
      "Un mot-cle memorisable et un mini protocole de bascule a envoyer seul quand la tension monte.",
    questions: [
      "Dans quelle situation precise tu sens que tu vas craquer ou perdre le controle ?",
      "Quand tu tiens bon dans ce moment-la, qu'est-ce que tu proteges de vraiment important chez toi ?",
    ],
    mode_emploi:
      "Des que tu sens que ca devient tendu, envoie seulement le mot-cle. Sophia recupere le contexte et t'aide immediatement a tenir.",
  },
} satisfies Record<string, AttackCardContent["techniques"][number]>;

export async function preparePhase1Lab(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
  requestId?: string;
}) {
  const context = await loadPhase1GenerationContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
  });

  const now = new Date().toISOString();
  const phase1Context = context.phase1?.context ?? buildPhase1Context({
    cycle: context.cycle,
    transformation: context.transformation,
    planRow: context.planRow,
    now,
  });
  if (!phase1Context) {
    throw new PreparePhase1LabError(500, "Failed to build phase 1 context");
  }

  if (
    context.phase1?.lab?.defense_candidates?.length === 3 &&
    context.phase1?.lab?.attack_candidates?.length === 3
  ) {
    return {
      phase1: context.phase1,
      defense_card_id: context.phase1.lab.defense_card_id,
      attack_card_id: context.phase1.lab.attack_card_id,
      support_card_id: context.phase1.lab.support_card_id,
      support_card_suggested: context.phase1.lab.support_card_suggested,
      support_card_reason: context.phase1.lab.support_card_reason,
    };
  }

  const [defenseCards, attackCards] = await Promise.all([
    generateDefenseCardPack({
      admin: args.admin,
      userId: args.userId,
      transformationId: args.transformationId,
      requestId: args.requestId,
    }),
    generateAttackCardPack({
      admin: args.admin,
      userId: args.userId,
      transformationId: args.transformationId,
      requestId: args.requestId,
    }),
  ]);

  const supportSuggested = false;
  const supportReason = "La phase 1 du labo se concentre maintenant sur la defense et l'attaque.";

  const handoffPayload = mergePhase1Payload({
    handoffPayload: context.transformation.handoff_payload,
    context: phase1Context,
    lab: {
      prepared_at: now,
      defense_revealed_at: null,
      attack_revealed_at: null,
      support_card_suggested: supportSuggested,
      support_card_reason: supportReason,
      defense_card_id: null,
      attack_card_id: null,
      support_card_id: null,
      defense_candidates: defenseCards.map((card) => ({
        card_id: card.card_id,
        title: card.title,
        rationale: card.rationale,
        selection_state: "pending" as const,
      })),
      attack_candidates: attackCards.map((card) => ({
        card_id: card.card_id,
        title: card.title,
        rationale: card.rationale,
        selection_state: "pending" as const,
      })),
    },
    runtime: {
      defense_card_ready: false,
      attack_card_ready: false,
      support_card_ready: false,
    },
    now,
  });

  const { data, error } = await args.admin
    .from("user_transformations")
    .update({
      handoff_payload: handoffPayload,
      updated_at: now,
    })
    .eq("id", args.transformationId)
    .select("handoff_payload")
    .single();

  if (error) {
    throw new PreparePhase1LabError(500, `Failed to persist phase 1 lab: ${error.message}`, {
      cause: error,
    });
  }

  return {
    phase1: (data as { handoff_payload: Record<string, unknown> }).handoff_payload.phase_1,
    defense_card_id: null,
    attack_card_id: null,
    support_card_id: null,
    support_card_suggested: supportSuggested,
    support_card_reason: supportReason,
  };
}

async function generateDefenseCardPack(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
  requestId?: string;
}): Promise<Array<{ card_id: string; title: string; rationale: string | null }>> {
  const labContext = await loadLabScopeContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
    scopeKind: "transformation",
  });
  const transformationContext = await loadPhase1GenerationContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
  });
  const calibration = extractStructuredCalibrationFields(
    labContext.questionnaire_answers ?? {},
    transformationContext.transformation.questionnaire_schema,
  );

  const raw = await generateWithGemini(
    DEFENSE_PACK_SYSTEM_PROMPT,
    `${buildDefenseCardUserPrompt({
      transformation_title: labContext.transformation_title,
      user_summary: labContext.user_summary,
      focus_context: labContext.free_text,
      questionnaire_answers: labContext.questionnaire_answers,
      calibration: {
        struggle_duration: calibration.struggle_duration,
        main_blocker: calibration.main_blocker,
        perceived_difficulty: calibration.perceived_difficulty,
        probable_drivers: calibration.probable_drivers,
        prior_attempts: calibration.prior_attempts,
        self_confidence: calibration.self_confidence,
      },
      plan_strategy: {
        identity_shift: labContext.plan_strategy.identity_shift,
        core_principle: labContext.plan_strategy.core_principle,
      },
    })}

Génère maintenant exactement 3 cartes candidates bien différenciées.`,
    0.45,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "prepare-phase-1-lab-v1:defense-pack",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 35_000,
    },
  );

  if (typeof raw !== "string") {
    throw new PreparePhase1LabError(500, "Defense pack generation returned a tool call");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new PreparePhase1LabError(500, "Defense pack generation returned invalid JSON", {
      cause: error,
    });
  }

  const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const cards = Array.isArray(root?.cards) ? root.cards : [];
  if (cards.length !== 3) {
    throw new PreparePhase1LabError(500, "Defense pack must contain exactly 3 cards");
  }

  const now = new Date().toISOString();
  const payloads = cards.map((candidate, index) => {
    const row = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : null;
    const title = String(row?.title ?? "").trim() || `Carte de defense ${index + 1}`;
    const rationale = typeof row?.rationale === "string" ? row.rationale.trim() : null;
    const validation = validateDefenseCardOutput(row?.content);
    if (!validation.valid || !validation.content) {
      throw new PreparePhase1LabError(
        500,
        `Defense candidate ${index + 1} failed validation: ${validation.issues.join(", ")}`,
      );
    }
    return {
      user_id: args.userId,
      cycle_id: labContext.cycle_id,
      scope_kind: "transformation",
      transformation_id: args.transformationId,
      content: validation.content as DefenseCardContent,
      metadata: {
        phase1_flow: true,
        candidate_type: "defense",
        candidate_index: index + 1,
        title,
        rationale,
        selection_state: "pending",
      },
      generated_at: now,
      last_updated_at: now,
    };
  });

  const { data, error } = await args.admin
    .from("user_defense_cards")
    .insert(payloads as any)
    .select("id, metadata");
  if (error) {
    throw new PreparePhase1LabError(500, `Failed to insert defense pack: ${error.message}`, {
      cause: error,
    });
  }

  return ((data as Array<{ id: string; metadata: Record<string, unknown> }>) ?? []).map((row) => ({
    card_id: row.id,
    title: String(row.metadata?.title ?? "Carte de defense").trim(),
    rationale: typeof row.metadata?.rationale === "string" ? row.metadata.rationale : null,
  }));
}

async function generateAttackCardPack(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
  requestId?: string;
}): Promise<Array<{ card_id: string; title: string; rationale: string | null }>> {
  const labContext = await loadLabScopeContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
    scopeKind: "transformation",
  });

  const raw = await generateWithGemini(
    ATTACK_PACK_SYSTEM_PROMPT,
    `${buildLabSurfaceUserPrompt(labContext)}

Conçois maintenant exactement 3 cartes d'attaque candidates pour le démarrage de phase 1.
Fais des cartes différentes, chacune avec exactement 3 techniques.`,
    0.35,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "prepare-phase-1-lab-v1:attack-pack",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 35_000,
    },
  );

  if (typeof raw !== "string") {
    throw new PreparePhase1LabError(500, "Attack pack generation returned a tool call");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new PreparePhase1LabError(500, "Attack pack generation returned invalid JSON", {
      cause: error,
    });
  }

  const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const cards = Array.isArray(root?.cards) ? root.cards : [];
  if (cards.length !== 3) {
    throw new PreparePhase1LabError(500, "Attack pack must contain exactly 3 cards");
  }

  const now = new Date().toISOString();
  const payloads = cards.map((candidate, index) => {
    const row = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : null;
    const title = String(row?.title ?? "").trim() || `Carte d'attaque ${index + 1}`;
    const rationale = typeof row?.rationale === "string" ? row.rationale.trim() : null;
    const summary = String(row?.summary ?? "").trim() || title;
    const keys = Array.isArray(row?.technique_keys)
      ? row.technique_keys.filter((item): item is keyof typeof ATTACK_TECHNIQUE_CATALOG =>
        typeof item === "string" && item in ATTACK_TECHNIQUE_CATALOG
      )
      : [];
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length !== 3) {
      throw new PreparePhase1LabError(
        500,
        `Attack candidate ${index + 1} must contain exactly 3 distinct techniques`,
      );
    }
    return {
      user_id: args.userId,
      cycle_id: labContext.cycle_id,
      scope_kind: "transformation",
      transformation_id: args.transformationId,
      phase_id: null,
      source: "system",
      status: "suggested",
      content: {
        summary,
        techniques: uniqueKeys.map((key) => ({
          ...ATTACK_TECHNIQUE_CATALOG[key],
          generated_result: null,
        })),
      } satisfies AttackCardContent,
      metadata: {
        phase1_flow: true,
        candidate_type: "attack",
        candidate_index: index + 1,
        title,
        rationale,
        selection_state: "pending",
      },
      generated_at: now,
      last_updated_at: now,
    };
  });

  const { data, error } = await args.admin
    .from("user_attack_cards")
    .insert(payloads as any)
    .select("id, metadata");
  if (error) {
    throw new PreparePhase1LabError(500, `Failed to insert attack pack: ${error.message}`, {
      cause: error,
    });
  }

  return ((data as Array<{ id: string; metadata: Record<string, unknown> }>) ?? []).map((row) => ({
    card_id: row.id,
    title: String(row.metadata?.title ?? "Carte d'attaque").trim(),
    rationale: typeof row.metadata?.rationale === "string" ? row.metadata.rationale : null,
  }));
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(req, { error: "Missing Authorization header", request_id: requestId }, { status: 401 });
    }

    const env = getSupabaseEnv();
    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await preparePhase1Lab({
      admin,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      ...result,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "prepare-phase-1-lab-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "prepare-phase-1-lab-v1" },
    });

    if (error instanceof PreparePhase1LabError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to prepare phase 1 lab");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new PreparePhase1LabError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
