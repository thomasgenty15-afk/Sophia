#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env
/**
 * ══════════════════════════════════════════════════════════════════════════
 * V0-C — LA FIXTURE OBLIGATOIRE : un foyer de 4 bouches qui porte SIX
 * conditions en même temps.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Autorité : `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, section
 * « LA FIXTURE OBLIGATOIRE » et fiche `V0-C`. Cette fixture existe pour `V0-D`
 * (le run réel) et pour la vérification de fin de CHAQUE vague.
 *
 *   ① un végane          ④ deux objectifs OPPOSÉS (fat_loss / muscle_gain)
 *   ② un mineur          ⑤ une absence PARTIELLE
 *   ③ une allergie       ⑥ au moins une bouche SANS COMPTE
 *      `medical`
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ 2026-08-22 — CE SCRIPT S'ARRÊTE, ET C'EST `S4` QUI L'ARRÊTE.
 * ══════════════════════════════════════════════════════════════════════════
 * La migration `20260822041500` refuse tout objectif de poids sur une bouche
 * mineure, sur les quatre portes d'écriture. La précision n° 2 de cette
 * fixture (« le mineur porte un des deux objectifs opposés ») demande
 * exactement ça. `minorGoalOrDie()` s'arrête AVANT toute écriture, avec le
 * motif nommé — jamais un `Error` générique au milieu d'un foyer à moitié
 * bâti.
 * ⚠️ La fixture DÉJÀ EN BASE survit (`S4` ne corrige pas l'existant) : `V0-D`
 * et la vérification de fin de vague tournent encore. Seule la
 * RECONSTRUCTION est fermée. Détail : `MINOR_GOAL`, plus bas. Fiche `S4-c`.
 *
 * ── LA RÈGLE QUI DÉCIDE DE LA QUALITÉ DE CE SCRIPT ────────────────────────
 *
 *   > « une fixture qui diverge du produit mesure autre chose. Chaque champ
 *   >   posé par LA MÊME RPC QUE L'ÉCRAN, jamais par un `insert` direct. »
 *
 * Tout ce qui suit passe donc par `keel_household_*`, appelées en PostgREST
 * avec le jeton du compte maître — c'est-à-dire exactement le chemin de
 * `frontend/src/keel/api/household.ts`. Aucun `insert into
 * household_members`, aucun `update` de colonne. L'ORDRE des appels est celui
 * de `SetupPage.tsx :: addMouth` (`add_member` → corps → cible → allergies →
 * régime), parce qu'un ordre différent est un autre produit.
 *
 * Deux écritures ne sont PAS des RPC, et ce n'est pas un contournement : le
 * produit lui-même les fait en PostgREST direct.
 *   · `profiles` (locale, pays, prénom, date) — `api/uiLanguage.ts`,
 *     `api/keelClient.ts` écrivent la table à la main.
 *   · `student_goals` du maître — `api/household.ts :: createOwnerGoalRow`,
 *     un `upsert` avec `ignoreDuplicates`. Sans cette ligne,
 *     `generate-household-meal-v1` refuse par `goal_required` (409), donc la
 *     fixture serait inutilisable par `V0-D`.
 * Les deux sont faites AVEC LE JETON DU MAÎTRE, sous RLS, jamais en
 * `service_role`.
 *
 * ── L'ARME : LE SCRIPT ÉCHOUE SI L'ALLERGÈNE NE RÉSOUT PAS ────────────────
 *
 * Une allergie dont le libellé ne rend aucun `allergen_ref` catalogué fait une
 * ceinture de sortie qui cherche une chaîne qu'elle ne trouvera jamais. C'est
 * le défaut mesuré sur `fruits_de_mer` (`surfaceFormsFor` rend `[]`). Le
 * contrôle est fait AVANT toute écriture, avec LE CODE DU PRODUIT lui-même
 * (`householdAllergenRefs` + `surfaceFormsFor` importés, pas recopiés) : une
 * table qui grandit ou rétrécit fait bouger ce script sans qu'on y touche.
 *
 * ── REJOUABLE, PAR UNE CLÉ NATURELLE QUE LA BASE TIENT ────────────────────
 *
 * La clé est l'e-mail du maître. `household_members_one_per_user` est UNIQUE
 * sur `user_id` : le maître ne peut appartenir qu'à UN foyer, donc relancer ce
 * script ne peut pas en créer un second — ce n'est pas une politesse du code,
 * c'est une contrainte de la base. Les bouches, elles, sont retrouvées par
 * PRÉNOM dans le roster ; les `set_member_*` sont des `update` idempotents et
 * `add_allergy` porte un `on conflict do nothing`.
 *
 * ── CE QUE CE SCRIPT NE FAIT PAS ──────────────────────────────────────────
 *
 * ⛔ Aucune suppression, aucun `delete`, aucune ligne d'un autre foyer touchée.
 * ⛔ Aucun appel de modèle. `V0-C` a un budget de ZÉRO génération ; c'est
 *    `V0-D` qui dépense.
 * ⛔ Aucun JWT forgé, aucune écriture dans `auth.sessions` : le maître se
 *    connecte par mot de passe, comme l'écran.
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────
 *
 *   deno run --allow-net --allow-read --allow-env \
 *     scripts/2026-08-21-2300-fixture-v0c-foyer-pluriel.ts
 *
 * Les trois variables sont lues dans l'environnement, et à défaut dans
 * `supabase/.env`. ⚠️ Ne JAMAIS les exporter dans un shell qui lancera ensuite
 * `deno test` du dépôt : 114 faux rouges connus.
 */

import { householdAllergenRefs } from "../supabase/functions/_shared/keel/household_safety.ts";
import { surfaceFormsFor } from "../supabase/functions/_shared/keel/allergen_surface_forms.ts";
// ⚠️ LA MINORITÉ VIENT DU PRODUIT, PAS D'UN CALCUL LOCAL. `assessBirthDate` +
// `ageStateFromVerdict` sont ce que le générateur ET l'écran lisent, et
// `KEEL_MINOR_AGE` est le seul 18 du dépôt. Recopier « moins dix-huit ans »
// ici ferait une SECONDE borne de la minorité, qui divergerait au premier
// ajustement — et l'arme mesurerait alors autre chose que la base.
import { assessBirthDate } from "../supabase/functions/_shared/keel/student_age.ts";
import { ageStateFromVerdict } from "../supabase/functions/_shared/keel/household.ts";

