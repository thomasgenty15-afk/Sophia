#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX DIRECTIONS, DEUX PLANS — LA FIXTURE ET LE TIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Demandé le 2026-09-11: deux générations solo, une personne qui veut PRENDRE
 * du poids, une qui veut en PERDRE, puis la mesure de `docs/keel/mesure.md`.
 *
 * ⛔ POURQUOI UNE DIRECTION, ET PAS `maintenance`. Les fixtures du lot 8
 * étaient en maintenance sans cible: `meal-energy-v1` refuse alors le chiffre
 * (`student_off` / `no_direction`), et sans chiffre il n'y a AUCUNE cible à
 * laquelle comparer l'assiette. Les contrôles 1, 5 et 8 de la grille sont
 * inmesurables sur une fixture sans direction.
 *
 * ⚠️ CHAQUE CHAMP EST POSÉ PAR LA RPC DE L'ÉCRAN, jamais par un `insert`:
 * une fixture qui diverge du produit mesure autre chose. Seules `profiles` et
 * `student_goals` passent en PostgREST — le produit lui-même les écrit comme ça
 * (`api/keelClient.ts`, `api/household.ts :: createOwnerGoalRow`).
 *
 *     deno run --allow-net --allow-read --allow-env \
 *       scripts/2026-09-11-mesure-deux-directions.ts [perte|gain|les-deux]
 */

const JOURS = 3;

interface Sujet {
  cle: string;
  email: string;
  prenom: string;
  naissance: string;
  poidsKg: number;
  tailleCm: number;
  objectif: "fat_loss" | "muscle_gain";
  cibleKg: number;
  cadenceKgSemaine: number;
}

/**
 * ⚠️ LES DEUX CORPS SONT VOLONTAIREMENT DIFFÉRENTS, et pas seulement par
 * l'objectif: une personne qui veut perdre part de 88 kg, celle qui veut
 * prendre part de 62 kg. Deux fixtures au même poids ne diraient rien de plus
 * qu'un signe inversé sur le même besoin.
 */
const SUJETS: Sujet[] = [
  {
    cle: "perte",
    email: "lot8m.perte@keeltest.dev",
    prenom: "Paul",
    naissance: "1990-03-14",
    poidsKg: 88,
    tailleCm: 178,
    objectif: "fat_loss",
    cibleKg: 78,
    cadenceKgSemaine: 0.5,
  },
  {
    cle: "gain",
    email: "lot8m.gain@keeltest.dev",
    prenom: "Max",
    naissance: "1998-07-02",
    poidsKg: 62,
    tailleCm: 178,
    objectif: "muscle_gain",
    cibleKg: 70,
    cadenceKgSemaine: 0.25,
  },
];

const MDP = "1234567";
let API = "";
let ANON = "";
let SVC = "";

async function envOf(name: string): Promise<string> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  const text = await Deno.readTextFile(new URL("../supabase/.env", import.meta.url));
  for (const line of text.split("\n")) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].trim();
  }
  throw new Error(`${name} absent de l'environnement ET de supabase/.env`);
}

async function signIn(email: string): Promise<{ token: string; userId: string } | null> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: MDP }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) return null;
  return { token: String(body.access_token), userId: String(body.user?.id ?? "") };
}

async function compte(email: string): Promise<{ token: string; userId: string }> {
  const deja = await signIn(email);
  if (deja) return deja;
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: MDP,
      email_confirm: true,
      user_metadata: { fixture: "MESURE-2026-09-11" },
    }),
  });
  if (!res.ok) throw new Error(`création de ${email} → HTTP ${res.status}`);
  const frais = await signIn(email);
  if (!frais) throw new Error(`${email} créé mais non connectable`);
  return frais;
}

async function rpc(
  bearer: string,
  nom: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const res = await fetch(`${API}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: {
      apikey: bearer === SVC ? SVC : ANON,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const texte = await res.text();
  try {
    return JSON.parse(texte);
  } catch {
    return texte;
  }
}

/** ⛔ TOUT-OU-RIEN: un `ok: false` ici fait une bouche SANS CORPS, et le plan
 * qui suit mesure autre chose. On s'arrête. */
async function exige(bearer: string, nom: string, args: Record<string, unknown>): Promise<void> {
  const out = await rpc(bearer, nom, args) as Record<string, unknown>;
  if (out?.ok !== true) throw new Error(`${nom} → ${JSON.stringify(out)}`);
}

async function rest(
  chemin: string,
  methode: string,
  corps: unknown,
  prefer?: string,
): Promise<void> {
  const res = await fetch(`${API}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!res.ok) throw new Error(`${methode} ${chemin} → HTTP ${res.status} ${await res.text()}`);
  void (await res.text());
}

