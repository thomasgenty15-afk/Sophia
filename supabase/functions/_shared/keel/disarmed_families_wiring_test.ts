// ═══════════════════════════════════════════════════════════════════════════
// LOT A.1 — LA GARDE DES CHARGES INUTILISABLES EST TERMINALE, ET LE RESTE
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UN PIÈGE MESURÉ, PAS D'UNE INTUITION.
//
// De sa pose (2026-08-12, revue adversariale FF-056) au 2026-09-07, la garde
// qui empêche une charge de bouton illisible de descendre au dispatcher a vécu
// IMBRIQUÉE dans le lecteur du pouls:
//
//     const pulse = readPulseReply(message.button_payload);
//     if (pulse.kind === "none") {
//       … la garde …
//     }
//
// Elle était donc attachée par hasard à la famille qui se lisait EN DERNIER.
// Le chantier de réduction du chat retire précisément ce lecteur-là. Sans ce
// fichier, ce retrait aurait emporté la garde avec lui — en silence, sans
// qu'un seul type ne bronche — et TOUTES les charges désarmées seraient
// reparties en `PASS` vers le dispatcher: exactement le défaut que la garde
// existe pour fermer, réintroduit par le geste censé nettoyer.
//
// ── LES TROIS PROPRIÉTÉS TENUES ICI ────────────────────────────────────────
//
//   P1. LA GARDE EST TERMINALE. Tout lecteur s'exécute AVANT elle, et plus
//       rien ne s'exécute après. Une garde placée avant un lecteur refuserait
//       un tap valide; une garde suivie d'un lecteur laisserait passer une
//       charge cassée. Les deux moitiés sont vérifiées.
//
//   P2. ELLE EST AU PREMIER NIVEAU. Deux espaces d'indentation, pas quatre.
//       C'est la moitié structurelle de P1: un `if` qui la ré-enveloppe la
//       rendrait de nouveau conditionnelle à une famille, et P1 seule ne le
//       verrait pas tant que cette famille est la dernière lue.
//
//   P3. CHAQUE PRÉFIXE EST CLASSÉ. Une famille listée a soit un lecteur, soit
//       une annotation qui dit POURQUOI elle n'en a pas (`FRONT:` — l'écran
//       l'intercepte; `DÉSARMÉ:` — plus personne ne la fabrique, mais des
//       bulles en portent encore dans l'historique des gens). Une famille
//       ajoutée sans être classée fait rougir ce test: c'est ce qui empêche la
//       liste de devenir un tampon.
//
// ── LA MOITIÉ QUI REND CE FICHIER CRÉDIBLE ─────────────────────────────────
// Chaque propriété est une fonction PURE appelée DEUX FOIS: sur le vrai
// fichier (VERT) et sur une copie EN MÉMOIRE que l'on a cassée exprès (ROUGE
// ATTENDU). Sans le second appel, on ne distingue pas « la garde est bien
// placée » de « mon `indexOf` cherche une chaîne disparue depuis un
// renommage » — et les deux rendent vert. C'est la discipline de
// `draft_note_classify_wiring_test.ts` et de `retained_items_wiring_test.ts`.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertThrows } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
const DISPATCH = "_shared/chat/deterministic_buttons.ts";

