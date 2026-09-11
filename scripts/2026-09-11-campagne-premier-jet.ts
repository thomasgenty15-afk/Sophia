#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CAMPAGNE — SIX TIRS RÉELS, SÉQUENTIELS, UN COMPTE PAR RUN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Demandé par le § 4 du chantier « premier jet », repris par le lot F du plan
 * `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md` : six
 * générations de trois jours couvrant les deux directions, N = 1 et N > 1,
 * l'appétit et le repas léger. Puis la grille de `docs/keel/mesure.md`.
 *
 * ── ⛔ CE QUI A CHANGÉ LE 2026-09-11 (LOT 0), ET POURQUOI ────────────────
 * ① **LES DEUX `DELETE` SONT RETIRÉS.** Ce script effaçait
 *   `student_generated_meals?user_id=eq.<fixture>` — TOUS les plans du compte —
 *   et une ligne de `student_body_measures`. Le plan l'interdit en toutes
 *   lettres : « ne pas le relancer tel quel. Employer des comptes/runs isolés,
 *   des identifiants de run, et un harness sans suppression nécessaire. »
 *   Ces suppressions existaient pour contourner `plan_overlaps_existing` ; la
 *   parade est UN COMPTE PAR RUN, pas un effacement. Un effacement détruit
 *   aussi la preuve du run d'avant — c'est-à-dire exactement ce qu'on mesure.
 * ② **UN IDENTIFIANT DE RUN**, porté par les adresses e-mail, par les
 *   métadonnées du compte et par le nom du fichier de sortie. Deux campagnes
 *   ne peuvent plus se recouvrir ni s'écraser.
 * ③ **LE CONTEXTE EST HORODATÉ**, en UTC ET en heure locale du profil. Sans
 *   elle, une journée partielle n'est pas rejouable : c'est l'heure locale qui
 *   décide quels moments du premier jour sont déjà passés.
 * ④ **LE NOMBRE DE CASES EST ANNONCÉ AVANT LE TIR** (exigence du lot F), et
 *   calculé par la fonction de production `slotsUnservableToday` — pas par une
 *   règle recopiée ici. Après le tir, l'annonce est confrontée au compteur du
 *   moteur : un écart est un fait, pas un ajustement rétrospectif.
 *
 * ⛔ CE PETIT ÉCHANTILLON N'EST PAS UNE ESTIMATION DU TAUX DE RÉUSSITE EN
 * PRODUCTION. Le chantier le dit, et il a raison : six tirs disent ce qui se
 * passe six fois, pas ce qui se passe en général.
 *
 * ⚠️ SÉQUENTIEL, JAMAIS EN PARALLÈLE : deux générations simultanées se
 * disputent l'isolat edge et rendent des durées qui ne veulent rien dire.
 *
 * ⛔ AUCUN TIR N'EST REJOUÉ. Un échec est enregistré et on passe au CAS
 * SUIVANT — qui est un autre cas, pas la même relance. « Relancer dans le
 * vide » est interdit.
 *
 * ⛔ IL DÉPENSE DU MODÈLE. Ne pas le lancer sans autorisation explicite : le
 * plan ne l'ouvre qu'au lot F, et seulement après ses preuves hors ligne.
 *
 *     deno run --allow-net --allow-read --allow-write --allow-env \
 *       scripts/2026-09-11-campagne-premier-jet.ts [clé|tout]
 */
import { slotsUnservableToday } from "../supabase/functions/_shared/keel/plan_hours.ts";
import { DEFAULT_EATING_RHYTHM } from "../supabase/functions/_shared/keel/meal_generation.ts";

const JOURS = 3;
const MDP = "1234567";

/**
 * L'IDENTIFIANT DE CE RUN — horodaté à la seconde, en UTC.
 *
 * ⛔ IL EST DANS L'ADRESSE E-MAIL, ET C'EST TOUTE LA PARADE. Un compte neuf
 * n'a aucun plan, donc aucun recouvrement, donc aucune raison de supprimer
 * quoi que ce soit. `KEEL_CAMPAGNE_RUN` permet de rejouer DÉLIBÉRÉMENT sur les
 * comptes d'un run précédent — jamais par accident.
 */
