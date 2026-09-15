/**
 * ══════════════════════════════════════════════════════════════════════════
 * C0 — LA GRILLE DE MESURE, FIDÈLE À LA DEMANDE ET À CHAQUE PERSONNE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts \
 *     scratchpad/2026-09-11-CLOTURE/fixtures/<tir>-c0.json
 *
 * ⛔ AUCUNE ÉQUATION N'EST RECODÉE ICI. Ce fichier FABRIQUE UN CONTEXTE et
 * appelle `mesurerUnPlan` / `rendre` / `troisFamilles` de
 * `scripts/2026-09-11-mesure-grille.ts` — le MÊME instrument, les MÊMES
 * dénominateurs, les MÊMES tolérances que le lot 0.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE C0 A CHANGÉ, ET POURQUOI CHAQUE NOMBRE QUI BOUGE EST EXPLIQUÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La version du lot F (2026-09-11 20 h) mentait, et dans le sens rassurant :
 *
 *   ① ELLE DÉDUISAIT LA GRILLE DES PLATS RETOURNÉS. `casesParJour` était
 *     construit en bouclant sur `ligne.dishes`. Un plat manquant DISPARAISSAIT
 *     du contrôle : la case n'était plus attendue, donc jamais comptée absente.
 *     ⟳ Ici la grille vient de la DEMANDE FIGÉE (`demande.cases_par_bouche`),
 *     et le fichier REFUSE de mesurer une sortie qui n'en porte pas.
 *
 *   ② ELLE FORÇAIT `appetite: "average"` ET `gender: "male"`, et ne
 *     reconstruisait QU'UNE bouche. Conséquences mesurées :
 *       · tir n° 3 (grand appétit) : couloir de petit-déjeuner rendu
 *         [100–…] au lieu de [91–223], d'où DEUX fausses violations ;
 *       · tir n° 6 (foyer de deux) : 12 contenants, 6 mesurés, publiés
 *         « 6 / 6 conformes ».
 *     ⟳ Ici l'appétit, le sexe, le corps, l'objectif et le cran de CHAQUE
 *     bouche viennent de la demande figée, et toutes les bouches sont mesurées.
 *
 *   ③ ELLE IGNORAIT LES APPORTS FIXES, LE RYTHME DÉCLARÉ ET LES MOMENTS
 *     LÉGERS (`eating_rhythm: null`, `light_slots: []`, `fixedKcalBySlot:
 *     null`). Le tir n° 5 déclarait 200 g de yaourt grec : sa case était
 *     comparée à la cible d'un tir sans apport fixe.
 *     ⟳ Ici les trois traversent, et la SOURCE canonique de chacun est nommée.
 *
 *   ④ ELLE ATTRIBUAIT LES CHAMPS FINAUX AU PREMIER JET. `ref` était compté sur
 *     le payload persisté — après réparation. ⟳ Ici les deux sortent côte à
 *     côte, et l'écart est le travail de la réparation.
 *
 * ⚠️ CE QUE CE FICHIER NE PEUT TOUJOURS PAS FAIRE : le run ne PERSISTE aucun
 * contrat par case. Les contrats sont donc RECONSTRUITS — et la preuve qu'ils
 * sont les bons est la comparaison CARACTÈRE POUR CARACTÈRE de la consigne de
 * densité refaite avec le prompt réellement envoyé (`llm_raw_response_events.
 * user_message`). Quand cette comparaison échoue, aucun couloir de ce rapport
 * ne doit être lu.
 */
import {
  chargerFixtures,
  censusDesReferences,
  type Fixtures,
  mesurerUnPlan,
  rendre,
  troisFamilles,
  troisIndex,
} from "../../scripts/2026-09-11-mesure-grille.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const FIXTURES = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures`;

/**
 * LE CONTEXTE DE MESURE, BÂTI SUR LA DEMANDE FIGÉE — jamais sur les plats.
 *
 * ⛔ UNE SEULE LIGNE DE CE CONTEXTE PEUT VENIR DU PLAN : `content_locale`, qui
 * décide de la langue du référentiel. Tout le reste est de la demande.
 */
