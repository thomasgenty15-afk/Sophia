/**
 * ══════════════════════════════════════════════════════════════════════════
 * 2026-09-14 — COPIE DE `banc-lot-F.ts` QUI SAIT NE PAS DATER LE TITULAIRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CETTE COPIE N'EST PAS. Ce n'est pas un fork du banc : c'est le banc
 * du 2026-09-11 avec QUATRE différences, toutes visibles par `diff`, toutes
 * dans `scratchpad/`. Aucun fichier de `supabase/functions/**` n'est touché,
 * aucune variable d'environnement de production n'existe, et le drapeau qui
 * ouvre le cas (`--sans-naissance=1`) n'est lisible que par ce fichier-ci.
 *
 *   ① l'import du transport pointe le dossier d'origine ;
 *   ② les sorties tombent dans `scratchpad/2026-09-14-TITULAIRE-SANS-AGE/` —
 *      une autre session rejoue des tirs dans `sorties-lot-F/` ;
 *   ③ `--sans-naissance=1` ne pose PAS la date de naissance du titulaire, ni
 *      sur `profiles` ni sur sa ligne membre. Ce n'est pas un `UPDATE` : la
 *      date n'est jamais écrite, sur un compte que CE TIR vient de créer ;
 *   ④ `meta_bouche.birth_date` dit la vérité (`null`), pour que l'instrument
 *      ne mesure pas contre une date que la base ne porte pas.
 *
 * ⚠️ POURQUOI UNE COPIE ET PAS UNE OPTION DANS LE BANC. Une autre session
 * rejoue en parallèle des tirs de `banc-lot-F.ts` ; y écrire changerait son
 * fichier sous ses pieds. La copie est horodatée, et son `diff` est la preuve.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * LOT F ② — LE BANC D'INTÉGRATION SANS DÉPENSE MODÈLE
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   deno run --allow-read --allow-env --allow-net \
 *     scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts
 *
 * Ce qu'il fait, dans l'ordre :
 *
 *   ① lit `supabase/.env` (la MÊME configuration que `functions serve`) ;
 *   ② installe l'adaptateur fournisseur contrôlé (`transport-lot-F.ts`) ;
 *   ③ importe le VRAI handler — `Deno.serve` est capturé, aucun port ouvert ;
 *   ④ provisionne un compte de fixture `lotf.*@keeltest.dev` par les RPC DU
 *      PRODUIT (profil, objectif, coach maison, corps de la bouche) ;
 *   ⑤ appelle le handler avec un vrai jeton, corps `{intent, window}` ;
 *   ⑥ relit la ligne écrite et l'ÉCRIT en fixture, pour que les lecteurs
 *      API/UI la relisent (vitest, `relecture-lot-F.int.test.ts`).
 *
 * ⛔ AUCUNE SUPPRESSION. Le banc ne purge rien : il emploie un compte par cas
 * et une fenêtre qui ne chevauche pas. Les deux plans de la campagne
 * (`1f8a8988`, `1eada05b`) ne sont NI lus en écriture NI touchés.
 *
 * ⛔ AUCUNE DÉPENSE. Toute sortie réseau hors pile locale jette (voir la garde
 * de `installControlledTransport`). Le compte des appels fournigneurs est
 * publié à la fin, par nature.
 */
import {
  cannedFromFixtures,
  captureServeHandler,
  installControlledTransport,
  installerHorloge,
  loadDotEnv,
  retaillerReponse,
} from "../2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts";
import {
  cookingAskedToday,
  slotsUnservableToday,
} from "../../supabase/functions/_shared/keel/plan_hours.ts";
import { withoutSpentFirstDay } from "../../supabase/functions/_shared/keel/meal_plan_window.ts";
import type { EatingOccasion } from "../../supabase/functions/_shared/keel/meal_generation.ts";

// ⚠️ `pathname` rend un chemin PERCENT-ENCODÉ : ce dépôt s'appelle « Sophia 2 »
// et l'espace y devient `%20`. Sans ce décodage, chaque lecture échoue en
// silence (`loadDotEnv` rend `{}`) et le banc se croit sans pile.
const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const FIXTURES = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures`;
const SORTIE = `${ROOT}scratchpad/2026-09-14-TITULAIRE-SANS-AGE/sorties`;

// ── ① L'ENVIRONNEMENT ─────────────────────────────────────────────────────
const dotenv = loadDotEnv(`${ROOT}supabase/.env`);
for (const [k, v] of Object.entries(dotenv)) {
  if (!Deno.env.get(k)) Deno.env.set(k, v);
}
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 3 §3.3 — `--reparation-reelle=<n>` : LE SEUL MODE PAYANT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ IL FAUT LE DEMANDER, ET DIRE COMBIEN. Sans ce drapeau, le banc remplace la
// clé par une sentinelle et rien ne peut sortir. Avec, il laisse passer les
// SEULS tours de RÉPARATION (jamais le premier jet — un parcours hybride fige
// le premier jet), et au plus `n` appels : le plafond vit dans le transport,
// pas seulement dans le handler.
//
// ⛔ LE PREMIER JET RESTE EN CONSERVE. « Chaque parcours est donc explicitement
// hybride, pas une nouvelle génération intégralement réelle. »
//
// ⚠️ LE MOT « FACTURÉ » EST IMPRIMÉ À CHAQUE APPEL, et le compte des appels
// réels sort dans la fixture. Un banc payant qui ressemble à un banc gratuit
// est exactement ce qu'on ne veut pas.
const REPARATION_REELLE = Number(
  Deno.args.find((a) => a.startsWith("--reparation-reelle="))?.slice(20) ?? "0",
);
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 3 §3.1 — `--premier-jet-reel` : LE TOUR 0 PART VRAIMENT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI IL EXISTE. `--reparation-reelle` ne paie QUE les tours > 0 : le
// premier jet reste en conserve, et c'est ce qui rend un parcours « hybride ».
// Le § 3.1 du plan demande autre chose — « lancer un premier jet RÉEL pour
// chacune des trois références » — c'est-à-dire la compétence générative du
// modèle sur une demande figée, mesurée séparément du bon fonctionnement du
// code. Sans ce drapeau, ce chiffre-là n'existe pas.
//
// ⛔ ET IL PASSE PAR LE BANC, PAS PAR KONG. `campagne-lot-F.ts` sort par le
// `functions serve` de l'humain : le runtime edge sert des `_shared` en CACHE
// (mémoire `edge-runtime-serves-stale-shared-modules`), donc un appel payant y
// mesurerait peut-être le code d'avant le chantier. Le banc importe le handler
// directement — code courant, et pas de coupure Kong à 150 s.
//
// ⚠️ IL SE CUMULE AVEC `--reparation-reelle`, et le plafond du transport est
// la SOMME. Un parcours entièrement réel se demande donc en toutes lettres.
const PREMIER_JET_REEL = Deno.args.includes("--premier-jet-reel");
/** Le plafond d'appels RÉELLEMENT facturés, tous tours confondus. */
const PLAFOND_REEL = (PREMIER_JET_REEL ? 1 : 0) + REPARATION_REELLE;
if (!Number.isInteger(REPARATION_REELLE) || REPARATION_REELLE < 0 || REPARATION_REELLE > 2) {
  console.error(
    `⛔ --reparation-reelle=${REPARATION_REELLE} : entier entre 0 et 2 ` +
      `(le plafond du produit est de deux réparations par demande).`,
  );
  Deno.exit(2);
}
if (PLAFOND_REEL === 0) {
  // ⛔ LA CLÉ RÉELLE EST REMPLACÉE PAR UNE SENTINELLE. L'adaptateur intercepte
  // déjà `api.openai.com` ; la sentinelle est la SECONDE ceinture : si un jour un
  // chemin sortait sans passer par `fetch` interceptable, il échouerait sur une
  // authentification refusée au lieu de facturer.
  Deno.env.set("OPENAI_API_KEY", "sk-lotf-transport-controle-aucune-depense");
  Deno.env.set("GEMINI_API_KEY", "lotf-transport-controle-aucune-depense");
} else {
  const cle = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
  if (!cle.startsWith("sk-")) {
    console.error(
      "⛔ le mode payant exige une vraie OPENAI_API_KEY dans supabase/.env.",
    );
    Deno.exit(2);
  }
  console.warn(
    `\n   💸💸 MODE PAYANT : au plus ${PLAFOND_REEL} appel(s) partiront ` +
      `réellement au fournisseur.\n` +
      `      · premier jet : ${PREMIER_JET_REEL ? "RÉEL" : "en conserve"}\n` +
      `      · réparations : ${REPARATION_REELLE} au plus\n` +
      `   ${
        PREMIER_JET_REEL && REPARATION_REELLE > 0
          ? "Ce parcours est ENTIÈREMENT RÉEL."
          : PREMIER_JET_REEL
          ? "Les réparations, elles, restent en conserve — parcours HYBRIDE à l'envers."
          : "Le premier jet reste en conserve — parcours HYBRIDE."
      }\n`,
  );
}
// ⛔ ET PAS DE STUB DE DISPONIBILITÉ : on veut la VRAIE branche fournisseur.
Deno.env.set("MEGA_TEST_MODE", "0");

const API = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!API || !ANON || !SVC) {
  console.error("⛔ pile locale absente de supabase/.env");
  Deno.exit(2);
}
const LOCAL_HOST = new URL(API).hostname;

// ── LE CAS À REJOUER ──────────────────────────────────────────────────────
const CAS = (Deno.args.find((a) => !a.startsWith("--")) ?? "perte").toLowerCase();
const CAS_DEF: Record<string, {
  requestId: string;
  email: string;
  fullName: string;
  firstName: string;
  birthDate: string;
  goal: string;
  targetWeight: number;
  pace: number;
  heightCm: number;
  weightKg: number;
}> = {
  perte: {
    requestId: "f5a3dd19-d47d-4f52-9678-536f2cfb3bc5",
    email: "lotf.perte@keeltest.dev",
    fullName: "Paul LotF",
    firstName: "Paul",
    birthDate: "1990-03-14",
    goal: "fat_loss",
    targetWeight: 78,
    pace: 0.5,
    heightCm: 178,
    weightKg: 88,
  },
  gain: {
    requestId: "ecaf04b2-354e-460f-b6c5-df81b54c5640",
    email: "lotf.gain@keeltest.dev",
    fullName: "Max LotF",
    firstName: "Max",
    birthDate: "1998-07-02",
    goal: "muscle_gain",
    targetWeight: 70,
    pace: 0.25,
    heightCm: 178,
    weightKg: 62,
  },
};
const cas = CAS_DEF[CAS];
if (!cas) {
  console.error(`⛔ cas inconnu : ${CAS} (perte | gain)`);
  Deno.exit(2);
}
// ⚠️ UN COMPTE PAR TIR, ET C'EST LA SEULE FAÇON DE NE RIEN SUPPRIMER.
// `intent: prepare_next` chaîne la fenêtre suivante après le dernier plan posé :
// un second tir sur le même compte tomberait sur d'autres NOMS DE JOUR que ceux
// de la réponse archivée. Le suffixe donne un compte neuf, et aucun `DELETE`
// n'est nécessaire.
const SUFFIXE = (Deno.args.find((a) => a.startsWith("--compte="))?.slice(9) ?? "").trim();
const EMAIL = SUFFIXE ? cas.email.replace("@", `.${SUFFIXE}@`) : cas.email;

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · C0 ⑤ — L'HORLOGE, AVANT TOUT IMPORT DU HANDLER
// ══════════════════════════════════════════════════════════════════════════
//
//   --horloge=2026-09-12T14:00:00+02:00
//
// ⛔ ELLE S'INSTALLE ICI ET PAS PLUS BAS. Le handler lit `new Date()` au moment
// où il traite la requête, mais les modules qu'il importe peuvent capturer
// `Date` à l'import ; installer après l'import laisserait deux horloges dans le
// même processus. Le plan interdit un interrupteur atteignable par une requête
// produit : c'est pour ça que ça vit dans le banc et pas sous
// `supabase/functions/**`.
const HORLOGE = Deno.args.find((a) => a.startsWith("--horloge="))?.slice(10) ?? "";
const horloge = HORLOGE ? installerHorloge(HORLOGE) : null;

/** L'appétit RÉELLEMENT posé sur la bouche — plus jamais `average` en dur. */
const APPETIT = (Deno.args.find((a) => a.startsWith("--appetit="))?.slice(10) ??
  "average") as "small" | "average" | "large";
if (!["small", "average", "large"].includes(APPETIT)) {
  console.error(`⛔ appétit inconnu : ${APPETIT} (small | average | large)`);
  Deno.exit(2);
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 §3 — `--rythmes-bouches=` : DES PRÉSENCES DIFFÉRENTES
//                SELON LE CRÉNEAU
// ══════════════════════════════════════════════════════════════════════════
//
//   --rythmes-bouches=;lunch,dinner
//        un rythme par bouche, séparés par `;`, dans l'ordre du roster.
//        Vide = « comme la maison » (les trois repas).
//
// ⛔ ET LA GRILLE ATTENDUE SUIT, BOUCHE PAR BOUCHE. C'est la moitié qui compte :
// le plan l'écrit — « leur dénominateur est la somme des cases personne-date-
// créneau RÉELLEMENT DEMANDÉES, jamais la taille du foyer multipliée
// aveuglément par les créneaux ». Avant ce lot, le banc posait la MÊME grille à
// tout le monde (`REPAS_DE_LA_MAISON`), donc une bouche qui ne déjeune pas
// aurait compté deux cases absentes que personne n'a demandées.
//
// ⚠️ LA RÈGLE DE LECTURE EST CELLE DU PRODUIT, RECOPIÉE DE `figer-demande.ts`
// (`slotsDe`) et de `slotContractsFor` : un rythme déclaré gagne, `[]` vaut les
// trois repas de la maison.
const RYTHMES_BOUCHES = (Deno.args.find((a) => a.startsWith("--rythmes-bouches="))
  ?.slice(18) ?? "").split(";").map((x) => x.trim());

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 §3 — `--sans-naissance=` : L'ÂGE INCONNU
// ══════════════════════════════════════════════════════════════════════════
//
//   --sans-naissance=2,3     les rangs (1 = titulaire) dont la date de
//                            naissance n'est PAS posée.
//
// ⛔ `unknown` N'EST PAS « ADULTE », et c'est le point du cas. `goalApplies`
// rend `false` pour une bouche d'âge inconnu : elle ne reçoit AUCUNE direction,
// donc aucune portion pesée (`weighedPortionMembers`), donc un bac commun. Ses
// cases se comptent « sans objet », jamais en échec — le plan l'écrit.
const SANS_NAISSANCE = new Set(
  (Deno.args.find((a) => a.startsWith("--sans-naissance="))?.slice(17) ?? "")
    .split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1),
);

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 — LE RANG 1 EST ENFIN LU, ET C'EST TOUT LE TIR
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT DU BANC, EN UNE PHRASE. `--sans-naissance` acceptait `1` depuis
// le 2026-09-13 (`n >= 1`) et ne le consultait QUE pour les bouches
// secondaires (`rangRoster = rangSecondaire + 2`). Passer `--sans-naissance=1`
// ne faisait donc RIEN, en silence : c'est un drapeau accepté qui n'arme rien,
// et c'est exactement ce qui a fait conclure « pas de tir réel possible ».
//
// ⛔ ET IL N'Y A AUCUN `UPDATE`. La date n'est pas EFFACÉE, elle n'est JAMAIS
// ÉCRITE — ni dans `profiles` (qui gagne, D18) ni sur la ligne membre (le
// repli). Le compte est créé par CE tir, sous `--compte=` ; aucune ligne
// existante n'est modifiée.
const TITULAIRE_SANS_NAISSANCE = SANS_NAISSANCE.has(1);


// ── LA TRACE COMPLÈTE DU HANDLER, CAPTURÉE ────────────────────────────────
// Les compteurs du moteur (`keel.household_meal.*`, `final_gate`) sortent au
// journal et nulle part ailleurs. Sans capture, le tableau demandé par le plan
// (« contrôles », « coût ») n'a pas de source.
const journal: string[] = [];
const vraiLog = console.log.bind(console);
const vraiWarn = console.warn.bind(console);
const vraiErr = console.error.bind(console);
const capture = (sortie: (...a: unknown[]) => void) => (...a: unknown[]) => {
  journal.push(
    a.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" "),
  );
  sortie(...a);
};
console.log = capture(vraiLog);
console.warn = capture(vraiWarn);
console.error = capture(vraiErr);

// ── ② L'ADAPTATEUR, AVANT TOUT IMPORT DU HANDLER ──────────────────────────
const canned = cannedFromFixtures(FIXTURES, cas.requestId);
// ⚠️ LE RETAILLAGE EST OPTIONNEL ET IL SE DIT. Sans `--retaille`, le banc envoie
// la réponse archivée TELLE QUELLE — c'est le tir qui a montré le 422
// `mouth_unfed` et prouvé que la grille du soir n'est pas celle de 15 h.
const RETAILLE = Deno.args.includes("--retaille");
let retaillage: { dishesBefore: number; dishesAfter: number; moved: string[] } | null = null;
let compositionText = canned.composition.outputText;
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C6 — `--reponse=<fichier>` : REPRODUIRE UN TIR RÉEL
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ « Reproduire hors ligne, corriger, relancer le test ciblé. » Le tir réel
// n° 1 de la campagne C6 a été REFUSÉ (`422 plan_not_deliverable`) sur un
// `ingredient_not_bought` dont la ligne EXISTE sur la liste, écrite au
// caractère près. Les sondes module par module (`shoppingNeedsOf` →
// `rebuildShoppingQuantities` → `shoppingIdentityAudit`) rendent **zéro**
// défaut sur ce premier jet : la divergence naît donc plus loin, dans le
// parcours complet. Sans ce drapeau, il n'existe AUCUN moyen de repasser une
// réponse réelle dans le vrai handler sans repayer l'appel.
//
// La valeur est un chemin vers une sortie de `campagne-lot-F.ts` (on y lit
// `etapes.premier_jet`) ou vers un JSON de plan nu.
const REPONSE = (Deno.args.find((a) => a.startsWith("--reponse="))?.slice(10) ?? "").trim();
if (REPONSE) {
  const brut = JSON.parse(Deno.readTextFileSync(REPONSE)) as Record<string, unknown>;
  const etapes = brut.etapes as Record<string, string> | undefined;
  const texte = etapes?.premier_jet ?? JSON.stringify(brut);
  const plan = JSON.parse(texte) as Record<string, unknown>;
  compositionText = JSON.stringify(plan);
  console.log(
    `   ⚠️ --reponse : ${REPONSE.split("/").pop()} — ` +
      `${(plan.dishes as unknown[] ?? []).length} plat(s), ` +
      `${(plan.preparations as unknown[] ?? []).length} préparation(s), ` +
      `${(plan.shopping_list as unknown[] ?? []).length} ligne(s) de courses`,
  );
}
if (RETAILLE) {
  const out = retaillerReponse(compositionText, {
    dropDays: ["fri"],
    moveCookingTo: "sat",
  });
  compositionText = out.text;
  retaillage = out;
}
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C1 — `--sans-ref` : REJOUER LE TIR N° 2 SUR CE CHEMIN
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE N'EST PAS UNE SIMULATION, C'EST LA FORME EXACTE DU PREMIER JET DU TIR
// N° 2 : 6 plats, 31 lignes, **zéro `ref`** (fixture
// `scratchpad/2026-09-11-CLOTURE/fixtures/c0-tir2.json`). Ce drapeau retire la
// clé `ref` de la réponse en conserve, et RIEN D'AUTRE : mêmes plats, mêmes
// termes, mêmes quantités. C'est la seule façon de faire passer cette forme-là
// par le VRAI handler sans payer un appel modèle.
//
// ⚠️ LE COMPTE DES CLÉS RETIRÉES EST IMPRIMÉ. Un drapeau qui ne retirerait rien
// (clé déjà absente, structure changée) rendrait un run vert qui ne prouve rien.
let refsRetires = 0;
if (Deno.args.includes("--sans-ref")) {
  const plan = JSON.parse(compositionText) as Record<string, unknown>;
  const nettoyer = (lignes: unknown) => {
    if (!Array.isArray(lignes)) return;
    for (const l of lignes as Record<string, unknown>[]) {
      if (l && typeof l === "object" && "ref" in l) {
        delete l.ref;
        refsRetires++;
      }
    }
  };
  for (const d of (plan.dishes ?? []) as Record<string, unknown>[]) {
    nettoyer(d.ingredients);
  }
  for (const p of (plan.preparations ?? []) as Record<string, unknown>[]) {
    nettoyer(p.ingredients);
  }
  compositionText = JSON.stringify(plan);
  console.log(`   ⚠️ --sans-ref : ${refsRetires} clés « ref » retirées de la réponse`);
}
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C5 — `--sans-portion=<jour>/<moment>` : LE CAS DU TIR 2
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CE DRAPEAU FABRIQUE, ET C'EST EXACTEMENT LA FORME DU TIR N° 2 : un
// plat POSÉ sur sa case — titre, méthode, ingrédients — dont AUCUNE portion ne
// peut être calculée, donc zéro contenant, donc `cell_without_portion`.
//
// ⛔ LE MÉCANISME EST CELUI DU TIR, PAS UNE SIMULATION D'ÉCRAN. Au tir n° 2,
// « pita complète » n'avait pas d'identifiant utilisable : le moteur ne pouvait
// pas mesurer le plat, `shadowSizing` ne rendait aucune ligne dimensionnée pour
// cette case, et `applySizingForEaters` retourne alors le plat TEL QUEL —
// `rows.length === 0` ⇒ `dishes_unsized++`, aucune boîte. Ce drapeau rend donc
// les identités d'UN SEUL plat irrésolubles, et rien d'autre : mêmes plats,
// mêmes quantités, même liste de courses.
//
// ⚠️ LE COMPTE DES LIGNES TOUCHÉES EST IMPRIMÉ. Un drapeau qui ne trouverait
// pas sa case (jour mal orthographié, moment absent) rendrait un run vert qui
// ne prouverait rien.
const SANS_PORTION = (Deno.args.find((a) => a.startsWith("--sans-portion="))
  ?.slice(15) ?? "").trim();
