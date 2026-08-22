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
import { assert, assertEquals } from "jsr:@std/assert@1";
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

/**
 * LE PASSÉ *PROCHE*, et il passait à travers.
 *
 * MESURÉ EN RUN RÉEL (2026-08-08, FF-008 A5): « la semaine dernière je pesais
 * 85 kg » et « last Monday I was 85 kg » s'écrivaient dans la semaine
 * COURANTE — un poids périmé rangé dans la case exacte que
 * `restriction_guard` compare de semaine à semaine. La liste des désarmes
 * disait l'intention (« la revue ne sait pas ranger un passé ») mais ne
 * nommait que le passé lointain.
 */
Deno.test("UN PASSÉ PROCHE ET DATÉ N'EST PAS LA MESURE DU JOUR — FR et EN", () => {
  // Les deux formes exactes mesurées en run réel.
  refused(["la semaine dernière je pesais 85 kg", "last Monday I was 85 kg"]);
  // Hier, et la veille.
  refused(["hier je pesais 85 kg", "avant-hier je faisais 85 kg"]);
  refused(["yesterday I weighed 185 lbs", "I was 185 lbs yesterday"]);
  // Un jour NOMMÉ désarme seul: « lundi je pesais 85 » ne porte aucun
  // marqueur d'antériorité, et exiger « dernier » raterait la forme courante.
  refused(["lundi je pesais 85 kg", "dimanche je faisais 85 kg"]);
  refused(["monday I was 185 lbs", "on friday I weighed 185 lbs"]);
  // La semaine / le mois passés, dans les deux langues.
  refused(["le mois dernier je pesais 85 kg", "la semaine passée je faisais 85 kg"]);
  refused(["last week I was 185 lbs", "last month I weighed 185 lbs"]);
  // « il y a N jours » — la forme que la liste ne couvrait qu'à partir des
  // semaines.
  refused(["il y a 3 jours je pesais 85 kg"]);
  refused(["3 days ago I weighed 185 lbs", "2 weeks ago I was 185 lbs"]);
});

/**
 * LA NON-RÉGRESSION QUI COMPTE. Le désarme du passé proche ne doit PAS manger
 * le cas nominal: « ce matin » et « this morning » sont AUJOURD'HUI, et ce
 * sont les formulations de §8.
 */
