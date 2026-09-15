/**
 * ══════════════════════════════════════════════════════════════════════════
 * C0 — FIGER LA DEMANDE, LES ÉTAPES ET LE JOURNAL D'UN TIR
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-11-CLOTURE/figer-demande.ts \
 *     scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir3-*.json
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE ÉCRITURE EN BASE. Ce script LIT : la sortie du
 * tir, le roster et les corps par les vues du produit, les échanges archivés
 * (`llm_raw_response_events`) et le journal de `functions serve`. Il écrit un
 * seul fichier, sous `scratchpad/2026-09-11-CLOTURE/fixtures/`.
 *
 * ── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────
 *
 * Le plan de clôture, § C0.1 : « Figer dans chaque fixture, AVANT la
 * génération, l'heure, le fuseau, la fenêtre, les cases attendues par personne,
 * les profils, habitudes, apports fixes et contrats transmis. Ne pas construire
 * les cases attendues à partir des plats retournés : un plat manquant
 * disparaîtrait du contrôle. »
 *
 * Les six tirs du 2026-09-11 sont DÉJÀ partis. On ne peut donc pas figer leur
 * demande avant coup — mais on peut la figer sans jamais regarder les plats, et
 * NOMMER la provenance de chaque champ. C'est ce que fait `source` :
 *
 *   · `harnais_avant_appel` — le harnais l'a POSÉ par les RPC du produit, ou
 *     IMPRIMÉ avant l'appel (`cases_annoncees`, `heure_locale`). C'est une
 *     demande, pas un résultat.
 *   · `base_apres_appel`    — relu en base aujourd'hui (corps, allergies,
 *     habitudes). La ligne n'a pas bougé depuis le tir, et c'est le harnais qui
 *     l'avait écrite ; mais la lecture est postérieure et ça se dit.
 *   · `run`                 — la fenêtre que le moteur a ACCEPTÉE
 *     (`starts_on` / `ends_on`). ⛔ Ce n'est PAS la liste des plats : un plat
 *     manquant laisse sa case dans la grille, et c'est tout le point.
 *
 * ⛔ ET LES SLOTS NE VIENNENT JAMAIS DES PLATS. Ils viennent du rythme déclaré
 * de la bouche, ou des trois repas de la maison quand rien n'est déclaré —
 * exactement la règle de `slotContractsFor` (`[]` ⇒ `HOUSE_DEFAULT_SLOTS`).
 */
import { parseMemberLight } from "../../supabase/functions/_shared/keel/household_habits.ts";
import { loadDotEnv } from "../2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const SORTIE = `${ROOT}scratchpad/2026-09-11-CLOTURE/fixtures`;

/** Les trois repas de la maison — `slot_nutrition_contract.ts::HOUSE_DEFAULT_SLOTS`. */
const REPAS_DE_LA_MAISON = ["breakfast", "lunch", "dinner"] as const;

const dotenv = loadDotEnv(`${ROOT}supabase/.env`);
for (const [k, v] of Object.entries(dotenv)) {
  if (!Deno.env.get(k)) Deno.env.set(k, v);
}
const API = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!API || !SVC) {
  console.error("⛔ pile locale absente de supabase/.env");
  Deno.exit(2);
}

const chemin = Deno.args.find((a) => !a.startsWith("--"));
if (!chemin) {
  console.error("usage : figer-demande.ts <sorties-lot-F/….json> [--journal=/tmp/keel-serve.log]");
  Deno.exit(2);
}
const JOURNAL = Deno.args.find((a) => a.startsWith("--journal="))?.slice(10) ??
  "/tmp/keel-serve.log";

async function get(path: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    headers: { apikey: SVC, authorization: `Bearer ${SVC}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return await res.json() as Record<string, unknown>[];
}
async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} → ${res.status} ${await res.text()}`);
  return await res.json();
}

