import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestContext } from "../_shared/request_context.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_PHONE_NUMBER = Deno.env.get("WHATSAPP_PHONE_NUMBER") || "33674637278";

const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") ?? "Sophia <sophia@sophia-coach.ai>"; 

// Types d'emails de rétention
const RETENTION_STEPS = [
  { days: -1, type: "trial_warning_j_minus_1", subject: "Demain, je me mets en pause (et j’aimerais éviter ça)" },
  { days: 1, type: "trial_ended_j_plus_1", subject: "Je me suis arrêtée hier… tu veux qu’on reprenne ?" },
  { days: 3, type: "trial_ended_j_plus_3", subject: "Question honnête : ces 3 derniers jours, ça s’est passé comment ?" },
  { days: 5, type: "trial_ended_j_plus_5", subject: "Je te laisse tranquille après ça (promis)" },
];

serve(async (req) => {
  const ctx = getRequestContext(req)
  const guardRes = ensureInternalRequest(req);
  if (guardRes) return guardRes;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[trigger-retention-emails] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"} start`);
    // In MEGA_TEST_MODE, Resend is skipped by the shared helper; keep the job safe anyway.

    // Configurable links per environment (DB-driven)
    const subscribeLink =
      (await getConfigValue(supabase, "subscribe_url")) ||
      "https://app.sophia.com/subscribe";

    // 1. Récupérer les users potentiellement concernés
    // On cherche ceux dont le trial_end est "autour" de nos jours cibles
    // Pour simplifier, on prend tous ceux dont le trial est fini ou finit bientôt, et on filtre en JS
    // Optimisation: On pourrait faire une requête SQL précise avec des OR
    
    // On prend large : trial_end entre J-2 et J+6
    const now = new Date();
    const rangeStart = new Date(now); rangeStart.setDate(rangeStart.getDate() - 6);
    const rangeEnd = new Date(now); rangeEnd.setDate(rangeEnd.getDate() + 2);

    const { data: users, error } = await supabase
      .from("profiles")
      .select(`
        id, 
        email, 
        full_name, 
        trial_end,
        subscriptions (status)
      `)
      .gte("trial_end", rangeStart.toISOString())
      .lte("trial_end", rangeEnd.toISOString());

    if (error) throw error;

    console.log(`${users.length} utilisateurs trouvés dans la fenêtre de dates.`);

    let sentCount = 0;

    for (const user of users) {
      // Vérifier si payant
      const isPaid = user.subscriptions && user.subscriptions.length > 0 && user.subscriptions[0].status === 'active';
      if (isPaid) continue;

      // Calculer le delta en jours (entiers)
      // Delta = Aujourd'hui - TrialEnd
      // Si TrialEnd est demain (J-1), Delta = -1
      // Si TrialEnd était hier (J+1), Delta = 1
      const trialEnd = new Date(user.trial_end);
      const diffTime = now.getTime() - trialEnd.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      // Trouver l'étape correspondante
      const step = RETENTION_STEPS.find(s => s.days === diffDays);

      if (!step) continue; // Pas un jour d'envoi

      // Vérifier si déjà envoyé
      const { data: existingLogs } = await supabase
        .from("communication_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", step.type)
        .limit(1);

      if (existingLogs && existingLogs.length > 0) continue; // Déjà fait

      // Si on arrive ici, on doit envoyer !
      console.log(`Envoi email ${step.type} à user ${user.id} (Delta: ${diffDays}j)`);

      // Générer le contenu
      const content = getEmailContent(step.type, user.full_name || "L'Architecte", subscribeLink);
      
      // Récupérer l'email (si pas dans profiles, check auth - mais ici profiles devrait l'avoir si sync, sinon skip ou call admin)
      // Note: Dans ta migration 20251213181000_add_email_to_profile.sql tu as ajouté l'email.
      let targetEmail = user.email;
      if (!targetEmail) {
        // Fallback admin auth si besoin, ou log error
        console.warn(`Email manquant pour user ${user.id}, skip.`);
        continue;
      }

      // Envoi Resend
      const out = await sendResendEmail({
        to: targetEmail,
        subject: step.subject,
        html: content,
        from: SENDER_EMAIL,
        maxAttempts: 6,
      });

      if (out.ok) {
        // Log
        await supabase.from("communication_logs").insert({
          user_id: user.id,
          channel: "email",
          type: step.type,
          status: "sent",
          metadata: { resend_id: (out as any).data?.id ?? null, delta_days: diffDays, skipped: Boolean((out as any).skipped) }
        });
        sentCount++;
      } else {
        console.error(`Echec envoi Resend pour ${user.id}`, out);
      }
    }

    return new Response(JSON.stringify({ processed: users.length, sent: sentCount }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(`[trigger-retention-emails] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`, err);
    await logEdgeFunctionError({
      functionName: "trigger-retention-emails",
      error: err,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "email",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

// Générateur de templates (Contenu)
function getEmailContent(type: string, name: string, subscribeLink: string): string {
  const prenom = name.split(' ')[0];
  const commonStyle = `font-family: sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;`;
  const btnStyle = `display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 20px;`;

  if (type === "trial_warning_j_minus_1") {
    return `
      <div style="${commonStyle}">
        <p>Hello ${prenom},</p>
        <p>Petit message simple : <strong>ton essai se termine demain</strong>.</p>
        <p>Et je sais que dit comme ça, c’est “juste un abonnement”… mais en vrai, ce qui s’arrête surtout, c’est ce petit fil quotidien qui te permet de garder le cap quand la journée part dans tous les sens.</p>
        <p>Si je t’ai déjà aidé ne serait-ce qu’une fois à :</p>
        <ul>
          <li>te remettre en mouvement quand t’avais pas envie,</li>
          <li>faire un mini bilan au lieu de ruminer,</li>
          <li>ou juste te rappeler ce que tu voulais vraiment…</li>
        </ul>
        <p>…alors ça vaut peut‑être le coup de ne pas casser l’élan maintenant.</p>
        <p><a href="${subscribeLink}" style="${btnStyle}">Je garde Sophia avec moi</a></p>
        <p>Quoi que tu choisisses, bravo pour le pas que tu as déjà fait.<br/>Sophia</p>
      </div>
    `;
  }

  if (type === "trial_ended_j_plus_1") {
    return `
      <div style="${commonStyle}">
        <p>Hello ${prenom},</p>
        <p>Je te le dis sans drama : <strong>hier, ton essai s’est terminé</strong> — et du coup, je suis en pause sur ton compte.</p>
        <p>Ça veut dire : pas de petits check-ins, pas de “hey, on en est où ?”, pas de rappel doux quand tu t’éloignes de ce que tu veux construire.</p>
        <p>Et si tu te dis “ça va, je vais gérer”, je te crois.<br/>Mais je sais aussi à quel point c’est facile de se faire embarquer par l’urgence, puis de se réveiller une semaine plus tard en mode “mince…”.</p>
        <p>Si tu veux repartir simplement :</p>
        <p><a href="${subscribeLink}" style="${btnStyle}">Réactiver Sophia</a></p>
        <p>Je suis là, quand tu veux.<br/>Sophia</p>
      </div>
    `;
  }

  if (type === "trial_ended_j_plus_3") {
    return `
      <div style="${commonStyle}">
        <p>Hello ${prenom},</p>
        <p>Ça fait 3 jours depuis la fin de l’essai, et j’ai une question (vraiment simple) :</p>
        <p><strong>Est-ce que tu as senti une différence ?</strong></p>
        <p>Pas forcément énorme. Juste… ce moment où tu te dis :</p>
        <ul>
          <li>“j’aurais eu besoin d’un petit rappel”</li>
          <li>“j’aurais aimé faire le point”</li>
          <li>“j’ai laissé passer un truc”</li>
        </ul>
        <p><strong>Je ne suis pas là pour te mettre la pression.</strong><br/>Je suis là pour t’éviter de tout porter seul, surtout les jours où ta motivation fait la grève.</p>
        <p>Si tu veux retrouver ce rythme sans prise de tête :</p>
        <p><a href="${subscribeLink}" style="${btnStyle}">On reprend</a></p>
        <p>À toi de voir.<br/>Sophia</p>
      </div>
    `;
  }

  if (type === "trial_ended_j_plus_5") {
    return `
      <div style="${commonStyle}">
        <p>Hello ${prenom},</p>
        <p>Je t’écris une dernière fois et après je te laisse respirer.</p>
        <p>Si tu n’as pas continué, c’est ok. Vraiment.</p>
        <p>Mais j’aimerais comprendre un truc (et ça m’aide énormément) :</p>
        <p><strong>Qu’est-ce qui t’a manqué pour que Sophia devienne “évidente” pour toi ?</strong></p>
        <ul>
          <li>trop tôt ?</li>
          <li>pas assez clair ?</li>
          <li>pas assez utile au quotidien ?</li>
          <li>autre chose ?</li>
        </ul>
        <p>Tu peux répondre en 1 phrase, même brutalement. Je prends.</p>
        <p>Merci d’avoir testé, et prends soin de toi.<br/>Sophia</p>
      </div>
    `;
  }

  return "";
}

async function getConfigValue(supabase: any, key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", key)
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data?.value ?? null;
  } catch {
    return null;
  }
}