async function monte(s: Sujet): Promise<{ token: string; userId: string; memberId: string }> {
  const { token, userId } = await compte(s.email);
  console.log(`\n── ${s.cle.toUpperCase()} · ${s.prenom} (${s.email}) ──`);
  console.log(`   compte ${userId}`);

  // ══════════════════════════════════════════════════════════════════════
  // ⛔ DEUX MOTEURS LISENT DEUX TABLES — ET L'ENTONNOIR ÉCRIT LES DEUX
  // ══════════════════════════════════════════════════════════════════════
  //
  // `SetupPage.tsx` l'écrit en toutes lettres: `profiles` pour la lane
  // individuelle, `household_member_bodies` pour le foyer, et LE MÊME geste
  // remplit les deux. Une fixture qui ne pose que la ligne de bouche fabrique
  // une personne dont le PLAN est correctement dimensionné mais dont la CIBLE
  // affichée n'existe pas: `meal-energy-v1` rend alors
  // `{gap: "no_weight"}` — mesuré ici le 2026-09-11, avant que ce bloc existe.
  //
  // ⚠️ ET LE POIDS VA EN PLUS DANS LA SÉRIE (`student_body_measures`): la
  // cible se calcule sur le poids MESURÉ de la semaine, pas sur la fiche.
  await rest("profiles?on_conflict=id", "POST", {
    id: userId,
    full_name: `${s.prenom} Mesure`,
    birth_date: s.naissance,
    gender: "male",
    locale: "fr-FR",
    country: "FR",
    timezone: "Europe/Paris",
    onboarding_completed: true,
    height_cm: s.tailleCm,
    activity_level: "trains_some",
    day_activity: "seated",
    sport_frequency: "3_4",
  }, "resolution=merge-duplicates,return=minimal");

  const aujourdhui = new Date().toISOString().slice(0, 10);
  await rest(
    `student_body_measures?user_id=eq.${userId}&kind=eq.weight&source=eq.setup&local_date=eq.${aujourdhui}`,
    "DELETE",
    undefined,
    "return=minimal",
  );
  await rest("student_body_measures", "POST", {
    user_id: userId,
    kind: "weight",
    value_si: s.poidsKg,
    local_date: aujourdhui,
    measured_at: new Date().toISOString(),
    source: "setup",
    content_locale: "fr-FR",
  }, "return=minimal");

  // ⚠️ LA CIBLE ET LA CADENCE VONT AUSSI SUR `student_goals`: c'est cette ligne
  // que lit la porte du chiffre, et sans elle la direction reste fermée.
  await rest("student_goals?on_conflict=user_id", "POST", {
    user_id: userId,
    goal: s.objectif,
    content_locale: "en-GB",
    target_weight_kg: s.cibleKg,
    target_pace_kg_per_week: s.cadenceKgSemaine,
  }, "resolution=merge-duplicates,return=minimal");

  const coach = await rpc(token, "keel_join_house_coach", { p_country: "FR" }) as Record<string, unknown>;
  if (coach?.joined !== true && coach?.reason !== "already_attached") {
    throw new Error(`coach maison → ${JSON.stringify(coach)}`);
  }

  const roster = await rpc(token, "keel_household_roster") as Record<string, unknown>[];
  if (roster.length !== 1) throw new Error(`foyer non solo: ${JSON.stringify(roster)}`);
  const memberId = String(roster[0].member_id);

  await exige(token, "keel_household_set_member_name", {
    p_member: memberId,
    p_first_name: s.prenom,
  });
  await exige(token, "keel_household_set_member_birth_date", {
    p_member: memberId,
    p_birth_date: s.naissance,
  });
  await exige(token, "keel_household_set_member_body", {
    p_member: memberId,
    p_height_cm: s.tailleCm,
    p_weight_kg: s.poidsKg,
    p_gender: "male",
    p_activity_level: "trains_some",
    p_day_activity: "seated",
    p_sport_frequency: "3_4",
    p_activity_axes_asked: true,
    p_appetite: "average",
    p_appetite_asked: true,
  });
  // ⛔ PAS DE `set_member_goal` NI DE `set_member_target` ICI, ET CE N'EST PAS
  // UN RACCOURCI. Les deux RPC refusent `has_account`: une bouche qui a un
  // compte porte son objectif dans SON `student_goals`, pas sur la ligne de
  // foyer. Le moteur le lit dans cet ordre — la ligne de foyer d'abord, puis
  // `student_goals` qui PREND LA MAIN pour les bouches à compte
  // (`index.ts :: paceByMember`). La ligne `student_goals` écrite plus haut est
  // donc la bonne, et la seule.
  const apres = await rpc(token, "keel_household_roster") as Record<string, unknown>[];
  const vu = String(apres[0]?.goal ?? "");
  if (vu !== s.objectif) {
    throw new Error(`le roster lit « ${vu} » au lieu de « ${s.objectif} »`);
  }
  console.log(
    `   corps ${s.tailleCm} cm / ${s.poidsKg} kg · ${s.objectif} → ${s.cibleKg} kg ` +
      `à ${s.cadenceKgSemaine} kg/sem`,
  );
  return { token, userId, memberId };
}

async function tire(s: Sujet, token: string, userId: string): Promise<void> {
  // Ardoise nette: un plan déjà posé refuse le suivant (`plan_overlaps_existing`).
  await rest(`student_generated_meals?user_id=eq.${userId}`, "DELETE", undefined, "return=minimal");

  const t0 = Date.now();
  const res = await fetch(`${API}/functions/v1/generate-household-meal-v1`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ intent: "prepare_next", window: { kind: "days", count: JOURS } }),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status !== 200) {
    console.log(`   ⛔ HTTP ${res.status} en ${ms} ms — ${JSON.stringify(body).slice(0, 300)}`);
    return;
  }
  const meal = body.meal as Record<string, unknown>;
  console.log(`   ✅ plan ${meal?.id} en ${ms} ms (${JOURS} jours)`);
  console.log(`   request_id ${body.request_id}`);
}

const quoi = (Deno.args[0] ?? "les-deux").trim();
API = await envOf("SUPABASE_URL");
ANON = await envOf("SUPABASE_ANON_KEY");
SVC = await envOf("SUPABASE_SERVICE_ROLE_KEY");
console.log(`pile ✓ ${API} · fenêtre ${JOURS} jours`);

for (const s of SUJETS) {
  if (quoi !== "les-deux" && quoi !== s.cle) continue;
  const { token, userId } = await monte(s);
  await tire(s, token, userId);
}
