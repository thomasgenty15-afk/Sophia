#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env
// ---------------------------------------------------------------------------
// V0-C-quater — LE SECOND RÉGIME DÉCLARÉ, POSÉ PAR LA PORTE DU PRODUIT
//
// ⛔ POURQUOI CE FICHIER EXISTE, ALORS QUE LA FIXTURE A DÉJÀ SON SCRIPT.
// `scripts/2026-08-21-2300-fixture-v0c-foyer-pluriel.ts` porte désormais
// `diet: "vegetarian"` sur Yanis — c'est là que la fixture est DÉCRITE. Mais
// depuis `S4` ce script s'ARRÊTE (exit 1, `minorGoalOrDie()`) avant d'écrire
// quoi que ce soit : Anouk (2011-05-20) porte `muscle_gain`, et la base refuse
// désormais un objectif de poids sur un mineur. Mesuré le 2026-08-22 :
//
//     deno run … fixture-v0c-foyer-pluriel.ts
//       → « ⛔ ARRÊT — `S4` REFUSE LA PRÉCISION N° 2 DE CETTE FIXTURE. », rc=1
//
// ⛔ ET LE CONTOURNEMENT SERAIT PIRE QUE LE DÉFAUT. `FIXTURE_MINOR_GOAL=
// maintenance` fait passer l'arme — mais `ensureMouth` RÉÉCRIT l'objectif de
// chaque bouche existante : Anouk passerait de `muscle_gain` à `maintenance`
// EN BASE, et la condition ④ (« deux objectifs opposés ») disparaîtrait du
// foyer sur lequel `V0-D` a mesuré. Rejouer la fixture entière pour poser UNE
// colonne coûterait la fixture.
//
// Ce fichier pose donc la seule ligne qui manque, par la MÊME RPC que l'écran
// (`keel_household_set_member_diet`, `MouthFormDialog.tsx`), sous le jeton du
// maître, jamais en `service_role`, jamais par un `insert`.
//
// ── L'ARME, ET ELLE MORD DANS LES DEUX SENS ────────────────────────────────
//   ① LA BOUCHE. Une SONDE est envoyée sur Camille — la seule bouche À COMPTE
//      — AVANT toute écriture. La RPC doit répondre `has_account`. Si elle
//      répondait `ok`, la colonne serait écrite là où
//      `keel_household_roster_for` ne la lit PAS (il lit
//      `student_safety_constraints.diet_ref` dès qu'il y a un compte) : un
//      NO-OP SILENCIEUX, et le lot repartirait avec `mouths = 1` en croyant le
//      moteur cassé. C'est le piège que la fiche d'origine tendait.
//   ② LE RÉGIME. Il est SURCHARGEABLE (`V0C_SECOND_REGIME`) — une garde
//      paramétrée par sa propre constante reste verte quand on change la
//      constante. `vegan` et `omnivore` sont refusés AVANT connexion :
//        · un second `vegan` REFERME la divergence (`dietDiverges` rend
//          `false` dès que `exclusionCount(own) >= exclusionCount(strictest)`) ;
//        · `omnivore` traverse `memberRegime` en `null` — il n'élève JAMAIS
//          `regime_belt.mouths`.
//
//     V0C_SECOND_REGIME=vegan deno run …      → exit 1, RIEN d'écrit
//     V0C_SECOND_REGIME=omnivore deno run …   → exit 1, RIEN d'écrit
//     (défaut : vegetarian)                   → écrit
// ---------------------------------------------------------------------------

const MASTER_EMAIL = "fixture.v0c.master@keeltest.dev";
const MASTER_PASSWORD = "1234567";
const HOUSEHOLD = "b1959752-92c8-4038-8c17-992a77d68d21";

/** La bouche visée : MAJEURE, SANS COMPTE. Les deux comptent, voir l'arme. */
const TARGET_FIRST_NAME = Deno.env.get("V0C_SECOND_MOUTH") ?? "Yanis";
/** ⚠️ Surchargeable EXPRÈS — sans quoi l'arme ② ne peut pas être vue mordre. */
const SECOND_REGIME = Deno.env.get("V0C_SECOND_REGIME") ?? "vegetarian";
/** La bouche à COMPTE, celle sur qui l'écriture serait muette. Sonde ①. */
const ACCOUNT_MOUTH = "Camille";

