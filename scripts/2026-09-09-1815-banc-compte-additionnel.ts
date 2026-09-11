#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE BANC DU COMPTE SUPPLÉMENTAIRE — de l'invitation à ce qu'il voit
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Autorité produit : [FF-048](docs/fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md)
 * · [FF-049](docs/fonctionnalites/le-foyer/FF-049-le-prix-du-foyer.md)
 * · [le-foyer/README.md](docs/fonctionnalites/le-foyer/README.md) (F1 : une
 * personne gouverne le menu).
 *
 * ── POURQUOI CE BANC EXISTE ───────────────────────────────────────────────
 * Le 2026-09-09, l'audit du compte supplémentaire a trouvé QUATRE défauts que
 * ni les tests purs ni les tests de source n'avaient vus, parce qu'aucun d'eux
 * ne PARCOURT le compte :
 *
 *   ① les trois crons filtrent `keel_role = 'student'`, que la réclamation
 *      n'écrit jamais — aucune question n'atteignait un profil réclamé ;
 *   ② `memberIdOf` demandait `household_members.id`, colonne inexistante ;
 *   ③ `/app/today` était son PREMIER onglet, et le seul écran qui le refuse ;
 *   ④ aucune invitation ne partait par e-mail.
 *
 * Chacun était vert partout ailleurs. Ce qui les révèle est le PARCOURS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE BANC N'INSÈRE RIEN À LA MAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Règle reprise de `2026-08-21-2300-fixture-v0c-foyer-pluriel.ts` :
 *
 *   > « une fixture qui diverge du produit mesure autre chose. Chaque champ
 *   >   posé par LA MÊME RPC QUE L'ÉCRAN, jamais par un `insert` direct. »
 *
 * Ici c'est plus fort encore : le sujet du banc EST la chaîne de portes. Un
 * `update household_members set user_id = …` prouverait qu'un UPDATE marche.
 * Tout passe donc par `/auth/v1/signup`, `keel-household-invite-v1`,
 * `keel_household_preview_invitation` et `keel_household_join` — les mêmes
 * appels que le navigateur, dans le même ordre.
 *
 * ⚠️ LES DEUX COMPTES SONT CRÉÉS PAR LE BANC, avec un mot de passe qu'il
 * TIRE AU SORT et n'écrit nulle part. Aucun compte existant n'est visé : la
 * cicatrice `never-point-an-agent-at-an-account-it-cannot-log-into` dit qu'on
 * nomme une fixture, et une fixture qu'on vient de créer est la seule dont on
 * sait qu'elle n'appartient à personne.
 *
 * ⚠️ LES ADRESSES SONT EN `@example.com`, EXPRÈS. `keel-household-invite-v1`
 * les reconnaît comme jetables et rend `skipped_ephemeral` : le banc prouve
 * que l'envoi est BRANCHÉ sans qu'un e-mail parte. `supabase/.env` porte
 * `EMAIL_DELIVERY_ENABLED=1` et une vraie clé Resend — un domaine réel ici
 * enverrait vraiment, à quelqu'un qui n'a rien demandé.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'IL NE PROUVE PAS
 * ══════════════════════════════════════════════════════════════════════════
 *   · aucun rendu d'écran : il joue les APPELS, pas le navigateur ;
 *   · aucun appel modèle : la composition n'est pas de ce banc ;
 *   · aucun e-mail réellement délivré (voir ci-dessus).
 *
 * Usage :
 *   deno run --allow-net --allow-env \
 *     scripts/2026-09-09-1815-banc-compte-additionnel.ts \
 *     --url http://127.0.0.1:54321 --anon <clé> --service <clé> \
 *     [--secret <x-internal-secret>] [--keep]
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
const has = (name: string) => Deno.args.includes(`--${name}`);

const URL_BASE = arg("url", "http://127.0.0.1:54321").replace(/\/+$/, "");
const ANON = arg("anon");
const SERVICE = arg("service");
const SECRET = arg("secret");
const KEEP = has("keep");

if (!ANON || !SERVICE) {
  console.error(
    "usage: --url <url> --anon <clé> --service <clé> [--secret <x-internal-secret>] [--keep]",
  );
  Deno.exit(2);
}

