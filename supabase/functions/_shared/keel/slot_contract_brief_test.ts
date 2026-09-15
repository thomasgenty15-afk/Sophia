/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 ③ — LE CONTRAT D'UNE CASE, DIT AVANT LA PREMIÈRE GÉNÉRATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CES CAS ÉPINGLENT. Le prompt réellement archivé le 2026-09-11
 * (`campagne-tir4-c6`, `prompt_envoye`) porte le couloir de densité, sa visée
 * et le plancher protéique — et NI l'énergie visée de la case, NI les bornes
 * de masse. La garde finale reproche ensuite exactement ces deux nombres-là.
 *
 * ⛔ ET LA PROTÉINE EST UN PLANCHER. Revue C6 § 7: 276–292 g servis pour un
 * plancher de 176 g — « cette marge n'est pas un critère de meilleure
 * recette ». Une consigne dont l'échappatoire n'est pas nommée se fait
 * satisfaire par elle.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  RAW_COOKED_SENTENCE,
  slotContractBrief,
  slotContractSentence,
} from "./slot_contract_brief.ts";
import type { SlotContractLine } from "./slot_contract_brief.ts";

/** Les nombres du tir n° 4: Max, dimanche, les trois moments. */
function ligne(o: Partial<SlotContractLine> = {}): SlotContractLine {
  return {
    who: "Max",
    day: "sun",
    slot: "breakfast",
    targetKcal: 728,
    gramsMin: 380,
    gramsMax: 630,
    gramsAim: 500,
    densityMin: 116,
    densityMax: 250,
    densityAim: 127,
    proteinMinG: 25,
    ...o,
  };
}

Deno.test("LOT 2 ⑫ — les quatre nombres partent ensemble: énergie, masse, densité, protéine", () => {
  const p = slotContractSentence(ligne());
  assert(p !== null);
  // ⛔ LES DEUX QUI MANQUAIENT AU PROMPT ARCHIVÉ.
  assert(p.includes("728 kcal in one serving"), p);
  assert(p.includes("380 to 630 g cooked"), p);
  // ⚠️ ET LES DEUX QUI Y ÉTAIENT DÉJÀ, INCHANGÉS.
  assert(p.includes("116 to 250 kcal per 100 g"), p);
  assert(p.includes("at least 25 g of protein"), p);
  assert(p.includes("Max, sun breakfast"), p);
});

Deno.test("LOT 2 ⑫ bis — une abstention du moteur est SAUTÉE, jamais écrite « 0 »", () => {
  // ⛔ `null` = le moteur s'est abstenu (case couverte par un apport fixe,
  // plancher protégé, corps absent). Écrire « 0 kcal » ferait composer contre
  // une cible que personne n'a posée.
  const p = slotContractSentence(ligne({ targetKcal: null, proteinMinG: null }));
  assert(p !== null);
  // ⚠️ ON CHERCHE LE FRAGMENT DE LA CIBLE, PAS « 0 kcal »: « 250 kcal per
  // 100 g » contient littéralement « 0 kcal ». Un matcher trop court rend un
  // test qui échoue sur la bonne sortie.
  assert(!p.includes("kcal in one serving"), p);
  assert(!p.includes("protein"), p);
  assert(p.includes("380 to 630 g cooked"), p);
  // ⛔ ET UNE CASE SUR LAQUELLE IL S'EST ABSTENU SUR TOUT NE PRODUIT RIEN.
  assertEquals(
    slotContractSentence(ligne({
      targetKcal: null,
      gramsMin: null,
      gramsMax: null,
      gramsAim: null,
      densityMin: null,
      densityMax: null,
      densityAim: null,
      proteinMinG: null,
    })),
    null,
  );
});

Deno.test("LOT 2 ⑬ — le bloc dit CRU contre CUIT, et nomme l'échappatoire protéique", () => {
  const brief = slotContractBrief({
    lines: [ligne(), ligne({ slot: "lunch", targetKcal: 1165, proteinMinG: 40 })],
  });
  assertEquals(brief.counters.lines, 2);
  assertEquals(brief.counters.silent, 0);
  // ⛔ SANS CETTE PHRASE, LE RÉFÉRENTIEL (par 100 g CRU) ET LES BORNES (assiette
  // CUITE) se confondent — un facteur 2,6 sur du riz suffit à sortir des bornes
  // sans qu'aucune consigne n'ait été violée.
  assert(brief.text.includes(RAW_COOKED_SENTENCE), brief.text);
  assert(brief.text.includes("100 g raw becomes 260 g cooked"), brief.text);
  // ⛔ ET LA PROTÉINE EST UN PLANCHER, PAS UN SCORE.
  assert(brief.text.includes("FLOOR to reach, not a score to beat"), brief.text);
  assert(brief.text.includes("going far above"), brief.text);
  // ⛔ ON N'ATTEINT PAS CES NOMBRES EN SERVANT PLUS: l'app décide les portions.
  assert(brief.text.includes("the app decides how much goes on each plate"), brief.text);
});

Deno.test("LOT 2 ⑬ bis — la troncature se DIT, et les abstentions se comptent", () => {
  const lignes: SlotContractLine[] = [];
  for (let i = 0; i < 40; i++) lignes.push(ligne({ slot: `slot${i}` }));
  // Deux cases muettes en plus, pour vérifier qu'elles ne se perdent pas.
  lignes.push(ligne({
    targetKcal: null,
    gramsMin: null,
    gramsMax: null,
    gramsAim: null,
    densityMin: null,
    densityMax: null,
    densityAim: null,
    proteinMinG: null,
  }));
  const brief = slotContractBrief({ lines: lignes, maxLines: 10 });
  assertEquals(brief.counters.lines, 10);
  assertEquals(brief.counters.truncated, 30);
  assertEquals(brief.counters.silent, 1);
  assert(brief.text.includes("30 more plate(s)"), brief.text);
});

Deno.test("LOT 2 ⑬ ter — LE CAS QUI PASSE: aucune ligne ⇒ aucun bloc", () => {
  // ⛔ Un bloc qui dit « voici les nombres » sans nombre demanderait de composer
  // contre rien. Un vide se rend vide.
  const brief = slotContractBrief({ lines: [] });
  assertEquals(brief.text, "");
  assertEquals(brief.counters.chars, 0);
});
