/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { buildMealPdf } from "../_shared/keel/meal_pdf.ts";
import { uploadWhatsAppMedia } from "../_shared/whatsapp_media.ts";
import type { GeneratedDish, ShoppingItem } from "../_shared/keel/meal_generation.ts";

/**
 * `meal-document-v1` — le PDF d'un repas, et son envoi WhatsApp.
 *
 * ── L'ORDRE DES ÉTAPES EST LE CONTRAT ────────────────────────────────────
 *   1. le PDF est construit;
 *   2. il est DÉPOSÉ dans le bucket, et la ligne `student_meal_documents` est
 *      écrite AVANT toute tentative d'envoi;
 *   3. l'envoi WhatsApp est tenté, et son résultat MET À JOUR la ligne.
 *
 * Cet ordre n'est pas cosmétique. Le fichier doit survivre à l'échec de
 * l'envoi: un élève dont le WhatsApp est fermé doit quand même pouvoir
 * télécharger sa liste depuis l'app, et un renvoi ne doit pas régénérer un
 * document différent de celui qu'on lui a déjà annoncé. L'ordre inverse
 * (envoyer puis écrire) produit exactement la classe d'incidents « accusé sans
 * ligne » que ce dépôt connaît: un message parti que rien ne référence.
 *
 * ── CE QUI EST TESTABLE EN LOCAL, ET CE QUI NE L'EST PAS ─────────────────
 * Le PDF, le dépôt, la ligne et le statut `skipped` le sont entièrement.
 * L'upload média et l'envoi passent par Meta: NOT_TESTABLE_LOCALLY, et la
 * fonction est écrite pour que leur échec soit une ligne `failed` lisible
 * plutôt qu'une exception qui perd le fichier.
 */

const FN_NAME = "meal-document-v1";
const BUCKET = "meal-documents";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** `2026-08-04` -> `4 August 2026`. Le produit est en-GB. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Un nom de fichier qu'on retrouve dans un fil WhatsApp trois jours plus tard. */
function safeFilename(kind: string, dateIso: string): string {
  const stamp = dateIso.slice(0, 10);
  return `${kind === "shopping_list" ? "shopping-list" : "meal"}-${stamp}.pdf`;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const mealId = String(body.meal_id ?? "").trim();
    if (!mealId) {
      return jsonResponse(req, { error: "meal_id_required", request_id: requestId }, { status: 400 });
    }
    // `send` est OPT-IN. Produire un PDF est gratuit pour l'élève; lui écrire
    // sur WhatsApp ne l'est pas, et un envoi par défaut serait un message qu'il
    // n'a pas demandé.
    const send = body.send === true;

    // Le repas, LU SOUS L'IDENTITÉ DE L'ÉLÈVE et pas en service_role: la RLS
    // est ce qui garantit qu'on ne fabrique pas le PDF du repas d'un autre.
    const mealRes = await userClient
      .from("student_generated_meals")
      .select("id, mode, dishes, shopping_list, context, created_at")
      .eq("id", mealId)
      .maybeSingle();
    if (mealRes.error) throw mealRes.error;
    if (!mealRes.data) {
      return jsonResponse(req, { error: "meal_not_found", request_id: requestId }, { status: 404 });
    }
    const meal = mealRes.data as Record<string, unknown>;

    const profRes = await admin
      .from("profiles")
      .select("full_name, phone_number")
      .eq("id", userId)
      .maybeSingle();
    const profile = (profRes.data ?? {}) as Record<string, unknown>;
    const firstName = String(profile.full_name ?? "").trim().split(/\s+/)[0] || null;

    const mode = String(meal.mode ?? "to_shop") as "from_pantry" | "to_shop";
    const createdAt = String(meal.created_at ?? new Date().toISOString());

    // --- 1. le PDF -------------------------------------------------------
    const bytes = await buildMealPdf({
      firstName,
      dishes: (meal.dishes ?? []) as GeneratedDish[],
      shoppingList: (meal.shopping_list ?? []) as ShoppingItem[],
      context: meal.context ? String(meal.context) : null,
      mode,
      dateLabel: formatDate(createdAt),
    });

    // --- 2. le dépôt, PUIS la ligne, AVANT tout envoi ---------------------
    const kind = ((meal.shopping_list as unknown[])?.length ?? 0) > 0
      ? "shopping_list"
      : "meal_card";
    const filename = safeFilename(kind, createdAt);
    // Le préfixe est l'uuid de l'élève: c'est ce que la policy Storage lit
    // (`storage.foldername(name))[1] = auth.uid()`), donc le chemin EST le
    // contrôle d'accès. Le changer sans changer la policy ouvrirait le bucket.
    const storagePath = `${userId}/${mealId}/${filename}`;

    const up = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (up.error) throw up.error;

    const { data: docRow, error: docErr } = await admin
      .from("student_meal_documents")
      .insert({
        user_id: userId,
        meal_id: mealId,
        kind,
        storage_path: storagePath,
        filename,
        delivery_status: send ? "pending" : "skipped",
      })
      .select("id")
      .single();
    if (docErr) throw docErr;
    const documentId = String(docRow.id);

    // --- 3. l'envoi, dont l'échec est une LIGNE et pas une exception ------
    let delivery: Record<string, unknown> = { status: send ? "pending" : "skipped" };
    if (send) {
      const phone = String(profile.phone_number ?? "").trim();
      if (!phone) {
        await admin.from("student_meal_documents")
          .update({ delivery_status: "failed", delivery_error: "no_phone_number" })
          .eq("id", documentId);
        delivery = { status: "failed", error: "no_phone_number" };
      } else {
        try {
          const mediaId = await uploadWhatsAppMedia({
            bytes,
            filename,
            mimeType: "application/pdf",
          });
          const sendRes = await fetch(
            `${requireEnv("SUPABASE_URL")}/functions/v1/whatsapp-send`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                Authorization: `Bearer ${requireEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
                "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
              },
              body: JSON.stringify({
                user_id: userId,
                purpose: "meal_document",
                message: {
                  type: "document",
                  media_id: mediaId,
                  filename,
                  caption: mode === "to_shop"
                    ? "Your shopping list."
                    : "What to cook with what you have.",
                },
              }),
            },
          );
          const sendJson = await sendRes.json().catch(() => ({}));
          if (!sendRes.ok) {
            await admin.from("student_meal_documents")
              .update({
                delivery_status: "failed",
                delivery_error: String(sendJson?.error ?? `HTTP ${sendRes.status}`).slice(0, 500),
              })
              .eq("id", documentId);
            delivery = { status: "failed", error: sendJson?.error ?? `HTTP ${sendRes.status}` };
          } else {
            await admin.from("student_meal_documents")
              .update({
                delivery_status: "sent",
                sent_at: new Date().toISOString(),
                whatsapp_message_id: String(sendJson?.message_id ?? "") || null,
              })
              .eq("id", documentId);
            delivery = { status: "sent" };
          }
        } catch (error) {
          // L'upload média a échoué. Le FICHIER EXISTE toujours et la ligne le
          // dit: l'élève peut le télécharger, et un renvoi est possible sans
          // rien régénérer.
          const detail = error instanceof Error ? error.message : String(error);
          await admin.from("student_meal_documents")
            .update({ delivery_status: "failed", delivery_error: detail.slice(0, 500) })
            .eq("id", documentId);
          delivery = { status: "failed", error: detail };
        }
      }
    }

    // Une URL signée, courte: le bucket est privé et le reste.
    const signed = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);

    return jsonResponse(req, {
      ok: true,
      document: { id: documentId, filename, kind },
      download_url: signed.data?.signedUrl ?? null,
      delivery,
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