function regimeOrDie(): void {
  if (SECOND_REGIME === "vegan" || SECOND_REGIME === "omnivore") {
    console.error(
      `\n⛔ ARRÊT — \`V0C_SECOND_REGIME=${SECOND_REGIME}\` n'ouvre RIEN.` +
        (SECOND_REGIME === "vegan"
          ? "\n   Un second `vegan` est ÉGAL au plus strict de la table :" +
            "\n   `dietDiverges` rend `false` dès que" +
            "\n   `exclusionCount(own) >= exclusionCount(strictest)`."
          : "\n   `omnivore` traverse `memberRegime` en `null` : il n'entre pas" +
            "\n   dans `mouthRegimes` et n'élève jamais `regime_belt.mouths`.") +
        "\n   Attendus : vegetarian · pescatarian\n",
    );
    Deno.exit(1);
  }
  if (!["vegetarian", "pescatarian"].includes(SECOND_REGIME)) {
    console.error(`\n⛔ ARRÊT — \`${SECOND_REGIME}\` n'est pas un régime du CHECK.\n`);
    Deno.exit(1);
  }
  console.log(`arme ✓ régime « ${SECOND_REGIME} » — strictement sous \`vegan\``);
}

async function envOf(name: string): Promise<string> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  const path = new URL("../supabase/.env", import.meta.url);
  const text = await Deno.readTextFile(path);
  for (const line of text.split("\n")) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].trim();
  }
  throw new Error(`${name} absent de l'environnement ET de supabase/.env`);
}

let API_URL = "";
let ANON_KEY = "";

