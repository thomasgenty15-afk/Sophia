#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE FOYER DU BANC DES RETOURS — trois bouches, et volontairement NU.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Autorité : `~/.claude/plans/indexed-jumping-biscuit.md`, section « Le foyer
 * de test ». Il sert les trois lots : classification du retour sur plan,
 * classification du bilan, apprentissage sur quatre cycles.
 *
 * ── LA RÈGLE QUI DÉCIDE DE LA QUALITÉ DE CE SCRIPT ────────────────────────
 * Reprise mot pour mot de `2026-08-21-2300-fixture-v0c-foyer-pluriel.ts` :
 *
 *   > « une fixture qui diverge du produit mesure autre chose. Chaque champ
 *   >   posé par LA MÊME RPC QUE L'ÉCRAN, jamais par un `insert` direct. »
 *
 * L'ORDRE des appels est celui de `SetupPage.tsx :: addMouth`
 * (`add_member` → corps → cible → allergies → régime), parce qu'un ordre
 * différent est un autre produit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE FOYER EST NU, ET C'EST TOUT LE POINT
 * ══════════════════════════════════════════════════════════════════════════
 * Il porte des corps, des âges et des objectifs — rien d'autre. **Aucune**
 * tradition (`keel_household_set_tradition`), **aucune** habitude
 * (`set_member_habits`), **aucun** régime (`set_member_diet`), **aucune**
 * allergie.
 *
 * Ce sont exactement les faits que les phrases du banc portent :
 *   · « ma fille a danse le mardi soir »   → `household_traditions`
 *   · « l'après-midi, toujours des compotes » → `household_member_habits`
 *   · « mon fils est devenu végétarien »   → `household_members.diet`
 *   · « je suis allergique aux arachides » → `student_safety_constraints`
 *
 * Les pré-poser rendrait le banc VERT sans rien mesurer : on lirait le fait
 * qu'on vient d'écrire soi-même, pas celui que le classifieur a rangé. La
 * cicatrice `test-parameterized-by-its-own-constant`, à l'échelle d'une
 * fixture.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ AUCUN OBJECTIF DE POIDS SUR UN MINEUR
 * ══════════════════════════════════════════════════════════════════════════
 * La migration `20260822041500` les refuse sur les quatre portes d'écriture —
 * c'est elle qui a fermé la reconstruction de la fixture v0-C. Les deux
 * enfants portent donc `maintenance`, qui n'est pas un objectif de poids
 * (`household_members_target_needs_direction_check` : seuls `fat_loss` et
 * `muscle_gain` acceptent une cible).
 *
 * ── LES DEUX ENFANTS SONT MINEURS, ET C'EST UN POINT DE MESURE ────────────
 * Le lot 2 vérifie qu'un ajustement de portion attribué à une bouche mineure
 * sort en `portion_excluded` AVEC SON MOTIF, au lieu d'échouer en silence.
 * Sans un mineur au foyer, ce cas n'est pas atteignable.
 *
 * Usage :
 *   deno run --allow-net --allow-env scripts/2026-09-01-fixture-foyer-retours.ts \
 *     --url http://127.0.0.1:54321 --anon <clé> [--email …] [--purge]
 *
 * ⛔ Les clés se passent en ARGUMENT, jamais par `export` : des `SUPABASE_*`
 * exportés dans le shell empoisonnent la suite vitest (114 faux rouges,
 * cicatrice `qa-env-exports-poison-the-suite`).
 */

// ---------------------------------------------------------------------------
// Les arguments
// ---------------------------------------------------------------------------

function arg(name: string, fallback = ""): string {
  const at = Deno.args.indexOf(`--${name}`);
  return at >= 0 && Deno.args[at + 1] ? Deno.args[at + 1] : fallback;
}

const API_URL = arg("url", "http://127.0.0.1:54321");
const ANON_KEY = arg("anon");
const EMAIL = arg("email", "qa-foyer-retours@keeltest.dev");
const PASSWORD = "1234567";
const SERVICE_KEY = arg("service");
const PURGE = Deno.args.includes("--purge");
const HOUSEHOLD_NAME = "Foyer du banc des retours";

