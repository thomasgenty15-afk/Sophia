/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT F — LA GRILLE DE MESURE APPLIQUÉE À UN PLAN NEUF
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts \
 *     scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/<fichier>.json
 *
 * ⛔ AUCUNE ÉQUATION N'EST RECODÉE ICI. Le plan l'interdit en toutes lettres
 * (« Ne pas recoder les équations dans le script du banc »). Ce fichier
 * **fabrique un contexte** pour le plan neuf et appelle ensuite
 * `mesurerUnPlan` / `rendre` de `scripts/2026-09-11-mesure-grille.ts` — le
 * MÊME instrument, avec les MÊMES dénominateurs et les MÊMES tolérances que le
 * lot 0. Un second instrument serait un second jeu de définitions, et les deux
 * finiraient par diverger.
 *
 * ⚠️ CE QUI CHANGE ENTRE LE LOT 0 ET ICI, ET IL FAUT LE SAVOIR :
 *
 *   · `fragmentArchive` est **null** : un plan neuf n'a pas de prompt archivé
 *     à comparer. L'égalité caractère pour caractère ne se mesure QUE sur les
 *     deux tirs du 2026-09-11.
 *   · Le contrefactuel `petit_suisse_cream_cheese` n'a plus d'objet : le lot A
 *     l'a transformé en mesure nominale. Il reste imprimé, à zéro déplacement.
 *   · La grille vient de la ligne écrite (`starts_on`/`ends_on` + les plats
 *     produits), pas d'une dérivation d'heure locale : sur un plan neuf la
 *     grille est OBSERVABLE, ce qu'elle n'était pas sur l'archive.
 */
import {
  chargerFixtures,
  type Fixtures,
  mesurerUnPlan,
  rendre,
} from "../../scripts/2026-09-11-mesure-grille.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const FIXTURES = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures`;

