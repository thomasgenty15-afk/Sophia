/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 8 · FAMILLE « INTÉGRATION » — UNE VRAIE REQUÊTE, LE VRAI HANDLER,
 * LA VRAIE BASE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────
 *
 * Tout le lot 1 (« une admission unique, de une à plusieurs personnes ») était
 * éprouvé de DEUX façons, et aucune des deux ne touchait la fonction:
 *
 *   ① `generation_context_test.ts` — le résolveur, PUR. Il démontre l'ordre
 *      des refus, jamais qu'il est branché.
 *   ② `generation_context_wiring_test.ts` — des RECHERCHES DE CHAÎNES dans
 *      `generate-household-meal-v1/index.ts`. Un test qui lit du texte source
 *      reste vert si la ligne existe et ne s'exécute jamais.
 *
 * Une relecture extérieure l'a nommé le 2026-09-11: « les recherches de
 * chaînes dans le code ne remplacent pas ces tests ». Ce fichier est la
 * troisième façon: on POSTE sur `/functions/v1/generate-household-meal-v1`,
 * avec un vrai jeton signé par l'instance, et on lit le vrai refus.
 *
 * ── CE QUE CE FICHIER NE FAIT PAS, ET POURQUOI ────────────────────────────
 *
 * ⛔ LES SEPT PREMIERS CAS NE FONT AUCUN APPEL MODÈLE. Chacun s'arrête AVANT
 * la génération — soit sur un refus d'admission, soit sur `replaces_required`,
 * une garde de corps de requête qui vit juste après l'admission. Ils tournent
 * en une seconde et ne coûtent rien.
 *
 * ── LES DEUX DERNIERS DÉPENSENT, ET CE QU'ILS ONT MESURÉ ──────────────────
 *
 * Sous `LOT8_REAL_MODEL=1`, les cas ⑧ et ⑨ vont jusqu'à la ligne écrite.
 * Mesuré le 2026-09-11, cinq tirs:
 *
 *   · N = 1 → 200, plan écrit: **66 s**, **144 s**, **73 s**.
 *   · N = 2 → **504** une fois (au-delà de 150 s), puis 200 en **59 s**.
 *
 * ⛔ CE QUE CES CINQ NOMBRES DISENT, ET CE QU'ILS NE DISENT PAS. Ils ne disent
 * PAS « un foyer de deux ne tient pas » — le tir à 59 s est le plus RAPIDE des
 * cinq, avec deux bouches. Ce qu'ils disent, c'est que **la durée est
 * instable** (59 → 144 s sur le même chemin) et que **sa queue dépasse le
 * plafond de l'hébergé**. La taille du foyer n'explique rien ici; la variance,
 * si. Un banc qui ne tire qu'une fois conclura n'importe quoi.
 *
 * ── LE PLAFOND SE LÈVE EN LOCAL, ET C'EST UTILE — À UNE CONDITION ─────────
 *
 * `scripts/local_extend_kong_functions_timeout.sh` porte le `read_timeout` à
 * 600 s (`kong reload`, sans redémarrage). C'est comme ça que les runs longs de
 * ce dépôt ont été mesurés — l'en-tête du lot 0 de `index.ts` le dit en toutes
 * lettres: « un Kong local patché à 900 s qui masquait justement la coupure ».
 * ⚠️ Un `supabase stop && supabase start` efface le patch; le Kong de cette
 * pile a redémarré le 2026-09-10 à 23:33 et est revenu à 150 000 ms.
 *
 * ⛔ LA CONDITION: le patch sert à CONNAÎTRE la durée, jamais à la PARDONNER.
 * Sans garde, un banc sur Kong patché rendrait vert un plan qui serait coupé
 * chez le client. Ce fichier mesure donc la durée et la compare lui-même à
 * `HOSTED_GATEWAY_TIMEOUT_MS`: dépasser reste ROUGE, avec le nombre.
 *
 * ── LA PILE EST OBLIGATOIRE, SON ABSENCE NE ROUGIT PAS ────────────────────
 *
 * Même arbitrage que `composition_band_parity_test.ts`: sans pile vivante, ce
 * fichier SAUTE. Un filet en permanence rouge n'est plus lu.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno test --allow-net --allow-env \
 *       supabase/functions/_shared/keel/lot8_integration_handler_test.ts
 *
 * ⚠️ `scripts/agent-gate.sh` lance la suite keel avec `--allow-read
 * --allow-env` et SANS ces variables: ce fichier y saute, toujours. Il se
 * lance à la main, contre la pile locale.
 *
 * ── LES COMPTES SONT DES FIXTURES NOMMÉES, AVEC UN MOT DE PASSE ───────────
 *
 * `lot8i.*@keeltest.dev`, mot de passe `1234567`, créés par l'admin API et
 * connectés par mot de passe. Aucun jeton n'est forgé, aucune ligne n'est
 * écrite dans `auth.sessions`. Rejouable: on se CONNECTE d'abord, on ne crée
 * qu'en cas d'échec.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { GENERATION_REFUSAL_STATUS } from "./generation_context.ts";