/**
 * LE COACH — un coach de banc, à doctrine PUBLIÉE et EN FRANÇAIS.
 *
 * ⛔ LES DEUX GÉNÉRATEURS REFUSENT SANS LUI: `if (!doctrine.coachId) → 409
 * no_coach`, mesuré sur ce foyer. Ce n'est pas le lien qui est mesuré ici —
 * c'est ce qui se range quand on parle à un plan — mais sans lien il n'y a
 * aucun plan à qui parler.
 *
 * ⚠️ `fr-FR` DÉLIBÉRÉMENT. Le foyer est français et les phrases du banc le
 * sont; une doctrine anglaise ferait sortir des lignes anglaises, et on
 * mesurerait la langue en croyant mesurer la classification.
 *
 * ⚠️ Un coach À DOCTRINE, pas seulement un identifiant: `no_published_doctrine`
 * n'est pas fatal, mais un plan composé sans doctrine ne ressemble à aucun plan
 * que ce produit sert.
 *
 * ⛔ ET UN COACH AVEC UN SIÈGE LIBRE. Un coach en essai plafonne à TROIS sièges
 * vivants (`keel_trial_seat_limit_reached`, 23514) — le quatrième élève fait
 * tomber le run EN COURS, pas au démarrage. Deux des quatre coachs à doctrine
 * française du banc local sont déjà pleins; celui-ci en portait un seul.
 * Avant de réutiliser ce script sur une autre pile, RECOMPTER:
 *
 *   select count(*) from coach_clients
 *    where coach_id = '<coach>' and status in ('active','invited');
 */
/**
 * ⟳ 2026-09-03 — LE COACH SE CHOISIT, ET LE DÉFAUT A CHANGÉ DE RAISON.
 *
 * Le coach du banc est un coach HUMAIN en essai, donc plafonné à **3 sièges
 * vivants** (`_trg_coach_clients_enforce_trial_cap`). Ce script a rendu
 * `keel_trial_seat_limit_reached` sur sa 4ᵉ fixture — mesuré le 2026-09-03,
 * après `qa-foyer-retours`, `qa-cycles2` et `qa-3portes`.
 *
 * ⛔ LA RÉPARATION N'EST PAS DE LIBÉRER UN SIÈGE. Retirer une fixture pour en
 * poser une autre détruit le banc de quelqu'un d'autre, et le plafond
 * reviendrait à la suivante.
 *
 * Le COACH MAISON (`coach_kind = 'house'`) est exempté du plafond **par la
 * base**, en toutes lettres: « le plafond existe pour empêcher un coach
 * d'exploiter un essai gratuit à 40 élèves; appliqué à la maison, il refuse le
 * 4ᵉ INSCRIT LIBRE ». C'est aussi le coach qu'obtient une inscription B2C
 * ordinaire — donc, pour un banc de FOYER, il est plus fidèle au produit que
 * le coach du banc.
 */
// Le coach maison, exempté du plafond par la base — à passer en `--coach`.
export const HOUSE_COACH_ID = "00000000-0000-4000-8000-00000000d15c";
const BENCH_COACH_ID = arg("coach", "24e34241-d122-414c-a957-c375651f590e");

if (!ANON_KEY) {
  console.error("manque --anon <clé anon>");
  Deno.exit(2);
}

// ---------------------------------------------------------------------------
// Les bouches
// ---------------------------------------------------------------------------

/**
 * ⛔ VOCABULAIRES FERMÉS, LUS DANS LES `CHECK` DE `household_member_bodies`.
 * Les typer ici plutôt que `string` fait dire au compilateur ce que la RPC
 * dirait sinon en `bad_activity_level` — au milieu d'un foyer à moitié bâti.
 */
interface Body {
  heightCm: number;
  weightKg: number;
  gender: "female" | "male" | "other";
  activityLevel: "sedentary" | "on_feet" | "trains_some" | "trains_hard";
  dayActivity: "seated" | "on_feet" | "physical_job";
  sportFrequency: "none" | "1_2" | "3_4" | "5_plus";
  appetite: "small" | "average" | "large";
}

