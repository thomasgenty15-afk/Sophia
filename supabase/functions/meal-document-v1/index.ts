/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { buildMealPdf } from "../_shared/keel/meal_pdf.ts";
import { isFrenchLocale, resolveArtifactLocale } from "../_shared/keel/locale.ts";
import { deliverChatMessage } from "../_shared/chat/delivery.ts";
import type { GeneratedDish, ShoppingItem } from "../_shared/keel/meal_generation.ts";

/**
 * `meal-document-v1` — le PDF d'un repas, et son annonce dans la bulle.
 *
 * ── L'ORDRE DES ÉTAPES EST LE CONTRAT ────────────────────────────────────
 *   1. le PDF est construit;
 *   2. il est DÉPOSÉ dans le bucket, et la ligne `student_meal_documents` est
 *      écrite AVANT toute annonce;
 *   3. le message est livré dans la bulle, et son résultat MET À JOUR la ligne.
 *
 * Cet ordre n'est pas cosmétique. Le fichier doit survivre à l'échec de
 * l'annonce, et un renvoi ne doit pas régénérer un document différent de celui
 * qu'on a déjà annoncé. L'ordre inverse (annoncer puis écrire) produit
 * exactement la classe d'incidents « accusé sans ligne » que ce dépôt connaît:
 * un message parti que rien ne référence.
 *
 * ── DE-WHATSAPP: L'ÉTAPE QUI A DISPARU ──────────────────────────────────
 * Il y avait un upload média Meta entre 2 et 3: déposer les octets sur Graph,
 * récupérer un `media_id` qui expire à 30 jours, puis envoyer un message qui le
 * référence. C'était la seule partie NOT_TESTABLE_LOCALLY de cette fonction.
 * Elle disparaît entièrement: le fichier est déjà dans notre bucket et l'app
 * sait le servir derrière une URL signée. Il n'y a rien à transporter.
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

/**
 * `2026-08-04` -> `4 August 2026`, ou `4 août 2026`.
 *
 * La locale était `en-GB` EN DUR, avec le commentaire « le produit est en-GB »
 * pour la justifier. Elle est passée maintenant, parce que la date se lit sous
 * un titre traduit: « 4 August 2026 » sous « Ta liste de courses » est la même
 * incohérence que le titre anglais lui-même, en plus petit.
 *
 * `isFrenchLocale` est LE prédicat unique du gel (`_shared/keel/locale.ts`), et
 * `Intl` prend un tag BCP-47 complet: on choisit entre deux tags connus plutôt
 * que de passer le tag résolu tel quel, pour qu'une langue non livrée ne
 * produise jamais une date dans une troisième langue.
 */
function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(
    isFrenchLocale(locale) ? "fr-FR" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  );
}