// ---------------------------------------------------------------------------
// LA FIXTURE, ÉCRITE UNE FOIS
// ---------------------------------------------------------------------------

/** LA CLÉ NATURELLE. Changer cet e-mail crée un SECOND foyer de fixture. */
const MASTER_EMAIL = "fixture.v0c.master@keeltest.dev";
/** Le mot de passe des personas locaux (`tests/real-personas/<nom>/connection.json`). */
const MASTER_PASSWORD = "1234567";
const MASTER_FULL_NAME = "Camille Fixture";
const MASTER_BIRTH_DATE = "1986-03-14";
const HOUSEHOLD_NAME = "Fixture V0-C — foyer pluriel";

/**
 * LA LANGUE DU FOYER, ÉCRITE EXPRÈS ET PAS HÉRITÉE DU DÉFAUT.
 *
 * `profiles.locale` vaut `fr-FR` par défaut en base, et
 * `generate-household-meal-v1` en fait LA langue du plan (`:1235`, et pas
 * `student_goals.content_locale`). Une fixture qui ne l'écrit pas mesure un
 * défaut de colonne en croyant mesurer un choix. On l'écrit — et on la rend
 * pilotable, parce que le référentiel alimentaire est mesuré 17,3 points moins
 * profond en français qu'en anglais : `V0-D` doit pouvoir basculer sans
 * rééditer ce fichier.
 */
const FIXTURE_LOCALE = Deno.env.get("FIXTURE_LOCALE") ?? "fr-FR";
/** `profiles.country` est la SEULE source du pays de crise. Jamais `null`. */
const FIXTURE_COUNTRY = Deno.env.get("FIXTURE_COUNTRY") ?? "FR";
const FIXTURE_TIMEZONE = "Europe/Paris";

/**
 * LE LIBELLÉ DE L'ALLERGIE, EN FRANÇAIS, PARCE QUE C'EST CE QUE LE MAÎTRE TAPE.
 *
 * `arachide` → `["peanut", "arachide"]`, et `peanut` porte 8 formes de surface
 * (« satay », « nut butter », « PB »…). C'est le cas qui EXERCE la ceinture.
 * ⛔ Ne pas le remplacer par « fruits de mer » : ce libellé ne rend que
 * `fruits_de_mer`, hors catalogue, et l'arme ci-dessous refusera d'écrire.
 *
 * ⚠️ IL EST SURCHARGEABLE, ET C'EST CE QUI REND L'ARME PROUVABLE. Une garde
 * paramétrée par sa propre constante reste verte quand on change la constante :
 * il faut pouvoir la MUTER depuis l'extérieur pour la voir mordre. D'où
 *
 *     FIXTURE_ALLERGY_LABEL="fruits de mer" deno run … → exit 1, RIEN d'écrit
 *
 * L'arme passe avant toute connexion, donc un libellé refusé ne touche pas la
 * base. Un libellé ACCEPTÉ mais différent, lui, ajoutera une seconde ligne
 * d'allergie à la même bouche — c'est un geste explicite, pas un accident.
 */
const ALLERGY_LABEL = Deno.env.get("FIXTURE_ALLERGY_LABEL") ?? "arachide";

/**
 * ⛔ L'OBJECTIF DU MINEUR — ET DEPUIS `S4`, LA BASE LE REFUSE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE SCRIPT N'EST PLUS REJOUABLE TEL QUEL, ET C'EST VOULU.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La migration `20260822041500` (lot `S4`, décision §⑥ n° 15 du 2026-08-21)
 * ferme les QUATRE portes d'écriture d'un objectif de poids sur une bouche
 * mineure. La précision n° 2 de cette fixture — « le mineur porte un des deux
 * objectifs opposés » — demande exactement ce que la base refuse désormais.
 *
 * ⚠️ CE QUI EST CASSÉ EST LA RECONSTRUCTION, PAS LA FIXTURE. `S4` ne corrige
 * PAS les lignes existantes : le foyer `b1959752-…` est en base avec `Anouk`
 * (2011-05-20, `muscle_gain`) et y reste. `V0-D` et la vérification de fin de
 * chaque vague continuent de fonctionner sur lui. Ce qui ne se rejoue plus,
 * c'est ce fichier sur une base neuve.
 *
 * ⛔ AUCUNE EXCEPTION N'EST DEMANDÉE À LA GARDE — une garde à exception n'est
 * pas une garde. Le script s'ARRÊTE, avec un motif nommé, AVANT d'écrire quoi
 * que ce soit. Il n'écrit pas une fixture amputée en silence, et il ne
 * réclame pas de porte dérobée.
 *
 * ── LES DEUX ISSUES, ET AUCUNE N'EST GRATUITE (fiche `S4`, `risque`) ──────
 *   · la fixture PERD sa précision n° 2 — `weighedPortionMembers` n'est plus
 *     exercé sur un mineur, et le lot `L6′` perd le seuil « 0 mineur » qui
 *     prouve que le mineur est EXCLU du grammage ;
 *   · ou la garde gagne une exception — refusé.
 * ⇒ Le choix appartient au propriétaire ; ce script ne le prend pas à sa
 *   place. Fiche `S4-c` ouverte pour ça.
 *
 * ⚠️ SURCHARGEABLE, EXACTEMENT COMME `FIXTURE_ALLERGY_LABEL`, ET POUR LA MÊME
 * RAISON : une garde paramétrée par sa propre constante reste verte quand on
 * change la constante. Il faut pouvoir la muter DEPUIS L'EXTÉRIEUR pour la
 * voir mordre dans les deux sens :
 *
 *     (défaut)                        deno run … → exit 1, RIEN d'écrit
 *     FIXTURE_MINOR_GOAL=maintenance  deno run … → l'arme passe
 *
 * ⛔ Et `maintenance` N'EST PAS un contournement de `S4` : la base l'accepte
 * sur un mineur (c'est l'arbitrage ① de la migration — l'énergie d'un mineur
 * EST une maintenance calculée sur son âge). C'est une fixture RÉDUITE, qui
 * perd la précision n° 2, et la bannière ci-dessous le dit à voix haute.
 */