interface Mouth {
  firstName: string;
  birthDate: string;
  /** ⛔ `maintenance` sur les mineurs — voir l'en-tête, migration S4. */
  goal: "maintenance" | "fat_loss" | "muscle_gain";
  body: Body;
  /** Ce que la bouche sert à mesurer. Documentaire, jamais écrit en base. */
  role: string;
}

const MOUTHS: Mouth[] = [
  {
    firstName: "Claire",
    birthDate: "1988-04-12",
    goal: "maintenance",
    role: "la titulaire — le sujet PAR DÉFAUT d'une phrase non attribuée",
    body: {
      heightCm: 167,
      weightKg: 62,
      gender: "female",
      activityLevel: "trains_some",
      dayActivity: "seated",
      sportFrequency: "1_2",
      appetite: "average",
    },
  },
  {
    firstName: "Léa",
    birthDate: "2014-03-05",
    goal: "maintenance",
    role:
      "MINEURE — l'attribution à une bouche sans compte, et l'exclusion des " +
      "ajustements de portion avec son motif",
    body: {
      heightCm: 145,
      weightKg: 36,
      gender: "female",
      activityLevel: "trains_hard",
      dayActivity: "on_feet",
      sportFrequency: "3_4",
      appetite: "average",
    },
  },
  {
    firstName: "Tom",
    birthDate: "2009-11-20",
    goal: "maintenance",
    role:
      "MINEUR — le régime (végétarien) qui doit être REFUSÉ par le " +
      "classifieur, et le goût (poisson) qui doit être accepté et attribué",
    body: {
      heightCm: 172,
      weightKg: 58,
      gender: "male",
      activityLevel: "trains_some",
      dayActivity: "seated",
      sportFrequency: "1_2",
      appetite: "large",
    },
  },
];

// ---------------------------------------------------------------------------
// Le transport
// ---------------------------------------------------------------------------