function casserLIdentite(texte: string, cible: string): string {
  const [jour, moment] = cible.split("/").map((x) => x.trim());
  const plan = JSON.parse(texte) as Record<string, unknown>;
  let touchees = 0;
  let plats = 0;
  for (const d of (plan.dishes ?? []) as Record<string, unknown>[]) {
    if (String(d.day ?? "") !== jour || String(d.slot ?? "") !== moment) continue;
    plats++;
    const lignes = Array.isArray(d.ingredients)
      ? d.ingredients as Record<string, unknown>[]
      : [];
    for (const l of lignes) {
      // ⛔ L'IDENTITÉ, PAS LA QUANTITÉ. On garde `amount` et `unit` : le plat
      // reste une recette plausible, simplement impossible à PESER — ce qui est
      // la situation exacte d'une référence refusée.
      l.ref = "zz_identite_introuvable";
      l.term = "zz identite introuvable";
      touchees++;
    }
  }
  console.log(
    `   ⚠️ --sans-portion : ${cible} — ${plats} plat(s), ${touchees} ligne(s) rendues irrésolubles`,
  );
  if (plats === 0 || touchees === 0) {
    console.error(
      `⛔ --sans-portion n'a touché AUCUNE ligne : la case « ${cible} » n'existe pas ` +
        `dans la réponse en conserve. Un run sur cette base ne prouverait rien.`,
    );
    Deno.exit(2);
  }
  return JSON.stringify(plan);
}
if (SANS_PORTION) compositionText = casserLIdentite(compositionText, SANS_PORTION);

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · §2.1/§2.2 — `--ligne=<jour>/<slot>#<rang>=<ref>:<g>` :
//                UN ÉCART SUR **UNE SEULE** CASE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE LES DRAPEAUX EXISTANTS NE SAVENT PAS FAIRE, ET POURQUOI ÇA COMPTE.
// `--reparations` multiplie une ligne de CHAQUE plat, `--proteine` déplace des
// grammes dans CHAQUE plat de la journée, `--sans-portion` casse l'identité de
// TOUTES les lignes d'une case. Aucun ne sait poser un écart sur une case et
// une seule — c'est-à-dire « un besoin de variante pour UNE seule personne »,
// qui est très exactement ce que le lot demande d'éprouver.
//
// ⛔ ET C'EST UNE MUTATION DE DENSITÉ, PAS DE TAILLE. Le moteur DIMENSIONNE la
// portion : multiplier toutes les lignes d'un plat par un facteur ne change
// rien à ce qu'on sert, il refait le calcul. Ce qui mord est le RAPPORT — la
// densité. On ajoute donc UNE ligne (`olive_oil` densifie, `courgette` allège)
// et rien d'autre.
//
//   --ligne=mon/lunch#1=olive_oil:60,tue/lunch#1=olive_oil:60
//        `#1` = le RANG du plat parmi ceux de cette case, dans l'ordre du plan.
//        Sur la référence N=4 : `#0` est le plat de la table, `#1` celui de la
//        bouche qui a le sien.
//
// ⚠️ ET L'ACHAT SUIT — même raison que `--echange` et `--allergene` : sans lui
// la candidate porterait un `ingredient_not_bought` en plus de l'écart, et le
// défaut mesuré ne serait plus celui qu'on a injecté.
//
// ⚠️ LE COMPTE DES LIGNES POSÉES EST IMPRIMÉ, ET UNE ADRESSE QUI NE TROUVE RIEN
// ARRÊTE LE BANC. Un drapeau qui ne mord pas rendrait un run vert qui ne prouve
// rien — le mode d'échec que `--sans-portion` a déjà payé.
const LIGNES = (Deno.args.find((a) => a.startsWith("--ligne="))?.slice(8) ?? "")
  .split(",").map((x) => x.trim()).filter((x) => x !== "");