/** L'annonce dans la bulle. Deux packs entiers, comme partout ailleurs. */
function documentReadyLine(
  mode: "from_pantry" | "to_shop",
  locale: string,
): string {
  if (isFrenchLocale(locale)) {
    const label = mode === "to_shop"
      ? "Ta liste de courses est prête."
      : "De quoi cuisiner avec ce que tu as, c'est prêt.";
    return `${label} Tu peux l'ouvrir depuis ton écran repas.`;
  }
  const label = mode === "to_shop"
    ? "Your shopping list is ready."
    : "What to cook with what you have is ready.";
  return `${label} You can open it from your meals screen.`;
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
      .select("full_name, phone_number, locale")
      .eq("id", userId)
      .maybeSingle();
    const profile = (profRes.data ?? {}) as Record<string, unknown>;
    const firstName = String(profile.full_name ?? "").trim().split(/\s+/)[0] || null;

    // R2 — UN DOCUMENT EST UN ARTEFACT: il n'a aucun fil à ancrer, donc
    // `resolveArtifactLocale` et jamais `resolveResponseLocale`. Résolu une
    // fois ici et descendu aux trois consommateurs (le PDF, sa date, et
    // l'annonce dans la bulle) — trois résolutions seraient trois occasions de
    // diverger, et c'est précisément ce qui produisait un titre anglais sur
    // une feuille de plats français.
    const contentLocale = resolveArtifactLocale({
      studentProfile: String(profile.locale ?? "").trim() || null,
      tenantDefault: null,
    });

    const mode = String(meal.mode ?? "to_shop") as "from_pantry" | "to_shop";
    const createdAt = String(meal.created_at ?? new Date().toISOString());

    // --- 1. le PDF -------------------------------------------------------
    const bytes = await buildMealPdf({
      firstName,
      dishes: (meal.dishes ?? []) as GeneratedDish[],
      shoppingList: (meal.shopping_list ?? []) as ShoppingItem[],
      context: meal.context ? String(meal.context) : null,
      mode,
      dateLabel: formatDate(createdAt, contentLocale),
      // ══════════════════════════════════════════════════════════════════
      // LES JOURS D'ACHAT — LE SEUL DOCUMENT QUI NE PEUT PAS LES CALCULER
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ CETTE FONCTION NE LIT NI `preparations` NI `starts_on` (voir le
      // `select` plus haut): elle ne PEUT pas rejouer `grocery_waves.ts`. La
      // date vient donc de la ligne elle-même — `shopping_list[].buy_on`,
      // posée par les deux lanes le 2026-09-01 exactement pour cette surface.
      //
      // ⚠️ ET C'EST LA FEUILLE QU'ON EMPORTE AU MAGASIN. Une liste sans jour
      // s'y lit « achète tout maintenant » — le défaut rapporté, imprimé sur
      // papier. L'écran, lui, recalcule; ce document non.
      //
      // ⚠️ UN SEUL FORMATEUR, CELUI DE CE FICHIER. Le module PDF rend, il ne
      // met pas en forme: lui laisser formater ferait deux façons d'écrire un
      // jour dans le même produit.
      buyDateLabels: Object.fromEntries(
        [
          ...new Set(
            ((meal.shopping_list ?? []) as ShoppingItem[])
              .map((line) => line.buy_on ?? null)
              .filter((day): day is string => typeof day === "string" && day !== ""),
          ),
        ].map((day) => [day, formatDate(day, contentLocale)]),
      ),
      locale: contentLocale,
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
      // ── DE-WHATSAPP — LE DOCUMENT NE S'ENVOIE PLUS, IL S'ANNONCE ─────────
      //
      // Le chemin Meta était: déposer les octets sur `POST /{phone_id}/media`,
      // récupérer un `media_id` (qui EXPIRE à 30 jours), puis envoyer un
      // message qui le référence. Trois appels réseau, une pièce jointe
      // dupliquée hors de notre stockage, et un identifiant périssable.
      //
      // L'app a déjà le fichier: il est dans `meal-documents`, la ligne
      // `student_meal_documents` le référence, et `ShoppingListPanel` (sur
      // `/app/plan`, via `api/mealDocument.ts`) sait le télécharger derrière
      // une URL signée. (Ce commentaire nommait `/app/meals`, qui ne l'a jamais
      // su et n'existe plus depuis le 2026-09-03.) Il n'y a donc RIEN à transporter
      // — seulement à dire que c'est prêt.
      //
      // L'ordre du fichier reste le contrat: le PDF et sa ligne existent AVANT
      // cette étape, et un échec ici laisse un document parfaitement
      // téléchargeable. C'est la même garantie qu'avant, avec une étape en
      // moins qui pouvait la casser.
      const res = await deliverChatMessage(admin, {
        userId,
        content: documentReadyLine(mode, contentLocale),
        purpose: "keel_meal_document",
        // `isReply: true`: l'élève vient de demander ce document. Ce n'est pas
        // une relance, et le plafond quotidien n'a rien à voir avec elle.
        isReply: true,
        requestId,
        metadata: { document_id: documentId, filename },
      });
      if (res.delivered) {
        await admin.from("student_meal_documents")
          .update({ delivery_status: "sent", sent_at: new Date().toISOString() })
          .eq("id", documentId);
        delivery = { status: "sent", chat_message_id: res.chatMessageId };
      } else {
        // Un refus de livraison est une LIGNE, pas une exception: le fichier
        // est là, l'élève peut le télécharger, et le motif est lisible.
        await admin.from("student_meal_documents")
          .update({ delivery_status: "failed", delivery_error: res.reason })
          .eq("id", documentId);
        delivery = { status: "failed", error: res.reason };
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
