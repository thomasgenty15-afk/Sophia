/**
 * LOT 3 · UN OBJECTIF QUI NE S'EXÉCUTE PAS LE DIT.
 *
 * ⛔ LE DÉFAUT: une fiche sans TAILLE reçoit une cible (raccourci au poids
 * d'`adultMaintenanceKcal`) et un écart `null` ⇒ zéro. La personne lit
 * « perdre 0,5 kg par semaine » et mange son entretien, sans un mot.
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { MouthBody } from "./meal_envelope.ts";
import {
  estimatedMaintenanceFor,
  PACE_UNAVAILABLE_REASONS,
  paceUnavailableReason,
} from "./weight_pace.ts";

function corps(over: Partial<MouthBody> = {}): MouthBody {
  return {
    heightCm: 178,
    weightKg: 73,
    gender: "male",
    ageYears: 34,
    activityLevel: "sedentary",
    activityAxes: { day: null, sport: null, asked: false },
    appetite: null,
    ...over,
  };
}

Deno.test("un corps complet n'a AUCUN motif — le cas courant est muet", () => {
  assertEquals(paceUnavailableReason({ body: corps(), isMinor: false }), null);
});

Deno.test("SANS TAILLE: la cible existe, le rythme non — et ça se dit", () => {
  const sujet = { body: corps({ heightCm: null }), isMinor: false };
  // La moitié qui fait le défaut: l'entretien du rythme renonce…
  assertEquals(estimatedMaintenanceFor(sujet), null);
  // …et c'est exactement ce que le motif nomme.
  assertEquals(paceUnavailableReason(sujet), "pace_unavailable_missing_body");
});

Deno.test("SANS ÂGE: même motif, même raison", () => {
  assertEquals(
    paceUnavailableReason({ body: corps({ ageYears: null }), isMinor: false }),
    "pace_unavailable_missing_body",
  );
});

Deno.test("SANS SEXE, en revanche, le rythme tient — et ce n'est pas un oubli", () => {
  // ⚠️ MESURÉ, PAS SUPPOSÉ. `estimatedMaintenanceKcal` exige poids, taille et
  // BANDE D'ÂGE (`meal_envelope.ts`: `if (!weightKg || !heightCm || !ageBand)
  // return null`) — le sexe déplace des coefficients, il ne bloque pas le
  // calcul. Ce test existe pour que le motif ne se mette pas à sonner sur une
  // fiche parfaitement calculable le jour où quelqu'un ajoute le sexe à cette
  // liste sans y penser.
  assertEquals(
    paceUnavailableReason({ body: corps({ gender: null }), isMinor: false }),
    null,
  );
});

Deno.test("SANS POIDS: aucun motif — il n'y a pas de cible non plus", () => {
  // ⚠️ CE CAS N'EST PAS « objectif annulé en silence »: il n'y a rien à
  // annuler. Le confondre ferait sonner une alarme sur une fiche vide.
  for (const p of [null, 0, -3]) {
    assertEquals(
      paceUnavailableReason({ body: corps({ weightKg: p }), isMinor: false }),
      null,
      String(p),
    );
  }
});

Deno.test("UN MINEUR passe par l'autre équation, et elle a ses propres besoins", () => {
  // L'équation pédiatrique n'a pas besoin de la taille: sans elle, le rythme
  // reste calculable, et il n'y a donc rien à signaler.
  assertEquals(
    paceUnavailableReason({
      body: corps({ heightCm: null, ageYears: 12 }),
      isMinor: true,
    }),
    null,
  );
});

Deno.test("le vocabulaire des motifs est FERMÉ", () => {
  // ⛔ Un motif de plus sans écran qui le rend serait un mur muet.
  assertEquals([...PACE_UNAVAILABLE_REASONS], [
    "pace_unavailable_missing_body",
  ]);
});