const API = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
/**
 * ⛔ LE RÉSEAU EST INTERROGÉ, PAS SUPPOSÉ. `scripts/agent-gate.sh` lance la
 * suite keel SANS `--allow-net`; il suffit qu'un shell exporte `SUPABASE_URL`
 * (ce que fait tout harnais QA) pour que ce fichier se croie armé et meure sur
 * une permission refusée — un rouge de gate qui ne dit rien du produit. Ce
 * dépôt a déjà payé ce défaut une fois (114 faux rouges, 2026-08).
 */
const NET = Deno.permissions.querySync({ name: "net" }).state === "granted";
const SKIP = !NET || !API || !ANON || !SVC;
if (SKIP) {
  console.log(
    "[skip] lot8_integration_handler_test.ts: needs --allow-net and a live " +
      "Supabase stack (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)",
  );
}

/**
 * ⛔ LE PARCOURS JUSQU'À L'ÉCRITURE COÛTE UN VRAI APPEL MODÈLE, DONC IL NE
 * TOURNE PAS PAR DÉFAUT. Mesuré le 2026-09-11: 66 s pour une personne sur un
 * jour, facturé. Les sept premiers cas, eux, ne dépensent rien et s'arrêtent
 * avant la génération — c'est pour ça qu'ils sont séparés.
 *
 *   LOT8_REAL_MODEL=1 SUPABASE_URL=… deno test --allow-net --allow-env …
 */
const REAL_MODEL = (Deno.env.get("LOT8_REAL_MODEL") ?? "").trim() === "1";

/**
 * LE PLAFOND DE L'HÉBERGÉ, EN DUR — parce qu'un banc qui lirait la
 * configuration de Kong mesurerait le poste de dev au lieu de la production.
 * La valeur vient du `read_timeout` de la pile locale, dont le commentaire dit
 * « to match hosted project ».
 */
const HOSTED_GATEWAY_TIMEOUT_MS = 150_000;

/** Le vocabulaire fermé de l'admission — la liste vient du résolveur. */
const ADMISSION_REFUSALS = Object.keys(GENERATION_REFUSAL_STATUS);

const PASSWORD = "1234567";
const OWNER = "lot8i.owner@keeltest.dev";
const MEMBER = "lot8i.member@keeltest.dev";
const NEWCOMER = "lot8i.newcomer@keeltest.dev";

interface Account {
  token: string;
  userId: string;
}

async function signIn(email: string): Promise<Account | null> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) return null;
  return { token: String(body.access_token), userId: String(body.user?.id ?? "") };
}

/**
 * ON SE CONNECTE D'ABORD. Une création qui échoue sur « e-mail déjà pris »
 * serait un chemin d'exception; ici le second passage est le cas nominal.
 */
async function account(email: string): Promise<Account> {
  const existing = await signIn(email);
  if (existing) return existing;
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { fixture: "LOT8-INTEGRATION" },
    }),
  });
  assert(res.ok, `création de ${email} → HTTP ${res.status}`);
  const fresh = await signIn(email);
  assert(fresh, `${email} créé mais non connectable`);
  return fresh;
}

async function rpc(
  bearer: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: bearer === SVC ? SVC : ANON,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch { /* une RPC scalaire peut rendre du texte nu */ }
  return { status: res.status, body };
}

