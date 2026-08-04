/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithVision, resolveVisionModel } from "../_shared/vision.ts";
import {
  buildMealAnalysisPrompt,
  buildRecognizedPayload,
  type MealAnalysisCommitmentContext,
  MEAL_ANALYSIS_PROMPT_VERSION,
  mealDisqualification,
  parseMealAnalysis,
  renderMealPhotoAck,
  resolveFoodGroupCredit,
  resolveMealPhotoBinding,
  studentBindingIn,
} from "../_shared/keel/meal_analysis.ts";
import { dayTokenForLocalDate } from "../_shared/keel/slot_reminders.ts";
import { parseDayToken } from "../_shared/keel/tokens.ts";
import {
  ASSUMPTION_SUBJECT_TO_AXIS,
  gateMealPrecisionQuestion,
  type MealPrecisionAxis,
} from "../_shared/keel/meal_precision.ts";
import {
  countMealPrecisionQuestionsToday,
  recordMealPrecisionQuestion,
} from "../_shared/keel/meal_precision_cap.ts";

/**
 * L'AXE DE LA QUESTION PHOTO, dans le vocabulaire UNIFIÉ (§P5.3).
 *
 * `ASSUMPTION_SUBJECTS` (photo) et les axes de précision (texte) décrivaient la
 * même chose avec deux mots: `cooking_fat` et `preparation` sont le même manque.
 * Le mapping vit dans `meal_precision.ts`, avec un test qui tombe si un sujet
 * photo apparaît sans axe — c'est ce qui empêche les deux vocabulaires de
 * repartir chacun de leur côté.
 *
 * Sans hypothèse mappable, l'axe est `composition`: c'est le cas de l'image
 * dégradée, où ce qui manque est le contenu de l'assiette lui-même.
 */
function photoPrecisionAxis(
  analysis: { assumptions: ReadonlyArray<{ subject: string }> },
): MealPrecisionAxis {
  for (const assumption of analysis.assumptions ?? []) {
    const axis = ASSUMPTION_SUBJECT_TO_AXIS[assumption.subject];
    if (axis) return axis;
  }
  return "composition";
}

/**
 * KEEL W5 — `analyze-meal-photo-v1`: what is on the plate, against the plan.
 *
 * Authority: docs/keel/CONTRACT.md NON-INPUT #4, docs/keel/BUILD_PLAN.md W5.3.
 *
 * ONE PHOTO IN (already stored and already logged), ONE ROW UPDATED OUT:
 * `protocol_events.recognized` + `.recognition_confidence` + `.food_group_ref`
 * + `.portion_band`. This function does
 * not create the fact and does not delete it -- both callers
 * (`meal-photo-upload-v1` for the web, `handlers_meal_photo.ts` for WhatsApp)
 * write the row first, precisely so that a vision failure costs the analysis and
 * never the evidence. A saved photo with no verdict beats a lost photo.
 *
 * WHAT IT REFUSES TO PRODUCE (non-input #4, restated because this is the file
 * where the temptation lives): no calories, no macros, no gram weight, no
 * `quantity`, no `unit`. `_shared/keel/meal_analysis.ts` owns the two filters
 * and its tests own the proof; this file's job is to hold the allowlist
 * (`the day's commitments`) and to never write anything the parser did not
 * return.
 *
 * WHAT IT DOES WRITE, and why it is not a violation: `food_group_ref`. Both
 * upload paths insert the fact with that column NULL, because at insert time
 * nothing has been read from the image yet. This is the only place that knows
 * BOTH what is on the plate AND what the day's plan asks for, so it is the only
 * place that can credit a photo by its content -- `resolveFoodGroupCredit`.
 * D1: the group WRITTEN is the group SEEN (the plan only breaks a tie between
 * several detected groups, because the column holds one), and the swap
 * arithmetic stays the evaluator's. An identity is not a measurement: the
 * evaluator still gets no number from an image.
 *
 * THE WRITE IS UNCONDITIONAL, including to NULL. A `force: true` re-analysis
 * whose new reading credits nothing must CLEAR a credit the previous reading
 * left behind. A write-through that only ever adds is how a stale fact outlives
 * the analysis that produced it.
 *
 * IDEMPOTENCE: a re-run on an already-analyzed event is a no-op that returns the
 * stored reading (`status: "already_analyzed"`). The predicate is a re-read of
 * the row, not an in-memory flag -- a cron retry, a webhook redelivery and a
 * manual replay all cost zero model calls. `force: true` re-analyzes on purpose
 * (prompt version bump, benchmark re-run).
 *
 * WRITE-THROUGH: the UPDATE selects the row back and the response is built from
 * what the database returned. If the read-back does not carry the analysis
 * version we just wrote, the function fails loudly instead of announcing a
 * verdict that is not on file.
 */