const sortie = JSON.parse(await Deno.readTextFile(chemin)) as Record<string, unknown>;
const ligne = sortie.ligne_ecrite as Record<string, unknown> | null;
const meta = (sortie.meta_bouche ?? {}) as Record<string, unknown>;
const userId = String(meta.user_id ?? "");
const requestId = String(
  (sortie.reponse as Record<string, unknown> | undefined)?.request_id ?? "",
);
if (!userId) {
  console.error("⛔ cette sortie ne nomme aucun compte : rien à figer.");
  Deno.exit(1);
}

// ── LES BOUCHES, PAR LES VUES DU PRODUIT ─────────────────────────────────
const roster = await rpc("keel_household_roster_for", { p_user: userId }) as
  Record<string, unknown>[];
const ids = roster.map((r) => String(r.member_id));
const enListe = `in.(${ids.join(",")})`;
const membres = await get(
  `household_members?member_id=${enListe}&select=member_id,user_id,first_name,birth_date,goal,target_pace_kg_per_week,eating_rhythm,fixed_intakes`,
);
const corps = await get(`household_member_bodies?member_id=${enListe}&select=*`);
const habitudes = await get(
  `household_member_habits?member_id=${enListe}&select=member_id,slots,note`,
);
const allergies = await get(
  `household_member_allergies?member_id=${enListe}&select=member_id,label`,
);
const objectifs = await get(`student_goals?user_id=eq.${userId}&select=*`);
const profils = await get(`profiles?id=eq.${userId}&select=*`);

// ── LES ÉTAPES, SÉPARÉES — § C0.4 ────────────────────────────────────────
//
// ⛔ « Capturer séparément génération brute, ajustement, chaque réparation,
// finalisation et payload relu. Les identifiants absents du tir 2 se comptent
// séparément au premier jet et après réparation ; ne pas attribuer les champs
// finaux au premier jet. »
//
// La sortie du lot F ne gardait que `reponse_brute` — le PREMIER succès — et
// rien des réparations. Les deux vivent pourtant dans la même table, avec leur
// `source` (`…v1`, `…v1.density_repair`, `…v1.composition_fill`) et leur ordre.
const echanges = requestId
  ? await get(
    `llm_raw_response_events?request_id=eq.${requestId}` +
      `&select=source,status,model,user_message,output_text,created_at&order=created_at.asc`,
  )
  : [];
const premierJet = echanges.find((e) =>
  String(e.source) === "generate-household-meal-v1" && String(e.status) === "success"
) ?? null;
const promptEnvoye = echanges.find((e) =>
  String(e.source) === "generate-household-meal-v1" &&
  String(e.status) === "attempt_start"
) ?? null;
const reparations = echanges.filter((e) =>
  String(e.source) !== "generate-household-meal-v1" &&
  String(e.status) === "success"
);

// ── LE JOURNAL DU RUN ────────────────────────────────────────────────────
//
// ⚠️ IL VIT DANS UN FICHIER DE `/tmp` ET SEULEMENT LÀ. Le recopier ici est la
// seule façon qu'une mesure faite demain porte encore les compteurs du moteur :
// un ménage de `/tmp` les emporterait, et le rapport deviendrait invérifiable.
const journal: Record<string, unknown>[] = [];
// ⚠️ LE BANC ②, LUI, CAPTURE DÉJÀ SON JOURNAL : il appelle le handler DANS SON
// PROCESSUS, donc les `console.log` du moteur ne passent jamais par
// `functions serve`. Les deux formes coexistent, et on ne va chercher le
// fichier que si la sortie n'en porte pas.
for (const l of (sortie.journal ?? []) as unknown[]) {
  const texte = typeof l === "string" ? l : "";
  const i = texte.indexOf("{");
  if (i < 0) continue;
  try {
    const o = JSON.parse(texte.slice(i)) as Record<string, unknown>;
    if (typeof o.tag === "string") journal.push(o);
  } catch { /* une ligne non-JSON n'est pas un compteur */ }
}
if (requestId && journal.length === 0) {
  let texte = "";
  try {
    texte = await Deno.readTextFile(JOURNAL);
  } catch {
    console.error(`⚠️ journal introuvable (${JOURNAL}) — les compteurs du moteur manqueront.`);
  }
  for (const l of texte.split("\n")) {
    const i = l.indexOf('{"tag":"keel.');
    if (i < 0 || !l.includes(requestId)) continue;
    try {
      const o = JSON.parse(l.slice(i)) as Record<string, unknown>;
      if (typeof o.tag === "string") journal.push(o);
    } catch { /* ligne tronquée par le journal */ }
  }
}

