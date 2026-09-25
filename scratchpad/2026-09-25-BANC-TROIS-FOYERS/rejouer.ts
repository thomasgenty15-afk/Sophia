/**
 * REJOUER UN TIR RÉEL SANS LE MODÈLE — banc des trois foyers (2026-09-25).
 *
 *   deno run -A --config supabase/functions/deno.json \
 *     scratchpad/2026-09-25-BANC-TROIS-FOYERS/rejouer.ts --brouillon=<draft_id>
 *
 * Sert au VRAI handler de `generate-household-meal-v1`, importé dans ce
 * processus, les réponses que le modèle a réellement rendues pendant le tir
 * d'origine (`llm_raw_response_events`), UNE FILE PAR `source` (posée dans
 * chaque requête par `_shared/gemini.ts`, `metadata.source`), dans l'ordre.
 *
 * ⛔ ZÉRO DÉPENSE : la clé est une sentinelle, tout hôte fournisseur est
 * intercepté, et un hôte inconnu jette.
 * ⛔ COMPTES DE FIXTURE SEULEMENT : le compte du brouillon doit finir en
 * `@keeltest.dev` ; sinon le banc s'arrête.
 * ⛔ UN APPEL ABSENT DE LA CONSERVE EST UN ÉCHEC DU BANC, jamais une réussite :
 * le handler reçoit un 400 et le rapport le nomme (« divergé à l'appel N »).
 *
 * Écrit un NOUVEAU brouillon sur le même compte (même corps de requête, même
 * `request_id` — les réparations en conserve citent `<request_id>#r0`) et
 * imprime son id, à passer à `render.py`, `checks.py`, `nutri.py`.
 *
 * ⚠️ PAS D'HORLOGE PAR DÉFAUT. `started_at` est horodaté à l'horloge du
 * processus ; une horloge reculée ferait réclamer la ligne par le cron de
 * relance, qui lancerait une VRAIE génération facturée. Le banc refuse donc de
 * rejouer un tir d'un autre jour (heure de Paris) sans `--horloge=<ISO>` ET
 * `--suspendre-relance` (qui coupe le cron local le temps du rejeu, puis le
 * rétablit).
 *
 * ⚠️ NE PAS relancer `fixtures.py` avant un rejeu : il recrée les bouches, donc
 * de nouveaux identifiants que la conserve ne connaît pas.
 */
import {
  captureServeHandler,
  installerHorloge,
  loadDotEnv,
} from "../2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const HERE = `${ROOT}scratchpad/2026-09-25-BANC-TROIS-FOYERS`;
const arg = (name: string) =>
  Deno.args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? "";
const BROUILLON = arg("brouillon").trim();
const HORLOGE = arg("horloge").trim();
const SUSPENDRE = Deno.args.includes("--suspendre-relance");
if (!/^[0-9a-f-]{36}$/.test(BROUILLON)) {
  console.error("usage : rejouer.ts --brouillon=<draft_id> [--horloge=<ISO> --suspendre-relance]");
  Deno.exit(2);
}

// ── ① L'ENVIRONNEMENT : celui de `functions serve`, clés remplacées ─────────
const dotenv = loadDotEnv(`${ROOT}supabase/.env`);
for (const [k, v] of Object.entries(dotenv)) {
  if (!Deno.env.get(k)) Deno.env.set(k, v);
}
Deno.env.set("OPENAI_API_KEY", "sk-rejeu-banc0925-aucune-depense");
Deno.env.set("GEMINI_API_KEY", "rejeu-banc0925-aucune-depense");
Deno.env.set("MEGA_TEST_MODE", "0");
const API = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
if (!API || !ANON) {
  console.error("⛔ pile locale absente de supabase/.env");
  Deno.exit(2);
}