/**
 * ⚠️ LES COMMENTAIRES PARTENT D'ABORD, ET C'EST UNE CICATRICE DU DÉPÔT
 * (« Audit d'appelants: retirer les commentaires »). Le fichier visé CITE
 * `readPulseReply`, `readStripReply` et le tag de la garde en toutes lettres
 * dans ses blocs de tête: un test naïf serait VERT sur un dispatch entièrement
 * débranché, sur la seule foi de sa prose.
 *
 * Même fonction que les trois autres tests de câblage — recopiée, pas
 * importée: un test qui dépend d'un autre test se casse pour des raisons qui
 * n'ont rien à voir avec ce qu'il garde.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

async function rawSource(): Promise<string> {
  return await Deno.readTextFile(new URL(DISPATCH, FUNCTIONS_DIR));
}

// ---------------------------------------------------------------------------
// LA TABLE — chaque famille et ce qui la traite
//
// ⚠️ C'EST UNE LISTE NOMMÉE, DONC ELLE NE GARDE QUE CE QU'ELLE NOMME. La
// cicatrice est connue (`named-gate-lists-only-guard-what-they-name`). La
// contre-mesure est en bas: on vérifie que l'ensemble des clés de cette table
// est EXACTEMENT l'ensemble des entrées du tableau du produit. Une famille
// ajoutée d'un côté et pas de l'autre rougit, dans les deux sens.
// ---------------------------------------------------------------------------
const READER_OF: Readonly<Record<string, string | null>> = Object.freeze({
  MEMORY_CLARIFICATION_BUTTON_PREFIX: null,
  // Traité côté écran: « Voir » ouvre une page et ne part jamais au serveur.
  NAVIGATION_BUTTON_PREFIX: null,
  RECOMMENDATION_BUTTON_PREFIX: "readRecommendationReply",
  // Désarmées le 2026-09-07: plus d'émetteur, donc plus de lecteur. Elles
  // restent listées dans le produit pour que les bulles déjà envoyées tombent
  // dans la garde terminale au lieu de repartir au dispatcher.
  STRIP_BUTTON_PREFIX: null,
  ACCIDENT_BUTTON_PREFIX: null,
  DIVERGENCE_BUTTON_PREFIX: "readDivergenceReply",
  PULSE_BUTTON_PREFIX: null,
  FEEDBACK_BUTTON_PREFIX: "readFeedbackReply",
  SLOT_MEAL_BUTTON_PREFIX: "parseSlotMealButton",
  SHARE_BUTTON_PREFIX: null,
  // Jeton de FORMULAIRE, désarmé le 2026-09-07 et listé le même jour — il ne
  // l'était pas, parce que l'écran l'interceptait avant le serveur.
  ENERGY_FIX_TOKEN_PREFIX: null,
});

const GUARD_TAG = 'tag: "keel.deterministic_button.unusable_payload"';
const GUARD_RETURN = 'return handled("keel_unusable_button_payload");';
const GUARD_KNOWN_LINE = "  const known = DETERMINISTIC_BUTTON_PREFIXES.some((p) =>";
const DISPATCH_FN = "export async function handleDeterministicButton";
// `DÉSARMÉ` est suivi de sa date, `FRONT:` de sa raison — d'où l'asymétrie.
const ANNOTATIONS = ["FRONT:", "DÉSARMÉ "] as const;

// ---------------------------------------------------------------------------
// P1 — LA GARDE EST TERMINALE, DANS LES DEUX SENS
// ---------------------------------------------------------------------------
function assertGuardIsTerminal(raw: string): void {
  const src = stripComments(raw);
  const fnAt = src.indexOf(DISPATCH_FN);
  assert(fnAt >= 0, `\`${DISPATCH_FN}\` introuvable — le dispatch a été renommé`);
  const body = src.slice(fnAt);

  const guardAt = body.indexOf(GUARD_TAG);
  assert(
    guardAt >= 0,
    "la garde des charges inutilisables a disparu du dispatch — une charge " +
      "cassée repart au dispatcher, et un modèle répond à un identifiant",
  );

  // ── P1a — tout lecteur s'exécute AVANT la garde ──────────────────────────
  for (const reader of Object.values(READER_OF)) {
    if (reader === null) continue;
    const call = `${reader}(`;
    const last = body.lastIndexOf(call);
    assert(
      last >= 0,
      `\`${reader}\` n'est plus appelé: sa famille est listée sans lecteur ` +
        "sans être annotée. Voir P3.",
    );
    assert(
      last < guardAt,
      `\`${reader}\` est appelé APRÈS la garde. Une charge que ce lecteur ` +
        "sait lire n'atteindra jamais son code: le tap est refusé alors " +
        "qu'il devrait marcher.",
    );
  }

  // ── P1b — plus RIEN ne s'exécute après elle ──────────────────────────────
  const returnAt = body.indexOf(GUARD_RETURN, guardAt);
  assert(returnAt >= 0, "le `return` de la garde a disparu");
  const after = body.slice(returnAt + GUARD_RETURN.length);
  assert(
    /^\s*\}\s*$/.test(after),
    "du code suit la garde. Elle n'est terminale que si elle est la DERNIÈRE " +
      "chose de la fonction — sinon une charge cassée continue de descendre. " +
      `Reste après elle:\n${after.slice(0, 200)}`,
  );
}

// ---------------------------------------------------------------------------
// P2 — ELLE EST AU PREMIER NIVEAU D'INDENTATION
// ---------------------------------------------------------------------------
function assertGuardAtTopLevel(raw: string): void {
  const lines = raw.split("\n");
  // ⚠️ On ancre sur `DETERMINISTIC_BUTTON_PREFIXES.some`, pas sur `const known`:
  // `handleStripTap` porte un autre `const known = new Set(…)` sans rapport, et
  // une aiguille qui matche les deux ne discrimine rien. Le test l'a dit lui-même
  // au premier run — c'est la preuve qu'il lit bien le fichier.
  const hit = lines.filter((l) =>
    l.includes("const known = DETERMINISTIC_BUTTON_PREFIXES.some")
  );
  assert(
    hit.length === 1,
    `attendu une seule ligne \`const known =\`, trouvé ${hit.length}`,
  );
  assert(
    hit[0] === GUARD_KNOWN_LINE,
    "la garde n'est plus au premier niveau de la fonction: elle est " +
      "ré-imbriquée dans un bloc, donc de nouveau conditionnelle à une " +
      "famille — le défaut du 2026-08-12 au 2026-09-07, à l'identique.\n" +
      `attendu: ${JSON.stringify(GUARD_KNOWN_LINE)}\n` +
      `trouvé  : ${JSON.stringify(hit[0])}`,
  );
}

// ---------------------------------------------------------------------------
// P3 — CHAQUE PRÉFIXE EST CLASSÉ: UN LECTEUR, OU UNE RAISON ÉCRITE
// ---------------------------------------------------------------------------
function listedPrefixes(raw: string): { name: string; annotated: boolean }[] {
  const block = raw.match(
    /DETERMINISTIC_BUTTON_PREFIXES[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\n\]\);/,
  );
  assert(block !== null, "le tableau `DETERMINISTIC_BUTTON_PREFIXES` est introuvable");
  const out: { name: string; annotated: boolean }[] = [];
  let annotated = false;
  for (const line of block[1].split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    if (t.startsWith("//")) {
      if (ANNOTATIONS.some((a) => t.includes(a))) annotated = true;
      continue;
    }
    out.push({ name: t.replace(/,$/, ""), annotated });
    annotated = false; // l'annotation ne vaut que pour l'entrée qui la suit
  }
  return out;
}

function assertEveryPrefixClassified(raw: string): void {
  const src = stripComments(raw);
  const body = src.slice(src.indexOf(DISPATCH_FN));
  const listed = listedPrefixes(raw);

  // La contre-mesure de la liste nommée: les deux ensembles coïncident.
  const inTable = new Set(Object.keys(READER_OF));
  const inArray = new Set(listed.map((e) => e.name));
  for (const name of inArray) {
    assert(
      inTable.has(name),
      `\`${name}\` est listé dans le produit mais absent de \`READER_OF\`. ` +
        "Classe-le — un lecteur, ou `FRONT:`/`DÉSARMÉ:` avec sa raison.",
    );
  }
  for (const name of inTable) {
    assert(
      inArray.has(name),
      `\`${name}\` est dans \`READER_OF\` mais n'est plus listé dans le ` +
        "produit. Une famille lue sans être listée retombe au dispatcher sur " +
        "charge cassée.",
    );
  }

  for (const { name, annotated } of listed) {
    const reader = READER_OF[name];
    if (reader !== null && body.includes(`${reader}(`)) continue;
    assert(
      annotated,
      `\`${name}\` est listé SANS lecteur et SANS annotation. Ajoute ` +
        "`FRONT:` (l'écran l'intercepte) ou `DÉSARMÉ <date>` (plus personne ne le " +
        "fabrique, mais des bulles en portent encore) juste au-dessus, avec " +
        "la raison. Sans ça on ne distingue pas un désarmement voulu d'un " +
        "lecteur supprimé par accident.",
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LES TESTS — le vrai fichier, puis les mutations
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("P1 — la garde des charges inutilisables est terminale", async () => {
  assertGuardIsTerminal(await rawSource());
});

Deno.test("P2 — la garde est au premier niveau de la fonction", async () => {
  assertGuardAtTopLevel(await rawSource());
});

Deno.test("P3 — chaque préfixe a un lecteur ou une raison écrite", async () => {
  assertEveryPrefixClassified(await rawSource());
});

// ── LES MUTATIONS ──────────────────────────────────────────────────────────
// Chacune frappe EXACTEMENT ce que l'assertion d'en face lit. Une mutation qui
// ne rougit pas est une assertion qui ne garde rien.

Deno.test("MUTATION — un lecteur ajouté après la garde rougit", async () => {
  const raw = await rawSource();
  // Le cas réel qu'on redoute: une famille neuve câblée « juste avant la fin ».
  const mutated = raw.replace(
    GUARD_RETURN,
    `${GUARD_RETURN}\n  readStripReply(message.button_payload);`,
  );
  assert(mutated !== raw, "la mutation n'a rien changé");
  assertThrows(() => assertGuardIsTerminal(mutated));
});

Deno.test("MUTATION — la garde retirée rougit", async () => {
  const raw = await rawSource();
  const mutated = raw.replace(GUARD_TAG, 'tag: "something.else"');
  assert(mutated !== raw, "la mutation n'a rien changé");
  assertThrows(() => assertGuardIsTerminal(mutated));
});

Deno.test("MUTATION — la garde ré-imbriquée rougit", async () => {
  const raw = await rawSource();
  // Deux espaces de plus: exactement ce que produirait un `if (…) {` autour.
  const mutated = raw.replace(GUARD_KNOWN_LINE, `  ${GUARD_KNOWN_LINE}`);
  assert(mutated !== raw, "la mutation n'a rien changé");
  assertThrows(() => assertGuardAtTopLevel(mutated));
});

Deno.test("MUTATION — un préfixe sans lecteur et sans annotation rougit", async () => {
  const raw = await rawSource();
  // On retire l'annotation `FRONT:` de la navigation, qui n'a pas de lecteur.
  const mutated = raw.replace(
    /  \/\/ FRONT: [\s\S]*?\n  NAVIGATION_BUTTON_PREFIX,/,
    "  NAVIGATION_BUTTON_PREFIX,",
  );
  assert(mutated !== raw, "la mutation n'a rien changé");
  assertThrows(() => assertEveryPrefixClassified(mutated));
});

Deno.test("MUTATION — un préfixe listé hors de la table rougit", async () => {
  const raw = await rawSource();
  // ⚠️ ON N'ANCRE PAS SUR LA DERNIÈRE FAMILLE. Ce test a rougi le 2026-09-07
  // en « la mutation n'a rien changé » parce qu'il nommait `SHARE_BUTTON_PREFIX`
  // comme dernière entrée, et qu'une famille désarmée était passée après. Une
  // mutation qui ne mute plus est un test qui ne garde plus rien.
  const mutated = raw.replace(
    /(\n)(\]\);)/,
    "$1  UNE_FAMILLE_NEUVE_PREFIX,$1$2",
  );
  assert(mutated !== raw, "la mutation n'a rien changé");
  assertThrows(() => assertEveryPrefixClassified(mutated));
});
