import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestContext } from "../_shared/request_context.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_PHONE_NUMBER = Deno.env.get("WHATSAPP_PHONE_NUMBER") || "33674637278"; // Format sans '+' pour le lien wa.me

// Adresse expéditeur (à configurer dans Resend)
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") ?? "Sophia <sophia@sophia-coach.ai>"; 

serve(async (req) => {
  let ctx = getRequestContext(req)
  const guardRes = ensureInternalRequest(req);
  if (guardRes) return guardRes;

  try {
    if (!SENDER_EMAIL || !String(SENDER_EMAIL).trim()) {
      console.error("[send-welcome-email] Missing SENDER_EMAIL");
      return new Response(JSON.stringify({ error: "Server misconfigured: missing SENDER_EMAIL" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    // 1. Vérification auth (interne ou admin)
    // On s'attend à être appelé par un Trigger DB (Webhook) ou manuellement
    // Le payload Webhook standard de Supabase est { type: 'INSERT', table: 'profiles', record: { ... }, old_record: null }
    const payload = await req.json().catch(() => ({} as any));
    ctx = getRequestContext(req, payload)
    
    // Si appelé via Trigger Webhook
    const userRecord = payload.record || payload; // Fallback si on appelle avec juste { email, name }
    
    const email = userRecord.email; // Attention: profiles n'a pas forcément l'email si on ne le sync pas !
    // Si 'profiles' n'a pas l'email, il faut le récupérer via auth.users (nécessite admin client)
    const userId = userRecord.id;
    const prenom = userRecord.full_name ? userRecord.full_name.split(' ')[0] : "là";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Récupération email si manquant (car trigger sur profiles souvent n'a pas l'email direct si pas dupliqué)
    let targetEmail = email;
    if (!targetEmail && userId) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError || !userData.user) {
        console.error("Impossible de trouver l'user auth:", userError);
        throw new Error("User introuvable");
      }
      targetEmail = userData.user.email;
    }

    if (!targetEmail) {
      throw new Error("Aucun email destinataire trouvé");
    }

    // Skip ephemeral example.com users (avoid sending real emails / noisy logs).
    const normalizedEmail = String(targetEmail).trim().toLowerCase();
    if (normalizedEmail.endsWith("@example.com")) {
      console.log(`Skip welcome email for ephemeral test user: ${targetEmail} (${userId})`);
      return new Response(JSON.stringify({ message: "Skipped (ephemeral test user)" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[send-welcome-email] request_id=${ctx.requestId} user_id=${userId} target=${targetEmail}`);

    // 2. Vérifier si déjà envoyé (Idempotency)
    const { data: existingLogs } = await supabase
      .from("communication_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "welcome_email")
      .limit(1);

    if (existingLogs && existingLogs.length > 0) {
      console.log("Email déjà envoyé, skip.");
      return new Response(JSON.stringify({ message: "Already sent" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Contenu Email
    const whatsappLink = `https://wa.me/${WHATSAPP_PHONE_NUMBER}?text=Hello%20Sophia`;
    
    const htmlContent = `
      <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
        <p>Hello ${prenom},</p>
        
        <p>Bienvenue ! Je suis super contente que tu sois là.</p>
        
        <p>Normalement, <strong>ton téléphone a dû vibrer à l'instant.</strong> Je viens de t'envoyer ton tout premier message sur WhatsApp pour qu'on puisse démarrer.</p>
        
        <p>C'est là-bas que tout va se passer : tes bilans, tes victoires, et nos échanges au quotidien.</p>
        
        <p><strong>Tu n'as rien reçu ?</strong><br/>
        Pas de panique, tu peux lancer la discussion manuellement en cliquant juste ici :</p>
        
        <p style="margin: 20px 0;">
          <a href="${whatsappLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            👉 Lancer Sophia sur WhatsApp
          </a>
        </p>
        
        <p>À tout de suite sur ton téléphone,</p>
        
        <p><strong>Sophia</strong></p>
      </div>
    `;

    // 4. Envoi via Resend (with MEGA_TEST_MODE skip + 429 retry/backoff)
    const out = await sendResendEmail({
      to: targetEmail,
      subject: `Bienvenue ${prenom} ! (Check ton WhatsApp 👀)`,
      html: htmlContent,
      from: SENDER_EMAIL,
      maxAttempts: 6,
    });
    if (!out.ok) {
      console.error("Erreur Resend:", out);
      throw new Error("Erreur lors de l'envoi Resend");
    }

    // 5. Log succès
    await supabase.from("communication_logs").insert({
      user_id: userId,
      channel: "email",
      type: "welcome_email",
      status: "sent",
      metadata: { resend_id: (out as any).data?.id ?? null, skipped: Boolean((out as any).skipped) }
    });

    return new Response(JSON.stringify((out as any).data ?? { ok: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[send-welcome-email] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"} error=${message}`);
    await logEdgeFunctionError({
      functionName: "send-welcome-email",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "email",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