/** Un suffixe par run: deux bancs lancés la même minute ne se marchent pas dessus. */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const MASTER_EMAIL = `banc-maitre-${RUN}@example.com`;
const MEMBER_EMAIL = `banc-membre-${RUN}@example.com`;
/** Tiré au sort, jamais journalisé: il ne sert qu'à ce processus. */
const PASSWORD = `Bx${crypto.randomUUID()}!`;

// ---------------------------------------------------------------------------
// Le compte-rendu — une ligne par fait, et le motif quand ça rougit
// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];

function ok(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function phase(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 66 - title.length))}`);
}

// ---------------------------------------------------------------------------
// Les appels, à nu — pas de client, pour que la requête soit lisible
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

async function rest(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** Une RPC, sous le jeton donné. `token` vide = le rôle `anon`. */
async function rpc(name: string, token: string, args: Json = {}) {
  const out = await rest(`rpc/${name}`, token || ANON, {
    method: "POST",
    body: JSON.stringify(args),
  });
  return out;
}

/** Le motif d'un `jsonb_build_object('ok', …, 'reason', …)`. */
function reasonOf(body: unknown): string {
  const row = (body ?? {}) as Json;
  if (row.ok === true) return "";
  return String(row.reason ?? `http/${JSON.stringify(body).slice(0, 80)}`);
}
const isOk = (body: unknown) => ((body ?? {}) as Json).ok === true;

async function signUp(email: string, metadata: Json) {
  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, data: metadata }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Json };
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  const token = String((body as Json).access_token ?? "");
  if (!token) throw new Error(`connexion impossible (${email}): ${JSON.stringify(body)}`);
  return token;
}

async function edge(fn: string, token: string, body: Json, internal = false) {
  const res = await fetch(`${URL_BASE}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
      ...(internal ? { "x-internal-secret": SECRET } : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as Json };
}

/**
 * La MÊME métadonnée que l'écran, importée du module pur du front.
 *
 * ⛔ RECOPIÉE, ET C'EST UNE DETTE ASSUMÉE: `frontend/src/keel/api/*.ts` est du
 * TS Vite, non importable depuis Deno sans embarquer la moitié du front. Les
 * deux clés qui portent tout — `keel_signup_intent` et `country` — sont donc
 * réaffirmées ici, et `householdSignup.int.test.ts` tient l'original. Une
 * divergence se verrait immédiatement: la porte refuserait.
 */
const MASTER_META = (name: string) => ({
  full_name: name,
  locale: "fr-FR",
  timezone: "Europe/Paris",
  tz_follow_device: true,
  keel_signup_intent: "student_free",
  country: "FR",
});
const MEMBER_META = (name: string, country: string | null) => ({
  full_name: name,
  locale: "fr-FR",
  timezone: "Europe/Paris",
  tz_follow_device: true,
  keel_signup_intent: "household_member",
  ...(country === null ? {} : { country }),
});

// ---------------------------------------------------------------------------
// LE PARCOURS
// ---------------------------------------------------------------------------

let masterToken = "";
let memberToken = "";
let householdId = "";
let leaMemberId = "";
let masterUserId = "";
let memberUserId = "";

