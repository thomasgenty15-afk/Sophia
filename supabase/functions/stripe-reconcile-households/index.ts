import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { stripeRequest } from "../_shared/stripe.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { KEEL_HOUSEHOLD_PRICE_ENV, periodMonthKey } from "../_shared/billing-tier.ts";
import {
  decideHouseholdQuantity,
  decisionColumns,
  type HouseholdDecision,
  type StripeSubscriptionLike,
} from "./reconcile.ts";

/**
 * LE FOYER — la réconciliation mensuelle (chantier 1).
 *
 * ---------------------------------------------------------------------------
 * CE QU'ELLE FAIT
 * ---------------------------------------------------------------------------
 * Pour chaque foyer: recompter les PROFILS RÉCLAMÉS depuis la base
 * (`keel_household_billable_profiles`, la définition unique du dépôt), écrire
 * le compte dans `household_billing_periods`, puis le pousser comme quantité
 * de l'article « profil réclamé » sur l'abonnement DU COMPTE MAÎTRE.
 *
 * `subscriptions.user_id` est UNIQUE et le foyer n'a pas d'identité Stripe:
 * l'abonnement est celui du maître, jamais celui du foyer.
 *
 * ---------------------------------------------------------------------------
 * ELLE RECOMPUTE, ELLE N'INCRÉMENTE JAMAIS
 * ---------------------------------------------------------------------------
 * Il n'y a aucun `+1` dans ce fichier. Chaque passage dérive le compte de la
 * base et l'`upsert`. Conséquences, qui sont toute la raison pour laquelle un
 * job de facturation est sûr à posséder: un double passage ne change rien, un
 * passage manqué est réparé par le suivant, et une facture fausse se corrige en
 * relançant plutôt qu'en écrivant une compensation.
 *
 * ---------------------------------------------------------------------------
 * LA LIGNE EN BASE EST ÉCRITE AVANT L'APPEL STRIPE
 * ---------------------------------------------------------------------------
 * `active_profile_count` (ce qu'on a calculé) et `pushed_quantity` (ce que
 * Stripe a accepté) sont deux colonnes, jamais une. Si la poussée échoue, la
 * ligne existe quand même avec `push_error` et `pushed_quantity` nul: l'écart
 * est LISIBLE au lieu d'être déduit d'un log manquant.
 *
 * `mouth_count` est écrit à côté: le plafond de 8 (garde de COÛT LLM) et la
 * quantité de facture sont deux nombres de deux natures, et la CHECK
 * `active_profile_count <= mouth_count` mord le jour où quelqu'un branche l'un
 * sur l'autre.
 *
 * ---------------------------------------------------------------------------
 * ELLE REFUSE DE TOURNER SANS PRIX, ET ELLE LE DIT
 * ---------------------------------------------------------------------------
 * Les deux prix sont réclamés AU DÉMARRAGE, avant même de lire un foyer: sans
 * eux la fonction rend « Missing env var: … » et ne traite aucun foyer. Créer
 * un prix Stripe est un geste HUMAIN (les secrets sont bloqués pour les
 * agents). Le mode dégradé — tourner, ne rien trouver, écrire des lignes à
 * zéro — produirait une table qui ressemble à « aucun foyer n'a de profil
 * réclamé », c'est-à-dire à un produit qui marche.
 *
 * Elle ne facture jamais immédiatement: `proration_behavior=none` — un
 * changement de quantité tombe sur la facture suivante, donc réclamer son
 * profil le 28 ne déclenche pas de prélèvement surprise en milieu de cycle.
 *
 * Invocation: POST avec `X-Internal-Secret` (cron). Corps optionnel:
 *   { month: "YYYY-MM-01", household_id: "<uuid>", dry_run: true }
 */