const MINOR_GOAL = Deno.env.get("FIXTURE_MINOR_GOAL") ?? "muscle_gain";

/** Le corps d'une bouche, tel que `SetupPage` le collecte. */
interface FixtureBody {
  heightCm: number;
  weightKg: number;
  gender: "male" | "female" | "other";
  activityLevel: "sedentary" | "on_feet" | "trains_some" | "trains_hard" | null;
  dayActivity: "seated" | "on_feet" | "physical_job" | null;
  sportFrequency: "none" | "1_2" | "3_4" | "5_plus" | null;
  appetite: "small" | "average" | "large" | null;
}

interface FixtureMouth {
  firstName: string;
  birthDate: string;
  /** `null` = aucune direction posée. */
  goal: "fat_loss" | "maintenance" | "muscle_gain" | null;
  /** LES DEUX OU AUCUN — miroir de `keel_household_set_member_target`. */
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
  diet: "omnivore" | "vegetarian" | "vegan" | "pescatarian" | null;
  allergies: string[];
  /** `[]` = présente toute la fenêtre. */
  awayDays: Array<{ day: string; kind: "away" | "eating_out"; slots: string[] }>;
  body: FixtureBody;
  /** À quoi cette bouche sert dans la fixture — pour le journal. */
  why: string;
}

/**
 * LES TROIS BOUCHES SANS COMPTE.
 *
 * ⚠️ SANS COMPTE, ET C'EST LE CAS NOMINAL — pas une économie. C'est l'état
 * dont `restrictionFlagOf` rend `false` (`no_account`), et le harnais QA
 * plafonne de toute façon à 3 sièges d'essai : un 4ᵉ élève à compte plante le
 * run en cours.
 *
 * ⚠️ LE VÉGANE ET L'ALLERGIQUE SONT DEUX BOUCHES DIFFÉRENTES. Fondus en une
 * seule, `dishBearingMembers` ne produirait qu'UN contenant et le lot `C1` (la
 * contamination croisée) n'aurait pas d'objet.
 *
 * ⚠️ LE MINEUR PORTE UN DES DEUX OBJECTIFS OPPOSÉS, sinon
 * `weighedPortionMembers` n'est jamais exercé sur lui — c'est la cinquième
 * surface du mineur. Il porte `muscle_gain` et PAS `fat_loss` : la base
 * compte déjà deux mineurs en `fat_loss`, et en ajouter un troisième
 * déplacerait la `mesure AVANT` de `S4` sans rien exercer de plus. Il ne
 * reçoit PAS de cible chiffrée non plus : `weighedPortionMembers` ne lit que
 * `goal`, donc une cible sur un enfant serait une surface de plus pour rien.
 */
const MOUTHS: FixtureMouth[] = [
  {
    firstName: "Malo",
    birthDate: "1992-07-09",
    goal: "fat_loss",
    targetWeightKg: 72,
    paceKgPerWeek: 0.4,
    diet: "vegan",
    allergies: [],
    awayDays: [],
    body: {
      heightCm: 181,
      weightKg: 78,
      gender: "male",
      activityLevel: "trains_some",
      dayActivity: "seated",
      sportFrequency: "3_4",
      appetite: "average",
    },
    why: "① le végane · ④ le premier des deux objectifs opposés (fat_loss)",
  },
  {
    firstName: "Anouk",
    birthDate: "2011-05-20",
    // ⛔ REFUSÉ PAR LA BASE DEPUIS `S4` (migration `20260822041500`). Voir
    // `MINOR_GOAL` et `minorGoalOrDie()` : le script s'arrête avant d'écrire.
    goal: MINOR_GOAL as FixtureMouth["goal"],
    targetWeightKg: null,
    paceKgPerWeek: null,
    diet: null,
    allergies: [],
    awayDays: [],
    body: {
      heightCm: 162,
      weightKg: 50,
      gender: "female",
      activityLevel: "trains_some",
      dayActivity: "seated",
      sportFrequency: "3_4",
      appetite: "average",
    },
    why: "② le mineur · ④ le second objectif (muscle_gain), porté par LUI",
  },
  {
    firstName: "Yanis",
    birthDate: "1989-11-02",
    goal: "maintenance",
    targetWeightKg: null,
    paceKgPerWeek: null,
    // ⑦ LE SECOND RÉGIME DÉCLARÉ — lot `V0-C-quater`, 2026-08-22.
    //
    // ⛔ SANS LUI, `regime_belt.mouths` NE PEUT VALOIR QUE 1, et le seuil ③ de
    // `V0-D` est manqué quelle que soit la génération : `mouths` compte les
    // bouches qui portent un régime DÉCLARÉ (`meal_generation.ts`,
    // `mouthRegimes.size`), pas les bouches à table. Malo était le seul.
    //
    // ⚠️ POURQUOI YANIS, ET PAS CAMILLE. `keel_household_roster_for` ne lit
    // `household_members.diet` que pour une bouche SANS COMPTE ; dès qu'il y a
    // un compte, la source est `student_safety_constraints.diet_ref`. Camille
    // est la seule bouche à compte : écrire cette colonne sur elle serait un
    // NO-OP SILENCIEUX — et la RPC le REFUSE (`has_account`), exprès. Yanis est
    // majeur, sans compte, et porte déjà l'allergie `medical` et l'absence
    // partielle : le régime le rend divergent SANS ajouter une bouche.
    // (Anouk est l'autre bouche sans compte — mineure ; on n'ajoute pas une
    // restriction alimentaire à une enfant pour ouvrir un compteur.)
    //
    // ⚠️ POURQUOI `vegetarian`, ET NI UN SECOND `vegan` NI RIEN. `dietDiverges`
    // rend `false` dès que `exclusionCount(own) >= exclusionCount(strictest)` :
    // un second végane refermerait la divergence au lieu de l'ouvrir, et
    // `omnivore` traverse `memberRegime` en `null` — il n'élève jamais
    // `mouths`. `vegetarian` est le barreau non-égal le PLUS PROCHE de `vegan`
    // dans l'emboîtement `pescatarian ⊂ vegetarian ⊂ vegan` : c'est le cas le
    // plus dur pour le `>=`, et c'est celui que `index.ts` nomme lui-même
    // (« un végétarien qui diverge d'une table végane est le cas qui sépare les
    // deux lectures »).
    diet: "vegetarian",
    allergies: [ALLERGY_LABEL],
    // ⑤ PARTIELLE, ET C'EST TOUT LE SUJET : des CRÉNEAUX nommés, jamais une
    // journée entière (une entrée sans `slots` vaut « toute la journée »). Les
    // deux `kind` sont représentés — `away` (absent) et `eating_out`
    // (l'occasion ESTIMÉE), qui ne suivent pas le même chemin de lecture.
    awayDays: [
      { day: "wed", kind: "away", slots: ["lunch", "dinner"] },
      { day: "sat", kind: "eating_out", slots: ["dinner"] },
    ],
    body: {
      heightCm: 175,
      weightKg: 72,
      gender: "male",
      activityLevel: "on_feet",
      dayActivity: "physical_job",
      sportFrequency: "1_2",
      appetite: "large",
    },
    why: "③ l'allergie `medical` · ⑤ l'absence partielle · ⑦ le SECOND régime déclaré",
  },
];