async function run(): Promise<void> {
  console.log(`Banc du compte supplémentaire · run ${RUN} · ${URL_BASE}`);

  // ── PHASE 0 · LE FOYER, MONTÉ PAR SES PROPRES PORTES ────────────────────
  phase("PHASE 0 · le foyer du maître");
  {
    const up = await signUp(MASTER_EMAIL, MASTER_META("Ada Banc"));
    ok("le maître s'inscrit (intention `student_free`, pays FR)", up.status === 200,
      `http ${up.status} ${JSON.stringify(up.body).slice(0, 120)}`);
    masterUserId = String((up.body.user as Json | undefined)?.id ?? "");
    masterToken = await signIn(MASTER_EMAIL);

    const created = await rpc("keel_household_create", masterToken, { p_name: "Banc" });
    ok("il crée son foyer", isOk(created.body), reasonOf(created.body));
    householdId = String((created.body as Json).household_id ?? "");

    // ⚠️ L'ORDRE EST CELUI DE `SetupPage :: addMouth`. Un ordre différent est
    // un autre produit, et le banc mesurerait autre chose.
    const added = await rpc("keel_household_add_member", masterToken, {
      p_first_name: "Léa",
      p_birth_date: "1994-03-12",
      p_goal: "fat_loss",
    });
    ok("il ajoute une bouche SANS COMPTE — Léa", isOk(added.body), reasonOf(added.body));
    leaMemberId = String((added.body as Json).member_id ?? "");

    const allergy = await rpc("keel_household_add_allergy", masterToken, {
      p_member: leaMemberId,
      p_label: "arachide",
    });
    ok("il déclare une allergie sur cette bouche", isOk(allergy.body), reasonOf(allergy.body));
  }

  // ── PHASE 1 · L'INVITATION, ET SON E-MAIL ───────────────────────────────
  phase("PHASE 1 · l'invitation part");
  let token = "";
  {
    const sent = await edge("keel-household-invite-v1", masterToken, {
      email: MEMBER_EMAIL,
      member_id: leaMemberId,
    });
    ok("`keel-household-invite-v1` accepte", sent.body?.ok === true,
      `http ${sent.status} ${JSON.stringify(sent.body).slice(0, 140)}`);
    token = String(sent.body?.token ?? "");
    ok("elle rend un jeton en clair, une seule fois", token.length > 20);
    ok("le lien pointe sur `/join-household`, jamais `/join`",
      String(sent.body?.claim_url ?? "").includes("/join-household?token="),
      String(sent.body?.claim_url ?? ""));
    ok("elle rend le PRÉNOM de la bouche visée — un jeton anonyme part à la mauvaise personne",
      String(sent.body?.first_name ?? "") === "Léa");
    // ⚠️ L'ÉTAT D'ENVOI EST LU, PAS SUPPOSÉ. `skipped_ephemeral` prouve que le
    // chemin d'envoi est ATTEINT et qu'il s'est arrêté sur la garde d'adresse
    // jetable — c'est-à-dire branché, sans qu'un e-mail parte.
    ok("l'envoi est branché et suspendu sur une adresse jetable",
      sent.body?.send_state === "skipped_ephemeral",
      String(sent.body?.send_state ?? "?"));

    // Les refus, sous le MÊME jeton: la fonction n'écrit aucune règle.
    const other = await edge("keel-household-invite-v1", masterToken, {
      email: `x-${RUN}@example.com`,
      member_id: "00000000-0000-4000-8000-000000000000",
    });
    ok("une bouche inconnue ⇒ `not_a_member`", other.body?.reason === "not_a_member",
      String(other.body?.reason ?? "?"));
    const bad = await edge("keel-household-invite-v1", masterToken, {
      email: "pas-une-adresse",
      member_id: leaMemberId,
    });
    ok("une adresse malformée ⇒ `bad_email`", bad.body?.reason === "bad_email",
      String(bad.body?.reason ?? "?"));
  }

  // ── PHASE 2 · L'APERÇU, AVANT TOUT COMPTE ───────────────────────────────
  phase("PHASE 2 · ce que le lien dit à qui n'a pas de compte");
  {
    // Sous `anon`: c'est l'état RÉEL de qui ouvre le lien.
    const preview = await rpc("keel_household_preview_invitation", "", { p_token: token });
    const row = (preview.body ?? {}) as Json;
    ok("`anon` peut lire l'aperçu", row.valid === true, JSON.stringify(row).slice(0, 120));
    ok("il rend le nom du foyer", String(row.household_name ?? "") === "Banc");
    ok("il rend le prénom de la bouche", String(row.first_name ?? "") === "Léa");
    ok("il rend l'adresse invitée — sinon on devine l'adresse à employer",
      String(row.email ?? "") === MEMBER_EMAIL);

    const bogus = await rpc("keel_household_preview_invitation", "", { p_token: "n-importe-quoi" });
    ok("un jeton bidon rend `unknown_token`, jamais une erreur",
      ((bogus.body ?? {}) as Json).valid === false &&
        String(((bogus.body ?? {}) as Json).reason ?? "") === "unknown_token",
      JSON.stringify(bogus.body).slice(0, 100));

    // ⚠️ L'APERÇU NE CONSOMME PAS. Le rejouer doit rendre la même chose: si
    // lire brûlait le jeton, la personne perdrait sa place en regardant.
    const again = await rpc("keel_household_preview_invitation", "", { p_token: token });
    ok("l'aperçu ne CONSOMME pas le jeton", ((again.body ?? {}) as Json).valid === true);
  }

  // ── PHASE 3 · LA PORTE DE CRÉATION DE COMPTE ────────────────────────────
  phase("PHASE 3 · créer son compte depuis le lien");
  {
    // R12 — SANS PAYS, LA PORTE REFUSE, et le compte n'existe pas.
    const noCountry = await signUp(`sans-pays-${RUN}@example.com`, MEMBER_META("Sans Pays", null));
    ok("un signup foyer SANS pays échoue", noCountry.status >= 400,
      `http ${noCountry.status}`);
    const probe = await rest(
      `profiles?select=id&limit=1`,
      SERVICE,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    ok("…et la base reste joignable après ce refus", probe.status === 200);

    const up = await signUp(MEMBER_EMAIL, MEMBER_META("Léa Banc", "FR"));
    ok("le même signup AVEC pays réussit", up.status === 200,
      `http ${up.status} ${JSON.stringify(up.body).slice(0, 120)}`);
    memberUserId = String((up.body.user as Json | undefined)?.id ?? "");
    memberToken = await signIn(MEMBER_EMAIL);

    const me = await rest(
      `profiles?select=country,keel_role,locale,timezone&id=eq.${memberUserId}`,
      SERVICE,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    const prof = ((me.body as Json[]) ?? [])[0] ?? {};
    ok("son pays est posé", String(prof.country ?? "") === "FR", String(prof.country ?? "?"));
    ok("son fuseau est posé — sans lui, toute question tombe `outside_window` à jamais",
      String(prof.timezone ?? "") === "Europe/Paris");
    // ⛔ R14 — LE RÔLE N'EST PAS ÉCRIT, ET C'EST VOULU. `student` décrit une
    // relation avec un coach qui n'existe pas ici, et il ouvre `/app/today`.
    ok("⛔ `keel_role` reste NULL — la porte s'élargit, le rôle ne ment pas",
      prof.keel_role === null, String(prof.keel_role ?? "null"));
  }

  // ── PHASE 4 · LA RÉCLAMATION ────────────────────────────────────────────
  phase("PHASE 4 · réclamer sa place");
  {
    const joined = await rpc("keel_household_join", memberToken, {
      p_token: token,
      p_country: "FR",
    });
    ok("`keel_household_join` accepte", isOk(joined.body), reasonOf(joined.body));

    // R1 — ATTACHER, JAMAIS INSÉRER. C'est l'invariant de la fiche: la
    // personne ne recommence pas à zéro le jour où elle gagne un accès.
    const roster = await rpc("keel_household_roster", masterToken);
    const rows = (roster.body as Json[]) ?? [];
    const lea = rows.find((r) => String(r.member_id ?? "") === leaMemberId);
    ok("sa ligne existe TOUJOURS sous le même `member_id`", lea !== undefined);
    ok("son prénom n'a pas été écrasé par `full_name`",
      String(lea?.first_name ?? "") === "Léa", String(lea?.first_name ?? "?"));
    ok("son objectif est intact", String(lea?.goal ?? "") === "fat_loss",
      String(lea?.goal ?? "?"));
    ok("son âge dérivé est intact", String(lea?.age_state ?? "") === "adult");
    ok("SEUL `user_id` a bougé", String(lea?.user_id ?? "") === memberUserId);
    ok("le foyer n'a pas gagné de bouche", rows.length === 2, `${rows.length} lignes`);

    const allergies = await rest(
      `household_member_allergies?select=label&member_id=eq.${leaMemberId}`,
      memberToken,
    );
    ok("son allergie a survécu à la réclamation",
      ((allergies.body as Json[]) ?? []).some((a) => String(a.label ?? "") === "arachide"),
      JSON.stringify(allergies.body).slice(0, 100));

    // R4 — LE `where user_id is null` REND LA RÉCLAMATION NON REJOUABLE.
    const replay = await rpc("keel_household_join", memberToken, {
      p_token: token,
      p_country: "FR",
    });
    ok("rejouer le jeton rend un motif nommé, jamais un 500",
      !isOk(replay.body) && reasonOf(replay.body).length > 0, reasonOf(replay.body));

    // Et le maître ne peut plus émettre pour cette bouche: un lien mort est
    // pire qu'une absence de lien.
    const reinvite = await edge("keel-household-invite-v1", masterToken, {
      email: MEMBER_EMAIL,
      member_id: leaMemberId,
    });
    ok("une bouche déjà réclamée ⇒ `already_claimed`",
      reinvite.body?.reason === "already_claimed", String(reinvite.body?.reason ?? "?"));
  }

  // ── PHASE 5 · CE QU'IL PEUT ─────────────────────────────────────────────
  phase("PHASE 5 · ce que le compte supplémentaire PEUT faire");
  {
    const roster = await rpc("keel_household_roster", memberToken);
    const rows = (roster.body as Json[]) ?? [];
    // C'est la réponse à « voit-il les autres membres ? » — oui, tout le foyer.
    ok("il lit TOUT le roster, maître compris", rows.length === 2, `${rows.length} lignes`);

    const cov = await rpc("keel_household_my_coverage", memberToken);
    const c = (cov.body ?? {}) as Json;
    ok("il se sait dans un foyer", c.in_household === true);
    ok("…et il s'y sait `member`, pas maître — le tunnel de paiement le refuserait",
      String(c.role ?? "") === "member", String(c.role ?? "?"));

    const rename = await rpc("keel_household_set_member_name", memberToken, {
      p_member: leaMemberId,
      p_first_name: "Léa B.",
    });
    ok("il change SON prénom", isOk(rename.body), reasonOf(rename.body));

    const birth = await rpc("keel_household_set_member_birth_date", memberToken, {
      p_member: leaMemberId,
      p_birth_date: "1994-03-13",
    });
    ok("il change SA date de naissance", isOk(birth.body), reasonOf(birth.body));

    const away = await rpc("keel_household_set_member_away", memberToken, {
      p_member: leaMemberId,
      p_away: [{ day: "wed", slots: ["lunch"], source: "self" }],
    });
    ok("il déclare SES absences", isOk(away.body), reasonOf(away.body));

    // Son poids: la même table que le formulaire de pesée du chat.
    const today = new Date().toISOString().slice(0, 10);
    const weigh = await rest("student_body_measures", memberToken, {
      method: "POST",
      body: JSON.stringify({
        user_id: memberUserId,
        kind: "weight",
        value_si: 64.2,
        local_date: today,
        measured_at: new Date().toISOString(),
        source: "weigh_in",
      }),
    });
    ok("il écrit SON poids", weigh.status === 201, `http ${weigh.status} ${JSON.stringify(weigh.body).slice(0, 120)}`);
  }

  // ── PHASE 6 · CE QU'IL NE PEUT PAS ──────────────────────────────────────
  phase("PHASE 6 · les refus — « une personne gouverne le menu » (F1)");
  {
    const cases: Array<[string, string, Json, string]> = [
      ["composer pour le foyer n'est pas de son ressort", "keel_household_add_member",
        { p_first_name: "Intrus", p_birth_date: null, p_goal: null }, "not_owner"],
      ["il n'invite personne", "keel_household_invite",
        { p_email: `intrus-${RUN}@example.com`, p_member: leaMemberId }, "not_owner"],
      ["il ne retire personne", "keel_household_remove_member",
        { p_member: leaMemberId }, "not_owner"],
      ["il ne détache aucun accès", "keel_household_detach_member",
        { p_member: leaMemberId }, "not_owner"],
      ["il ne restreint personne", "keel_household_add_restriction",
        { p_member: leaMemberId, p_label: "sucre" }, "not_owner"],
      ["il ne pose pas d'allergie, même la sienne — c'est une donnée de sécurité",
        "keel_household_add_allergy", { p_member: leaMemberId, p_label: "gluten" }, "not_owner"],
    ];
    for (const [label, fn, args, want] of cases) {
      const out = await rpc(fn, memberToken, args);
      const got = reasonOf(out.body);
      ok(label, got === want, `attendu \`${want}\`, obtenu \`${got || "ok"}\``);
    }

    // Le plan du FOYER est composé par le maître, et le refus est HTTP.
    const gen = await edge("generate-household-meal-v1", memberToken, {
      operation: "preview",
    });
    ok("le générateur de foyer le refuse (403 `not_owner`)",
      gen.status === 403 || String(gen.body?.error ?? "") === "not_owner",
      `http ${gen.status} ${JSON.stringify(gen.body).slice(0, 100)}`);
  }

  // ── PHASE 7 · LES QUESTIONS L'ATTEIGNENT ────────────────────────────────
  phase("PHASE 7 · le balayage proactif le regarde");
  if (!SECRET) {
    console.log("  · sauté: passe `--secret <x-internal-secret>` pour l'exercer");
  } else {
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ LE BALAYAGE DES ÉLÈVES EST MIS DE CÔTÉ, ET C'EST OBLIGATOIRE ICI
    // ══════════════════════════════════════════════════════════════════════
    //
    // Un balayage complet de la base locale (~680 profils) fait rendre
    // `546 WORKER_LIMIT` au runtime sous `functions serve` — mesuré trois fois
    // le 2026-09-09, et `budget_ms` n'y change rien: la limite est la RESSOURCE
    // du worker, pas l'horloge. Un banc qui dépend de ça mesure la santé d'un
    // conteneur, pas le produit.
    //
    // `after_user_id` au maximum d'un UUID vide donc la boucle des élèves à la
    // PREMIÈRE page (zéro ligne au-delà du curseur), et la passe des membres —
    // quelques lignes dans toute la base — tourne seule. C'est ce qu'on veut
    // observer.
    const out = await edge("keel-proactive-v1", "", {
      dry_run: true,
      after_user_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    }, true);
    const members = (out.body?.members ?? {}) as Json;
    const show = (v: unknown) => String(JSON.stringify(v)).slice(0, 140);

    ok("le job atteint la seconde audience", members.reached === true,
      `http ${out.status} ${show(out.body)}`);

    // ══════════════════════════════════════════════════════════════════════
    // L'AUDIENCE EST COMPARÉE À LA BASE, PAS À `> 0`
    // ══════════════════════════════════════════════════════════════════════
    //
    // `scanned > 0` resterait vert sur n'importe quel autre membre de la base,
    // y compris si NOTRE compte était sauté. On compte donc, avec la clé de
    // service, exactement ce que la requête d'audience DEVRAIT rendre — les
    // bouches réclamées dont le profil n'est pas déjà `student` (ceux-là sont
    // servis par la boucle du dessus, et les servir deux fois enverrait deux
    // pesées le même soir) — et on exige l'égalité. Notre membre est dans ce
    // compte: l'égalité le couvre nommément.
    const claimed = await rest(
      "household_members?select=user_id&role=eq.member&user_id=not.is.null",
      SERVICE,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    const claimedIds = [
      ...new Set(
        ((claimed.body as Json[]) ?? []).map((r) => String(r.user_id ?? "")),
      ),
    ].filter(Boolean);
    const profs = await rest(
      `profiles?select=id,keel_role&id=in.(${claimedIds.join(",")})`,
      SERVICE,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    const expected = ((profs.body as Json[]) ?? [])
      .filter((r) => String(r.keel_role ?? "") !== "student").length;

    ok("notre membre est dans l'audience attendue",
      ((profs.body as Json[]) ?? []).some(
        (r) => String(r.id ?? "") === memberUserId && r.keel_role === null,
      ));
    ok(`le job en a regardé exactement autant que la base en porte (${expected})`,
      Number(members.scanned ?? -1) === expected,
      `job=${members.scanned} base=${expected}`);

    /** Examinés + refusés: « regardé », quelle que soit l'issue. */
    const looked = (tally: unknown): number => {
      const t = (tally ?? {}) as Json;
      const skipped = (t.skipped ?? {}) as Record<string, unknown>;
      const refused = Object.values(skipped)
        .reduce((sum: number, n) => sum + Number(n ?? 0), 0);
      return Number(t.examined ?? 0) + refused;
    };
    ok("la pesée les regarde", looked(members.weigh_in) > 0, show(members.weigh_in));
    ok("le repas les regarde aussi", looked(members.slot_meal) > 0, show(members.slot_meal));
    ok("aucune panne dans le balayage", Number(out.body?.failure_count ?? -1) === 0,
      show(out.body?.failures ?? out.body?.failure_count));

    // ⚠️ CE QUE CE BANC NE PROUVE PAS, ET IL FAUT L'ÉCRIRE ICI: la RÉSERVE de
    // budget (`MEMBER_BUDGET_SHARE`) n'est pas exercée par ce tir, puisqu'on
    // vide exprès la boucle des élèves. Elle a été mesurée une fois, le
    // 2026-09-09, sur un tir où le compte-rendu portait `exhausted: false` ET
    // `members.reached: true` dans la même réponse — c'est-à-dire les élèves
    // pas finis et les membres servis quand même. Le rejouer à volonté demande
    // une flotte que ce runtime local ne tient pas.
  }

  // ── PHASE 8 · LE MÉNAGE ─────────────────────────────────────────────────
  phase("PHASE 8 · le ménage");
  if (KEEP) {
    console.log(`  · gardé: foyer ${householdId}, maître ${MASTER_EMAIL}, membre ${MEMBER_EMAIL}`);
  } else {
    // ⛔ PAR LA PORTE DE SUPPRESSION DE COMPTE ADMIN, ET DANS CET ORDRE: le
    // membre d'abord. `household_members.user_id` est `on delete set null`
    // (FF-048 trou n°5), donc supprimer le membre DÉTACHE au lieu d'effacer sa
    // bouche. Le foyer, lui, SURVIT au maître (`created_by` en `set null`):
    // c'est constaté plus bas, puis balayé à la main.
    for (const id of [memberUserId, masterUserId]) {
      if (!id) continue;
      await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
    const gone = await rest(
      `profiles?select=id&id=in.(${memberUserId},${masterUserId})`,
      SERVICE,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    ok("les deux comptes ont disparu", ((gone.body as Json[]) ?? []).length === 0,
      String(JSON.stringify(gone.body)).slice(0, 100));

    // ⚠️ 🔴 LE FOYER, LUI, SURVIT — ET CE N'EST PAS UN DÉFAUT DU BANC.
    //
    // `households.created_by` est `on delete set null` (FF-048 §7, trou n°5):
    // supprimer le maître DÉTACHE au lieu d'effacer. Le foyer reste donc là,
    // avec ses bouches, et PERSONNE NE LE GOUVERNE — il n'existe ni suppression
    // de foyer ni transfert de propriété, et `cannot_remove_owner` interdit de
    // retirer la ligne du maître.
    //
    // C'est la question ouverte n°3 de FF-048, explicitement NON TRANCHÉE. Ce
    // banc ne la tranche pas: il la CONSTATE, et fait son propre ménage à la
    // main. Écrire ici « le foyer a disparu » aurait fait rougir le banc pour
    // un comportement voulu — et écrire l'inverse sans dire pourquoi aurait
    // enterré une décision produit dans une assertion.
    const orphan = await rest(
      `households?select=id,created_by&id=eq.${householdId}`,
      SERVICE,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    const row = ((orphan.body as Json[]) ?? [])[0];
    ok("le foyer SURVIT à son maître, sans propriétaire (FF-048 §11 n°3, non tranchée)",
      row !== undefined && row.created_by === null,
      String(JSON.stringify(orphan.body)).slice(0, 120));

    await rest(`households?id=eq.${householdId}`, SERVICE, {
      method: "DELETE",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    const swept = await rest(
      `households?select=id&id=eq.${householdId}`,
      SERVICE,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    ok("…et le banc balaie l'orphelin qu'il a créé",
      ((swept.body as Json[]) ?? []).length === 0);
  }

  console.log(
    `\n${failures.length === 0 ? "✅" : "❌"} ${passed} verts, ${failures.length} rouges`,
  );
  for (const f of failures) console.log(`   · ${f}`);
  if (failures.length > 0) Deno.exit(1);
}

await run();
