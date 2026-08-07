/**
 * Le plancher de mesure corporelle, dans les DEUX directions et dans les DEUX
 * langues.
 *
 * ── POURQUOI CHAQUE CAS EST ÉCRIT DEUX FOIS ────────────────────────────────
 * Ce dépôt a déjà payé une garde testée dans une seule langue: `not` ne
 * couvrait pas `doesn't`, et `/\bbien\s+jou[ée]\b/` ne mordait pas sur « Bien
 * joué, » parce qu'en JS `\b` se calcule sur l'ASCII et que « é » n'en est pas.
 * Chaque frontière de FF-008 §7 et §8 est donc jouée en français ET en anglais.
 *
 * Les cas NÉGATIFS comptent autant que les positifs, et ici plus encore
 * qu'ailleurs: sur-déclarer un repas est corrigeable, sur-déclarer un poids
 * fausse une ceinture de sécurité.
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  BODY_MEASURE_BOUNDS,
  detectDeclaredBodyMeasure,
  type DisplayUnitSystem,
} from "./body_measure_floor.ts";

function hit(message: string, units: DisplayUnitSystem = "metric") {
  return detectDeclaredBodyMeasure(message, units);
}

function refused(messages: readonly string[], units: DisplayUnitSystem = "metric") {
  for (const message of messages) {
    assertEquals(hit(message, units), null, `ne doit PAS mordre: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// §8 — les critères d'acceptation, un par un
// ---------------------------------------------------------------------------

Deno.test("« je suis à 78 kg » — le cas nominal français", () => {
  const found = hit("je suis à 78 kg");
  assertEquals(found?.kind, "weight");
  assertEquals(found?.valueSi, 78);
  assertEquals(found?.unit, "kg");
  assertEquals(found?.unitSource, "explicit");
});

Deno.test("« I'm at 172 lbs this morning » — converti, EN ANGLAIS", () => {
  const found = hit("I'm at 172 lbs this morning");
  assertEquals(found?.kind, "weight");
  assertEquals(found?.unit, "lb");
  assertEquals(found?.unitSource, "explicit");
  // 172 lb = 78,017…  arrondi au dixième comme le formulaire.
  assertEquals(found?.valueSi, 78);
  assertEquals(found?.rawValue, 172);
});

Deno.test("les trois orthographes de « I'm » mordent — pas seulement la rare", () => {
  for (const form of ["I'm at 172 lbs", "I am at 172 lbs", "im at 172 lbs"]) {
    assertEquals(hit(form)?.valueSi, 78, form);
  }
});

Deno.test("UNE CIBLE N'EST JAMAIS UNE MESURE — FR et EN", () => {
  refused([
    "je veux atteindre 75 kg",
    "objectif 75 kg",
    "j'aimerais être à 75 kg",
    "d'ici juin je serai à 75 kg",
    "je vise 75 kg",
    "mon but c'est 75 kg",
  ]);
  refused([
    "I want to get to 165 lbs",
    "my goal is 165 lbs",
    "target 165 lbs",
    "I'd like to be at 165 lbs",
    "aiming for 165 lbs by summer",
    "I'm hoping to hit 165 lbs",
  ]);
});

Deno.test("UN TIERS N'EST JAMAIS L'ÉLÈVE — FR et EN", () => {
  refused([
    "ma fille fait 32 kg",
    "mon fils pèse 32 kg",
    "ma femme est à 62 kg",
    "elle fait 62 kg",
  ]);
  refused([
    "my daughter weighs 70 lbs",
    "my wife is at 130 lbs",
    "she weighs 130 lbs",
    "my son weighs 70 lbs",
  ]);
});

Deno.test("UNE VARIATION N'ÉCRIT RIEN — FR et EN", () => {
  refused([
    "j'ai perdu 2 kg cette semaine",
    "j'ai pris 2 kg",
    "je perds 2 kg par mois",
    "2 kg de moins cette semaine",
  ]);
  refused([
    "I lost 4 lbs this week",
    "I've lost 4 lbs",
    "I gained 4 lbs",
    "down 4 lbs since Monday",
  ]);
});

Deno.test("UNE PLAGE N'EST PAS UNE MESURE — FR et EN", () => {
  refused(["je fais entre 78 et 79 kg", "je suis à 78 ou 79 kg"]);
  refused(["I'm between 172 and 174 lbs", "I weigh 172 to 174 lbs"]);
});

Deno.test("DEUX NOMBRES = PAS DE MESURE SÛRE — FR et EN", () => {
  refused([
    "je suis à 78 kg, la semaine dernière j'étais à 80",
    "je suis à 78 kg après 3 semaines",
  ]);
  refused([
    "I'm at 172 lbs, was 175 last week",
    "I'm at 172 lbs after 3 weeks",
  ]);
});

Deno.test("UN NOMBRE NU N'EST RIEN — aucune porte, donc aucune écriture", () => {
  refused(["165", "78", "165 cm", "78 kg"]);
  refused(["165", "172 lbs"], "imperial");
});

Deno.test("UNE QUESTION NE DÉCLARE RIEN — FR et EN", () => {
  refused([
    "je devrais faire combien de kg ?",
    "est-ce que 78 kg c'est bien ?",
  ]);
  refused([
    "should I be at 165 lbs?",
    "is 172 lbs okay for my height?",
  ]);
});

Deno.test("UNE NÉGATION NE DÉCLARE RIEN — FR et EN", () => {
  refused(["je ne suis pas à 78 kg", "je ne fais plus 78 kg"]);
  refused(["I'm not at 172 lbs", "I don't weigh 172 lbs"]);
});

Deno.test("UNE HYPOTHÈSE NE DÉCLARE RIEN — FR et EN", () => {
  refused(["si je fais 78 kg ça ira", "imagine que je sois à 78 kg"]);
  refused(["if I weigh 172 lbs it's fine", "suppose I'm at 172 lbs"]);
});

Deno.test("UN PASSÉ LOINTAIN N'EST PAS LA MESURE DU JOUR — FR et EN", () => {
  refused(["l'an dernier je faisais 92 kg", "il y a 2 ans je pesais 92 kg"]);
  refused(["last year I weighed 200 lbs", "I used to weigh 200 lbs"]);
});

// ---------------------------------------------------------------------------
// §7 — les bornes, et le refus EXPLICITE plutôt que l'écriture silencieuse
// ---------------------------------------------------------------------------

Deno.test("HORS BORNES = REFUS, jamais une écriture silencieuse", () => {
  // 24 kg est sous le plancher du formulaire (25) — et surtout, une valeur
  // hors bornes vient presque toujours d'une unité mal lue, et
  // `restriction_guard` JETTE sur un poids implausible.
  assertEquals(hit("je suis à 24 kg"), null);
  assertEquals(hit("je suis à 400 kg"), null);
  assertEquals(hit("I weigh 800 lbs"), null);
  // Les bornes sont bien celles du formulaire hebdo.
  assertEquals(BODY_MEASURE_BOUNDS.weight_kg_min, 25);
  assertEquals(BODY_MEASURE_BOUNDS.weight_kg_max, 350);
  assertEquals(BODY_MEASURE_BOUNDS.waist_cm_min, 40);
  assertEquals(BODY_MEASURE_BOUNDS.waist_cm_max, 200);
});

Deno.test("UNE VALEUR PLAUSIBLE MAIS SURPRENANTE EST ÉCRITE TELLE QUELLE", () => {
  // FF-008 §8, dernier critère: « le produit ne se protège pas d'une valeur
  // plausible sous prétexte qu'elle est surprenante ». C'est exactement le cas
  // que la ceinture doit VOIR.
  assertEquals(hit("je suis à 42 kg")?.valueSi, 42);
  assertEquals(hit("I weigh 95 lbs")?.valueSi, 43.1);
});

// ---------------------------------------------------------------------------
// R6 — l'unité est explicite, ou celle du profil, jamais devinée du nombre
// ---------------------------------------------------------------------------

Deno.test("SANS UNITÉ, c'est le profil qui tranche — et jamais le nombre", () => {
  const metric = hit("je suis à 78");
  assertEquals(metric?.unit, "kg");
  assertEquals(metric?.unitSource, "profile_default");
  assertEquals(metric?.valueSi, 78);

  const imperial = hit("I'm at 172", "imperial");
  assertEquals(imperial?.unit, "lb");
  assertEquals(imperial?.unitSource, "profile_default");
  assertEquals(imperial?.valueSi, 78);
});

Deno.test("SANS UNITÉ, la bande d'ambiguïté avec une STATURE refuse", () => {
  // Métrique: 172 sans unité est bien plus souvent une taille en centimètres.
  assertEquals(hit("je suis à 172"), null);
  assertEquals(hit("je fais 165"), null);
  // …mais avec l'unité écrite, il n'y a plus d'ambiguïté à lever.
  assertEquals(hit("je suis à 172 kg")?.valueSi, 172);

  // Impérial: 68 sans unité est bien plus souvent une taille en pouces.
  assertEquals(hit("I'm at 68", "imperial"), null);
  assertEquals(hit("I'm at 68 lbs", "imperial")?.valueSi, 30.8);
});

Deno.test("UNE UNITÉ QUI CONTREDIT LA GRANDEUR REFUSE", () => {
  // « je fais 78 cm » n'est pas un poids: un plancher qui l'écrirait quand même
  // rangerait 78 kg dans la ceinture.
  assertEquals(hit("je fais 78 cm"), null);
  assertEquals(hit("I weigh 78 cm"), null);
  assertEquals(hit("mon tour de taille est 84 kg"), null);
  assertEquals(hit("my waist is 84 kg"), null);
});

Deno.test("L'UNITÉ QUALIFIE SON NOMBRE — l'adjacence est la règle", () => {
  // Le mot « kilos » est là, mais il qualifie les pommes. Deux nombres, donc
  // refus de toute façon: la garde tient par deux chemins, ce qui est voulu.
  assertEquals(hit("je suis à 78 ce matin, j'ai acheté 3 kilos de pommes"), null);
});

Deno.test("LE SÉPARATEUR DÉCIMAL SURVIT — virgule comme point, FR et EN", () => {
  assertEquals(hit("je suis à 78,5 kg")?.valueSi, 78.5);
  assertEquals(hit("je suis à 78.5 kg")?.valueSi, 78.5);
  assertEquals(hit("I weigh 172.5 lbs")?.valueSi, 78.2);
});

Deno.test("« 78kg » collé se lit comme « 78 kg »", () => {
  assertEquals(hit("je suis à 78kg")?.valueSi, 78);
  assertEquals(hit("I weigh 172lbs")?.valueSi, 78);
});

// ---------------------------------------------------------------------------
// Le tour de taille
// ---------------------------------------------------------------------------

Deno.test("LE TOUR DE TAILLE — FR et EN, et il exige d'être nommé", () => {
  const fr = hit("mon tour de taille est de 84 cm");
  assertEquals(fr?.kind, "waist");
  assertEquals(fr?.valueSi, 84);
  assertEquals(fr?.unit, "cm");

  const en = hit("my waist is 33 inches");
  assertEquals(en?.kind, "waist");
  assertEquals(en?.unit, "in");
  assertEquals(en?.valueSi, 83.8);
});

Deno.test("« taille » SEUL n'est pas un tour de taille", () => {
  // En français « taille » est aussi la stature et la taille de vêtement.
  // « je fais du 40 » ne doit jamais devenir un tour de taille de 40 cm.
  assertEquals(hit("je fais du 40"), null);
  assertEquals(hit("ma taille est 172"), null);
});

Deno.test("le tour de taille SANS unité prend celle du profil", () => {
  const metric = hit("mon tour de taille est 84");
  assertEquals(metric?.unit, "cm");
  assertEquals(metric?.valueSi, 84);

  const imperial = hit("my waist is 33", "imperial");
  assertEquals(imperial?.unit, "in");
  assertEquals(imperial?.valueSi, 83.8);
});

// ---------------------------------------------------------------------------
// Les garde-fous de forme
// ---------------------------------------------------------------------------

Deno.test("un mur de texte n'est pas une déclaration de mesure", () => {
  assertEquals(hit(`je suis à 78 kg ${"blabla ".repeat(120)}`), null);
});

Deno.test("le vide et le non-texte ne mordent pas", () => {
  assertEquals(detectDeclaredBodyMeasure("", "metric"), null);
  assertEquals(detectDeclaredBodyMeasure(null, "metric"), null);
  assertEquals(detectDeclaredBodyMeasure(undefined, "metric"), null);
  assertEquals(detectDeclaredBodyMeasure(42, "metric"), null);
});

Deno.test("les mots de l'élève sont gardés tels quels", () => {
  const found = hit("Je suis à 78 kg ce matin");
  assertEquals(found?.studentNote, "Je suis à 78 kg ce matin");
});