/** Le corps du maître. Il a un compte : ni régime ni objectif par cette porte. */
const MASTER_BODY: FixtureBody = {
  heightCm: 168,
  weightKg: 62,
  gender: "female",
  activityLevel: "on_feet",
  dayActivity: "seated",
  sportFrequency: "1_2",
  appetite: "average",
};

// ---------------------------------------------------------------------------
// L'ARME — elle passe AVANT toute écriture
// ---------------------------------------------------------------------------

/**
 * Le `allergen_ref` catalogué que le libellé porte, ou `null`.
 *
 * ⚠️ ON N'INTERROGE PAS LA TABLE, ON APPELLE LE PRODUIT. `householdAllergenRefs`
 * est ce que `generate-household-meal-v1` appelle réellement, et
 * `surfaceFormsFor` est ce que la ceinture de sortie consulte. Recopier l'une
 * des deux ici ferait une seconde règle, qui divergerait au premier correctif.
 */
function resolvedCatalogRef(label: string): { ref: string; forms: string[] } | null {
  for (const ref of householdAllergenRefs(label)) {
    const forms = surfaceFormsFor(ref);
    if (forms.length > 0) return { ref, forms };
  }
  return null;
}

function armOrDie(): { ref: string; forms: string[] } {
  const resolved = resolvedCatalogRef(ALLERGY_LABEL);
  if (!resolved) {
    console.error(
      [
        "",
        "⛔ ARRÊT — l'allergène de la fixture NE RÉSOUT PAS.",
        "",
        `   libellé   : « ${ALLERGY_LABEL} »`,
        `   refs      : ${JSON.stringify(householdAllergenRefs(ALLERGY_LABEL))}`,
        "   formes    : AUCUN de ces refs n'est dans ALLERGEN_SURFACE_FORMS.",
        "",
        "   Écrire cette fixture produirait une allergie que la ceinture de",
        "   sortie ne peut pas voir : elle chercherait une chaîne qui n'existe",
        "   nulle part, et le lot mesurerait une garde désarmée en croyant",
        "   mesurer une garde. C'est le défaut mesuré sur `fruits_de_mer`.",
        "",
        "   Répare l'UNE des deux : choisis un libellé catalogué, ou ajoute la",
        "   clé à `_shared/keel/allergen_surface_forms.ts` (à la main, une paire",
        "   à la fois — jamais un matcher).",
        "",
      ].join("\n"),
    );
    Deno.exit(1);
  }
  console.log(
    `arme ✓ « ${ALLERGY_LABEL} » → \`${resolved.ref}\` · ${resolved.forms.length} formes de surface : [${resolved.forms.join(", ")}]`,
  );
  return resolved;
}

/**
 * ⛔ LA SECONDE ARME — `S4` A FERMÉ LA PRÉCISION N° 2 DE CETTE FIXTURE.
 *
 * Elle passe AVANT toute connexion, exactement comme `armOrDie` : un script
 * qui découvrirait le refus au 7ᵉ appel RPC aurait déjà écrit un compte, un
 * profil, un foyer et deux bouches, et laisserait derrière lui un foyer à
 * moitié bâti qu'il faudrait démonter à la main.
 *
 * ⚠️ ET SURTOUT : IL NE S'ARRÊTE PAS EN SILENCE. Sans cette arme, le script
 * recevrait `{"ok": false, "reason": "goal_not_for_minor"}` de
 * `keel_household_add_member` et lèverait un `Error` générique au milieu d'un
 * foyer partiel — un message qui NOMME la RPC, jamais la décision. Le
 * propriétaire lirait « la fixture est cassée » au lieu de « une garde de
 * sécurité, posée exprès, refuse cette fixture ». Ce sont deux phrases
 * opposées, et la seconde est la vraie.
 */
