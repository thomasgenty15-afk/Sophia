/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { type CoachDoctrine, parseCoachDoctrine } from "../_shared/keel/doctrine.ts";
import { FOOD_GROUP_REFS } from "../_shared/keel/tokens.ts";

/**
 * `/coach/protocol` — LES DEUX SEULS ENDROITS OÙ UN MODÈLE TOUCHE À L'ÉCRAN
 * « RECOMMENDED FOOD ».
 *
 *   classify_food — un aliment que le coach a ajouté au « + » -> à quel groupe
 *                   du vocabulaire FERMÉ il se rattache, et sur quel axe il se
 *                   compte. Plus, si le coach a une doctrine, un premier jet du
 *                   « pourquoi ».
 *   draft_why     — réécrit le « pourquoi » d'un aliment, À PARTIR DE LA
 *                   DOCTRINE DU COACH.
 *
 * ---------------------------------------------------------------------------
 * LA RÈGLE QUI GOUVERNE TOUT CE FICHIER
 * ---------------------------------------------------------------------------
 * Le modèle n'écrit JAMAIS de nutrition. Il écrit ce que LE COACH pense, dans
 * les mots du coach.
 *
 * Ce n'est pas une préférence de ton, c'est la raison d'être du produit: si
 * KEEL livre du contenu nutritionnel tout fait, KEEL devient l'autorité
 * nutritionnelle — avec la responsabilité qui va avec, sur un produit qui n'est
 * pas médical — et ce que le coach vend (SA méthode, qui répond en son absence)
 * n'existe plus. La base le dit déjà pour les lignes de méthode:
 * `student_week_plans_doctrine_traceable_check` refuse une ligne qui ne nomme
 * pas la conviction dont elle sort.
 *
 * Trois conséquences, toutes appliquées ici:
 *
 *   1. DOCTRINE VIDE ⇒ ON REFUSE. On ne rédige pas « depuis les connaissances
 *      générales » en attendant que le coach écrive la sienne. Une ceinture
 *      armée sur un coffre vide est un défaut déjà payé dans ce dépôt: mieux
 *      vaut un bouton qui dit « écris tes convictions d'abord » qu'un texte
 *      plausible que personne n'a pensé.
 *   2. AUCUNE ALLÉGATION DE SANTÉ. Le prompt l'interdit nommément, et la
 *      consigne est répétée en fin de prompt — c'est là que les modèles la
 *      relisent.
 *   3. LE COACH GAGNE TOUJOURS. L'écriture est CONDITIONNÉE en base
 *      (`where why_source <> 'coach'`): une régénération ne peut pas écraser un
 *      texte que le coach a édité. Ce n'est pas une convention côté client —
 *      c'est la clause WHERE, donc c'est vrai même si l'écran a un bug.
 *
 * ---------------------------------------------------------------------------
 * LE VOCABULAIRE RESTE FERMÉ, MÊME QUAND C'EST UN MODÈLE QUI PROPOSE
 * ---------------------------------------------------------------------------
 * `classify_food` rend un slug de `food_groups` et RIEN D'AUTRE. Le slug rendu
 * est re-vérifié contre la table avant d'être renvoyé: un modèle qui invente
 * `kefir_maison` obtient un `null`, et l'écran retombe sur la catégorie que le
 * coach avait choisie lui-même. Un slug privé casserait la vision (qui énumère
 * les 30) et rendrait la jointure photo↔méthode partielle sans que personne ne
 * le voie.
 */

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** JWT -> `coaches` actif. Aucun `coach_id` n'est accepté du client. */
async function requireCoach(
  req: Request,
  admin: SupabaseClient,
): Promise<{ coachId: string } | Response> {
  const requestId = getRequestId(req);
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
  }
  const { data: coach, error: coachErr } = await admin
    .from("coaches")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (coachErr) throw coachErr;
  if (!coach) {
    return jsonResponse(req, { error: "not_a_coach", request_id: requestId }, { status: 403 });
  }
  const row = coach as { id: string; status: string };
  if (row.status !== "active") {
    return jsonResponse(req, { error: "coach_suspended", request_id: requestId }, { status: 403 });
  }
  return { coachId: row.id };
}

// ---------------------------------------------------------------------------
// LA DOCTRINE DU COACH — la seule matière autorisée
// ---------------------------------------------------------------------------