export function contexteDeLaDemande(
  gele: Record<string, unknown>,
): Record<string, unknown> {
  const d = gele.demande as Record<string, unknown>;
  const ligne = (gele.ligne_ecrite ?? {}) as Record<string, unknown>;
  const bouches = (d.bouches ?? []) as Record<string, unknown>[];
  const casesParBouche = (d.cases_par_bouche ?? {}) as Record<
    string,
    Record<string, string[]>
  >;
  return {
    plan_id: String(ligne.id ?? ""),
    request_id: String(gele.request_id ?? ""),
    goal: d.goal ?? {},
    members: bouches.map((b) => ({
      member_id: b.member_id,
      user_id: b.user_id ?? null,
      first_name: b.first_name,
      birth_date: b.birth_date,
      goal: b.goal ?? null,
      target_pace_kg_per_week: b.target_pace_kg_per_week ?? null,
      eating_rhythm: b.eating_rhythm ?? null,
      // ⛔ LA SOURCE CANONIQUE, ET ELLE SEULE. `fixed_intakes_colonne_orpheline`
      // existe dans la fixture pour être NOMMÉE, jamais pour être additionnée :
      // `household_fixed_intakes.ts` ne lit cette colonne que pour une bouche
      // SANS compte. Mesurer avec une valeur que le moteur n'a pas lue
      // rendrait un écart qui n'appartient à personne.
      fixed_intakes: b.fixed_intakes ?? [],
      light_slots: b.light_slots ?? [],
      // ⛔ `restrictionOf` DU HANDLER, RECOPIÉE DE SON CORPS (l. 3024) :
      // « m.userId === null ⇒ no_account ». Une bouche sans compte n'est pas
      // « clear » : elle est illisible pour la garde TCA, et le contrat le sait.
      restriction: b.user_id === null || b.user_id === undefined ? "no_account" : "clear",
      age_state: b.age_state ?? "unknown",
      allergies: b.allergies ?? [],
      cases_par_jour: casesParBouche[String(b.member_id)] ?? {},
    })),
    member_bodies: bouches.map((b) => {
      const corps = (b.body ?? {}) as Record<string, unknown>;
      return {
        member_id: b.member_id,
        weight_kg: corps.weight_kg,
        height_cm: corps.height_cm,
        gender: corps.gender,
        appetite: corps.appetite,
        activity_level: corps.activity_level,
        day_activity: corps.day_activity,
        sport_frequency: corps.sport_frequency,
        activity_axes_asked_at: corps.activity_axes_asked_at ?? null,
      };
    }),
    profile: d.profile ?? {},
    grille: {
      jours: d.jours ?? [],
      // ⚠️ LA GRILLE DE LA MAISON N'EST QU'UN DÉFAUT : chaque bouche porte la
      // sienne dans `members[].cases_par_jour`, et c'est elle qui sert.
      cases_par_jour: casesParBouche[String(bouches[0]?.member_id ?? "")] ?? {},
      light_slots: [],
    },
    contrat_de_calcul: d.contrat_de_calcul ?? {},
    instant: { jour_local: String(ligne.starts_on ?? "") },
  };
}

/** Le champ `ref` écrit par le modèle, compté sur UN payload donné. */
function refsDuPayload(plan: Record<string, unknown>): {
  lignes: number;
  avecRef: number;
  sans: string[];
} {
  const unites = [
    ...((plan.dishes ?? []) as Record<string, unknown>[]),
    ...((plan.preparations ?? []) as Record<string, unknown>[]),
  ];
  let lignes = 0, avecRef = 0;
  const sans: string[] = [];
  for (const u of unites) {
    for (const i of (u.ingredients ?? []) as Record<string, unknown>[]) {
      lignes++;
      if (typeof i.ref === "string" && i.ref.trim() !== "") avecRef++;
      else sans.push(String(i.term ?? "?"));
    }
  }
  return { lignes, avecRef, sans: sans.sort() };
}