function minorGoalOrDie(): void {
  // ⚠️ LE `as` DE `MINOR_GOAL` EST DÉSARMÉ SANS CE CONTRÔLE. Un cast sur une
  // valeur qui vient de l'environnement ne vérifie rien: `FIXTURE_MINOR_GOAL=x`
  // passerait le typecheck et se ferait refuser par `bad_goal` au 7ᵉ appel
  // RPC, au milieu d'un foyer à moitié bâti.
  if (!["fat_loss", "maintenance", "muscle_gain"].includes(MINOR_GOAL)) {
    console.error(
      `\n⛔ ARRÊT — \`FIXTURE_MINOR_GOAL=${MINOR_GOAL}\` n'est pas un objectif.` +
        "\n   Valeurs acceptées : fat_loss · maintenance · muscle_gain" +
        "\n   (et `fat_loss`/`muscle_gain` sur le mineur sont refusés par `S4`).\n",
    );
    Deno.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const blocked = MOUTHS.filter((m) =>
    (m.goal === "fat_loss" || m.goal === "muscle_gain") &&
    ageStateFromVerdict(assessBirthDate(m.birthDate, today)) === "minor"
  );

  if (blocked.length === 0) {
    if (MINOR_GOAL !== "muscle_gain") {
      console.warn(
        [
          "",
          `⚠️  FIXTURE RÉDUITE — \`FIXTURE_MINOR_GOAL=${MINOR_GOAL}\` est posé.`,
          "   Le mineur ne porte PLUS un des deux objectifs opposés : la",
          "   précision n° 2 est PERDUE. `weighedPortionMembers` n'est pas",
          "   exercé sur lui, et le seuil « 0 mineur » du lot `L6′` ne prouve",
          "   plus rien. C'est un choix explicite, pas un défaut — mais il ne",
          "   doit pas passer inaperçu.",
          "",
        ].join("\n"),
      );
    } else {
      console.log("arme ✓ aucun mineur ne porte d'objectif directionnel");
    }
    return;
  }

  console.error(
    [
      "",
      "⛔ ARRÊT — `S4` REFUSE LA PRÉCISION N° 2 DE CETTE FIXTURE.",
      "",
      ...blocked.map((m) =>
        `   bouche    : ${m.firstName} (${m.birthDate}) — objectif \`${m.goal}\``
      ),
      "   refus     : `goal_not_for_minor`",
      "   posé par  : supabase/migrations/20260822041500_aucun_objectif_de_poids_sur_un_mineur.sql",
      "   décision  : plan de mise en œuvre §⑥ n° 15 (2026-08-21) —",
      "               « Aucun objectif de poids sur un mineur. »",
      "",
      "   ⚠️ CE N'EST PAS UNE PANNE. Les quatre portes d'écriture d'un",
      "   objectif de poids sur une bouche mineure sont fermées EXPRÈS, et",
      "   cette fixture demande précisément ce qu'elles refusent.",
      "",
      "   ⚠️ ET LA FIXTURE EN BASE, ELLE, SURVIT. `S4` ne corrige pas les",
      "   lignes existantes : le foyer `b1959752-…` porte toujours Anouk",
      "   (2011-05-20, muscle_gain). `V0-D` et la vérification de fin de",
      "   chaque vague tournent encore dessus. C'est la RECONSTRUCTION sur",
      "   une base neuve qui est fermée, pas la fixture.",
      "",
      "   ⛔ AUCUNE EXCEPTION NE SERA AJOUTÉE À LA GARDE — une garde à",
      "   exception n'est pas une garde. Les deux issues, et aucune n'est",
      "   gratuite (fiche `S4`, `risque` ; fiche `S4-c`) :",
      "",
      "     ① la fixture perd sa précision n° 2 :",
      "          FIXTURE_MINOR_GOAL=maintenance deno run …",
      "        ⇒ `weighedPortionMembers` n'est plus exercé sur un mineur, et",
      "          le lot `L6′` perd le seuil « 0 mineur » qui prouve que le",
      "          mineur est EXCLU du grammage.",
      "        ⛔ ET ÇA COÛTE UNE LIGNE DE PLUS QUE PRÉVU, mesuré : la",
      "          CONDITION ④ tombe aussi. Le `muscle_gain` de ce foyer était",
      "          porté PAR LA MINEURE ; sans lui, plus personne ne porte la",
      "          seconde direction et les « deux objectifs opposés »",
      "          n'existent plus. `verify()` le dit, et n'appelle pas ça un",
      "          succès.",
      "",
      "     ② la précision n° 2 se réécrit ailleurs — un mineur exercé par",
      "        une autre voie que son objectif. Personne ne l'a conçue.",
      "",
      "   Le choix appartient au propriétaire. Ce script ne le prend pas à sa",
      "   place, et il n'écrit RIEN tant qu'il n'est pas fait.",
      "",
    ].join("\n"),
  );
  Deno.exit(1);
}

// ---------------------------------------------------------------------------
// La pile locale
// ---------------------------------------------------------------------------

async function envOf(name: string): Promise<string> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  // Même repli que `scripts/get-jwt.sh` : le fichier d'environnement local.
  // ⚠️ L'`URL` est passée telle quelle, PAS son `.pathname` : le dépôt vit dans
  // un dossier dont le nom porte une espace, et `.pathname` la rend `%20`.
  const path = new URL("../supabase/.env", import.meta.url);
  let text = "";
  try {
    text = await Deno.readTextFile(path);
  } catch {
    throw new Error(`${name} absent de l'environnement, et supabase/.env illisible`);
  }
  for (const line of text.split("\n")) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].trim();
  }
  throw new Error(`${name} absent de l'environnement ET de supabase/.env`);
}

let API_URL = "";
let ANON_KEY = "";
let SERVICE_ROLE_KEY = "";

interface Reply {
  status: number;
  body: unknown;
}

async function call(path: string, init: RequestInit & { bearer: string }): Promise<Reply> {
  const { bearer, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      apikey: bearer === SERVICE_ROLE_KEY ? SERVICE_ROLE_KEY : ANON_KEY,
      authorization: `Bearer ${bearer}`,
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = raw === "" ? null : JSON.parse(raw);
  } catch { /* du texte, on le garde tel quel */ }
  return { status: res.status, body };
}

/**
 * UNE RPC `keel_household_*`, APPELÉE COMME L'ÉCRAN L'APPELLE.
 *
 * Elles ne LÈVENT pas : elles rendent `{ok:false, reason:'…'}`. Un script qui
 * ne lit pas `ok` écrirait la moitié d'une fixture en affichant « terminé »,
 * ce qui est très exactement le mode d'échec que ce dépôt paie en boucle. On
 * lève ici, avec le motif nommé.
 */