/**
 * L'APPEL DU PRODUIT. `intent` est volontairement omis: le défaut est
 * `replace_current`, et sans `replaces` la fonction refuse `replaces_required`
 * — une garde qui vit JUSTE APRÈS l'admission. C'est notre marqueur de
 * « l'admission est franchie », et il ne coûte aucun appel modèle.
 */
async function generate(bearer: string): Promise<{
  status: number;
  error: string;
  ms: number;
}> {
  const t0 = Date.now();
  const res = await fetch(`${API}/functions/v1/generate-household-meal-v1`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ window: { days: 1 } }),
  });
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  return {
    status: res.status,
    error: String((body as Record<string, unknown>)?.error ?? ""),
    ms: Date.now() - t0,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// LE PROVISIONNEMENT D'UNE BOUCHE — PAR LES RPC DU PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ LE CORPS EST TOUT-OU-RIEN. `keel_household_set_member_body` refuse la
// ligne entière sur une valeur hors vocabulaire, et le moteur SAUTE une ligne
// de corps partielle: une fixture qui ne lit pas le `ok` du retour fabrique une
// bouche sans corps, et le plan qui suit mesure autre chose. Mesuré ici trois
// fois de suite (`bad_activity_level`, `bad_sport_frequency`, `bad_appetite`).
const BODY = {
  p_height_cm: 178,
  p_weight_kg: 74,
  p_gender: "male",
  p_activity_level: "trains_some",
  p_day_activity: "seated",
  p_sport_frequency: "3_4",
  p_activity_axes_asked: true,
  p_appetite: "average",
  p_appetite_asked: true,
} as const;

async function writeProfile(userId: string, fullName: string): Promise<void> {
  const res = await fetch(`${API}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id: userId,
      full_name: fullName,
      birth_date: "1992-02-02",
      gender: "male",
      locale: "fr-FR",
      country: "FR",
      // ⛔ SANS FUSEAU, LA FONCTION REFUSE `local_day_unresolved` (409): un plan
      // porte des dates réelles, donc il lui faut le jour de chez la personne.
      timezone: "Europe/Paris",
      onboarding_completed: true,
    }),
  });
  assert(res.ok, `profiles → HTTP ${res.status}`);
  void (await res.text());
}

async function writeGoal(userId: string): Promise<void> {
  const res = await fetch(`${API}/rest/v1/student_goals?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
      prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({ user_id: userId, goal: "maintenance", content_locale: "en-GB" }),
  });
  assert(res.ok, `student_goals → HTTP ${res.status}`);
  void (await res.text());
}

/**
 * ⛔ SANS COACH, LA FONCTION REFUSE `no_coach` (409) — huit portes plus bas que
 * l'admission. Un compte créé par l'admin API saute l'entonnoir, donc il saute
 * le rattachement au coach maison que l'inscription fait.
 */
async function joinHouseCoach(token: string): Promise<void> {
  const out = await rpc(token, "keel_join_house_coach", { p_country: "FR" });
  const body = out.body as Record<string, unknown>;
  assert(
    body?.joined === true || body?.reason === "already_attached",
    `coach maison → ${JSON.stringify(body)}`,
  );
}

async function setMouthBody(
  token: string,
  memberId: string,
  firstName: string,
): Promise<void> {
  for (
    const [name, args] of [
      ["keel_household_set_member_name", { p_member: memberId, p_first_name: firstName }],
      ["keel_household_set_member_birth_date", { p_member: memberId, p_birth_date: "1992-02-02" }],
      ["keel_household_set_member_body", { p_member: memberId, ...BODY }],
    ] as const
  ) {
    const out = await rpc(token, name, args as Record<string, unknown>);
    const body = out.body as Record<string, unknown>;
    assertEquals(body?.ok, true, `${name} → ${JSON.stringify(body)}`);
  }
}

/**
 * ⚠️ UN PLAN DÉJÀ POSÉ REFUSE LE SUIVANT (`plan_overlaps_existing`, 409). Le
 * banc part donc d'une ardoise nette, sur SES comptes de fixture et eux seuls.
 */