function ajouterUneLigne(texte: string, consigne: string): string {
  const m = consigne.match(
    /^([a-z]{3})\/([a-z_]+)#(\d+)=([A-Za-z0-9_]+):(-?[0-9.]+)$/,
  );
  if (m === null) {
    console.error(
      `⛔ --ligne « ${consigne} » : forme attendue ` +
        `<jour>/<slot>#<rang>=<ref>:<grammes>`,
    );
    Deno.exit(2);
  }
  const [, jour, slot, rangBrut, ref, gBrut] = m;
  const grammes = Number(gBrut);
  const plan = JSON.parse(texte) as Record<string, unknown>;
  const plats = (plan.dishes ?? []) as Record<string, unknown>[];
  const memeCase = plats.filter((d) =>
    String(d.day ?? "") === jour && String(d.slot ?? "") === slot
  );
  const cible = memeCase[Number(rangBrut)];
  if (cible === undefined) {
    console.error(
      `⛔ --ligne « ${consigne} » : la case ${jour}/${slot} porte ` +
        `${memeCase.length} plat(s), pas de rang ${rangBrut}. Un run sur cette ` +
        `base ne prouverait rien.`,
    );
    Deno.exit(2);
  }
  const terme = ref.replaceAll("_", " ");
  const lignes = Array.isArray(cible.ingredients)
    ? cible.ingredients as Record<string, unknown>[]
    : [];
  lignes.push({
    term: terme,
    ref,
    amount: grammes,
    unit: "g",
    state: "raw",
    quantity: `${grammes} g`,
  });
  cible.ingredients = lignes;
  const achats = Array.isArray(plan.shopping_list)
    ? plan.shopping_list as Record<string, unknown>[]
    : [];
  const deja = achats.find((a) => String(a.ref ?? "") === ref);
  if (deja) {
    const avant = Number(deja.amount);
    const apres = Math.round((Number.isFinite(avant) ? avant : 0) + grammes);
    deja.amount = apres;
    deja.quantity = `${apres} g`;
  } else {
    achats.push({
      ...(achats[0] ?? {}),
      term: terme,
      ref,
      amount: grammes,
      unit: "g",
      quantity: `${grammes} g`,
    });
  }
  plan.shopping_list = achats;
  console.log(
    `   ⚠️ --ligne : ${grammes} g de « ${terme} » (${ref}) ajoutés à ` +
      `« ${String(cible.title ?? cible.name ?? "?")} » (${jour}/${slot} rang ${rangBrut}` +
      (cible.for_member_id ? `, plat DÉDIÉ à ${String(cible.for_member_id).slice(0, 8)}` : "") +
      `) — 1 ligne, 1 achat`,
  );
  return JSON.stringify(plan);
}
for (const consigne of LIGNES) {
  compositionText = ajouterUneLigne(compositionText, consigne);
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C3 — `--reparations=N` : EXERCER UNE PUIS DEUX
//                RÉPARATIONS, SANS UN SEUL APPEL MODÈLE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE LE BANC NE POUVAIT PAS FAIRE. Le transport servait la MÊME réponse
// à tous les tours : une relance recevait le plan qu'elle venait d'envoyer,
// l'épissage ne remplaçait RIEN, et le chemin qui jetait six lignes de courses
// n'était jamais exercé. Le plan de clôture : « tester après une puis deux
// réparations — c'est la condition la plus facile à sauter et la plus utile :
// le défaut naît d'une réparation. »
//
// ⛔ LA MUTATION EST MINIMALE ET NOMMÉE. À chaque tour de réparation, on change
// la QUANTITÉ du premier ingrédient frais de chaque plat (×1,25 puis ×1,5) et
// RIEN D'AUTRE : mêmes plats, mêmes termes, mêmes casseroles, même liste de
// courses. C'est exactement la forme d'une réparation de densité — et c'est ce
// qui fait entrer l'épissage, donc le filtre des courses.
//
// ⚠️ ELLE NE TOUCHE PAS `shopping_list` : si une ligne disparaît du plan écrit,
// c'est le moteur qui l'a retirée, pas le banc.
const REPARATIONS = Number(
  Deno.args.find((a) => a.startsWith("--reparations="))?.slice(14) ?? "0",
);
function muterPourReparation(texte: string, facteur: number): string {
  const plan = JSON.parse(texte) as Record<string, unknown>;
  let touchees = 0;
  for (const d of (plan.dishes ?? []) as Record<string, unknown>[]) {
    const lignes = Array.isArray(d.ingredients) ? d.ingredients as Record<string, unknown>[] : [];
    const premiere = lignes[0];
    if (!premiere) continue;
    const n = Number(premiere.amount);
    if (!Number.isFinite(n) || n <= 0) continue;
    premiere.amount = Math.round(n * facteur * 100) / 100;
    premiere.quantity = `${premiere.amount} ${String(premiere.unit ?? "")}`.trim();
    touchees++;
  }
  console.log(`   ⚠️ --reparations : tour ×${facteur} — ${touchees} ligne(s) mutée(s)`);
  return JSON.stringify(plan);
}
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C4 — `--proteine=+40,+120` : UNE RÉPARATION QUI DÉPLACE
//                DE LA PROTÉINE, SANS TOUCHER À L'ÉNERGIE DU PLAN
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE `--reparations` NE POUVAIT PAS FAIRE. Il multiplie une quantité
// (×1,25 puis ×1,5): l'énergie du plat MONTE avec, donc une candidate ainsi
// mutée répare la protéine en cassant les calories — très exactement
// l'échappatoire que la consigne de réparation interdit. On ne pouvait donc pas
// scripter « première réparation insuffisante puis seconde suffisante ».
//
// ⛔ CE QUE CELUI-CI FAIT: un ÉCHANGE. Il ajoute N grammes au PREMIER
// ingrédient de chaque plat et retire les mêmes N grammes au DERNIER. La masse
// cuisinée du plat ne bouge pas; sa composition, si. Sur la fixture PERTE, le
// premier ingrédient de chaque plat est la source protéique (yaourt grec,
// saumon, bœuf) et le dernier une garniture: la protéine monte, l'énergie
// bouge à peine.
//
// ⚠️ CE N'EST PAS UNE RECETTE PLAUSIBLE, ET LE BANC NE LE PRÉTEND PAS. C'est
// une candidate CONTRÔLÉE, faite pour exercer le chemin d'adoption et de
// jugement sans un seul appel modèle facturé. La plausibilité culinaire est une
// validation humaine distincte.
const PROTEINE = (Deno.args.find((a) => a.startsWith("--proteine="))?.slice(11) ?? "")
  .split(",")
  .map((x) => Number(x.trim()))
  .filter((x) => Number.isFinite(x) && x !== 0);
/**
 * ⛔ LE JOUR VISÉ, PARCE QU'UNE RÉPARATION EST CIBLÉE. Muter TOUS les plats
 * répare la journée en défaut et casse l'autre: mesuré au premier essai
 * (`--proteine=60`, 3 défauts → 4, la seconde journée passait sous son
 * plancher). La consigne de réparation, elle, NOMME la journée; le banc doit
 * pouvoir servir une candidate qui l'a lue. Vide = tous les jours.
 */
const PROTEINE_JOUR = (Deno.args.find((a) => a.startsWith("--proteine-jour="))
  ?.slice(16) ?? "").trim();
function deplacerProteine(texte: string, grammes: number): string {
  const plan = JSON.parse(texte) as Record<string, unknown>;
  let touchees = 0;
  const ecrire = (l: Record<string, unknown>, valeur: number) => {
    l.amount = Math.round(valeur * 100) / 100;
    l.quantity = `${l.amount} ${String(l.unit ?? "")}`.trim();
  };
  for (const d of (plan.dishes ?? []) as Record<string, unknown>[]) {
    if (PROTEINE_JOUR !== "" && String(d.day ?? "") !== PROTEINE_JOUR) continue;
    const lignes = Array.isArray(d.ingredients)
      ? d.ingredients as Record<string, unknown>[]
      : [];
    const pesees = lignes.filter((l) =>
      Number.isFinite(Number(l.amount)) && Number(l.amount) > 0 &&
      String(l.unit ?? "") === "g"
    );
    if (pesees.length < 2) continue;
    const haut = pesees[0];
    const bas = pesees[pesees.length - 1];
    // ⚠️ ON NE DESCEND JAMAIS SOUS 5 g: un ingrédient ramené à zéro sortirait
    // de la recette, et le test mesurerait une suppression, pas un échange.
    const pris = Math.min(grammes, Math.max(0, Number(bas.amount) - 5));
    if (pris <= 0) continue;
    ecrire(haut, Number(haut.amount) + pris);
    ecrire(bas, Number(bas.amount) - pris);
    touchees++;
  }
  console.log(
    `   ⚠️ --proteine : +${grammes} g déplacés — ${touchees} plat(s)` +
      (PROTEINE_JOUR ? ` (jour ${PROTEINE_JOUR})` : ""),
  );
  return JSON.stringify(plan);
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C4 — `--echange=a>b,c>d|e>f` : RECOMPOSER À MASSE ÉGALE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ C'EST LE GESTE QUE LA CONSIGNE DE RÉPARATION DEMANDE, MOT POUR MOT:
// « swap part of the starch or the fat for a protein-dense food ». Ce drapeau
// remplace l'IDENTITÉ d'une ligne (`ref` + `term`) en gardant sa QUANTITÉ:
// mêmes grammes cuisinés, autre aliment. C'est la seule mutation qui permette
// de scripter « le déficit protéique corrigé sans dépasser calories ni
// grammes » sans un appel modèle facturé.
//
// ⚠️ LES TOURS SE SÉPARENT PAR `|`, ET ILS SONT CUMULATIFS: le tour 2 part du
// texte du tour 1. C'est ce qui permet « première réparation insuffisante puis
// seconde suffisante » en deux listes.
//
// ⚠️ LE COMPTE DES LIGNES TOUCHÉES EST IMPRIMÉ. Un échange qui ne trouverait
// aucune ligne (slug mal orthographié) rendrait une candidate IDENTIQUE, donc
// un `no_improvement` qui ressemblerait à un verdict du moteur.
const ECHANGES = (Deno.args.find((a) => a.startsWith("--echange="))?.slice(10) ?? "")
  .split("|")
  .map((tour) =>
    tour.split(",").map((x) => x.trim()).filter(Boolean).map((paire) => {
      const [de, vers] = paire.split(">").map((y) => y.trim());
      return { de, vers };
    }).filter((e) => e.de && e.vers)
  )
  .filter((tour) => tour.length > 0);
function echangerIdentites(
  texte: string,
  paires: readonly { de: string; vers: string }[],
): string {
  const plan = JSON.parse(texte) as Record<string, unknown>;
  let touchees = 0;
  /** Ce que l'échange a fait entrer dans les recettes: `ref` → grammes. */
  const entrants = new Map<string, number>();
  const passe = (lignes: unknown) => {
    if (!Array.isArray(lignes)) return;
    for (const l of lignes as Record<string, unknown>[]) {
      const paire = paires.find((e) => String(l.ref ?? "") === e.de);
      if (!paire) continue;
      l.ref = paire.vers;
      // ⛔ LE TERME SUIT L'IDENTIFIANT. Une ligne dont le `ref` dit « skyr » et
      // le texte « yaourt grec » ferait mentir la prose servie à table — et ce
      // dépôt mesure la conformité sur l'identifiant, pas sur le libellé.
      l.term = paire.vers.replaceAll("_", " ");
      const g = Number(l.amount);
      if (Number.isFinite(g) && g > 0) {
        entrants.set(paire.vers, (entrants.get(paire.vers) ?? 0) + g);
      }
      touchees++;
    }
  };
  for (const d of (plan.dishes ?? []) as Record<string, unknown>[]) {
    if (PROTEINE_JOUR !== "" && String(d.day ?? "") !== PROTEINE_JOUR) continue;
    passe(d.ingredients);
  }
  if (PROTEINE_JOUR === "") {
    for (const pr of (plan.preparations ?? []) as Record<string, unknown>[]) {
      passe(pr.ingredients);
    }
  }
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ ET LES COURSES SUIVENT — MESURÉ AU PREMIER ESSAI
  // ══════════════════════════════════════════════════════════════════════
  //
  // Sans ces lignes, la candidate atteignait son plancher protéique ET rendait
  // **4 `ingredient_not_bought`**: les nouveaux aliments n'étaient achetés nulle
  // part. La garde l'a vue, `judgeCandidate` l'a rejetée (6 défauts contre 3),
  // et c'est le bon comportement — mais ce n'est pas la candidate qu'on voulait
  // scripter. Un modèle qui recompose met AUSSI l'aliment sur la liste.
  const achats = Array.isArray(plan.shopping_list)
    ? plan.shopping_list as Record<string, unknown>[]
    : [];
  const modele = achats[0] ?? null;
  for (const [ref, g] of entrants) {
    if (achats.some((a) => String(a.ref ?? "") === ref)) continue;
    const grammes = Math.round(g);
    achats.push({
      ...(modele ?? {}),
      term: ref.replaceAll("_", " "),
      ref,
      amount: grammes,
      unit: "g",
      quantity: `${grammes} g`,
    });
  }
  plan.shopping_list = achats;
  console.log(
    `   ⚠️ --echange : ${paires.map((e) => `${e.de}>${e.vers}`).join(", ")} — ` +
      `${touchees} ligne(s), ${entrants.size} achat(s) ajouté(s)` +
      (PROTEINE_JOUR ? ` (jour ${PROTEINE_JOUR})` : ""),
  );
  return JSON.stringify(plan);
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C6 — `--allergene=<tour>` : L'ALLERGÈNE INJECTÉ
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE C4 ET C5 ONT LAISSÉ NON EXERCÉ, ET POURQUOI ÇA COMPTE. Le compte de
// fixture du transport contrôlé ne déclarait AUCUNE exclusion : les deux
// ceintures étaient donc testées en isolation (`plan_defect_pass_test.ts` C4 ④)
// et épinglées à la source (`plan_repair_wiring_test.ts` C4 CÂBLAGE ⑦), jamais
// ARMÉES sur un parcours complet. `NON-BRANCHE.md` § ⑨ le nomme en toutes
// lettres : « L'allergène introduit par une réparation n'a pas été exercé AU
// BANC. » C'est ce drapeau, plus `--exclusion=…`, qui le ferme.
//
//   --allergene=0   l'arachide est dans le PREMIER JET
//   --allergene=1   le premier jet est SAIN, l'arachide arrive par la
//                   RÉPARATION (et tous les tours suivants la portent)
//
// ⚠️ L'ALIMENT EST CHOISI POUR QUE LE TÉMOIN SOIT POSSIBLE. La réponse en
// conserve porte `almonds` et `tahini` (groupe `nuts_seeds`) mais AUCUNE forme
// de surface de `peanut` (`allergen_surface_forms.ts` : « arachide », « beurre
// de cacahuete », « cacahuete », « satay », « PB », « groundnut »). Un run SANS
// injection, ceinture armée, doit donc être ACCEPTÉ — sinon « pas d'arachide
// dans une réponse saine » ne prouverait rien, ce que le plan interdit
// nommément.
//
// ⚠️ LE COMPTE DE LIGNES INJECTÉES EST IMPRIMÉ, même raison que `--sans-ref` :
// une injection qui ne toucherait rien rendrait un « refus » qui n'en est pas.
const ALLERGENE_TOUR = Number(
  Deno.args.find((a) => a.startsWith("--allergene="))?.slice(12) ?? "-1",
);
/**
 * Le terme injecté, et l'identifiant réel du référentiel qui le porte.
 *
 * ⟳ 2026-09-12 · FERMETURE LOT 2 — LE TERME EST RÉGLABLE, ET LA RAISON EST UNE
 * MESURE. Avec `beurre de cacahuète` et une contrainte médicale
 * `allergen_ref='peanut'`, le VERROU DE SORTIE ne mord pas : il cherche les
 * mots de la contrainte, qui sont anglais. Avec `peanut butter`, il mord. Ce
 * n'est pas un défaut de ce lot — c'est la couverture française du matcher, et
 * elle est NOMMÉE dans le rapport plutôt que contournée en silence. Le drapeau
 * existe pour pouvoir exercer les DEUX côtés.
 */
const ALLERGENE_TERME =
  (Deno.args.find((a) => a.startsWith("--allergene-terme="))?.slice(18) ?? "")
    .trim() || "beurre de cacahuète";
const ALLERGENE_REF = "peanut_butter";
function injecterAllergene(texte: string): string {
  const plan = JSON.parse(texte) as Record<string, unknown>;
  const plats = (plan.dishes ?? []) as Record<string, unknown>[];
  if (plats.length === 0) throw new Error("--allergene : aucun plat à mordre");
  // ⛔ UN SEUL PLAT, ET LE PREMIER. Une injection partout ferait un plan dont
  // TOUTES les cases tombent : on ne saurait plus si la ceinture a mordu une
  // fois ou si le parseur s'est vidé pour une autre raison.
  // ⟳ 2026-09-12 · FERMETURE LOT 2 — LE PLAT VISÉ EST RÉGLABLE, et la raison
  // est une mesure : sur une fenêtre retaillée, le PREMIER plat peut tomber
  // avant le verrou (« sat/breakfast is a moment they are away -- dropped »).
  // L'injection ne mordait alors rien, et le banc rendait « la ceinture n'a pas
  // mordu » là où il fallait lire « l'injection n'a jamais atteint le plan ».
  const RANG = Number(
    Deno.args.find((a) => a.startsWith("--allergene-plat="))?.slice(17) ?? "0",
  );
  const cible = plats[Math.max(0, Math.min(plats.length - 1, RANG))];
  const lignes = (cible.ingredients ?? []) as Record<string, unknown>[];
  lignes.push({
    term: ALLERGENE_TERME,
    quantity: `20 g de ${ALLERGENE_TERME}`,
    amount: 20,
    unit: "g",
    state: "raw",
    ref: ALLERGENE_REF,
  });
  cible.ingredients = lignes;
  // ET L'ACHAT SUIT — même raison que `--echange` : sans lui, la candidate
  // porterait un `ingredient_not_bought` en plus de l'allergène, et le refus
  // deviendrait ambigu.
  const achats = Array.isArray(plan.shopping_list)
    ? plan.shopping_list as Record<string, unknown>[]
    : [];
  achats.push({
    ...(achats[0] ?? {}),
    term: ALLERGENE_TERME,
    ref: ALLERGENE_REF,
    amount: 20,
    unit: "g",
    quantity: `20 g de ${ALLERGENE_TERME}`,
  });
  plan.shopping_list = achats;
  console.log(
    `   ⚠️ --allergene : « ${ALLERGENE_TERME} » (${ALLERGENE_REF}) ajouté à ` +
      `« ${String(cible.title ?? cible.name ?? "?")} » — 1 ligne, 1 achat`,
  );
  return JSON.stringify(plan);
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 3 — `--allergene-deroule` : LA SURFACE DU LOT 1
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QU'IL EXERCE, ET C'EST LE DÉFAUT P1 §2 DE LA REVUE DU 2026-09-12. Le
// verrou de sortie ne lisait pas `cooking_sessions[].run_through` : la MÊME
// phrase passait dans une recette et survivait dans un déroulé. Ce drapeau
// l'écrit dans le SEUL déroulé — aucune recette ne nomme l'aliment, aucune
// ligne de courses ne l'achète.
//
// ⚠️ ET PAS D'ACHAT AJOUTÉ, contrairement à `--allergene`. Ici la phrase est le
// défaut entier : ajouter une ligne de courses ferait mordre le verrou par un
// second chemin et on ne saurait plus lequel a parlé.
const DEROULE_ALLERGENE = Deno.args.includes("--allergene-deroule");
/**
 * ⟳ 2026-09-13 · LOT 3 — `--deroule-persiste` : LA VIOLATION QUI NE PART PAS.
 *
 * ⛔ CE QU'IL ÉPROUVE. Le plan exige la VARIANTE : « puis variante où la
 * violation persiste deux fois, aucune activation/écriture du nouveau plan ni
 * aperçu dangereux ». Sans lui, le banc ne sait que réparer, et « la sécurité
 * s'applique même si le budget modèle est épuisé » n'est prouvée par aucun
 * parcours complet.
 */
const DEROULE_PERSISTE = Deno.args.includes("--deroule-persiste");
/** ⟳ LOT 3 — le tour où la réponse de patch porte une opération invalide. */
/**
 * ⟳ 2026-09-13 · LOT 3 — `--patch-session-seul` : LA RÉPARATION MINIMALE.
 *
 * ⛔ POURQUOI IL EXISTE. Le patch du banc réécrit TOUTES les unités autorisées
 * avec une recette-témoin : c'est utile pour exercer l'épissage, et destructeur
 * pour mesurer une correction de TEXTE. Avec ce drapeau, le banc rend ce qu'un
 * modèle prudent rendrait — les sessions, et rien d'autre. « Un tableau omis
 * veut dire inchangé » est alors éprouvé de bout en bout.
 */
const PATCH_SESSION_SEUL = Deno.args.includes("--patch-session-seul");
/**
 * ⟳ 2026-09-13 · LOT 3 — `--patch-pot=<facteur>` : LE LOT COMMUN RETOUCHÉ.
 *
 * ⛔ CE QU'IL EXERCE, ET C'EST LE CAS ④ DU PLAN. Une modification d'ingrédients
 * d'un lot PARTAGÉ change l'énergie, la densité et les quantités de TOUTES ses
 * utilisations. La candidate doit être refinalisée et remesurée pour chaque
 * consommateur, et un total de défauts plus faible ne doit pas autoriser à
 * dégrader une portion auparavant conforme d'une autre personne.
 *
 * ⚠️ LE PATCH NE PORTE QUE `preparations`. C'est aussi le chemin que la revue
 * a nommé : les casseroles n'étaient lues que dans la boucle des unités, donc
 * une réparation de lot seul n'était jamais parsée.
 */
const PATCH_POT = Number(
  Deno.args.find((a) => a.startsWith("--patch-pot="))?.slice(12) ?? "0",
);
/** ⟳ LOT 3 — le tour où la réponse de patch porte une opération invalide. */
const PATCH_CASSE = Number(
  Deno.args.find((a) => a.startsWith("--patch-casse="))?.slice(14) ?? "-1",
);
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · §2.1 — `--patch-isoler` : LE GESTE QUE LE BANC NE SAVAIT PAS
//                FAIRE — FORKER UNE CASSEROLE PARTAGÉE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE LE RAPPORT PRÉCÉDENT A ÉCRIT, MOT POUR MOT : « Le banc n'a aucune
// opération de patch qui FORKE une casserole. » La consigne la PROPOSE depuis
// le lot 1 (« declare a NEW preparation with a new id in this answer, and point
// only the unit that needs it at the new id ») et `applyRepairPatch` l'ACCEPTE
// depuis la même date ; personne n'avait jamais écrit la réponse.
//
// ⛔ CE QU'IL REND, ET C'EST LA DÉFINITION DE L'ISOLEMENT :
//   · une préparation NEUVE, `<pot>_iso`, copie de la casserole partagée avec
//     les lignes que `--patch-isoler-ligne` redresse ;
//   · les SEULES unités que la consigne autorise, repointées sur elle ;
//   · rien d'autre — les autres consommateurs ne sont pas dans le patch, donc
//     « un tableau omis veut dire inchangé » les laisse sur l'ancien lot.
//
// ⚠️ LE JOUR DE CUISSON EST LU DANS LA CONSIGNE, PAS DEVINÉ. Depuis le §2.1 le
// serveur écrit « its "cook_on" must be one of mon » sous la casserole
// partagée, et RATTACHE lui-même le lot neuf à la session de ce jour. Un banc
// qui inventerait un jour mesurerait `new_preparation_unscheduled`, c'est-à-dire
// sa propre erreur.
const PATCH_ISOLER = Deno.args.includes("--patch-isoler");
/**
 * Les lignes que la casserole ISOLÉE porte autrement : `<ref>:<grammes>`.
 *
 * ⛔ SANS ELLES, LE FORK NE PORTE RIEN. Une copie conforme du lot partagé
 * rendrait la même densité à la personne isolée : la candidate n'améliorerait
 * rien (`candidate_no_improvement`), et on mesurerait un refus du moteur là où
 * il fallait lire « le banc a rendu un patch qui ne répare pas ».
 */
const PATCH_ISOLER_LIGNES = (Deno.args.find((a) =>
  a.startsWith("--patch-isoler-ligne=")
)?.slice(21) ?? "")
  .split(",").map((x) => x.trim()).filter((x) => x !== "")
  .map((x) => {
    const [ref, g] = x.split(":").map((y) => y.trim());
    return { ref, grammes: Number(g) };
  })
  .filter((x) => x.ref !== "" && Number.isFinite(x.grammes));
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · §2.2 — `--patch-complement=<ref>:<g>` : LE PLAT EN PLUS,
//                SANS DOUBLER LA PART COMMUNE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ L'AUTRE CAS QUE LE RAPPORT PRÉCÉDENT A DÉCLARÉ NON EXERCÉ : « le cas
// complément (`complements_shared`) n'a pas été exercé du tout ». Une unité de
// COMPLÉMENT est RÉSERVÉE par le moteur (`dedicated_complement_needed`) : la
// personne EST servie, son assiette est bloquée, et la seule sortie est un
// petit plat à elle AU MÊME MOMENT.
//
// ⛔ ET CE N'EST PAS UNE PORTION MANQUANTE. `unitesAutorisees` remplit déjà une
// unité réservée en empruntant la recette d'une autre : sur un complément, ça
// rendrait une assiette entière de plus — c'est-à-dire deux fois la cible, le
// défaut même que `splitPlateWithComplement` existe pour éviter. Ce drapeau rend
// donc un plat COURT : une ou deux lignes, nommées.
//
//   --patch-complement=olive_oil:18,pumpkin_seeds:35
const PATCH_COMPLEMENT = (Deno.args.find((a) =>
  a.startsWith("--patch-complement=")
)?.slice(19) ?? "")
  .split(",").map((x) => x.trim()).filter((x) => x !== "")
  .map((x) => {
    const [ref, g] = x.split(":").map((y) => y.trim());
    return { ref, grammes: Number(g) };
  })
  .filter((x) => x.ref !== "" && Number.isFinite(x.grammes));
function injecterAllergeneDansLeDeroule(texte: string): string {
  const plan = JSON.parse(texte) as Record<string, unknown>;
  const sessions = (plan.cooking_sessions ?? []) as Record<string, unknown>[];
  if (sessions.length === 0) {
    throw new Error("--allergene-deroule : aucune session à mordre");
  }
  const RANG = Number(
    Deno.args.find((a) => a.startsWith("--allergene-session="))?.slice(20) ?? "0",
  );
  const cible = sessions[Math.max(0, Math.min(sessions.length - 1, RANG))];
  const avant = String(cible.run_through ?? "");
  cible.run_through = `${avant} Pour finir, ajoute une cuillère de ${ALLERGENE_TERME} dans le riz.`;
  console.log(
    `   ⚠️ --allergene-deroule : « ${ALLERGENE_TERME} » ajouté au déroulé de la ` +
      `session ${RANG} (${String(cible.day ?? "?")}) — 0 recette, 0 achat`,
  );
  return JSON.stringify(plan);
}

const SEQUENCE_BASE = ECHANGES.length > 0
  ? ECHANGES.reduce<string[]>(
    (acc, tour) => [...acc, echangerIdentites(acc[acc.length - 1], tour)],
    [compositionText],
  )
  : PROTEINE.length > 0
  // ⟳ C4 — la séquence d'échange protéique gagne quand elle est demandée: les
  // deux drapeaux exercent le MÊME chemin, et les mêler rendrait un tour dont
  // personne ne saurait dire ce qu'il a changé. Chaque facteur est CUMULATIF —
  // le tour 2 part du texte du tour 1 — pour que « insuffisant puis suffisant »
  // se script en deux nombres croissants.
  ? PROTEINE.reduce<string[]>(
    (acc, g) => [...acc, deplacerProteine(acc[acc.length - 1], g)],
    [compositionText],
  )
  : REPARATIONS > 0
  ? [
    compositionText,
    ...Array.from(
      { length: REPARATIONS },
      (_, i) => muterPourReparation(compositionText, 1 + 0.25 * (i + 1)),
    ),
  ]
  : undefined;

// ⟳ C6 — L'INJECTION SE POSE **SUR** LA SÉQUENCE EXISTANTE, jamais à sa place.
// Le tour visé est réécrit ; les tours suivants répètent le dernier élément
// (règle du transport), donc une réparation injectée reste injectée à chaque
// nouvelle tentative — ce qui est exactement ce qu'on veut refuser.
const SEQUENCE_AVEC_DEROULE = !DEROULE_ALLERGENE
  ? SEQUENCE_BASE
  : (SEQUENCE_BASE ?? [compositionText]).map((t, i) =>
    i === 0 ? injecterAllergeneDansLeDeroule(t) : t
  );
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 3 §2.5 — `--rejouer-tour=<n>:<sortie.json>` : LA RÉPONSE
//                RÉELLE ARCHIVÉE, SERVIE UNE SECONDE FOIS, GRATUITEMENT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE LE PLAN EXIGE : « Rejouer les réponses problématiques déjà
// archivées gratuitement. Ces rejeux prouvent le comportement du parseur, de la
// finalisation et du banc ; ils ne prouvent pas que le nouveau prompt fera
// produire une meilleure réponse. »
//
// ⛔ ET CE QUE `--patch-depuis` NE FAIT PAS. Celui-ci FABRIQUE un patch depuis
// une référence valide : c'est une candidate CONTRÔLÉE. Ici on relit la réponse
// BRUTE que le fournisseur a réellement rendue et qu'on a payée, pour mesurer
// ce qu'un correctif du moteur en fait — sans repayer.
//
// ⚠️ L'ORIGINE EST NOMMÉE DANS LA TRACE. Une réponse rejouée n'est pas une
// nouvelle réussite du modèle, et une campagne qui confondrait les deux
// compterait deux fois le même essai.
const REJOUER = (Deno.args.find((a) => a.startsWith("--rejouer-tour="))
  ?.slice(15) ?? "").trim();
const rejeu: { tour: number; texte: string } | null = (() => {
  if (!REJOUER) return null;
  const [n, chemin] = REJOUER.split(/:(.+)/);
  const tour = Number(n);
  if (!Number.isInteger(tour) || tour < 1 || !chemin) {
    console.error(`⛔ --rejouer-tour=<n>:<sortie.json> — n entier ≥ 1 requis.`);
    Deno.exit(2);
  }
  const sortie = JSON.parse(Deno.readTextFileSync(chemin.trim())) as {
    appels_reels?: { turn: number; body: string }[];
  };
  const appel = (sortie.appels_reels ?? []).find((a) => a.turn === tour);
  if (!appel) {
    console.error(
      `⛔ --rejouer-tour : aucun appel RÉEL au tour ${tour} dans ${chemin}. ` +
        `Un tour sans ligne « 💸 retour réel » n'a RIEN mesuré.`,
    );
    Deno.exit(2);
  }
  const env = JSON.parse(appel.body) as Record<string, unknown>;
  let texte = String(env.output_text ?? "");
  if (!texte) {
    for (const o of (env.output ?? []) as Record<string, unknown>[]) {
      for (const c of (o.content ?? []) as Record<string, unknown>[]) {
        if (c.type === "output_text" || c.type === "text") {
          texte += String(c.text ?? "");
        }
      }
    }
  }
  console.warn(
    `   ⟳ REJEU : la réponse RÉELLE du tour ${tour} (${texte.length} car.) est ` +
      `resservie. Aucune dépense, et ce n'est PAS un nouvel essai du modèle.`,
  );
  return { tour, texte };
})();

const SEQUENCE = ALLERGENE_TOUR < 0 ? SEQUENCE_AVEC_DEROULE : (() => {
  const base = [...(SEQUENCE_AVEC_DEROULE ?? [compositionText])];
  while (base.length <= ALLERGENE_TOUR) base.push(base[base.length - 1]);
  base[ALLERGENE_TOUR] = injecterAllergene(base[ALLERGENE_TOUR]);
  console.log(
    `   ⚠️ --allergene : tour ${ALLERGENE_TOUR} sur ${base.length} — ` +
      (ALLERGENE_TOUR === 0
        ? `l'arachide est dans le PREMIER JET`
        : `le premier jet est SAIN, l'arachide arrive par la RÉPARATION`),
  );
  return base;
})();

// ⟳ 2026-09-13 — LE REJEU S'APPLIQUE EN DERNIER : il remplace la réponse du
// tour visé, quelles que soient les injections d'avant.
const SEQUENCE_FINALE = rejeu === null ? SEQUENCE : (() => {
  const base = [...(SEQUENCE ?? [compositionText])];
  while (base.length <= rejeu.tour) base.push(base[base.length - 1]);
  base[rejeu.tour] = rejeu.texte;
  return base;
})();

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · FERMETURE LOT 1 — LA RÉPONSE DE RÉPARATION EST UN PATCH
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE LE BANC NE POUVAIT PLUS FAIRE. Depuis la fermeture du lot 1, une
// réparation ne rend plus un PLAN mais un PATCH — et ses `unit_id` autorisés
// n'existent QUE dans la consigne que le handler vient d'écrire. Servir un plan
// entier ferait rejeter l'enveloppe (`empty_patch`) : on mesurerait un refus, et
// pas une réparation.
//
// ⛔ CE BLOC LIT DONC LA CONSIGNE, exactement comme le modèle le ferait : les
// unités autorisées, leur titre, leurs casseroles, et le `holds:` qui porte
// leurs ingrédients chiffrés. Puis il applique la MÊME mutation que les
// séquences d'avant (×facteur, échange protéique, arachide) et rend un patch.
//
// ⚠️ CE N'EST PAS UN SECOND PARSEUR DU PLAN. Il ne lit que le format de la
// PROJECTION, qui est le nôtre (`plan_repair_context.ts`), et il rougit en
// clair s'il ne trouve rien — un patch vide serait indiscernable d'un modèle
// qui refuse.

/** Une unité autorisée, lue dans la consigne. */
interface UniteLue {
  readonly unitId: string;
  readonly titre: string;
  readonly pots: readonly string[];
  readonly ingredients: {
    term: string;
    ref: string | null;
    amount: number | null;
    unit: string | null;
    state: string | null;
  }[];
}

/**
 * `  · U3 sun/dinner (m-zoe) "Titre" — for m-zoe — draws on p1, p2`
 *
 * ⛔ LE DÉFAUT CORRIGÉ LE 2026-09-13, ET IL RENDAIT TOUT PLAT DÉDIÉ INVISIBLE.
 * L'expression exigeait `· U3 <un seul mot> "Titre"`. Or `unitAddress` écrit
 * l'adresse d'un plat DÉDIÉ en TROIS morceaux — `mon/lunch (78375266-…)` — donc
 * `\S+\s+"` ne rencontrait jamais le guillemet. Aucune unité n'était lue, le
 * repli « unité réservée » fabriquait alors une unité par jeton du contrat, et
 * deux d'entre elles portaient la MÊME adresse : `ambiguous_address`, patch
 * rejeté, deux tours consommés. Mesuré au tir `iso4`.
 *
 * ⚠️ `[^"]*` ET PAS `.*?` : le premier guillemet de la ligne ouvre le titre.
 * Une ligne SANS guillemet — un repas manquant, un complément — ne correspond
 * plus du tout, et c'est voulu : ces deux familles ont leur propre lecture.
 */
const RE_UNITE = /^\s*·\s+(U\d+)\s+[^"]*"([^"]*)"(?:.*?draws on ([^\n—]+))?/;
/** `      holds: 120 g thon [tuna_fresh] · 80 g pain complet` */
const RE_HOLDS = /^\s*holds:\s*(.+)$/;

function lireIngredient(morceau: string) {
  // ⛔ LA RÉFÉRENCE SE DÉTACHE D'ABORD, ET C'EST NÉCESSAIRE. Avec un groupe
  // optionnel en fin d'expression et un `.+?` paresseux devant, le moteur
  // préfère toujours le groupe VIDE : `[tuna_fresh]` se retrouvait dans le
  // TERME, la ligne repartait sans identifiant, et le contrat de sortie rendait
  // 25 `ref_missing` — un patch cassé qu'on aurait lu comme un moteur cassé.
  // ⛔ L'ORDRE DE DÉTACHEMENT EST CELUI DE L'ÉCRITURE, et il est inverse de
  // l'intuition: la projection écrit `84 g pita complète [pita_wholemeal]
  // (raw)` — l'ÉTAT en dernier. Chercher `[ref]` en fin de chaîne d'abord ne
  // trouve rien, la référence part dans le TERME, et le contrat de sortie rend
  // 25 `ref_missing`: un patch cassé qu'on lirait comme un moteur cassé.
  let reste = morceau.trim();
  let etat: string | null = null;
  const parenthese = reste.match(/\s*\(([^)]+)\)$/);
  if (parenthese !== null) {
    etat = parenthese[1];
    reste = reste.slice(0, parenthese.index ?? reste.length).trim();
  }
  let ref: string | null = null;
  const crochet = reste.match(/\s*\[([^\]]+)\]$/);
  if (crochet !== null) {
    ref = crochet[1];
    reste = reste.slice(0, crochet.index ?? reste.length).trim();
  }
  const m = reste.match(/^(?:([\d.,]+)\s+(\S+)\s+)?(.+)$/);
  if (m === null) return null;
  const amount = m[1] === undefined ? null : Number(m[1].replace(",", "."));
  return {
    term: (m[3] ?? "").trim(),
    ref,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    unit: m[2] ?? null,
    state: etat,
  };
}

/**
 * LE TEXTE DE LA CONSIGNE, décodé du corps JSON envoyé au fournisseur.
 *
 * ⛔ SANS CE DÉCODAGE, TOUT ÉCHOUE EN SILENCE. Le corps est du JSON : les
 * guillemets y sont `\\"` et les sauts de ligne `\\n`. Une expression qui
 * cherche `"units"` ne trouve donc rien, le crochet rend `null`, la séquence
 * sert un PLAN à une réparation qui attend un PATCH — et on mesure un refus
 * d'enveloppe en croyant mesurer une réparation.
 */
function texteDeLaConsigne(corps: string): string {
  try {
    const payload = JSON.parse(corps) as Record<string, unknown>;
    const morceaux: string[] = [];
    const visiter = (v: unknown): void => {
      if (typeof v === "string") morceaux.push(v);
      else if (Array.isArray(v)) v.forEach(visiter);
      else if (v !== null && typeof v === "object") {
        Object.values(v as Record<string, unknown>).forEach(visiter);
      }
    };
    visiter(payload.input ?? payload.messages ?? payload);
    return morceaux.join("\n");
  } catch {
    return corps;
  }
}

/** Les unités que la consigne AUTORISE à changer, avec ce qu'elles portent. */
function unitesAutorisees(consigne: string): UniteLue[] {
  // ⛔ LA LISTE FERMÉE EST CELLE DU CONTRAT, pas la projection entière: la
  // projection liste AUSSI les unités gelées, et les rendre ferait rejeter le
  // patch en entier (`out_of_scope_unit`) — ce qui est le bon comportement, et
  // pas ce qu'on veut mesurer ici.
  const contrat = consigne.match(
    /"units" carries ONLY these unit_ids, the ones to change: ([^.]+)\./,
  );
  const aRemplir = consigne.match(
    /And these unit_ids, which do not exist yet and must be written from\s+nothing: ([^.]+)\./,
  );
  const permis = new Set(
    [...(contrat?.[1] ?? "").split(","), ...(aRemplir?.[1] ?? "").split(",")]
      .map((x) => x.trim()).filter((x) => /^U\d+$/.test(x)),
  );
  if (permis.size === 0) return [];
  const lignes = consigne.split("\n");
  const out: UniteLue[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(RE_UNITE);
    if (m === null || !permis.has(m[1])) continue;
    const pots = (m[3] ?? "").split(",").map((x) => x.trim()).filter((x) =>
      x !== "" && !x.includes(" ")
    );
    const ingredients: UniteLue["ingredients"] = [];
    const holds = (lignes[i + 1] ?? "").match(RE_HOLDS);
    if (holds !== null) {
      for (const morceau of holds[1].split("·")) {
        const lu = lireIngredient(morceau);
        if (lu !== null && lu.term !== "") ingredients.push(lu);
      }
    }
    out.push({ unitId: m[1], titre: m[2], pots, ingredients });
  }
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LES UNITÉS À REMPLIR N'ONT PAS DE TITRE, ET C'EST NORMAL
  // ══════════════════════════════════════════════════════════════════════
  //
  // Une unité RÉSERVÉE (« THESE MEALS ARE MISSING ») n'a rien à projeter : le
  // plat n'existe pas. Elle n'est donc pas trouvée par l'expression ci-dessus,
  // qui exige un titre entre guillemets. Sans ce bloc, le banc ne remplirait
  // JAMAIS une case vide — c'est-à-dire qu'il ne mesurerait pas la moitié du
  // lot (« un plat attendu totalement absent : unité réservée créée »).
  //
  // ⚠️ LE CONTENU EST EMPRUNTÉ À UNE UNITÉ CONNUE. Ce n'est pas une recette
  // plausible et le banc ne le prétend pas : c'est une candidate CONTRÔLÉE,
  // faite pour exercer le chemin de CRÉATION sans un appel facturé.
  const vues = new Set(out.map((u) => u.unitId));
  const modele = out[0] ?? null;
  for (const id of permis) {
    if (vues.has(id)) continue;
    out.push({
      unitId: id,
      titre: `Assiette ${id}`,
      pots: [],
      ingredients: modele === null ? [] : modele.ingredients.slice(0, 3).map((g) => ({ ...g })),
    });
  }
  return out;
}

/** `  · prep_chicken "Poulet rôti" — makes 4 serving(s)` */
const RE_POT = /^\s*·\s+(prep_[A-Za-z0-9_]+)\s+"([^"]*)"(?:\s+—\s+makes\s+([0-9.]+))?/;

/**
 * ⟳ 2026-09-13 · LOT 3 — LES CASSEROLES QUE LA PROJECTION MET SUR LA TABLE.
 *
 * ⛔ ELLES NE SONT PAS DANS LE CONTRAT, et c'est voulu : le contrat énumère les
 * unités et les sessions parce qu'un patch les ADRESSE par jeton ; une
 * casserole s'adresse par son propre identifiant, que le plan porte déjà. On
 * les lit donc dans le bloc « THE PREPARATIONS THOSE MEALS DRAW ON », qui est
 * exactement la liste que `repairScopeOf` a ouverte.
 */
function potsAutorises(consigne: string): {
  id: string;
  titre: string;
  parts: number | null;
  ingredients: UniteLue["ingredients"];
  partagee: boolean;
}[] {
  const debut = consigne.indexOf("THE PREPARATIONS THOSE MEALS DRAW ON");
  if (debut < 0) return [];
  const lignes = consigne.slice(debut).split("\n");
  const out: ReturnType<typeof potsAutorises> = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(RE_POT);
    if (m === null) continue;
    const ingredients: UniteLue["ingredients"] = [];
    const holds = (lignes[i + 1] ?? "").match(RE_HOLDS);
    if (holds !== null) {
      for (const morceau of holds[1].split("·")) {
        const lu = lireIngredient(morceau);
        if (lu !== null && lu.term !== "") ingredients.push(lu);
      }
    }
    const suite = lignes.slice(i + 1, i + 5).join("\n");
    out.push({
      id: m[1],
      titre: m[2],
      parts: m[3] === undefined ? null : Number(m[3]),
      ingredients,
      partagee: suite.includes("⛔ SHARED:"),
    });
  }
  return out;
}

/**
 * ⟳ 2026-09-13 · LOT 2 — LES SESSIONS QUE LA CONSIGNE AUTORISE À RÉÉCRIRE.
 *
 * ⛔ MÊME POSTURE QUE `unitesAutorisees` : la liste fermée est celle du
 * CONTRAT, pas la projection. Rendre une session gelée ferait rejeter le patch
 * entier (`out_of_scope_session`), ce qui est le bon comportement et pas ce
 * qu'on mesure ici.
 */
function sessionsAutorisees(consigne: string): string[] {
  const contrat = consigne.match(
    /"sessions" carries ONLY these session_ids: ([^.]+)\./,
  );
  return [...(contrat?.[1] ?? "").split(",")]
    .map((x) => x.trim())
    .filter((x) => /^S\d+$/.test(x));
}

/** La version que la consigne demande de citer. */
function versionDeBase(consigne: string): string {
  return consigne.match(/"base_version":"([^"]*)"/)?.[1] ?? "";
}

/**
 * ⟳ 2026-09-13 · §2.1 — LES JOURS OÙ CE PLAN CUISINE, LUS DANS LA CONSIGNE.
 *
 * ⛔ ON NE LES DEVINE PAS. Le serveur les écrit sous la casserole partagée
 * (« its "cook_on" must be one of mon ») parce qu'une casserole neuve posée un
 * jour sans session fait tomber la candidate entière. Un banc qui inventerait
 * un jour mesurerait sa propre erreur sous le nom du moteur.
 */
function joursDeCuisson(consigne: string): string[] {
  const m = consigne.match(/its "cook_on" must be one of ([^.]+)\./);
  return (m?.[1] ?? "").split(",").map((x) => x.trim())
    .filter((x) => /^[a-z]{3}$/.test(x));
}

/** `  · U9 mon/dinner (m-nils) — an extra dish for m-nils, on top of …` */
const RE_COMPLEMENT = /^\s*·\s+(U\d+)\s.*—\s+an extra dish for/;

/**
 * ⟳ 2026-09-13 · §2.2 — LES UNITÉS DE COMPLÉMENT QUE LA CONSIGNE RÉSERVE.
 *
 * ⛔ ELLES NE SE CONFONDENT PAS AVEC LES REPAS MANQUANTS. Les deux sont dans
 * `createUnitIds` et les deux apparaissent dans le contrat sous « which do not
 * exist yet » ; seule la PROJECTION les sépare, sous deux en-têtes distincts.
 * Les mélanger ferait remplir un complément par une assiette entière — soit
 * deux fois la cible de la personne, le défaut même que le partage d'assiette
 * existe pour éviter.
 */
function complementsReserves(consigne: string): string[] {
  return consigne.split("\n")
    .map((l) => l.match(RE_COMPLEMENT)?.[1] ?? "")
    .filter((x) => x !== "");
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 §2.3 — `--patch-depuis=<plan.json>` : LA RÉPARATION
//                QU'UN MODÈLE COMPÉTENT RENDRAIT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE LE BANC NE SAVAIT PAS FAIRE, ET POURQUOI LE PLAN L'EXIGE.
// `patchDepuisConsigne` recopie les ingrédients PROJETÉS de l'unité. Sur le cas
// « portion manquante » c'est un piège : la projection d'une unité cassée porte
// l'identité cassée (`zz identite introuvable`), donc le patch la RENVOIE
// telle quelle et la candidate n'améliore rien. Mesuré le 2026-09-13 :
// `candidate_safety_regression` aux deux tours, aucune adoption.
//
// ⛔ CE DRAPEAU FOURNIT LA RÉPARATION, exactement comme le plan le demande :
// pour chaque unité que la consigne autorise, il relit la RÉFÉRENCE VALIDE et
// rend le contenu réel de la case (jour, moment, et le bon plat quand une
// bouche a le sien). C'est une candidate CONTRÔLÉE, pas une preuve de
// compétence générative — et le rapport doit le dire.
//
// ⚠️ UNE SEULE UNITÉ PAR PLAT DE LA RÉFÉRENCE. Le contrat ouvre AUSSI des
// unités réservées, une par bouche non nourrie ; les remplir toutes poserait
// quatre plats sur une case qui en attend un. On rend donc l'unité qui EXISTE
// quand elle existe, et une réservée seulement pour un plat que rien d'autre
// ne couvre.
const PATCH_DEPUIS = (Deno.args.find((a) => a.startsWith("--patch-depuis="))
  ?.slice(15) ?? "").trim();
const planDeReparation: Record<string, unknown> | null = PATCH_DEPUIS
  ? JSON.parse(Deno.readTextFileSync(PATCH_DEPUIS)) as Record<string, unknown>
  : null;

/** `member_id=… | day=tue | slot=dinner | scope=meal | units=U12` — et sa variante sans bouche. */
function casesDesUnites(consigne: string): Map<string, { jour: string; slot: string; membre: string | null }> {
  const out = new Map<string, { jour: string; slot: string; membre: string | null }>();
  for (const l of consigne.split("\n")) {
    const unites = l.match(/units=((?:U\d+)(?:\s*,\s*U\d+)*)/);
    const jour = l.match(/\bday=([a-z]{3})\b/);
    const slot = l.match(/\bslot=([a-z_]+)\b/);
    if (unites === null || jour === null || slot === null) continue;
    const membre = l.match(/\bmember_id=([0-9a-f-]{36})/)?.[1] ?? null;
    for (const id of unites[1].split(",").map((x) => x.trim())) {
      // ⚠️ LA PREMIÈRE LECTURE GAGNE : le bloc « A MEAL IS MISSING » nomme la
      // bouche, celui des plats en défaut ne la nomme pas. Écraser la première
      // par la seconde perdrait le seul lien unité → bouche de la consigne.
      if (!out.has(id)) out.set(id, { jour: jour[1], slot: slot[1], membre });
    }
  }
  return out;
}

/** Le patch qui remet la RÉFÉRENCE dans les unités que la consigne ouvre. */
function patchDepuisReference(consigne: string): string | null {
  if (planDeReparation === null) return null;
  const contrat = consigne.match(
    /"units" carries ONLY these unit_ids, the ones to change: ([^.]+)\./,
  );
  const aRemplir = consigne.match(
    /And these unit_ids, which do not exist yet and must be written from\s+nothing: ([^.]+)\./,
  );
  const aChanger = (contrat?.[1] ?? "").split(",").map((x) => x.trim())
    .filter((x) => /^U\d+$/.test(x));
  const reserves = (aRemplir?.[1] ?? "").split(",").map((x) => x.trim())
    .filter((x) => /^U\d+$/.test(x));
  if (aChanger.length === 0 && reserves.length === 0) return null;
  const cases = casesDesUnites(consigne);
  const plats = (planDeReparation.dishes ?? []) as Record<string, unknown>[];
  const platPour = (jour: string, slot: string, membre: string | null) => {
    const memes = plats.filter((p) => String(p.day) === jour && String(p.slot) === slot);
    if (membre !== null) {
      const sien = memes.find((p) => String(p.for_member_id ?? "") === membre);
      if (sien) return sien;
    }
    return memes.find((p) => p.for_member_id === undefined) ?? memes[0] ?? null;
  };
  const units: Record<string, unknown>[] = [];
  const dejaPose = new Set<Record<string, unknown>>();
  for (const id of [...aChanger, ...reserves]) {
    const c = cases.get(id);
    if (c === undefined) continue;
    const plat = platPour(c.jour, c.slot, c.membre);
    if (plat === null || dejaPose.has(plat)) continue;
    dejaPose.add(plat);
    units.push({
      unit_id: id,
      title: String(plat.title ?? plat.name ?? ""),
      method: String(plat.method ?? ""),
      why: String(plat.why ?? ""),
      ingredients: (plat.ingredients ?? []) as unknown[],
      uses: ((plat.uses ?? []) as Record<string, unknown>[]).map((u) => ({
        preparation_id: u.preparation_id,
        servings: u.servings ?? 1,
        kept: u.kept ?? "fridge",
      })),
    });
  }
  if (units.length === 0) return null;
  console.log(
    `   ⟳ patch DEPUIS LA RÉFÉRENCE : ${units.length} unité(s) — ` +
      units.map((u) => `${u.unit_id}="${String(u.title).slice(0, 28)}"`).join(", ") +
      `   (ouvertes : à changer ${aChanger.join("/") || "—"} · réservées ${reserves.join("/") || "—"})`,
  );
  return JSON.stringify({
    repair: { base_version: versionDeBase(consigne), units },
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · §2.1 — LE PATCH D'ISOLEMENT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ TROIS OPÉRATIONS, ET PAS UNE DE PLUS :
//   ① une casserole NEUVE, `<pot>_iso`, qui porte les lignes redressées ;
//   ② les unités AUTORISÉES qui tiraient le lot partagé, repointées sur elle —
//      leur recette ne bouge pas, c'est le LOT qui change ;
//   ③ l'ancien lot, RÉÉCRIT À PART ÉGALE : ses ingrédients et son nombre de
//      parts baissent du même facteur, donc la part de chaque consommateur
//      restant est identique au gramme (`share = servings ÷ servings_made`).
//
// ⛔ POURQUOI ③ EST NÉCESSAIRE, ET CE N'EST PAS DE L'ÉLÉGANCE. Sans lui, le
// lot d'origine continue de produire six parts pour quatre mangeurs : la liste
// de courses achète deux parts que personne ne mange. Le plan demande
// « production, prélèvements et restes cohérents » ; laisser deux parts
// orphelines serait précisément l'incohérence.
//
// ⚠️ ET ③ NE TOUCHE À AUCUNE ASSIETTE. `share = servings ÷ servings_made` :
// diviser les deux termes par le même facteur laisse chaque part au gramme
// près. C'est la contre-épreuve à faire après le tir, pas une croyance.
function patchIsolement(consigne: string): string | null {
  const pots = potsAutorises(consigne);
  const partage = pots.find((x) => x.partagee) ?? null;
  if (partage === null) {
    console.log(
      "   ⟳ patch d'ISOLEMENT : aucune casserole PARTAGÉE dans la consigne — " +
        `${pots.length} casserole(s) projetée(s)`,
    );
    return null;
  }
  const jours = joursDeCuisson(consigne);
  if (jours.length === 0) {
    console.log(
      "   ⟳ patch d'ISOLEMENT : la consigne ne nomme AUCUN jour de cuisson — " +
        "un lot neuf y serait refusé (`new_preparation_unscheduled`)",
    );
    return null;
  }
  const unites = unitesAutorisees(consigne).filter((u) =>
    u.pots.includes(partage.id)
  );
  if (unites.length === 0) {
    console.log(
      `   ⟳ patch d'ISOLEMENT : aucune unité autorisée ne tire ${partage.id}`,
    );
    return null;
  }
  const neuf = `${partage.id}_iso`;
  const partsIsolees0 = unites.length;
  const partsAvant0 = partage.parts ?? 0;
  // ⛔ LES QUANTITÉS PROJETÉES SONT CELLES DU **LOT ENTIER** — la consigne le dit
  // en toutes lettres (« SCALE: the amounts under a preparation are the WHOLE
  // BATCH »). Recopier un lot de six parts dans une casserole qui en déclare
  // deux TRIPLERAIT la part de la personne isolée : `foldPreparationsIntoDishes`
  // plie `servings ÷ servings_made`. Le fork part donc au prorata de ses propres
  // parts, et les lignes redressées sont ABSOLUES par-dessus.
  const prorata = partsAvant0 > 0 && partsIsolees0 > 0
    ? partsIsolees0 / partsAvant0
    : 1;
  const ing = partage.ingredients.map((g) => ({
    ...g,
    amount: g.amount === null ? null : Math.round(g.amount * prorata * 100) / 100,
  }));
  for (const r of PATCH_ISOLER_LIGNES) {
    const ligne = ing.find((g) => g.ref === r.ref);
    if (ligne !== undefined) ligne.amount = r.grammes;
    else {
      ing.push({
        term: r.ref.replaceAll("_", " "),
        ref: r.ref,
        amount: r.grammes,
        unit: "g",
        state: "raw",
      });
    }
  }
  const ligne = (g: UniteLue["ingredients"][number], facteur: number) => ({
    term: g.term,
    ref: g.ref,
    amount: g.amount === null
      ? null
      : Math.round(g.amount * facteur * 100) / 100,
    unit: g.unit,
    state: g.state ?? "raw",
  });
  const partsIsolees = partsIsolees0;
  const partsAvant = partsAvant0;
  const partsRestantes = partsAvant - partsIsolees;
  const preparations: Record<string, unknown>[] = [{
    id: neuf,
    title: `${partage.titre} — part isolée`,
    servings_made: partsIsolees,
    method: "Cuis ce lot à part, dans une poêle lavée, et mets-le en boîte.",
    active_minutes: 15,
    total_minutes: 30,
    // ⛔ LE JOUR VIENT DE LA CONSIGNE. Le serveur rattache ensuite le lot à la
    // session de ce jour : il n'y a pas d'adresse de session à écrire ici.
    cook_on: jours[0],
    ingredients: ing.map((g) => ligne(g, 1)),
  }];
  if (partsAvant > 0 && partsRestantes > 0) {
    const facteur = partsRestantes / partsAvant;
    preparations.push({
      id: partage.id,
      title: partage.titre,
      servings_made: partsRestantes,
      method: "Fais cuire le lot de la table, puis répartis.",
      active_minutes: 20,
      total_minutes: 35,
      ingredients: partage.ingredients.map((g) => ligne(g, facteur)),
    });
  }
  console.log(
    `   ⟳ patch d'ISOLEMENT : ${neuf} (${partsIsolees} part(s), ` +
      `cook_on=${jours[0]}) pour ${unites.map((u) => u.unitId).join(", ")} · ` +
      `${partage.id} reste à ${partsRestantes > 0 ? partsRestantes : partsAvant} part(s)` +
      (partsRestantes > 0 ? ` (ingrédients ×${(partsRestantes / partsAvant).toFixed(3)})` : "") +
      (PATCH_ISOLER_LIGNES.length === 0
        ? "   ⚠️ AUCUNE LIGNE REDRESSÉE : la copie est conforme, elle ne répare rien"
        : `   lignes redressées : ${
          PATCH_ISOLER_LIGNES.map((r) => `${r.ref}=${r.grammes}`).join(", ")
        }`),
  );
  return JSON.stringify({
    repair: {
      base_version: versionDeBase(consigne),
      preparations,
      units: unites.map((u) => ({
        unit_id: u.unitId,
        title: u.titre,
        method: "Réchauffe ta portion du lot qui est à toi, assaisonne, sers.",
        why: "Ce repas tire maintenant un lot à part : les autres gardent le leur.",
        ingredients: u.ingredients.map((g) => ligne(g, 1)),
        // ⛔ LE SEUL CHANGEMENT DE L'UNITÉ EST SON LOT. Les casseroles qu'elle
        // tirait et qui ne sont PAS celle qu'on isole restent en place.
        uses: u.pots.map((id) => ({
          preparation_id: id === partage.id ? neuf : id,
          servings: 1,
          kept: "fridge",
        })),
      })),
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · §2.2 — LE PATCH DE COMPLÉMENT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ UN PLAT COURT, ET C'EST TOUT LE POINT. La personne GARDE sa part du plat
// commun ; le moteur la rabote à sa borne et dimensionne ce plat-ci à la
// différence (`splitPlateWithComplement`). Un plat entier ici servirait deux
// fois sa cible — et c'est le défaut que le partage d'assiette existe pour
// empêcher.
//
// ⚠️ AUCUNE CASSEROLE. Un complément qui tirerait le lot commun reprendrait au
// pot ce qu'on vient d'y raboter.
function patchComplement(consigne: string): string | null {
  const permis = new Set([
    ...(consigne.match(
      /And these unit_ids, which do not exist yet and must be written from\s+nothing: ([^.]+)\./,
    )?.[1] ?? "").split(",").map((x) => x.trim()),
  ]);
  const cibles = complementsReserves(consigne).filter((id) => permis.has(id));
  if (cibles.length === 0) {
    console.log(
      "   ⟳ patch de COMPLÉMENT : aucune unité de complément réservée dans la consigne",
    );
    return null;
  }
  console.log(
    `   ⟳ patch de COMPLÉMENT : ${cibles.join(", ")} — ` +
      `${PATCH_COMPLEMENT.map((r) => `${r.grammes} g ${r.ref}`).join(" + ")}`,
  );
  return JSON.stringify({
    repair: {
      base_version: versionDeBase(consigne),
      units: cibles.map((id) => ({
        unit_id: id,
        title: "Petite assiette en plus",
        method: "Dispose dans un bol à côté du plat partagé.",
        why: "Une entrée courte qui complète la part du plat commun, sans la remplacer.",
        ingredients: PATCH_COMPLEMENT.map((r) => ({
          term: r.ref.replaceAll("_", " "),
          ref: r.ref,
          amount: r.grammes,
          unit: "g",
          state: "raw",
        })),
        uses: [],
      })),
    },
  });
}

/**
 * LE PATCH SERVI À UNE RÉPARATION, avec la mutation demandée.
 *
 * `facteur` ×N sur le premier ingrédient chiffré ; `arachide` ajoute
 * l'allergène ; `null` rend `null` (le crochet s'abstient).
 */
function patchDepuisConsigne(args: {
  readonly consigne: string;
  readonly facteur: number | null;
  readonly proteineG: number | null;
  readonly arachide: boolean;
}): string | null {
  // ⛔ ON DÉCODE LE CORPS AVANT DE LIRE. Voir `texteDeLaConsigne`: chercher
  // dans le JSON échappé ne trouve rien, et le silence ressemble à « le modèle
  // n'a rien à réparer ».
  const consigneLue = texteDeLaConsigne(args.consigne);
  // ⛔ L'ISOLEMENT PASSE AVANT TOUT LE RESTE. C'est un geste ENTIER — une
  // casserole neuve, et des unités repointées — qu'aucune des mutations
  // d'ingrédients ci-dessous ne sait composer.
  if (PATCH_ISOLER) {
    const isole = patchIsolement(consigneLue);
    if (isole !== null) return isole;
  }
  if (PATCH_COMPLEMENT.length > 0) {
    const extra = patchComplement(consigneLue);
    if (extra !== null) return extra;
  }
  // ⛔ LA RÉPARATION FOURNIE PASSE AVANT LA RECOPIE DE LA PROJECTION. Voir le
  // bloc de `patchDepuisReference` : sur une unité CASSÉE, la projection porte
  // l'identité cassée, et la recopier ne répare rien.
  if (planDeReparation !== null) {
    const depuis = patchDepuisReference(consigneLue);
    if (depuis !== null) return depuis;
  }
  const unites = unitesAutorisees(consigneLue);
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 2 — LA RÉPARATION D'UN DÉROULÉ SEUL
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ELLE PART MÊME QUAND AUCUNE UNITÉ N'EST AUTORISÉE, et c'est tout le
  // lot : une consigne de cuisine dangereuse ouvre un périmètre fait de
  // SESSIONS seulement. Le banc doit pouvoir y répondre, sinon on mesure
  // « le modèle n'a rien rendu » là où il fallait lire « le banc ne sait pas
  // écrire cette opération ».
  const sessions = sessionsAutorisees(consigneLue).map((id) => ({
    session_id: id,
    // ⚠️ LE TEXTE NE NOMME PLUS L'ALIMENT, et il décrit les mêmes gestes. Une
    // réécriture qui perdrait l'ordre des gestes serait une correction qui
    // casse l'exécution du dimanche soir.
    run_through: DEROULE_PERSISTE
      // ⛔ LE MODÈLE « RÉPARE » SANS RETIRER L'ALIMENT. C'est le cas le plus
      // utile du lot : la réparation revient, elle est appliquée, et la
      // livraison doit QUAND MÊME être refusée.
      ? "Lance le four, puis ajoute une cuillère de " + ALLERGENE_TERME +
        " dans le riz avant de servir."
      : "Lance le four, mets les cuissons en route dans l'ordre, puis répartis " +
        "en boîtes étiquetées.",
  }));
  // ── ⟳ LOT 3 — LE PATCH QUI NE TOUCHE QUE LE LOT COMMUN ────────────────
  if (PATCH_POT > 0) {
    const pots = potsAutorises(consigneLue);
    if (pots.length === 0) {
      console.log("   ⟳ patch de CASSEROLE : aucune casserole projetée");
      return null;
    }
    const cible = pots.find((x) => x.partagee) ?? pots[0];
    const ing = cible.ingredients.map((g) => ({ ...g }));
    if (ing.length > 0 && ing[0].amount !== null) {
      ing[0].amount = Math.round(ing[0].amount * PATCH_POT * 100) / 100;
    }
    console.log(
      `   ⟳ patch de CASSEROLE SEULE : ${cible.id} ×${PATCH_POT} ` +
        `(${cible.partagee ? "PARTAGÉE" : "non partagée"}, ${ing.length} ligne(s))`,
    );
    return JSON.stringify({
      repair: {
        base_version: versionDeBase(consigneLue),
        preparations: [{
          id: cible.id,
          title: cible.titre,
          servings_made: cible.parts ?? 2,
          method: "Fais cuire le lot, puis répartis.",
          active_minutes: 10,
          total_minutes: 40,
          ingredients: ing.map((g) => ({
            term: g.term,
            ref: g.ref,
            amount: g.amount,
            unit: g.unit,
            state: g.state ?? "raw",
          })),
        }],
      },
    });
  }
  if (unites.length === 0 || PATCH_SESSION_SEUL) {
    if (sessions.length === 0) return null;
    console.log(
      `   ⟳ patch de SESSION seule : ${sessions.map((x) => x.session_id).join(", ")} ` +
        `· base_version lue = « ${versionDeBase(consigneLue)} »`,
    );
    return JSON.stringify({
      repair: { base_version: versionDeBase(consigneLue), sessions },
    });
  }
  const units = unites.map((u) => {
    const ing = u.ingredients.map((g) => ({ ...g }));
    if (args.facteur !== null && ing.length > 0 && ing[0].amount !== null) {
      ing[0].amount = Math.round(ing[0].amount * args.facteur * 100) / 100;
    }
    if (args.proteineG !== null && ing.length >= 2) {
      const premier = ing[0];
      const dernier = ing[ing.length - 1];
      if (premier.amount !== null && dernier.amount !== null) {
        premier.amount = Math.round((premier.amount + args.proteineG) * 100) / 100;
        dernier.amount = Math.max(
          0,
          Math.round((dernier.amount - args.proteineG) * 100) / 100,
        );
      }
    }
    if (args.arachide) {
      ing.push({
        term: ALLERGENE_TERME,
        ref: null,
        amount: 20,
        unit: "g",
        state: "raw",
      });
    }
    return {
      unit_id: u.unitId,
      title: u.titre,
      method: "Réchauffe, assaisonne, sers.",
      why: "La correction demandée, appliquée à cette unité.",
      ingredients: ing.map((g) => ({
        term: g.term,
        ref: g.ref,
        amount: g.amount,
        unit: g.unit,
        // ⚠️ L'ÉTAT VIENT DE LA PROJECTION, il ne se devine pas: une ligne
        // `cooked` repesée comme `raw` changerait sa masse d'un facteur de
        // rendement.
        state: g.state ?? "raw",
      })),
      uses: u.pots.map((id) => ({ preparation_id: id, servings: 1, kept: "fridge" })),
    };
  });
  return JSON.stringify({
    repair: {
      base_version: versionDeBase(consigneLue),
      units,
      // ⚠️ OMISE QUAND IL N'Y EN A PAS: un tableau vide et un tableau absent
      // disent la même chose au contrat, mais le vide se relit « il a voulu
      // effacer ». On omet.
      ...(sessions.length === 0 ? {} : { sessions }),
    },
  });
}

const transport = installControlledTransport({
  compositionModel: "gpt-6-luna",
  // ⟳ 2026-09-13 · LOT 3 — LE MODÈLE VERS LEQUEL `_shared/gemini.ts` BASCULE
  // quand le premier échoue. Sans cette liste, le transport prend le repli
  // pour un appel de REMPLISSAGE et sert « items:[] » à une réparation :
  // mesuré le 2026-09-13, un appel facturé perdu et un rejet
  // `base_version_missing` qui accusait le modèle à tort.
  compositionFallbackModels: ["gpt-5.6-sol"],
  composition: { ...canned.composition, outputText: compositionText },
  fill: canned.fill,
  passThroughHosts: [LOCAL_HOST],
  compositionSequence: SEQUENCE_FINALE,
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LE TOUR 0 EST UN PLAN, LES SUIVANTS DES
  // PATCHES. Le crochet s'abstient (`null`) sur le premier jet et quand la
  // consigne ne porte aucune unité autorisée; la séquence garde alors la main.
  // ⟳ 2026-09-13 · LOT 3 §3.3 — LES TOURS QU'ON ACCEPTE DE PAYER.
  // ⛔ JAMAIS LE TOUR 0 : le premier jet est figé, c'est ce qui rend le parcours
  // HYBRIDE et reproductible.
  // ⟳ 2026-09-13 · LOT 3 §3.1 — LE TOUR 0 EST PAYABLE, MAIS SEULEMENT SI ON
  // L'A DEMANDÉ. Les deux drapeaux sont indépendants et se cumulent ; le
  // plafond vit dans le transport, pas seulement ici.
  realTurns: PLAFOND_REEL > 0
    ? (turn: number) =>
      (PREMIER_JET_REEL && turn === 0) || (REPARATION_REELLE > 0 && turn > 0)
    : undefined,
  realCap: PLAFOND_REEL,
  compositionPatch: ({ prompt, turn }) => {
    if (turn === 0) return null;
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-13 · LOT 1 D'ATTRIBUTION — LE REJEU PASSE AVANT LA FABRIQUE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT MESURÉ. `--rejouer-tour=1:<sortie>` posait bien la réponse
    // RÉELLE dans `compositionSequence[1]`, et ce crochet l'écrasait aussitôt
    // par un patch FABRIQUÉ depuis la consigne (`transport-lot-F.ts` ≈ 511 :
    // « si patch !== null, il gagne »). Les runs marqués « rejeu » du
    // 2026-09-13 ont donc mesuré une réponse du BANC, en croyant mesurer celle
    // du fournisseur — très exactement le substitut silencieux que ce chantier
    // interdit.
    //
    // ⚠️ SEULEMENT LE TOUR VISÉ. Les autres tours gardent la fabrique : un
    // rejeu de tour 1 ne dit rien du tour 2, et servir la même réponse deux
    // fois ferait passer un tour pour deux.
    if (rejeu !== null && rejeu.tour === turn) {
      // ══════════════════════════════════════════════════════════════════
      // ⛔ UNE SEULE CLÉ EST RÉÉCRITE, ET IL LE FAUT : `base_version`.
      // ══════════════════════════════════════════════════════════════════
      //
      // Elle porte le `request_id` de la demande d'ORIGINE. Resservie telle
      // quelle, la réponse réelle se fait refuser `base_version_stale` et
      // n'atteint JAMAIS la fusion : on mesure alors le patch fabriqué du tour
      // suivant en croyant mesurer le modèle. Mesuré le 2026-09-13.
      //
      // ⚠️ RIEN D'AUTRE NE BOUGE. Les `unit_id`, les ingrédients, les
      // quantités, les `for_member_id` restent EXACTEMENT ceux que le
      // fournisseur a rendus : c'est le seul champ que le protocole lie à la
      // demande, et l'échanger est ce que le modèle ferait lui-même s'il
      // relisait la consigne d'aujourd'hui.
      const version = versionDeBase(texteDeLaConsigne(prompt));
      let texte = rejeu.texte;
      try {
        const lu = JSON.parse(texte) as { repair?: Record<string, unknown> };
        if (lu.repair && typeof lu.repair === "object" && version !== "") {
          const avant = String(lu.repair.base_version ?? "");
          lu.repair.base_version = version;
          texte = JSON.stringify(lu);
          console.log(
            `   ⟳ REJEU (tour ${turn}) : réponse RÉELLE archivée, ` +
              `base_version « ${avant} » → « ${version} » (seul champ réécrit).`,
          );
          return texte;
        }
      } catch { /* pas un patch JSON : on rend le texte tel quel */ }
      console.log(
        `   ⟳ REJEU (tour ${turn}) : la fabrique du banc s'abstient, ` +
          `la réponse RÉELLE archivée passe telle quelle.`,
      );
      return null;
    }
    // ⛔ EN MODE PAYANT, LE CROCHET S'EFFACE. Le transport a déjà laissé sortir
    // l'appel ; si on arrive ici c'est que le plafond est atteint, et servir un
    // patch fabriqué ferait passer une réponse du BANC pour une réponse du
    // MODÈLE dans la même campagne.
    if (PLAFOND_REEL > 0) return null;
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-13 · LOT 3 — `--patch-casse=<tour>` : L'ATOMICITÉ, AU BANC
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LA SONDE DE LA REVUE (P2 §4), REJOUÉE DANS LE VRAI HANDLER. Une bonne
    // opération ET une opération `null` dans la même réponse : avant le lot,
    // la bonne s'appliquait et le patch se déclarait appliqué. On veut voir le
    // patch ENTIER jeté, la meilleure version intacte, et la tentative
    // suivante repartir.
    if (PATCH_CASSE === turn) {
      const base = patchDepuisConsigne({
        consigne: prompt,
        facteur: null,
        proteineG: null,
        arachide: false,
      });
      if (base === null) return null;
      const lu = JSON.parse(base) as { repair: Record<string, unknown> };
      const unites = Array.isArray(lu.repair.units) ? lu.repair.units : [];
      lu.repair.units = [...unites, null];
      console.log(
        `   ⟳ patch VOLONTAIREMENT CASSÉ (tour ${turn}) : ` +
          `${unites.length} unité(s) valide(s) + 1 opération nulle`,
      );
      return JSON.stringify(lu);
    }
    const facteur = REPARATIONS > 0 ? 1 + 0.25 * turn : null;
    const proteineG = PROTEINE.length > 0
      ? PROTEINE[Math.min(turn - 1, PROTEINE.length - 1)]
      : null;
    const arachide = ALLERGENE_TOUR === turn;
    // ⛔ MÊME SANS MUTATION, ON REND UN PATCH. Servir un PLAN entier à une
    // réparation ferait rejeter l'ENVELOPPE (`empty_patch`) : on mesurerait une
    // réponse mal formée, pas une réparation qui n'améliore rien. Un patch
    // identique est très exactement ce qu'un modèle paresseux rend, et c'est le
    // chemin `no_improvement` qu'on veut exercer.
    const patch = patchDepuisConsigne({
      consigne: prompt,
      facteur,
      proteineG,
      arachide,
    });
    // ⚠️ UN PATCH PEUT N'AVOIR AUCUNE UNITÉ, et le journal doit le supporter :
    // depuis le lot 2 une réparation peut ne porter que des SESSIONS. Lire
    // `units.length` sans garde faisait JETER le crochet — et l'exception était
    // rattrapée par la chaîne de repli du fournisseur, qui servait alors la
    // réponse du REMPLISSAGE (`{"items":[]}`) à une réparation. Mesuré le
    // 2026-09-13 : deux tours de réparation « rejetés » pour rien.
    const lu = patch === null
      ? null
      : JSON.parse(patch) as { repair: Record<string, unknown> };
    console.log(
      `   ⟳ patch de réparation (tour ${turn}) : ` +
        (lu === null
          ? "AUCUNE unité autorisée dans la consigne"
          : `${(lu.repair.units as unknown[] ?? []).length} unité(s), ` +
            `${(lu.repair.sessions as unknown[] ?? []).length} session(s)`),
    );
    return patch;
  },
});

// ── ③ LE HANDLER, CAPTURÉ SANS OUVRIR DE PORT ─────────────────────────────
const serve = captureServeHandler();
await import(`${ROOT}supabase/functions/generate-household-meal-v1/index.ts`);
const handler = await serve.handlerPromise;
serve.restore();

// ── LES APPELS À LA PILE, PAR LE VRAI RÉSEAU ──────────────────────────────
// (`transport` les laisse passer ; c'est l'hôte local.)
async function rpc(bearer: string, name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: bearer === SVC ? SVC : ANON,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

async function signIn(email: string) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "1234567" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) return null;
  return { token: String(body.access_token), userId: String(body.user?.id ?? "") };
}

async function account(email: string) {
  const existing = await signIn(email);
  if (existing) return existing;
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: "1234567",
      email_confirm: true,
      user_metadata: { fixture: "LOT-F" },
    }),
  });
  if (!res.ok) throw new Error(`création ${email} → ${res.status} ${await res.text()}`);
  const fresh = await signIn(email);
  if (!fresh) throw new Error(`${email} créé mais non connectable`);
  return fresh;
}

async function post(path: string, body: unknown, prefer: string) {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SVC,
      authorization: `Bearer ${SVC}`,
      "content-type": "application/json",
      prefer,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
  return text;
}

// ── ④ LE PROVISIONNEMENT, PAR LES RPC DU PRODUIT ──────────────────────────
console.log(`── LOT F ② · cas ${CAS.toUpperCase()} · ${EMAIL} ────────────────`);
console.log(
  retaillage
    ? `   réponse archivée RETAILLÉE : ${retaillage.dishesBefore} → ${retaillage.dishesAfter} plats ` +
      `(vendredi retiré, cuisson ${retaillage.moved.join("+")} déplacée au samedi)`
    : `   réponse archivée TELLE QUELLE (7 plats)`,
);
const me = await account(EMAIL);
console.log(`   compte : ${me.userId}`);

await post("profiles?on_conflict=id", {
  id: me.userId,
  full_name: cas.fullName,
  // ⟳ 2026-09-14 — LA CLÉ DISPARAÎT DU CORPS, elle ne vaut pas `null`. D18
  // (`20260812180000`) fait gagner `profiles.birth_date` sur la ligne membre :
  // écrire `null` ou ne rien écrire donne le même état, mais ne rien écrire
  // dit ce qu'on fait — on n'a jamais demandé sa date à cette personne.
  ...(TITULAIRE_SANS_NAISSANCE ? {} : { birth_date: cas.birthDate }),
  gender: "male",
  locale: "fr-FR",
  country: "FR",
  timezone: "Europe/Paris",
  height_cm: cas.heightCm,
  day_activity: "seated",
  activity_level: "trains_some",
  sport_frequency: "3_4",
  onboarding_completed: true,
}, "resolution=merge-duplicates,return=minimal");

await post("student_goals?on_conflict=user_id", {
  user_id: me.userId,
  goal: cas.goal,
  content_locale: "fr-FR",
  target_weight_kg: cas.targetWeight,
  target_pace_kg_per_week: cas.pace,
}, "resolution=merge-duplicates,return=minimal");

const coach = await rpc(me.token, "keel_join_house_coach", { p_country: "FR" });
console.log(`   coach maison : ${JSON.stringify(coach.body)}`);

// La pesée — sans elle l'entretien est ESTIMÉ et la cible change.
await post("student_body_measures", {
  user_id: me.userId,
  kind: "weight",
  value_si: cas.weightKg,
  source: "setup",
  local_date: new Date().toISOString().slice(0, 10),
  measured_at: new Date().toISOString(),
}, "return=minimal");

const roster = await rpc(me.token, "keel_household_roster");
const rows = Array.isArray(roster.body) ? roster.body as Record<string, unknown>[] : [];
const mine = rows.find((r) => String(r.user_id ?? "") === me.userId);
if (!mine) throw new Error(`aucune bouche titulaire : ${JSON.stringify(roster.body)}`);
const memberId = String(mine.member_id);
for (
  const [name, args] of [
    ["keel_household_set_member_name", { p_member: memberId, p_first_name: cas.firstName }],
    // ⟳ 2026-09-14 — LE SECOND CHEMIN D'ÂGE, ET IL FAUT LES DEUX. `profiles`
    // gagne, mais `household_members.birth_date` est le REPLI : la laisser
    // posée rendrait `adult` malgré un profil vide, et le tir ne mesurerait
    // rien. `p_birth_date: null` sur une ligne NEUVE n'efface aucune date.
    ...(TITULAIRE_SANS_NAISSANCE ? [] : [
      ["keel_household_set_member_birth_date", { p_member: memberId, p_birth_date: cas.birthDate }],
    ] as const),
    ["keel_household_set_member_body", {
      p_member: memberId,
      p_height_cm: cas.heightCm,
      p_weight_kg: cas.weightKg,
      p_gender: "male",
      p_activity_level: "trains_some",
      p_day_activity: "seated",
      p_sport_frequency: "3_4",
      p_activity_axes_asked: true,
      // ⟳ 2026-09-11 · C0 ② — L'APPÉTIT EST UN PARAMÈTRE DU CAS, plus une
      // constante. `average` en dur ici ET dans l'analyseur rendait le grand
      // appétit intestable : le couloir mesuré n'était pas celui du tir.
      p_appetite: APPETIT,
      p_appetite_asked: true,
    }],
  ] as const
) {
  const out = await rpc(me.token, name, args as Record<string, unknown>);
  const b = out.body as Record<string, unknown>;
  if (b?.ok !== true) throw new Error(`${name} → ${JSON.stringify(b)}`);
}
console.log(`   bouche : ${memberId}`);

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C1 — LE REPAS LÉGER ET L'APPORT FIXE, PAR LES RPC
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT QUE CES DEUX DRAPEAUX FERMENT, AVEC SES CHIFFRES. Le tir n° 5 du
// 2026-09-11 déclarait son « repas léger » par `eating_rhythm[].size = "small"`
// — que RIEN ne lit pour le POIDS d'un moment — et son apport fixe par
// `keel_household_set_member_fixed_intakes`, qui écrivait alors dans une
// colonne que le moteur ne relit pas pour un titulaire. Résultat: `light_slots`
// à `[]`, cible du petit-déjeuner à 613,50 kcal, c'est-à-dire exactement celle
// d'un tir sans rien de déclaré.
//
//   --leger=lunch        « léger » se déclare par les HABITUDES RÉELLEMENT
//                        CONSOMMÉES (`household_member_habits.slots[].light`),
//                        parce que c'est la seule source que `lightSlots` lit.
//   --apport-fixe        200 g de yaourt grec au petit-déjeuner, posés par LA
//                        PORTE DU PRODUIT. Depuis la migration `20260912090000`
//                        elle ROUTE vers `student_goals` pour un titulaire; la
//                        réponse porte `wrote`, et le banc l'IMPRIME — sans
//                        quoi « écrit au bon endroit » resterait une croyance.
const LEGER = (Deno.args.find((a) => a.startsWith("--leger="))?.slice(8) ?? "").trim();
if (LEGER) {
  const habits = await rpc(me.token, "keel_household_set_member_habits", {
    p_member: memberId,
    // ⚠️ `household_dish` ET PAS `own_usual`: la personne mange bien le plat de
    // la maison, elle en prend MOINS. `own_usual` sans texte est refusé par la
    // porte, et avec un texte il dirait qu'elle mange autre chose.
    p_slots: [{ slot: LEGER, kind: "household_dish", usual: "", light: true }],
    p_note: null,
  });
  const hb = habits.body as Record<string, unknown>;
  if (hb?.ok !== true) throw new Error(`habitudes légères → ${JSON.stringify(hb)}`);
  console.log(`   repas léger : ${LEGER} (par les HABITUDES, pas par eating_rhythm.size)`);
}

const APPORT_FIXE = Deno.args.includes("--apport-fixe");
if (APPORT_FIXE) {
  const apport = await rpc(me.token, "keel_household_set_member_fixed_intakes", {
    p_member: memberId,
    p_intakes: [{
      food_ref: "greek_yogurt",
      label: "yaourt grec",
      amount: 200,
      unit: "g",
      days: [],
      slot: "breakfast",
      replaces_meal: false,
    }],
  });
  const ab = apport.body as Record<string, unknown>;
  if (ab?.ok !== true) throw new Error(`apport fixe → ${JSON.stringify(ab)}`);
  // ⛔ LA DESTINATION EST IMPRIMÉE. C'est tout le correctif C1: la même porte
  // écrivait `household_members` pour tout le monde, et la déclaration d'un
  // titulaire mourait là.
  console.log(`   apport fixe : 200 g greek_yogurt @breakfast → écrit dans « ${ab.wrote} »`);
  // ET LA CONTRE-ÉPREUVE, LUE EN BASE: la source canonique porte la ligne.
  const relu = await fetch(
    `${API}/rest/v1/student_goals?user_id=eq.${me.userId}&select=practical_constraints`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const lignes = await relu.json().catch(() => []) as Record<string, unknown>[];
  const pc = (lignes[0]?.practical_constraints ?? {}) as Record<string, unknown>;
  console.log(
    `   relu en base : student_goals.practical_constraints.fixed_intakes = ` +
      `${JSON.stringify(pc.fixed_intakes ?? null)}`,
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C6 — `--exclusion=<medicale|preference|deux>`
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ LA FIXTURE QUI MANQUAIT. Onze lancements du banc, six tirs réels, et pas
// UNE exclusion déclarée : « aucune violation » ne voulait dire que « on ne
// l'a pas essayé ». Les DEUX ceintures du produit se déclarent ici, par leur
// source canonique, parce qu'elles mordent à des endroits différents :
//
//   `medicale`    `student_safety_constraints` (allergen_ref='peanut',
//                 severity='medical'). Elle entre par `constraints` dans
//                 `parseGeneratedMeal` → `applyKeelOutputLocks` : un plan qui
//                 la mord est VIDÉ (plats et préparations), donc REFUSÉ.
//   `preference`  un `RetainedItem` durable `food.exclude` sur
//                 `student_goals.practical_constraints.retained_items`,
//                 sujet `household`. Elle entre par `exclusionTermsFor` →
//                 `unallocatedTerms` → `biteKeys`, la ceinture qui JETTE une
//                 candidate de réparation ayant AJOUTÉ une morsure.
//
// ⚠️ LES DEUX SE DÉCLARENT SÉPARÉMENT EXPRÈS. Armées ensemble, un refus de
// réparation serait attribuable à l'une comme à l'autre — et la branche
// `plan_repair_rejected:belt` ne se distinguerait plus de
// `plan_repair_rejected:shorter_plan`.
const EXCLUSION = (Deno.args.find((a) => a.startsWith("--exclusion="))?.slice(12) ?? "")
  .trim();
if (EXCLUSION && !["medicale", "preference", "deux"].includes(EXCLUSION)) {
  console.error(`⛔ --exclusion inconnue : ${EXCLUSION} (medicale | preference | deux)`);
  Deno.exit(2);
}
if (EXCLUSION === "medicale" || EXCLUSION === "deux") {
  // ⚠️ IDEMPOTENT : le banc peut relancer le même compte. On relit d'abord,
  // on n'écrit que si la ligne manque — un doublon ferait DEUX morsures là où
  // la personne n'a déclaré qu'une allergie.
  const deja = await fetch(
    `${API}/rest/v1/student_safety_constraints?user_id=eq.${me.userId}` +
      `&allergen_ref=eq.peanut&select=id,severity,status`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const lignes = await deja.json().catch(() => []) as Record<string, unknown>[];
  if (lignes.length === 0) {
    await post("student_safety_constraints", {
      user_id: me.userId,
      kind: "allergy",
      allergen_ref: "peanut",
      severity: "medical",
      declared_by: "student",
      content_locale: "fr-FR",
      status: "active",
      notes: "banc C6 — allergène de fixture, jamais un compte réel",
    }, "return=minimal");
  }
  const relu = await fetch(
    `${API}/rest/v1/student_safety_constraints?user_id=eq.${me.userId}` +
      `&select=kind,allergen_ref,severity,status`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  console.log(
    `   exclusion MÉDICALE : ${JSON.stringify(await relu.json().catch(() => []))}`,
  );
}
if (EXCLUSION === "preference" || EXCLUSION === "deux") {
  // ⛔ ON FUSIONNE, ON NE REMPLACE PAS. `practical_constraints` porte déjà
  // `fixed_intakes` (écrit par la RPC ci-dessus depuis C1) et `eating_rhythm` :
  // un PATCH qui poserait l'objet entier effacerait l'apport fixe du titulaire
  // sans un mot, et le run suivant mesurerait un tir sans apport.
  const lu = await fetch(
    `${API}/rest/v1/student_goals?user_id=eq.${me.userId}&select=practical_constraints`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const rows = await lu.json().catch(() => []) as Record<string, unknown>[];
  const pc = { ...((rows[0]?.practical_constraints ?? {}) as Record<string, unknown>) };
  const anciens = Array.isArray(pc.retained_items)
    ? pc.retained_items as Record<string, unknown>[]
    : [];
  // ⚠️ LA FORME EST CELLE DE `parseRetainedItem`, PAS UNE FORME VOISINE. Un
  // champ manquant (`at`, `source`, `scope`) fait rendre `null` au parseur, et
  // la ligne disparaît EN SILENCE — la ceinture resterait vide en croyant être
  // armée. `mouths` l'imprime, et c'est la contre-épreuve.
  const item = {
    kind: "food.exclude",
    scope: "durable",
    subject: "household",
    source: "written",
    text: "cacahuète",
    at: new Date().toISOString().slice(0, 10),
    item: "",
    confidence: null,
    quote: null,
    value: null,
  };
  const dedup = anciens.filter((x) => String(x?.text ?? "") !== item.text);
  pc.retained_items = [...dedup, item];
  await post("student_goals?on_conflict=user_id", {
    user_id: me.userId,
    goal: cas.goal,
    content_locale: "fr-FR",
    target_weight_kg: cas.targetWeight,
    target_pace_kg_per_week: cas.pace,
    practical_constraints: pc,
  }, "resolution=merge-duplicates,return=minimal");
  const relu2 = await fetch(
    `${API}/rest/v1/student_goals?user_id=eq.${me.userId}&select=practical_constraints`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const r2 = await relu2.json().catch(() => []) as Record<string, unknown>[];
  const pc2 = (r2[0]?.practical_constraints ?? {}) as Record<string, unknown>;
  console.log(
    `   exclusion PRÉFÉRENCE : retained_items = ${JSON.stringify(pc2.retained_items ?? null)}`,
  );
  console.log(
    `   ⚠️ CONTRE-ÉPREUVE À LIRE PLUS BAS : keel.household_meal.exclusion_belt ` +
      `doit rendre « mouths » > 0. À 0, la ligne n'a pas été PARSÉE et la ` +
      `ceinture est vide en ayant l'air armée.`,
  );
}

// ── LE FOYER DE DEUX — UNE SECONDE BOUCHE, SANS COMPTE ────────────────────
//
// ⚠️ « Une personne gouverne le menu ; une bouche n'a pas besoin d'un compte. »
// `--duo` ajoute donc une BOUCHE (`keel_household_add_member`), pas un second
// compte : c'est la forme que le produit sert, et celle que le plan demande au
// tir n° 6 (« deux personnes aux besoins différents, préparation partagée »).
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 3 — `--bouches=N` : LE MÊME GESTE, JUSQU'À QUATRE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI UNE TABLE ET PAS UN COPIER-COLLER. Le plan demande trois foyers
// de référence (1, 2 et 4 personnes) et « des profils de besoins différents ».
// Trois blocs recopiés divergeraient au premier corps ajouté ; ici les bouches
// secondaires sont une LISTE, et `--duo` n'est plus qu'un alias de `--bouches=2`.
//
// ⚠️ LES CORPS NE SE RESSEMBLENT PAS, ET C'EST LE POINT DU TIR : quatre besoins
// qui ne se confondent pas dans la même casserole. Le titulaire est
// 178 cm / 88 kg / homme qui s'entraîne.
const BOUCHES_SECONDAIRES: readonly {
  readonly prenom: string;
  readonly naissance: string;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly gender: string;
  readonly activityLevel: string;
  readonly dayActivity: string;
  readonly sportFrequency: string;
  readonly appetite: "small" | "average" | "large";
}[] = [
  {
    prenom: "Lea",
    naissance: "1994-04-04",
    heightCm: 164,
    weightKg: 58,
    gender: "female",
    activityLevel: "sedentary",
    dayActivity: "seated",
    sportFrequency: "none",
    appetite: "small",
  },
  // ⚠️ LES VOCABULAIRES SONT CEUX DE LA BASE, PAS DES SYNONYMES ANGLAIS.
  // `keel_household_set_member_body` refuse tout le reste
  // (`bad_activity_level`, `bad_day_activity`, `bad_sport_frequency`) :
  // activité ∈ sedentary|on_feet|trains_some|trains_hard, journée ∈
  // seated|on_feet|physical_job, sport ∈ none|1_2|3_4|5_plus.
  {
    prenom: "Nils",
    naissance: "1986-11-21",
    heightCm: 183,
    weightKg: 92,
    gender: "male",
    activityLevel: "trains_hard",
    dayActivity: "physical_job",
    sportFrequency: "3_4",
    appetite: "large",
  },
  {
    prenom: "Iris",
    naissance: "1999-06-09",
    heightCm: 170,
    weightKg: 64,
    gender: "female",
    activityLevel: "trains_some",
    dayActivity: "on_feet",
    sportFrequency: "1_2",
    appetite: "average",
  },
];

const DUO = Deno.args.includes("--duo");
const BOUCHES = (() => {
  const brut = Deno.args.find((a) => a.startsWith("--bouches="))?.slice(10) ?? "";
  if (brut === "") return DUO ? 2 : 1;
  const n = Number(brut.trim());
  if (!Number.isInteger(n) || n < 1 || n > BOUCHES_SECONDAIRES.length + 1) {
    console.error(
      `⛔ --bouches=${brut} : entier entre 1 et ${BOUCHES_SECONDAIRES.length + 1}`,
    );
    Deno.exit(2);
  }
  return n;
})();
/** Les bouches SANS COMPTE, dans l'ordre de la table. `[]` = foyer d'une. */
const membresSecondaires: string[] = [];
let secondMember = "";
for (const [rangSecondaire, fiche] of BOUCHES_SECONDAIRES.slice(0, BOUCHES - 1).entries()) {
  // ⚠️ « Une personne gouverne le menu ; une bouche n'a pas besoin d'un compte. »
  // On ajoute une BOUCHE (`keel_household_add_member`), jamais un second compte :
  // c'est la forme que le produit sert.
  // ⟳ LOT 2 §3 — RANG 1 = LE TITULAIRE, donc cette bouche est au rang +2.
  const rangRoster = rangSecondaire + 2;
  const sansNaissance = SANS_NAISSANCE.has(rangRoster);
  let id = "";
  const dejaLa = rows.find((r) => String(r.first_name ?? "") === fiche.prenom);
  if (dejaLa) {
    id = String(dejaLa.member_id);
  } else {
    const add = await rpc(me.token, "keel_household_add_member", {
      p_first_name: fiche.prenom,
      // ⟳ LOT 2 §3 — SANS DATE, `keel_household_member_age` rend `unknown`, et
      // `unknown` n'est PAS « adulte » : aucune direction, donc aucune portion
      // pesée. C'est la variante « bouche protégée » du plan.
      p_birth_date: sansNaissance ? null : fiche.naissance,
    });
    const encore = await rpc(me.token, "keel_household_roster");
    const rows2 = Array.isArray(encore.body) ? encore.body as Record<string, unknown>[] : [];
    const nouvelle = rows2.find((r) => String(r.first_name ?? "") === fiche.prenom);
    if (!nouvelle) throw new Error(`add_member → ${JSON.stringify(add.body)}`);
    id = String(nouvelle.member_id);
  }
  const corps = await rpc(me.token, "keel_household_set_member_body", {
    p_member: id,
    p_height_cm: fiche.heightCm,
    p_weight_kg: fiche.weightKg,
    p_gender: fiche.gender,
    p_activity_level: fiche.activityLevel,
    p_day_activity: fiche.dayActivity,
    p_sport_frequency: fiche.sportFrequency,
    p_activity_axes_asked: true,
    p_appetite: fiche.appetite,
    p_appetite_asked: true,
  });
  const cb = corps.body as Record<string, unknown>;
  if (cb?.ok !== true) {
    throw new Error(`corps de ${fiche.prenom} → ${JSON.stringify(cb)}`);
  }
  membresSecondaires.push(id);
  console.log(
    `   bouche ${membresSecondaires.length + 1} : ${id} (${fiche.prenom} · ` +
      `${fiche.heightCm} cm · ${fiche.weightKg} kg · appétit ${fiche.appetite}` +
      (sansNaissance ? ` · ⚠️ SANS DATE DE NAISSANCE ⇒ âge « unknown »` : "") + `)`,
  );
}
secondMember = membresSecondaires[0] ?? "";

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 — `--objectifs=` ET `--rythmes=` : UN BUT PAR BOUCHE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT QUE CES DEUX DRAPEAUX FERMENT, AVEC SA MESURE. Le banc posait un
// CORPS sur chaque bouche secondaire et jamais un OBJECTIF. Or
// `household_portions.ts::weighedPortionMembers` ne rend une portion PESÉE
// qu'à `fat_loss` ou `muscle_gain` — c'est une protection voulue, pas un
// oubli : « se maintenir, c'est précisément ne pas vouloir qu'on compte à sa
// place ». Toutes les autres bouches partagent donc UN BAC, dont les grammes
// décrivent le récipient et personne.
//
// Conséquence, mesurée sur `perte-l3d04` (4 bouches, 3 sans objectif) : un seul
// bac de 1 123 g pour Lea + Nils + Iris, dont la PART vaut 947 kcal quand leurs
// trois cibles valent 639, 1 338 et 861. Une casserole ne peut pas satisfaire
// trois cibles à ±10 % : « 24/24 conforme » est alors inatteignable PAR
// CONSTRUCTION, quoi que fasse le modèle.
//
//   --objectifs=fat_loss,muscle_gain,fat_loss,muscle_gain
//        un jeton par bouche, DANS L'ORDRE DU ROSTER (titulaire d'abord).
//        Une entrée vide laisse la bouche telle quelle.
//   --rythmes=0.5,0.25,0.5,0.25
//        le cran hebdomadaire de chacune, même ordre. Facultatif :
//        `20260819140000_une_direction_sans_rythme_pese_deja` dit qu'une
//        direction sans cran pèse déjà.
//
// ⛔ CHAQUE BUT PART PAR SA DESTINATION CANONIQUE, ET ELLE EST IMPRIMÉE.
// `keel_household_roster_for` tranche : `hm.user_id is null ⇒ hm.goal`, sinon
// `sg.goal`. Écrire l'objectif du TITULAIRE sur sa ligne de foyer serait écrire
// dans une colonne que le roster ne lit pas pour lui — très exactement le
// défaut C1 des apports fixes, une seconde fois.
//
// ⚠️ LA CONTRE-ÉPREUVE EST UNE RELECTURE DU ROSTER, pas un `ok: true`. Un
// `ok: true` ne dit pas ce que le générateur LIRA.
const OBJECTIFS = (Deno.args.find((a) => a.startsWith("--objectifs="))?.slice(12) ?? "")
  .split(",").map((x) => x.trim());
const RYTHMES = (Deno.args.find((a) => a.startsWith("--rythmes="))?.slice(10) ?? "")
  .split(",").map((x) => x.trim());
const OBJECTIFS_CONNUS = [
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "performance",
  "health",
  "maintenance",
];
if (OBJECTIFS.some((x) => x !== "")) {
  const bouchesOrdonnees = [memberId, ...membresSecondaires];
  if (OBJECTIFS.length > bouchesOrdonnees.length) {
    console.error(
      `⛔ --objectifs porte ${OBJECTIFS.length} jeton(s) pour ${bouchesOrdonnees.length} ` +
        `bouche(s). Un jeton sans bouche ne serait posé nulle part et le run ` +
        `mesurerait un foyer que personne n'a demandé.`,
    );
    Deno.exit(2);
  }
  for (const [rang, but] of OBJECTIFS.entries()) {
    if (but === "") continue;
    if (!OBJECTIFS_CONNUS.includes(but)) {
      console.error(`⛔ --objectifs : « ${but} » hors vocabulaire (${OBJECTIFS_CONNUS.join(" | ")}).`);
      Deno.exit(2);
    }
    const id = bouchesOrdonnees[rang];
    const cran = Number(RYTHMES[rang] ?? "");
    if (rang === 0) {
      // ⛔ LE TITULAIRE ÉCRIT DANS `student_goals`, et c'est la colonne que le
      // roster lui lit. `resolution=merge-duplicates` garde le reste de la
      // ligne (poids visé, contraintes pratiques, apports fixes).
      await post("student_goals?on_conflict=user_id", {
        user_id: me.userId,
        goal: but,
        content_locale: "fr-FR",
        target_weight_kg: cas.targetWeight,
        target_pace_kg_per_week: Number.isFinite(cran) && cran > 0 ? cran : cas.pace,
      }, "resolution=merge-duplicates,return=minimal");
      console.log(`   objectif bouche 1 : ${but} → écrit dans « student_goals.goal »`);
      continue;
    }
    const out = await rpc(me.token, "keel_household_set_member_goal", {
      p_member: id,
      p_goal: but,
    });
    const ob = out.body as Record<string, unknown>;
    if (ob?.ok !== true) throw new Error(`objectif de la bouche ${rang + 1} → ${JSON.stringify(ob)}`);
    console.log(
      `   objectif bouche ${rang + 1} : ${but} → écrit dans « household_members.goal »`,
    );
    if (Number.isFinite(cran) && cran > 0) {
      const cible = await rpc(me.token, "keel_household_set_member_target", {
        p_member: id,
        p_target_weight_kg: null,
        p_pace_kg_per_week: cran,
      });
      const cb2 = cible.body as Record<string, unknown>;
      console.log(
        `   cran bouche ${rang + 1} : ${cran} kg/sem → ${JSON.stringify(cb2)}`,
      );
    }
  }
  // ── LA CONTRE-ÉPREUVE : CE QUE LE GÉNÉRATEUR LIRA, PAR SA PROPRE VUE ─────
  const relu = await rpc(me.token, "keel_household_roster");
  const lignes = Array.isArray(relu.body) ? relu.body as Record<string, unknown>[] : [];
  console.log(
    `   ⛔ CE QUE « keel_household_roster » REND (la source du générateur) :\n` +
      lignes.map((r) =>
        `      · ${String(r.first_name ?? "?").padEnd(6)} objectif=${String(r.goal ?? "AUCUN").padEnd(12)} ` +
        `âge=${String(r.age_state ?? "?")}` +
        (r.goal === "fat_loss" || r.goal === "muscle_gain"
          ? "   → PORTION PESÉE (weighedPortionMembers)"
          : "   ⚠️ BAC COMMUN — aucun gramme ne vise cette personne")
      ).join("\n"),
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 — `--regimes=` ET `--allergies=` : LA CONTRAINTE
//                INDIVIDUELLE D'UNE BOUCHE, ET SON PLAT DÉDIÉ
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI LES DEUX ENSEMBLE. Le plan demande, pour N=2 et N=4, « une
// contrainte individuelle » ET « un plat dédié ». Ce ne sont pas deux réglages
// indépendants : c'est `dishBearingMembers` qui ouvre le BUDGET DE PLATS
// (`index.ts` ≈ l. 5521, `compositionEaterCells`), et une bouche n'y entre que
// si elle DIVERGE — par son régime, ou par un repas à elle. Déclarer une
// allergie seule ne fait entrer personne dans ce budget : elle arme un verrou
// de sortie, ce qui est une autre chose.
//
//   --regimes=,vegetarian        un jeton par bouche, ordre du roster. Vide =
//                                inchangé. Vocabulaire de la base :
//                                omnivore | vegetarian | vegan | pescatarian |
//                                gluten_free (`keel_household_set_member_diet`).
//   --allergies=,arachide        un libellé par bouche, même ordre
//                                (`keel_household_add_allergy`).
//
// ⚠️ LE ROSTER EST RELU APRÈS, comme pour `--objectifs` : c'est la vue que le
// générateur lit, et un `ok: true` ne dit pas ce qu'elle rendra.
const REGIMES = (Deno.args.find((a) => a.startsWith("--regimes="))?.slice(10) ?? "")
  .split(",").map((x) => x.trim());
const ALLERGIES_BOUCHES = (Deno.args.find((a) => a.startsWith("--allergies="))?.slice(12) ?? "")
  .split(",").map((x) => x.trim());
if (REGIMES.some((x) => x !== "") || ALLERGIES_BOUCHES.some((x) => x !== "")) {
  const bouchesOrdonnees = [memberId, ...membresSecondaires];
  for (const [rang, regime] of REGIMES.entries()) {
    if (regime === "" || rang >= bouchesOrdonnees.length) continue;
    const out = await rpc(me.token, "keel_household_set_member_diet", {
      p_member: bouchesOrdonnees[rang],
      p_diet: regime,
    });
    const rb = out.body as Record<string, unknown>;
    if (rb?.ok !== true) throw new Error(`régime de la bouche ${rang + 1} → ${JSON.stringify(rb)}`);
    console.log(`   régime bouche ${rang + 1} : ${regime}`);
  }
  for (const [rang, label] of ALLERGIES_BOUCHES.entries()) {
    if (label === "" || rang >= bouchesOrdonnees.length) continue;
    // ⚠️ IDEMPOTENT : le banc peut relancer le même compte. Un doublon ferait
    // DEUX morsures là où la personne n'a déclaré qu'une allergie.
    const deja = await fetch(
      `${API}/rest/v1/household_member_allergies?member_id=eq.${bouchesOrdonnees[rang]}&select=label`,
      { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
    );
    const lues = await deja.json().catch(() => []) as Record<string, unknown>[];
    if (!lues.some((x) => String(x.label ?? "") === label)) {
      const out = await rpc(me.token, "keel_household_add_allergy", {
        p_member: bouchesOrdonnees[rang],
        p_label: label,
      });
      const ab2 = out.body as Record<string, unknown>;
      if (ab2?.ok !== true) throw new Error(`allergie de la bouche ${rang + 1} → ${JSON.stringify(ab2)}`);
    }
    console.log(`   allergie bouche ${rang + 1} : « ${label} »`);
  }
  const relu = await rpc(me.token, "keel_household_roster");
  const lignes = Array.isArray(relu.body) ? relu.body as Record<string, unknown>[] : [];
  console.log(
    `   ⛔ RÉGIMES VUS PAR LE GÉNÉRATEUR : ` +
      lignes.map((r) => `${String(r.first_name)}=${String(r.diet ?? "aucun")}`).join(" · "),
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C6 — `--apport-fixe-duo` : LA BOUCHE SANS COMPTE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ C1 A DEUX SOURCES CANONIQUES, ET LE BANC N'EN EXERÇAIT QU'UNE. La même
// RPC (`keel_household_set_member_fixed_intakes`) ROUTE vers `student_goals`
// pour un TITULAIRE et vers `household_members.fixed_intakes` pour une bouche
// SANS COMPTE. Le plan de clôture demande « les apports fixes du titulaire ET
// d'un membre sans compte » : sans ce drapeau, la seconde destination n'était
// prouvée par aucun parcours complet.
//
// ⚠️ LA DESTINATION EST IMPRIMÉE (`wrote`), et relue en base juste après. Un
// « ok: true » ne dit pas OÙ.
if (Deno.args.includes("--apport-fixe-duo")) {
  if (!secondMember) {
    console.error(`⛔ --apport-fixe-duo exige --duo (il n'y a pas de 2e bouche).`);
    Deno.exit(2);
  }
  const apport = await rpc(me.token, "keel_household_set_member_fixed_intakes", {
    p_member: secondMember,
    p_intakes: [{
      food_ref: "plain_yogurt",
      label: "yaourt nature",
      amount: 150,
      unit: "g",
      days: [],
      slot: "breakfast",
      replaces_meal: false,
    }],
  });
  const ab = apport.body as Record<string, unknown>;
  if (ab?.ok !== true) throw new Error(`apport fixe 2e bouche → ${JSON.stringify(ab)}`);
  console.log(
    `   apport fixe 2e bouche : 150 g plain_yogurt @breakfast → écrit dans « ${ab.wrote} »`,
  );
  const relu = await fetch(
    `${API}/rest/v1/household_members?member_id=eq.${secondMember}&select=fixed_intakes`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const lignes = await relu.json().catch(() => []) as Record<string, unknown>[];
  console.log(
    `   relu en base : household_members.fixed_intakes = ` +
      `${JSON.stringify(lignes[0]?.fixed_intakes ?? null)}`,
  );
}

// ── LE COMPTE SECONDAIRE RESTE REFUSÉ À LA GÉNÉRATION ─────────────────────
//
// Le plan ③ l'exige en toutes lettres. On le mesure AVANT le tir nominal, pour
// que le refus porte sur un foyer réel et pas sur un foyer vide.
let refusSecondaire: { status: number; error: string } | null = null;
if (Deno.args.includes("--secondaire")) {
  const invite = await rpc(me.token, "keel_household_invite", {
    p_email: EMAIL.replace("@", ".second@"),
    p_member: secondMember || memberId,
  });
  const inv = invite.body as Record<string, unknown>;
  const second = await account(EMAIL.replace("@", ".second@"));
  await post("profiles?on_conflict=id", { id: second.userId, country: "FR" },
    "resolution=merge-duplicates,return=minimal");
  if (inv?.ok === true) {
    await rpc(second.token, "keel_household_join", {
      p_token: String(inv.token),
      p_country: "FR",
    });
  }
  const r = await handler(new Request("http://localhost/generate-household-meal-v1", {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${second.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ intent: "prepare_next", window: { kind: "days", count: 3 } }),
  }));
  const rb = await r.json().catch(() => ({} as Record<string, unknown>));
  refusSecondaire = { status: r.status, error: String((rb as Record<string, unknown>).error ?? "") };
  console.log(
    `   compte secondaire → ${refusSecondaire.status} « ${refusSecondaire.error} »`,
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · C0 ① — LA DEMANDE EST FIGÉE **AVANT** L'APPEL
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ « Ne pas construire les cases attendues à partir des plats retournés : un
// plat manquant disparaîtrait du contrôle. » La grille attendue est donc
// dérivée ICI, avant que le modèle n'existe, par les FONCTIONS DE PRODUCTION
// qui décident de la fenêtre — `slotsUnservableToday`, `cookingAskedToday`,
// `withoutSpentFirstDay`. On n'en recopie aucune règle : on les appelle.
const MAINTENANT = new Date();
const FUSEAU = "Europe/Paris";
const jourLocalDemande = new Intl.DateTimeFormat("fr-CA", {
  timeZone: FUSEAU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(MAINTENANT);
const heureLocaleDemande = Number(
  new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU, hour: "2-digit", hour12: false })
    .format(MAINTENANT).slice(0, 2),
);
// ⚠️ TYPÉ, PAS `as never`. Un `as` sur un type étranger éteint la
// vérification : ce dépôt l'a payé (« 200 en log, null en silence »). Si
// `EatingOccasion` change, cette ligne doit rougir.
const REPAS_DE_LA_MAISON: readonly EatingOccasion[] = ["breakfast", "lunch", "dinner"];
const passesAujourdhui = slotsUnservableToday({
  hourNow: heureLocaleDemande,
  rhythm: REPAS_DE_LA_MAISON.map((slot) => ({ slot })),
  declaredHours: [],
});
const fenetreAttendue = withoutSpentFirstDay(
  { startsOn: jourLocalDemande, durationDays: 3 },
  {
    today: jourLocalDemande,
    cookOnlyDay: null,
    declaredSlots: REPAS_DE_LA_MAISON.map((s) => s),
    passedSlots: passesAujourdhui.passed,
    heldSlots: passesAujourdhui.heldForShopping,
    shoppingCutoffReached: !cookingAskedToday({ hourNow: heureLocaleDemande }),
  },
);
const JOURS_TOKEN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const joursAttendus: string[] = [];
const jourVersDateAttendu: Record<string, string> = {};
for (let i = 0; i < fenetreAttendue.durationDays; i++) {
  const d = new Date(
    new Date(`${fenetreAttendue.startsOn}T00:00:00Z`).getTime() + i * 86_400_000,
  ).toISOString().slice(0, 10);
  const tok = JOURS_TOKEN[new Date(`${d}T00:00:00Z`).getUTCDay()];
  joursAttendus.push(tok);
  jourVersDateAttendu[tok] = d;
}
// ⛔ LE PREMIER JOUR N'EST PAS UN JOUR COMME LES AUTRES, ET C'EST LE CAS QUE LE
// PLAN RÉCLAME. Quand la fenêtre commence AUJOURD'HUI, elle perd les moments
// déjà passés et ceux qu'on n'a plus le temps d'acheter — les deux listes que
// `slotsUnservableToday` vient de rendre. Les garder ferait annoncer 9 cases
// pour une fenêtre qui en sert 7, et le banc se déclarerait en échec sur deux
// cases que personne n'a demandées.
const perduesLePremierJour = new Set<string>(
  fenetreAttendue.startsOn === jourLocalDemande
    ? [...passesAujourdhui.passed, ...passesAujourdhui.heldForShopping]
    : [],
);
const bouchesDemandees = [memberId, ...membresSecondaires];
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 §3 — UNE GRILLE PAR BOUCHE, PAS UNE GRILLE POUR TOUS
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ AVANT CE LOT, LA MÊME GRILLE ÉTAIT POSÉE SUR TOUT LE MONDE. Sur un foyer
// où quelqu'un ne déjeune pas ici, le banc annonçait ses trois repas, le moteur
// n'en composait que deux, et les deux cases manquantes se comptaient absentes
// — alors que personne ne les avait demandées. Le plan l'interdit en toutes
// lettres : « le dénominateur est la somme des cases personne-date-créneau
// RÉELLEMENT DEMANDÉES ».
//
// ⚠️ LA RÈGLE EST CELLE DU PRODUIT : un rythme déclaré gagne, rien de déclaré
// vaut les trois repas de la maison (`slotContractsFor` : `[]` ⇒
// `HOUSE_DEFAULT_SLOTS`). Elle est lue ici sur ce que le banc VIENT DE POSER,
// pas devinée.
const rythmeDeclare = new Map<string, string[]>();
for (const [rang, brut] of RYTHMES_BOUCHES.entries()) {
  if (brut === "" || rang >= bouchesDemandees.length) continue;
  const slots = brut.split(",").map((x) => x.trim()).filter(Boolean);
  if (slots.length === 0) continue;
  const out = await rpc(me.token, "keel_household_set_member_rhythm", {
    p_member: bouchesDemandees[rang],
    p_rhythm: slots.map((slot) => ({ slot })),
  });
  const rb = out.body as Record<string, unknown>;
  if (rb?.ok !== true) throw new Error(`rythme de la bouche ${rang + 1} → ${JSON.stringify(rb)}`);
  rythmeDeclare.set(bouchesDemandees[rang], slots);
  console.log(`   rythme bouche ${rang + 1} : ${slots.join(", ")} (les autres moments ne sont PAS demandés)`);
}
const casesParBouche: Record<string, Record<string, string[]>> = {};
for (const id of bouchesDemandees) {
  const sesSlots = rythmeDeclare.get(id) ?? REPAS_DE_LA_MAISON.map((s) => String(s));
  casesParBouche[id] = Object.fromEntries(
    joursAttendus.map((j, i) => [
      j,
      sesSlots.filter((s) => i > 0 || !perduesLePremierJour.has(s)),
    ]),
  );
}
const casesAttenduesTotal = Object.values(casesParBouche)
  .reduce((n, g) => n + Object.values(g).reduce((k, s) => k + s.length, 0), 0);

console.log(`\n── LA DEMANDE, FIGÉE AVANT L'APPEL ───────────────────────────`);
console.log(
  `   horloge       ${MAINTENANT.toISOString()} · ${jourLocalDemande} ` +
    `${String(heureLocaleDemande).padStart(2, "0")} h (${FUSEAU})` +
    (horloge ? `   ⚠️ HORLOGE INJECTÉE (décalage ${horloge.decalageMs} ms)` : ""),
);
console.log(`   appétit       ${APPETIT}`);
console.log(
  `   fenêtre       3 jours demandés ⇒ ${fenetreAttendue.durationDays} jour(s) ` +
    `à partir du ${fenetreAttendue.startsOn}` +
    (fenetreAttendue.dropped
      ? `   (${fenetreAttendue.dropped} retiré : ${fenetreAttendue.cause})`
      : ""),
);
console.log(`   jours         ${JSON.stringify(joursAttendus)}`);
console.log(
  `   CASES ATTENDUES ${casesAttenduesTotal} · grille par bouche ` +
    `${JSON.stringify(casesParBouche[bouchesDemandees[0]])}`,
);
if (perduesLePremierJour.size > 0) {
  console.log(
    `   premier jour PARTIEL : ${[...perduesLePremierJour].join(", ")} retiré(s) — ` +
      `passés ${JSON.stringify(passesAujourdhui.passed)}, ` +
      `retenus pour les courses ${JSON.stringify(passesAujourdhui.heldForShopping)}`,
  );
}
console.log(
  `   ⛔ CE NOMBRE NE VIENT PAS DES PLATS. Une case sans plat restera attendue,` +
    ` et se comptera absente.`,
);

const demandeFigee = {
  source: {
    instant: "harnais_avant_appel" + (horloge ? " (horloge INJECTÉE)" : ""),
    fenetre: "plan_hours.ts + meal_plan_window.ts, appelées avant l'appel",
    jours: "dérivés de l'horloge du harnais — JAMAIS de la liste des plats",
    slots: "les trois repas de la maison (aucun rythme déclaré sur ce banc)",
    bouches: "harnais_avant_appel (posées par les RPC du produit)",
  },
  instant: {
    lance_le: MAINTENANT.toISOString(),
    jour_local: jourLocalDemande,
    heure_locale: `${String(heureLocaleDemande).padStart(2, "0")}:00`,
    fuseau: FUSEAU,
    horloge_injectee: HORLOGE || null,
    decalage_ms: horloge?.decalageMs ?? 0,
  },
  fenetre: {
    demandee: { kind: "days", count: 3 },
    cases_annoncees: casesAttenduesTotal / bouchesDemandees.length,
    bouches_annoncees: bouchesDemandees.length,
    premier_jour_partiel: [...perduesLePremierJour],
    attendue: {
      starts_on: fenetreAttendue.startsOn,
      duration_days: fenetreAttendue.durationDays,
      dropped: fenetreAttendue.dropped,
      cause: fenetreAttendue.cause,
    },
    moments_passes: passesAujourdhui.passed,
    moments_retenus_pour_les_courses: passesAujourdhui.heldForShopping,
  },
  jours: joursAttendus,
  jour_vers_date: jourVersDateAttendu,
  cases_par_bouche: casesParBouche,
  cases_attendues_par_bouche: Object.fromEntries(
    Object.entries(casesParBouche).map((
      [id, g],
    ) => [id, Object.values(g).reduce((n, s) => n + s.length, 0)]),
  ),
  cases_attendues_total: casesAttenduesTotal,
  appetit_pose: APPETIT,
};

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C5 — L'ÉTAT DE LA BASE **AVANT** L'APPEL
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ « PUIS RELIT LA BASE POUR PROUVER QU'AUCUN REMPLACEMENT INVALIDE N'A EU
// LIEU. » Une relecture d'APRÈS ne prouve rien toute seule : sans l'état
// d'avant, « le plan est toujours là » et « il a été réécrit à l'identique » se
// lisent pareil. On lit donc les deux, et on compare `updated_at`.
async function plansDuCompte(): Promise<Record<string, unknown>[]> {
  const r = await fetch(
    `${API}/rest/v1/student_generated_meals?user_id=eq.${me.userId}` +
      `&select=id,starts_on,duration_days,retired_at,created_at,updated_at,plan_kind` +
      `&order=created_at.asc`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  return await r.json().catch(() => []) as Record<string, unknown>[];
}
const plansAvant = await plansDuCompte();
console.log(
  `\n── LA BASE AVANT L'APPEL ─────────────────────────────────────\n` +
    `   ${plansAvant.length} plan(s) : ${
      JSON.stringify(
        plansAvant.map((p) => ({
          id: String(p.id).slice(0, 8),
          w: `${p.starts_on}+${p.duration_days}`,
          retire: p.retired_at ?? null,
          maj: p.updated_at,
        })),
      )
    }`,
);

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C5 — `--remplace` : VISER LE PLAN VIVANT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ SANS CE DRAPEAU, LE REFUS NE PROUVE QUE LA MOITIÉ. `prepare_next` n'écrase
// rien par construction : un 422 sur ce chemin dit « aucune ligne créée », pas
// « l'ancien plan valide est préservé ». `replace_current` est le SEUL intent
// qui retire un plan existant (`write_student_meal_plan` pose `retired_at` sur
// `p_replaces`), donc le seul où « le remplacement invalide » est possible.
const REMPLACE = Deno.args.includes("--remplace");
const vivant = plansAvant.find((p) =>
  p.retired_at === null && String(p.plan_kind ?? "") === "household"
) ?? null;
if (REMPLACE && vivant === null) {
  console.error(
    `⛔ --remplace : ce compte n'a aucun plan de foyer vivant à remplacer. ` +
      `Lance d'abord un tir nominal sur le MÊME compte (--compte=…).`,
  );
  Deno.exit(2);
}
const corpsDemande = REMPLACE
  ? {
    intent: "replace_current",
    replaces: String(vivant?.id),
    window: { kind: "days", count: 3 },
  }
  : { intent: "prepare_next", window: { kind: "days", count: 3 } };
if (REMPLACE) {
  console.log(
    `   --remplace : intent=replace_current, replaces=${String(vivant?.id).slice(0, 8)}`,
  );
}

// ── ⑤ L'APPEL — LE VRAI HANDLER, LA VRAIE BASE, LE TRANSPORT CONTRÔLÉ ─────
const t0 = performance.now();
const req = new Request("http://localhost/generate-household-meal-v1", {
  method: "POST",
  headers: {
    apikey: ANON,
    authorization: `Bearer ${me.token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(corpsDemande),
});
const res = await handler(req);
const ms = Math.round(performance.now() - t0);
const body = await res.json().catch(() => ({} as Record<string, unknown>));
transport.restore();

console.log(`\n── RÉPONSE ───────────────────────────────────────────────`);
console.log(`   statut     ${res.status}`);
console.log(`   durée      ${ms} ms  (hors appel fournisseur réel)`);
console.log(`   appels fournisseur interceptés : ${transport.calls.length}`);
for (const c of transport.calls) {
  console.log(`     · ${c.matched}  modèle=${c.model}  corps=${c.bodyBytes} o  à +${c.atMs} ms`);
}
console.log(`   sorties réseau REFUSÉES : ${transport.refused.length}`);
// ⟳ 2026-09-13 · LOT 3 §3.3 — CE QUI A ÉTÉ FACTURÉ, COMPTÉ À PART.
console.log(
  `   appels fournisseur RÉELS (facturés) : ${transport.realCalls.length}` +
    (transport.realCalls.length === 0
      ? "  — zéro dépense"
      : transport.realCalls
        .map((c) =>
          `\n     💸 tour ${c.turn} · ${c.status} · ${c.ms} ms · ${c.bytes} o`
        )
        .join("")),
);
if (res.status !== 200) {
  console.log(`   corps : ${JSON.stringify(body).slice(0, 4000)}`);
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C5 — LA RELECTURE DE LA BASE, ET LE VERDICT ÉCRIT
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE BLOC EST LA PREUVE DEMANDÉE PAR LE PLAN (§ C5 ②), et il compare l'état
// d'AVANT à celui d'APRÈS. Trois faits, chacun lu et pas déduit :
//   ① aucune ligne n'a été ajoutée ;
//   ② aucune ligne vivante n'a été retirée (`retired_at` reste `null`) ;
//   ③ aucune ligne n'a été réécrite (`updated_at` identique).
// « Ajouter un message ou compter `blocking` ne suffit pas » : voilà ce qui
// remplace le message.
const plansApres = await plansDuCompte();
const avantParId = new Map(plansAvant.map((p) => [String(p.id), p]));
const ajoutes = plansApres.filter((p) => !avantParId.has(String(p.id)));
const retires = plansApres.filter((p) => {
  const a = avantParId.get(String(p.id));
  return a !== undefined && a.retired_at === null && p.retired_at !== null;
});
const reecrits = plansApres.filter((p) => {
  const a = avantParId.get(String(p.id));
  return a !== undefined && String(a.updated_at) !== String(p.updated_at);
});
console.log(`\n── LA BASE APRÈS L'APPEL ─────────────────────────────────────`);
console.log(`   plans avant ${plansAvant.length} · après ${plansApres.length}`);
console.log(`   lignes AJOUTÉES  : ${ajoutes.length} ${JSON.stringify(ajoutes.map((p) => String(p.id).slice(0, 8)))}`);
console.log(`   lignes RETIRÉES  : ${retires.length} ${JSON.stringify(retires.map((p) => String(p.id).slice(0, 8)))}`);
console.log(`   lignes RÉÉCRITES : ${reecrits.length} ${JSON.stringify(reecrits.map((p) => String(p.id).slice(0, 8)))}`);
if (res.status === 422) {
  const intact = ajoutes.length === 0 && retires.length === 0 && reecrits.length === 0;
  console.log(
    intact
      ? `   ✅ REFUS SANS ÉCRITURE : la base n'a pas bougé d'une ligne.`
      : `   ⛔ LE REFUS A LAISSÉ UNE TRACE EN BASE — la porte est en aval d'une écriture.`,
  );
}

// ── ⑥ LA LIGNE ÉCRITE, RELUE ET FIXÉE ─────────────────────────────────────
const meal = (body as Record<string, unknown>)?.meal as Record<string, unknown> | undefined;
const mealId = String(meal?.id ?? "");
let stored: Record<string, unknown> | null = null;
if (mealId) {
  const r = await fetch(
    `${API}/rest/v1/student_generated_meals?id=eq.${mealId}&select=*`,
    { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
  );
  const list = await r.json() as Record<string, unknown>[];
  stored = list[0] ?? null;
}
try {
  Deno.mkdirSync(SORTIE, { recursive: true });
} catch { /* déjà là */ }
const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
const fichier = `${SORTIE}/${CAS}${SUFFIXE ? "-" + SUFFIXE : ""}-${horodatage}.json`;
Deno.writeTextFileSync(
  fichier,
  JSON.stringify({
    cas: CAS,
    titre: `banc ② · ${CAS.toUpperCase()} · appétit ${APPETIT}` +
      (HORLOGE ? ` · horloge injectée ${HORLOGE}` : ""),
    lance_le: new Date().toISOString(),
    jour_local: demandeFigee.instant.jour_local,
    heure_locale: demandeFigee.instant.heure_locale,
    cases_annoncees: demandeFigee.fenetre.cases_annoncees,
    bouches: demandeFigee.fenetre.bouches_annoncees,
    // ⟳ 2026-09-11 · C0 ① — LA DEMANDE FIGÉE VOYAGE AVEC LA SORTIE. Sans elle,
    // l'analyseur REFUSE de mesurer : c'est ce qui fait de ① une garde.
    demande: demandeFigee,
    duree_ms: ms,
    statut: res.status,
    reponse: body,
    appels_fournisseur: transport.calls,
    sorties_refusees: transport.refused,
    ligne_ecrite: stored,
    retaillage,
    // Les FAITS de la bouche, tels que le banc les a POSÉS par les RPC du
    // produit. L'analyseur en fabrique le contexte de mesure ; sans eux il
    // devrait les deviner, et deviner un corps fausse toute la grille.
    appels_reels: transport.realCalls,
    refus_secondaire: refusSecondaire,
    // ⟳ 2026-09-12 · ÉTAPE C5 — LA BASE, AVANT ET APRÈS. Sans l'état d'avant,
    // « le plan est toujours là » et « il a été réécrit à l'identique » se
    // lisent pareil.
    base_avant: plansAvant,
    base_apres: plansApres,
    base_delta: {
      ajoutes: ajoutes.map((p) => p.id),
      retires: retires.map((p) => p.id),
      reecrits: reecrits.map((p) => p.id),
    },
    demande_envoyee: corpsDemande,
    // ⟳ C6 — CE QUI A ÉTÉ ARMÉ ET CE QUI A ÉTÉ INJECTÉ, dans la fixture même :
    // un refus dont la fixture ne dit pas ce qu'elle avait déclaré n'est pas
    // relisible six heures plus tard.
    exclusion_declaree: EXCLUSION || null,
    allergene_injecte: ALLERGENE_TOUR < 0
      ? null
      : { tour: ALLERGENE_TOUR, terme: ALLERGENE_TERME, ref: ALLERGENE_REF },
    second_member: secondMember,
    meta_bouche: {
      member_id: memberId,
      user_id: me.userId,
      email: EMAIL,
      first_name: cas.firstName,
      birth_date: TITULAIRE_SANS_NAISSANCE ? null : cas.birthDate,
      goal: cas.goal,
      pace: cas.pace,
      weight_kg: cas.weightKg,
      height_cm: cas.heightCm,
    },
    journal,
  }, null, 2),
);
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C4 — `--prompts` : CE QUI EST RÉELLEMENT PARTI AU MODÈLE
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ SANS LUI, « la consigne protéique atteint-elle le premier jet ? » N'A PAS
// DE RÉPONSE AU BANC. Le compteur `protein_brief` dit que le brief a été
// CONSTRUIT; il ne dit pas qu'il a été ÉCRIT dans le prompt. C'est exactement
// la distinction « codé / branché » que le plan de clôture exige de tenir.
//
// ⚠️ UN FICHIER À PART, et seulement sur demande: 46 ko par appel dans chaque
// fixture de sortie les feraient grossir de moitié.
if (Deno.args.includes("--prompts")) {
  const chemin = fichier.replace(/\.json$/, ".prompts.txt");
  Deno.writeTextFileSync(
    chemin,
    transport.prompts
      .map((corps: string, i: number) => {
        let texte = corps;
        try {
          const p = JSON.parse(corps) as Record<string, unknown>;
          texte = JSON.stringify(p, null, 2);
        } catch { /* un corps illisible est rendu brut */ }
        return `═══ APPEL ${i + 1} / ${transport.prompts.length} ═══\n${texte}`;
      })
      .join("\n\n"),
  );
  console.log(`   prompts écrits : ${chemin}`);
}
console.log(`\n   fixture écrite : ${fichier}`);
console.log(`   plan : ${mealId || "(aucun)"}`);
// ── LE CONTRÔLE D'ANNONCE : ce qui était attendu contre ce qui a été accepté ─
if (stored) {
  const accepte = `${String(stored.starts_on)} → ${String(stored.ends_on)}`;
  const attendu = `${fenetreAttendue.startsOn} (+${fenetreAttendue.durationDays} j)`;
  console.log(
    `   fenêtre attendue ${attendu} · fenêtre acceptée ${accepte}` +
      (String(stored.starts_on) === fenetreAttendue.startsOn &&
          Number(stored.duration_days) === fenetreAttendue.durationDays
        ? `   ✅ la dérivation d'avant l'appel décrit bien la fenêtre servie`
        : `   ⛔ LA DÉRIVATION D'AVANT L'APPEL NE DÉCRIT PAS LA FENÊTRE SERVIE`),
  );
}
// ⚠️ L'HORLOGE SE REND, même si personne ne lit après : un processus qui sort
// avec un `Date` détourné laisserait un piège à la prochaine ligne ajoutée ici.
horloge?.restore();
Deno.exit(res.status === 200 ? 0 : 1);