async function rpc(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { status, body } = await call(`/rest/v1/rpc/${name}`, {
    method: "POST",
    bearer: token,
    body: JSON.stringify(args),
  });
  if (status >= 300) {
    throw new Error(`${name} → HTTP ${status} : ${JSON.stringify(body)}`);
  }
  const out = (body ?? {}) as Record<string, unknown>;
  if (out.ok === false) {
    throw new Error(`${name} → refus « ${String(out.reason)} »`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Le compte maître
// ---------------------------------------------------------------------------

async function signIn(): Promise<{ token: string; userId: string } | null> {
  const res = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: MASTER_EMAIL, password: MASTER_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) return null;
  return { token: String(body.access_token), userId: String(body.user?.id ?? "") };
}

/**
 * LE COMPTE MAÎTRE, TROUVÉ OU CRÉÉ — dans cet ordre, et l'ordre est la clé de
 * rejouabilité : on essaie de se CONNECTER d'abord. Une création qui échoue
 * sur « e-mail déjà pris » serait un chemin d'exception ; ici le cas nominal
 * du second passage est le cas nominal tout court.
 *
 * ⚠️ Un foyer a besoin d'un propriétaire avec compte : `keel_household_create`
 * refuse `not_authenticated`. C'est la SEULE bouche à compte de la fixture.
 */
async function masterAccount(): Promise<{ token: string; userId: string }> {
  const existing = await signIn();
  if (existing) {
    console.log(`maître ✓ ${MASTER_EMAIL} déjà là (${existing.userId})`);
    return existing;
  }
  const { status, body } = await call("/auth/v1/admin/users", {
    method: "POST",
    bearer: SERVICE_ROLE_KEY,
    body: JSON.stringify({
      email: MASTER_EMAIL,
      password: MASTER_PASSWORD,
      email_confirm: true,
      user_metadata: { fixture: "V0-C", full_name: MASTER_FULL_NAME },
    }),
  });
  if (status >= 300) {
    throw new Error(`création du compte maître → HTTP ${status} : ${JSON.stringify(body)}`);
  }
  const fresh = await signIn();
  if (!fresh) throw new Error("compte maître créé mais non connectable");
  console.log(`maître + ${MASTER_EMAIL} créé (${fresh.userId})`);
  return fresh;
}

/**
 * LE PROFIL DU MAÎTRE — écrit AVANT le foyer, et ce n'est pas cosmétique :
 * `keel_household_create` RECOPIE `profiles.full_name` et `profiles.birth_date`
 * sur la ligne du propriétaire, une fois, puis elle vit sa vie.
 */
async function ensureProfile(token: string, userId: string): Promise<void> {
  const { status, body } = await call("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    bearer: token,
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: userId,
      full_name: MASTER_FULL_NAME,
      birth_date: MASTER_BIRTH_DATE,
      gender: MASTER_BODY.gender,
      locale: FIXTURE_LOCALE,
      country: FIXTURE_COUNTRY,
      timezone: FIXTURE_TIMEZONE,
      onboarding_completed: true,
    }),
  });
  if (status >= 300) throw new Error(`profiles → HTTP ${status} : ${JSON.stringify(body)}`);
  console.log(`profil ✓ locale=${FIXTURE_LOCALE} country=${FIXTURE_COUNTRY} tz=${FIXTURE_TIMEZONE}`);
}

/**
 * LA LIGNE `student_goals` DU MAÎTRE — le miroir exact de
 * `api/household.ts :: createOwnerGoalRow`, `ignoreDuplicates` compris.
 *
 * Elle ne dimensionne AUCUNE portion : elle porte la situation, les
 * contraintes pratiques et la langue d'écriture. Sans elle,
 * `generate-household-meal-v1` rend `goal_required` (409) et `V0-D` n'a rien à
 * mesurer. `maintenance` exprès : ajouter une troisième direction brouillerait
 * les DEUX objectifs opposés que la fixture existe pour exercer.
 */
async function ensureOwnerGoal(token: string, userId: string): Promise<void> {
  const { status, body } = await call("/rest/v1/student_goals?on_conflict=user_id", {
    method: "POST",
    bearer: token,
    headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      goal: "maintenance",
      // `en-GB` : la valeur que TOUS les écrivains de cette colonne sèment.
      // La langue du PLAN, elle, vient de `profiles.locale` — deux colonnes,
      // deux questions.
      content_locale: "en-GB",
    }),
  });
  if (status >= 300) throw new Error(`student_goals → HTTP ${status} : ${JSON.stringify(body)}`);
  console.log("objectif du maître ✓ (student_goals, maintenance)");
}

// ---------------------------------------------------------------------------
// Le foyer
// ---------------------------------------------------------------------------

interface RosterRow {
  member_id: string;
  user_id: string | null;
  first_name: string;
  age_state: string;
  role: string;
  goal: string | null;
  diet: string | null;
  away_days: unknown;
}

async function roster(token: string): Promise<RosterRow[]> {
  const { status, body } = await call("/rest/v1/rpc/keel_household_roster", {
    method: "POST",
    bearer: token,
    body: "{}",
  });
  if (status >= 300) throw new Error(`roster → HTTP ${status} : ${JSON.stringify(body)}`);
  return (body ?? []) as RosterRow[];
}

/**
 * LE FOYER, TROUVÉ OU CRÉÉ.
 *
 * ⚠️ C'EST ICI QU'EST LA REJOUABILITÉ, ET ELLE EST TENUE PAR LA BASE.
 * `household_members_one_per_user` est UNIQUE sur `user_id` : ce compte ne
 * peut appartenir qu'à un foyer. Un roster non vide veut donc dire « le foyer
 * de fixture existe », et `keel_household_create` refuserait de toute façon
 * par `already_in_household`. Aucun second foyer n'est atteignable.
 */
async function ensureHousehold(token: string): Promise<RosterRow[]> {
  const current = await roster(token);
  if (current.length > 0) {
    console.log(`foyer ✓ déjà là, ${current.length} bouche(s)`);
    return current;
  }
  const created = await rpc(token, "keel_household_create", { p_name: HOUSEHOLD_NAME });
  console.log(`foyer + créé ${String(created.household_id)}`);
  return await roster(token);
}

async function setBody(token: string, memberId: string, b: FixtureBody): Promise<void> {
  await rpc(token, "keel_household_set_member_body", {
    p_member: memberId,
    p_height_cm: b.heightCm,
    p_weight_kg: b.weightKg,
    p_gender: b.gender,
    p_activity_level: b.activityLevel,
    p_day_activity: b.dayActivity,
    p_sport_frequency: b.sportFrequency,
    p_activity_axes_asked: true,
    p_takes_dessert: null,
    p_takes_cheese: null,
    p_takes_bread: null,
    p_meal_structure_asked: false,
    p_appetite: b.appetite,
    p_appetite_asked: true,
  });
}

