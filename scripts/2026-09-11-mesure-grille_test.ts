/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LES TESTS DE L'INSTRUMENT — pas du moteur
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LOT 0 du chantier « Fiabiliser les portions et préserver les recettes ».
 *
 * ⛔ CE QUE CES TESTS GARDENT. Ils ne disent pas que le moteur est bon — il ne
 * l'est pas, et le rapport du lot le dit case par case. Ils disent que
 * l'instrument MESURE CE QU'IL ANNONCE, et ils rougissent si l'une des cinq
 * erreurs du 2026-09-11 revient :
 *   ① deux bases de mesure dans le même rapport ;
 *   ② `indexForReading` appelé de travers ;
 *   ③ les couloirs extraits par regex sur le prompt ;
 *   ④ un dénominateur unique pour cinq questions ;
 *   ⑤ « 100 % vérifié » écrit à partir du taux de présence de `ref`.
 *
 * ⛔ CHAQUE TEST A UN CAS QUI PASSE **ET** UN CAS QUI DOIT ÉCHOUER quand c'est
 * possible : « une garde qui n'a que des cas qui passent est une garde à moitié
 * armée », et ce dépôt l'a payé six fois cette campagne.
 *
 * ⚠️ CE FICHIER N'EST PAS DANS `supabase/functions/_shared/keel/` et ne sort
 * donc PAS de `deno test supabase/functions/_shared/keel/`. C'est délibéré : le
 * lot 0 a ordre de ne rien ajouter sous `supabase/functions/`. Il se lance à
 * part :
 *
 *     deno test --allow-read scripts/2026-09-11-mesure-grille_test.ts
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { fromFileUrl } from "jsr:@std/path@1";
// ⟳ C2 (2026-09-12) — LES FONCTIONS DE PRODUCTION, JAMAIS UN REJEU MAISON.
// L'arrondi et le rendu vivent dans le module que le moteur ET le navigateur
// importent ; l'instrument les APPELLE sur une copie.
import {
  finalizePlanQuantities,
  planQuantityLines,
  renderQuantity,
} from "../supabase/functions/_shared/keel/quantity_render.ts";
import {
  classerAppels,
  natureDeLaSource,
  boucheDuContexte,
  chargerFixtures,
  censusDesQuantites,
  censusDesReferences,
  contratRepare,
  contratsParCase,
  contratTransmis,
  contrefactuelIdentite,
  CONTREFACTUEL_REF,
  croiser,
  enveloppeDeLaBouche,
  plancherProteine,
  type Fixtures,
  journeesParPortions,
  mesurerPortions,
  mesurerUnPlan,
  rendre,
  fusionnerParts,
  TOLERANCE_REPAS,
  troisFamilles,
  troisIndex,
} from "./2026-09-11-mesure-grille.ts";
// ⟳ 2026-09-11 · C0 — LE BANC EST TESTÉ PAR CE FICHIER, ET PAS SEULEMENT
// L'INSTRUMENT. `contexteDeLaDemande` est la fonction qui refuse de déduire la
// grille des plats ; `installerHorloge` est celle qui rend le cas partiel
// reproductible. Les laisser hors du harnais reviendrait à ne garder que la
// moitié du correctif — celle qui ne bouge pas.
import { contexteDeLaDemande } from "../scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts";
import { installerHorloge } from "../scratchpad/2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts";
// ⟳ 2026-09-13 · § 2.3 — LA RÉPARTITION DU PLANCHER PAR CRÉNEAU, PAR LA
// FONCTION DU PRODUIT. Elle est comparée à la ligne du PROMPT ARCHIVÉ : la
// référence du test est ce que le moteur a envoyé, pas ce qu'on en dit.
import { proteinBriefFor } from "../supabase/functions/_shared/keel/plan_protein_brief.ts";
import { planEnergy } from "../supabase/functions/_shared/keel/plan_energy.ts";
import {
  readDishes,
  readPreparations,
} from "../supabase/functions/_shared/keel/plan_energy_read.ts";

// ⚠️ `fromFileUrl`, jamais `.pathname` : le dépôt vit dans « Sophia 2 », et
// `.pathname` rend « Sophia%202 » — un chemin qui n'existe pas.
const RACINE = fromFileUrl(
  new URL("../scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures", import.meta.url),
);
const PERTE = "1f8a8988-b3ed-4b83-a4d0-93297ac0d652";
const GAIN = "1eada05b-2c3d-4ed5-aa85-14edf2840b77";

let cache: Fixtures | null = null;
async function fixtures(): Promise<Fixtures> {
  cache ??= await chargerFixtures(RACINE);
  return cache;
}
const planDe = (fx: Fixtures, id: string) => fx.plans.find((p) => String(p.id) === id)!;

// ═══════════════════════════════════════════════════════════════════════════
// LA PREUVE DE DÉPART — reproduite parce qu'elle est vraie, pas cherchée
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("14 cases, 14 plats, 12 portions calculées, 12 mesurables (11 avant le lot A)", async () => {
  const fx = await fixtures();
  let cases = 0, plats = 0, calculees = 0, mesurables = 0;
  for (const p of fx.plans) {
    const m = await mesurerUnPlan(fx, p);
    cases += m.denominateurs.casesAttendues;
    plats += m.denominateurs.platsPresents;
    calculees += m.denominateurs.portionsCalculees;
    mesurables += m.denominateurs.portionsMesurables;
  }
  assertEquals(cases, 14);
  assertEquals(plats, 14);
  // ⛔ `portionsCalculees` NE BOUGE PAS, ET C'EST UNE LIMITE DU FIGÉ, PAS UN
  // ÉCHEC DU LOT A. Les deux cases sans boîte (PERTE sam./déjeuner, GAIN
  // ven./dîner) n'ont AUCUNE boîte dans le payload enregistré: une boîte
  // absente d'une archive le reste pour toujours. Ce que le lot A répare, c'est
  // la mesure qui l'avait fait manquer — voir `sonde-lot-A` pour la preuve que
  // ces deux plats redeviennent mesurables.
  assertEquals(calculees, 12);
  // ⟳ LOT A (2026-09-11): 11 → 12. GAIN `sat/breakfast` portait une boîte de
  // 523 g illisible (`dish_incomplete`) parce que le petit-suisse se résolvait
  // par son libellé; son identifiant `petit_suisse_cream_cheese` la rend
  // mesurable à 546,00 kcal — exactement le contrefactuel du lot 0.
  assertEquals(mesurables, 12);
});

Deno.test("preuve de départ · les deux dimanches valent 2 455,69 et 2 916,14 kcal", async () => {
  const fx = await fixtures();
  const attendu: Record<string, number> = { [PERTE]: 2455.69, [GAIN]: 2916.14 };
  for (const [id, kcal] of Object.entries(attendu)) {
    const m = await mesurerUnPlan(fx, planDe(fx, id));
    const dimanche = m.jours.find((j) => j.jour === "sun")!;
    assertAlmostEquals(dimanche.kcalSomme!, kcal, 0.01, `dimanche de ${id}`);
  }
});

Deno.test("le petit-suisse vaut 546 kcal PAR LE CHEMIN NOMINAL — le contrefactuel est devenu la mesure", async () => {
  const fx = await fixtures();
  const gain = planDe(fx, GAIN);
  const index = (await troisIndex(fx, gain)).relecture.index;
  const nominal = mesurerPortions({ index, plan: gain });
  const i = nominal.findIndex((b) => b.jour === "sat" && b.slot === "breakfast");
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT A (2026-09-11) — CE TEST A CHANGÉ DE SENS, ET C'EST LE RÉSULTAT.
  // ══════════════════════════════════════════════════════════════════════════
  // AVANT: la mesure nominale rendait `null` / `dish_incomplete` sur cette
  // boîte de 523 g, et il fallait RELIER À LA MAIN la ligne à son identifiant
  // `petit_suisse_cream_cheese` — déjà choisi par le modèle — pour obtenir
  // 546,00 kcal. C'était le contrefactuel du lot 0.
  // APRÈS: le chemin de production lit l'identifiant, donc il rend 546,00 tout
  // seul. Le nombre n'a pas bougé d'un centième; c'est le chemin qui a bougé.
  assertAlmostEquals(nominal[i].kcal!, 546, 0.5, "la mesure NOMINALE doit rendre 546");
  assertEquals(nominal[i].gap, null);
  // ⛔ ET LE CONTREFACTUEL NE DOIT PLUS RIEN DÉPLACER: refaire à la main ce que
  // le moteur fait déjà doit être l'identité. S'il bougeait encore, c'est que
  // le chemin nominal n'emploierait toujours pas la même référence.
  const apres = contrefactuelIdentite({ index, plan: gain, ref: CONTREFACTUEL_REF });
  assertEquals(apres.map((b) => b.kcal), nominal.map((b) => b.kcal));
  // ⛔ LE TÉMOIN : l'autre plan ne porte pas cette référence, donc RIEN n'y bouge.
  // Un contrefactuel dont le témoin bouge mesure autre chose que ce qu'il dit.
  const perte = planDe(fx, PERTE);
  const idxP = (await troisIndex(fx, perte)).relecture.index;
  const avantP = mesurerPortions({ index: idxP, plan: perte });
  const apresP = contrefactuelIdentite({ index: idxP, plan: perte, ref: CONTREFACTUEL_REF });
  assertEquals(avantP.map((b) => b.kcal), apresP.map((b) => b.kcal));
});

Deno.test("⛔ LOT E — LE CAS QUI MORD : l'ANCIENNE règle produisait bien les 8 alertes", async () => {
  // ⛔ LA PREUVE DE DÉPART DU LOT 0, CONSERVÉE À L'IDENTIQUE — et elle vit
  // maintenant dans `alertesParLibelle`, le corps EXACT retiré de
  // `final_plan_gate.ts`. Sans ce témoin, « les 8 alertes ont disparu » serait
  // une affirmation sur du code qui n'existe plus, donc invérifiable.
  const fx = await fixtures();
  const attendu: Record<string, string[]> = {
    [PERTE]: ["ingredient_not_bought:citron", "ingredient_not_bought:tomate"],
    [GAIN]: [
      "ingredient_not_bought:carotte",
      "ingredient_not_bought:citron",
      "ingredient_not_bought:oignon",
      "ingredient_not_bought:pita complète",
      "ingredient_not_bought:pomme de terre",
      "ingredient_not_bought:tomate",
    ],
  };
  for (const [id, noms] of Object.entries(attendu)) {
    const m = await mesurerUnPlan(fx, planDe(fx, id));
    assertEquals(m.coursesArchive.map((c) => `${c.cause}:${c.term}`).sort(), noms.sort());
  }
});

Deno.test("⛔ LOT E — les huit faux manques par pluriel ont DISPARU", async () => {
  const fx = await fixtures();
  // ⛔ ET CE QUI RESTE N'EST PAS ZÉRO. Sur PERTE, un vrai sous-achat apparaît:
  // 400 g de tomate achetés pour 446,8 g requis, soit **10,5 %** de manque —
  // très au-dessus de l'arrondi de panier (5 %). Sur GAIN, la seule alerte
  // restante est la CLASSIFICATION absente que la revue avait déjà distinguée
  // d'un achat absent (« la septième alerte GAIN est une classification
  // absente, pas un achat absent »).
  const attendu: Record<string, string[]> = {
    [PERTE]: ["ingredient_short_bought:tomate"],
    [GAIN]: ["unclassified_perishable:petits-suisses nature"],
  };
  for (const [id, noms] of Object.entries(attendu)) {
    const m = await mesurerUnPlan(fx, planDe(fx, id));
    assertEquals(m.courses.map((c) => `${c.cause}:${c.term}`).sort(), noms.sort());
    // ⛔ AUCUN `ingredient_not_bought` NE SUBSISTE: les six couples de la revue
    // sont sur la liste, et l'identité les y trouve.
    assertEquals(m.courses.filter((c) => c.cause === "ingredient_not_bought").length, 0);
  }
});