/**
 * La doctrine PUBLIÉE d'abord, sinon la dernière écrite.
 *
 * C'est ce que le coach considère comme « sa » doctrine — même choix que
 * `coach-doctrine-v1` action `current`. Un brouillon plus récent qu'il n'a pas
 * publié reste son travail en cours, et c'est bien celui-là qu'il veut voir se
 * refléter pendant qu'il édite.
 */
async function loadDoctrine(
  admin: SupabaseClient,
  coachId: string,
): Promise<CoachDoctrine | null> {
  const { data, error } = await admin
    .from("coach_doctrines")
    .select(
      "coach_id, version, published_at, beliefs, forbidden, vocabulary, arbitrations, foods, qa, voice, content_locale",
    )
    .eq("coach_id", coachId)
    .order("version", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const published = rows.filter((r) => r.published_at !== null);
  const pick = published.length > 0 ? published[published.length - 1] : rows[rows.length - 1];
  return parseCoachDoctrine(pick).doctrine;
}

/**
 * Est-ce qu'il y a assez de matière pour écrire à la place du coach ?
 *
 * Les convictions et les arbitrages, et rien d'autre. Un coach qui n'a rempli
 * que sa « voix » et son vocabulaire n'a pas dit ce qu'il PENSE — rédiger sur
 * cette base produirait de la nutrition générique avec le bon tutoiement, ce
 * qui est pire que rien: ça se lit comme si c'était de lui.
 */
function hasMaterial(doctrine: CoachDoctrine | null): boolean {
  if (!doctrine) return false;
  return doctrine.beliefs.length > 0 || doctrine.arbitrations.length > 0;
}

function doctrineMaterial(doctrine: CoachDoctrine): string {
  const lines: string[] = [];
  for (const b of doctrine.beliefs) {
    lines.push(`- CONVICTION: ${b.claim}${b.rationale ? ` (parce que: ${b.rationale})` : ""}`);
  }
  for (const a of doctrine.arbitrations) {
    lines.push(`- ARBITRAGE: ${a.situation} -> ${a.coachAnswer}`);
  }
  for (const f of doctrine.forbidden) {
    // Le token ET les formes de surface: le token est un identifiant ASCII
    // (`six_small_meals`), les formes sont ce que le coach dit réellement. Ne
    // donner que le token ferait écrire le modèle contre un mot-machine.
    const forms = (f.surfaceForms ?? []).join(", ");
    lines.push(`- INTERDIT: ${f.token}${forms ? ` (« ${forms} »)` : ""}`);
  }
  for (const f of doctrine.foods.discouraged) {
    lines.push(`- ALIMENT ÉCARTÉ: ${f.term}`);
  }
  return lines.join("\n");
}

const WHY_SYSTEM_PROMPT = `
You write ONE sentence explaining why a coach puts a given food on their
students' plates — or keeps it off. You are writing AS THAT COACH, from their
own recorded method, which is given to you.

HARD RULES, in order of importance:

1. Use ONLY the coach's recorded method as your source. You are not a
   nutritionist and you are not adding knowledge. If their method says nothing
   that bears on this food, say so by returning an empty string rather than
   inventing a position they never took.
2. NO HEALTH CLAIMS. Never say a food prevents, treats, lowers, boosts, heals
   or protects against anything. Never mention disease, deficiency, hormones,
   cholesterol, blood sugar, inflammation or metabolism.
3. NO NUMBERS. No calories, no grams of protein, no macro targets, no
   percentages. This product refuses numeric targets by construction.
4. Write about the food's ROLE ON A PLATE and how it fits this coach's method:
   what it makes possible, what it replaces, when it is useful.
5. ONE sentence. Under 25 words. Plain, spoken, the way this coach talks.
6. Write in the language the coach writes in.

Return STRICT JSON: {"why": "..."} — an empty string if their method gives you
nothing honest to say about this food.

Remember rule 1 and rule 2: their method is your only source, and no health
claims. A sentence that could have been written about any coach's students is a
sentence you must not return.
`.trim();

const CLASSIFY_SYSTEM_PROMPT = `
You place a food into a FIXED taxonomy. You never invent a category.

Return STRICT JSON:
{"food_group_ref": "<one slug from the list>", "count_axis": "portion"|"volume"|"count"}

food_group_ref MUST be one of the slugs given in the user message. If none fits,
return null for it — do not pick the least-bad one, and do not invent a slug.

count_axis is how a coach would naturally limit this food:
  - "volume": liquids and fats measured by the spoonful (oils, syrups, drinks)
  - "count":  things eaten as whole units (eggs, bananas, slices, cups)
  - "portion": everything else

This is a MEASUREMENT judgement, not a health judgement. Say nothing about
whether the food is good or bad.
`.trim();

/**
 * `generateWithGemini` rend `string | { tool, args }` — le TEXTE EST la chaîne,
 * il n'y a pas d'enveloppe `{ text }`.
 *
 * Cette fonction existe parce que la première version de ce fichier castait le
 * résultat en `{ text?: string }` avec un `as`. Le typecheck passait — un `as`
 * sur un type étranger fait taire exactement la vérification qui aurait
 * attrapé l'erreur — et les deux actions rendaient `null` en silence, avec des
 * appels LLM à 200 dans les logs. Mesuré en réel, invisible à la relecture.
 *
 * Une branche `tool` ne devrait jamais arriver ici (aucun outil n'est passé),
 * mais elle rend une chaîne vide plutôt que `[object Object]`: on préfère
 * « il n'avait rien à dire » à un JSON qui ne parse pas.
 */
function modelText(result: unknown): string {
  if (typeof result === "string") return result;
  return "";
}

function parseJsonLoose(raw: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Un modèle qui bavarde autour du JSON reste récupérable; un modèle qui
    // n'en produit pas du tout doit échouer bruyamment, pas rendre un objet
    // vide qu'on prendrait pour « il n'avait rien à dire ».
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("model_returned_no_json");
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  // `handleCorsOptions` rend TOUJOURS une Response — c'est le gestionnaire de
  // préflight, pas son détecteur. L'appeler sans garde répond « ok » à tout et
  // la fonction ne tourne jamais.
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();
    const auth = await requireCoach(req, admin);
    if (auth instanceof Response) return auth;
    const { coachId } = auth;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body.action ?? "").trim();

    // ---- classify_food ---------------------------------------------------
    if (action === "classify_food") {
      const term = String(body.term ?? "").trim();
      if (!term || term.length > 80) {
        return jsonResponse(req, {
          ok: false,
          reason: "bad_term",
          request_id: requestId,
        }, { status: 400 });
      }

      const result = await generateWithGemini(
        CLASSIFY_SYSTEM_PROMPT,
        `Food: ${term}\n\nAllowed slugs:\n${FOOD_GROUP_REFS.join("\n")}`,
        0.1,
        true,
        [],
        "auto",
        { requestId },
      );

      let groupRef: string | null = null;
      let countAxis: string | null = null;
      try {
        const parsed = parseJsonLoose(modelText(result));
        const candidate = String(parsed.food_group_ref ?? "").trim();
        // LE VOCABULAIRE RESTE FERMÉ, même quand c'est un modèle qui propose.
        // Vérifié contre la TABLE et pas seulement contre la constante: c'est
        // la FK qui refusera l'écriture, donc c'est elle la vérité.
        if (candidate) {
          const { data: exists } = await admin
            .from("food_groups")
            .select("slug")
            .eq("slug", candidate)
            .maybeSingle();
          if (exists?.slug) groupRef = exists.slug as string;
        }
        const axis = String(parsed.count_axis ?? "").trim();
        if (axis === "portion" || axis === "volume" || axis === "count") countAxis = axis;
      } catch (e) {
        console.warn("keel.protocol.classify_unparseable", {
          request_id: requestId,
          detail: e instanceof Error ? e.message : String(e),
        });
      }

      // Le « pourquoi » du premier jet, seulement si le coach a de la matière.
      // Un ajout d'aliment ne doit pas échouer parce qu'il n'a pas de doctrine.
      let why: string | null = null;
      const doctrine = await loadDoctrine(admin, coachId);
      if (hasMaterial(doctrine)) {
        why = await draftWhy(doctrine!, term, "encouraged", requestId);
      }

      return jsonResponse(req, {
        ok: true,
        food_group_ref: groupRef,
        count_axis: countAxis,
        why,
        request_id: requestId,
      });
    }

    // ---- draft_why -------------------------------------------------------
    if (action === "draft_why") {
      const itemId = String(body.item_id ?? "").trim();
      if (!itemId) {
        return jsonResponse(req, {
          ok: false,
          reason: "bad_item",
          request_id: requestId,
        }, { status: 400 });
      }

      // La ligne est relue AVEC son `coach_id`: un coach ne rédige que sur ses
      // propres lignes, et l'id vient du JWT, jamais du corps de la requête.
      const { data: item, error: itemErr } = await admin
        .from("coach_food_items")
        .select("id, label, stance, why_source")
        .eq("id", itemId)
        .eq("coach_id", coachId)
        .maybeSingle();
      if (itemErr) throw itemErr;
      if (!item) {
        return jsonResponse(req, {
          ok: false,
          reason: "not_found",
          request_id: requestId,
        }, { status: 404 });
      }

      const doctrine = await loadDoctrine(admin, coachId);
      if (!hasMaterial(doctrine)) {
        // On refuse, et on dit POURQUOI. « Ça a raté » enverrait le coach
        // chercher une panne; « écris tes convictions d'abord » lui dit quoi
        // faire.
        return jsonResponse(req, { ok: false, reason: "no_doctrine", request_id: requestId });
      }

      const row = item as { id: string; label: string; stance: string; why_source: string };
      const why = await draftWhy(doctrine!, row.label, row.stance, requestId);
      if (!why) {
        return jsonResponse(req, { ok: false, reason: "nothing_to_say", request_id: requestId });
      }

      // ⚠️ LA GARDE STRUCTURELLE. `where why_source <> 'coach'` — une
      // régénération ne peut pas écraser un texte que le coach a édité. Ce
      // dépôt a payé ce défaut exact sur la carte de défense: l'enrichissement
      // LLM réécrivait par-dessus les éditions, qui disparaissaient sans que
      // personne ne comprenne. La clause WHERE le rend impossible, y compris
      // si l'écran appelle cette action à tort.
      const { data: updated, error: updErr } = await admin
        .from("coach_food_items")
        .update({ why, why_source: "ai", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("coach_id", coachId)
        .neq("why_source", "coach")
        .select("id, why")
        .maybeSingle();
      if (updErr) throw updErr;
      if (!updated) {
        return jsonResponse(req, { ok: false, reason: "coach_owned", request_id: requestId });
      }

      return jsonResponse(req, { ok: true, why: updated.why, request_id: requestId });
    }

    return jsonResponse(req, {
      ok: false,
      error: "unknown_action",
      request_id: requestId,
    }, { status: 400 });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "coach-protocol-v1",
      error,
      requestId,
    });
    return jsonResponse(req, {
      ok: false,
      error: "internal_error",
      request_id: requestId,
    }, { status: 500 });
  }
});