/**
 * UNE BOUCHE, POSÉE DANS L'ORDRE DE L'ÉCRAN.
 *
 * `SetupPage.tsx :: addMouth` fait, dans cet ordre exact :
 *   ① `keel_household_add_member(prénom, DATE, OBJECTIF)` — les trois d'un coup
 *   ② `keel_household_set_member_body`
 *   ③ `keel_household_set_member_target`
 *   ④ les allergies
 *   ⑤ le régime (sauté quand la bouche a un compte : `has_account`)
 *
 * ⚠️ ① EST LE POINT QUE `S4` DOIT FERMER, ET IL FAUT LE LIRE EN ENTIER. La
 * revue sécurité décrit un contournement DANS LE TEMPS (ajouter sans date,
 * poser l'objectif, saisir la date ensuite). Mesuré le 2026-08-21 : ce détour
 * n'est plus nécessaire. `goal_not_for_minor` a été retiré des DEUX portes
 * d'écriture le 2026-08-18 (migration `20260818100000`), et
 * `target_not_for_minor` n'a jamais existé. L'écran envoie donc la date de
 * naissance d'un enfant ET sa direction dans le MÊME appel, et la base
 * accepte. Cette fixture n'est constructible qu'avant `S4` ; `S4` la rendra
 * irreproductible telle quelle, et c'est voulu.
 */
async function ensureMouth(
  token: string,
  present: RosterRow[],
  m: FixtureMouth,
): Promise<string> {
  const found = present.find((r) => r.first_name === m.firstName);
  let memberId: string;
  if (found) {
    memberId = found.member_id;
    console.log(`  ${m.firstName} ✓ déjà là (${memberId})`);
    // Les portes de date et d'objectif sont des `update` idempotents : on les
    // rejoue pour qu'un foyer à moitié écrit se répare au second passage.
    await rpc(token, "keel_household_set_member_birth_date", {
      p_member: memberId,
      p_birth_date: m.birthDate,
    });
    await rpc(token, "keel_household_set_member_goal", { p_member: memberId, p_goal: m.goal });
  } else {
    const added = await rpc(token, "keel_household_add_member", {
      p_first_name: m.firstName,
      p_birth_date: m.birthDate,
      p_goal: m.goal,
    });
    memberId = String(added.member_id);
    console.log(`  ${m.firstName} + ajouté (${memberId})`);
  }

  await setBody(token, memberId, m.body);
  await rpc(token, "keel_household_set_member_target", {
    p_member: memberId,
    p_target_weight_kg: m.targetWeightKg,
    p_pace_kg_per_week: m.paceKgPerWeek,
  });
  for (const label of m.allergies) {
    await rpc(token, "keel_household_add_allergy", { p_member: memberId, p_label: label });
  }
  if (m.diet) {
    await rpc(token, "keel_household_set_member_diet", { p_member: memberId, p_diet: m.diet });
  }
  await rpc(token, "keel_household_set_member_away", {
    p_member: memberId,
    p_away: m.awayDays,
  });
  return memberId;
}

// ---------------------------------------------------------------------------
// LA VÉRIFICATION — le script se contrôle lui-même
// ---------------------------------------------------------------------------

/**
 * LES SIX CONDITIONS, RELUES DEPUIS LA BASE, PAR LE JETON DU MAÎTRE.
 *
 * ⚠️ RELUES, PAS DÉDUITES DE CE QU'ON VIENT D'ÉCRIRE. Un script qui affirme
 * l'état qu'il croit avoir posé est un script qui ne vérifie rien : c'est
 * exactement comme ça qu'un lot désarmé ressemble à un lot qui marche.
 */