async function purgePlans(userId: string): Promise<void> {
  const res = await fetch(
    `${API}/rest/v1/student_generated_meals?user_id=eq.${userId}`,
    {
      method: "DELETE",
      headers: { apikey: SVC, authorization: `Bearer ${SVC}`, prefer: "return=minimal" },
    },
  );
  assert(res.ok, `purge → HTTP ${res.status}`);
  void (await res.text());
}

/** LE VRAI APPEL, CELUI QUI DÉPENSE. Rend l'identifiant de la ligne écrite. */
async function generateForReal(bearer: string): Promise<{ mealId: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${API}/functions/v1/generate-household-meal-v1`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ intent: "prepare_next", window: { kind: "days", count: 1 } }),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  // ⛔ DEUX COUPURES, DEUX NOMS, ET AUCUNE N'EST UN DÉFAUT DE COMPOSITION.
  //
  //   · 546 — l'isolat edge a épuisé son CPU. § 10 du chantier, hors périmètre.
  //   · 504 — KONG a coupé en amont. Son `read_timeout` local vaut 150 000 ms
  //     « to match hosted project »: ce n'est PAS un artefact de poste de dev,
  //     c'est le plafond de la production, mesuré ici.
  //
  // Les confondre avec « le plan est mauvais » ferait chercher un défaut
  // d'arithmétique là où c'est la durée qui mord.
  assert(
    res.status !== 546,
    `546 en ${ms} ms — l'isolat a coupé. Hors périmètre (§ 10), pas un défaut de plan.`,
  );
  assert(
    res.status !== 504,
    `504 en ${ms} ms — Kong a coupé à 150 s, le plafond de l'hébergé. ` +
      `La composition n'est pas en cause: elle n'a pas eu le temps de finir.`,
  );
  assertEquals(res.status, 200, `génération → ${res.status} ${JSON.stringify(body)}`);
  const meal = (body as Record<string, unknown>).meal as Record<string, unknown>;
  const mealId = String(meal?.id ?? "");
  assert(/^[0-9a-f-]{36}$/i.test(mealId), `pas d'identifiant de plan: ${JSON.stringify(body)}`);

  // ⛔ LE CONTREFACTUEL, SUR LE MÊME RUN. Un 200 obtenu sous Kong patché ne dit
  // rien de la production: c'est la DURÉE qui décide là-bas. On la compare donc
  // ici, et on rend le nombre — « 8 s de trop » et « 130 s de trop » ne
  // demandent pas le même travail.
  assert(
    ms <= HOSTED_GATEWAY_TIMEOUT_MS,
    `plan écrit en ${ms} ms — ${ms - HOSTED_GATEWAY_TIMEOUT_MS} ms AU-DESSUS du ` +
      `plafond de l'hébergé (${HOSTED_GATEWAY_TIMEOUT_MS} ms). En production, ` +
      `cette requête est coupée: la personne ne reçoit rien. Le plan est bon, ` +
      `c'est le temps qui ne passe pas.`,
  );
  return { mealId, ms };
}

/** LA LIGNE ÉCRITE, RELUE. C'est ça, « jusqu'au stockage ». */
async function readStored(mealId: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${API}/rest/v1/student_generated_meals?id=eq.${mealId}&select=generated_from`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const rows = await res.json() as Record<string, unknown>[];
  assertEquals(rows.length, 1, `la ligne ${mealId} n'a pas été relue`);
  return rows[0].generated_from as Record<string, unknown>;
}