// ── LA GRILLE DEMANDÉE — jamais construite depuis les plats ───────────────
const JOURS_TOKEN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const tokenDe = (date: string) =>
  JOURS_TOKEN[new Date(`${date}T00:00:00Z`).getUTCDay()];
const jours: string[] = [];
const jourVersDate: Record<string, string> = {};
if (ligne) {
  const t1 = new Date(`${String(ligne.ends_on)}T00:00:00Z`).getTime();
  for (
    let t = new Date(`${String(ligne.starts_on)}T00:00:00Z`).getTime();
    t <= t1;
    t += 86_400_000
  ) {
    const d = new Date(t).toISOString().slice(0, 10);
    jours.push(tokenDe(d));
    jourVersDate[tokenDe(d)] = d;
  }
}

const bouches = roster.map((r) => {
  const id = String(r.member_id);
  const m = membres.find((x) => String(x.member_id) === id) ?? {};
  const b = corps.find((x) => String(x.member_id) === id) ?? null;
  const h = habitudes.find((x) => String(x.member_id) === id) ?? null;
  const light = h === null ? {} : parseMemberLight(h.slots);
  // ⛔ LA SOURCE CANONIQUE DES APPORTS FIXES DÉPEND DE L'EXISTENCE D'UN COMPTE,
  // et ce n'est pas une subtilité : `household_fixed_intakes.ts` ne lit
  // `household_members.fixed_intakes` QUE si la bouche n'a pas de compte ;
  // sinon il lit `student_goals.practical_constraints.fixed_intakes`. Le lot F
  // a écrit dans la mauvaise colonne au tir n° 5 (son défaut ④) : on fige donc
  // LES DEUX, et on nomme celle que le moteur lit.
  const pc = (objectifs[0]?.practical_constraints ?? {}) as Record<string, unknown>;
  const aUnCompte = r.user_id !== null && r.user_id !== undefined;
  const apportsLus = aUnCompte ? (pc.fixed_intakes ?? []) : (m.fixed_intakes ?? []);
  return {
    member_id: id,
    user_id: r.user_id ?? null,
    first_name: r.first_name ?? null,
    birth_date: m.birth_date ?? null,
    role: r.role ?? null,
    age_state: r.age_state ?? "unknown",
    goal: m.goal ?? null,
    target_pace_kg_per_week: m.target_pace_kg_per_week ?? null,
    eating_rhythm: aUnCompte ? (pc.eating_rhythm ?? null) : (m.eating_rhythm ?? null),
    fixed_intakes: apportsLus,
    fixed_intakes_source: aUnCompte
      ? "student_goals.practical_constraints.fixed_intakes"
      : "household_members.fixed_intakes",
    fixed_intakes_colonne_orpheline: aUnCompte ? (m.fixed_intakes ?? []) : null,
    light_slots: Object.entries(light).filter(([, on]) => on === true).map(([s]) => s),
    allergies: allergies.filter((a) => String(a.member_id) === id).map((a) => String(a.label)),
    body: b,
  };
});

/**
 * LES SLOTS DEMANDÉS D'UNE BOUCHE — son rythme, ou les repas de la maison.
 *
 * ⛔ PAS LES SLOTS DES PLATS. C'est exactement la garde de ① : si le moteur
 * n'a rendu aucun dîner du dimanche, `sun/dinner` doit rester DEMANDÉ.
 */
function slotsDe(b: { eating_rhythm: unknown }): string[] {
  const r = b.eating_rhythm;
  if (Array.isArray(r) && r.length > 0) {
    return r.map((o) => String((o as Record<string, unknown>).slot ?? "")).filter(Boolean);
  }
  return [...REPAS_DE_LA_MAISON];
}