async function verify(token: string, ref: string): Promise<void> {
  const rows = await roster(token);
  const { status, body } = await call(
    "/rest/v1/household_member_allergies?select=member_id,label",
    { method: "GET", bearer: token },
  );
  if (status >= 300) throw new Error(`allergies → HTTP ${status} : ${JSON.stringify(body)}`);
  const allergies = (body ?? []) as Array<{ member_id: string; label: string }>;

  const awayOf = (r: RosterRow) => (Array.isArray(r.away_days) ? r.away_days : []) as Array<
    Record<string, unknown>
  >;
  const vegan = rows.filter((r) => r.diet === "vegan");
  // ⑦ LES RÉGIMES DÉCLARÉS — lot `V0-C-quater`.
  //
  // ⚠️ `omnivore` N'EN EST PAS UN, ET C'EST TOUTE LA MESURE. `memberRegime` le
  // rend `null` : une bouche `omnivore` n'entre PAS dans `mouthRegimes`, donc
  // elle n'élève PAS `regime_belt.mouths`. Compter la colonne non vide au lieu
  // des trois jetons restrictifs rendrait un contrôle vert sur une fixture qui
  // laisse le compteur à 1 — exactement le zéro que ce dépôt paie en boucle.
  const declared = rows.filter((r) =>
    r.diet === "vegan" || r.diet === "vegetarian" || r.diet === "pescatarian"
  );
  const distinctRegimes = new Set(declared.map((r) => r.diet));
  const minors = rows.filter((r) => r.age_state === "minor");
  const fatLoss = rows.filter((r) => r.goal === "fat_loss");
  const muscle = rows.filter((r) => r.goal === "muscle_gain");
  const noAccount = rows.filter((r) => r.user_id === null);
  // PARTIELLE = au moins une entrée qui NOMME des créneaux. Une entrée sans
  // `slots` vaut « toute la journée » (`parseAwayDays`), donc elle ne compte
  // pas ici : ce serait une autre condition.
  const partial = rows.filter((r) =>
    awayOf(r).some((e) => Array.isArray(e.slots) && (e.slots as unknown[]).length > 0)
  );
  const minorWithGoal = minors.filter((r) => r.goal === "fat_loss" || r.goal === "muscle_gain");
  const allergicMemberIds = new Set(allergies.map((a) => a.member_id));
  const veganIds = new Set(vegan.map((r) => r.member_id));
  const distinctVeganAllergic = [...allergicMemberIds].some((id) => !veganIds.has(id));

  // ⛔ CE QUE `S4` EMPORTE QUAND ON PASSE PAR LA PORTE DE SORTIE.
  //
  // Avec `FIXTURE_MINOR_GOAL=maintenance`, DEUX lignes tombent — pas une :
  //   · la précision n° 2 (le mineur ne porte plus d'objectif) ;
  //   · ⛔ ET LA CONDITION ④, parce que le `muscle_gain` du foyer était PORTÉ
  //     PAR LA MINEURE. Plus personne ne porte la seconde direction.
  // Les compter comme des « conditions manquantes » ferait mourir le script
  // APRÈS avoir tout écrit, sur un message qui accuse la fixture au lieu de
  // nommer la garde. Les taire ferait pire : une fixture réduite qui se
  // présente comme complète. On les marque PERDUES PAR CHOIX, à voix haute.
  const reduced = MINOR_GOAL !== "fat_loss" && MINOR_GOAL !== "muscle_gain";

  /** `[tenue, libellé, perdue par CHOIX plutôt que manquante]` */
  type FixtureCheck = [boolean, string, boolean];
  const checks: FixtureCheck[] = [
    [rows.length === 4, `4 bouches (${rows.length})`, false],
    [vegan.length >= 1, `① un végane (${vegan.length})`, false],
    [minors.length >= 1, `② un mineur (${minors.length})`, false],
    [allergies.length >= 1, `③ une allergie \`medical\` (${allergies.length})`, false],
    [
      fatLoss.length >= 1 && muscle.length >= 1,
      `④ deux objectifs opposés (fat_loss=${fatLoss.length}, muscle_gain=${muscle.length})`,
      reduced && muscle.length === 0,
    ],
    [partial.length >= 1, `⑤ une absence partielle (${partial.length})`, false],
    [noAccount.length >= 1, `⑥ au moins une bouche sans compte (${noAccount.length})`, false],
    [
      minorWithGoal.length >= 1,
      `précision 2 — le mineur porte un objectif (${minorWithGoal.map((r) => `${r.first_name}:${r.goal}`).join(", ") || "aucun"})`,
      reduced,
    ],
    [
      distinctVeganAllergic,
      "précision 3 — le végane et l'allergique sont deux bouches différentes",
      false,
    ],
    [surfaceFormsFor(ref).length > 0, `précision 1 — surfaceFormsFor('${ref}') non vide`, false],
    [
      declared.length >= 2 && distinctRegimes.size >= 2,
      `⑦ DEUX régimes déclarés, et pas deux fois le même (${
        declared.map((r) => `${r.first_name}:${r.diet}`).join(", ") || "aucun"
      })`,
      false,
    ],
  ];

  console.log("\n── les six conditions, relues en base ─────────────────────");
  let failed = 0;
  const lost: string[] = [];
  for (const [ok, label, byChoice] of checks) {
    if (ok) {
      console.log(`  ✓ ${label}`);
    } else if (byChoice) {
      console.log(`  ⛔ PERDUE PAR CHOIX (S4) — ${label}`);
      lost.push(label);
    } else {
      console.log(`  ✗ ${label}`);
      failed++;
    }
  }
  console.log("\n── le foyer ──────────────────────────────────────────────");
  for (const r of rows) {
    console.log(
      `  ${r.first_name.padEnd(8)} ${r.member_id}  role=${r.role.padEnd(6)} age=${r.age_state.padEnd(7)} goal=${String(r.goal ?? "—").padEnd(12)} diet=${String(r.diet ?? "—").padEnd(10)} compte=${r.user_id ? "oui" : "non"}`,
    );
  }
  if (failed > 0) {
    console.error(`\n⛔ ${failed} condition(s) manquante(s) — la fixture n'exerce pas ce qu'elle prétend.`);
    Deno.exit(1);
  }
  if (lost.length > 0) {
    // ⚠️ EXIT 0, ET UNE BANNIÈRE QU'ON NE PEUT PAS RATER. Le foyer est écrit
    // et utilisable; ce qu'il ne PROUVE plus doit voyager avec lui, sans quoi
    // une vague suivante lira un seuil vert sur une fixture amputée.
    console.warn(
      [
        "",
        `⚠️  FIXTURE RÉDUITE — ${lost.length} ligne(s) perdue(s) par le lot \`S4\`.`,
        ...lost.map((l) => `      · ${l}`),
        "",
        "   Ce foyer N'EXERCE PLUS :",
        "     · `weighedPortionMembers` sur un mineur — c'est la 5ᵉ surface du",
        "       mineur, et le seuil « 0 mineur » du lot `L6′` ne prouve plus",
        "       rien : il devient vrai par construction, pas par la garde.",
        "     · la divergence de DIRECTION à table (une seule direction reste).",
        "",
        "   Rendre les deux lignes exigerait un objectif de poids sur une",
        "   enfant — ce que la base refuse depuis `20260822041500`, exprès.",
        "   Fiche `S4-c` : le choix appartient au propriétaire.",
        "",
      ].join("\n"),
    );
    return;
  }
  console.log("\n✓ la fixture porte les SIX conditions.");
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // ⛔ LES ARMES D'ABORD. Rien n'est écrit tant que l'allergène ne résout pas,
  // ni tant que la fixture demande à la base ce que `S4` lui refuse.
  const { ref } = armOrDie();
  minorGoalOrDie();

  API_URL = await envOf("SUPABASE_URL");
  ANON_KEY = await envOf("SUPABASE_ANON_KEY");
  SERVICE_ROLE_KEY = await envOf("SUPABASE_SERVICE_ROLE_KEY");
  console.log(`pile   ✓ ${API_URL}`);

  const { token, userId } = await masterAccount();
  await ensureProfile(token, userId);
  await ensureOwnerGoal(token, userId);

  const present = await ensureHousehold(token);
  const owner = present.find((r) => r.user_id === userId);
  if (!owner) throw new Error("le maître n'est pas dans son propre roster");
  await rpc(token, "keel_household_set_member_name", {
    p_member: owner.member_id,
    p_first_name: MASTER_FULL_NAME.split(" ")[0],
  });
  await rpc(token, "keel_household_set_member_birth_date", {
    p_member: owner.member_id,
    p_birth_date: MASTER_BIRTH_DATE,
  });
  await setBody(token, owner.member_id, MASTER_BODY);
  console.log(`  ${MASTER_FULL_NAME.split(" ")[0].padEnd(8)} ✓ maître (${owner.member_id})`);

  for (const m of MOUTHS) {
    await ensureMouth(token, present, m);
  }

  await verify(token, ref);
}

if (import.meta.main) {
  await main();
}