Deno.test("« ce matin » / « this morning » restent le cas NOMINAL", () => {
  assertEquals(hit("je suis à 78 kg ce matin")?.valueSi, 78);
  assertEquals(hit("je me suis pesé ce matin à 78 kg")?.valueSi, 78);
  assertEquals(hit("I'm at 172 lbs this morning", "metric")?.valueSi, 78);
  assertEquals(hit("je suis à 78 kg aujourd'hui")?.valueSi, 78);
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


// ---------------------------------------------------------------------------
// LES LIGATURES (lot S1d, 2026-08-22) — LE MODULE QUI ÉCRIT UN FAIT FAUX
// ---------------------------------------------------------------------------
//
// MESURE AVANT, 2026-08-22 03:51:35 CEST, avant toute ligne de correctif:
//   « je fais 78 kg comme ma sœur »  ⇒ weight 78 kg   ← ÉCRIT une mesure
//   « je fais 78 kg comme ma soeur » ⇒ null           ← désarmé
//
// ⛔ C'est le SENS INVERSE de S1 et de S1c. Là-bas la ligature faisait PERDRE
// une déclaration; ici elle en FABRIQUE une, sur le corps de quelqu'un, dans la
// case que `restriction_guard` compare ensuite. L'en-tête de ce module dit
// lui-même que c'est le pire des deux sorts.
//
// `soeur` est le SEUL littéral à digramme du module, et il vit dans le
// désarmement « quelqu'un d'autre ». 2 couples sur 3 divergeaient.
//
// ⚠️ Ces cinq tests forment le trépied de S1, recopié, et se lisent ensemble:
// un qui ALIGNE (la ligature), un qui NE MORD PAS (sans lui, une `normalize()`
// cassée refuserait tout et ressemblerait trait pour trait à une garde qui
// marche), un BALAYAGE qui compte ses propres cas (un balayage vide est vert
// pour rien: cicatrice `V0-B-bis`), un qui DÉCLARE le changement de
// comportement, et un qui DIT UNE ABSENCE.
//
// ⛔ LE CRITÈRE N'EST PAS « rend ce verdict », C'EST « les deux graphies
// rendent le MÊME verdict ». S1 a d'abord rougi pour la mauvaise raison en
// l'ignorant.

/** La graphie en digramme d'une chaîne à ligature. */
function digraphe(s: string): string {
  return s.replace(/œ/g, "oe").replace(/æ/g, "ae");
}

/** La graphie à ligature d'une chaîne en digramme. */
function ligature(s: string): string {
  return s.replace(/oe/g, "œ").replace(/ae/g, "æ");
}

/**
 * LE BALAYAGE EST ÉCRIT SUR LE SOURCE EXÉCUTÉ DU MODULE, pas sur une liste
 * recopiée: `WEIGHT_GATES`, `WAIST_GATES`, `DISARM` et `UNIT_TERMS` ne sont pas
 * exportés — et les exporter pour un test élargirait la surface publique d'un
 * plancher de sécurité. Lire le fichier prend TOUTES ses tables d'un coup, et
 * le jour où quelqu'un ajoute « coeur », « caecum » ou « nævus » dans n'importe
 * laquelle, il entre ici tout seul.
 *
 * ⚠️ Les commentaires sont RETIRÉS avant le scan: ce dépôt a déjà mesuré qu'un
 * grep naïf compte des morts pour des vivants. Le fichier porte des ligatures
 * littérales dans son en-tête — elles ne sont pas des données.
 */
function digrammesDuCodeExecute(): Map<string, number> {
  const src = Deno.readTextFileSync(
    new URL("./body_measure_floor.ts", import.meta.url),
  );
  // ⛔ ET LE DÉPLIAGE LUI-MÊME EST RETIRÉ DU SCAN, avec un compte: ses deux
  // chaînes de remplacement (« oe », « ae ») sont le CORRECTIF, pas des
  // données. Retirer sans compter laisserait le balayage vert le jour où
  // quelqu'un supprime le dépliage.
  const unfold = src.match(/\.replace\(\/\\u(?:0153|00e6)\/g, "(?:oe|ae)"\)/g) ?? [];
  assertEquals(
    unfold.length,
    2,
    "le dépliage des deux ligatures a disparu du module",
  );
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\.replace\(\/\\u(?:0153|00e6)\/g, "(?:oe|ae)"\)/g, " ")
    .toLowerCase();
  const out = new Map<string, number>();
  for (const m of code.matchAll(/[a-z]*(?:oe|ae)[a-z]*/g)) {
    out.set(m[0], (out.get(m[0]) ?? 0) + 1);
  }
  return out;
}

/**
 * Pour CHAQUE digramme du code, une porteuse déclarée: la phrase qui le porte,
 * et la MÊME phrase sans lui. ⛔ Un jeton sans porteuse fait rougir le
 * balayage — c'est voulu: il oblige celui qui ajoute un mot à ligature à écrire
 * son cas au lieu de le laisser passer en silence.
 */
const PORTEUSES: Readonly<Record<string, { avec: string; sans: string }>> = {
  soeur: { avec: "je fais 78 kg comme ma soeur", sans: "je fais 78 kg" },
};

/** Les digrammes que PERSONNE n'écrit avec une ligature. Aucun ici, à ce jour. */
const JAMAIS_LIGATURES: readonly string[] = [];

Deno.test("LIGATURE — la ligature ne FABRIQUE plus une mesure corporelle", () => {
  const couples = [
    "je fais 78 kg comme ma soeur",
    "je pese 78 kg comme ma soeur",
    "je suis a 78 kg comme ma soeur",
  ];
  assertEquals(couples.length, 3, "la grille doit porter ses 3 formulations");

  for (const digramme of couples) {
    const lig = ligature(digramme);
    assert(lig !== digramme, `cas dégénéré, aucune ligature: ${digramme}`);

    // ⚠️ AUCUNE RÉGRESSION SUR LE DIGRAMME: c'est la moitié qui marchait déjà.
    assertEquals(hit(digramme), null, `le digramme doit désarmer: ${digramme}`);
    // Et la ligature rend désormais le MÊME verdict.
    assertEquals(hit(lig), null, `la ligature doit désarmer: ${lig}`);
  }
});

Deno.test("LIGATURE — LE CAS QUI PASSE: le dépliage ne ferme aucune porte", () => {
  // Sans ces cas, une `normalize()` cassée — qui ferait TOUT refuser — aurait
  // exactement la tête d'une garde qui marche.
  assertEquals(hit("je fais 78 kg")?.valueSi, 78);
  assertEquals(hit("je suis à 78,5 kg ce matin")?.valueSi, 78.5);
  assertEquals(hit("mon tour de taille est de 84 cm")?.valueSi, 84);
  refused([
    "jaime bien les pates",
    // Une ligature dans une phrase qui ne déclare aucune mesure.
    "j'ai mangé des œufs à midi",
    // R7 — la ligature n'invente aucun nombre: « nœud » se déplie en « noeud »,
    // qui n'est ni une unité ni une porte.
    "j'ai fait un nœud à 3 boucles",
  ]);
});

Deno.test("LIGATURE — BALAYAGE: tout digramme du code exécuté est couvert", () => {
  const trouves = digrammesDuCodeExecute();

  // ⛔ L'ASSERTION DE CARDINALITÉ, et elle n'est pas décorative: une boucle sur
  // zéro cas est verte sans rien avoir prouvé.
  const ligaturables = [...trouves.keys()].filter((t) =>
    !JAMAIS_LIGATURES.includes(t)
  );
  assert(
    ligaturables.length >= 1,
    "balayage vide — un balayage qui ne couvre rien n'est pas une preuve",
  );
  assertEquals(
    ligaturables.sort(),
    ["soeur"],
    "un digramme est apparu ou a disparu du code exécuté — écrire sa porteuse",
  );

  for (const token of ligaturables) {
    const porteuse = PORTEUSES[token];
    assert(
      porteuse,
      `${token}: aucune porteuse déclarée — écrire son cas, pas le sauter`,
    );

    // ① LA PRÉMISSE. Sans le jeton, la phrase MORD; avec lui, elle est
    //    désarmée. Sans ce contrôle, comparer `null` à `null` ne prouve rien.
    const sansJeton = hit(porteuse.sans);
    const avecJeton = hit(porteuse.avec);
    assert(sansJeton, `${token}: prémisse cassée, ${porteuse.sans} ne mord pas`);
    assert(
      JSON.stringify(sansJeton) !== JSON.stringify(avecJeton),
      `${token}: le jeton ne change rien — la porteuse ne prouve rien`,
    );

    // ② L'ÉQUIVALENCE DES DEUX GRAPHIES, qui est le critère du lot.
    const lig = ligature(porteuse.avec);
    assert(lig !== porteuse.avec, `${token}: aucune ligature à produire`);
    assertEquals(
      JSON.stringify(hit(lig)),
      JSON.stringify(avecJeton),
      `${token}: les deux graphies doivent rendre le MÊME verdict`,
    );
    assertEquals(digraphe(lig), porteuse.avec, `${token}: aller-retour rompu`);
  }
});

Deno.test("LIGATURE — le désarmement « quelqu'un d'autre » CHANGE DE COMPORTEMENT", () => {
  // ⛔ CE TEST DIT UN CHANGEMENT DE COMPORTEMENT, et il faut le lire comme tel.
  // Mesuré le 2026-08-22 à 03:51:35, AVANT le correctif:
  //   « je fais 78 kg comme ma sœur »  ⇒ weight 78 kg
  //   « je fais 78 kg comme ma soeur » ⇒ null
  // Deux graphies, deux verdicts — et le mauvais des deux ÉCRIVAIT. Le dépliage
  // aligne les deux sur le comportement du digramme, qui est celui que l'auteur
  // a écrit et testé (`DISARM`, section « QUELQU'UN D'AUTRE »).
  //
  // ⛔ Ici on ne choisit pas entre deux comportements, on choisit entre UN et
  // DEUX (§⑨ n° 24). Le retour arrière rouvre l'écriture d'un poids que
  // personne n'a déclaré pour lui-même.
  //
  // Ce qui reste vrai des deux côtés: le poids nommé est celui de QUELQU'UN
  // D'AUTRE, et le désarmement « autrui » est ABSOLU par construction.
  for (
    const phrase of [
      "je fais 78 kg comme ma sœur",
      "ma sœur fait 78 kg",
      "je pèse 78 kg, ma sœur aussi",
    ]
  ) {
    assertEquals(
      JSON.stringify(hit(phrase)),
      JSON.stringify(hit(digraphe(phrase))),
      `les deux graphies doivent rendre le même verdict: ${phrase}`,
    );
    assertEquals(hit(phrase), null, phrase);
  }
});

Deno.test("LIGATURE — æ est déplié par SYMÉTRIE, et n'a aucune cible aujourd'hui", () => {
  // ⛔ CE TEST DIT UNE ABSENCE, et il faut le lire comme tel: le dépliage
  // `æ → ae` de `body_measure_floor.ts` n'est exercé de bout en bout par AUCUN
  // cas — zéro littéral du code exécuté ne contient « ae ». Il est posé parce
  // que les quatre modules frères le portent, et que deux normalisations qui
  // divergent sont exactement la facture que S1, S1c puis S1d ont payée.
  //
  // Le jour où un littéral en « ae » entre dans une table, le BALAYAGE
  // ci-dessus le prend automatiquement — et ce test-ci rougit pour prévenir que
  // l'affirmation d'absence a cessé d'être vraie. Sans lui, un dépliage jamais
  // exercé ressemble TRAIT POUR TRAIT à un dépliage qui marche.
  const avecAe = [...digrammesDuCodeExecute().keys()].filter((t) =>
    t.includes("ae")
  );
  assertEquals(
    avecAe.sort(),
    [],
    "un littéral en « ae » est apparu — vérifier qu'il est couvert sous « æ »",
  );
});