/**
 * ⟳ 2026-09-15 — LES ABSENCES DÉCLARÉES SORTENT DE L'ATTENDU.
 *
 * ⛔ C'EST UNE DONNÉE DE LA DEMANDE, PAS DES PLATS. `keel_household_roster_for`
 * rend `away_days` (`[{day}]` pour la journée, `[{day, slot}]` pour un moment) :
 * une bouche absente le mardi n'attend AUCUNE case ce jour-là, et lui en
 * compter une ferait accuser le plan d'une part que personne ne devait manger.
 */
function awayDe(r: Record<string, unknown>): { day: string; slot: string | null }[] {
  const raw = r.away_days;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      day: String((x as Record<string, unknown>).day ?? "").trim().toLowerCase(),
      slot: (x as Record<string, unknown>).slot == null
        ? null
        : String((x as Record<string, unknown>).slot).trim().toLowerCase(),
    }))
    .filter((x) => x.day !== "");
}
const casesParBouche: Record<string, Record<string, string[]>> = {};
for (const b of bouches) {
  const slots = slotsDe(b);
  const r = roster.find((x) => String(x.member_id) === b.member_id) ?? {};
  const away = awayDe(r as Record<string, unknown>);
  casesParBouche[b.member_id] = Object.fromEntries(
    jours.map((j) => [
      j,
      slots.filter((s) => !away.some((a) => a.day === j && (a.slot === null || a.slot === s))),
    ]),
  );
}
const attenduesParBouche = Object.fromEntries(
  Object.entries(casesParBouche).map((
    [id, g],
  ) => [id, Object.values(g).reduce((n, s) => n + s.length, 0)]),
);

