import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import {
  badRequest,
  getRequestId,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { stripeRequest } from "../_shared/stripe.ts";
import {
  countSeats,
  householdStripeTrialEnd,
  KEEL_HOUSEHOLD_PRICE_ENV,
  type SeatLedgerRow,
} from "../_shared/billing-tier.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";

// W10 — three shapes on one endpoint.
//   plan omitted           : the legacy B2C checkout (one price, one item).
//   plan='keel_coach'      : the KEEL coach contract — UN SEUL POSTE, le siège
//                            (le forfait de plateforme a été supprimé, voir
//                            plus bas). qty = sièges actifs aujourd'hui.
//   plan='keel_household'  : LE FOYER — deux articles: le forfait 12,99 €/mois
//                            (quantité 1) et le profil réclamé 2 €/mois
//                            (quantité = keel_household_billable_profiles).
// `tier` is optional now, and required only on the legacy shape; the refine
// below is what enforces that, so a malformed body is a 400 and never a
// silently-defaulted subscription.
const BodySchema = z
  .object({
    plan: z.enum(["keel_coach", "keel_household"]).optional(),
    tier: z.enum(["system", "alliance", "architecte"]).optional(),
    interval: z.enum(["monthly", "yearly"]),
    return_path: z.string().optional(),
  })
  .strict()
  .refine((b) => Boolean(b.plan) || Boolean(b.tier), {
    // Ce message peut remonter dans une réponse d'API, donc il ne nomme aucun
    // produit: « KEEL » est le nom de code INTERNE, et il n'apprend rien à qui
    // lit l'erreur. Ce qui manque est un `plan` ou un `tier`, et c'est ce que
    // la phrase dit maintenant.
    message: "tier is required unless a plan is given",
    path: ["tier"],
  })
  // LE FOYER N'A PAS D'ANNUEL. Les deux prix sont mensuels et il n'en existe
  // pas d'autres: accepter `yearly` ici enverrait `requireEnv` chercher une
  // variable que personne ne posera jamais, et l'erreur ressemblerait à une
  // panne de configuration au lieu d'une demande impossible.
  .refine((b) => b.plan !== "keel_household" || b.interval === "monthly", {
    message: "the household plan is monthly only",
    path: ["interval"],
  });

type StripeSub = { id?: string; status?: string };

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * La locale du tunnel Stripe, depuis `profiles.locale`.
 *
 * DEUX VALEURS ET UN REPLI, délibérément. Stripe accepte une trentaine de
 * locales; en énumérer trente ici créerait une liste à tenir à jour contre une
 * table qu'on ne contrôle pas. Le produit coach naît en anglais (R3) et ses
 * seuls utilisateurs connus sont anglophones ou francophones — on nomme ces
 * deux-là et on laisse `auto` (le navigateur) décider pour tous les autres.
 *
 * `auto` plutôt que `'en'` en repli: une locale absente veut dire « on ne sait
 * pas », et le navigateur en sait plus que nous.
 */
function stripeLocaleFrom(raw: unknown): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v.startsWith("fr")) return "fr";
  if (v.startsWith("en")) return "en";
  return "auto";
}