const COMMITMENT_COLUMNS = [
  "id",
  "title",
  "student_instruction",
  "polarity",
  "activity_class",
  "slot_key",
  "measure",
  "unit",
  "target_op",
  "target_min",
  "target_max",
  "food_group_ref",
  "substance_ref",
  "evaluation_grain",
  "scheduled_days",
  "autonomy",
  "priority",
  "status",
  "content",
].join(", ");

const EVENT_COLUMNS = [
  "id",
  "user_id",
  "local_date",
  "slot_key",
  "source",
  "media_path",
  "food_group_ref",
  "portion_band",
  "recognized",
  "recognition_confidence",
  // Relu pour la même raison que `food_group_ref`: l'accusé annonce à l'élève
  // que sa photo ne compte pas, et cette phrase doit reposer sur ce que la
  // BASE porte, pas sur ce que l'analyse a décidé.
  "disqualified_reason",
  // Lu pour rendre l'accusé dans la langue de la ligne, plutôt que dans une
  // constante en dur au point d'appel.
  "content_locale",
].join(", ");

const MEAL_PHOTO_BUCKET = "meal-photos";
const VISION_TIMEOUT_MS = 60_000;
/** Low but non-zero: identification benefits from a little sampling; the JSON
 *  shape is enforced by the parser, not by temperature. */
const VISION_TEMPERATURE = 0.1;

type EventRow = {
  id: string;
  user_id: string;
  local_date: string;
  slot_key: string | null;
  source: string;
  media_path: string | null;
  food_group_ref: string | null;
  portion_band: string | null;
  recognized: Record<string, unknown> | null;
  recognition_confidence: number | null;
  disqualified_reason: string | null;
  content_locale: string | null;
};

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Is this commitment on the plan for that weekday?
 *
 * Mirrors `todayModel.isScheduledOn` and `slot_reminders.isSlotReminderDueToday`:
 * a null or empty `scheduled_days` means every day (the CHECK constrains the
 * values, not the presence). Week-grain lines are KEPT here, unlike in the
 * reminder derivation: "fatty fish 3x/week" is exactly the kind of line a photo
 * can evidence, and excluding it would push the model to bind its salmon to a
 * daily line instead.
 *
 * R7: an unparseable day token throws. A French weekday in `scheduled_days`
 * must not silently drop a commitment out of the allowlist -- the model would
 * then see a plate matching a line it cannot name, and invent an id.
 */
function isOnPlanForDay(row: Record<string, unknown>, dayToken: string): boolean {
  if (cleanText(row.status) !== "active") return false;
  const days = row.scheduled_days;
  if (!Array.isArray(days) || days.length === 0) return true;
  return days.map((d) => parseDayToken(d)).includes(parseDayToken(dayToken));
}