// ══════════════════════════════════════════════════════════════════════════
// ⛔ UNE DEMANDE DÉJÀ FIGÉE AVANT L'APPEL NE SE REFAIT PAS APRÈS COUP
// ══════════════════════════════════════════════════════════════════════════
//
// Le banc ② écrit désormais sa demande AVANT d'appeler le handler, horloge
// injectée comprise. La reconstruire ici en repartant de `starts_on`/`ends_on`
// remplacerait une preuve par une déduction — et ferait disparaître, entre
// autres, le PREMIER JOUR PARTIEL, qui est précisément le cas à prouver.
// On garde donc la demande d'origine et on n'ajoute que ce qu'elle n'a pas :
// les bouches, leur corps, leurs contraintes.
const dejaFigee = (sortie.demande ?? null) as Record<string, unknown> | null;
const demandeSortie = dejaFigee === null
  ? {
    source: {
      instant: "harnais_avant_appel",
      fenetre: "harnais_avant_appel",
      cases_annoncees: "harnais_avant_appel (imprimé avant l'appel)",
      jours: "run (student_generated_meals.starts_on/ends_on) — JAMAIS la liste des plats",
      slots: "rythme déclaré de la bouche, sinon les trois repas de la maison",
      bouches: "base_apres_appel (lignes posées par le harnais avant l'appel)",
    },
    instant: {
      lance_le: sortie.lance_le ?? null,
      jour_local: sortie.jour_local ?? null,
      heure_locale: sortie.heure_locale ?? null,
      fuseau: profils[0]?.timezone ?? "Europe/Paris",
    },
    fenetre: {
      demandee: { kind: "days", count: 3 },
      cases_annoncees: sortie.cases_annoncees ?? null,
      bouches_annoncees: sortie.bouches ?? null,
      acceptee: ligne
        ? { starts_on: ligne.starts_on, ends_on: ligne.ends_on, duration_days: ligne.duration_days }
        : null,
    },
    jours,
    jour_vers_date: jourVersDate,
    cases_par_bouche: casesParBouche,
    cases_attendues_par_bouche: attenduesParBouche,
    cases_attendues_total: Object.values(attenduesParBouche).reduce((a, b) => a + b, 0),
  }
  : (() => {
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-15 — LA DEMANDE FIGÉE EST GARDÉE, ET COMPLÉTÉE POUR LES
    //                BOUCHES QU'ELLE NE NOMMAIT PAS
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ MESURÉ SUR LE TIR 8 DU 2026-09-15 (deux bouches) : le harnais ne
    // figeait `cases_par_bouche` que pour le titulaire (et la 2ᵉ bouche d'un
    // `duo`), jamais pour les bouches de `mouths[]`. L'instrument rendait alors
    // « Lea 0/0 » et un TOTAL 7/7 sur un plan qui sert 14 parts — le
    // dénominateur flatteur que `mesure.md` interdit nommément.
    //
    // ⚠️ ON NE REFAIT PAS LA DEMANDE : fenêtre, heure, premier jour partiel
    // et cases du titulaire restent CELLES D'AVANT L'APPEL. On n'ajoute que les
    // bouches manquantes, depuis le roster et leurs absences déclarées — des
    // données de la demande, jamais des plats — et on NOMME ce qui a été ajouté.
    // ⚠️ LA FENÊTRE ACCEPTÉE S'AJOUTE, elle ne remplace pas l'attendue : c'est
    // la comparaison des deux qui vaut preuve, pas l'une des deux.
    const figeeParBouche = (dejaFigee.cases_par_bouche ?? {}) as Record<
      string,
      Record<string, string[]>
    >;
    const completees: string[] = [];
    const parBouche: Record<string, Record<string, string[]>> = { ...figeeParBouche };
    // ⛔ LA BASE EST LA GRILLE FIGÉE DU TITULAIRE, PAS LES TROIS REPAS × TROIS
    // JOURS DU ROSTER. Mesuré à la première version de cette complétion : le
    // roster donnait 9 cases à Lea là où le harnais en attendait 7, parce que
    // le PREMIER JOUR EST PARTIEL (les moments déjà passés au lancement ne sont
    // demandés à personne) — et l'instrument comptait deux cases fantômes comme
    // « non mesurées ». La grille de la demande vaut pour toute la maison ; ce
    // qui distingue une bouche, c'est son rythme déclaré et ses absences.
    const base = Object.values(figeeParBouche)[0] ?? {};
    for (const b of bouches) {
      if (parBouche[b.member_id] !== undefined) continue;
      const r = roster.find((x) => String(x.member_id) === b.member_id) ?? {};
      const away = awayDe(r as Record<string, unknown>);
      const rythme = new Set(slotsDe(b));
      parBouche[b.member_id] = Object.fromEntries(
        Object.entries(base).map(([jour, slots]) => [
          jour,
          (slots as string[]).filter((s) =>
            rythme.has(s) &&
            !away.some((a) => a.day === jour && (a.slot === null || a.slot === s))
          ),
        ]),
      );
      completees.push(b.member_id);
    }
    const attendues = Object.fromEntries(
      Object.entries(parBouche).map((
        [id, g],
      ) => [id, Object.values(g).reduce((n, s) => n + s.length, 0)]),
    );
    return {
      ...dejaFigee,
      cases_par_bouche: parBouche,
      cases_attendues_par_bouche: attendues,
      cases_attendues_total: Object.values(attendues).reduce((a, b) => a + b, 0),
      cases_par_bouche_completees_depuis_roster: completees,
      fenetre: {
        ...(dejaFigee.fenetre as Record<string, unknown>),
        acceptee: ligne
          ? { starts_on: ligne.starts_on, ends_on: ligne.ends_on, duration_days: ligne.duration_days }
          : null,
      },
    };
  })();

const gele = {
  cas: sortie.cas ?? null,
  tir: sortie.tir ?? null,
  titre: sortie.titre ?? null,
  reel: sortie.reel === true,
  source_sortie: chemin,
  fige_le: new Date().toISOString(),
  request_id: requestId,

  // ── ① LA DEMANDE ─────────────────────────────────────────────────────
  demande: {
    ...demandeSortie,
    demande_figee_avant_appel: dejaFigee !== null,
    bouches,
    contrat_de_calcul: {
      restriction: "clear",
      ageState: "adult",
      conditionRefs: [],
      coachCounting: "no_position",
    },
    profile: profils[0] ?? null,
    goal: objectifs[0] ?? null,
  },

  // ── ④ LES ÉTAPES, SÉPARÉES ───────────────────────────────────────────
  etapes: {
    prompt_envoye: promptEnvoye?.user_message ?? null,
    premier_jet: premierJet?.output_text ?? null,
    reparations: reparations.map((e) => ({
      source: e.source,
      model: e.model,
      output_text: e.output_text,
    })),
    prompts_de_reparation: echanges
      .filter((e) =>
        String(e.source) !== "generate-household-meal-v1" &&
        String(e.status) === "attempt_start"
      )
      .map((e) => ({ source: e.source, user_message: e.user_message })),
    echanges_resume: echanges.map((e) => ({
      source: e.source,
      status: e.status,
      model: e.model,
      user_message_len: String(e.user_message ?? "").length,
      output_text_len: String(e.output_text ?? "").length,
      created_at: e.created_at,
    })),
  },

  journal,
  ligne_ecrite: ligne,
};