type HouseholdRow = {
  id: string;
  free_until: string | null;
};

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function firstOfMonth(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-01$/.test(s)) return s;
  return periodMonthKey(new Date());
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);

  const guard = ensureInternalRequest(req);
  if (guard) return guard;

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    // LES DEUX PRIX, EXIGÉS AVANT DE LIRE LE PREMIER FOYER.
    //
    // ⚠️ DIVERGENCE ASSUMÉE avec `stripe-reconcile-seats`, qui ne réclame le
    // prix qu'au moment de créer un article. Là-bas c'était pour qu'un
    // déploiement ne vendant que du mensuel continue de tourner. Ici les deux
    // prix sont les DEUX POSTES DU MÊME CONTRAT: il n'existe aucun foyer
    // facturable sans les deux, et « tourner à moitié » ne produirait que des
    // lignes trompeuses.
    requireEnv(KEEL_HOUSEHOLD_PRICE_ENV.flatMonthly);
    requireEnv(KEEL_HOUSEHOLD_PRICE_ENV.profileMonthly);

    const admin = createClient(supabaseUrl, serviceRole);

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const periodMonth = firstOfMonth(body.month);
    const onlyHouseholdId = typeof body.household_id === "string"
      ? body.household_id.trim()
      : "";
    const dryRun = body.dry_run === true;

    const householdQuery = admin.from("households").select("id,free_until");
    if (onlyHouseholdId) householdQuery.eq("id", onlyHouseholdId);

    const { data: households, error: householdErr } = await householdQuery;
    if (householdErr) {
      console.error("[stripe-reconcile-households] households read error", householdErr);
      await logEdgeFunctionError({
        functionName: "stripe-reconcile-households",
        error: householdErr,
        severity: "error",
        title: "households_read_failed",
        requestId,
        source: "stripe",
      });
      return serverError(req, requestId);
    }

    let processed = 0;
    let pushed = 0;
    let skipped = 0;
    let failed = 0;
    const decisions: Array<Record<string, unknown>> = [];

    for (const house of ((households ?? []) as unknown as HouseholdRow[])) {
      processed++;
      let decision: HouseholdDecision = { action: "abort", reason: "not_evaluated" };
      let billable = 0;
      let mouths = 0;
      let pushedQuantity: number | null = null;
      let pushError: string | null = null;
      let ownerUserId: string | null = null;
      let stripeSubscriptionId: string | null = null;
      let stripeProfileItemId: string | null = null;

      try {
        // LE COMPTE FACTURABLE, PAR LA DÉFINITION UNIQUE DE LA BASE.
        // Ni recompté ici, ni recopié: `keel_household_billable_profiles`
        // porte « une ligne qui a un compte, LE MAÎTRE EXCLU » et c'est le
        // seul endroit où l'oublier est possible.
        const { data: billableRaw, error: billableErr } = await admin.rpc(
          "keel_household_billable_profiles",
          { p_household: house.id },
        );
        if (billableErr) throw billableErr;
        billable = Number(billableRaw ?? 0);

        // LES BOUCHES. Lues APRÈS le compte facturable, exprès: entre les deux
        // lectures un foyer ne peut qu'AJOUTER une bouche (l'ajout est le geste
        // courant), ce qui ne peut pas casser `facturables <= bouches`.
        // L'ordre inverse le pourrait.
        const { count: mouthCount, error: mouthErr } = await admin
          .from("household_members")
          .select("member_id", { count: "exact", head: true })
          .eq("household_id", house.id);
        if (mouthErr) throw mouthErr;
        mouths = Number(mouthCount ?? 0);

        // LE PAYEUR. C'est le compte maître, et il est résolu ici et nulle
        // part ailleurs dans ce fichier.
        const { data: ownerRow, error: ownerErr } = await admin
          .from("household_members")
          .select("user_id")
          .eq("household_id", house.id)
          .eq("role", "owner")
          .maybeSingle();
        if (ownerErr) throw ownerErr;
        ownerUserId = String((ownerRow as any)?.user_id ?? "").trim() || null;

        let stripeSub: StripeSubscriptionLike | null = null;
        if (ownerUserId) {
          const { data: subRow, error: subErr } = await admin
            .from("subscriptions")
            .select("stripe_subscription_id,status")
            .eq("user_id", ownerUserId)
            .maybeSingle();
          if (subErr) throw subErr;
          stripeSubscriptionId =
            String((subRow as any)?.stripe_subscription_id ?? "").trim() || null;

          if (stripeSubscriptionId) {
            stripeSub = await stripeRequest<StripeSubscriptionLike>({
              method: "GET",
              path: `/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
              secretKey: stripeSecretKey,
            });
          }
        }

        decision = ownerUserId
          ? decideHouseholdQuantity({
            subscription: stripeSub,
            billableProfiles: billable,
            // LA GARDE D'ESSAI, PASSÉE EXPLICITEMENT. D4bis: pendant l'essai
            // les profils réclamés sont gratuits AUSSI. L'omettre ne ferait
            // pas échouer l'appel — ça facturerait un foyer couvert.
            freeUntil: house.free_until,
          })
          // Un foyer sans ligne 'owner' n'a personne à facturer. C'est un état
          // impossible par les RPC (le créateur est maître), donc s'il arrive
          // c'est une anomalie de données — nommée, pas devinée.
          : { action: "abort", reason: "no_household_owner" };

        if (!dryRun) {
          if (decision.action === "update_item") {
            stripeProfileItemId = decision.itemId;
            await stripeRequest({
              method: "POST",
              path: `/v1/subscription_items/${encodeURIComponent(decision.itemId)}`,
              secretKey: stripeSecretKey,
              // LA CLÉ D'IDEMPOTENCE porte le foyer, le mois et la quantité:
              // deux passages du même mois avec le même compte ne produisent
              // qu'une écriture Stripe, et un changement réel en produit une
              // nouvelle.
              idempotencyKey:
                `keel_house_${house.id}_${periodMonth}_${decision.quantity}`,
              body: { quantity: decision.quantity, proration_behavior: "none" },
            });
            pushedQuantity = decision.quantity;
            pushed++;
          } else if (decision.action === "create_item") {
            await stripeRequest({
              method: "POST",
              path: "/v1/subscription_items",
              secretKey: stripeSecretKey,
              idempotencyKey: `keel_house_new_${house.id}_${periodMonth}`,
              body: {
                subscription: stripeSubscriptionId,
                price: requireEnv(KEEL_HOUSEHOLD_PRICE_ENV.profileMonthly),
                quantity: decision.quantity,
                proration_behavior: "none",
              },
            });
            pushedQuantity = decision.quantity;
            pushed++;
          } else if (decision.action === "noop") {
            stripeProfileItemId = decision.itemId;
            pushedQuantity = decision.quantity;
          } else {
            skipped++;
          }
        }
      } catch (err) {
        failed++;
        pushError = err instanceof Error ? err.message : String(err);
        console.error(
          `[stripe-reconcile-households] request_id=${requestId} household_id=${house.id} failed`,
          err,
        );
        await logEdgeFunctionError({
          functionName: "stripe-reconcile-households",
          error: err,
          severity: "error",
          title: "household_reconciliation_failed",
          requestId,
          userId: ownerUserId ?? undefined,
          source: "stripe",
          metadata: { household_id: house.id, period_month: periodMonth },
        });
      }

      // LA LIGNE EST ÉCRITE QUOI QU'IL ARRIVE, échec compris. Une période sans
      // ligne est indiscernable d'une période qu'on n'a jamais lancée.
      if (!dryRun) {
        const cols = decisionColumns(decision);
        const { error: upsertErr } = await admin
          .from("household_billing_periods")
          .upsert({
            household_id: house.id,
            period_month: periodMonth,
            active_profile_count: billable,
            mouth_count: mouths,
            free_until_at_computation: house.free_until,
            stripe_subscription_id: stripeSubscriptionId,
            stripe_profile_item_id: stripeProfileItemId,
            pushed_quantity: pushedQuantity,
            pushed_at: pushedQuantity === null ? null : new Date().toISOString(),
            // UNE PANNE ET UN REFUS NOMMÉ NE VONT PAS DANS LA MÊME COLONNE.
            push_error: pushError ?? cols.pushError,
            skip_reason: cols.skipReason,
            computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "household_id,period_month" });
        if (upsertErr) {
          // Remonté comme une VRAIE erreur et pas seulement en console: c'est
          // la ligne qui rend la facturation auditable, et la perdre en silence
          // est le mode d'échec que cette table existe pour empêcher.
          failed++;
          console.error(
            "[stripe-reconcile-households] household_billing_periods upsert error",
            upsertErr,
          );
          await logEdgeFunctionError({
            functionName: "stripe-reconcile-households",
            error: upsertErr,
            severity: "error",
            title: "household_billing_period_write_failed",
            requestId,
            userId: ownerUserId ?? undefined,
            source: "stripe",
            metadata: {
              household_id: house.id,
              period_month: periodMonth,
              active_profile_count: billable,
              mouth_count: mouths,
            },
          });
        }
      }

      decisions.push({
        household_id: house.id,
        billable_profiles: billable,
        mouths,
        action: decision.action,
        detail: decision.action === "abort" || decision.action === "skip"
          ? decision.reason
          : decision.action === "update_item"
          ? `${decision.from}->${decision.quantity}`
          : String((decision as { quantity?: number }).quantity ?? ""),
        push_error: pushError,
      });

      console.log(
        `[stripe-reconcile-households] request_id=${requestId} household_id=${house.id} month=${periodMonth} billable=${billable} mouths=${mouths} action=${decision.action} dry_run=${dryRun}`,
      );
    }

    return jsonResponse(req, {
      ok: true,
      period_month: periodMonth,
      dry_run: dryRun,
      processed,
      pushed,
      skipped,
      failed,
      decisions,
      request_id: requestId,
    });
  } catch (err) {
    console.error("[stripe-reconcile-households] error", err);
    await logEdgeFunctionError({
      functionName: "stripe-reconcile-households",
      error: err,
      severity: "error",
      title: "household_reconciliation_run_failed",
      requestId,
      source: "stripe",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    // « Missing env var: STRIPE_PRICE_ID_HOUSEHOLD_… » remonte TEL QUEL:
    // l'humain qui lit la réponse doit savoir quel secret poser, pas seulement
    // que ça a échoué.
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    return serverError(req, requestId);
  }
});