// ── LA BASE, EN LECTURE, PAR LE CONTENEUR ────────────────────────────────────
async function psql(sql: string): Promise<string> {
  const cmd = new Deno.Command("docker", {
    args: ["exec", "-i", "supabase_db_Sophia_2", "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tA"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const w = child.stdin.getWriter();
  await w.write(new TextEncoder().encode(sql));
  await w.close();
  const out = await child.output();
  if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
  return new TextDecoder().decode(out.stdout).trim();
}
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

// ── ② LE TIR D'ORIGINE ET SA CONSERVE ───────────────────────────────────────
type Draft = {
  id: string;
  user_id: string;
  request_id: string;
  attempt: number;
  created_at: string;
  status: string;
  request_body: Record<string, unknown>;
  response: Record<string, unknown> | null;
};
const origine = JSON.parse(await psql(
  `select json_build_object('id',id,'user_id',user_id,'request_id',request_id,'attempt',attempt,
     'created_at',created_at,'status',status,'request_body',request_body,'response',response)::text
   from student_meal_drafts where id=${q(BROUILLON)}`,
) || "null") as Draft | null;
if (!origine) {
  console.error(`⛔ brouillon introuvable : ${BROUILLON}`);
  Deno.exit(2);
}
const email = await psql(`select email from auth.users where id=${q(origine.user_id)}`);
if (!email.endsWith("@keeltest.dev")) {
  console.error(`⛔ ${email} n'est pas un compte de fixture : rejeu refusé.`);
  Deno.exit(2);
}
// La tentative suivante du même `request_id` borne la fenêtre (C : deux
// tentatives, neuf appels sous le même identifiant).
const suivante = await psql(
  `select coalesce(min(created_at)::text,'') from student_meal_drafts
    where request_id=${q(origine.request_id)} and created_at > ${q(origine.created_at)}::timestamptz`,
);
type Evt = {
  source: string;
  status: string;
  output_text: string | null;
  system_prompt: string | null;
  user_message: string | null;
};
const evenements = JSON.parse(await psql(
  `select coalesce(json_agg(json_build_object('source',source,'status',status,'output_text',output_text,
     'system_prompt',system_prompt,'user_message',user_message) order by created_at),'[]')::text
   from llm_raw_response_events
   where request_id=${q(origine.request_id)}
     and source like 'generate-household-meal-v1%'
     and created_at >= ${q(origine.created_at)}::timestamptz - interval '2 seconds'
     ${suivante ? `and created_at < ${q(suivante)}::timestamptz` : ""}
     and (provider_request_id is null or provider_request_id not like 'resp_rejeu_%')
     and (provider_request_id is null or provider_request_id not like 'resp_lotf_%')`,
)) as Evt[];
const files = new Map<string, string[]>();
const consignes = new Map<string, { system: string; user: string }[]>();
for (const e of evenements) {
  if (e.status === "success") {
    const texte = String(e.output_text ?? "");
    try {
      JSON.parse(texte);
    } catch {
      console.error(`⛔ réponse stockée illisible (${e.source}, ${texte.length} car.) : tronquée ?`);
      Deno.exit(2);
    }
    files.set(e.source, [...(files.get(e.source) ?? []), texte]);
  } else if (e.status === "attempt_start") {
    consignes.set(e.source, [
      ...(consignes.get(e.source) ?? []),
      { system: String(e.system_prompt ?? ""), user: String(e.user_message ?? "") },
    ]);
  }
}
console.log(`\n══ REJEU de ${BROUILLON} (tentative ${origine.attempt}, ${email})`);
for (const [s, f] of files) console.log(`   conserve · ${s} : ${f.length} réponse(s)`);
if (!files.get("generate-household-meal-v1")?.length) {
  console.error("⛔ aucune composition en conserve pour ce tir");
  Deno.exit(2);
}

// ── ③ L'HORLOGE, ET LA GARDE DU CRON DE RELANCE ─────────────────────────────
const jourParis = (d: Date) =>
  new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
let cronSuspendu = false;
let horloge: { restore(): void } | null = null;
if (HORLOGE) {
  if (!SUSPENDRE) {
    console.error("⛔ --horloge exige --suspendre-relance (sinon le cron relancerait une vraie génération)");
    Deno.exit(2);
  }
  await psql(`update cron.job set active=false where jobname='keel-relaunch-meal-drafts'`);
  cronSuspendu = true;
  console.log("   ⚠️ cron keel-relaunch-meal-drafts SUSPENDU le temps du rejeu");
} else if (jourParis(new Date(origine.created_at)) !== jourParis(new Date())) {
  console.error(
    `⛔ tir du ${jourParis(new Date(origine.created_at))}, rejeu le ${jourParis(new Date())} : ` +
      `la grille dépend du jour. Relancer avec --horloge=${origine.created_at} --suspendre-relance.`,
  );
  Deno.exit(2);
}
const retablirCron = async () => {
  if (!cronSuspendu) return;
  await psql(`update cron.job set active=true where jobname='keel-relaunch-meal-drafts'`);
  cronSuspendu = false;
  console.log("   cron keel-relaunch-meal-drafts RÉTABLI");
};

try {
  // ── ④ LE JETON DU COMPTE DE FIXTURE (vrai réseau, avant le transport) ──────
  const login = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "1234567" }),
  });
  const jeton = String(((await login.json()) as { access_token?: string }).access_token ?? "");
  if (!jeton) throw new Error(`connexion refusée pour ${email}`);

  if (HORLOGE) horloge = installerHorloge(HORLOGE);

  // ── ⑤ LE TRAVAIL D'ARRIÈRE-PLAN, ATTENDU ───────────────────────────────────
  const enAttente: Promise<unknown>[] = [];
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime = {
    waitUntil: (p: Promise<unknown>) => {
      enAttente.push(p);
    },
  };

  // ── ⑥ LE TRANSPORT : une file par source, aucun appel réel ─────────────────
  const vraiFetch = globalThis.fetch;
  const hotesLocaux = new Set(["127.0.0.1", "localhost", new URL(API).hostname]);
  const hotesFournisseur = new Set([
    "api.openai.com",
    "generativelanguage.googleapis.com",
    new URL(Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com").hostname,
  ]);
  const servis: { rang: number; source: string; ok: boolean }[] = [];
  const divergences: string[] = [];
  const refuses: string[] = [];
  const envoyes = new Map<string, { input: string; instructions: string }[]>();
  let rang = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    let hote = "";
    try {
      hote = new URL(url).hostname.toLowerCase();
    } catch { /* hôte illisible : refusé plus bas */ }
    if (hotesLocaux.has(hote)) return await vraiFetch(input, init);
    if (!hotesFournisseur.has(hote)) {
      refuses.push(hote || url);
      throw new Error(`REJEU — sortie REFUSÉE vers « ${hote || url} »`);
    }
    rang++;
    const brut = typeof (init as Record<string, unknown> | undefined)?.body === "string"
      ? String((init as Record<string, unknown>).body)
      : "";
    let charge: Record<string, unknown> = {};
    try {
      charge = JSON.parse(brut) as Record<string, unknown>;
    } catch { /* corps illisible : source vide, donc divergence */ }
    const meta = (charge.metadata ?? {}) as Record<string, unknown>;
    const source = String(meta.source ?? "");
    envoyes.set(source, [
      ...(envoyes.get(source) ?? []),
      { input: String(charge.input ?? ""), instructions: String(charge.instructions ?? "") },
    ]);
    const file = files.get(source) ?? [];
    const texte = file.shift();
    if (texte === undefined) {
      servis.push({ rang, source, ok: false });
      divergences.push(`appel ${rang} (${source || "source absente"}) : absent de la conserve`);
      return new Response(
        JSON.stringify({
          error: { message: "REJEU : appel absent de la conserve", type: "invalid_request_error" },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    servis.push({ rang, source, ok: true });
    return new Response(
      JSON.stringify({
        id: `resp_rejeu_${rang}`,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        model: String(charge.model ?? ""),
        status: "completed",
        output_text: texte,
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  // ── ⑦ LES JOURNAUX DU HANDLER : dans un fichier, et les compteurs utiles ───
  const nomJournal = `${HERE}/rejeu-${BROUILLON.slice(0, 8)}-${Date.now()}.log`;
  const journal = await Deno.open(nomJournal, { write: true, create: true, truncate: true });
  const tags = new Map<string, string[]>();
  const garder = [
    "plan_repair_pass",
    "plan_repair_done",
    "work_time",
    "final_gate",
    "final_served",
    "pot_reconcile",
    "cross_contact",
  ];
  const ecrire = (niveau: string, parts: unknown[]) => {
    const ligne = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
    journal.writeSync(new TextEncoder().encode(`[${niveau}] ${ligne}\n`));
    for (const t of garder) {
      if (ligne.includes(`"keel.household_meal.${t}"`)) tags.set(t, [...(tags.get(t) ?? []), ligne]);
    }
  };
  const vraiConsole = { ...console };
  console.log = (...p: unknown[]) => ecrire("log", p);
  console.info = (...p: unknown[]) => ecrire("info", p);
  console.warn = (...p: unknown[]) => ecrire("warn", p);
  console.error = (...p: unknown[]) => ecrire("error", p);
  console.debug = (...p: unknown[]) => ecrire("debug", p);

  // ── ⑧ LE HANDLER, CAPTURÉ SANS PORT, PUIS L'APPEL ──────────────────────────
  const serve = captureServeHandler();
  await import(`${ROOT}supabase/functions/generate-household-meal-v1/index.ts`);
  const handler = await serve.handlerPromise;
  serve.restore();
  const t0 = performance.now();
  const reponse = await handler(new Request("http://localhost/generate-household-meal-v1", {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${jeton}`,
      "content-type": "application/json",
      "x-request-id": origine.request_id,
    },
    body: JSON.stringify(origine.request_body),
  }));
  const corps = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
  while (enAttente.length > 0) {
    await Promise.allSettled(enAttente.splice(0));
  }
  const ms = Math.round(performance.now() - t0);
  Object.assign(console, vraiConsole);
  journal.close();
  globalThis.fetch = vraiFetch;
  horloge?.restore();

  // ── ⑨ LE RAPPORT ─────────────────────────────────────────────────────────
  const nouveau = String(corps.draft_id ?? "");
  console.log(`   réponse ${reponse.status} · brouillon neuf ${nouveau || "(aucun)"} · ${ms} ms`);
  const ligne = nouveau
    ? await psql(
      `select status||'|'||coalesce(error_code,'')||'|'||coalesce(stage,'') from student_meal_drafts where id=${q(nouveau)}`,
    )
    : "";
  console.log(`   ligne en base : ${ligne}`);
  console.log(`   appels servis : ${servis.map((s) => `${s.rang}:${s.source.replace("generate-household-meal-v1", "gen")}${s.ok ? "" : "✗"}`).join(" ")}`);
  const restants = [...files].filter(([, f]) => f.length > 0).map(([s, f]) => `${s} ×${f.length}`);
  console.log(`   conserve inutilisée : ${restants.length ? restants.join(", ") : "aucune"}`);
  console.log(`   sorties refusées : ${refuses.length ? refuses.join(", ") : "aucune"}`);
  // Porte de fidélité : la consigne envoyée contient-elle la consigne stockée ?
  for (const [source, liste] of consignes) {
    const partis = envoyes.get(source) ?? [];
    liste.forEach((c, i) => {
      const p = partis[i];
      if (!p) return;
      const memeUser = p.input.includes(c.user);
      const memeSystem = c.system === "" || p.instructions.includes(c.system);
      console.log(
        `   fidélité · ${source.replace("generate-household-meal-v1", "gen")} #${i + 1} : ` +
          `consigne ${memeUser ? "identique" : "DIFFÉRENTE"}, système ${memeSystem ? "identique" : "DIFFÉRENT"}`,
      );
    });
  }
  for (const t of ["plan_repair_done", "work_time"]) {
    const l = tags.get(t)?.at(-1);
    if (l) console.log(`   ${t} : ${l.slice(l.indexOf("{"), l.indexOf("{") + 600)}`);
  }
  const passes = (tags.get("plan_repair_pass") ?? []).length;
  console.log(`   tours de réparation journalisés : ${passes}`);
  if (divergences.length > 0) {
    console.log(`\n   ⛔ LE REJEU A DIVERGÉ — ce tir ne prouve rien :`);
    for (const d of divergences) console.log(`     · ${d}`);
  }
  console.log(`   journal complet : ${nomJournal}`);
  if (nouveau) await Deno.writeTextFile(`${HERE}/draft-rejeu-${BROUILLON.slice(0, 8)}.txt`, nouveau);
} finally {
  await retablirCron();
}