/**
 * Rédige le « pourquoi » — ou rend `null` quand la doctrine ne dit rien sur cet
 * aliment.
 *
 * `null` n'est PAS un échec: c'est la sortie honnête quand le coach n'a rien
 * écrit qui porte sur cet aliment. Fabriquer une phrase à ce moment-là est
 * exactement le comportement que ce fichier existe pour empêcher.
 */
async function draftWhy(
  doctrine: CoachDoctrine,
  label: string,
  stance: string,
  requestId: string,
): Promise<string | null> {
  const voice = doctrine.voice ?? {};
  const language = (voice as { language?: string | null }).language ??
    doctrine.contentLocale ?? "en-GB";

  const user = [
    `The coach's recorded method:`,
    doctrineMaterial(doctrine),
    ``,
    `Food: ${label}`,
    `The coach's position on it: ${
      stance === "encouraged"
        ? "they build with it"
        : stance === "discouraged"
        ? "they want it kept light"
        : "they rule it out"
    }`,
    `Write in: ${language}`,
  ].join("\n");

  const result = await generateWithGemini(
    WHY_SYSTEM_PROMPT,
    user,
    0.4,
    true,
    [],
    "auto",
    { requestId },
  );

  try {
    const parsed = parseJsonLoose(modelText(result));
    const why = String(parsed.why ?? "").trim();
    return why.length > 0 ? why : null;
  } catch (e) {
    console.warn("keel.protocol.why_unparseable", {
      request_id: requestId,
      detail: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