async function call(
  path: string,
  init: { method?: string; bearer?: string; body?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: ANON_KEY,
      "content-type": "application/json",
      ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
    },
    body: init.body,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

/**
 * ⛔ UNE RPC QUI REND `{ok:false}` N'EST PAS UNE RÉUSSITE.
 *
 * Les `keel_household_*` ne LÈVENT pas : elles rendent un motif. Un script qui
 * ne lit pas `ok` écrit la moitié d'une fixture en affichant « terminé » — le
 * mode d'échec que ce dépôt paie en boucle. On lève ici, avec le motif nommé.
 */
async function rpc(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { status, body } = await call(`/rest/v1/rpc/${name}`, {
    method: "POST",
    bearer: token,
    body: JSON.stringify(args),
  });
  if (status >= 300) {
    throw new Error(`${name} → HTTP ${status} : ${JSON.stringify(body)}`);
  }
  const out = (body ?? {}) as Record<string, unknown>;
  if (out && typeof out === "object" && out.ok === false) {
    throw new Error(`${name} → refus « ${String(out.reason)} »`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Le compte maître
// ---------------------------------------------------------------------------

async function signIn(): Promise<{ token: string; userId: string } | null> {
  const { status, body } = await call(
    `/auth/v1/token?grant_type=password`,
    { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
  );
  const b = (body ?? {}) as Record<string, any>;
  if (status >= 300 || !b.access_token) return null;
  return { token: String(b.access_token), userId: String(b.user?.id ?? "") };
}

async function signUp(): Promise<void> {
  const { status, body } = await call(`/auth/v1/signup`, {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (status >= 300) {
    throw new Error(`signup → HTTP ${status} : ${JSON.stringify(body)}`);
  }
}

// ---------------------------------------------------------------------------
// Le foyer
// ---------------------------------------------------------------------------

type RosterRow = {
  member_id: string;
  /** Non-`null` = cette bouche A UN COMPTE. C'est la porte qui change. */
  user_id: string | null;
  first_name: string | null;
};

/**
 * LA LIGNE `student_goals` DU MAÎTRE — miroir exact de
 * `api/household.ts :: createOwnerGoalRow`, `ignoreDuplicates` compris.
 *
 * ⛔ ELLE NE PASSE PAS PAR `keel_household_set_member_goal`, qui REFUSE une
 * bouche à compte (`has_account`) — mesuré. Une bouche qui a un compte porte
 * son objectif dans SA ligne, jamais dans celle du foyer : c'est le produit qui
 * le dit, et le contourner écrirait un objectif à un endroit qu'aucun écran ne
 * lit.
 *
 * Sans elle, les deux générateurs rendent `goal_required` (409) et le banc n'a
 * rien à mesurer.
 *
 * ⚠️ `content_locale: "en-GB"` — la valeur que les DEUX écrivains de cette
 * colonne sèment dans le produit. La langue du PLAN vient de `profiles.locale`
 * (`fr-FR` ici) : deux colonnes, deux questions.
 */
async function ensureOwnerGoal(token: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/rest/v1/student_goals?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      goal: "maintenance",
      content_locale: "en-GB",
    }),
  });
  if (res.status >= 300) {
    throw new Error(`student_goals → HTTP ${res.status} : ${await res.text()}`);
  }
  console.log("objectif de la titulaire ✓ (student_goals, maintenance)");
}

async function roster(token: string): Promise<RosterRow[]> {
  const out = await call(`/rest/v1/rpc/keel_household_roster`, {
    method: "POST",
    bearer: token,
    body: "{}",
  });
  if (out.status >= 300) return [];
  const rows = Array.isArray(out.body) ? out.body : [];
  return rows as RosterRow[];
}

/**
 * LE LIEN COACH — **LA SEULE ÉCRITURE DE CE SCRIPT QUI SORT DU CHEMIN PRODUIT**,
 * et elle est nommée ici plutôt que cachée.
 *
 * Le chemin produit est une invitation par e-mail du coach puis un `/join` par
 * jeton — deux comptes, un aller-retour d'e-mail, et un flux qui a ses propres
 * trous connus. Rien de tout ça n'est l'objet du banc : le lien est un
 * PRÉALABLE (`409 no_coach` sinon), pas une mesure.
 *
 * ⚠️ CE QUE ÇA COÛTE, ÉCRIT ICI : ce script ne prouve donc RIEN sur le parcours
 * d'inscription d'un élève. Si un jour on veut mesurer ça, c'est un autre banc,
 * et il ne doit pas s'appuyer sur cette ligne.
 *
 * ⛔ Sous `service_role`, parce que `coach_clients` est fermée à l'élève — et
 * c'est correct : personne ne se rattache un coach tout seul.
 */
async function ensureCoachLink(userId: string): Promise<void> {
  if (!SERVICE_KEY) {
    console.log("⚠️ pas de --service : lien coach NON posé (409 no_coach à la génération)");
    return;
  }
  // ⚠️ LIRE PUIS ÉCRIRE, pas `on_conflict`: `coach_clients` n'a AUCUNE
  // contrainte unique sur (coach_id, student_user_id) — mesuré (42P10). Un
  // `on_conflict` sur une clé qui n'existe pas est un 400, pas un no-op.
  const head = await fetch(
    `${API_URL}/rest/v1/coach_clients?student_user_id=eq.${userId}&select=coach_id,status`,
    { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows = (await head.json().catch(() => [])) as Array<{ coach_id: string }>;
  if (Array.isArray(rows) && rows.length > 0) {
    console.log(`coach ✓ déjà lié (${rows[0].coach_id})`);
    return;
  }
  const res = await fetch(
    `${API_URL}/rest/v1/coach_clients`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        coach_id: BENCH_COACH_ID,
        student_user_id: userId,
        invited_email: EMAIL,
        status: "active",
        consent_granted_at: new Date().toISOString(),
      }),
    },
  );
  if (res.status >= 300) {
    throw new Error(`coach_clients → HTTP ${res.status} : ${await res.text()}`);
  }
  console.log(`coach ✓ ${BENCH_COACH_ID} (doctrine fr-FR publiée)`);
}

async function main(): Promise<void> {
  console.log(`── foyer du banc des retours · ${EMAIL} ──`);

  let session = await signIn();
  if (!session) {
    console.log("compte + création");
    await signUp();
    session = await signIn();
  }
  if (!session) throw new Error(`impossible de se connecter comme ${EMAIL}`);
  const { token, userId } = session;
  console.log(`compte ✓ ${userId}`);

  // ⚠️ `profiles` EN POSTGREST DIRECT, et ce n'est pas un contournement : le
  // produit lui-même écrit cette table à la main (`api/uiLanguage.ts`).
  // `profiles.locale` décide la langue de sortie — une fixture qui ne l'écrit
  // pas mesure un faux défaut de langue (cicatrice nommée).
  const prof = await call(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    bearer: token,
    body: JSON.stringify({
      full_name: "Claire",
      birth_date: MOUTHS[0].birthDate,
      locale: "fr-FR",
      country: "FR",
      // ⛔ SANS FUSEAU, LES DEUX GÉNÉRATEURS RENDENT `local_day_unresolved`
      // (409) — mesuré. « Un plan doit porter des dates réelles », et le jour
      // local se lit sur le profil du TITULAIRE, pas sur l'horloge du serveur.
      // C'est la première garde qu'une fixture nue fait tomber.
      timezone: "Europe/Paris",
    }),
  });
  if (prof.status >= 300) {
    throw new Error(`profiles → HTTP ${prof.status} : ${JSON.stringify(prof.body)}`);
  }
  console.log("profil ✓ fr-FR / FR");

  await ensureCoachLink(userId);

  let current = await roster(token);
  if (PURGE && current.length > 0) {
    for (const row of current) {
      await rpc(token, "keel_household_remove_member", { p_member: row.member_id })
        .catch(() => {});
    }
    current = await roster(token);
    console.log(`purge ✓ reste ${current.length}`);
  }

  if (current.length === 0) {
    await rpc(token, "keel_household_create", { p_name: HOUSEHOLD_NAME });
    current = await roster(token);
    console.log(`foyer + créé (${current.length} bouche)`);
  } else {
    console.log(`foyer ✓ déjà là (${current.length} bouche(s))`);
  }

  for (const m of MOUTHS) {
    const existing = current.find((r) => r.first_name === m.firstName);
    let memberId: string;
    if (existing) {
      memberId = existing.member_id;
      // ⛔ DEUX PORTES, ET C'EST LE COMPTE QUI DÉCIDE LAQUELLE. La bouche du
      // maître existe dès `keel_household_create` et porte un `user_id` : les
      // RPC de foyer la REFUSENT (`has_account`, mesuré). Son âge vient de
      // `profiles`, que l'on vient d'écrire ; son objectif, de `student_goals`.
      if (existing.user_id) {
        await ensureOwnerGoal(token, existing.user_id);
        console.log(`  ${m.firstName} ✓ titulaire (${memberId})`);
      } else {
        await rpc(token, "keel_household_set_member_birth_date", {
          p_member: memberId,
          p_birth_date: m.birthDate,
        });
        await rpc(token, "keel_household_set_member_goal", {
          p_member: memberId,
          p_goal: m.goal,
        });
        console.log(`  ${m.firstName} ✓ déjà là (${memberId})`);
      }
    } else {
      const added = await rpc(token, "keel_household_add_member", {
        p_first_name: m.firstName,
        p_birth_date: m.birthDate,
        p_goal: m.goal,
      });
      memberId = String(added.member_id);
      console.log(`  ${m.firstName} + ajouté (${memberId})`);
    }

    await rpc(token, "keel_household_set_member_body", {
      p_member: memberId,
      p_height_cm: m.body.heightCm,
      p_weight_kg: m.body.weightKg,
      p_gender: m.body.gender,
      p_activity_level: m.body.activityLevel,
      p_day_activity: m.body.dayActivity,
      p_sport_frequency: m.body.sportFrequency,
      p_activity_axes_asked: true,
      p_appetite: m.body.appetite,
      p_appetite_asked: true,
    });
    console.log(`     corps ✓  — ${m.role}`);
  }

  const finalRoster = await roster(token);
  console.log(`\n── ${finalRoster.length} bouches ──`);
  for (const r of finalRoster) {
    console.log(`  ${(r.first_name ?? "?").padEnd(8)} ${r.member_id}`);
  }
  console.log(
    "\n⛔ NU par construction : aucune tradition, aucune habitude, aucun " +
      "régime, aucune allergie.\n   Ce sont les faits que le banc doit y déposer.",
  );
}

await main();