function isStripeSubActive(sub: StripeSub | null | undefined): boolean {
  const st = String(sub?.status ?? "").toLowerCase();
  return st === "active" || st === "trialing";
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  let currentUserId: string | null = null;

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;

  if (req.method !== "POST") {
    return jsonResponse(
      req,
      { error: "Method Not Allowed", request_id: requestId },
      { status: 405 },
    );
  }

  try {
    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");
    const isKeelCoach = body.plan === "keel_coach";
    const isKeelHousehold = body.plan === "keel_household";
    // LE CONTRAT KEEL N'A PLUS DE FORFAIT DE PLATEFORME, donc plus de prix à
    // résoudre ici pour un coach: son unique poste est le siège, lu juste en
    // dessous. `legacyTierPriceId` ne sert qu'aux paliers du produit grand
    // public (`system`, `alliance`, `architecte`), qui eux ont toujours un prix
    // unitaire.
    //
    // Il est réclamé PARESSEUSEMENT: `requireEnv` sur le chemin coach ferait
    // échouer un abonnement pour une variable dont ce chemin n'a plus besoin.
    const legacyTierPriceId = (isKeelCoach || isKeelHousehold) ? null : requireEnv(
      `STRIPE_PRICE_ID_${String(body.tier).toUpperCase()}_${body.interval.toUpperCase()}`,
    );
    const seatPriceId = isKeelCoach
      ? requireEnv(`STRIPE_PRICE_ID_COACH_SEAT_${body.interval.toUpperCase()}`)
      : null;
    // LE FOYER: DEUX PRIX, EXIGÉS ENSEMBLE. Le profil réclamé n'existe pas sans
    // le forfait — ce sont deux postes d'un même contrat, pas deux options. En
    // réclamer un seul laisserait passer une configuration à moitié posée, et
    // le tunnel vendrait un forfait sans jamais facturer les profils.
    const householdFlatPriceId = isKeelHousehold
      ? requireEnv(KEEL_HOUSEHOLD_PRICE_ENV.flatMonthly)
      : null;
    const householdProfilePriceId = isKeelHousehold
      ? requireEnv(KEEL_HOUSEHOLD_PRICE_ENV.profileMonthly)
      : null;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAuthed = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuthed.auth.getUser();
    if (authError || !user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }
    currentUserId = user.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

    // W10 — the KEEL contract is sold to a COACH. The caller's coach identity
    // is resolved server-side from their JWT; it is never taken from the body.
    // A non-coach asking for plan='keel_coach' is refused rather than sold a
    // subscription whose seat line nothing would ever reconcile.
    let coachId: string | null = null;
    let initialSeatQuantity = 0;
    if (isKeelCoach) {
      const { data: coachRow, error: coachErr } = await supabaseAdmin
        .from("coaches")
        .select("id,status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (coachErr) {
        console.error("[stripe-create-checkout-session] coach read error", coachErr);
        await logEdgeFunctionError({
          functionName: "stripe-create-checkout-session",
          error: coachErr,
          severity: "error",
          title: "coach_read_failed",
          requestId,
          userId: currentUserId,
          source: "stripe",
        });
        return serverError(req, requestId);
      }
      if (!coachRow || (coachRow as any).status !== "active") {
        return jsonResponse(
          req,
          { error: "Not an active coach", request_id: requestId },
          { status: 403 },
        );
      }
      coachId = String((coachRow as any).id);

      // The seat line starts at TODAY's active-seat count, read from the same
      // ledger the coach's billing page renders and the monthly job sums. If
      // the read fails we start the seat line at zero rather than guess: the
      // reconciliation job is the authority and it runs monthly. Overcharging
      // on a failed read is the one outcome that is not recoverable by a retry.
      const { data: ledger, error: ledgerErr } = await supabaseAdmin
        .rpc("keel_coach_seat_ledger", { p_coach_id: coachId });
      if (ledgerErr) {
        console.warn(
          "[stripe-create-checkout-session] seat ledger read failed; starting at 0 seats",
          ledgerErr,
        );
      } else {
        initialSeatQuantity = countSeats(
          (ledger ?? []) as unknown as SeatLedgerRow[],
        ).active;
      }
    }

    // ── LE FOYER — LE CONTRAT EST VENDU AU COMPTE MAÎTRE ───────────────────
    //
    // `subscriptions.user_id` est UNIQUE et le foyer n'a pas d'identité
    // Stripe: l'abonnement est celui du MAÎTRE. C'est aussi lui qui a la
    // carte, et c'est pour ça que les 2 € du profil réclamé sont une ligne de
    // SON abonnement — demander une carte à quelqu'un pour 2 € est
    // disproportionné.
    //
    // L'identité du foyer est résolue côté serveur depuis le JWT, jamais prise
    // dans le corps: un membre qui demanderait `plan='keel_household'` doit
    // être refusé, pas vendu un abonnement dont personne ne réconcilierait la
    // ligne de profils.
    let householdId: string | null = null;
    let householdProfileQuantity = 0;
    /** `households.free_until` — lu pour CALCULER la bascule, plus pour refuser. */
    let householdFreeUntil: string | null = null;
    if (isKeelHousehold) {
      const { data: memberRow, error: memberErr } = await supabaseAdmin
        .from("household_members")
        .select("household_id,role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (memberErr) {
        console.error("[stripe-create-checkout-session] household read error", memberErr);
        await logEdgeFunctionError({
          functionName: "stripe-create-checkout-session",
          error: memberErr,
          severity: "error",
          title: "household_read_failed",
          requestId,
          userId: currentUserId,
          source: "stripe",
        });
        return serverError(req, requestId);
      }
      if (!memberRow || (memberRow as any).role !== "owner") {
        return jsonResponse(
          req,
          { error: "not_household_owner", request_id: requestId },
          { status: 403 },
        );
      }
      householdId = String((memberRow as any).household_id);

      // L'ESSAI (D4bis). Un foyer couvert n'est pas facturé — PROFILS RÉCLAMÉS
      // COMPRIS, « un seul abonnement, un seul état ».
      //
      // ⟳ RENVERSÉ LE 2026-09-09 (FF-064, décision du propriétaire). Ce bloc
      // rendait `409 household_in_trial`: quelqu'un qui VOULAIT payer pendant
      // son essai était renvoyé, et le produit n'avait donc AUCUNE fenêtre de
      // vente avant la coupure.
      //
      // L'objection écrite ici était juste, et elle est nommée pour qu'on ne la
      // redécouvre pas: ouvrir le tunnel avec `subscription_data.trial_end`
      // fait dépendre la promesse d'une contrainte Stripe (48 h), et un essai
      // qui finit demain « la violerait en silence ». Sa réponse est le repli
      // de `householdStripeTrialEnd`: à moins de 48 h restantes on repousse à
      // 49 h, donc le prélèvement ne tombe JAMAIS avant la fin de la semaine
      // offerte — au pire un ou deux jours après.
      //
      // CE QUI RESTE VRAI: `stripe-reconcile-households` refuse toujours de
      // pousser une quantité pendant l'essai (`skip_reason=in_trial`), et
      // `households.free_until` reste la source unique — cette lecture ne sert
      // plus à refuser, elle sert à calculer la date de bascule.
      const { data: houseRow, error: houseErr } = await supabaseAdmin
        .from("households")
        .select("free_until")
        .eq("id", householdId)
        .maybeSingle();
      if (houseErr) {
        console.error("[stripe-create-checkout-session] household free_until read error", houseErr);
        await logEdgeFunctionError({
          functionName: "stripe-create-checkout-session",
          error: houseErr,
          severity: "error",
          title: "household_free_until_read_failed",
          requestId,
          userId: currentUserId,
          source: "stripe",
        });
        return serverError(req, requestId);
      }
      householdFreeUntil =
        (houseRow as { free_until?: string | null } | null)?.free_until ?? null;

      // LA QUANTITÉ DE PROFILS RÉCLAMÉS, PAR LA DÉFINITION UNIQUE DE LA BASE.
      // `keel_household_billable_profiles` exclut le maître et les bouches
      // sans compte. Recompter ici, en TypeScript, ferait diverger l'écran de
      // la facture — et l'écart ne se verrait qu'au premier prélèvement.
      //
      // Sur échec de lecture on démarre à ZÉRO profil plutôt que de deviner:
      // le job de réconciliation est l'autorité et il tourne tous les mois.
      // Sur-facturer sur une lecture ratée est la seule issue qu'un nouvel
      // essai ne répare pas.
      const { data: billableRaw, error: billableErr } = await supabaseAdmin
        .rpc("keel_household_billable_profiles", { p_household: householdId });
      if (billableErr) {
        console.warn(
          "[stripe-create-checkout-session] billable profiles read failed; starting at 0",
          billableErr,
        );
      } else {
        const n = Number(billableRaw ?? 0);
        householdProfileQuantity = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      }
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      // `locale` sert UNIQUEMENT à localiser le tunnel de paiement de Stripe
      // (ses propres libellés: « S'abonner », « Total », les moyens de
      // paiement). Il ne traduit RIEN de ce qui vient de nous — le nom du
      // produit est une valeur unique côté Stripe, dans une seule langue.
      .select("stripe_customer_id,email,locale")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[stripe-create-checkout-session] profile read error", profileErr);
      await logEdgeFunctionError({
        functionName: "stripe-create-checkout-session",
        error: profileErr,
        severity: "error",
        title: "profile_read_failed",
        requestId,
        userId: currentUserId,
        source: "stripe",
      });
      return serverError(req, requestId);
    }

    let customerId = String((profile as any)?.stripe_customer_id ?? "").trim() || null;

    if (!customerId) {
      const createdCustomer = await stripeRequest<{ id?: string }>({
        method: "POST",
        path: "/v1/customers",
        secretKey: stripeSecretKey,
        body: {
          email: (user as any)?.email ?? (profile as any)?.email ?? undefined,
          metadata: {
            supabase_user_id: user.id,
          },
        },
      });
      customerId = String(createdCustomer?.id ?? "").trim() || null;
      if (!customerId) {
        return badRequest(req, requestId, "Unable to create Stripe customer");
      }
      const { error: updateProfileErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if (updateProfileErr) {
        console.error(
          "[stripe-create-checkout-session] profile update customer error",
          updateProfileErr,
        );
        await logEdgeFunctionError({
          functionName: "stripe-create-checkout-session",
          error: updateProfileErr,
          severity: "error",
          title: "profile_customer_update_failed",
          requestId,
          userId: currentUserId,
          source: "stripe",
          metadata: { stripe_customer_id: customerId },
        });
        return serverError(req, requestId);
      }
    }

    const stripeSubs = await stripeRequest<{ data?: StripeSub[] }>({
      method: "GET",
      path: `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
      secretKey: stripeSecretKey,
    });
    const activeSub = (stripeSubs?.data ?? []).find((s) => isStripeSubActive(s));

    // Product rule: if the user already has an active/trialing subscription, send them to Stripe Portal.
    if (activeSub?.id) {
      const returnUrl = `${appBaseUrl}${
        body.return_path ??
          (isKeelCoach
            ? "/coach/billing?billing=portal"
            : isKeelHousehold
            ? "/app/billing?billing=portal"
            : "/dashboard?billing=portal")
      }`;
      const portal = await stripeRequest<{ url?: string }>({
        method: "POST",
        path: "/v1/billing_portal/sessions",
        secretKey: stripeSecretKey,
        body: {
          customer: customerId,
          return_url: returnUrl,
        },
      });
      const portalUrl = String(portal?.url ?? "").trim();
      if (!portalUrl) return badRequest(req, requestId, "Portal URL missing");
      await logEdgeFunctionError({
        functionName: "stripe-create-checkout-session",
        error: "Stripe portal session created from checkout route",
        severity: "info",
        title: "billing_portal_created",
        requestId,
        userId: currentUserId,
        source: "stripe",
        metadata: { mode: "portal", stripe_customer_id: customerId, stripe_subscription_id: activeSub.id },
      });
      return jsonResponse(req, { mode: "portal", url: portalUrl, request_id: requestId });
    }

    // ── LE CONTRAT KEEL N'A PLUS QU'UN POSTE: LE SIÈGE ──────────────────────
    //
    // Le forfait de plateforme est SUPPRIMÉ. Il imposait au coach un point mort
    // à ~13 élèves — en dessous, chaque mois lui coûtait plus qu'il ne lui
    // rapportait, quel que soit son sérieux — alors que l'essai le fait
    // justement démarrer à 3. Il découvrait le calcul le jour où on lui
    // demandait sa carte.
    //
    // Sans forfait, la phrase de vente devient littéralement vraie: dès le
    // premier élève, le coach gagne de l'argent. Et le manque à gagner est
    // faible: à l'échelle, le forfait ne pesait presque rien face aux sièges —
    // il ne coûtait que les petits coachs, c'est-à-dire la longue traîne.
    //
    // Le poste siège reste OMIS quand le coach n'a encore aucun élève actif:
    // Stripe refuse une quantité de 0, et démarrer à 1 facturerait un siège que
    // personne n'occupe. `stripe-reconcile-seats` crée l'article le mois où le
    // premier élève apparaît — il gère « article présent » comme « article
    // absent », précisément pour que cette branche puisse rester honnête.
    //
    // CONSÉQUENCE POUR UN COACH SANS ÉLÈVE: son panier serait vide, et Stripe
    // refuse une session sans article. On le dit plutôt que de lui vendre un
    // forfait qui n'existe plus.
    const lineItems: Array<Record<string, unknown>> = [];
    if (isKeelCoach) {
      if (!seatPriceId || initialSeatQuantity <= 0) {
        return jsonResponse(req, {
          error: "no_billable_seat",
          detail: "Invite at least one student before subscribing: the contract is billed per seat.",
          request_id: requestId,
        }, { status: 409 });
      }
      lineItems.push({ price: seatPriceId, quantity: initialSeatQuantity });
    } else if (isKeelHousehold) {
      // ── DEUX ARTICLES, ET LE FORFAIT EN PREMIER ─────────────────────────
      //
      // Le foyer, LUI, a bien un forfait: 12,99 €/mois pour le foyer entier,
      // bouches illimitées (plafond technique de 8). C'est le contraire du
      // contrat coach, dont le forfait de plateforme a été supprimé — ne pas
      // raisonner par analogie ici.
      //
      // Le second article, le profil réclamé à 2 €, est OMIS quand personne
      // n'a réclamé son profil: Stripe refuse une quantité de 0, et démarrer
      // à 1 facturerait un accès que personne n'a pris.
      // `stripe-reconcile-households` crée l'article le mois où le premier
      // profil est réclamé — il gère « article présent » comme « article
      // absent », précisément pour que cette branche puisse rester honnête.
      lineItems.push({ price: householdFlatPriceId, quantity: 1 });
      if (householdProfileQuantity > 0) {
        lineItems.push({
          price: householdProfilePriceId,
          quantity: householdProfileQuantity,
        });
      }
    } else {
      lineItems.push({ price: legacyTierPriceId, quantity: 1 });
    }

    const checkout = await stripeRequest<{ url?: string; id?: string }>({
      method: "POST",
      path: "/v1/checkout/sessions",
      secretKey: stripeSecretKey,
      body: {
        mode: "subscription",
        customer: customerId,
        success_url: isKeelCoach
          ? `${appBaseUrl}/coach/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`
          : isKeelHousehold
          ? `${appBaseUrl}/app/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`
          : `${appBaseUrl}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: isKeelCoach
          ? `${appBaseUrl}/coach/billing?billing=cancelled`
          : isKeelHousehold
          ? `${appBaseUrl}/app/billing?billing=cancelled`
          : `${appBaseUrl}/upgrade?billing=cancelled`,
        line_items: lineItems,
        // LA LANGUE DU TUNNEL, ET SEULEMENT LA SIENNE.
        //
        // Stripe localise SES libellés — le bouton, « Total », les moyens de
        // paiement, les mentions fiscales. Il ne traduit pas le nom du produit,
        // qui est une valeur unique sur l'objet Stripe: il n'existe aucun
        // moyen d'avoir un nom de produit bilingue, et c'est pour ça que le
        // nôtre est en anglais comme tout le reste des surfaces coach (R3).
        //
        // `auto` en repli, jamais 'en' en dur: `auto` suit le navigateur, ce
        // qui est plus juste qu'un défaut choisi par nous pour un coach dont on
        // n'a pas encore lu la locale.
        locale: stripeLocaleFrom((profile as { locale?: unknown } | null)?.locale),
        allow_promotion_codes: true,
        client_reference_id: user.id,
        subscription_data: {
          // ── FF-064 · LA SEMAINE OFFERTE SURVIT AU PAIEMENT ANTICIPÉ ─────
          // `undefined` quand il n'y a plus d'essai à tenir (foyer gelé) —
          // et `toStripeFormBody` OMET `undefined`, donc « pas d'essai » et
          // « clé absente » sont le même octet. Le calcul, ses trois
          // branches et le repli à 49 h vivent dans
          // `householdStripeTrialEnd` (_shared/billing-tier.ts).
          //
          // ⛔ NE PAS AJOUTER `payment_method_collection: "if_required"`.
          // Avec un `trial_end`, Checkout collecte la carte par défaut;
          // `if_required` laisserait démarrer un essai SANS moyen de
          // paiement, c'est-à-dire un mur qui retombe dans sept jours.
          ...(isKeelHousehold
            ? { trial_end: householdStripeTrialEnd(householdFreeUntil) }
            : {}),
          metadata: {
            supabase_user_id: user.id,
            // The reconciliation job finds the subscription from the coach row;
            // this is the reverse edge, so a Stripe-side inspection can answer
            // "whose roster is this?" without a database.
            ...(coachId ? { keel_coach_id: coachId } : {}),
            // Même arête inverse pour le foyer: le job part du foyer et
            // trouve l'abonnement du maître; ceci permet à une inspection
            // côté Stripe de répondre « quel foyer paie cette ligne ? » sans
            // base de données.
            ...(householdId ? { keel_household_id: householdId } : {}),
          },
        },
        metadata: {
          supabase_user_id: user.id,
          requested_tier: isKeelCoach
            ? "coach"
            : isKeelHousehold
            ? "household"
            : String(body.tier),
          requested_interval: body.interval,
          ...(isKeelCoach
            ? { keel_initial_seat_quantity: String(initialSeatQuantity) }
            : {}),
          ...(isKeelHousehold
            ? {
              keel_household_id: String(householdId),
              keel_initial_profile_quantity: String(householdProfileQuantity),
            }
            : {}),
        },
      },
    });

    const checkoutUrl = String(checkout?.url ?? "").trim();
    if (!checkoutUrl) return badRequest(req, requestId, "Checkout URL missing");

    await logEdgeFunctionError({
      functionName: "stripe-create-checkout-session",
      error: "Stripe checkout session created",
      severity: "info",
      title: "checkout_session_created",
      requestId,
      userId: currentUserId,
      source: "stripe",
      metadata: {
        mode: "checkout",
        checkout_session_id: checkout?.id ?? null,
        stripe_customer_id: customerId,
        requested_tier: isKeelCoach ? "coach" : isKeelHousehold ? "household" : body.tier,
        requested_interval: body.interval,
        keel_coach_id: coachId,
        keel_initial_seat_quantity: isKeelCoach ? initialSeatQuantity : null,
        keel_household_id: householdId,
        keel_initial_profile_quantity: isKeelHousehold ? householdProfileQuantity : null,
      },
    });

    return jsonResponse(req, {
      mode: "checkout",
      url: checkoutUrl,
      checkout_session_id: checkout?.id ?? null,
      // The coach sees, before paying, the seat count they are about to be
      // charged for. Two numbers, never merged, all the way to the invoice.
      ...(isKeelCoach ? { seat_quantity: initialSeatQuantity } : {}),
      // Le maître voit, AVANT de payer, combien de profils réclamés lui sont
      // facturés en plus du forfait. Deux articles, deux nombres, jamais un
      // total opaque.
      ...(isKeelHousehold ? { profile_quantity: householdProfileQuantity } : {}),
      request_id: requestId,
    });
  } catch (err) {
    console.error("[stripe-create-checkout-session] error", err);
    await logEdgeFunctionError({
      functionName: "stripe-create-checkout-session",
      error: err,
      severity: "error",
      title: "checkout_session_failed",
      requestId,
      userId: currentUserId,
      source: "stripe",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    if (msg.toLowerCase().includes("stripe")) return badRequest(req, requestId, msg);
    return serverError(req, requestId);
  }
});