const JOURS_TOKEN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function tokenDe(date: string): string {
  return JOURS_TOKEN[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/**
 * Le contexte du plan neuf, reconstruit depuis CE QUI EST ÉCRIT.
 *
 * ⛔ Rien n'y est déduit d'un prénom ni d'un titre de recette — même règle que
 * les fixtures du lot 0. Le corps, l'objectif et l'allure viennent de la sortie
 * du banc, qui les a lui-même posés par les RPC du produit.
 */
function contexteDuPlanNeuf(
  sortie: Record<string, unknown>,
  ligne: Record<string, unknown>,
): Record<string, unknown> {
  const gf = (ligne.generated_from ?? {}) as Record<string, unknown>;
  const dishes = (ligne.dishes ?? []) as Record<string, unknown>[];
  const casesParJour: Record<string, string[]> = {};
  for (const d of dishes) {
    const j = String(d.day ?? "");
    if (!j) continue;
    (casesParJour[j] ??= []).push(String(d.slot ?? ""));
  }
  const debut = String(ligne.starts_on);
  const fin = String(ligne.ends_on);
  const jours: string[] = [];
  for (
    let t = new Date(`${debut}T00:00:00Z`).getTime();
    t <= new Date(`${fin}T00:00:00Z`).getTime();
    t += 86_400_000
  ) {
    jours.push(tokenDe(new Date(t).toISOString().slice(0, 10)));
  }
  const mouthFacts = (gf.mouth_facts ?? {}) as Record<string, unknown>;
  const meta = (sortie.meta_bouche ?? {}) as Record<string, unknown>;
  const portions = (ligne.member_portions ?? []) as Record<string, unknown>[];
  const memberId = String(portions[0]?.member_id ?? meta.member_id ?? "");
  return {
    plan_id: String(ligne.id),
    request_id: String(
      (sortie.reponse as Record<string, unknown>)?.request_id ?? "",
    ),
    goal: {
      goal: String(meta.goal ?? ""),
      target_pace_kg_per_week: Number(meta.pace ?? 0),
      content_locale: String(ligne.content_locale ?? "fr-FR"),
    },
    members: [{
      member_id: memberId,
      first_name: String(meta.first_name ?? ""),
      birth_date: String(meta.birth_date ?? ""),
      eating_rhythm: null,
    }],
    member_bodies: [{
      member_id: memberId,
      weight_kg: Number(meta.weight_kg ?? 0),
      height_cm: Number(meta.height_cm ?? 0),
      gender: "male",
      appetite: "average",
      activity_level: "trains_some",
      day_activity: "seated",
      sport_frequency: "3_4",
      activity_axes_asked_at: new Date().toISOString(),
    }],
    profile: { locale: String(ligne.content_locale ?? "fr-FR") },
    grille: {
      jours,
      cases_par_jour: casesParJour,
      light_slots: [],
    },
    // ⛔ LE MÊME CONTRAT DE CALCUL QUE LES DEUX FIXTURES, ET C'EST UNE
    // AFFIRMATION VÉRIFIABLE : la fixture du banc pose un adulte sans
    // restriction, sans condition et sous le coach maison (`no_position`).
    contrat_de_calcul: {
      restriction: "clear",
      ageState: "adult",
      conditionRefs: [],
      coachCounting: "no_position",
    },
    instant: { jour_local: debut },
  };
}

if (import.meta.main) {
  const chemin = Deno.args[0];
  if (!chemin) {
    console.error("usage : analyse-lot-F.ts <sorties-lot-F/…​.json>");
    Deno.exit(2);
  }
  const sortie = JSON.parse(await Deno.readTextFile(chemin)) as Record<string, unknown>;
  const ligne = sortie.ligne_ecrite as Record<string, unknown>;
  if (!ligne) {
    console.error("⛔ cette sortie ne porte aucune ligne écrite (le tir a échoué).");
    Deno.exit(1);
  }
  const base = await chargerFixtures(FIXTURES);
  // Les journaux CAPTURÉS du tir — pas ceux du 2026-09-11.
  const journaux: Record<string, unknown>[] = [];
  for (const l of (sortie.journal ?? []) as string[]) {
    const i = l.indexOf("{");
    if (i < 0) continue;
    try {
      const o = JSON.parse(l.slice(i)) as Record<string, unknown>;
      if (typeof o.tag === "string") journaux.push(o);
    } catch { /* une ligne non-JSON n'est pas un compteur */ }
  }
  // ── LA RÉPONSE BRUTE DU TIR, RECONSTRUITE ────────────────────────────────
  //
  // Le contrôle ⑨ (« cohérence recette ↔ stockage ») compare la `quantity`
  // PERSISTÉE à celle de la RÉPONSE BRUTE, par égalité de chaînes. Sans elle,
  // ses cinq compteurs sortent à zéro et le rapport ne dit plus rien — c'est
  // exactement le contrôle qui mesure le lot C sur un plan NEUF.
  //
  // ⛔ ON NE LUI DONNE PAS DE `user_message` : il n'y a pas de prompt archivé
  // pour ce tir, `fragmentArchive` reste `null`, et l'égalité caractère pour
  // caractère continue de n'être prouvée QUE sur les deux tirs du 2026-09-11.
  const cas = String(sortie.cas ?? "");
  // (déclaré ici : la relecture du journal en a besoin avant la construction)
  const REQ: Record<string, string> = {
    perte: "f5a3dd19-d47d-4f52-9678-536f2cfb3bc5",
    gain: "ecaf04b2-354e-460f-b6c5-df81b54c5640",
  };
  const requestIdDuTir = String(
    (sortie.reponse as Record<string, unknown>)?.request_id ?? "",
  );
  const echanges: Record<string, unknown>[] = [];
  // ⛔ UN TIR RÉEL A SA PROPRE RÉPONSE BRUTE, ET CE N'EST PAS L'ARCHIVE.
  // Lui donner celle du 2026-09-11 ferait comparer la `quantity` persistée d'un
  // plan de CE SOIR au texte d'un plan d'il y a cinq heures : le contrôle ⑨
  // sortirait un nombre qui ne décrit rien. La campagne recopie la sienne
  // (`reponse_brute`, lue dans `llm_raw_response_events`) ; le banc ② rejoue
  // l'archive et n'en a donc pas besoin.
  const brute = String((sortie as Record<string, unknown>).reponse_brute ?? "");
  if (brute) {
    echanges.push({
      request_id: requestIdDuTir,
      source: "generate-household-meal-v1",
      outcome: "text",
      output_text: brute,
    });
  } else if (sortie.reel !== true && REQ[cas]) {
    const { cannedFromFixtures, retaillerReponse } = await import("./transport-lot-F.ts");
    const c = cannedFromFixtures(FIXTURES, REQ[cas]);
    const envoye = sortie.retaillage
      ? retaillerReponse(c.composition.outputText, {
        dropDays: ["fri"],
        moveCookingTo: "sat",
      }).text
      : c.composition.outputText;
    echanges.push({
      request_id: requestIdDuTir,
      source: "generate-household-meal-v1",
      outcome: "text",
      output_text: envoye,
    });
  }

  // ── LES COMPTEURS D'UN TIR RÉEL VIVENT DANS LE JOURNAL DE `functions serve`
  //
  // ⚠️ ET NULLE PART AILLEURS. Un tir de campagne passe par Kong : son
  // `console.log` part dans le terminal de l'humain, pas dans la réponse HTTP.
  // `turn_summary_logs` ne porte pas ces lignes (colonnes de contexte NULL).
  // On relit donc le fichier de journal, filtré sur l'IDENTIFIANT DE REQUÊTE —
  // jamais sur l'ordre d'arrivée, qui mélangerait deux tirs.
  // ⚠️ `--allow-env` n'est PAS exigé : l'instrument tourne en lecture seule, et
  // réclamer une permission de plus pour un simple chemin ferait rougir tout
  // appelant qui suit la ligne de commande du lot 0.
  const LOG = Deno.permissions.querySync({ name: "env", variable: "LOT_F_SERVE_LOG" })
      .state === "granted"
    ? (Deno.env.get("LOT_F_SERVE_LOG") ?? "/tmp/keel-serve.log")
    : "/tmp/keel-serve.log";
  if (requestIdDuTir && journaux.length === 0) {
    let texte = "";
    try {
      texte = await Deno.readTextFile(LOG);
    } catch { /* pas de journal : les compteurs resteront absents, et ça se dira */ }
    for (const ligne of texte.split("\n")) {
      const i = ligne.indexOf('{"tag":"keel.');
      if (i < 0) continue;
      if (!ligne.includes(requestIdDuTir)) continue;
      try {
        const o = JSON.parse(ligne.slice(i)) as Record<string, unknown>;
        if (typeof o.tag === "string") journaux.push(o);
      } catch { /* ligne tronquée par le journal */ }
    }
  }

  const fx: Fixtures = {
    ...base,
    plans: [ligne],
    contextes: [contexteDuPlanNeuf(sortie, ligne)],
    echanges,
    journaux,
  };
  const m = await mesurerUnPlan(fx, ligne);
  console.log(rendre(m));

  // ── LE COÛT, PAR NATURE — le tableau du plan le réclame ─────────────────
  const appels = (sortie.appels_fournisseur ?? []) as Record<string, unknown>[];
  const parNature = new Map<string, number>();
  for (const a of appels) {
    const n = String(a.matched ?? "?");
    parNature.set(n, (parNature.get(n) ?? 0) + 1);
  }
  const budget = ((ligne.generated_from as Record<string, unknown>)?.plan_budget ??
    {}) as Record<string, unknown>;
  console.log(`\n── COÛT ──────────────────────────────────────────────────────`);
  for (const [n, c] of parNature) console.log(`   ${n} : ${c}`);
  console.log(`   transmissions fournisseur : ${budget.provider_attempts ?? "—"}`);
  console.log(`   réparations : ${budget.repairs_used ?? "—"} / ${budget.repairs_allowed ?? "—"}` +
    ` (demandées : ${budget.repairs_asked ?? "—"})`);
  console.log(`   durée totale du handler : ${sortie.duree_ms} ms`);
  console.log(`   échéance du budget : ${budget.total_ms ?? "—"} ms` +
    ` · utilisable ${budget.usable_ms ?? "—"} ms · réserve ${budget.reserve_ms ?? "—"} ms`);
  if (sortie.reel === true) {
    const plafond = Number(sortie.plafond_heberge_ms ?? 150_000);
    const d = Number(sortie.duree_ms ?? 0);
    console.log(
      `   ⚠️ TIR RÉEL. Kong local est relevé à 600 000 ms ; l'HÉBERGÉ coupe à ` +
        `${plafond} ms. ` +
        (d <= plafond
          ? `Cette requête (${d} ms) passerait en production.`
          : `Cette requête (${d} ms) serait COUPÉE en production — ${d - plafond} ms de trop.`),
    );
    console.log(
      `   ⛔ ET AUCUN POURCENTAGE DE GAIN N'EST PUBLIÉ : il n'existe aucun ` +
        `témoin à MÊME nombre de cases, MÊME horaire et MÊMES réglages ` +
        `fournisseur. La durée absolue et la charge, et rien d'autre.`,
    );
  } else {
    console.log(
      `   ⛔ les appels fournisseur sont SERVIS PAR L'ADAPTATEUR CONTRÔLÉ : ` +
        `cette durée ne contient AUCUNE latence de modèle réel et ne se compare ` +
        `à aucune durée de campagne.`,
    );
  }

  const gate = journaux.find((j) => j.tag === "keel.household_meal.final_gate");
  if (gate) {
    console.log(`\n── PORTE FINALE (journal du tir) ─────────────────────────────`);
    console.log(`   ok=${gate.ok} · refus=${gate.refusals} · bloquants=${gate.blocking}`);
    console.log(`   livraison : ${gate.delivery}`);
    console.log(`   non évalués : ${JSON.stringify(gate.unevaluated)}`);
    console.log(`   incomplets  : ${JSON.stringify(gate.incomplete)}`);
    console.log(`   causes      : ${JSON.stringify(gate.causes)}`);
  }
}
