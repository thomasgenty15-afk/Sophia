/**
 * `keel-household-invite-v1` — ÉMETTRE LE LIEN, ET L'ENVOYER.
 * 2026-09-09 · décision humaine du jour.
 *
 * Autorité produit: [FF-048](docs/fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUI EXISTAIT, ET CE QUI MANQUAIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `keel_household_invite(email, member_id)` frappe le jeton, n'en garde que le
 * sha256, et le rend en clair UNE fois. L'écran affichait ce jeton, le faisait
 * copier, et ouvrait un brouillon `mailto:` — c'est tout. FF-060 R7 l'écrivait
 * en toutes lettres: « AUCUN E-MAIL N'EST ENVOYÉ ».
 *
 * Le coût n'était pas théorique: le maître devait porter lui-même le lien, dans
 * son propre client mail, avec ses propres mots. Ce qu'il promettait en
 * l'écrivant n'était donc gouverné par rien — et FF-048 R10 dit que ce que la
 * réclamation NE donne PAS est la moitié de l'offre. Un e-mail rédigé à la main
 * par quelqu'un d'enthousiaste ne dit jamais « tu ne pourras pas composer ».
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CETTE FONCTION N'ÉCRIT AUCUNE RÈGLE, ET C'EST TOUT SON INTÉRÊT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Elle appelle la RPC SOUS LE JETON DE L'APPELANT. Les six refus restent donc
 * exactement où ils sont, en base, une seule fois: `not_authenticated`,
 * `no_household`, `not_owner`, `bad_email`, `not_a_member`, `already_claimed`,
 * `rate_limited`. Recopier ici la moindre de ces conditions — « est-il maître ? »
 * se tape en une ligne — donnerait deux règles qui divergeraient au premier
 * ajustement, et c'est la porte, pas l'écran, qui doit trancher.
 *
 * ⚠️ LE PLAFOND EST CELUI DE LA RPC (20 par foyer et par jour), et il n'y en a
 * pas d'autre. Un second plafond ici refuserait des invitations que la base
 * accepte, sans que rien ne dise laquelle des deux limites a mordu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE LIEN EST TOUJOURS RENDU À L'APPELANT, ET CE N'EST PAS UNE FUITE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * C'est déjà le cas aujourd'hui: la RPC est `grant execute to authenticated`,
 * donc le navigateur du maître peut la joindre directement et reçoit le jeton
 * en clair. Le lui refuser ICI ne fermerait rien — et retirerait la copie et le
 * brouillon `mailto:`, c'est-à-dire la seule sortie quand l'e-mail n'arrive
 * pas. L'e-mail S'AJOUTE au lien; il ne le remplace pas.
 *
 * ⚠️ TROIS ÉTATS D'ENVOI, JAMAIS DEUX. `sendResendEmail` rend
 * `{ok:true, skipped:true}` quand la livraison est éteinte
 * (`EMAIL_DELIVERY_ENABLED=0`) ou en `MEGA_TEST_MODE` — c'est-à-dire dans TOUTE
 * session locale. Rendre « envoyé » dans ce cas ferait croire à qui relit un
 * journal de QA qu'un e-mail est parti. C'est la cicatrice de
 * `coach-invite-student-v1`, et elle est reprise mot pour mot: un état d'envoi
 * qui ne distingue pas « parti » de « supprimé » ne se vérifie pas.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import {
  buildClaimUrl,
  renderHouseholdInviteEmail,
  resolveHouseholdInviteLocale,
} from "./invite_email.ts";

const FN_NAME = "keel-household-invite-v1";
const COMMUNICATION_TYPE = "household_invite_email";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Une adresse de test jetable ne reçoit rien.
 *
 * Reprise de `coach-invite-student-v1`: les bancs de QA créent des comptes en
 * `@example.com` / `.invalid`, et les envoyer à Resend fait monter le taux de
 * rebond du domaine — c'est-à-dire abîme la délivrabilité des VRAIS e-mails.
 */
function isEphemeralTestEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domain === "example.com" || domain === "example.org" ||
    domain === "example.net" || domain.endsWith(".invalid") ||
    domain.endsWith(".test") || domain.endsWith(".local");
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;
  if (req.method !== "POST") {
    return jsonResponse(req, {
      error: "Method Not Allowed",
      request_id: requestId,
    }, { status: 405 });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, {
        error: "Unauthorized",
        request_id: requestId,
      }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const email = String(body.email ?? "").trim();
    const memberId = String(body.member_id ?? "").trim();
    if (!email || !memberId) {
      return jsonResponse(req, {
        ok: false,
        reason: "bad_request",
        request_id: requestId,
      }, { status: 400 });
    }

    // ── LA PORTE, ET ELLE EST LA SEULE ────────────────────────────────────
    // Sous le jeton de l'appelant: `auth.uid()` est lui, donc les refus de la
    // RPC sont ceux de SON compte. Un appel sous `service_role` verrait
    // `auth.uid()` NULL et rendrait `not_authenticated` — la cicatrice
    // `auth-uid-null-under-service-role`.
    const { data, error } = await userClient.rpc("keel_household_invite", {
      p_email: email,
      p_member: memberId,
    });
    if (error) throw error;
    const res = (data ?? {}) as Record<string, unknown>;
    if (res.ok !== true) {
      // ⚠️ 200 ET `ok:false`, PAS UN 4xx. C'est ce que l'écran lit déjà depuis
      // que la RPC existe (`asResult` + `inviteErrorText`), et la liste des
      // motifs est FERMÉE côté écran. Changer le code HTTP ici ferait tomber
      // tous ces motifs dans la branche « erreur réseau », qui n'a pas de
      // phrase pour eux.
      return jsonResponse(req, {
        ok: false,
        reason: String(res.reason ?? "unknown"),
        request_id: requestId,
      });
    }

    const token = String(res.token ?? "");
    const claimUrl = buildClaimUrl(
      Deno.env.get("APP_BASE_URL") ?? Deno.env.get("SITE_URL") ??
        Deno.env.get("PUBLIC_SITE_URL"),
      token,
    );

    // ── QUI INVITE, ET DEPUIS QUELLE MAISON ───────────────────────────────
    //
    // ⚠️ LU SOUS `service_role`, PAS SOUS LE JETON. `households.name` est
    // lisible par tout le foyer, donc le jeton suffirait — mais le prénom du
    // maître vit dans SA ligne, et une lecture qui marche « parce que la policy
    // est large aujourd'hui » se casse le jour où elle se resserre. Ces deux
    // champs ne servent qu'à écrire l'e-mail; ils ne décident de rien.
    //
    // ⛔ ET UNE LECTURE EN PANNE N'ANNULE PAS L'ENVOI. Le jeton est déjà écrit
    // en base: renoncer ici laisserait une invitation vivante que personne n'a
    // reçue, et le maître verrait « envoyée le … » sur une ligne muette.
    // L'e-mail retombe alors sur des formules sans nom.
    const admin = adminClient();
    let householdName: string | null = null;
    let inviterName: string | null = null;
    let inviterLocale: string | null = null;
    try {
      const { data: me } = await admin
        .from("household_members")
        .select("household_id, first_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const row = (me ?? null) as Record<string, unknown> | null;
      inviterName = row?.first_name ? String(row.first_name) : null;
      const hid = row?.household_id ? String(row.household_id) : "";
      if (hid) {
        const { data: hh } = await admin
          .from("households")
          .select("name")
          .eq("id", hid)
          .maybeSingle();
        householdName = (hh as Record<string, unknown> | null)?.name
          ? String((hh as Record<string, unknown>).name)
          : null;
      }
      const { data: prof } = await admin
        .from("profiles")
        .select("locale")
        .eq("id", user.id)
        .maybeSingle();
      inviterLocale = (prof as Record<string, unknown> | null)?.locale
        ? String((prof as Record<string, unknown>).locale)
        : null;
    } catch (error) {
      console.warn(JSON.stringify({
        tag: "keel.household_invite.context_unreadable",
        request_id: requestId,
        error: error instanceof Error ? error.message : String(error),
        effect: "l'e-mail part sans nom de foyer ni prénom d'émetteur",
      }));
    }

    let sendState:
      | "sent"
      | "skipped_ephemeral"
      | "skipped_delivery_disabled"
      | "failed" = "sent";
    let sendError: string | null = null;

    if (isEphemeralTestEmail(email)) {
      sendState = "skipped_ephemeral";
    } else {
      const { subject, html } = renderHouseholdInviteEmail({
        firstName: res.first_name ? String(res.first_name) : null,
        inviterName,
        householdName,
        claimUrl,
        // Le choix explicite de l'écran d'abord, la langue du maître ensuite.
        // Voir le pavé de `resolveHouseholdInviteLocale`: sous un même toit,
        // c'est l'hypothèse la plus sûre disponible.
        locale: resolveHouseholdInviteLocale(body.invite_locale, inviterLocale),
      });
      const out = await sendResendEmail({
        to: email,
        subject,
        html,
        maxAttempts: 6,
      });
      if (!out.ok) {
        // ⛔ ON NE LÈVE PAS, ET C'EST LE CŒUR DU LOT. Le jeton EST écrit: un
        // 500 ici ferait croire à l'écran que rien ne s'est passé, alors qu'une
        // invitation vivante court déjà. Le maître doit apprendre que l'e-mail
        // n'est pas parti ET garder le lien à copier — c'est exactement ce que
        // l'écran d'avant ce lot faisait, et il reste la sortie de secours.
        sendState = "failed";
        sendError = (out as { error: string }).error;
      } else {
        sendState = (out as { skipped?: boolean }).skipped
          ? "skipped_delivery_disabled"
          : "sent";
      }
      // ⚠️ JAMAIS L'ADRESSE EN CLAIR DANS LE JOURNAL (SEC-13). La ligne dit
      // QU'un envoi a eu lieu, pour qui l'a demandé, et dans quel état.
      try {
        await admin.from("communication_logs").insert({
          user_id: user.id,
          channel: "email",
          type: COMMUNICATION_TYPE,
          status: sendState === "sent" ? "sent" : "skipped",
          metadata: {
            member_id: memberId,
            send_state: sendState,
            error: sendError,
          },
        });
      } catch {
        // Un journal qui échoue n'annule pas un e-mail qui est parti.
      }
    }

    return jsonResponse(req, {
      ok: true,
      token,
      claim_url: claimUrl,
      email: String(res.email ?? email),
      member_id: String(res.member_id ?? memberId),
      first_name: res.first_name ? String(res.first_name) : null,
      // Les quatre états, rendus tels quels: l'écran choisit sa phrase, et
      // « supprimé en local » ne se lit pas comme « parti ».
      send_state: sendState,
      send_error: sendError,
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