function toCommitmentContext(
  row: Record<string, unknown>,
): MealAnalysisCommitmentContext {
  const content = row.content;
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    student_instruction: row.student_instruction === null ||
        row.student_instruction === undefined
      ? null
      : String(row.student_instruction),
    polarity: String(row.polarity ?? ""),
    activity_class: String(row.activity_class ?? ""),
    slot_key: row.slot_key === null || row.slot_key === undefined
      ? null
      : String(row.slot_key),
    measure: String(row.measure ?? ""),
    unit: row.unit === null || row.unit === undefined ? null : String(row.unit),
    target_op: String(row.target_op ?? ""),
    target_min: row.target_min === null || row.target_min === undefined
      ? null
      : Number(row.target_min),
    target_max: row.target_max === null || row.target_max === undefined
      ? null
      : Number(row.target_max),
    food_group_ref: row.food_group_ref === null || row.food_group_ref === undefined
      ? null
      : String(row.food_group_ref),
    substance_ref: row.substance_ref === null || row.substance_ref === undefined
      ? null
      : String(row.substance_ref),
    evaluation_grain: String(row.evaluation_grain ?? ""),
    autonomy: String(row.autonomy ?? ""),
    priority: String(row.priority ?? ""),
    content: content && typeof content === "object" && !Array.isArray(content)
      ? content as Record<string, unknown>
      : null,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on a
  // multi-megabyte photo (a real crash, not a theoretical one).
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The stored analysis of a previous run, or null. */
function storedAnalysisVersion(recognized: unknown): string | null {
  if (!recognized || typeof recognized !== "object") return null;
  const version = (recognized as Record<string, unknown>).analysis_version;
  return typeof version === "string" && version.trim() !== "" ? version : null;
}

// The student's own binding (`studentBindingIn`) lives in _shared so that both
// its write and its read are one decision. It outranks the model's reading and
// it survives `force: true` -- see the comment on `buildRecognizedPayload`.

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const eventId = cleanText(body.protocol_event_id);
    if (!eventId) {
      return jsonResponse(req, {
        ok: false,
        error: "protocol_event_id is required",
        request_id: requestId,
      }, { status: 400, includeCors: false });
    }
    const force = body.force === true;

    const admin = adminClient();

    // ---- 1. the fact this analysis is ABOUT ------------------------------
    const eventRead = await admin
      .from("protocol_events")
      .select(EVENT_COLUMNS)
      .eq("id", eventId)
      .maybeSingle();
    if (eventRead.error) {
      throw new Error(`protocol_events read failed: ${eventRead.error.message}`);
    }
    const event = eventRead.data as EventRow | null;
    if (!event) {
      return jsonResponse(req, {
        ok: false,
        error: `protocol_events ${eventId} not found`,
        request_id: requestId,
      }, { status: 404, includeCors: false });
    }
    if (event.source !== "photo") {
      // R7: analyzing a non-photo fact would write a vision verdict onto a
      // typed text/tap event. Loud refusal, not a silent skip.
      return jsonResponse(req, {
        ok: false,
        error: `protocol_events ${eventId} has source='${event.source}', expected 'photo'`,
        request_id: requestId,
      }, { status: 400, includeCors: false });
    }

    // ---- 2. idempotence, decided on a re-read row -------------------------
    const alreadyVersion = storedAnalysisVersion(event.recognized);
    if (alreadyVersion !== null && !force) {
      return jsonResponse(req, {
        ok: true,
        status: "already_analyzed",
        event_id: event.id,
        analysis_version: alreadyVersion,
        recognized: event.recognized,
        recognition_confidence: event.recognition_confidence,
        request_id: requestId,
      }, { includeCors: false });
    }

    // ---- 3. the day's prescription = THE allowlist ------------------------
    const planRead = await admin
      .from("plan_versions")
      .select("id, timezone")
      .eq("student_id", event.user_id)
      .eq("status", "published")
      .maybeSingle();
    if (planRead.error) {
      throw new Error(`plan_versions read failed: ${planRead.error.message}`);
    }
    const planVersion = planRead.data as { id: string; timezone: string } | null;

    let commitments: MealAnalysisCommitmentContext[] = [];
    if (planVersion) {
      const commitmentsRead = await admin
        .from("plan_commitments")
        .select(COMMITMENT_COLUMNS)
        .eq("plan_version_id", planVersion.id)
        .eq("status", "active");
      if (commitmentsRead.error) {
        throw new Error(
          `plan_commitments read failed: ${commitmentsRead.error.message}`,
        );
      }
      const dayToken = dayTokenForLocalDate(event.local_date);
      commitments = ((commitmentsRead.data ?? []) as Record<string, unknown>[])
        .filter((row) => isOnPlanForDay(row, dayToken))
        .map(toCommitmentContext);
    }
    // No published plan, or no line scheduled today: the allowlist is empty and
    // EVERY match the model returns will be rejected. That is the correct
    // behaviour, not a degradation -- there is no line to evidence.

    // ---- 4. the bytes -----------------------------------------------------
    const inlineBase64 = cleanText(body.base64);
    const inlineMime = cleanText(body.mime_type).toLowerCase();
    let base64: string;
    let mimeType: string;
    if (inlineBase64 && inlineMime) {
      // The WhatsApp path already holds the bytes (the Graph URL dies in
      // seconds); re-downloading them from the bucket would be a second network
      // hop for nothing.
      base64 = inlineBase64;
      mimeType = inlineMime;
    } else {
      if (!event.media_path) {
        return jsonResponse(req, {
          ok: false,
          error: `protocol_events ${eventId} has no media_path and no inline media was passed`,
          request_id: requestId,
        }, { status: 400, includeCors: false });
      }
      const download = await admin.storage
        .from(MEAL_PHOTO_BUCKET)
        .download(event.media_path);
      if (download.error || !download.data) {
        throw new Error(
          `meal-photos download failed for ${event.media_path}: ${
            download.error?.message ?? "no data"
          }`,
        );
      }
      const blob = download.data as Blob;
      base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      mimeType = cleanText(blob.type).toLowerCase() || "image/jpeg";
    }

    // ---- 5. the model -----------------------------------------------------
    const prompt = buildMealAnalysisPrompt(commitments, event.slot_key);
    const model = resolveVisionModel();
    const generated = await generateWithVision({
      systemPrompt: prompt.systemPrompt,
      userMessage: prompt.userMessage,
      media: [{ mimeType, base64 }],
      jsonMode: true,
      temperature: VISION_TEMPERATURE,
      timeoutMs: VISION_TIMEOUT_MS,
      meta: {
        source: "analyze-meal-photo-v1",
        userId: event.user_id,
        requestId,
      },
    });

    // ---- 6. the two filters (pure, tested in meal_analysis_test.ts) --------
    const analysis = parseMealAnalysis(
      generated.text,
      prompt.allowedCommitmentIds,
    );
    const studentCommitmentId = studentBindingIn(event.recognized);
    const binding = resolveMealPhotoBinding({
      analysis,
      explicitCommitmentId: studentCommitmentId,
    });
    // THE credit by content. `commitments` is the day's active plan -- the same
    // list that produced the allowlist, so a group can only be credited against
    // a line the student was actually prescribed today.
    const credit = resolveFoodGroupCredit({
      analysis,
      commitmentsToday: commitments,
    });
    const recognized = buildRecognizedPayload({
      analysis,
      binding,
      model,
      studentCommitmentId,
      credit,
    });

    // ---- 7. write-through --------------------------------------------------
    // NOTE, deliberately: `quantity` and `unit` are NOT in this UPDATE. A photo
    // evidences; it does not measure (non-input #4). The evaluator already
    // grades a numberless fact correctly -- `partial` against a numeric target,
    // `met` on presence/composition lines. `food_group_ref` IS in this UPDATE
    // and is not a measurement: it says WHICH group, never how much.
    //
    // `portion_band` IS in this UPDATE, and it is the reason migration
    // 20260727220000 exists. The same value was already being written -- into
    // `recognized` jsonb, which R5 forbids the evaluator to read. We computed
    // the signal and threw it away: a manifestly enormous plate graded exactly
    // like a token one. Promoted to a column it is a TOKEN, ordinal, with a
    // CHECK on four values, and `quantity`/`unit` stay null beside it. A band is
    // a rank, not a quantity -- see the branch comment in `evaluator.ts` for why
    // it may downgrade a cap and may never lift a floor.
    // Le verdict de SUJET. `mealDisqualification` est la seule opinion du
    // système sur « est-ce que ceci est un repas », et elle est écrite sur la
    // LIGNE plutôt que déduite à la lecture: les six lecteurs qui comptent des
    // repas n'ont pas à ré-implémenter la règle, ils filtrent une colonne.
    //
    // Inconditionnel comme les trois autres: un rejeu `force` dont la nouvelle
    // lecture voit un vrai repas doit EFFACER la disqualification précédente.
    const disqualifiedReason = mealDisqualification(analysis);
    const updated = await admin
      .from("protocol_events")
      .update({
        recognized,
        recognition_confidence: analysis.overall_confidence,
        food_group_ref: credit.foodGroupRef,
        // Unconditional, exactly like `food_group_ref`: a `force: true` re-run
        // whose new reading is `unclear` must OVERWRITE a `large` the previous
        // reading left behind, not leave the stale band on the row.
        portion_band: analysis.portion_band,
        disqualified_reason: disqualifiedReason,
        // La dette que la QA avait nommée (P3-1): sans horodatage, une ligne
        // analysée à l'insertion et une ligne rejouée trois jours plus tard
        // sont indistinguables, et tout audit d'un changement de prompt
        // devient impossible après coup.
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", event.id)
      .select(EVENT_COLUMNS)
      .single();
    if (updated.error) {
      throw new Error(
        `protocol_events update failed: ${updated.error.message}`,
      );
    }
    const readBack = updated.data as EventRow;
    if (storedAnalysisVersion(readBack.recognized) !== MEAL_ANALYSIS_PROMPT_VERSION) {
      // Execution truth: the update reported success and the row does not carry
      // what we wrote. Never announce the verdict in that state.
      throw new Error(
        "protocol_events read-back does not carry the analysis version (write-through violated)",
      );
    }
    // Same discipline on the credit, and it matters MORE than the version: the
    // acknowledgement below says "counted toward X" on the strength of this
    // column. A silent FK rejection or a trigger that nulls it must not leave
    // the student with a sentence the database does not support.
    const storedFoodGroupRef = readBack.food_group_ref ?? null;
    if (storedFoodGroupRef !== credit.foodGroupRef) {
      throw new Error(
        `protocol_events read-back food_group_ref ${
          JSON.stringify(storedFoodGroupRef)
        } does not match the credit ${
          JSON.stringify(credit.foodGroupRef)
        } (write-through violated)`,
      );
    }
    // Same discipline on the band. It is now an EVALUATOR INPUT (a column read
    // by the ordinal branch), so a CHECK rejection or a trigger nulling it must
    // fail loudly here rather than leave the coach a distribution the database
    // does not hold. A silent divergence between what we analyzed and what the
    // row carries is the whole failure mode `recognized` jsonb had.
    if ((readBack.portion_band ?? null) !== analysis.portion_band) {
      throw new Error(
        `protocol_events read-back portion_band ${
          JSON.stringify(readBack.portion_band ?? null)
        } does not match the analysis ${
          JSON.stringify(analysis.portion_band)
        } (write-through violated)`,
      );
    }
    // Et la même discipline sur la disqualification, qui en a le PLUS besoin:
    // c'est la colonne que six lecteurs interrogent pour décider si ce repas
    // compte. Un CHECK rejeté ou une colonne absente (migration non appliquée)
    // laisserait la photo d'un menu compter comme un repas, silencieusement —
    // exactement le défaut que tout ceci corrige.
    if ((readBack.disqualified_reason ?? null) !== disqualifiedReason) {
      throw new Error(
        `protocol_events read-back disqualified_reason ${
          JSON.stringify(readBack.disqualified_reason ?? null)
        } does not match the analysis ${
          JSON.stringify(disqualifiedReason)
        } (write-through violated)`,
      );
    }

    const titles: Record<string, string> = {};
    for (const c of commitments) titles[c.id] = c.title;

    // LE PLAFOND EST PARTAGÉ AVEC LE CHEMIN TEXTE, et c'est le point de la
    // §P5.2. Deux compteurs séparés donneraient QUATRE questions par jour à un
    // élève qui envoie des photos ET écrit — soit exactement l'interrogatoire
    // que le plafond existe pour empêcher, obtenu en respectant deux fois la
    // règle.
    //
    // Le filtre de mise (`meal_analysis.ts` FILTRE 3) a déjà tranché « cette
    // question a-t-elle un enjeu ». Ici on ne juge plus l'enjeu: on regarde
    // seulement si l'élève a déjà donné son quota d'attention aujourd'hui.
    //
    // ORDRE: la place est consommée AVANT que la question ne parte, comme côté
    // texte. Une inscription qui échoue retire la question — un plafond qui ne
    // plafonne pas est pire que pas de question.
    const askedAnalysis = analysis;
    if (analysis.clarifying_question) {
      const count = await countMealPrecisionQuestionsToday(admin, {
        userId: readBack.user_id,
        localDate: readBack.local_date,
      });
      const gate = gateMealPrecisionQuestion({
        // Le chemin photo apporte SON axe (dérivé des hypothèses déclarées) et
        // sa propre condition de mise; l'évaluation textuelle ne s'y applique
        // pas. On lui donne donc l'axe déjà décidé, et le gate ne juge plus que
        // la crise, le fait, et le plafond.
        assessment: {
          axes: [photoPrecisionAxis(analysis)],
          primary: photoPrecisionAxis(analysis),
          reason_code: "photo_assumption",
          depends_on: [],
          slot_candidates: [],
        },
        safetyBand: "none",
        futureIntent: false,
        committedEventCount: 1,
        questionsAskedToday: count.count,
        flowAlreadyOpen: false,
      });
      if (!gate.ask) {
        console.log(JSON.stringify({
          tag: "meal_precision_question_withheld",
          source: "photo",
          user_id: readBack.user_id,
          reason: `${gate.reason_code}:${count.reason}`,
        }));
        // La question tombe; le reste de la lecture est intact. L'accusé sera
        // donc rendu sans question, et le flow s'ouvrira en
        // `awaiting_correction` — l'élève garde le droit de corriger.
        askedAnalysis.clarifying_question = null;
      } else {
        const recorded = await recordMealPrecisionQuestion(admin, {
          userId: readBack.user_id,
          localDate: readBack.local_date,
          source: "photo",
          axis: gate.axis ?? "composition",
          question: analysis.clarifying_question,
          protocolEventId: readBack.id,
          // UNE question par photo: la clé d'idempotence est la ligne, pas le
          // tour. Un rejeu `force: true` de la même photo ne consomme pas une
          // seconde place du plafond.
          askedForMessageId: `photo:${readBack.id}`,
        });
        if (!recorded.ok) askedAnalysis.clarifying_question = null;
      }
    }

    return jsonResponse(req, {
      ok: true,
      status: "analyzed",
      event_id: readBack.id,
      analysis_version: MEAL_ANALYSIS_PROMPT_VERSION,
      model,
      binding: binding.kind,
      commitments_in_context: commitments.length,
      // The credit, as the DATABASE now holds it.
      food_group_ref: readBack.food_group_ref ?? null,
      // The ordinal magnitude, as the DATABASE now holds it. Read from the row,
      // never from `analysis`: this is the value the evaluator will see.
      portion_band: readBack.portion_band ?? null,
      food_group_credit: {
        food_group_ref: credit.foodGroupRef,
        reason: credit.reason,
        candidate_groups: credit.candidateGroups,
        commitment_ids: credit.commitmentIds,
        issues: credit.issues,
      },
      // The audit numbers a benchmark run (W5.5) reads directly.
      rejected_commitment_ids: analysis.rejected_commitment_ids,
      dropped_measurement_fields: analysis.dropped_measurement_fields,
      issues: analysis.issues,
      // Built from the row the database returned, not from local state.
      recognized: readBack.recognized,
      recognition_confidence: readBack.recognition_confidence,
      student_message: renderMealPhotoAck({
        analysis,
        // Both of the things that were actually written. The renderer can now
        // tell a credited line from an announced one -- it could not before.
        binding,
        credit,
        commitmentTitles: titles,
        // Le token de la ligne, plus une constante en dur: c'est la donnée qui
        // décide, et `renderMealPhotoAck` accepte désormais la famille `en`.
        locale: String(readBack.content_locale ?? "en-GB"),
      }),
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "analyze-meal-photo-v1",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500, includeCors: false });
  }
});
