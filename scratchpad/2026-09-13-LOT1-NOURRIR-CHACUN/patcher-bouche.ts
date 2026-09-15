/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 1 — POSER UN ÉTAT DE BOUCHE QUE LE BANC N'A PAS D'OPTION POUR POSER
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net \
 *     scratchpad/2026-09-13-LOT1-NOURRIR-CHACUN/patcher-bouche.ts \
 *     --compte=<suffixe> --prenom=Iris --naissance=2016-05-10 [--corps=140/34]
 *
 * ⛔ PAR LES RPC DU PRODUIT, AVEC LE JETON DU TITULAIRE — jamais en SQL direct
 * et jamais sous `service_role`: `auth.uid()` y vaut NULL et toute RPC gatée
 * dessus est morte (cicatrice `auth-uid-null-under-service-role`).
 *
 * ⛔ AUCUNE SUPPRESSION, AUCUN RESET. Ce script ne fait que RÉÉCRIRE la date de
 * naissance et, si on le demande, la taille/le poids d'une bouche déjà créée
 * par le banc, sur un compte de fixture `lotf.*@keeltest.dev`.
 */
import { loadDotEnv } from "../2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
for (const [k, v] of Object.entries(loadDotEnv(`${ROOT}supabase/.env`))) {
  if (!Deno.env.get(k)) Deno.env.set(k, v);
}
const API = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const arg = (n: string) => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? "";

const SUFFIXE = arg("compte");
const PRENOM = arg("prenom");
const NAISSANCE = arg("naissance");
// ⟳ LOT 1 — L'OBJECTIF D'ABORD, ET C'EST UNE PORTE DU PRODUIT, PAS UN DÉTAIL
// D'ORDONNANCEMENT: `keel_household_set_member_birth_date` refuse
// `goal_not_for_minor` tant qu'une bouche à qui on donne une date de mineure
// porte un objectif de poids. Mesuré le 2026-09-13 sur `l1min`.
const BUT = arg("objectif");
const CORPS = arg("corps");
if (!SUFFIXE || !PRENOM) {
  console.error("usage: --compte=<suffixe> --prenom=<Prenom> [--naissance=YYYY-MM-DD] [--corps=cm/kg]");
  Deno.exit(2);
}
const EMAIL = `lotf.perte.${SUFFIXE}@keeltest.dev`;

const tok = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: "1234567" }),
});
const body = await tok.json() as { access_token?: string };
const bearer = String(body.access_token ?? "");
if (!bearer) {
  console.error(`⛔ connexion refusée pour ${EMAIL}`);
  Deno.exit(2);
}
const rpc = async (name: string, args: Record<string, unknown>) => {
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// ⟳ LOT 1 — AJOUTER UNE BOUCHE **SANS CORPS**. Le banc écrit toujours un corps
// sur ses quatre bouches fixes; `no_body` — l'autre abstention de
// `dayTargetFor` — n'était donc atteignable par aucune de ses options.
if (arg("ajouter")) {
  const r = await rpc("keel_household_add_member", {
    p_first_name: arg("ajouter"),
    p_birth_date: NAISSANCE || "1992-04-08",
  });
  console.log(`   bouche ajoutée ${arg("ajouter")} (AUCUN corps) : ${JSON.stringify(r.body)}`);
}
const roster = await rpc("keel_household_roster", {});
const rows = Array.isArray(roster.body) ? roster.body as Record<string, unknown>[] : [];
const row = rows.find((r) => String(r.first_name ?? "") === PRENOM);
if (!row && arg("ajouter")) {
  for (const r of rows) console.log(`   roster : ${JSON.stringify(r)}`);
  Deno.exit(0);
}
if (!row) {
  console.error(`⛔ ${PRENOM} absente du roster de ${EMAIL}`);
  Deno.exit(2);
}
const memberId = String(row.member_id);

if (BUT) {
  const r = await rpc("keel_household_set_member_goal", {
    p_member: memberId,
    p_goal: BUT === "null" ? null : BUT,
  });
  console.log(`   objectif ${PRENOM} → ${BUT} : ${JSON.stringify(r.body)}`);
}
if (NAISSANCE) {
  const r = await rpc("keel_household_set_member_birth_date", {
    p_member: memberId,
    p_birth_date: NAISSANCE === "null" ? null : NAISSANCE,
  });
  console.log(`   naissance ${PRENOM} → ${NAISSANCE} : ${JSON.stringify(r.body)}`);
}
if (CORPS) {
  const [cm, kg] = CORPS.split("/").map(Number);
  const r = await rpc("keel_household_set_member_body", {
    p_member: memberId,
    p_height_cm: cm,
    p_weight_kg: kg,
    p_gender: String(row.gender ?? "female"),
    p_activity_level: "trains_some",
    p_day_activity: "on_feet",
    p_sport_frequency: "1_2",
    p_activity_axes_asked: true,
    p_appetite: "average",
    p_appetite_asked: true,
  });
  console.log(`   corps ${PRENOM} → ${cm} cm / ${kg} kg : ${JSON.stringify(r.body)}`);
}

const apres = await rpc("keel_household_roster", {});
for (const r of (Array.isArray(apres.body) ? apres.body : []) as Record<string, unknown>[]) {
  if (String(r.first_name ?? "") !== PRENOM) continue;
  console.log(`   ${PRENOM} : ${JSON.stringify(r)}`);
}