const RUN_ID = (Deno.env.get("KEEL_CAMPAGNE_RUN") ?? "").trim() ||
  new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").toLowerCase();

/** Le fuseau des fixtures. Il décide des moments déjà passés du premier jour. */
const FUSEAU = "Europe/Paris";

/** L'heure locale entière, lue par la même horloge que l'annonce des cases. */
function heureLocale(fuseau: string, quand: Date): number {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: fuseau,
    hour: "2-digit",
    hour12: false,
  });
  return Number(f.format(quand));
}

function instantLocal(fuseau: string, quand: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: fuseau,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(quand);
}

/**
 * LES CASES ANNONCÉES AVANT LE TIR — par la fonction du produit.
 *
 * ⛔ LA RÈGLE N'EST PAS RECOPIÉE ICI. `slotsUnservableToday` porte les deux
 * motifs (« déjà passé » et « pas le temps d'acheter ») et leur recouvrement ;
 * une seconde écriture annoncerait un nombre que le moteur ne produit pas, et
 * l'annonce ne vaudrait plus rien.
 *
 * ⚠️ ELLE SUPPOSE LE RYTHME PAR DÉFAUT ET AUCUNE HEURE DÉCLARÉE — ce que ces
 * fixtures posent. Un sujet qui déclarerait un rythme rendrait ce calcul faux,
 * et il faudrait le lui passer.
 */
function casesAnnoncees(quand: Date): {
  grille: number;
  retirees: string[];
  attendues: number;
  heureLocale: number;
} {
  const h = heureLocale(FUSEAU, quand);
  const u = slotsUnservableToday({
    hourNow: h,
    rhythm: DEFAULT_EATING_RHYTHM,
    declaredHours: [],
  });
  const retirees = [...new Set([...u.passed, ...u.heldForShopping])].map(String);
  const grille = JOURS * DEFAULT_EATING_RHYTHM.length;
  return { grille, retirees, attendues: grille - retirees.length, heureLocale: h };
}

type Appetit = "small" | "average" | "large";

interface Sujet {
  /**
   * LA CLÉ DU CAS. ⛔ IL N'Y A PLUS D'ADRESSE ÉCRITE ICI : elle est DÉRIVÉE de
   * la clé et de l'identifiant de run (`emailDuRun`). Une adresse fixe dans ce
   * tableau était la raison pour laquelle deux campagnes se marchaient dessus,
   * et donc la raison des `DELETE` retirés.
   */
  cle: string;
  prenom: string;
  naissance: string;
  poidsKg: number;
  tailleCm: number;
  objectif: "fat_loss" | "muscle_gain";
  cibleKg: number;
  cadenceKgSemaine: number;
  appetit: Appetit;
  /** Le moment marqué « léger », ou `null`. Seuls breakfast/lunch/dinner. */
  leger: string | null;
  /** Une seconde bouche SANS compte, ou `null`. N > 1. */
  bouche: null | {
    prenom: string;
    naissance: string;
    objectif: "fat_loss" | "muscle_gain" | "maintenance";
    poidsKg: number;
    tailleCm: number;
    appetit: Appetit;
  };
}