async function call(
  path: string,
  init: RequestInit & { bearer: string },
): Promise<{ status: number; body: unknown }> {
  const { bearer, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${bearer}`,
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = raw === "" ? null : JSON.parse(raw);
  } catch { /* du texte */ }
  return { status: res.status, body };
}

interface RosterRow {
  member_id: string;
  user_id: string | null;
  first_name: string;
  role: string;
  age_state: string;
  goal: string | null;
  diet: string | null;
}

async function roster(token: string): Promise<RosterRow[]> {
  const { status, body } = await call("/rest/v1/rpc/keel_household_roster", {
    method: "POST",
    bearer: token,
    body: JSON.stringify({}),
  });
  if (status >= 300) throw new Error(`roster → HTTP ${status} : ${JSON.stringify(body)}`);
  return (body ?? []) as RosterRow[];
}

async function main(): Promise<void> {
  regimeOrDie();

  API_URL = await envOf("SUPABASE_URL");
  ANON_KEY = await envOf("SUPABASE_ANON_KEY");

  const login = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: MASTER_EMAIL, password: MASTER_PASSWORD }),
  });
  const auth = await login.json().catch(() => ({}));
  if (!login.ok || !auth?.access_token) {
    throw new Error(`connexion du maître → ${login.status} ${JSON.stringify(auth)}`);
  }
  const token = String(auth.access_token);
  console.log(`maître ✓ ${MASTER_EMAIL} (${auth.user?.id})`);

  const before = await roster(token);
  console.log("\n── AVANT ─────────────────────────────────────────────────");
  for (const r of before) {
    console.log(
      `  ${r.first_name.padEnd(8)} ${r.member_id} role=${r.role.padEnd(6)} ` +
        `age=${r.age_state.padEnd(7)} goal=${String(r.goal ?? "—").padEnd(12)} ` +
        `diet=${String(r.diet ?? "—").padEnd(11)} compte=${r.user_id ? "oui" : "non"}`,
    );
  }

  // ── ARME ① — LA SONDE SUR LA BOUCHE À COMPTE ────────────────────────────
  const withAccount = before.find((r) => r.first_name === ACCOUNT_MOUTH);
  if (!withAccount) throw new Error(`${ACCOUNT_MOUTH} introuvable dans le roster`);
  if (withAccount.user_id === null) {
    throw new Error(`${ACCOUNT_MOUTH} n'a PAS de compte — la sonde ne prouve rien`);
  }
  const probe = await call("/rest/v1/rpc/keel_household_set_member_diet", {
    method: "POST",
    bearer: token,
    body: JSON.stringify({ p_member: withAccount.member_id, p_diet: SECOND_REGIME }),
  });
  const probeReason = (probe.body as Record<string, unknown> | null)?.reason;
  console.log(
    `\nsonde ① ${ACCOUNT_MOUTH} (AVEC compte) → HTTP ${probe.status} ` +
      `${JSON.stringify(probe.body)}`,
  );
  if (probeReason !== "has_account") {
    console.error(
      "\n⛔ ARRÊT — la porte a ACCEPTÉ une écriture sur une bouche à compte." +
        "\n   `keel_household_roster_for` ne relit PAS cette colonne quand il y" +
        "\n   a un compte : la ligne serait écrite pour personne. RIEN n'est" +
        "\n   posé tant que ce refus ne se produit pas.\n",
    );
    Deno.exit(1);
  }
  console.log("        ✓ refus `has_account` — la colonne ne vit pas là, la porte le dit");

  // ── L'ÉCRITURE, PAR LA PORTE DU PRODUIT ─────────────────────────────────
  const target = before.find((r) => r.first_name === TARGET_FIRST_NAME);
  if (!target) throw new Error(`${TARGET_FIRST_NAME} introuvable dans le roster`);
  if (target.user_id !== null) {
    throw new Error(
      `${TARGET_FIRST_NAME} a un compte — son régime vit dans son « about you »`,
    );
  }
  if (target.age_state === "minor") {
    throw new Error(
      `${TARGET_FIRST_NAME} est MINEUR — on n'ajoute pas une restriction ` +
        `alimentaire à une enfant pour ouvrir un compteur`,
    );
  }
  const wrote = await call("/rest/v1/rpc/keel_household_set_member_diet", {
    method: "POST",
    bearer: token,
    body: JSON.stringify({ p_member: target.member_id, p_diet: SECOND_REGIME }),
  });
  console.log(
    `\nécriture ${TARGET_FIRST_NAME} (SANS compte) → HTTP ${wrote.status} ` +
      `${JSON.stringify(wrote.body)}`,
  );
  if ((wrote.body as Record<string, unknown> | null)?.ok !== true) {
    throw new Error(`refus : ${JSON.stringify(wrote.body)}`);
  }

  // ── RELU DEPUIS LA BASE, PAR LE RÉSOLVEUR QUE LE MOTEUR APPELLE ─────────
  const after = await roster(token);
  console.log("\n── APRÈS (relu par `keel_household_roster`) ──────────────");
  for (const r of after) {
    console.log(
      `  ${r.first_name.padEnd(8)} ${r.member_id} role=${r.role.padEnd(6)} ` +
        `age=${r.age_state.padEnd(7)} goal=${String(r.goal ?? "—").padEnd(12)} ` +
        `diet=${String(r.diet ?? "—").padEnd(11)} compte=${r.user_id ? "oui" : "non"}`,
    );
  }
  const declared = after.filter((r) =>
    r.diet === "vegan" || r.diet === "vegetarian" || r.diet === "pescatarian"
  );
  const distinct = new Set(declared.map((r) => r.diet));
  console.log(
    `\nrégimes déclarés : ${declared.length} ` +
      `(${declared.map((r) => `${r.first_name}:${r.diet}`).join(", ")}) · ` +
      `distincts : ${distinct.size}`,
  );
  if (declared.length < 2 || distinct.size < 2) {
    console.error("\n⛔ `regime_belt.mouths` restera à 1 — la fixture n'exerce rien.\n");
    Deno.exit(1);
  }
  console.log(`\n✓ foyer ${HOUSEHOLD} — deux régimes DÉCLARÉS et non emboîtés.`);
}

if (import.meta.main) {
  await main();
}