if (import.meta.main) {
  const chemin = Deno.args.find((a) => !a.startsWith("--"));
  if (!chemin) {
    console.error(
      "usage : analyse-lot-F.ts <scratchpad/2026-09-11-CLOTURE/fixtures/…-c0.json>",
    );
    Deno.exit(2);
  }
  const gele = JSON.parse(await Deno.readTextFile(chemin)) as Record<string, unknown>;
  const ligne = gele.ligne_ecrite as Record<string, unknown> | null;
  if (!ligne) {
    console.error("⛔ cette sortie ne porte aucune ligne écrite (le tir a échoué).");
    Deno.exit(1);
  }
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LE REFUS QUI FAIT DE ① UNE GARDE, ET PAS UN COMMENTAIRE
  // ══════════════════════════════════════════════════════════════════════
  //
  // Sans demande figée, la seule grille disponible serait celle des plats
  // retournés — c'est-à-dire le défaut que C0 existe pour fermer. On ne
  // « retombe » donc pas dessus : on s'arrête, et on donne la commande.
  if (gele.demande === undefined || gele.demande === null) {
    console.error(
      "⛔ AUCUNE DEMANDE FIGÉE DANS CE FICHIER.\n" +
        "   Mesurer sans elle obligerait à déduire la grille des plats rendus,\n" +
        "   et un plat manquant disparaîtrait du contrôle. Fige-la d'abord :\n\n" +
        "   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \\\n" +
        "     scratchpad/2026-09-11-CLOTURE/figer-demande.ts " + chemin + "\n",
    );
    Deno.exit(2);
  }
  const d = gele.demande as Record<string, unknown>;
  const base = await chargerFixtures(FIXTURES);
  const ctx = contexteDeLaDemande(gele);

  // ══════════════════════════════════════════════════════════════════════
  // LA CONTRE-ÉPREUVE DE ①, EXÉCUTABLE : `--retirer=sun/dinner`
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ON AMPUTE LE PLAN, PAS LA DEMANDE. Une case retirée du plan doit rester
  // ATTENDUE et se compter ABSENTE. Le banc du lot F aurait rendu « 5 cases
  // attendues, 5 plats » — une couverture parfaite sur un plan mutilé.
  const RETIRER = Deno.args.find((a) => a.startsWith("--retirer="))?.slice(10) ?? "";
  if (RETIRER) {
    const [jour, slot] = RETIRER.split("/");
    const avant = (ligne.dishes as Record<string, unknown>[]).length;
    ligne.dishes = (ligne.dishes as Record<string, unknown>[])
      .filter((x) => !(String(x.day) === jour && String(x.slot) === slot));
    const apres = (ligne.dishes as Record<string, unknown>[]).length;
    console.log(
      `\n⚠️ CONTRE-ÉPREUVE : la case « ${RETIRER} » a été RETIRÉE DU PLAN ` +
        `(${avant} → ${apres} plats).\n` +
        `   Elle reste ATTENDUE : la grille vient de la demande, pas des plats.` +
        (avant === apres ? `\n   ⛔ AUCUN PLAT RETIRÉ — cette case n'existait pas.` : ""),
    );
  }

  // ── LES ÉCHANGES : le prompt RÉELLEMENT envoyé, et le PREMIER jet ───────
  const etapes = (gele.etapes ?? {}) as Record<string, unknown>;
  const requestId = String(gele.request_id ?? "");
  const echanges: Record<string, unknown>[] = [];
  if (typeof etapes.prompt_envoye === "string" && etapes.prompt_envoye.length > 0) {
    echanges.push({
      request_id: requestId,
      source: "generate-household-meal-v1",
      user_message: etapes.prompt_envoye,
    });
  }
  if (typeof etapes.premier_jet === "string" && etapes.premier_jet.length > 0) {
    echanges.push({
      request_id: requestId,
      source: "generate-household-meal-v1",
      outcome: "text",
      output_text: etapes.premier_jet,
    });
  }
  const journaux = (gele.journal ?? []) as Record<string, unknown>[];
  const fx: Fixtures = {
    ...base,
    plans: [ligne],
    contextes: [ctx],
    echanges,
    journaux,
  };

  const bouches = (d.bouches ?? []) as Record<string, unknown>[];
  console.log("");
  console.log("█".repeat(78));
  console.log(
    `C0 · ${String(gele.titre ?? "")}`,
  );
  console.log("█".repeat(78));
  console.log(`demande figée le ${gele.fige_le} · source ${gele.source_sortie}`);
  console.log(
    `instant     ${JSON.stringify(d.instant)}`,
  );
  console.log(
    `fenêtre     ${JSON.stringify(d.fenetre)}`,
  );
  console.log(
    `⛔ LA GRILLE VIENT DE LA DEMANDE, PAS DES PLATS : ` +
      `${d.cases_attendues_total} case(s) attendue(s) sur ${bouches.length} bouche(s) — ` +
      `${JSON.stringify(d.cases_attendues_par_bouche)}`,
  );
  // Le contrôle d'annonce : ce qui avait été IMPRIMÉ avant l'appel.
  const fenetre = (d.fenetre ?? {}) as Record<string, unknown>;
  const annoncees = Number(fenetre.cases_annoncees ?? NaN) *
    Number(fenetre.bouches_annoncees ?? NaN);
  console.log(
    Number.isFinite(annoncees)
      ? annoncees === Number(d.cases_attendues_total)
        ? `✅ le total attendu est CELUI QUI AVAIT ÉTÉ ANNONCÉ avant l'appel (${annoncees}).`
        : `⛔ LE TOTAL ATTENDU (${d.cases_attendues_total}) N'EST PAS CELUI ANNONCÉ AVANT L'APPEL (${annoncees}).`
      : `⚪ aucune annonce d'avant l'appel dans cette sortie.`,
  );

  // ── ④ LE PREMIER JET ET LE PAYLOAD FINAL, SÉPARÉS ──────────────────────
  let premierJet: Record<string, unknown> | null = null;
  try {
    premierJet = typeof etapes.premier_jet === "string"
      ? JSON.parse(etapes.premier_jet) as Record<string, unknown>
      : null;
  } catch {
    premierJet = null;
  }
  const reparations = (etapes.reparations ?? []) as Record<string, unknown>[];
  console.log("");
  console.log("══ ④ PREMIER JET · RÉPARATIONS · PAYLOAD RELU ════════════════");
  console.log(
    `réparations du modèle : ${reparations.length}` +
      (reparations.length > 0
        ? ` — ${reparations.map((r) => String(r.source)).join(", ")}`
        : ""),
  );
  if (premierJet === null) {
    console.log(
      `⚪ premier jet absent ou illisible : les champs du payload final ne lui` +
        ` seront PAS attribués, et rien n'est publié à sa place.`,
    );
  } else {
    const a = refsDuPayload(premierJet);
    const b = refsDuPayload(ligne);
    console.log(
      `champ « ref » au PREMIER JET      ${a.avecRef} / ${a.lignes} ligne(s)`,
      `\nchamp « ref » APRÈS RÉPARATION    ${b.avecRef} / ${b.lignes} ligne(s)`,
    );
    if (a.sans.length > 0) {
      console.log(
        `lignes SANS « ref » au premier jet : ${[...new Set(a.sans)].join(", ")}`,
      );
    }
    console.log(
      `⛔ CES DEUX NOMBRES NE SE REMPLACENT PAS. Le rapport du 2026-09-11` +
        ` publiait le second et le présentait comme la sortie du modèle.`,
    );
    // Les quatre états de référence, sur le premier jet, avec SON index.
    const idxPremier = await troisIndex(fx, {
      ...premierJet,
      content_locale: ligne.content_locale,
    });
    const cPremier = censusDesReferences(idxPremier.relecture.index, premierJet);
    console.log(
      `états de référence au PREMIER JET : ` +
        `vérifiées ${cPremier.parEtat.reference_verifiee} · ` +
        `groupe ${cPremier.parEtat.estimation_de_groupe} · ` +
        `à valider ${cPremier.parEtat.en_attente_de_validation} · ` +
        `NON MESURABLES ${cPremier.parEtat.ingredient_non_mesurable}` +
        (cPremier.noms.ingredient_non_mesurable.length > 0
          ? ` (${[...new Set(cPremier.noms.ingredient_non_mesurable)].join(", ")})`
          : ""),
    );
  }

  // ── LES APPORTS FIXES ÉCRITS DANS UNE COLONNE NON LUE ───────────────────
  for (const b of bouches) {
    const orph = (b.fixed_intakes_colonne_orpheline ?? []) as unknown[];
    if (Array.isArray(orph) && orph.length > 0) {
      console.log(
        `\n⛔ ${String(b.first_name)} — ${orph.length} APPORT(S) FIXE(S) ÉCRIT(S) DANS UNE ` +
          `COLONNE QUE LE MOTEUR NE LIT PAS.\n` +
          `   écrit dans household_members.fixed_intakes : ${JSON.stringify(orph)}\n` +
          `   lu par household_fixed_intakes.ts pour une bouche AVEC compte : ` +
          `${String(b.fixed_intakes_source)} = ${JSON.stringify(b.fixed_intakes)}\n` +
          `   ⇒ la mesure ci-dessous emploie CE QUE LE MOTEUR A LU, et pas ce que` +
          ` la personne a déclaré.`,
      );
    }
  }

  // ── ② CHAQUE BOUCHE, ENTIÈREMENT ───────────────────────────────────────
  const familles: { nom: string; f: ReturnType<typeof troisFamilles> }[] = [];
  for (let rang = 0; rang < bouches.length; rang++) {
    const m = await mesurerUnPlan(fx, ligne, { rang });
    console.log(rendre(m));
    familles.push({ nom: m.bouche.prenom || m.bouche.memberId, f: troisFamilles(m) });
  }

  // ── LE BILAN DU FOYER, TROIS COLONNES QUI NE SE FONDENT PAS ────────────
  console.log("");
  console.log("══ BILAN DU FOYER ════════════════════════════════════════════");
  let calA = 0, calB = 0, compA = 0, compB = 0, inc = 0, sansObjet = 0;
  for (const { nom, f } of familles) {
    calA += f.conformiteCalorique.conformes;
    calB += f.conformiteCalorique.sur;
    compA += f.conformiteComplete.conformes;
    compB += f.conformiteComplete.sur;
    inc += f.controlesIncomplets.length;
    // ⟳ 2026-09-13 — LA QUATRIÈME COLONNE. Une bouche dont le moteur
    // s'abstient de calculer une cible reçoit une PART DE RECETTE : elle est
    // nourrie, et ses cases ne sont ni des échecs ni des succès numériques.
    sansObjet += f.nonApplicables.cases;
    console.log(
      `${nom.padEnd(10)} calorique ${f.conformiteCalorique.conformes}/${f.conformiteCalorique.sur}` +
        ` · complète ${f.conformiteComplete.conformes}/${f.conformiteComplete.sur}` +
        ` · incomplets ${f.controlesIncomplets.length}` +
        (f.nonApplicables.cases > 0 ? ` · SANS OBJET ${f.nonApplicables.cases}` : ""),
    );
  }
  console.log(
    `TOTAL      conformité CALORIQUE ${calA}/${calB} · ` +
      `conformité COMPLÈTE ${compA}/${compB} · contrôles INCOMPLETS ${inc}` +
      (sansObjet > 0 ? ` · SANS OBJET ${sansObjet}` : ""),
  );
  console.log(
    `⛔ « ${calA}/${calB} » NE S'ÉCRIT PAS « ${compB} cases conformes ». Le rapport du` +
      ` 2026-09-11 a publié la première colonne sous le nom de la seconde.`,
  );

  // ── LE COÛT, PAR NATURE ────────────────────────────────────────────────
  const budget = ((ligne.generated_from as Record<string, unknown>)?.plan_budget ??
    {}) as Record<string, unknown>;
  const sortieBrute = gele as Record<string, unknown>;
  console.log(`\n── COÛT ──────────────────────────────────────────────────────`);
  console.log(`   transmissions fournisseur : ${budget.provider_attempts ?? "—"}`);
  console.log(
    `   réparations : ${budget.repairs_used ?? "—"} / ${budget.repairs_allowed ?? "—"}` +
      ` (demandées : ${budget.repairs_asked ?? "—"})`,
  );
  console.log(
    `   réponses de réparation ARCHIVÉES : ${reparations.length}` +
      ` — ⚠️ un compteur de budget n'est pas une trace : les deux sont publiés.`,
  );
  console.log(`   échéance du budget : ${budget.total_ms ?? "—"} ms` +
    ` · utilisable ${budget.usable_ms ?? "—"} ms · réserve ${budget.reserve_ms ?? "—"} ms`);

  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 2 — LA **DERNIÈRE** PORTE, PAS LA PREMIÈRE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT QUE ÇA FERME, MESURÉ. `find` rendait la porte du PREMIER tour,
  // c'est-à-dire celle d'AVANT toute réparation. Sur le cas « portion
  // manquante réparée » (2026-09-13), ce bloc imprimait « ok=false · refus=4 ·
  // livraison not_deliverable » sous un plan livré en 200 dont la dernière
  // porte dit « ok=true · refus=0 · conforme ». Le rapport aurait publié le
  // verdict d'un plan que personne n'a reçu.
  //
  // ⚠️ ET LE COMPTE DES PORTES EST IMPRIMÉ : une seule ligne veut dire qu'il
  // n'y a eu aucune réparation, et c'est une information, pas du bruit.
  const portes = journaux.filter((j) => j.tag === "keel.household_meal.final_gate");
  const gate = portes[portes.length - 1];
  if (gate) {
    console.log(`\n── PORTE FINALE (journal du tir) ─────────────────────────────`);
    console.log(
      `   ${portes.length} passage(s) de porte dans ce tir — celle-ci est la DERNIÈRE` +
        (portes.length > 1
          ? ` (la première disait ok=${portes[0].ok} · refus=${portes[0].refusals})`
          : ""),
    );
    console.log(`   ok=${gate.ok} · refus=${gate.refusals} · bloquants=${gate.blocking}`);
    console.log(`   livraison : ${gate.delivery}`);
    console.log(`   non évalués : ${JSON.stringify(gate.unevaluated)}`);
    console.log(`   incomplets  : ${JSON.stringify(gate.incomplete)}`);
    console.log(`   causes      : ${JSON.stringify(gate.causes)}`);
  } else {
    console.log(
      `\n⚪ AUCUN JOURNAL DE PORTE FINALE dans cette fixture : les compteurs du` +
        ` moteur ne sont pas publiés, et rien n'est deviné à leur place.`,
    );
  }
  void sortieBrute;
}
