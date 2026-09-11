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
import {
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
  type Fixtures,
  journeesParPortions,
  mesurerPortions,
  mesurerUnPlan,
  rendre,
  troisIndex,
} from "./2026-09-11-mesure-grille.ts";
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