Deno.test("⛔ LOT E — l'audit d'achats a bien TOURNÉ, il ne s'est pas tu", async () => {
  // Une garde silencieuse et une garde débranchée rendent le même zéro.
  const fx = await fixtures();
  const perte = await mesurerUnPlan(fx, planDe(fx, PERTE));
  assertEquals(perte.coursesAudit.length, 23, "23 identités demandées par les recettes");
  assertEquals(
    perte.coursesAudit.filter((r) => r.state === "covered_measured").length,
    19,
    "19 identités VÉRIFIÉES en quantité — présence ET suffisance",
  );
  // ⚠️ GAIN est à 26 « contrôle incomplet », et c'est HONNÊTE : ses lignes de
  // courses écrivent « 310 g d'agneau », que `readQuantityFromProse` refuse de
  // lire (elle n'interprète AUCUN mot). On ne sait donc pas si la quantité
  // suffit — et on le DIT, au lieu d'inventer un manque ou une couverture.
  const gain = await mesurerUnPlan(fx, planDe(fx, GAIN));
  assertEquals(gain.coursesAudit.filter((r) => r.state === "check_incomplete").length, 26);
  assertEquals(gain.coursesAudit.filter((r) => r.state === "not_bought").length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ① DEUX BASES DE MESURE — le test qui rougit si `planEnergy` revient
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② la journée vient des BOÎTES, et planEnergy rendrait d'autres nombres", async () => {
  const fx = await fixtures();
  // Les nombres du rapport FAUX du 2026-09-11, épinglés ici pour qu'on les
  // reconnaisse s'ils reviennent : `planEnergy` rend 2 370 et 3 075.
  const parPart: Record<string, number> = { [PERTE]: 2370, [GAIN]: 3075 };
  const parBoite: Record<string, number> = { [PERTE]: 2455.69, [GAIN]: 2916.14 };
  for (const id of [PERTE, GAIN]) {
    const plan = planDe(fx, id);
    const index = (await troisIndex(fx, plan)).relecture.index;
    const conventionnel = planEnergy({
      index,
      dishes: readDishes(plan.dishes),
      preparations: readPreparations(plan.preparations),
      servings: Number(plan.servings ?? 1),
      addons: [],
      mealsOutByDay: new Map(),
    }).days.find((d) => d.day === "sun")!;
    assertEquals(conventionnel.kcal, parPart[id], "part conventionnelle");

    const m = await mesurerUnPlan(fx, plan);
    const parBoites = m.jours.find((j) => j.jour === "sun")!.kcalSomme!;
    assertAlmostEquals(parBoites, parBoite[id], 0.01, "somme des portions écrites");
    // ⛔ LES DEUX NE SONT PAS ÉGAUX, ET C'EST TOUT LE POINT. Si ce test devient
    // vert par égalité, quelqu'un a rebranché la mauvaise base de mesure.
    assert(
      Math.abs(parBoites - conventionnel.kcal!) > 1,
      "les deux bases doivent RESTER distinctes",
    );
  }
});

Deno.test("② une journée à trou n'est pas « en écart », elle est non mesurable", async () => {
  const fx = await fixtures();
  const m = await mesurerUnPlan(fx, planDe(fx, PERTE));
  const samedi = m.jours.find((j) => j.jour === "sat")!;
  assertEquals(samedi.etat, "non_mesurable");
  assertEquals(samedi.ecartPct, null, "aucun pourcentage ne doit sortir d'une journée à trou");
  assertEquals(samedi.portionsMesurables, 2);
  assertEquals(samedi.casesAttendues, 3);
});

Deno.test("② une case sans portion ne devient pas zéro gramme de protéine", async () => {
  const fx = await fixtures();
  const m = await mesurerUnPlan(fx, planDe(fx, GAIN));
  // Vendredi n'a qu'une case, et elle n'a pas de portion : la protéine du jour
  // est INCONNUE. Une somme vaudrait « 0,0 g », un faux indémentable.
  assertEquals(m.proteine.parJour["fri"].mesureG, null);
  assertEquals(m.proteine.parJour["sun"].mesureG !== null, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ L'INDEX DE RELECTURE — le même que le chemin testé, prouvé par son témoin
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ l'index de relecture ne demande JAMAIS plus au sas que le témoin du run", async () => {
  const fx = await fixtures();
  for (const plan of fx.plans) {
    const m = await mesurerUnPlan(fx, plan);
    const t = m.temoins.reading_index as Record<string, unknown>;
    assert(t !== undefined, "le témoin archivé doit exister");
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT A (2026-09-11) — LE TÉMOIN EST UN JOURNAL, PAS UNE CIBLE.
    // ══════════════════════════════════════════════════════════════════════
    // Il dit ce que le moteur a demandé au sas LE 2026-09-11, avec le code de
    // ce jour-là: `asked 1 · kept 1` (PERTE) et `asked 2 · kept 1` (GAIN).
    // Depuis que « ref » traverse les lecteurs, « pita complète » se résout sur
    // `pita_wholemeal` sans passer par le sas: l'instrument demande 0.
    //
    // ⛔ LA GARDE CHANGE DE FORME, PAS DE SÉVÉRITÉ — ET ELLE MORD DANS LE SENS
    // QUI COMPTE. Demander MOINS est le lot; demander PLUS voudrait dire que la
    // relecture a perdu des identités que le run avait, c'est-à-dire le défaut
    // d'origine à l'envers. C'est ce sens-là qui est épinglé.
    assert(
      m.index.relecture.asked <= Number(t.asked),
      `asked · ${plan.id}: ${m.index.relecture.asked} > témoin ${t.asked}`,
    );
    assert(
      m.index.relecture.kept <= Number(t.kept),
      `kept · ${plan.id}: ${m.index.relecture.kept} > témoin ${t.kept}`,
    );
    // Et le chiffre exact d'aujourd'hui, épinglé pour qu'il s'explique s'il bouge.
    assertEquals(m.index.relecture.asked, 0, `asked · ${plan.id}`);
    assertEquals(m.index.relecture.kept, 0, `kept · ${plan.id}`);
  }
});

Deno.test("③ les trois index ne se confondent pas", async () => {
  const fx = await fixtures();
  const i = await troisIndex(fx, planDe(fx, PERTE));
  assertEquals(i.historique.bySlug.size, 943);
  // La porte de validation vaut à la COMPOSITION : l'index de génération est
  // strictement plus petit. S'ils s'égalisent, la porte est désarmée.
  assert(i.generation.composables < i.generation.total, "isComposable doit retirer des lignes");
  assertEquals(i.generation.total - i.generation.composables, i.generation.refusees.length);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE CONTRAT — refait, pas extrait ; et la clé de date manque au moteur
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ la consigne refaite est dans le prompt archivé, caractère pour caractère", async () => {
  const fx = await fixtures();
  for (const plan of fx.plans) {
    const m = await mesurerUnPlan(fx, plan);
    assertEquals(m.fragmentIdentique, true, `plan ${plan.id}`);
    assert(m.fragmentRefait.includes("kcal per 100 g"), "la phrase doit porter son unité");
  }
});

Deno.test("④ un corps modifié change la phrase — la reconstruction n'est donc pas un décor", async () => {
  const fx = await fixtures();
  const ctx = fx.contextes.find((c) => String(c.plan_id) === PERTE)!;
  const b = boucheDuContexte(ctx);
  const vrai = contratTransmis(b).fragment;
  // ⛔ LE CAS QUI DOIT ÉCHOUER. Si la phrase ne bougeait pas avec le poids, elle
  // ne prouverait rien sur les entrées figées — elle serait une constante.
  const faux = contratTransmis({ ...b, weightKg: b.weightKg + 20 }).fragment;
  assert(vrai !== faux, "la phrase doit dépendre du corps figé");
  const prompt = String(
    fx.echanges.find(
      (e) => String(e.request_id) === String(ctx.request_id) &&
        typeof e.user_message === "string" && String(e.user_message).length > 0,
    )!.user_message,
  );
  assert(prompt.includes(vrai));
  assert(!prompt.includes(faux));
});

Deno.test("④ le couloir transmis EST celui du jour — et l'archive dit ce qu'il était", async () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT B — CE TEST ÉPINGLAIT LE DÉFAUT. IL ÉPINGLE SA FERMETURE.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QU'IL DISAIT, ET QUI ÉTAIT VRAI : le samedi soir méritait [123–250]
  // visée 135 et recevait [250–250] `above_askable_cap`, parce que le vendredi
  // partiel imposait son couloir. La même case recevait 858,90 kcal d'un côté
  // et 2 454,00 de l'autre — facteur 2,86.
  //
  // ⚠️ LES DEUX NOMBRES SONT GARDÉS, dans la colonne `…Archive`. Les effacer
  // ferait disparaître la preuve du défaut en même temps que le défaut, et
  // c'est exactement ce que le lot 0 existe pour empêcher.
  const fx = await fixtures();
  const b = boucheDuContexte(fx.contextes.find((c) => String(c.plan_id) === PERTE)!);
  const contrats = contratsParCase(b);
  const samediSoir = contrats.find((c) => c.jour === "sat" && c.slot === "dinner")!;
  // ── CE QUE LE SAMEDI MÉRITE, ET CE QU'IL REÇOIT MAINTENANT ──────────
  assertEquals(samediSoir.couloirDuJour!.min, 123);
  assertEquals(samediSoir.couloirDuJour!.incompatible, null);
  assertEquals(samediSoir.couloirTransmis!.min, 123);
  assertEquals(samediSoir.couloirTransmis!.incompatible, null);
  // ⛔ ET LA LIGNE DIT QUELS JOURS ELLE COUVRE. Sans cela, « at dinner » ne
  // désigne aucune case.
  assertEquals([...samediSoir.couloirTransmis!.jours].sort(), ["fri", "sat", "sun"]);
  // ── CE QUE LE TIR DU 2026-09-11 AVAIT ENVOYÉ ────────────────────────
  assertEquals(samediSoir.couloirArchive!.min, 250);
  assertEquals(samediSoir.couloirArchive!.incompatible, "above_askable_cap");
  // ── UNE SEULE CIBLE PAR CASE, ET L'ARCHIVE EN AVAIT DEUX ────────────
  const vendrediSoir = contrats.find((c) => c.jour === "fri" && c.slot === "dinner")!;
  assertAlmostEquals(vendrediSoir.cibleCaseDimensionnementKcal!, 858.9, 0.01);
  assertAlmostEquals(vendrediSoir.cibleCaseKcal!, 858.9, 0.01);
  assertAlmostEquals(vendrediSoir.cibleCaseArchiveKcal!, 2454, 0.01);
  // ⛔ LE CAS QUI MORD : aucune case ne doit porter deux cibles.
  for (const c of contrats) {
    if (c.cibleCaseKcal === null || c.cibleCaseDimensionnementKcal === null) continue;
    assertAlmostEquals(
      c.cibleCaseKcal,
      c.cibleCaseDimensionnementKcal,
      0.0001,
      `${c.date} ${c.slot} porte deux cibles`,
    );
  }
});

Deno.test("⛔ LOT B — retirer le vendredi partiel ne déplace AUCUN dîner du week-end", async () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE TEST CENTRAL DU LOT B, ÉCRIT ROUGE PUIS RÉPARÉ.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ MESURÉ AVANT (sonde `sonde-lot-B-avant-2026-09-11.txt`) : retirer le
  // vendredi de la grille faisait passer le dîner de **[250–250]
  // `above_askable_cap`** à **[123–250] visée 135** (PERTE) et de [250–250] à
  // [146–250] visée 160 (GAIN). Un jour qu'on n'a pas touché changeait de
  // consigne parce qu'un AUTRE jour existait.
  const fx = await fixtures();
  const b = boucheDuContexte(fx.contextes.find((c) => String(c.plan_id) === PERTE)!);
  const avec = contratRepare(b).densite.named.find((s) => s.slot === "dinner")!;
  const sans = contratRepare({
    ...b,
    grille: { sat: b.grille.sat, sun: b.grille.sun },
  }).densite.named.find((s) => s.slot === "dinner")!;
  assertEquals(
    [avec.minPer100G, avec.maxPer100G, avec.preferredPer100G],
    [sans.minPer100G, sans.maxPer100G, sans.preferredPer100G],
    "le vendredi partiel déplace encore le dîner du week-end",
  );
  assertEquals(avec.incompatible, sans.incompatible);
  assertEquals([avec.minPer100G, avec.preferredPer100G], [123, 135]);

  // ⛔ ET L'INVERSE AUSSI : AJOUTER un vendredi partiel ne change rien.
  const ajoute = contratRepare({
    ...b,
    grille: { ...b.grille, thu: ["dinner"] },
    jourVersDate: { ...b.jourVersDate, thu: "2026-09-10" },
  }).densite.named.find((s) => s.slot === "dinner")!;
  assertEquals(
    [ajoute.minPer100G, ajoute.maxPer100G, ajoute.preferredPer100G],
    [123, 250, 135],
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ LE CAS QUI MORD, GARDÉ : l'ancienne arithmétique, elle, déplaçait bien
  // les dîners du week-end. Sans lui, une fonction qui rendrait le même couloir
  // pour TOUTE entrée passerait les assertions ci-dessus sans rien prouver.
  // ══════════════════════════════════════════════════════════════════════════
  const archAvec = contratTransmis(b).densite.named.find((s) => s.slot === "dinner")!;
  const archSans = contratTransmis({
    ...b,
    grille: { sat: b.grille.sat, sun: b.grille.sun },
  }).densite.named.find((s) => s.slot === "dinner")!;
  assertEquals(archAvec.minPer100G, 250);
  assertEquals(archAvec.incompatible, "above_askable_cap");
  assertEquals(archSans.minPer100G, 123);
  assertEquals(archSans.incompatible, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES CINQ DÉNOMINATEURS — distincts, et une absence ne sort pas du total
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑤ les cinq dénominateurs descendent et se nomment", async () => {
  const fx = await fixtures();
  const m = await mesurerUnPlan(fx, planDe(fx, GAIN));
  const d = m.denominateurs;
  assertEquals(d.casesAttendues, 7);
  assertEquals(d.platsPresents, 7);
  assertEquals(d.portionsCalculees, 6);
  // ⟳ LOT A (2026-09-11): 5 → 6. `sat/breakfast` était `dish_incomplete` parce
  // que le petit-suisse se résolvait par son libellé; il se résout désormais
  // par `petit_suisse_cream_cheese`, et sa boîte de 523 g rend 546,00 kcal.
  assertEquals(d.portionsMesurables, 6);
  // ⛔ CE QUI NE BOUGE PAS, ET IL FAUT QUE ÇA RESTE VISIBLE: `fri/dinner` n'a
  // AUCUNE boîte dans l'archive. Le lot A répare la mesure, pas le passé.
  assertEquals(d.casesSansPortion, ["fri/dinner"]);
  assertEquals(d.portionsNonMesurables, []);
  // ⛔ « LE PLAT EXISTE » N'EST PAS « LA PORTION EST CALCULÉE ».
  assert(d.platsPresents > d.portionsCalculees);
  // ⛔ ET LE DÉNOMINATEUR ATTENDU NE RÉTRÉCIT PAS: une portion absente reste
  // comptée absente. `>=` et pas `>`: les deux sont égaux depuis que la seule
  // portion illisible de ce plan a retrouvé son aliment.
  assert(d.portionsCalculees >= d.portionsMesurables);
});

Deno.test("⑤ une portion absente reste dans le dénominateur attendu", async () => {
  const fx = await fixtures();
  const plan = planDe(fx, GAIN);
  const b = boucheDuContexte(fx.contextes.find((c) => String(c.plan_id) === GAIN)!);
  const index = (await troisIndex(fx, plan)).relecture.index;
  const croise = croiser({
    bouche: b,
    contrats: contratsParCase(b),
    plan,
    portions: mesurerPortions({ index, plan }),
  });
  assertEquals(croise.cases.length, 7, "les 7 cases demandées sont rendues");
  assertEquals(croise.cases.filter((c) => c.portion === null).length, 1);
  const jours = journeesParPortions(croise.cases);
  assertEquals(jours.map((j) => j.casesAttendues), [1, 3, 3]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LES QUATRE ÉTATS — et jamais « 100 % vérifié » depuis la présence de `ref`
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑥ la présence de `ref` et l'état de la référence restent deux comptes", async () => {
  const fx = await fixtures();
  const plan = planDe(fx, GAIN);
  const index = (await troisIndex(fx, plan)).relecture.index;
  const c = censusDesReferences(index, plan);
  // Le modèle a écrit `ref` sur TOUTES les lignes…
  assertEquals(c.refEcritParLeModele.avecRef, c.refEcritParLeModele.lignes);
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT A (2026-09-11) — LES DEUX INGRÉDIENTS NON MESURABLES ONT DISPARU.
  // ══════════════════════════════════════════════════════════════════════════
  // AVANT: 49 « ref » sur 49 lignes, et pourtant `petits suisses nature` et
  // `pita complete` ne se mesuraient pas — parce que la mesure repartait du
  // libellé. C'était la preuve que la présence de `ref` n'est pas un taux de
  // vérification.
  // APRÈS: les deux se mesurent, sur les références que le modèle avait déjà
  // choisies. Le compteur de présence reste malgré tout SÉPARÉ de l'état: un
  // « ref » écrit peut viser une ligne `a_verifier`, et c'est l'assertion de
  // somme ci-dessous qui garde la distinction.
  assertEquals(c.parEtat.ingredient_non_mesurable, 0);
  assertEquals(c.noms.ingredient_non_mesurable, []);
  const somme = c.parEtat.reference_verifiee + c.parEtat.estimation_de_groupe +
    c.parEtat.en_attente_de_validation + c.parEtat.ingredient_non_mesurable;
  assertEquals(somme, c.lignes, "les quatre états couvrent toutes les lignes");
  // ⛔ LE CAS QUI DOIT MORDRE. Un « ref » écrit mais INVENTÉ ne redevient jamais
  // mesurable par son libellé: sans cette assertion, ce test ne dirait plus que
  // « tout va bien », et une garde sans cas qui mord ressemble trait pour trait
  // à une garde qui marche.
  const faux = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
  const platsFaux = faux.dishes as Record<string, unknown>[];
  for (const d of platsFaux) {
    for (const ing of (d.ingredients ?? []) as Record<string, unknown>[]) {
      if (String(ing.term ?? "") === "petits-suisses nature") ing.ref = "petit_suisse_INVENTE";
    }
  }
  const cFaux = censusDesReferences(index, faux);
  assertEquals(cFaux.parEtat.ingredient_non_mesurable, 1);
  assertEquals(cFaux.noms.ingredient_non_mesurable, ["petits suisses nature"]);
});

Deno.test("⑥ une référence non vérifiée est NOMMÉE, pas fondue dans les vérifiées", async () => {
  const fx = await fixtures();
  const plan = planDe(fx, PERTE);
  const index = (await troisIndex(fx, plan)).relecture.index;
  const c = censusDesReferences(index, plan);
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT A (2026-09-11) — LA LIGNE DU SAS A DISPARU, ET C'EST LE LOT.
  // ══════════════════════════════════════════════════════════════════════════
  // AVANT: 46 vérifiées + 1 `en attente de validation`, nommée
  // `whole_wheat_pita_bread` — une ligne que le sas avait fabriquée à partir
  // d'une ESTIMATION MODÈLE (258 kcal/100 g) parce que « pita complète » n'a
  // pas d'alias français. APRÈS: la ligne se résout sur `pita_wholemeal`
  // (265 kcal/100 g, `manual`, `verifie`), l'identifiant que le modèle avait
  // écrit. 47 vérifiées, 0 en attente.
  assertEquals(c.parEtat.en_attente_de_validation, 0);
  assertEquals(c.noms.en_attente_de_validation, []);
  assertEquals(c.parEtat.reference_verifiee, 47);
  // ⛔ LE CAS QUI DOIT MORDRE. L'état se lit sur la LIGNE atteinte, jamais sur
  // « il y avait un ref ». En pointant une ligne d'ingrédient sur un slug que
  // le manifeste REFUSE à la composition — un des 23 que l'index de génération
  // retire — le compteur doit se rallumer, et la ligne rester MESURABLE (la
  // porte de validation vaut à la composition, pas à la relecture).
  //
  // ⚠️ ET PAS `whole_wheat_pita_bread`: ce slug-là n'est plus dans l'index de
  // RELECTURE. `indexForReading` ne fusionne le sas que pour les termes
  // inconnus, et depuis le lot A ce plan n'en a plus aucun — il demande 0. Un
  // identifiant absent de l'index est refusé, pas « en attente ».
  const refusee = (await troisIndex(fx, plan)).generation.refusees[0];
  assert(typeof refusee === "string" && refusee.length > 0, "il faut une ligne a_verifier");
  const viaNonVerifiee = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
  for (const d of (viaNonVerifiee.dishes ?? []) as Record<string, unknown>[]) {
    for (const ing of (d.ingredients ?? []) as Record<string, unknown>[]) {
      if (String(ing.term ?? "") === "pita complète") ing.ref = refusee;
    }
  }
  const cNV = censusDesReferences(index, viaNonVerifiee);
  assertEquals(cNV.parEtat.en_attente_de_validation, 1);
  assertEquals(cNV.noms.en_attente_de_validation, [refusee]);
  assertEquals(cNV.parEtat.ingredient_non_mesurable, 0, "elle reste MESURABLE");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ LA PROSE PÉRIMÉE — mesurée par égalité de chaînes, sans matcher
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑨ la prose périmée se compte contre la réponse brute, sans lire un mot", async () => {
  const fx = await fixtures();
  const plan = planDe(fx, PERTE);
  const brute = JSON.parse(String(
    fx.echanges.find(
      (e) => String(e.source) === "generate-household-meal-v1" &&
        String(e.outcome) === "text" &&
        String(e.request_id) === "f5a3dd19-d47d-4f52-9678-536f2cfb3bc5",
    )!.output_text,
  ));
  const q = censusDesQuantites(plan, brute);
  assertEquals(q.lignesRapprochees, 47);
  assertEquals(q.lignesNonRapprochees, []);
  assertEquals(q.amountChangeProsePerimee.length, 29);
  // L'exemple nommé par la revue : 458,66 g calculés, « 360 g » affichés.
  const poulet = q.amountChangeProsePerimee.find((e) =>
    e.unite === "préparation prep_chicken" && e.ligne === "cuisses de poulet désossées"
  )!;
  assertAlmostEquals(poulet.amountPersiste!, 458.66, 0.01);
  assertEquals(poulet.prose, "360 g de cuisses de poulet désossées");
  // ⛔ SANS RÉPONSE BRUTE, ON NE DIT RIEN — on ne devine pas la prose.
  assertEquals(censusDesQuantites(plan, null).lignesRapprochees, 0);
  assertEquals(censusDesQuantites(plan, null).amountChangeProsePerimee.length, 0);
});

Deno.test("⑨ la prose RÉÉCRITE ne compte pas comme périmée", async () => {
  const fx = await fixtures();
  const plan = planDe(fx, GAIN);
  const brute = JSON.parse(String(
    fx.echanges.find(
      (e) => String(e.source) === "generate-household-meal-v1" &&
        String(e.outcome) === "text" &&
        String(e.request_id) === "ecaf04b2-354e-460f-b6c5-df81b54c5640",
    )!.output_text,
  ));
  const q = censusDesQuantites(plan, brute);
  assert(q.amountChangeProseSuivie > 0, "certaines lignes ONT été resynchronisées");
  assert(q.amountChangeProsePerimee.length > 0, "et d'autres non");
  // Les lentilles : le texte du grammage a suivi, celui de l'huile est resté.
  const huile = q.amountChangeProsePerimee.find((e) =>
    e.unite === "préparation prep_lentils" && e.ligne === "huile d’olive"
  )!;
  assertAlmostEquals(huile.amountPersiste!, 0.770, 0.001);
  assertEquals(huile.prose, "2 cuillères à soupe d’huile d’olive");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · LOT C — CE QUE LA FINALISATION FERME, ET CE QU'ELLE NE TOUCHE PAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT C — les 64 lignes périmées se ferment, et la FIXTURE ne bouge pas", async () => {
  const fx = await fixtures();
  let avant = 0;
  let apres = 0;
  for (const id of [PERTE, GAIN]) {
    const plan = planDe(fx, id);
    // ⛔ L'EMPREINTE DU PLAN, AVANT ET APRÈS LA MESURE. Si l'instrument
    // finalisait le plan EN PLACE au lieu d'une copie, il détruirait la preuve
    // qu'il existe pour conserver — et tous les comptes du lot 0 deviendraient
    // faux, en silence.
    const empreinte = JSON.stringify(plan);
    const m = await mesurerUnPlan(fx, plan);
    assertEquals(JSON.stringify(plan), empreinte, "la fixture a été MUTÉE");
    avant += m.quantites.amountChangeProsePerimee.length;
    apres += m.quantitesApresLotC.amountChangeProsePerimee.length;
  }
  // Les 29 + 35 du lot 0, et leur fermeture.
  assertEquals(avant, 64);
  assertEquals(apres, 0);
});

Deno.test("⛔ LOT C — le contrôle ⑨ d'ORIGINE, lui, n'a pas bougé d'un chiffre", async () => {
  // ⚠️ LE CAS QUI MORD DU TEST PRÉCÉDENT. `quantites` est la mesure de CE QUI
  // EST EN BASE le 2026-09-11: c'est une preuve à préserver, et la voir tomber
  // à zéro voudrait dire que quelqu'un a fait mesurer l'instrument sur la copie
  // finalisée — donc qu'il a cessé de décrire le défaut.
  const fx = await fixtures();
  const perte = await mesurerUnPlan(fx, planDe(fx, PERTE));
  const gain = await mesurerUnPlan(fx, planDe(fx, GAIN));
  assertEquals(perte.quantites.amountChangeProsePerimee.length, 29);
  assertEquals(gain.quantites.amountChangeProsePerimee.length, 35);
  // Et les deux lignes nommées par la revue sont toujours listées.
  const poulet = perte.quantites.amountChangeProsePerimee.find((e) =>
    e.unite === "préparation prep_chicken" && e.ligne === "cuisses de poulet désossées"
  )!;
  assertEquals(poulet.prose, "360 g de cuisses de poulet désossées");
  assertAlmostEquals(poulet.amountPersiste!, 458.66, 0.01);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · LOT B — UN COULOIR ÉLARGI NE FABRIQUE PAS UNE CONFORMITÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — l'instrument NOMME les portions « dans le couloir » mais loin de la visée", async () => {
  // ⛔ LE PIÈGE QUE CECI FERME, ET C'EST CELUI QUE LE LOT 0 EXISTE POUR
  // EMPÊCHER. Les dîners de ces deux plans ont été composés sous la consigne du
  // 2026-09-11 — celle qui disait 250. Le lot B élargit leur couloir à
  // [123–250] ; ils « rentrent » donc SANS QU'UN SEUL GRAMME AIT BOUGÉ. Un
  // instrument qui se contenterait d'imprimer « ✅ dans le couloir » serait
  // devenu plus optimiste sans que le moteur soit meilleur.
  const fx = await fixtures();
  const m = await mesurerUnPlan(fx, planDe(fx, PERTE));
  const texte = rendre(m);
  assert(
    texte.includes("MAIS À PLUS DE 50 % DE LA VISÉE"),
    "l'instrument ne dit plus l'écart à la visée",
  );
  assert(texte.includes("241 servis pour une visée de 135"), texte);
  // ⛔ ET LA COLONNE « ARCHIVE » GARDE LA PREUVE DU DÉFAUT.
  assert(texte.includes("[250–250] aim 250 above_askable_cap reçu"), texte);
  // ⚠️ LE CAS QUI PASSE: un petit-déjeuner servi à 111 pour une visée de 110
  // n'est PAS nommé — sinon l'avertissement sortirait partout et cesserait
  // d'être lu.
  assert(!texte.includes("111 servis pour une visée de 110"), texte);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · C0 — UN BANC FIDÈLE À LA DEMANDE ET À CHAQUE PERSONNE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CES TESTS GARDENT. Le banc du lot F mentait, et dans le sens
// rassurant. Chacun des quatre défauts a ici SON test, avec un cas qui passe et
// un cas qui mord — « une garde qui n'a que des cas qui passent est une garde à
// moitié armée ».
//
// ⚠️ LES FIXTURES SONT CELLES DES TIRS RÉELS DU 2026-09-11, gelées par
// `scratchpad/2026-09-11-CLOTURE/figer-demande.ts`. Elles portent la demande,
// le prompt réellement envoyé, le premier jet, les réparations, le journal du
// run et la ligne écrite. Rien n'y est rejoué, rien n'y est facturé.

const C0 = fromFileUrl(
  new URL("../scratchpad/2026-09-11-CLOTURE/fixtures", import.meta.url),
);

async function c0(nom: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Deno.readTextFile(`${C0}/${nom}.json`)) as Record<
    string,
    unknown
  >;
}

/** Le même montage que `analyse-lot-F.ts`, sur une fixture gelée. */
async function fixturesC0(
  gele: Record<string, unknown>,
): Promise<{ fx: Fixtures; ligne: Record<string, unknown> }> {
  const base = await fixtures();
  const ligne = gele.ligne_ecrite as Record<string, unknown>;
  const etapes = (gele.etapes ?? {}) as Record<string, unknown>;
  const echanges: Record<string, unknown>[] = [];
  if (typeof etapes.prompt_envoye === "string") {
    echanges.push({
      request_id: String(gele.request_id),
      source: "generate-household-meal-v1",
      user_message: etapes.prompt_envoye,
    });
  }
  if (typeof etapes.premier_jet === "string") {
    echanges.push({
      request_id: String(gele.request_id),
      source: "generate-household-meal-v1",
      outcome: "text",
      output_text: etapes.premier_jet,
    });
  }
  return {
    fx: {
      ...base,
      plans: [ligne],
      contextes: [contexteDeLaDemande(gele)],
      echanges,
      journaux: (gele.journal ?? []) as Record<string, unknown>[],
    },
    ligne,
  };
}

// ── ① LA GRILLE VIENT DE LA DEMANDE ──────────────────────────────────────

Deno.test("C0 ① — une case volontairement retirée reste ATTENDUE et se compte absente", async () => {
  const gele = await c0("c0-tir3");
  const { fx, ligne } = await fixturesC0(gele);
  // On retire `sun/dinner` du plan écrit — le plat ET sa portion.
  const ampute = structuredClone(ligne);
  const avant = (ampute.dishes as Record<string, unknown>[]).length;
  ampute.dishes = (ampute.dishes as Record<string, unknown>[])
    .filter((d) => !(String(d.day) === "sun" && String(d.slot) === "dinner"));
  assertEquals((ampute.dishes as unknown[]).length, avant - 1, "un seul plat retiré");
  const fx2: Fixtures = { ...fx, plans: [ampute] };
  const m = await mesurerUnPlan(fx2, ampute);
  // ⛔ LE POINT DU TEST : 6 cases restent ATTENDUES, et la case retirée est
  // NOMMÉE. Le banc du lot F construisait `casesParJour` en bouclant sur
  // `ligne.dishes` : il aurait rendu 5 attendues sur 5 plats, c'est-à-dire une
  // couverture parfaite sur un plan amputé.
  assertEquals(m.denominateurs.casesAttendues, 6);
  assertEquals(m.denominateurs.platsPresents, 5);
  assertEquals(m.denominateurs.casesSansPlat, ["sun/dinner"]);
  const f = troisFamilles(m);
  assertEquals(f.conformiteComplete.sur, 6);
  assertEquals(f.conformiteComplete.conformes, 5);
  assert(
    f.conformiteComplete.manquants.some((x) => x.includes("aucun plat")),
    f.conformiteComplete.manquants.join(" | "),
  );
  // ── LE CAS QUI MORD : la règle d'AVANT, rejouée ici et nulle part ailleurs.
  // ⛔ Elle vit dans le test pour que « le défaut ① est fermé » soit
  // VÉRIFIABLE : sans elle, l'affirmation porterait sur du code supprimé.
  const grilleDeduiteDesPlats = new Set(
    (ampute.dishes as Record<string, unknown>[]).map((d) => `${d.day}/${d.slot}`),
  );
  assertEquals(grilleDeduiteDesPlats.size, 5, "l'ancienne règle rendait 5 cases attendues");
  assert(
    grilleDeduiteDesPlats.size !== m.denominateurs.casesAttendues,
    "les deux règles doivent DIVERGER, sinon ce test ne prouve rien",
  );
});

Deno.test("C0 ① — sans demande figée, le contexte n'a aucune grille à inventer", () => {
  // ⚠️ LA CONTRE-ÉPREUVE DE LA GARDE : `contexteDeLaDemande` ne va JAMAIS
  // chercher les plats. Une demande vide rend une grille vide — bruyamment
  // fausse — au lieu d'une grille taillée sur la sortie, silencieusement juste.
  const ctx = contexteDeLaDemande({
    demande: { bouches: [{ member_id: "m1" }], cases_par_bouche: {}, jours: [] },
    ligne_ecrite: {
      id: "p1",
      dishes: [{ day: "sat", slot: "lunch" }, { day: "sat", slot: "dinner" }],
    },
  });
  const membres = ctx.members as Record<string, unknown>[];
  assertEquals(membres[0].cases_par_jour, {});
});

// ── ② L'APPÉTIT RÉEL, ET LA RECTIFICATION DU RAPPORT ─────────────────────

Deno.test("C0 ② — GRAND APPÉTIT : le couloir du petit-déjeuner vaut [91–223], pas [100–…]", async () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LA RECTIFICATION DU RAPPORT DES SIX TIRS, ÉPINGLÉE ICI.
  // ══════════════════════════════════════════════════════════════════════
  // Le § 6.1 annonce « 34 cases sur 36 dans leur couloir, les deux qui n'y sont
  // pas sont des petits-déjeuners du tir 3 à 94 et 99 pour un plancher de
  // 100 ». C'EST FAUX. `analyse-lot-F.ts` forçait `appetite: "average"` ; avec
  // l'appétit RÉEL (`large`), `plateBoundsFor` puis `densityCorridorFor`
  // rendent 91. 94 et 99 sont DANS leur couloir.
  const gele = await c0("c0-tir3");
  const { fx, ligne } = await fixturesC0(gele);
  const m = await mesurerUnPlan(fx, ligne);
  assertEquals(m.bouche.appetite, "large", "la fixture doit porter l'appétit réel");
  const petitDej = m.cases.filter((c) => c.slot === "breakfast");
  assertEquals(petitDej.length, 2);
  for (const c of petitDej) {
    assertEquals(c.contrat!.couloirTransmis!.min, 91);
    assertEquals(c.contrat!.couloirTransmis!.max, 223);
    assertEquals(c.contrat!.couloirTransmis!.pref, 100);
    assertEquals(c.densiteDansLeCouloir, true, `${c.date} ${c.slot}`);
  }
  assertEquals(
    petitDej.map((c) => Math.round(c.densiteMesuree!)),
    [94, 99],
    "les deux densités du rapport, inchangées",
  );
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · ÉTAPE C4 — CE TEST A CHANGÉ DE VERDICT, ET C'EST LE
  //                CORRECTIF QU'IL ÉPINGLE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ IL ASSERTAIT `fragmentIdentique === true` ET LA PHRASE « up to 223 ».
  // C'était vrai le 2026-09-11, et c'était le DÉFAUT DE CONTRAT que l'étape C0
  // a nommé : `redundantMin` valait `!(min > plancher)`, donc VRAI pour un
  // minimum SOUS le plancher, donc le 91 ne sortait pas. Le modèle ne lisait
  // que « a normal dish carries at least 100 » pendant que la garde acceptait
  // 91 — la consigne promettait plus que le contrat.
  //
  // ⛔ LE COULOIR N'A PAS BOUGÉ D'UN POINT (les quatre assertions ci-dessus le
  // prouvent) : le plan de clôture interdit de « réparer ces recettes sur la
  // base du faux seuil de 100 ». C'est la PHRASE qui s'est alignée sur le
  // contrat, pas le contrat sur la phrase.
  const archive = String(
    (await fixturesC0(gele)).fx.echanges.find(
      (e: Record<string, unknown>) =>
        String(e.source) === "generate-household-meal-v1" &&
        typeof e.user_message === "string",
    )?.user_message ?? "",
  );
  assert(
    archive.includes("up to 223 kcal per 100 g at breakfast (aim 100, not 129)"),
    "le prompt ARCHIVÉ taisait le 91 — c'est le défaut mesuré",
  );
  assert(
    m.fragmentRefait.includes("91 to 223 kcal per 100 g at breakfast (aim 100, not 129)"),
    m.fragmentRefait,
  );
  // ⛔ ET LA DIFFÉRENCE EST EXACTEMENT LÀ. `fragmentIdentique` compare la phrase
  // que le moteur produit AUJOURD'HUI au prompt de la campagne : elle ne peut
  // plus être identique, et si elle l'était le correctif serait débranché.
  assertEquals(
    m.fragmentIdentique,
    false,
    "la phrase d'aujourd'hui dit le 91 ; celle du 2026-09-11 le taisait",
  );
});

Deno.test("C0 ② — le cas qui MORD : `average` imposé fabrique les deux fausses violations", async () => {
  // ⚠️ SANS CE TEST, « le couloir vaut 91 » serait une affirmation sur du code
  // retiré. Ici l'ancien comportement est REJOUÉ — appétit écrasé à `average` —
  // et il rend bien 100, donc deux cases « hors couloir » qui n'existent pas.
  const gele = await c0("c0-tir3");
  const { fx, ligne } = await fixturesC0(gele);
  const ctxFaux = structuredClone(fx.contextes[0]) as Record<string, unknown>;
  for (const b of ctxFaux.member_bodies as Record<string, unknown>[]) {
    b.appetite = "average";
  }
  const m = await mesurerUnPlan({ ...fx, contextes: [ctxFaux] }, ligne);
  const petitDej = m.cases.filter((c) => c.slot === "breakfast");
  for (const c of petitDej) {
    assertEquals(c.contrat!.couloirTransmis!.min, 100, "l'ancien banc rendait 100");
    assertEquals(c.densiteDansLeCouloir, false, "…donc deux fausses violations");
  }
  // ⛔ ET LA PHRASE REFABRIQUÉE NE SE RETROUVE PLUS DANS LE PROMPT ARCHIVÉ :
  // c'est le garde-fou qui aurait dû rougir le 2026-09-11 et que personne
  // n'avait armé sur les tirs de campagne.
  assertEquals(m.fragmentIdentique, false);
});

// ── ② TOUTES LES BOUCHES ─────────────────────────────────────────────────

Deno.test("C0 ② — foyer de deux : DOUZE parts attendues, douze mesurées, deux contrats", async () => {
  const gele = await c0("c0-tir6");
  const { fx, ligne } = await fixturesC0(gele);
  const d = gele.demande as Record<string, unknown>;
  assertEquals(d.cases_attendues_total, 12);
  const paul = await mesurerUnPlan(fx, ligne, { rang: 0 });
  const lea = await mesurerUnPlan(fx, ligne, { rang: 1 });
  assertEquals(paul.bouche.prenom, "Paul");
  assertEquals(lea.bouche.prenom, "Lea");
  // ⛔ CHAQUE BOUCHE NE VOIT QUE SES CONTENANTS. Avant C0, `croiser` indexait
  // les portions par `jour/moment` seul : le contenant de Lea écrasait celui de
  // Paul, et « 12 parts présentes » se publiait « 6 conformes sur 6 ».
  assertEquals(paul.denominateurs.portionsAutresBouches, 6);
  assertEquals(lea.denominateurs.portionsAutresBouches, 6);
  assertEquals(paul.denominateurs.portionsMesurables, 6);
  assertEquals(lea.denominateurs.portionsMesurables, 6);
  // ⛔ ET LEURS CIBLES DIFFÈRENT : un foyer n'a pas un besoin, il en a deux.
  const cible = (m: typeof paul, slot: string) =>
    m.cases.find((c) => c.slot === slot)!.contrat!.cibleCaseKcal!;
  assert(
    cible(paul, "breakfast") > cible(lea, "breakfast"),
    `${cible(paul, "breakfast")} contre ${cible(lea, "breakfast")}`,
  );
  // 12 parts mesurées, et le total ne se lit pas « 6 ».
  const total = troisFamilles(paul).conformiteComplete.sur +
    troisFamilles(lea).conformiteComplete.sur;
  assertEquals(total, 12);
});

Deno.test("C0 — une bouche SANS objectif reçoit l'ENTRETIEN de sa fiche, pas un NaN", async () => {
  // ⛔ LE DÉFAUT TROUVÉ EN MESURANT LE TIR 6, ET IL ACCUSE. Lea n'a aucun
  // objectif ; `envelopeFor("")` rendait `proteinFloorG: NaN`, et le rendu
  // imprimait « ❌ SOUS LE PLANCHER COUVERT (−NaN %) » sur ses deux journées.
  // Un verdict d'échec fabriqué depuis un NaN est pire qu'une abstention.
  //
  // ⟳ 2026-09-13 · § 2.3 — ET L'ABSTENTION ÉTAIT ELLE AUSSI FAUSSE. Le produit
  // ne se tait pas devant cette bouche : sans compte, elle descend sur
  // `maintenanceEnvelopeFromBody`, qui ne demande AUCUN objectif. 58 kg à
  // 1,6 g/kg ⇒ 93 g/jour. Le prompt archivé du 2026-09-13 le montre en toutes
  // lettres pour une Lea au goal nul (`gain-p2apres`, « 23 g … 37 g … 33 g »).
  // Ce qui reste vrai du défaut d'origine : on n'entre jamais dans
  // `envelopeFor("")`, donc aucun NaN ne sort.
  const gele = await c0("c0-tir6");
  const { fx, ligne } = await fixturesC0(gele);
  const lea = await mesurerUnPlan(fx, ligne, { rang: 1 });
  assertEquals(lea.bouche.goal, "");
  assertEquals(lea.bouche.aUnCompte, false);
  assertEquals(lea.proteine.plancher?.proteinFloorG, 93);
  assertEquals(lea.proteine.plancher?.branche, "fiche_entretien");
  // ⛔ AUCUN PLANCHER PAR REPAS : il n'existe que pour `muscle_gain` et les
  // 60 ans et plus. Une fiche n'achetant qu'un entretien, il ne peut pas
  // apparaître — et s'il apparaissait, c'est que l'objectif de la fiche aurait
  // traversé.
  assertEquals(lea.proteine.plancher?.proteinPerMealG, null);
  const texte = rendre(lea);
  assert(!texte.includes("NaN"), "aucun NaN ne doit sortir du rendu");
  // ⛔ LA PHRASE D'AVANT NE DOIT PLUS SORTIR : « aucun objectif déclaré ⇒ aucun
  // plancher » est exactement ce que le produit contredit.
  assert(
    !texte.includes("AUCUN OBJECTIF DÉCLARÉ"),
    "la devinette par l'objectif ne doit plus décider de l'abstention",
  );
  assert(texte.includes("n'achète aucun objectif"), texte.slice(0, 600));
  // ── LE CAS QUI PASSE : Paul, lui, a un COMPTE, et son objectif s'applique.
  const paul = await mesurerUnPlan(fx, ligne, { rang: 0 });
  assertEquals(paul.bouche.aUnCompte, true);
  assertEquals(paul.proteine.plancher?.proteinFloorG, 176);
  assertEquals(paul.proteine.plancher?.branche, "compte");
});

Deno.test("§2.3 — le banc et le prompt archivé disent le MÊME plancher à Lea", async () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LE DÉFAUT DE § 2.3, ET IL EST DANS L'INSTRUMENT, PAS DANS LE MOTEUR.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Le banc fabriquait `latestWeight: {value: poidsDeLaFiche}` et appelait
  // `envelopeFor(b.goal, …)`. La production ne fait ça NULLE PART pour une
  // bouche sans compte : `household_bodies.ts` pose `latestWeight: null`, et
  // l'appelant refuse l'enveloppe de compte quand `!m.userId`. Résultat mesuré
  // sur Lea (58 kg, `fat_loss` écrit sur sa FICHE, aucun compte) :
  // l'instrument annonçait **116 g/jour** (2,0 g/kg), le produit en dit **93**
  // (1,6 g/kg d'entretien).
  //
  // ⛔ ET LA RÉFÉRENCE N'EST PAS UNE OPINION : elle est lue dans le PROMPT
  // ARCHIVÉ de la fixture, c'est-à-dire dans ce que le moteur a réellement
  // envoyé. Si le banc bouge, ou si le moteur bouge, l'égalité tombe.
  const gele = await c0("lot3b-reference");
  const { fx, ligne } = await fixturesC0(gele);
  const lea = await mesurerUnPlan(fx, ligne, { rang: 1 });
  assertEquals(lea.bouche.prenom, "Lea");
  assertEquals(lea.bouche.aUnCompte, false);
  assertEquals(lea.bouche.goal, "fat_loss");
  assertEquals(lea.proteine.plancher?.branche, "fiche_entretien");

  // ── ① LE NOMBRE DU PROMPT, EXTRAIT DE LA CARTE DE CETTE BOUCHE ──────────
  const etapes = JSON.stringify(gele.etapes ?? {});
  const debut = etapes.indexOf(`== ${lea.bouche.prenom} (${lea.bouche.memberId}) ==`);
  assert(debut >= 0, "la carte de Lea doit exister dans le prompt archivé");
  const carte = etapes.slice(debut, debut + 900);
  const ligneProt = carte.split("\\n").find((x) => x.includes("one serving here carries"));
  assert(
    ligneProt !== undefined,
    "le prompt archivé doit porter une ligne protéique pour Lea",
  );
  const duPrompt = [...ligneProt!.matchAll(/(\d+) g (?:of protein )?in the/g)]
    .map((m) => Number(m[1]));
  assertEquals(duPrompt.length, 3, ligneProt);
  const sommeDuPrompt = duPrompt.reduce((a, n) => a + n, 0);
  assertEquals(sommeDuPrompt, 93);
  assertEquals(lea.proteine.plancher?.proteinFloorG, sommeDuPrompt);

  // ── ② LA RÉPARTITION AUSSI, CASE PAR CASE ──────────────────────────────
  // ⛔ `proteinBriefFor` EST LA FONCTION DU PRODUIT, appelée sur les contrats
  // que l'instrument reconstruit. Un plancher journalier juste réparti de
  // travers servirait quand même une consigne fausse au modèle.
  const set = contratRepare(lea.bouche).set;
  type Contrat = (typeof set.contracts)[number];
  const parJour = new Map<string, Contrat[]>();
  for (const c of set.contracts) {
    const l = parJour.get(c.date) ?? [];
    l.push(c);
    parJour.set(c.date, l);
  }
  const brief = proteinBriefFor({
    memberId: lea.bouche.memberId,
    dayFloorG: lea.proteine.plancher!.proteinFloorG,
    perMealFloorG: lea.proteine.plancher!.proteinPerMealG,
    abstention: "none",
    days: [...parJour].map(([date, contracts]) => ({
      date,
      dayToken: contracts[0].dayToken,
      dayTargetKcal: contracts[0].dayTargetKcal,
      coveredBudgetGrossKcal: contracts[0].coveredBudgetGrossKcal,
      fixedProteinG: null,
      sideProteinG: 0,
      slots: contracts.map((c) => ({ slot: c.slot, composeKcal: c.composeKcal })),
    })),
  });
  assertEquals(brief.slots.map((s) => s.gramsPerServing), duPrompt);

  // ── ③ LE CAS QUI MORD : le barème de l'objectif ne doit PAS reparaître ──
  // 58 kg × 2,0 g/kg = 116. C'est le nombre que le banc rendait, et il n'a
  // jamais existé côté produit pour cette bouche.
  assert(
    lea.proteine.plancher!.proteinFloorG !== 116,
    "le barème `fat_loss` d'une FICHE serait le défaut de § 2.3, revenu",
  );
  // ── ④ ET LA BOUCHE AVEC COMPTE NE BOUGE PAS ────────────────────────────
  const max = await mesurerUnPlan(fx, ligne, { rang: 0 });
  assertEquals(max.bouche.aUnCompte, true);
  assertEquals(max.proteine.plancher?.branche, "compte");
  assertEquals(max.proteine.plancher?.proteinFloorG, 99);
  assertEquals(max.proteine.plancher?.proteinPerMealG, 33);
});

Deno.test("§2.3 — un ÂGE INCONNU n'a pas de plancher, et le dit", async () => {
  // ⛔ NI ADULTE NI ENFANT ⇒ AUCUNE ÉQUATION. `mouthEnvelope` rend `null` pour
  // `ageState: "unknown"`, et les deux équations donnent des résultats très
  // différents sur le même poids. L'instrument rendait 102 g/jour pour Iris
  // (64 kg × 1,6) en traversant `envelopeFor` avec la bande d'âge — c'est-à-dire
  // qu'il PRÊTAIT une cible que le moteur n'a jamais servie à cette bouche.
  //
  // ⚠️ ET L'ABSENCE EST NOMMÉE, PAS TUE : « NON APPLICABLE », jamais un zéro et
  // jamais un succès.
  const gele = await c0("lot1-age-inconnu");
  const { fx, ligne } = await fixturesC0(gele);
  const iris = await mesurerUnPlan(fx, ligne, { rang: 3 });
  assertEquals(iris.bouche.prenom, "Iris");
  assertEquals(iris.bouche.ageState, "unknown");
  // ⛔ ELLE PORTE POURTANT UN OBJECTIF SUR SA FICHE, ET IL RESTE INERTE.
  assertEquals(iris.bouche.goal, "muscle_gain");
  assertEquals(iris.proteine.plancher, null);
  assertEquals(iris.proteine.branche, "age_inconnu");
  const texte = rendre(iris);
  assert(texte.includes("ÂGE INCONNU"), texte.slice(0, 400));
  assert(texte.includes("NON APPLICABLE"), "l'absence doit se dire, pas se taire");
  assert(!texte.includes("plancher applicable"), texte.slice(0, 400));
  // ── LE CAS QUI PASSE : la MÊME bouche, âge renseigné, a bien une cible.
  // Même prénom, même corps, même objectif de fiche : seule la date de
  // naissance change d'une fixture à l'autre.
  const avecAge = await c0("lot2-ref4-c0");
  const f2 = await fixturesC0(avecAge);
  const irisDatee = await mesurerUnPlan(f2.fx, f2.ligne, { rang: 3 });
  assertEquals(irisDatee.bouche.ageState, "adult");
  assertEquals(irisDatee.proteine.branche, "fiche_entretien");
  assertEquals(irisDatee.proteine.plancher?.proteinFloorG, 102);
  // ⛔ ET PAS DE PLANCHER PAR REPAS : `muscle_gain` écrit sur une fiche
  // n'achète rien. S'il reparaissait, l'objectif aurait traversé.
  assertEquals(irisDatee.proteine.plancher?.proteinPerMealG, null);

  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LE CAS QUI MORD SUR LA **PORTE**, ET PAS SUR LE CORPS
  // ══════════════════════════════════════════════════════════════════════
  //
  // L'Iris de `lot1-age-inconnu` n'a NI `age_state` NI date de naissance :
  // DEUX causes d'absence à la fois. Un contrôle qui s'arrête là reste vert
  // même si `mouthEnvelope` cessait de refuser l'âge inconnu — l'enveloppe
  // tomberait de toute façon, faute de bande d'âge. Mesuré : forcer
  // `ageState: "adult"` dans l'appel ne faisait rougir aucun test.
  //
  // On reprend donc la bouche DATÉE — même corps, même poids, même objectif de
  // fiche — et on ne change QU'UN champ.
  const sansEtat = { ...irisDatee.bouche, ageState: "unknown" as const };
  assertEquals(enveloppeDeLaBouche(sansEtat, "2026-09-14").env, null);
  assertEquals(enveloppeDeLaBouche(sansEtat, "2026-09-14").branche, "age_inconnu");
  assertEquals(plancherProteine(sansEtat, "2026-09-14"), null);
  // Et le témoin, à un champ près : la même bouche, son état réel.
  assertEquals(
    plancherProteine(irisDatee.bouche, "2026-09-14")?.proteinFloorG,
    102,
  );
});

// ── ③ LES CONTEXTES SPÉCIFIQUES ──────────────────────────────────────────

Deno.test("C0 ③ — un apport fixe écrit dans une colonne NON LUE ne déplace aucune cible", async () => {
  // ⛔ LE DÉFAUT ④ DU RAPPORT DES SIX TIRS, MESURÉ AU LIEU D'ÊTRE RACONTÉ.
  // Le 2026-09-11, `keel_household_set_member_fixed_intakes` écrivait
  // `household_members.fixed_intakes` pour TOUT LE MONDE ;
  // `household_fixed_intakes.ts` ne lisait cette colonne QUE pour une bouche
  // SANS compte. Le titulaire du tir 5 a donc déclaré 200 g de yaourt grec que
  // le moteur n'a jamais retranchés.
  //
  // ⟳ 2026-09-12 · ÉTAPE C1 — LA PORTE EST RÉPARÉE (migration `20260912090000`:
  // elle ROUTE vers `student_goals` pour une bouche avec compte) et le LECTEUR
  // a désormais un repli documenté et compté (`legacyFallback`). ⛔ CE CAS-CI
  // NE CHANGE PAS POUR AUTANT: il mesure la FIXTURE GELÉE du 2026-09-11,
  // c'est-à-dire l'état réel au moment du tir. Le réécrire effacerait la preuve
  // du défaut au lieu de la conserver — et l'instrument, lui, modélise
  // volontairement la source lue, sans repli.
  const gele = await c0("c0-tir5");
  const bouche = (gele.demande as Record<string, unknown>).bouches as
    Record<string, unknown>[];
  const orpheline = bouche[0].fixed_intakes_colonne_orpheline as unknown[];
  assertEquals(orpheline.length, 1, "la ligne EST en base");
  assertEquals((bouche[0].fixed_intakes as unknown[]).length, 0, "…et la source lue est vide");
  const { fx, ligne } = await fixturesC0(gele);
  const m = await mesurerUnPlan(fx, ligne);
  assertEquals(m.apportsFixes.declares, 0);
  const petitDej = m.cases.find((c) => c.slot === "breakfast")!;
  assertAlmostEquals(petitDej.contrat!.cibleCaseKcal!, 613.5, 0.01);

  // ── LE CAS QUI MORD : la MÊME déclaration, dans la source canonique.
  // ⛔ Sans lui, « l'instrument lit les apports fixes » serait invérifiable :
  // un lecteur débranché rendrait exactement le même 613,50.
  const ctx = structuredClone(fx.contextes[0]) as Record<string, unknown>;
  (ctx.members as Record<string, unknown>[])[0].fixed_intakes = orpheline;
  const m2 = await mesurerUnPlan({ ...fx, contextes: [ctx] }, ligne);
  assertEquals(m2.apportsFixes.declares, 1);
  const petitDej2 = m2.cases.find((c) => c.slot === "breakfast")!;
  assert(
    petitDej2.contrat!.cibleCaseKcal! < petitDej.contrat!.cibleCaseKcal!,
    `la cible doit BAISSER : ${petitDej2.contrat!.cibleCaseKcal} contre ${petitDej.contrat!.cibleCaseKcal}`,
  );
});

Deno.test("C0 ③ — l'allergie déclarée du tir 6 est LUE, plus écrite en dur à zéro", async () => {
  const gele = await c0("c0-tir6");
  const { fx, ligne } = await fixturesC0(gele);
  const lea = await mesurerUnPlan(fx, ligne, { rang: 1 });
  assertEquals(lea.bouche.allergies, ["arachide"]);
  assert(rendre(lea).includes("allergies déclarées      1 : arachide"), "l'écran doit la dire");
  // ── LE CAS QUI PASSE : Paul n'en déclare aucune, et ça se dit autrement.
  const paul = await mesurerUnPlan(fx, ligne, { rang: 0 });
  assertEquals(paul.bouche.allergies, []);
  assert(rendre(paul).includes("allergies déclarées      0"));
  // ⛔ ET NI L'UN NI L'AUTRE NE PRÉTEND QUE LA CEINTURE TIENT.
  assert(rendre(lea).includes("la ceinture est ARMÉE"), "l'armement reste non prouvé");
});

// ── ④ LE PREMIER JET N'EST PAS LE PAYLOAD FINAL ──────────────────────────

Deno.test("C0 ④ — tir 2 : les `ref` du premier jet se comptent SÉPARÉMENT du payload final", async () => {
  // ⛔ LE RAPPORT DISAIT « champ `ref` écrit par le modèle : 20 / 43 ». Ce
  // nombre est celui du PAYLOAD PERSISTÉ, c'est-à-dire APRÈS une réparation.
  // Les deux états sont ici, et ils ne disent pas la même chose.
  const gele = await c0("c0-tir2");
  const etapes = gele.etapes as Record<string, unknown>;
  const premier = JSON.parse(String(etapes.premier_jet)) as Record<string, unknown>;
  const ligne = gele.ligne_ecrite as Record<string, unknown>;
  const compter = (p: Record<string, unknown>) => {
    let lignes = 0, avec = 0;
    for (
      const u of [
        ...((p.dishes ?? []) as Record<string, unknown>[]),
        ...((p.preparations ?? []) as Record<string, unknown>[]),
      ]
    ) {
      for (const i of (u.ingredients ?? []) as Record<string, unknown>[]) {
        lignes++;
        if (typeof i.ref === "string" && i.ref.trim() !== "") avec++;
      }
    }
    return { lignes, avec };
  };
  const a = compter(premier), b = compter(ligne);
  // ⚠️ LES DEUX NOMBRES SONT PUBLIÉS ; ce test épingle qu'ils EXISTENT
  // séparément et que le premier jet est bien lisible. Les fondre était le
  // défaut.
  assert(a.lignes > 0 && b.lignes > 0);
  assertEquals(
    (gele.etapes as Record<string, unknown>).reparations instanceof Array,
    true,
  );
  assertEquals(
    ((gele.etapes as Record<string, unknown>).reparations as unknown[]).length,
    2,
    "le tir 2 a bien deux réponses de réparation archivées",
  );
  assert(
    a.avec !== b.avec || a.lignes !== b.lignes,
    `premier jet ${a.avec}/${a.lignes} et final ${b.avec}/${b.lignes} : ` +
      `si les deux coïncidaient, ce tir ne prouverait pas la séparation`,
  );
});

// ── ⑤ L'HORLOGE INJECTÉE ─────────────────────────────────────────────────

Deno.test("C0 ⑤ — l'horloge du harnais déplace `new Date()` ET `Date.now()` ensemble", () => {
  const vrai = Date.now();
  const h = installerHorloge("2026-09-11T15:07:00+02:00");
  try {
    const parLeConstructeur = new Date().getTime();
    const parNow = Date.now();
    // ⛔ LES DEUX ENSEMBLE, ET C'EST LE POINT. Deux horloges dans le même
    // processus rendraient un premier jour retiré par l'une et gardé par
    // l'autre — un banc qui se contredit lui-même.
    assert(Math.abs(parLeConstructeur - parNow) < 50, `${parLeConstructeur} vs ${parNow}`);
    assertAlmostEquals(parNow, h.cible.getTime(), 5_000);
    assert(Math.abs(parNow - vrai) > 1000, "l'horloge doit avoir bougé");
    // Un argument explicite n'est PAS décalé : `new Date(iso)` reste littéral.
    assertEquals(new Date("2020-01-01T00:00:00Z").toISOString(), "2020-01-01T00:00:00.000Z");
  } finally {
    h.restore();
  }
  // ⚠️ ET ELLE SE REND. Un processus qui sort avec un `Date` détourné piégerait
  // la ligne suivante.
  assert(Math.abs(Date.now() - vrai) < 5_000, "l'horloge n'a pas été rendue");
});

Deno.test("C0 ⑤ — la fenêtre PARTIELLE est reproductible par l'horloge, pas par l'heure de lancement", async () => {
  // ⛔ LE CAS N° 1 DU PLAN — « une fenêtre commençant l'après-midi » — n'avait
  // JAMAIS été mesuré : les six tirs sont partis entre 19 h 59 et 20 h 13, et
  // passé la coupure des courses de 18 h le premier jour tombe entier. Cette
  // fixture est un vrai passage dans le handler, horloge posée à 15 h 07.
  const gele = await c0("c0-apresmidi");
  const d = gele.demande as Record<string, unknown>;
  assertEquals(d.demande_figee_avant_appel, true);
  const instant = d.instant as Record<string, unknown>;
  assertEquals(instant.horloge_injectee, "2026-09-11T15:07:00+02:00");
  assert(Number(instant.decalage_ms) !== 0, "l'horloge a bien été déplacée");
  const fenetre = d.fenetre as Record<string, unknown>;
  assertEquals(fenetre.premier_jour_partiel, ["breakfast", "lunch"]);
  // ⛔ LA GRILLE ATTENDUE PORTE UN PREMIER JOUR À UNE SEULE CASE.
  const cases = (d.cases_par_bouche as Record<string, Record<string, string[]>>);
  const grille = Object.values(cases)[0];
  assertEquals(grille.fri, ["dinner"]);
  assertEquals(grille.sat, ["breakfast", "lunch", "dinner"]);
  assertEquals(d.cases_attendues_total, 7);
  // ⛔ ET LE MOTEUR A SERVI CETTE FENÊTRE-LÀ : l'annonce d'avant l'appel décrit
  // le plan écrit. Sans cette égalité, l'horloge injectée n'aurait rien prouvé.
  const acceptee = fenetre.acceptee as Record<string, unknown>;
  assertEquals(acceptee.starts_on, "2026-09-11");
  assertEquals(acceptee.duration_days, 3);
  const { fx, ligne } = await fixturesC0(gele);
  const m = await mesurerUnPlan(fx, ligne);
  assertEquals(m.denominateurs.casesAttendues, 7);
  assertEquals(m.denominateurs.platsPresents, 7);
});

// ── LES TROIS FAMILLES ───────────────────────────────────────────────────

Deno.test("C0 — conformité calorique, conformité complète et contrôles incomplets ne se fondent pas", async () => {
  // ⛔ SUR CE PLAN, LES TROIS NOMBRES DIFFÈRENT, et c'est ce qui rend leur
  // séparation vérifiable : 7 cases calorifiquement conformes, 4 complètes,
  // parce que trois dîners sortent de leur couloir de densité.
  const gele = await c0("c0-apresmidi");
  const { fx, ligne } = await fixturesC0(gele);
  const m = await mesurerUnPlan(fx, ligne);
  const f = troisFamilles(m);
  assertEquals(f.conformiteCalorique.conformes, 7);
  assertEquals(f.conformiteCalorique.sur, 7);
  assertEquals(f.conformiteComplete.sur, 7);
  assertEquals(f.conformiteComplete.conformes, 4);
  assertEquals(
    f.conformiteComplete.manquants.filter((x) => x.includes("densité hors couloir")).length,
    3,
  );
  assert(
    f.conformiteCalorique.conformes !== f.conformiteComplete.conformes,
    "si les deux coïncidaient, ce test ne prouverait rien",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ C2 (2026-09-12) — LA GARDE DE L'ARRONDI, SUR LES NEUF PLANS DU BANC
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CETTE GARDE EXIGE, ET POURQUOI ELLE EST ICI PLUTÔT QUE SUR UN
// DÉCOR. Le plan de clôture écrit, au § C2 : « aucune ligne quantitative
// nouvelle affichée avec une fraction décimale ; aucune quantité manquante
// masquée ». Un banc de module le prouve sur six lignes choisies ; ce test-ci
// le prouve sur les **365 lignes quantifiées des neuf plans réellement
// produits** — les six tirs de la campagne, la fenêtre d'après-midi de C0, et
// les deux plans relus du lot 0.
//
// ⛔ LA MESURE DE L'ÉTAPE, DANS LES DEUX SENS : **326 lignes fractionnaires
// avant, 0 après**. Le nombre d'AVANT est dans le test, et il n'est pas
// décoratif : si un jour il descend tout seul, c'est qu'une autre étape a
// commencé à arrondir, et il faut le savoir avant d'attribuer le gain à C2.
//
// ⚠️ LES FIXTURES NE BOUGENT PAS : l'arrondi s'applique à une COPIE PROFONDE.

const C2_REFERENTIEL = JSON.parse(
  await Deno.readTextFile(`${C0}/c2-unit-grams.json`),
) as { unit_grams: Record<string, number>; alias: Record<string, string> };

/**
 * Le poids d'une pièce, tel que le référentiel local le donnait le 2026-09-12.
 *
 * ⛔ CE N'EST PAS LE RÉSOLVEUR DE PRODUCTION, et c'est dit. Le moteur appelle
 * `resolveCompositionLine` (`quantity_rounding_wiring_test.ts` ⑤ l'épingle) ;
 * ce banc-ci lit des lignes JSON relues, sans index en mémoire, et rejoue la
 * résolution minimale : identifiant exact, puis alias du terme. Il ne peut que
 * SOUS-estimer — un terme qu'il ne résout pas rend `null`, donc une ligne de
 * plus « rendue à la réparation ».
 */
function c2PoidsDUnePiece(l: { term?: string; ref?: string | null }): number | null {
  const slug = typeof l.ref === "string" && l.ref !== "" ? l.ref : null;
  if (slug !== null) return C2_REFERENTIEL.unit_grams[slug] ?? null;
  const t = String(l.term ?? "").trim().toLowerCase();
  const viaAlias = C2_REFERENTIEL.alias[t];
  if (viaAlias) return C2_REFERENTIEL.unit_grams[viaAlias] ?? null;
  return C2_REFERENTIEL.unit_grams[t] ?? null;
}

interface LigneQuantifiee {
  term?: string;
  quantity?: string | null;
  amount?: number | null;
  unit?: string | null;
}

function c2LignesDuPlan(plan: Record<string, unknown>): LigneQuantifiee[] {
  const out: LigneQuantifiee[] = [];
  for (const p of (plan.preparations ?? []) as Record<string, unknown>[]) {
    for (const l of (p.ingredients ?? []) as LigneQuantifiee[]) out.push(l);
  }
  for (const d of (plan.dishes ?? []) as Record<string, unknown>[]) {
    for (const l of (d.ingredients ?? []) as LigneQuantifiee[]) out.push(l);
  }
  return out;
}

async function c2NeufPlans(): Promise<{ nom: string; plan: Record<string, unknown> }[]> {
  const out: { nom: string; plan: Record<string, unknown> }[] = [];
  for (const nom of ["c0-tir1", "c0-tir2", "c0-tir3", "c0-tir4", "c0-tir5", "c0-tir6", "c0-apresmidi"]) {
    const gele = await c0(nom);
    out.push({ nom, plan: gele.ligne_ecrite as Record<string, unknown> });
  }
  const fx = await fixtures();
  for (const p of fx.plans) out.push({ nom: String(p.id).slice(0, 8), plan: p });
  return out;
}

Deno.test("C2 — 326 lignes fractionnaires AVANT l'arrondi, sur les neuf plans du banc", async () => {
  let frac = 0;
  let quantifiees = 0;
  for (const { plan } of await c2NeufPlans()) {
    for (const l of c2LignesDuPlan(plan)) {
      const a = l.amount;
      if (typeof a !== "number" || !Number.isFinite(a) || a <= 0) continue;
      if (typeof l.unit !== "string" || l.unit === "") continue;
      quantifiees++;
      if (!Number.isInteger(a)) frac++;
    }
  }
  // ⛔ LE DÉNOMINATEUR VOYAGE AVEC LE NUMÉRATEUR. « 326 » sans « sur 365 » se
  // relit comme un taux, et un taux sans total ne veut rien dire.
  assertEquals(quantifiees, 365);
  assertEquals(frac, 326);
});

Deno.test("C2 — 0 ligne fractionnaire APRÈS, et pas une ligne de moins", async () => {
  let quantifiees = 0;
  let frac = 0;
  let rendusALaReparation = 0;
  for (const { nom, plan } of await c2NeufPlans()) {
    const copie = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
    const avant = c2LignesDuPlan(copie).length;
    const r = finalizePlanQuantities(
      planQuantityLines(
        (copie.dishes ?? []) as { ingredients?: never[] }[],
        (copie.preparations ?? []) as { ingredients?: never[] }[],
      ),
      String(copie.content_locale ?? "").slice(0, 2).toLowerCase() === "fr" ? "fr" : "en",
      c2PoidsDUnePiece,
    );
    rendusALaReparation += r.zeroed.length;
    // ⛔ « AUCUNE QUANTITÉ MANQUANTE MASQUÉE » : la finalisation ne SUPPRIME
    // aucune ligne. Le compte des lignes est le même des deux côtés.
    assertEquals(c2LignesDuPlan(copie).length, avant, `${nom}: une ligne a disparu`);
    for (const l of c2LignesDuPlan(copie)) {
      const a = l.amount;
      if (typeof a !== "number" || !Number.isFinite(a) || a <= 0) continue;
      if (typeof l.unit !== "string" || l.unit === "") continue;
      quantifiees++;
      if (!Number.isInteger(a)) frac++;
      // ⛔ ET LE TEXTE QUE LA PERSONNE LIT NE PORTE PAS DE FRACTION NON PLUS.
      // C'est la garde du plan mot pour mot — « aucune ligne quantitative
      // nouvelle AFFICHÉE avec une fraction décimale » —, et elle se prend sur
      // la fonction que les trois écrans appellent, pas sur `amount`.
      const texte = renderQuantity(l, "fr").text;
      assert(
        texte === null || !/\d[.,]\d/.test(texte),
        `${nom}: fraction décimale affichée — « ${texte} »`,
      );
    }
  }
  assertEquals(quantifiees, 365);
  assertEquals(frac, 0);
  // ⛔ ET AUCUN CAS N'A DÛ ÊTRE RENDU À LA RÉPARATION SUR CE BANC. Les neuf
  // lignes qui tombaient à zéro — sept citrons, un cube de bouillon, une
  // cuillère d'huile — ont toutes trouvé leur présentation plus fine DANS le
  // référentiel. Si ce nombre monte, c'est le référentiel qui a perdu un
  // `unit_grams`, pas l'arrondi qui a changé d'avis.
  assertEquals(rendusALaReparation, 0);
});

Deno.test("C2 — la masse ne bouge que de l'arrondi, et jamais du changement d'unité", async () => {
  // ⛔ CE QUE CE TEST INTERDIT : qu'une conversion cuillère → ml ou pièce → g
  // fasse apparaître ou disparaître de la nourriture. La conversion emploie
  // les nombres du référentiel (15 ml, 5 ml, `unit_grams`), donc elle est
  // exacte ; seul l'arrondi final déplace la masse, et d'AU PLUS une demi-unité
  // de l'unité d'arrivée.
  const { TBSP_ML, TSP_ML } = await import(
    "../supabase/functions/_shared/keel/food_composition.ts"
  );
  let lignes = 0;
  for (const { nom, plan } of await c2NeufPlans()) {
    const copie = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
    const avant = c2LignesDuPlan(copie).map((l) => ({ ...l }));
    finalizePlanQuantities(
      planQuantityLines(
        (copie.dishes ?? []) as { ingredients?: never[] }[],
        (copie.preparations ?? []) as { ingredients?: never[] }[],
      ),
      "fr",
      c2PoidsDUnePiece,
    );
    const apres = c2LignesDuPlan(copie);
    for (const [i, a] of avant.entries()) {
      const b = apres[i];
      if (typeof a.amount !== "number" || !(a.amount > 0)) continue;
      if (typeof a.unit !== "string" || a.unit === "") continue;
      lignes++;
      // La masse « avant », exprimée dans l'unité d'ARRIVÉE.
      const facteur = a.unit === "tbsp"
        ? TBSP_ML
        : a.unit === "tsp"
        ? TSP_ML
        : a.unit === "unit" && b.unit === "g"
        ? (c2PoidsDUnePiece(a) ?? 1)
        : 1;
      const attendu = a.amount * facteur;
      const obtenu = Number(b.amount);
      assert(
        Math.abs(obtenu - attendu) <= 0.5,
        `${nom}: ${a.term} a bougé de ${Math.abs(obtenu - attendu)} (${a.amount} ${a.unit} → ${obtenu} ${b.unit})`,
      );
    }
  }
  assertEquals(lignes, 365);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · LOT 3 — LES APPELS FOURNISSEUR SE COMPTENT EN TROIS TAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("appels ① — la génération, la réparation de plan et l'auxiliaire ne se confondent pas", () => {
  assertEquals(natureDeLaSource("generate-household-meal-v1", LANE), "generation_initiale");
  assertEquals(
    natureDeLaSource("generate-household-meal-v1.final_repair", LANE),
    "reparation_du_plan",
  );
  assertEquals(
    natureDeLaSource("generate-household-meal-v1.density_repair", LANE),
    "reparation_du_plan",
  );
  // ⛔ LE CAS QUI DOIT TOMBER DE L'AUTRE CÔTÉ, et c'est celui qui a produit le
  // faux total du rapport C6 : `density_repair_fill` CONTIENT « repair » et ne
  // redemande aucun plan. Une règle de forme les rangerait ensemble.
  assertEquals(
    natureDeLaSource("generate-household-meal-v1.density_repair_fill", LANE),
    "auxiliaire",
  );
});

Deno.test("appels ② — un `attempt_start` sans issue reste un appel, sans durée", () => {
  const census = classerAppels([
    { source: LANE, status: "attempt_start", created_at: "2026-09-12T01:00:00Z" },
    { source: LANE, status: "success", created_at: "2026-09-12T01:01:40Z" },
    {
      source: `${LANE}.final_repair`,
      status: "attempt_start",
      created_at: "2026-09-12T01:01:41Z",
    },
  ], LANE);
  assertEquals(census.total_fournisseur, 2);
  assertEquals(census.generation_initiale, 1);
  assertEquals(census.reparations_du_plan, 1);
  assertEquals(census.sans_duree, 1);
  assertEquals(census.appels[0].duree_ms, 100_000);
  // ⛔ LE CAS QUI DOIT ÉCHOUER SI ON JETTE L'APPEL SANS RETOUR : c'est
  // exactement l'appel qui a expiré, donc celui qu'on cherche.
  assert(census.appels.some((a) => a.duree_ms === null && a.issue === null));
});

Deno.test("appels ③ — les six tirs réels rendent le tableau de la revue, pas `c4CallsMade`", async () => {
  const dossier = fromFileUrl(
    new URL("../scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/", import.meta.url),
  );
  // Le tableau de `REVUE-CLOTURE-C6-2026-09-12.md` § 6, tir par tir.
  const attendu: Record<number, [number, number, number, number]> = {
    1: [1, 1, 0, 2],
    2: [1, 0, 0, 1],
    3: [1, 1, 0, 2],
    4: [1, 2, 1, 4],
    5: [1, 2, 1, 4],
    6: [1, 1, 0, 2],
  };
  let vus = 0;
  for await (const e of Deno.readDir(dossier)) {
    const m = e.name.match(/^campagne-tir(\d)-c6-.*\.json$/);
    if (!m) continue;
    const n = Number(m[1]);
    const d = JSON.parse(await Deno.readTextFile(dossier + e.name)) as Record<string, unknown>;
    const etapes = (d.etapes ?? {}) as Record<string, unknown>;
    const lignes = (etapes.echanges_resume ?? []) as Record<string, unknown>[];
    if (lignes.length === 0) continue;
    const c = classerAppels(lignes, LANE);
    const [gi, rp, aux, tot] = attendu[n];
    assertEquals(c.generation_initiale, gi, `tir ${n} · génération initiale`);
    assertEquals(c.reparations_du_plan, rp, `tir ${n} · réparations du plan`);
    assertEquals(c.auxiliaires, aux, `tir ${n} · appels auxiliaires`);
    assertEquals(c.total_fournisseur, tot, `tir ${n} · total fournisseur`);
    vus++;
  }
  // ⛔ SANS CETTE LIGNE, UN DOSSIER VIDE REND UN TEST VERT. C'est la faute
  // « une garde a besoin d'un cas qui passe » — ici, d'un cas qui EXISTE.
  assertEquals(vus, 6, "les six archives c6 doivent être lisibles");
});

/** La lane mesurée. ⛔ Une constante, pas une chaîne recopiée par test. */
const LANE = "generate-household-meal-v1";

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 — « SANS OBJET » N'EST NI UN ÉCHEC NI UN SUCCÈS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT MESURÉ. Depuis que le moteur sert une PART DE RECETTE à une
// bouche dont il ne sait pas calculer la cible (âge inconnu, corps absent,
// protection), cette bouche est NOURRIE — contenant, ingrédients, grammes — et
// l'instrument la rendait `complète 0/6` avec `22 contrôles incomplets`, à côté
// d'un `calorique 0/0` qui, lui, disait juste. Un rouge fabriqué.
//
// ⚠️ LA PRÉSENCE RESTE JUGÉE : on ne suspend que ce qui DÉRIVE de la cible.

Deno.test("SANS OBJET ① — une bouche sans cible n'est ni conforme ni en échec", async () => {
  const gele = await c0("lot1-age-inconnu");
  const { fx, ligne } = await fixturesC0(gele);
  const bouches = (((gele.demande ?? {}) as Record<string, unknown>).bouches ??
    []) as Record<string, unknown>[];
  const rangSansCible = bouches.findIndex((b) => (b.birth_date ?? null) === null);
  assert(rangSansCible >= 0, "la fixture doit porter une bouche sans date de naissance");

  const m = await mesurerUnPlan(fx, ligne, { rang: rangSansCible });
  const f = troisFamilles(m);

  // ⛔ LE POINT DU TEST. Elle a ses six cases demandées et ses six parts…
  assertEquals(m.denominateurs.casesAttendues, 6);
  assertEquals(m.denominateurs.portionsCalculees, 6);
  // …et aucune des trois familles numériques ne la juge.
  assertEquals(f.conformiteCalorique.sur, 0);
  assertEquals(f.conformiteComplete.sur, 0);
  assertEquals(f.conformiteComplete.manquants, []);
  assertEquals(f.controlesIncomplets, []);
  // La quatrième famille, elle, la COMPTE — un silence qui ne se compte pas est
  // un silence qu'on ne voit pas.
  assert(f.nonApplicables.cases >= 6, JSON.stringify(f.nonApplicables));
  assert(
    f.nonApplicables.raisons.some((x) => x.includes("aucune cible")),
    f.nonApplicables.raisons.join(" | "),
  );
});

Deno.test("SANS OBJET ② — LE CAS QUI MORD: sans cible, un plat ABSENT reste un défaut", async () => {
  // ⛔ Une garde qui ne refuse plus rien n'est pas une garde. On retire le plat
  // d'une case de la bouche sans cible : « sans objet » ne doit pas avaler la
  // PRÉSENCE.
  const gele = await c0("lot1-age-inconnu");
  const { fx, ligne } = await fixturesC0(gele);
  const bouches = (((gele.demande ?? {}) as Record<string, unknown>).bouches ??
    []) as Record<string, unknown>[];
  const rang = bouches.findIndex((b) => (b.birth_date ?? null) === null);

  const ampute = structuredClone(ligne);
  const plats = ampute.dishes as Record<string, unknown>[];
  const cible = plats[0];
  const jour = String(cible.day), slot = String(cible.slot);
  ampute.dishes = plats.filter((d) =>
    !(String(d.day) === jour && String(d.slot) === slot)
  );
  const m = await mesurerUnPlan({ ...fx, plans: [ampute] }, ampute, { rang });
  const f = troisFamilles(m);

  assertEquals(f.conformiteComplete.sur, 1, "la case amputée entre au dénominateur");
  assertEquals(f.conformiteComplete.conformes, 0);
  assert(
    f.conformiteComplete.manquants.some((x) => x.includes("aucun plat")),
    f.conformiteComplete.manquants.join(" | "),
  );
});

Deno.test("SANS OBJET ③ — une bouche AVEC cibles n'en gagne aucune", async () => {
  // ⛔ LA NON-RÉGRESSION. Les trois autres bouches du même plan gardent leurs
  // six cases jugées : la quatrième famille ne doit pas déborder sur elles.
  const gele = await c0("lot1-age-inconnu");
  const { fx, ligne } = await fixturesC0(gele);
  const bouches = (((gele.demande ?? {}) as Record<string, unknown>).bouches ??
    []) as Record<string, unknown>[];
  for (let rang = 0; rang < bouches.length; rang++) {
    if ((bouches[rang].birth_date ?? null) === null) continue;
    const f = troisFamilles(await mesurerUnPlan(fx, ligne, { rang }));
    assertEquals(f.conformiteComplete.sur, 6, `rang ${rang}`);
    assertEquals(f.nonApplicables.cases, 0, `rang ${rang}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 — DEUX CONTENANTS SUR LA MÊME CASE S'ADDITIONNENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT. L'index était une `Map` par `jour/slot` : le DERNIER contenant
// écrasait le précédent. Sur une case COMPLÉTÉE — une part du plat commun PLUS
// un petit plat au nom de la personne — l'instrument ne lisait que le
// complément (9 g, 2 kcal) et déclarait la case non conforme, alors que le plan
// écrit portait les deux boîtes et 563,6 kcal.

Deno.test("complément ① — la case complétée porte la SOMME des deux contenants", async () => {
  const gele = await c0("lot2-complement");
  const { fx, ligne } = await fixturesC0(gele);
  const bouches = (((gele.demande ?? {}) as Record<string, unknown>).bouches ??
    []) as Record<string, unknown>[];
  // La bouche complétée est celle qui porte DEUX contenants sur une même case.
  let rangComplete = -1, cleComplete = "";
  for (let rang = 0; rang < bouches.length; rang++) {
    const m = await mesurerUnPlan(fx, ligne, { rang });
    const doubles = m.cases.filter((c) => (c.portion?.boxId ?? "").includes("+"));
    if (doubles.length > 0) { rangComplete = rang; cleComplete = doubles[0].cle; break; }
  }
  assert(rangComplete >= 0, "aucune case à deux contenants dans cette fixture");

  const m = await mesurerUnPlan(fx, ligne, { rang: rangComplete });
  const c = m.cases.find((x) => x.cle === cleComplete)!;
  assert(c.portion !== null);
  // ⛔ LE POINT DU TEST : la case porte l'assiette ENTIÈRE, pas le petit plat
  // seul. Le complément pèse quelques grammes ; la part commune, des centaines.
  assert(c.portion!.grammes > 100, `${c.portion!.grammes} g`);
  assert((c.portion!.kcal ?? 0) > 100, `${c.portion!.kcal} kcal`);
  // …et elle tombe dans sa tolérance, ce qui n'était pas le cas avant.
  assert(c.ecartKcalPct !== null && Math.abs(c.ecartKcalPct) <= TOLERANCE_REPAS,
    `écart ${c.ecartKcalPct}`);
});

Deno.test("complément ② — un seul contenant non mesurable ÉTEINT la case", async () => {
  // ⛔ MÊME DOCTRINE QUE `plan_energy.ts`. Additionner les mesurables et ignorer
  // l'autre rendrait une somme amputée qui a l'air d'un résultat.
  const part = (kcal: number | null, g: number, id: string) => ({
    boxId: id, memberIds: ["m"], jour: "mon", slot: "dinner", titre: id,
    grammes: g, kcal, proteineG: kcal === null ? null : 10, gap: kcal === null ? "missing_quantity" : null,
    partageAvec: 1,
  });
  const ok = fusionnerParts([part(500, 300, "a"), part(60, 20, "b")])!;
  assertEquals(ok.grammes, 320);
  assertEquals(ok.kcal, 560);
  const eteint = fusionnerParts([part(500, 300, "a"), part(null, 20, "b")])!;
  assertEquals(eteint.kcal, null);
  assertEquals(eteint.gap, "missing_quantity");
});

Deno.test("complément ③ — `partageAvec` garde le MAXIMUM, une estimation ne se dilue pas", () => {
  const part = (n: number, id: string) => ({
    boxId: id, memberIds: ["m"], jour: "mon", slot: "dinner", titre: id,
    grammes: 100, kcal: 200, proteineG: 10, gap: null, partageAvec: n,
  });
  assertEquals(fusionnerParts([part(3, "bac"), part(1, "propre")])!.partageAvec, 3);
});