const SUJETS: Sujet[] = [
  // ① et ② — LE COUPLE COMPARABLE. Mêmes corps, mêmes objectifs, même fenêtre
  // que les deux tirs du 2026-09-11 au matin : c'est la seule paire qui donne
  // un avant/après direct.
  {
    cle: "perte", prenom: "Paul",
    naissance: "1990-03-14", poidsKg: 88, tailleCm: 178,
    objectif: "fat_loss", cibleKg: 78, cadenceKgSemaine: 0.5,
    appetit: "average", leger: null, bouche: null,
  },
  {
    cle: "gain", prenom: "Max",
    naissance: "1998-07-02", poidsKg: 62, tailleCm: 178,
    objectif: "muscle_gain", cibleKg: 70, cadenceKgSemaine: 0.25,
    appetit: "average", leger: null, bouche: null,
  },
  // ③ et ④ — L'APPÉTIT, DANS LES DEUX SENS. Il déplace les BORNES DE MASSE
  // (×0,90 / ×1,10), donc le couloir de densité, donc ce que l'ajusteur doit
  // fermer. C'est le levier le plus direct sur le lot D.
  {
    cle: "perte-grand", prenom: "Hugo",
    naissance: "1988-11-02", poidsKg: 95, tailleCm: 183,
    objectif: "fat_loss", cibleKg: 85, cadenceKgSemaine: 0.5,
    appetit: "large", leger: null, bouche: null,
  },
  {
    cle: "gain-petit", prenom: "Théo",
    naissance: "2000-05-21", poidsKg: 58, tailleCm: 170,
    objectif: "muscle_gain", cibleKg: 66, cadenceKgSemaine: 0.25,
    appetit: "small", leger: null, bouche: null,
  },
  // ⑤ — LE REPAS LÉGER. Il change le PLANCHER de densité (60 au lieu de 100) et
  // le poids du moment dans la journée : c'est le cas où le couloir est le plus
  // large, et où une consigne mal recopiée se voit le plus.
  {
    cle: "leger", prenom: "Léa",
    naissance: "1994-02-08", poidsKg: 72, tailleCm: 168,
    objectif: "fat_loss", cibleKg: 66, cadenceKgSemaine: 0.25,
    appetit: "average", leger: "dinner", bouche: null,
  },
  // ⑥ — N > 1. Deux bouches, deux objectifs OPPOSÉS sur la même cuisson :
  // c'est le cas qui force l'intersection des couloirs, et le seul où
  // `cellDensityOf` du lot C a quelque chose à dire.
  {
    cle: "foyer", prenom: "Sarah",
    naissance: "1991-09-30", poidsKg: 68, tailleCm: 165,
    objectif: "fat_loss", cibleKg: 62, cadenceKgSemaine: 0.25,
    appetit: "average", leger: null,
    bouche: {
      prenom: "Nico", naissance: "1989-04-12", objectif: "muscle_gain",
      poidsKg: 74, tailleCm: 180, appetit: "large",
    },
  },
];

let API = "", ANON = "", SVC = "";

async function envOf(name: string): Promise<string> {
  const v = Deno.env.get(name);
  if (v && v.trim()) return v.trim();
  const text = await Deno.readTextFile(new URL("../supabase/.env", import.meta.url));
  for (const line of text.split("\n")) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].trim();
  }
  throw new Error(`${name} absent`);
}

async function signIn(email: string) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: MDP }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) return null;
  return { token: String(body.access_token), userId: String(body.user?.id ?? "") };
}

/** L'adresse de CE run. Un compte neuf par run : aucune suppression nécessaire. */
function emailDuRun(cle: string): string {
  return `camp.${cle}.${RUN_ID}@keeltest.dev`;
}