Deno.test({
  name: "LOT 8 · intégration — le vrai handler, de bout en bout",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    // ═══════════════════════════════════════════════════════════════════════
    // ① LOT 1 — UN COMPTE NEUF A DÉJÀ SON FOYER, SANS AVOIR RIEN FAIT
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT D'AVANT: `no_household` (409) attendait une personne seule
    // qui n'avait jamais ouvert `/app/household`. Le lot 1 provisionne un
    // foyer personnel à la création du compte. Ce cas le mesure SUR UN COMPTE
    // QUI VIENT DE NAÎTRE — pas sur une ligne posée par la fixture.
    await t.step("un compte neuf porte déjà un foyer personnel", async () => {
      const fresh = await account(NEWCOMER);
      const seat = await rpc(SVC, "keel_household_of", { p_user: fresh.userId });
      assertEquals(seat.status, 200);
      const seatId = String(seat.body ?? "");
      assert(
        /^[0-9a-f-]{36}$/i.test(seatId),
        `le compte neuf n'a pas de foyer: ${JSON.stringify(seat.body)}`,
      );
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ② … ET IL FRANCHIT L'ADMISSION DU PREMIER COUP (N = 1)
    // ═══════════════════════════════════════════════════════════════════════
    await t.step("une personne seule franchit l'admission", async () => {
      const fresh = await signIn(NEWCOMER);
      assert(fresh);
      const out = await generate(fresh.token);
      assert(
        !ADMISSION_REFUSALS.includes(out.error),
        `l'admission a refusé une personne seule: ${out.status} ${out.error}`,
      );
      assertEquals(out.error, "replaces_required");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ③ SANS JETON — LE HANDLER REFUSE AVANT TOUT
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ⚠️ CE QUE CE CAS APPREND, ET QUI N'EST ÉCRIT NULLE PART AILLEURS: le
    // refus rendu est `Unauthorized`, PAS `not_authenticated`. La fonction
    // porte sa propre garde de jeton AVANT d'appeler le résolveur, donc la
    // branche `not_authenticated` de `resolveGenerationAdmission` est
    // INATTEIGNABLE depuis cette lane. Le statut est le même (401) et le
    // contrat client tient; ce test épingle la vérité plutôt que le souhait.
    await t.step("sans jeton d'utilisateur, 401", async () => {
      const out = await generate(ANON);
      assertEquals(out.status, 401);
      assertEquals(out.error, "Unauthorized");
      assertEquals(GENERATION_REFUSAL_STATUS.not_authenticated, 401);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ④ LE FOYER À DEUX COMPTES — CONSTRUIT PAR LES RPC DU PRODUIT
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Une fixture qui diverge du produit mesure autre chose: la bouche est
    // ajoutée par `keel_household_add_member`, l'invitation par
    // `keel_household_invite`, la réclamation par `keel_household_join` —
    // exactement `frontend/src/keel/api/household.ts`.
    let ownerHousehold = "";
    let owner: Account;
    let member: Account;
    await t.step("un second compte réclame une bouche du foyer", async () => {
      owner = await account(OWNER);
      member = await account(MEMBER);

      const seat = await rpc(SVC, "keel_household_of", { p_user: owner.userId });
      ownerHousehold = String(seat.body ?? "");
      assert(/^[0-9a-f-]{36}$/i.test(ownerHousehold), "le maître n'a pas de foyer");

      // Déjà réclamé par un passage précédent ? Alors il n'y a rien à faire.
      const already = await rpc(SVC, "keel_household_of", { p_user: member.userId });
      if (String(already.body ?? "") === ownerHousehold) return;

      // Le pays est obligatoire pour rejoindre; le produit l'écrit au profil.
      await fetch(`${API}/rest/v1/profiles?on_conflict=id`, {
        method: "POST",
        headers: {
          apikey: SVC,
          authorization: `Bearer ${SVC}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ id: member.userId, country: "FR" }),
      });

      const roster = await rpc(owner.token, "keel_household_roster");
      const rows = Array.isArray(roster.body) ? roster.body as Record<string, unknown>[] : [];
      let mouth = rows.find((r) => r.first_name === "Lea" && !r.user_id);
      if (!mouth) {
        const added = await rpc(owner.token, "keel_household_add_member", {
          p_first_name: "Lea",
          p_birth_date: "1994-04-04",
        });
        assertEquals(added.status, 200, `add_member → ${JSON.stringify(added.body)}`);
        const again = await rpc(owner.token, "keel_household_roster");
        const rows2 = Array.isArray(again.body) ? again.body as Record<string, unknown>[] : [];
        mouth = rows2.find((r) => r.first_name === "Lea" && !r.user_id);
      }
      assert(mouth, "la bouche « Lea » n'est pas dans le roster du maître");

      const invited = await rpc(owner.token, "keel_household_invite", {
        p_email: MEMBER,
        p_member: mouth.member_id,
      });
      const inv = invited.body as Record<string, unknown>;
      assertEquals(inv?.ok, true, `invite → ${JSON.stringify(inv)}`);

      const joined = await rpc(member.token, "keel_household_join", {
        p_token: String(inv.token),
        p_country: "FR",
      });
      const jn = joined.body as Record<string, unknown>;
      assertEquals(jn?.ok, true, `join → ${JSON.stringify(jn)}`);

      const now = await rpc(SVC, "keel_household_of", { p_user: member.userId });
      assertEquals(String(now.body ?? ""), ownerHousehold);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ⑤ LE MEMBRE SECONDAIRE NE COMPOSE PAS — 403 `not_owner`
    // ═══════════════════════════════════════════════════════════════════════
    //
    // La règle mère du foyer: « une personne gouverne le menu ». Réclamer son
    // profil donne la lecture, jamais le droit de composer.
    await t.step("le membre secondaire lit not_owner", async () => {
      const fresh = await signIn(MEMBER);
      assert(fresh);
      const out = await generate(fresh.token);
      assertEquals(out.status, 403);
      assertEquals(out.error, "not_owner");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ⑥ LE FOYER GELÉ — 402 AU MAÎTRE, ET `not_owner` À L'AUTRE
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ⛔ C'EST LE CONTRAT D'ORDRE, ET IL N'EXISTAIT QU'EN TEST PUR: un membre
    // secondaire d'un foyer GELÉ lit `not_owner`, jamais `household_frozen`.
    // On ne raconte pas l'état de facturation du foyer d'autrui à quelqu'un
    // qui n'a pas le droit d'y toucher. Ici, les deux comptes appellent LA
    // MÊME fonction sur LE MÊME foyer gelé, et lisent deux refus différents.
    await t.step("gelé: le maître lit 402, le membre lit 403", async () => {
      const freeze = async (until: string | null) => {
        const res = await fetch(
          `${API}/rest/v1/households?id=eq.${ownerHousehold}`,
          {
            method: "PATCH",
            headers: {
              apikey: SVC,
              authorization: `Bearer ${SVC}`,
              "content-type": "application/json",
              prefer: "return=minimal",
            },
            body: JSON.stringify({ free_until: until }),
          },
        );
        assert(res.ok, `gel → HTTP ${res.status}`);
        void (await res.text());
      };

      const before = await fetch(
        `${API}/rest/v1/households?id=eq.${ownerHousehold}&select=free_until`,
        { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
      );
      const rows = await before.json() as Record<string, unknown>[];
      const restore = (rows?.[0]?.free_until ?? null) as string | null;

      try {
        await freeze("2020-01-01");

        const ownerOut = await generate((await signIn(OWNER))!.token);
        assertEquals(ownerOut.status, 402);
        assertEquals(ownerOut.error, "household_frozen");

        const memberOut = await generate((await signIn(MEMBER))!.token);
        assertEquals(memberOut.status, 403);
        assertEquals(
          memberOut.error,
          "not_owner",
          "un membre secondaire a appris le gel du foyer d'autrui",
        );
      } finally {
        // ⚠️ LA FIXTURE EST RENDUE COMME ON L'A TROUVÉE, même si un cas casse.
        await freeze(restore);
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ⑦ DÉGELÉ, LE MAÎTRE D'UN FOYER À PLUSIEURS FRANCHIT L'ADMISSION (N > 1)
    // ═══════════════════════════════════════════════════════════════════════
    await t.step("dégelé, le maître d'un foyer pluriel passe", async () => {
      const out = await generate((await signIn(OWNER))!.token);
      assert(
        !ADMISSION_REFUSALS.includes(out.error),
        `l'admission a refusé le maître: ${out.status} ${out.error}`,
      );
      assertEquals(out.error, "replaces_required");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ⑧ UNE PERSONNE — DU POST JUSQU'À LA LIGNE ÉCRITE
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CE CAS DÉPENSE UN VRAI APPEL MODÈLE (66 s mesurées le 2026-09-11) et
    // ne tourne que sous `LOT8_REAL_MODEL=1`. C'est le seul de ce fichier qui
    // franchit la génération; les sept d'avant s'arrêtent à la porte.
    await t.step({
      name: "N = 1 : la requête va jusqu'au stockage",
      ignore: !REAL_MODEL,
      fn: async () => {
        const solo = await account(NEWCOMER);
        await writeProfile(solo.userId, "Nico Fixture");
        await writeGoal(solo.userId);
        await joinHouseCoach(solo.token);
        const roster = await rpc(solo.token, "keel_household_roster");
        const rows = roster.body as Record<string, unknown>[];
        assertEquals(rows.length, 1, "le foyer personnel porte une seule bouche");
        await setMouthBody(solo.token, String(rows[0].member_id), "Nico");
        await purgePlans(solo.userId);

        const { mealId, ms } = await generateForReal(solo.token);
        console.log(`    · plan écrit ${mealId} en ${ms} ms`);

        const from = await readStored(mealId);
        const ctx = from.generation_context as Record<string, unknown>;
        assertEquals(ctx.household_size, 1);
        assertEquals(ctx.write_scope, "household");
        assertEquals(ctx.plan_owner_user_id, solo.userId);

        // ══ LA PROVENANCE, MESURÉE — ET ELLE N'EST PAS CELLE QU'ON CROIT ══
        //
        // ⛔ CE CAS A ÉCHOUÉ AU PREMIER TIR RÉEL, ET C'EST LE TEST QUI AVAIT
        // TORT. J'attendais `weightKg.personal`; le run a rendu
        // `weightKg.member_sheet`. La raison est structurelle, pas
        // accidentelle: le corps est écrit par `keel_household_set_member_body`
        // — la RPC de l'écran, celle que `SetupPage :: addMouth` appelle — et
        // elle écrit la FICHE DE BOUCHE. Même pour le titulaire de son propre
        // foyer personnel. Le `personal` du poids et de la taille supposerait
        // un corps écrit AILLEURS que par l'entonnoir.
        //
        // ⚠️ CE QUI RESTE `personal`: l'âge et le genre, qui viennent de
        // `profiles` (date de naissance, genre) — deux colonnes que la fiche de
        // bouche ne porte pas.
        //
        // CE QU'ON ÉPINGLE DONC: chaque fait est PRÉSENT et sa source est
        // NOMMÉE. Un `absent` ou un `read_failed` ici voudrait dire que le
        // corps saisi n'a pas atteint le moteur — le défaut historique
        // (`household-body-never-reaches-the-prompt`).
        const facts = from.mouth_facts as Record<string, number>;
        for (const key of ["weightKg", "heightCm", "activityLevel", "appetite"]) {
          assertEquals(
            facts[`${key}.member_sheet`],
            1,
            `${key} ne vient pas de la fiche de bouche: ${JSON.stringify(facts)}`,
          );
          assertEquals(facts[`${key}.absent`], undefined, JSON.stringify(facts));
          assertEquals(facts[`${key}.read_failed`], undefined, JSON.stringify(facts));
        }
        assertEquals(facts["ageYears.personal"], 1, JSON.stringify(facts));
        assertEquals(facts["gender.personal"], 1, JSON.stringify(facts));

        // ══════════════════════════════════════════════════════════════════
        // ⟳ 2026-09-11 · LOT E — L'ATTENTE CHANGE, ET VOICI POURQUOI
        // ══════════════════════════════════════════════════════════════════
        //
        // ⛔ CE TEST ÉPINGLAIT `measured: false, reason: "single_mouth"`. Cette
        // attente était juste sur son ancienne prémisse — « une seule bouche
        // n'a pas de contenant à peser » — et cette prémisse était FAUSSE.
        // Mesuré sur le plan GAIN `a18f522e-41f9-469e-9c50-1d693d892ce6`, un
        // foyer d'UNE bouche: le samedi midi a été écrit à **727 g contre un
        // plafond de 700**, dans un contenant à un seul nom, et l'abstention
        // `single_mouth` a laissé passer le dépassement sans un mot
        // (`ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` §4).
        //
        // Le contrôle final appelle désormais `finalPortionCheck`, qui n'a
        // AUCUNE exception de population: il relit les grammes réellement posés
        // dans chaque contenant à un nom, quelle que soit la taille du foyer.
        // Une bouche seule rend donc `measured: true`.
        //
        // ⚠️ L'ABSTENTION `single_mouth` DE `shadowSizing` N'A PAS BOUGÉ, elle.
        // À une bouche, c'est le chemin `portion_v1` qui décide des grammes, et
        // une seconde passe d'ombre lui ferait concurrence.
        const household = from.household as Record<string, unknown>;
        const final = (household.portion_sizing as Record<string, unknown>)
          ?.final as Record<string, unknown>;
        assertEquals(final?.measured, true);
        assertEquals(final?.reason, "remeasured_after_apply");
        // ⛔ ET LE DÉNOMINATEUR VOYAGE AVEC LE VERDICT: un `judged: 0` sur un
        // plan de quinze contenants serait la même abstention sous un nom neuf.
        assert(
          Number(final?.judged ?? 0) > 0,
          `aucun contenant jugé à une bouche: ${JSON.stringify(final)}`,
        );
      },
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ⑨ PLUSIEURS — LA MÊME PORTE, LE MÊME CONTRAT
    // ═══════════════════════════════════════════════════════════════════════
    //
    // « Servir une personne ou cinq passe par le même contrat » — la phrase du
    // résolveur. Ici elle se mesure: MÊME fonction, MÊME corps de requête, et
    // c'est `household_size` sur la ligne écrite qui change.
    await t.step({
      name: "N > 1 : le même parcours, pour un foyer de deux bouches",
      ignore: !REAL_MODEL,
      fn: async () => {
        const master = await account(OWNER);
        await writeProfile(master.userId, "Ana Fixture");
        await writeGoal(master.userId);
        await joinHouseCoach(master.token);
        const roster = await rpc(master.token, "keel_household_roster");
        const rows = roster.body as Record<string, unknown>[];
        assertEquals(rows.length, 2, `le foyer devrait porter deux bouches: ${JSON.stringify(rows)}`);
        for (const r of rows) {
          await setMouthBody(
            master.token,
            String(r.member_id),
            String(r.first_name ?? "Bouche"),
          );
        }
        await purgePlans(master.userId);

        const { mealId, ms } = await generateForReal(master.token);
        console.log(`    · plan écrit ${mealId} en ${ms} ms`);

        const from = await readStored(mealId);
        const ctx = from.generation_context as Record<string, unknown>;
        assertEquals(ctx.household_size, 2);
        assertEquals(
          (ctx.served_member_ids as string[])?.length,
          2,
          "les deux bouches doivent être servies par la même composition",
        );

        // ⛔ À DEUX BOUCHES, LE VERDICT DU LOT 5 N'A PLUS D'EXCUSE: soit il
        // mesure, soit il NOMME pourquoi il ne peut pas. `single_mouth` ici
        // voudrait dire que la seconde bouche n'est pas arrivée jusqu'à lui.
        const household = from.household as Record<string, unknown>;
        const final = (household.portion_sizing as Record<string, unknown>)
          ?.final as Record<string, unknown>;
        assert(final, "le verdict final du lot 5 n'est pas sur la ligne");
        assert(
          final.reason !== "single_mouth",
          `un foyer de deux lit « single_mouth »: ${JSON.stringify(final)}`,
        );
        assertEquals(final.measured, true, JSON.stringify(final));

        // ⛔ LE VERDICT DOIT SE BOUCLER SUR LUI-MÊME. Les quatre compteurs
        // doivent totaliser exactement le nombre de parts JUGÉES: une part qui
        // sort du tri sans tomber dans aucune case est une part qu'aucun
        // chiffre ne réclame — et c'est précisément le zéro ambigu que ce
        // dépôt paie en boucle. Le contrôle ne dépend PAS de ce que le modèle a
        // écrit (3 plats ce tir-ci, 5 le prochain): il est vrai ou faux quoi
        // que rende la génération.
        const v = final.verdicts as Record<string, number>;
        const total = v.in_bounds + v.over_max + v.under_min + v.unmeasurable;
        assertEquals(
          total,
          final.judged,
          `${final.judged} parts jugées mais ${total} classées: ${JSON.stringify(final)}`,
        );
      },
    });
  },
});