Deno.mkdirSync(SORTIE, { recursive: true });
// ⚠️ `--nom=` DONNE UN NOM STABLE, et ce n'est pas du confort : les tests du
// dépôt lisent ces fixtures par leur chemin. Un nom horodaté obligerait un test
// à deviner un fichier — c'est-à-dire à passer quand il n'y en a aucun.
const nom = Deno.args.find((a) => a.startsWith("--nom="))?.slice(6) ??
  chemin.split("/").pop()!.replace(/\.json$/, "") + "-c0";
const fichier = `${SORTIE}/${nom}.json`;
Deno.writeTextFileSync(fichier, JSON.stringify(gele, null, 2));

console.log(`── DEMANDE FIGÉE ─────────────────────────────────────────────`);
console.log(`   tir            ${gele.tir} · ${gele.titre}`);
console.log(`   requête        ${requestId || "(aucune)"}`);
console.log(`   bouches        ${bouches.length}`);
for (const b of bouches) {
  const body = (b.body ?? {}) as Record<string, unknown>;
  console.log(
    `     · ${String(b.first_name).padEnd(6)} ${b.member_id} · ` +
      `${body.height_cm} cm · ${body.weight_kg} kg · ${body.gender} · appétit ${body.appetite} · ` +
      `objectif ${b.user_id ? (objectifs[0]?.goal ?? "—") : (b.goal ?? "aucun")} · ` +
      `léger ${JSON.stringify(b.light_slots)} · apports ${JSON.stringify(b.fixed_intakes)}`,
  );
}
// ⚠️ ON IMPRIME LA DEMANDE RETENUE, PAS LA RECONSTRUCTION LOCALE. Les deux
// diffèrent exactement dans le cas qui compte — un premier jour partiel : la
// reconstruction d'après coup rend 3 moments sur 3 jours (9), la demande figée
// avant l'appel en rend 7.
const d = gele.demande as Record<string, unknown>;
console.log(`   jours          ${JSON.stringify(d.jours)}`);
{
  const completees = (d.cases_par_bouche_completees_depuis_roster ?? []) as string[];
  if (completees.length > 0) {
    console.log(
      `   ⚠️ cases complétées depuis le roster pour ${completees.length} bouche(s) ` +
        `que la demande du harnais ne nommait pas : ${completees.map((x) => x.slice(0, 8)).join(", ")}`,
    );
  }
}
console.log(
  `   cases attendues ${d.cases_attendues_total} ` +
    `(${JSON.stringify(d.cases_attendues_par_bouche)})` +
    `${d.demande_figee_avant_appel ? " · FIGÉE AVANT L'APPEL" : " · reconstruite après coup"}`,
);
if (!d.demande_figee_avant_appel) {
  console.log(
    `   ⚠️ CETTE DEMANDE EST RECONSTRUITE : le tir est parti avant que le banc` +
      ` ne sache figer la sienne. Chaque champ porte sa provenance dans` +
      ` \`demande.source\`.`,
  );
}
console.log(
  `   étapes         premier jet ${premierJet ? "oui" : "NON"} · ` +
    `réparations ${reparations.length} · prompt ${promptEnvoye ? "oui" : "NON"} · ` +
    `journal ${journal.length} ligne(s)`,
);
console.log(`\n   écrit : ${fichier}`);