async function compte(email: string) {
  const deja = await signIn(email);
  if (deja) return deja;
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" },
    body: JSON.stringify({
      email, password: MDP, email_confirm: true,
      user_metadata: {
        fixture: "CAMPAGNE-PREMIER-JET-2026-09-11",
        run_id: RUN_ID,
        created_at_utc: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(`création de ${email} → HTTP ${res.status} ${await res.text()}`);
  const frais = await signIn(email);
  if (!frais) throw new Error(`${email} créé mais non connectable`);
  return frais;
}

async function rpc(bearer: string, nom: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: {
      apikey: bearer === SVC ? SVC : ANON,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const t = await res.text();
  try { return JSON.parse(t); } catch { return t; }
}

async function exige(bearer: string, nom: string, args: Record<string, unknown>) {
  const out = await rpc(bearer, nom, args) as Record<string, unknown>;
  if (out?.ok !== true) throw new Error(`${nom} → ${JSON.stringify(out)}`);
}

async function rest(chemin: string, methode: string, corps: unknown, prefer?: string) {
  const res = await fetch(`${API}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: SVC, authorization: `Bearer ${SVC}`,
      "content-type": "application/json", ...(prefer ? { prefer } : {}),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!res.ok) throw new Error(`${methode} ${chemin} → HTTP ${res.status} ${await res.text()}`);
  void (await res.text());
}

async function monte(s: Sujet) {
  const email = emailDuRun(s.cle);
  const { token, userId } = await compte(email);
  console.log(`\n── ${s.cle.toUpperCase()} · ${s.prenom} (${email}) ──`);
  console.log(`   compte ${userId} · run ${RUN_ID}`);

  // Les DEUX tables du corps (cf. `SetupPage.tsx`) plus la série de poids.
  await rest("profiles?on_conflict=id", "POST", {
    id: userId, full_name: `${s.prenom} Campagne`, birth_date: s.naissance,
    gender: "male", locale: "fr-FR", country: "FR", timezone: FUSEAU,
    onboarding_completed: true, height_cm: s.tailleCm,
    activity_level: "trains_some", day_activity: "seated", sport_frequency: "3_4",
  }, "resolution=merge-duplicates,return=minimal");

  // ⛔ AUCUNE SUPPRESSION. La version d'avant effaçait la pesée du jour avant de
  // la réécrire ; sur un compte NEUF il n'y a rien à effacer, et sur un compte
  // réutilisé un `DELETE` détruirait la série de pesées — c'est-à-dire la donnée
  // qui dimensionne toute la fenêtre.
  //
  // ⚠️ ET PAS D'`on_conflict` NON PLUS : `student_body_measures` n'a AUCUN index
  // unique sur (user_id, kind, local_date, source) — vérifié le 2026-09-11, il
  // n'y a que la clé primaire et un index non unique. Un `on_conflict` sur des
  // colonnes non uniques est refusé par PostgREST ; le compte neuf rend
  // l'insertion simple correcte, et un rejeu explicite sur un ancien run
  // ajouterait une pesée de plus, ce qui est un FAIT, pas une corruption.
  const jour = instantLocal(FUSEAU, new Date()).slice(0, 10);
  await rest("student_body_measures", "POST", {
    user_id: userId, kind: "weight", value_si: s.poidsKg, local_date: jour,
    measured_at: new Date().toISOString(), source: "setup", content_locale: "fr-FR",
  }, "return=minimal");

  await rest("student_goals?on_conflict=user_id", "POST", {
    user_id: userId, goal: s.objectif, content_locale: "fr-FR",
    target_weight_kg: s.cibleKg, target_pace_kg_per_week: s.cadenceKgSemaine,
  }, "resolution=merge-duplicates,return=minimal");

  const coach = await rpc(token, "keel_join_house_coach", { p_country: "FR" }) as Record<string, unknown>;
  if (coach?.joined !== true && coach?.reason !== "already_attached") {
    throw new Error(`coach maison → ${JSON.stringify(coach)}`);
  }

  let roster = await rpc(token, "keel_household_roster") as Record<string, unknown>[];
  const memberId = String(roster[0].member_id);
  await exige(token, "keel_household_set_member_name", { p_member: memberId, p_first_name: s.prenom });
  await exige(token, "keel_household_set_member_birth_date", { p_member: memberId, p_birth_date: s.naissance });
  await exige(token, "keel_household_set_member_body", {
    p_member: memberId, p_height_cm: s.tailleCm, p_weight_kg: s.poidsKg,
    p_gender: "male", p_activity_level: "trains_some", p_day_activity: "seated",
    p_sport_frequency: "3_4", p_activity_axes_asked: true,
    p_appetite: s.appetit, p_appetite_asked: true,
  });

  // ⟳ LE REPAS LÉGER — même geste que l'écran : `kind: household_dish`, la
  // prose vide, et `light: true`. La clé ABSENTE dirait « pas demandé ».
  if (s.leger) {
    await exige(token, "keel_household_set_member_habits", {
      p_member: memberId,
      p_slots: [{ slot: s.leger, kind: "household_dish", usual: "", light: true }],
      p_note: null,
    });
    console.log(`   ⟳ ${s.leger} marqué LÉGER`);
  }

  // ⟳ LA SECONDE BOUCHE — sans compte, donc son objectif vit sur la ligne de
  // foyer (`set_member_goal` n'y refuse PAS, contrairement à une bouche à compte).
  let deuxieme: string | null = null;
  if (s.bouche) {
    const ajout = await rpc(token, "keel_household_add_member", {
      p_first_name: s.bouche.prenom,
      p_birth_date: s.bouche.naissance,
      p_goal: s.bouche.objectif,
    }) as Record<string, unknown>;
    roster = await rpc(token, "keel_household_roster") as Record<string, unknown>[];
    const autre = roster.find((r) => String(r.member_id) !== memberId);
    if (!autre) throw new Error(`seconde bouche absente du roster: ${JSON.stringify(ajout)}`);
    deuxieme = String(autre.member_id);
    await exige(token, "keel_household_set_member_body", {
      p_member: deuxieme, p_height_cm: s.bouche.tailleCm, p_weight_kg: s.bouche.poidsKg,
      p_gender: "male", p_activity_level: "trains_some", p_day_activity: "seated",
      p_sport_frequency: "3_4", p_activity_axes_asked: true,
      p_appetite: s.bouche.appetit, p_appetite_asked: true,
    });
    console.log(`   ⟳ 2e bouche ${s.bouche.prenom} (${s.bouche.objectif}, ${s.bouche.poidsKg} kg, appétit ${s.bouche.appetit})`);
  }

  console.log(
    `   corps ${s.tailleCm} cm / ${s.poidsKg} kg · ${s.objectif} → ${s.cibleKg} kg ` +
      `à ${s.cadenceKgSemaine} kg/sem · appétit ${s.appetit}`,
  );
  return { token, userId, memberId, deuxieme };
}

interface Tir {
  runId: string;
  cle: string;
  email: string;
  userId: string;
  planId: string | null;
  requestId: string | null;
  status: number;
  ms: number;
  detail: string | null;
  /** Le CONTEXTE horodaté du tir — sans lui, une journée partielle ne se rejoue pas. */
  contexte: {
    envoye_utc: string;
    fuseau: string;
    envoye_local: string;
    heure_locale: number;
    fenetre_jours: number;
  };
  /** L'ANNONCE, faite AVANT le tir. Elle ne se réécrit pas après. */
  annonce: { grille: number; retirees: string[]; attendues: number };
  /** Ce que le moteur a écrit, pour confronter l'annonce. `null` = tir échoué. */
  observe: { cases_attendues: number | null; plats: number | null } | null;
}

async function tire(s: Sujet, token: string, userId: string, email: string): Promise<Tir> {
  // ⛔ AUCUN `DELETE` ICI. La version d'avant effaçait TOUS les plans du compte
  // pour éviter `plan_overlaps_existing` ; le compte de CE run n'en a aucun, et
  // un run qui efface son prédécesseur détruit la preuve qu'on vient mesurer.
  const quand = new Date();
  const annonce = casesAnnoncees(quand);
  const contexte = {
    envoye_utc: quand.toISOString(),
    fuseau: FUSEAU,
    envoye_local: instantLocal(FUSEAU, quand),
    heure_locale: annonce.heureLocale,
    fenetre_jours: JOURS,
  };
  // ⛔ ANNONCÉ AVANT, PAS APRÈS (lot F). Un nombre de cases écrit après coup se
  // règle toujours sur ce qui est sorti ; annoncé avant, il peut se tromper —
  // et c'est cette possibilité qui lui donne sa valeur.
  console.log(
    `   ⟳ annonce : ${annonce.grille} cases de grille · ${annonce.retirees.length} retirée(s) ` +
      `à ${annonce.heureLocale} h locales (${annonce.retirees.join(", ") || "aucune"}) ` +
      `⇒ ${annonce.attendues} cases attendues`,
  );
  const t0 = Date.now();
  const res = await fetch(`${API}/functions/v1/generate-household-meal-v1`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ intent: "prepare_next", window: { kind: "days", count: JOURS } }),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const base = { runId: RUN_ID, cle: s.cle, email, userId, contexte, annonce };
  if (res.status !== 200) {
    const detail = JSON.stringify(body).slice(0, 400);
    console.log(`   ⛔ HTTP ${res.status} en ${ms} ms — ${detail}`);
    return {
      ...base, planId: null, requestId: String(body.request_id ?? ""),
      status: res.status, ms, detail, observe: null,
    };
  }
  const meal = body.meal as Record<string, unknown>;
  const gf = (meal?.generated_from ?? {}) as Record<string, unknown>;
  const hh = (gf.household ?? {}) as Record<string, unknown>;
  const md = (hh.meals_delivered ?? {}) as Record<string, unknown>;
  const attendues = md.expected === undefined ? null : Number(md.expected);
  const plats = Array.isArray(meal?.dishes) ? (meal.dishes as unknown[]).length : null;
  console.log(`   ✅ plan ${meal?.id} en ${ms} ms (${JOURS} jours)`);
  console.log(`   request_id ${body.request_id}`);
  console.log(
    `   ⟳ observé : ${attendues ?? "—"} cases attendues · ${plats ?? "—"} plats   ` +
      (attendues === null
        ? "⚪ le moteur n'a pas rendu son compte"
        : attendues === annonce.attendues
        ? "✅ conforme à l'annonce"
        : `❌ ANNONCE DÉMENTIE (annoncé ${annonce.attendues})`),
  );
  return {
    ...base, planId: String(meal?.id ?? ""), requestId: String(body.request_id ?? ""),
    status: 200, ms, detail: null,
    observe: { cases_attendues: attendues, plats },
  };
}

const quoi = (Deno.args[0] ?? "tout").trim();
API = await envOf("SUPABASE_URL");
ANON = await envOf("SUPABASE_ANON_KEY");
SVC = await envOf("SUPABASE_SERVICE_ROLE_KEY");
const depart = new Date();
const prevu = casesAnnoncees(depart);
const choisis = SUJETS.filter((s) => quoi === "tout" || quoi === s.cle);
console.log(
  `run ${RUN_ID} · pile ✓ ${API} · fenêtre ${JOURS} jours · ${choisis.length} tirs séquentiels`,
);
console.log(
  `contexte ${depart.toISOString()} UTC · ${instantLocal(FUSEAU, depart)} ${FUSEAU} ` +
    `(${prevu.heureLocale} h locales)`,
);
console.log(
  `ANNONCE AVANT TIR : ${prevu.attendues} cases par tir × ${choisis.length} tirs = ` +
    `${prevu.attendues * choisis.length} cases attendues au total`,
);
console.log(`comptes de ce run : ${choisis.map((s) => emailDuRun(s.cle)).join(", ")}`);

const tirs: Tir[] = [];
for (const s of choisis) {
  try {
    const email = emailDuRun(s.cle);
    const { token, userId } = await monte(s);
    tirs.push(await tire(s, token, userId, email));
  } catch (e) {
    console.log(`   ⛔ FIXTURE ${s.cle} — ${String(e).slice(0, 300)}`);
    tirs.push({
      runId: RUN_ID, cle: s.cle, email: emailDuRun(s.cle), userId: "",
      planId: null, requestId: null, status: 0, ms: 0,
      detail: String(e).slice(0, 300),
      contexte: {
        envoye_utc: new Date().toISOString(), fuseau: FUSEAU,
        envoye_local: instantLocal(FUSEAU, new Date()),
        heure_locale: heureLocale(FUSEAU, new Date()), fenetre_jours: JOURS,
      },
      annonce: { grille: prevu.grille, retirees: prevu.retirees, attendues: prevu.attendues },
      observe: null,
    });
  }
}

console.log("\n═══ BILAN DE LIVRAISON");
for (const t of tirs) {
  console.log(
    `  ${t.cle.padEnd(12)} ${String(t.status).padStart(3)} ${String(t.ms).padStart(7)} ms  ` +
      `annoncé ${t.annonce.attendues} · observé ${t.observe?.cases_attendues ?? "—"}  ` +
      `${t.planId ?? "—"}  ${t.requestId ?? ""}`,
  );
}
// ⛔ LE FICHIER PORTE L'IDENTIFIANT DU RUN : deux campagnes ne s'écrasent plus.
const sortie = new URL(
  `../scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-tirs-${RUN_ID}.json`,
  import.meta.url,
);
await Deno.writeTextFile(
  sortie,
  JSON.stringify(
    { run_id: RUN_ID, lance_utc: depart.toISOString(), fuseau: FUSEAU, tirs },
    null,
    2,
  ),
);
console.log(`\nécrit : ${sortie.pathname}`);
