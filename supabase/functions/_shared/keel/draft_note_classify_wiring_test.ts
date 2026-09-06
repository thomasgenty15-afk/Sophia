// ═══════════════════════════════════════════════════════════════════════════
// LOT 2D — LE CÂBLAGE AMONT DU CLASSIFIEUR DE BROUILLON, ÉPINGLÉ
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UNE CICATRICE CHIFFRÉE, PAS D'UNE INTUITION.
// Le lot 1C a livré un module PARFAIT — 22 tests verts — qu'on pouvait retirer
// des trois générateurs sans qu'un seul des 3507 tests ne rougisse. Deux lots
// ont dû réparer ça après coup. Le lot 2B a livré `draft_note_classify.ts` et
// `draft_note_classify_io.ts` (41 tests verts, run modèle réel à 200) avec
// **zéro appelant**, en NOMMANT le trou. Ce lot-ci pose l'appel, et cette
// épingle-ci est ce qui empêchera qu'on le retire sans le savoir.
//
// ── CE QUE CES TESTS TIENNENT, PAR ORDRE DE CE QU'IL EN COÛTE DE LE PERDRE ──
//
//   * L'APPEL EXISTE. C'est la seule famille qui attrape le mode d'échec n°1
//     du dépôt: un module livré, testé, et que personne n'appelle. Sans elle,
//     retirer les deux blocs laisse la suite ENTIÈREMENT verte — mesuré trois
//     fois dans ce dépôt.
//   * SA PLACE. Avant la sortie des aperçus (`if (isDraft) return …`), il
//     rangerait une envie qui vise un plan que la personne peut encore
//     abandonner: une mémoire écrite pour un geste qui n'a pas eu lieu.
//   * LE VERDICT, ET PAS LA CHAÎNE. `classifyAndPersistDraftNote` exige un
//     `DraftNoteVerdict`, que SEUL `readDraftNote` produit. La note repart dans
//     un SECOND appel modèle: lui tendre `body.draft_note` rouvrirait le trou
//     que `plan_draft_note.ts` ferme — cible chiffrée, interdit de doctrine,
//     plancher TCA. Le compilateur est la vraie garde; ce test dit POURQUOI, et
//     tient la moitié qu'aucun type ne voit: le verdict est capturé APRÈS le
//     refus, jamais avant.
//   * L'ANCRE EST LA SEMAINE VISÉE. `targetWeek: startsOn`, jamais `todayDate`.
//     Quelqu'un qui adopte le dimanche un plan qui commence lundi vise la
//     semaine SUIVANTE; ancrer sur le jour de la frappe ferait mourir son envie
//     le lendemain matin (contrat §7.3: vivant tant que `jour ≤ ancre + 6`).
//   * LE RÔLE DU FOYER. `members: []` sur un foyer dit au modèle « personne
//     d'autre à table »: chaque envie attribuée serait refusée en
//     `unknownMember`, et les trois nombres du lot le diraient… si quelqu'un
//     les lisait. Le câblage doit porter les VRAIES bouches.
//
// ── LA MOITIÉ QU'ON OUBLIE, ET QUI REND CE FICHIER CRÉDIBLE ────────────────
// Chaque lane a une fonction PURE `assertWired(src)` appelée DEUX FOIS: une
// fois sur le vrai fichier (VERT), une fois sur une copie EN MÉMOIRE dont le
// bloc a été retiré ou déplacé (ROUGE ATTENDU). Sans le second appel, on ne
// distingue pas « le câblage est là » de « mon `indexOf` cherche une chaîne
// disparue depuis un renommage » — et les deux rendent vert.
//
// ⚠️ ── L'AIGUILLE QUI NE DISCRIMINE PAS, ET COMMENT ELLE EST RÉPARÉE ───────
// `today: todayDate` EXISTE DÉJÀ une dizaine de fois dans les deux
// générateurs, pour d'autres appels (`nextPlanItemsFor`, `loadStudentBody`,
// `mergeCarriers`…). Un test qui ferait `src.includes("today: todayDate")`
// serait donc VERT sur un produit entièrement débranché — la définition même
// d'une assertion qui ne prouve rien. On ne cherche donc JAMAIS dans le
// fichier: on découpe l'appel `classifyAndPersistDraftNote(` par délimiteurs
// équilibrés, et on lit les champs DE CET OBJET-LÀ. Chaque mutation ci-dessous
// frappe exactement ce que l'assertion correspondante lit.
//
// ⚠️ CE QUE CE FICHIER NE COUVRE PAS, EXPRÈS: le comportement du classifieur
// (`draft_note_classify_test.ts`, lot 2B) et le câblage des items retenus
// (`retained_items_wiring_test.ts`, lot 1J). Doubler une assertion la fait
// diverger le jour où l'une des deux bouge.
//
// ⚠️ `generate-week-plan-v1` EST ABSENT DE CE FICHIER, ET C'EST UN CONSTAT, PAS
// UN OUBLI. Cette lane ne lisait AUCUNE note de brouillon: `draft_note`,
// `draftNote`, `DraftNote` et même `intent` avaient ZÉRO occurrence dans son
// `index.ts` (948 lignes). Elle a été RETIRÉE le 2026-08-19 — elle n'avait
// aucun appelant vivant — et le constat qui l'épinglait est parti avec elle
// (voir le bas de ce fichier). Il reste DEUX générateurs, pas trois.
// ═══════════════════════════════════════════════════════════════════════════

import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

/**
 * ⚠️ LES COMMENTAIRES PARTENT D'ABORD, ET C'EST UNE CICATRICE DU DÉPÔT
 * (« Audit d'appelants: retirer les commentaires »). Les deux fichiers visés
 * ici CITENT `classifyAndPersistDraftNote`, `draftNoteVerdict`, `startsOn` et
 * `DraftNoteVerdict` en toutes lettres dans les blocs de tête que ce lot vient
 * d'y écrire: un grep naïf serait VERT sur un produit entièrement débranché,
 * sur la seule foi de sa prose.
 *
 * Même fonction que `retained_items_wiring_test.ts` et
 * `retained_portion_wiring_test.ts` — recopiée, pas importée: un test qui
 * dépend d'un autre test se casse pour des raisons qui n'ont rien à voir avec
 * ce qu'il garde.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

// ---------------------------------------------------------------------------
// LIRE UN APPEL — délimiteurs ÉQUILIBRÉS, jamais une expression régulière
// ---------------------------------------------------------------------------

/**
 * ── POURQUOI PAS UNE REGEX (même motif que les lots 1G et 1J) ─────────────
 * L'appel visé porte UN objet littéral dont les valeurs contiennent des
 * virgules, des parenthèses, des accolades et une flèche
 * (`composedMembers.map((m) => ({ memberId: m.memberId, label: m.displayName }))`).
 * Une regex qui « trouve `startsOn` quelque part dans l'appel » serait verte
 * sur un appel où il est passé à `today` — c'est-à-dire verte sur le défaut
 * exact que ce fichier existe pour tenir.
 */
type Span = { readonly start: number; readonly end: number };

function callArgSpan(src: string, callee: string, from = 0): Span | null {
  const open = src.indexOf(`${callee}(`, from);
  if (open === -1) return null;
  let depth = 0;
  const start = open + callee.length + 1;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0 && c === ")") return { start, end: i };
      depth -= 1;
    }
  }
  return null;
}

/**
 * LES CHAMPS DE PREMIER NIVEAU D'UN OBJET LITTÉRAL.
 *
 * ⚠️ PREMIER NIVEAU SEULEMENT, et c'est le sujet: `composedMembers.map((m) =>
 * ({ memberId: …, label: … }))` porte lui-même un `memberId:`. Un scanner qui
 * descendrait dedans rendrait deux valeurs pour une clé et l'assertion se
 * ferait sur celle qu'on n'a pas voulue.
 */
function objectFieldSpans(text: string): Map<string, Span> {
  const out = new Map<string, Span>();
  const lead = text.length - text.trimStart().length;
  const body = text.trim();
  if (!body.startsWith("{") || !body.endsWith("}")) return out;
  let depth = 0;
  let start = 1;
  const parts: Span[] = [];
  for (let i = 1; i < body.length - 1; i += 1) {
    const c = body[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push({ start, end: i });
      start = i + 1;
    }
  }
  parts.push({ start, end: body.length - 1 });
  for (const part of parts) {
    const raw = body.slice(part.start, part.end);
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    // ⚠️ LE `:` DE PREMIER NIVEAU, PAS LE PREMIER RENCONTRÉ. La valeur du champ
    // `members` du foyer porte elle-même deux `:` (`{ memberId: …, label: … }`);
    // on ne les atteint jamais puisqu'on s'arrête au premier, mais un champ
    // dont la CLÉ serait entre guillemets casserait ce découpage — il n'y en a
    // pas, et le jour où il y en aura, l'assertion rougira au lieu de mentir.
    const colon = trimmed.indexOf(":");
    const offset = lead + part.start + (raw.length - raw.trimStart().length);
    // La forme abrégée (`admin,` `userId,`) est un champ dont la valeur est son
    // propre nom. La rendre telle quelle évite qu'un passage de `{ admin }` à
    // `{ admin: admin }` fasse rougir une assertion sur un produit identique.
    if (colon === -1) {
      out.set(trimmed, { start: offset, end: offset + trimmed.length });
      continue;
    }
    const valueStart = colon + 1;
    const value = trimmed.slice(valueStart);
    out.set(trimmed.slice(0, colon).trim(), {
      start: offset + valueStart + (value.length - value.trimStart().length),
      end: offset + trimmed.length,
    });
  }
  return out;
}

function objectFields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, span] of objectFieldSpans(text)) {
    out.set(key, text.slice(span.start, span.end).trim());
  }
  return out;
}

/** Le bloc `header … }`, bornes comprises. Sert à LIRE et à MUTER. */
function blockSpan(src: string, header: string): Span {
  const start = src.indexOf(header);
  if (start === -1) throw new Error(`bloc introuvable: ${header}`);
  let depth = 0;
  for (let i = start + header.length - 1; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`bloc non refermé: ${header}`);
}

// ---------------------------------------------------------------------------
// LES JALONS — un seul endroit où les chaînes cherchées sont écrites
// ---------------------------------------------------------------------------

const CALLEE = "classifyAndPersistDraftNote";
// ⟳ 2026-09-06 — L'IMPORT PORTE AUSSI LE PRÉCOCE (`classifyDraftNoteEarly`,
// `draftNoteBeltItems`) : la note est classée AVANT le plan pour la ceinture.
// La ligne reste épinglée ENTIÈRE : retirer l'un des quatre noms rougit.
const IMPORT_LINE_GENERATOR = [
  "import {",
  "  classifyAndPersistDraftNote,",
  "  classifyDraftNoteEarly,",
  "  type DraftNoteEarlyClassification,",
  "  draftNoteBeltItems,",
  '} from "../_shared/keel/draft_note_classify_io.ts";',
].join("\n");
// Le bilan n'a pas de plan à ceinturer : il n'importe que la persistance.
const IMPORT_LINE_FEEDBACK =
  'import { classifyAndPersistDraftNote } from "../_shared/keel/draft_note_classify_io.ts";';
const importLineFor = (lane: string): string =>
  lane === "feedback" ? IMPORT_LINE_FEEDBACK : IMPORT_LINE_GENERATOR;
const CALL_HEADER = "if (draftNoteVerdict !== null) {";
const VERDICT_DECL = "let draftNoteVerdict: DraftNoteVerdict | null = null;";
const VERDICT_ASSIGN = "draftNoteVerdict = note;";
const REFUSAL_GATE = "if (note.refusal !== null || note.usable === null) {";
// ⟳ LOT C — LE JALON DE « APRÈS L'ÉCRITURE » A CHANGÉ, PAS LA PROPRIÉTÉ.
// C'était `await persistReconciledFoodPreferences(`, l'élagage du magasin plat,
// qui se trouvait juste après l'écriture du plan. Ce magasin est fermé
// (nomenclature §2.6) et son écrivain supprimé: le jalon est désormais
// L'ÉCRITURE DU PLAN ELLE-MÊME, ce qui est plus direct et ne peut plus
// disparaître sans que le produit disparaisse avec.
const PLAN_WRITE = '"write_student_meal_plan"';
const DRAFT_RETURN = "if (isDraft) {";

// ---------------------------------------------------------------------------
// LES ASSERTIONS COMMUNES AUX DEUX LANES
// ---------------------------------------------------------------------------

/**
 * ⟳ 2026-09-04 — LES CHAMPS DU SITE NOMINAL, PAS DU PREMIER TROUVÉ.
 *
 * Il y a deux appels depuis que la note doit survivre au refus, et ils NE
 * PASSENT PAS LA MÊME CHOSE: celui du refus passe `planFoods: []`, parce qu'il
 * n'y a aucun plan servi dont on pourrait proposer les aliments. Lire le
 * premier site ferait donc échouer la garde du vocabulaire sur un produit
 * correct — et, pire, elle passerait si les deux étaient un jour inversés.
 *
 * On lit celui qui suit l'écriture du plan: c'est le site NOMINAL, celui dont
 * toutes les assertions de ce fichier parlent.
 */
function callFields(src: string, lane: string, from = 0): Map<string, string> {
  const span = callArgSpan(src.slice(from), CALLEE);
  assert(
    span !== null,
    `LANE ${lane.toUpperCase()} — L'APPEL EST LÀ MAIS ILLISIBLE: ` +
      `\`${CALLEE}(\` n'est pas refermé.`,
  );
  return objectFields(src.slice(from + span!.start, from + span!.end));
}

function assertWiredCommon(src: string, lane: string): void {
  // ── ① LE MODULE EST IMPORTÉ ────────────────────────────────────────────
  assert(
    src.includes(importLineFor(lane)),
    `LANE ${lane.toUpperCase()} — LE CLASSIFIEUR N'EST PLUS IMPORTÉ. ` +
      `\`draft_note_classify_io.ts\` redevient un module sans appelant: ` +
      `41 tests verts, un run modèle réel à 200, et zéro effet sur le ` +
      `produit. C'est le mode d'échec n°1 de ce dépôt.`,
  );

  // ── ② IL EST APPELÉ ────────────────────────────────────────────────────
  //
  // ⟳ 2026-09-04 — IL PEUT Y AVOIR DEUX SITES, ET LA PROPRIÉTÉ CHANGE DE
  // PORTEUR. Le second sert le chemin du REFUS: un plan refusé ne doit pas
  // emporter avec lui ce que la personne a écrit — mesuré au premier tir d'une
  // campagne de trois mois, où « mon fils n'aime pas le poisson » était perdu
  // parce que le plan avait été refusé pour une bouche mal servie.
  //
  // ⛔ CE QUE LES POSITIONS TENAIENT, UNE CONDITION LE TIENT MAINTENANT: le
  // site du refus est gardé par `!isDraft`, donc il ne tourne JAMAIS sur un
  // aperçu. On vérifie donc la garde elle-même, pas seulement l'ordre — et
  // c'est plus fort, parce qu'une position se déplace en silence.
  const sites = [...src.matchAll(new RegExp(`${CALLEE}\\(`, "g"))].map((m) => m.index ?? -1);
  const planWrite = src.indexOf(PLAN_WRITE);
  assert(
    planWrite !== -1,
    `lane ${lane}: l'écriture du plan a disparu — test à réviser.`,
  );
  // ⚠️ N'IMPORTE LEQUEL SUFFIT ICI: « il y a un appelant » est la propriété de
  // cette assertion-là. Les DEUX suivantes disent ce que chaque site a le
  // droit de faire, et c'est là que la distinction se joue.
  const site = sites.length > 0 ? sites[sites.length - 1] : -1;
  // ── ③ APRÈS LA SORTIE DES APERÇUS ──────────────────────────────────────
  const draftReturn = src.lastIndexOf(DRAFT_RETURN);
  assert(draftReturn !== -1, `lane ${lane}: plus aucune sortie d'aperçu.`);
  for (const at of sites) {
    if (at > draftReturn) continue;
    // ⛔ UN SITE PLUS HAUT N'EST TOLÉRÉ QUE S'IL EST GARDÉ PAR `!isDraft`, et
    // la garde doit être VISIBLE dans les 600 caractères qui le précèdent —
    // pas quelque part dans la fonction.
    const before = src.slice(Math.max(0, at - 600), at);
    assert(
      /!isDraft/.test(before),
      `LANE ${lane.toUpperCase()} — LE CLASSIFIEUR EST APPELÉ AVANT LA SORTIE ` +
        `DES APERÇUS, ET SANS GARDE \`!isDraft\`. Sur \`intent: "draft"\` il n'y ` +
        `a pas encore de plan: on écrirait une mémoire pour un geste qui n'a ` +
        `pas eu lieu, et la personne retrouverait la semaine suivante une ` +
        `envie qu'elle a abandonnée.`,
    );
  }

  // ── ④ CE QUI TOURNE AVANT L'ÉCRITURE NE RANGE QUE DES MOTS ────────────
  //
  // ⟳ 2026-09-04 — CETTE GARDE DISAIT « aucun refus ne doit laisser une envie
  // rangée derrière lui », et c'était vrai tant qu'il n'y avait qu'un site.
  // Elle est maintenant TROP LARGE: le refus `mouth_unfed` DOIT ranger ce que
  // la personne a écrit, sinon sa phrase est perdue avec le plan — mesuré au
  // premier tir d'une campagne de trois mois.
  //
  // Ce qui reste vrai, et qu'on tient ici: un site AVANT l'écriture ne peut
  // pas proposer les aliments d'un plan qui n'existe pas. `planFoods: []` est
  // la seule forme acceptable — elle ferme les questions QUOI et laisse
  // passer les questions QUI.
  for (const at of sites) {
    if (at > planWrite) continue;
    const span = callArgSpan(src.slice(at), CALLEE);
    const args = span ? src.slice(at + span.start, at + span.end) : "";
    assert(
      /planFoods:\s*\[\]/.test(args),
      `LANE ${lane.toUpperCase()} — UN APPEL AVANT LA FIN DE L'ÉCRITURE DU ` +
        `PLAN PROPOSE LES ALIMENTS D'UN PLAN QUI N'EXISTE PAS. Sur un refus, ` +
        `la personne ne verra jamais ces plats: lui demander « lequel ? » est ` +
        `une question sur du vide. Le seul appel toléré au-dessus de ce point ` +
        `est celui qui range ses MOTS, avec \`planFoods: []\`.`,
    );
  }

  // ⟳ 2026-09-04 — EN DERNIER, ET C'EST L'ORDRE QUI DÉCIDE. Les deux
  // assertions du dessus disent ce qu'un site MAL PLACÉ n'a pas le droit de
  // faire; celle-ci dit qu'il en reste un BIEN placé. Posée en premier, elle
  // mordait à la place des autres — un `site` introuvable après l'écriture
  // ressemble à un appelant disparu, et le harnais refusait la mutation avec
  // « la mauvaise garde a mordu ».
  assert(
    sites.some((at) => at > planWrite),
    `LANE ${lane.toUpperCase()} — LE CLASSIFIEUR N'A PLUS D'APPELANT. ` +
      `Retirer ce bloc laissait la suite ENTIÈREMENT verte avant ce test: ` +
      `mesuré au lot 1C (3507 verts sur un module débranché). Ce que la ` +
      `personne écrit sur son brouillon est lu, gardé, envoyé au modèle… et ` +
      `jamais rangé.`,
  );

  const fields = callFields(src, lane, planWrite);

  // ── ⑤ C'EST LE VERDICT QUI ENTRE, PAS LA CHAÎNE ────────────────────────
  assertEquals(
    fields.get("note"),
    "draftNoteVerdict",
    `LANE ${lane.toUpperCase()} — LE CLASSIFIEUR NE REÇOIT PLUS LE VERDICT ` +
      `de \`readDraftNote\` (\`${fields.get("note")}\`). La note repart dans ` +
      `un SECOND appel modèle: lui tendre le texte brut rouvre exactement le ` +
      `trou que \`plan_draft_note.ts\` ferme — cible chiffrée, interdit de ` +
      `doctrine, plancher TCA. ⛔ Et on ne rejoue PAS la garde là-bas: une ` +
      `garde en double est la cicatrice la plus chère de ce dépôt.`,
  );
  assert(
    src.includes(VERDICT_DECL),
    `LANE ${lane.toUpperCase()} — LE TYPE DU VERDICT PORTÉ JUSQU'À L'APPEL A ` +
      `CHANGÉ. \`DraftNoteVerdict | null\` est ce qui rend le contournement ` +
      `IMPOSSIBLE à la compilation: le jour où cette variable porte une ` +
      `\`string\`, plus rien n'empêche d'envoyer \`note.usable\` — ou pire, ` +
      `\`body.draft_note\` — dans le second appel modèle.`,
  );

  // ── ⑥ LE VERDICT EST CAPTURÉ APRÈS LE REFUS, JAMAIS AVANT ──────────────
  // ⚠️ AUCUN TYPE NE VOIT CETTE MOITIÉ-LÀ. `readDraftNote` rend un verdict
  // même quand il REFUSE; capturé au-dessus de la porte, un `note_unusable`
  // n'échouerait plus la requête mais serait quand même rangé le jour où
  // quelqu'un déplace le `return`.
  const gate = src.indexOf(REFUSAL_GATE);
  const assign = src.indexOf(VERDICT_ASSIGN);
  assert(gate !== -1, `lane ${lane}: la porte d'entrée de la note a disparu.`);
  assert(assign !== -1, `lane ${lane}: le verdict n'est plus capturé.`);
  assert(
    gate < assign,
    `LANE ${lane.toUpperCase()} — LE VERDICT EST CAPTURÉ AVANT SA GARDE. ` +
      `\`readDraftNote\` rend un verdict MÊME QUAND IL REFUSE: capturé ` +
      `au-dessus du \`return note_unusable\`, une clause tombée sous plancher ` +
      `TCA repartirait au modèle par l'autre porte.`,
  );

  // ── ⑦ L'ANCRE EST LA SEMAINE VISÉE ─────────────────────────────────────
  assertEquals(
    fields.get("targetWeek"),
    "startsOn",
    `LANE ${lane.toUpperCase()} — L'ANCRE N'EST PLUS LA SEMAINE VISÉE ` +
      `(\`${
        fields.get("targetWeek")
      }\`). L'ancre stockée est le lundi ISO de ` +
      `la semaine du plan qu'on VIENT d'écrire. Avec le jour de la frappe, ` +
      `quelqu'un qui adopte le dimanche un plan qui commence lundi voit son ` +
      `envie mourir le lendemain matin (contrat §7.3).`,
  );
  assertEquals(
    fields.get("today"),
    "todayDate",
    `LANE ${lane.toUpperCase()} — \`today\` N'EST PLUS LE JOUR DE LA FRAPPE ` +
      `(\`${fields.get("today")}\`). C'est le \`at\` de l'item — le jour où ` +
      `la personne a écrit, dans SA journée — et pas l'ancre. Les deux ` +
      `champs disent des choses différentes; les confondre range l'envie au ` +
      `bon endroit avec la mauvaise date, ou l'inverse.`,
  );

  // ── ⑧ LE PORT, ET SON APPELANT ─────────────────────────────────────────
  assertEquals(
    fields.get("admin"),
    "admin",
    `lane ${lane}: le classifieur ne reçoit plus le client de service; sans ` +
      `lui il rend \`bad_args\` et rien n'est jamais écrit.`,
  );
  assertEquals(
    fields.get("userId"),
    "userId",
    `lane ${lane}: le classifieur ne reçoit plus le titulaire.`,
  );

  // ── ⑨ LES ALIMENTS DU PLAN, ET LA SOURCE ───────────────────────────────
  //
  // ⛔ SANS `planFoods`, LA QUESTION « QUOI » NE PEUT PAS EXISTER (§2.8). Le
  // modèle ne propose que des aliments COPIÉS de cette liste: passée vide, il
  // n'a rien à proposer, `readClarify` refuse tout `about: "what"` en
  // `bad_options`, et « j'ai pas aimé la viande » redevient ce qu'il était —
  // une exclusion de « viande » pour toute la table, ou rien du tout. Aucun
  // type ne voit ça: `readonly string[]` accepte `[]` sans un mot.
  const planFoods = fields.get("planFoods") ?? "";
  // ⟳ 2026-09-04 — `planVocabularyOf`, ET PLUS `foodTermsOf`. Mesuré au banc:
  // « Le plat de vendredi soir, plus jamais » proposait « filets de saumon ·
  // cuisses de poulet · lentilles · œufs » — des INGRÉDIENTS pour une phrase
  // qui désigne un PLAT. Aucune réponse à cette question n'était juste. Le
  // vocabulaire met les TITRES DE PLATS en tête; épingler l'ancien nom ferait
  // revenir le défaut sans un rouge.
  assert(
    planFoods.includes("planVocabularyOf("),
    `LANE ${lane.toUpperCase()} — LE VOCABULAIRE DU PLAN N'ATTEINT PLUS LE ` +
      `CLASSIFIEUR (\`${planFoods}\`). C'est la liste que la question « tu ` +
      `parlais de quoi ? » propose en boutons, et le SEUL vocabulaire dont un ` +
      `\`about: "what"\` puisse sortir. Une liste vide ne casse rien, ne lève ` +
      `rien, et supprime la moitié « quoi » du chantier en silence. Et une ` +
      `liste d'INGRÉDIENTS seuls (\`foodTermsOf\`) rend la question ` +
      `irrépondable dès que la personne désigne un PLAT.`,
  );

  const source = fields.get("source") ?? "";
  assert(
    /^"(draft_note|plan_feedback)"$/.test(source),
    `LANE ${lane.toUpperCase()} — LA SOURCE N'EST PLUS UN LITTÉRAL DU ` +
      `VOCABULAIRE (\`${source}\`). Elle est écrite telle quelle dans ` +
      `\`memory_clarifications.source\`, dont le CHECK ne connaît que ces ` +
      `deux mots: une autre valeur fait échouer l'insertion, et la question ` +
      `n'est jamais posée — sans erreur visible ailleurs.`,
  );

  // ── ④bis · CE QUE CHAQUE APPEL PASSE, QUEL QUE SOIT LE CHEMIN ─────────
  //
  // ⟳ 2026-09-04 — DEPUIS QU'IL Y A DEUX APPELS, une garde qui ne lit que le
  // nominal laisse l'autre dériver en silence. Deux champs valent pour les
  // DEUX chemins, et ce sont ceux qui décident du contenu de la mémoire:
  //
  //   · `note` — le VERDICT, jamais le texte brut de la requête. Lui tendre le
  //     brut rouvre la cible chiffrée, l'interdit de doctrine et le plancher
  //     TCA, sur la moitié du produit qu'on ne regarde pas.
  //   · `source` — sans elle, une ligne rangée par le chemin du refus serait
  //     indiscernable d'une ligne écrite par un questionnaire.
  //
  // ⚠️ PAR REGEX, ET PAS PAR LE PARSEUR D'OBJET. On lit ici le TEXTE d'un
  // argument, pas sa structure: c'est plus grossier, et ça suffit — les deux
  // champs sont des littéraux d'une seule ligne.
  for (const at of sites) {
    const span = callArgSpan(src.slice(at), CALLEE);
    const args = span ? src.slice(at + span.start, at + span.end) : "";
    assert(
      /\bnote:\s*draftNoteVerdict\b/.test(args),
      `LANE ${lane.toUpperCase()} — UN APPEL NE REÇOIT PLUS LE VERDICT de ` +
        `\`readDraftNote\`. La note repart dans un SECOND appel modèle: lui ` +
        `tendre le texte brut rouvre exactement le trou que ` +
        `\`plan_draft_note.ts\` ferme.`,
    );
    assert(
      /\bsource:\s*"draft_note"/.test(args),
      `LANE ${lane.toUpperCase()} — UN APPEL NE DÉCLARE PLUS SA SOURCE: la ` +
        `ligne rangée deviendrait indiscernable d'un questionnaire.`,
    );
  }

}

// ---------------------------------------------------------------------------
// LES MUTATIONS — chacune retire UNE moitié, et doit faire rougir UNE famille
// ---------------------------------------------------------------------------

/**
 * ⚠️ `expects` EST OBLIGATOIRE. Un `assertThrows` nu se contente de « quelque
 * chose a levé »: une mutation qui casserait le DÉCOUPAGE de l'appel ferait
 * passer toutes les familles au vert pour la mauvaise raison. « Quelque chose
 * a échoué » ne dit pas que la propriété est tenue.
 */
type Cut = {
  readonly name: string;
  readonly expects: string;
  readonly apply: (src: string) => string;
};

/**
 * Remplace la valeur d'UN champ de l'appel visé — et de lui seul.
 *
 * ⚠️ PAR LES BORNES, JAMAIS PAR UNE REGEX DE LIGNE. Premier essai de ce
 * fichier: `(\bmembers:\s*)[^\n]*?(,\n)`. La valeur du champ `members` de la
 * lane foyer tient sur QUATRE lignes (`composedMembers.map((m) => ({ … }))`),
 * donc la mutation ne trouvait rien et levait « champ introuvable » — un
 * échec qui RESSEMBLE à une épingle qui mord, alors qu'il ne prouve rien. Les
 * bornes servent à lire ET à muter: la mutation frappe donc exactement ce que
 * l'assertion lit.
 */
function setField(key: string, value: string): (src: string) => string {
  return (src) => {
    // ⚠️ LE SITE NOMINAL, celui qui suit l'écriture du plan. Frapper le
    // premier appel venu toucherait le site du REFUS, que les gardes de champ
    // ne lisent pas — la mutation resterait verte en prouvant autre chose.
    const from = Math.max(0, src.indexOf(PLAN_WRITE));
    const rel = callArgSpan(src.slice(from), CALLEE);
    const call = rel === null
      ? null
      : { start: from + rel.start, end: from + rel.end };
    if (call === null) throw new Error(`appel introuvable: ${CALLEE}(`);
    const text = src.slice(call.start, call.end);
    const field = objectFieldSpans(text).get(key);
    if (field === undefined) {
      throw new Error(`champ \`${key}\` introuvable dans l'appel`);
    }
    return src.slice(0, call.start) + text.slice(0, field.start) + value +
      text.slice(field.end) + src.slice(call.end);
  };
}

/** Déplace le bloc d'appel JUSTE AU-DESSUS d'une ancre. */
function moveCallAbove(
  anchor: (src: string) => number,
): (src: string) => string {
  return (src) => {
    const block = blockSpan(src, CALL_HEADER);
    const text = src.slice(block.start, block.end);
    const without = src.slice(0, block.start) + src.slice(block.end);
    const at = anchor(without);
    if (at === -1) throw new Error("ancre de déplacement introuvable");
    return `${without.slice(0, at)}${text}\n    ${without.slice(at)}`;
  };
}

const CUTS: readonly Cut[] = [
  {
    // LA MUTATION DU VÉRIFICATEUR: le module redevient sans appelant. C'est
    // l'état EXACT dans lequel le lot 2B a dû livrer, et l'état dans lequel le
    // lot 1C est resté jusqu'à ce que deux lots le réparent.
    name: "le bloc d'appel est retiré du générateur",
    expects: "N'A PLUS D'APPELANT",
    apply: (src) => {
      const block = blockSpan(src, CALL_HEADER);
      return src.slice(0, block.start) + src.slice(block.end);
    },
  },
  {
    name: "l'import du classifieur disparaît",
    expects: "N'EST PLUS IMPORTÉ",
    apply: (src) => src.replace(IMPORT_LINE_GENERATOR, ""),
  },
  {
    // ⚠️ L'ANCRE EST LA SORTIE D'APERÇU LA PLUS BASSE. Placé au-dessus d'elle,
    // le bloc tourne sur un `intent: "draft"` — la régression EXACTE que
    // l'en-tête de `classifyAndPersistDraftNote` interdit en toutes lettres.
    // Elle compile: c'est ce qui la rend dangereuse, et c'est pour ça
    // qu'aucun `deno check` ne la verra jamais.
    name: "l'appel remonte au-dessus de la sortie des aperçus",
    expects: "AVANT LA SORTIE DES APERÇUS",
    apply: moveCallAbove((s) => s.lastIndexOf(DRAFT_RETURN)),
  },
  {
    name: "l'appel remonte au-dessus de l'écriture du plan",
    expects: "AVANT LA FIN DE L'ÉCRITURE",
    apply: moveCallAbove((s) => s.indexOf(PLAN_WRITE)),
  },
  {
    // Le contournement que le TYPE interdit, écrit à la main pour que la
    // raison soit dans le dépôt et pas seulement dans un message de `tsc`.
    name: "le texte brut de la requête remplace le verdict",
    expects: "NE REÇOIT PLUS LE VERDICT",
    apply: setField("note", "body.draft_note"),
  },
  {
    name: "le verdict devient une chaîne",
    expects: "LE TYPE DU VERDICT",
    apply: (src) =>
      src.replace(VERDICT_DECL, "let draftNoteVerdict: string | null = null;"),
  },
  {
    // La régression que le compilateur ne voit PAS: capturer avant la porte.
    name: "le verdict est capturé au-dessus de la porte de refus",
    expects: "AVANT SA GARDE",
    apply: (src) => {
      const without = src.replace(
        new RegExp(
          `\\n\\s*${VERDICT_ASSIGN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        ),
        "",
      );
      if (without === src) throw new Error("capture du verdict introuvable");
      const at = without.indexOf(REFUSAL_GATE);
      if (at === -1) throw new Error("porte de refus introuvable");
      return `${without.slice(0, at)}${VERDICT_ASSIGN}\n      ${
        without.slice(at)
      }`;
    },
  },
  {
    // ⚠️ LA MUTATION QUI PROUVE QUE `today: todayDate` NE SUFFIT PAS. Elle ne
    // touche QUE `targetWeek`: `today: todayDate` reste écrit mot pour mot
    // dans le fichier, donc un test qui l'aurait cherché par `includes` reste
    // VERT ici — sur un produit où chaque envie meurt un jour trop tôt.
    name: "l'ancre devient le jour de la frappe",
    expects: "L'ANCRE N'EST PLUS LA SEMAINE VISÉE",
    apply: setField("targetWeek", "todayDate"),
  },
  {
    name: "`today` devient le premier jour du plan",
    expects: "N'EST PLUS LE JOUR DE LA FRAPPE",
    apply: setField("today", "startsOn"),
  },
  {
    name: "les aliments du plan deviennent une liste vide",
    expects: "LE VOCABULAIRE DU PLAN N'ATTEINT PLUS",
    apply: setField("planFoods", "[]"),
  },
  {
    // ⚠️ LA MOITIÉ NEUVE, ET ELLE NE SE VOIT PAS AUTREMENT. `foodTermsOf` est
    // une fonction RÉELLE, qui rend une liste NON VIDE: revenir à elle ne casse
    // ni le typage, ni un test, ni un run — la question part, avec des
    // ingrédients pour une phrase qui désigne un plat. Sans cette mutation,
    // l'assertion d'à côté serait vraie pour la seule raison que le mot a
    // changé, et n'aurait rien à voir avec ce qu'on veut tenir.
    name: "le vocabulaire redevient les ingrédients seuls",
    expects: "LE VOCABULAIRE DU PLAN N'ATTEINT PLUS",
    apply: (src) =>
      src.replace(/planFoods: planVocabularyOf\(/, "planFoods: foodTermsOf("),
  },
  {
    name: "la source sort du vocabulaire",
    expects: "LA SOURCE N'EST PLUS UN LITTÉRAL",
    apply: setField("source", '"chat"'),
  },
  {
    name: "le client de service n'est plus passé",
    expects: "ne reçoit plus le client de service",
    apply: (src) => {
      // ⚠️ LE SITE NOMINAL, comme `setField`: depuis qu'il y a deux appels, le
      // premier venu est celui du REFUS, que la garde des champs ne lit pas.
      const from = Math.max(0, src.indexOf(PLAN_WRITE));
      const rel = callArgSpan(src.slice(from), CALLEE);
      if (rel === null) throw new Error(`appel introuvable: ${CALLEE}(`);
      const start = from + rel.start, end = from + rel.end;
      const text = src.slice(start, end);
      return src.slice(0, start) + text.replace(/\n\s*admin,/, "") +
        src.slice(end);
    },
  },
];

// ---------------------------------------------------------------------------
// LES DEUX LANES
// ---------------------------------------------------------------------------

type Lane = {
  readonly lane: string;
  readonly rel: string;
  readonly assertWired: (src: string) => void;
  readonly cuts: readonly Cut[];
};

const MEAL: Lane = {
  lane: "meal",
  rel: "generate-meal-v1/index.ts",
  assertWired(src) {
    assertWiredCommon(src, "meal");
    // ── LE RÔLE D'UNE LANE À UNE BOUCHE EST VIDE, ET C'EST UNE RÉPONSE ────
    // `[]` dit « personne d'autre à table », ce qui est VRAI ici: cette lane
    // compose pour une seule personne. Fabriquer un rôle donnerait au modèle
    // un `member_id` à recopier qui ne désigne aucune bouche de foyer — et la
    // matrice rangerait l'envie au nom de quelqu'un qui n'existe pas à cette
    // table.
    assertEquals(
      callFields(src, "meal").get("members"),
      "[]",
      "LANE MEAL — LA LANE INDIVIDUELLE FABRIQUE UN RÔLE. Elle n'a pas de " +
        "roster: le seul rôle honnête y est `[]`, qui dit « personne d'autre " +
        "à table ». Tout `member_id` proposé par le modèle serait alors " +
        "accepté contre une liste inventée ici.",
    );
  },
  cuts: [
    ...CUTS,
    {
      name: "la lane individuelle se fabrique un roster",
      expects: "FABRIQUE UN RÔLE",
      apply: setField("members", '[{ memberId: userId, label: "" }]'),
    },
  ],
};

const HOUSEHOLD: Lane = {
  lane: "household",
  rel: "generate-household-meal-v1/index.ts",
  assertWired(src) {
    assertWiredCommon(src, "household");
    // ── LE RÔLE DU FOYER, ET IL PART DES BOUCHES RÉELLEMENT SERVIES ───────
    // ⚠️ `composedMembers`, PAS `members` (L3). Une bouche qui a repris la
    // main sur son plan personnel n'est pas à cette table: lui attribuer une
    // envie la rangerait chez quelqu'un d'absent.
    // ⚠️ LE SITE NOMINAL: le premier appel est celui du refus depuis le
    // 2026-09-04, et il porte le MÊME roster — mais lire le premier venu
    // ferait passer la mutation à côté de la garde qu'elle vise.
    const roster =
      callFields(src, "household", src.indexOf(PLAN_WRITE)).get("members") ?? "";
    assert(
      roster.includes("composedMembers"),
      "LANE HOUSEHOLD — LE RÔLE DU FOYER A DISPARU DE L'APPEL (`" + roster +
        "`). Un rôle vide dit au modèle « personne d'autre à table »: chaque " +
        "envie attribuée à quelqu'un serait refusée en `unknownMember`, sans " +
        "qu'une seule ligne du produit ne change. Et un rôle bâti sur " +
        "`members` au lieu de `composedMembers` rangerait une envie chez une " +
        "bouche qui a repris la main sur son plan.",
    );
    assert(
      /memberId: m\.memberId/.test(roster) &&
        /label: m\.displayName/.test(roster),
      "LANE HOUSEHOLD — LE RÔLE NE PORTE PLUS LE COUPLE {id, prénom}. Le " +
        "modèle recopie l'`memberId` et LIT le `label`: sans l'un il attribue " +
        "au hasard, sans l'autre il ne sait pas de qui parle la note.",
    );
  },
  cuts: [
    ...CUTS,
    {
      name: "le foyer déclare n'avoir personne à table",
      expects: "LE RÔLE DU FOYER A DISPARU",
      apply: setField("members", "[]"),
    },
    {
      name: "le rôle perd le prénom que le modèle lit",
      expects: "NE PORTE PLUS LE COUPLE",
      // ⚠️ `replaceAll`: la propriété vaut pour CHAQUE appel, et il y en a deux
      // depuis le 2026-09-04. Ne muter que le premier laisserait la garde
      // verte sur le site qu'elle lit.
      apply: (src) =>
        src.replaceAll("label: m.displayName,", "label: m.memberId,"),
    },
  ],
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA TROISIÈME LANE — le champ libre du BILAN (2026-09-04)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ELLE N'ÉTAIT PAS COUVERTE, ET C'EST LE MÊME MODE D'ÉCHEC QUE CELUI QUI A
 * FAIT NAÎTRE CE FICHIER. `keel-plan-feedback-v1` appelle le MÊME classifieur,
 * sur le MÊME producteur, depuis le lot B — et on pouvait retirer ce bloc sans
 * qu'une ligne de ce fichier ne rougisse, parce que `LANES` n'en nommait que
 * deux. Le champ libre du bilan est la source de la MOITIÉ des cas délicats
 * du §8.3 (« j'ai pas aimé la viande »).
 *
 * ⛔ ELLE NE PASSE PAS PAR `assertWiredCommon`, ET CE N'EST PAS UN RACCOURCI.
 * Cinq de ses neuf familles n'ont aucun sens ici: il n'y a ni aperçu
 * (`if (isDraft) return`), ni écriture de plan, ni `startsOn` — le bilan CLÔT
 * un plan, il n'en compose pas. Les forcer demanderait d'inventer des ancres
 * dans le produit pour satisfaire un test. Ce qui reste vrai des trois lanes
 * est asserté ici explicitement.
 */
const FEEDBACK: Lane = {
  lane: "feedback",
  rel: "keel-plan-feedback-v1/index.ts",
  assertWired(src) {
    assert(
      src.includes(IMPORT_LINE_FEEDBACK),
      "LANE FEEDBACK — LE CLASSIFIEUR N'EST PLUS IMPORTÉ. Le champ libre du " +
        "bilan (`anything_else`) redevient une colonne qu'on écrit et que " +
        "personne ne lit: sept réponses par plan, rangées, jamais rangeantes.",
    );
    const site = src.indexOf(`${CALLEE}(`);
    assert(
      site !== -1,
      "LANE FEEDBACK — LE CLASSIFIEUR N'A PLUS D'APPELANT ICI. C'est la " +
        "source de la moitié des cas délicats du §8.3, et son retrait " +
        "laisserait les deux autres lanes vertes.",
    );

    // ── LA GARDE D'ENTRÉE EST AU-DESSUS, TOUJOURS ─────────────────────────
    // ⛔ `readDraftNote` porte la cible chiffrée, l'interdit de doctrine et le
    // plancher TCA. Un appel placé au-dessus de sa porte enverrait au modèle
    // une phrase que la garde venait de refuser.
    const gate = src.indexOf("const note = readDraftNote({");
    assert(gate !== -1, "lane feedback: la garde d'entrée a disparu.");
    assert(
      gate < site,
      "LANE FEEDBACK — LE CLASSIFIEUR EST APPELÉ AVANT SA GARDE D'ENTRÉE. " +
        "Une clause tombée sous plancher TCA repartirait au modèle par cette " +
        "porte-ci, sans que la garde de l'autre lane n'y change rien.",
    );

    // ── LE QUESTIONNAIRE EST ÉCRIT AVANT ──────────────────────────────────
    const answers = src.indexOf('"keel_plan_feedback_submit"');
    assert(answers !== -1, "lane feedback: l'écriture du bilan a disparu.");
    assert(
      answers < site,
      "LANE FEEDBACK — LE CLASSIFIEUR TOURNE AVANT L'ÉCRITURE DU BILAN. " +
        "Personne ne doit perdre ses réponses parce qu'un appel modèle est " +
        "tombé: l'étage 1 s'écrit d'abord, la classification ensuite.",
    );

    const fields = callFields(src, "feedback");
    assertEquals(
      fields.get("note"),
      "note",
      "LANE FEEDBACK — LE CLASSIFIEUR NE REÇOIT PLUS LE VERDICT de " +
        `\`readDraftNote\` (\`${fields.get("note")}\`). Lui tendre la chaîne ` +
        "brute rouvre le trou que `plan_draft_note.ts` ferme.",
    );
    assertEquals(
      fields.get("source"),
      '"plan_feedback"',
      "LANE FEEDBACK — LA SOURCE N'EST PLUS `plan_feedback` (`" +
        fields.get("source") +
        "`). C'est ce mot qui distingue, dans `memory_clarifications`, une " +
        "question née d'un bilan d'une question née d'un brouillon — la " +
        "seule chose qui dise, plus tard, d'où venait la phrase citée.",
    );
    const planFoods = fields.get("planFoods") ?? "";
    assert(
      planFoods.includes("planVocabularyOf("),
      "LANE FEEDBACK — LE VOCABULAIRE DU PLAN N'ATTEINT PLUS LE CLASSIFIEUR " +
        `(\`${planFoods}\`). C'est LA lane où la question « quoi » compte: ` +
        "« j'ai pas aimé la viande » et « le plat de vendredi soir » ne " +
        "peuvent proposer que ce que le plan qu'on vient de clore contient — " +
        "ses PLATS d'abord, ses aliments ensuite.",
    );
    // ── L'ANNONCE DU QUESTIONNAIRE PASSE PAR LE CLASSIFIEUR ───────────────
    // ⚠️ UNE SEULE BULLE PAR GESTE. Le questionnaire écrit (exclusions, crans
    // de portion, réglages) PUIS le champ libre écrit: deux annonces feraient
    // deux bulles, et la seconde désarmerait les boutons de la première.
    assertEquals(
      fields.get("alsoAnnounce"),
      "announced",
      "LANE FEEDBACK — CE QUE LE QUESTIONNAIRE A ÉCRIT N'EST PLUS CONFIÉ AU " +
        `CLASSIFIEUR (\`${fields.get("alsoAnnounce")}\`). Il partira alors ` +
        "dans une bulle à lui, juste avant celle du champ libre — et la " +
        "seconde désarmera les boutons de la première (le front n'arme que " +
        "la dernière bulle qui en porte).",
    );
    assertEquals(
      fields.get("admin"),
      "admin",
      "lane feedback: le classifieur ne reçoit plus le client de service.",
    );
    assertEquals(
      fields.get("userId"),
      "userId",
      "lane feedback: le classifieur ne reçoit plus le titulaire.",
    );

    // ── LE REPLI EXISTE ───────────────────────────────────────────────────
    // ⛔ LE CAS LE PLUS FRÉQUENT EST LE CHAMP VIDE. Sans ce second appelant,
    // le bilan le plus courant — celui où la personne ne tape rien — écrit une
    // exclusion et un cran de portion sans qu'un mot ne le dise.
    assert(
      src.includes("notifyMemoryWrite("),
      "LANE FEEDBACK — LE REPLI D'ANNONCE A DISPARU. Sans lui, un bilan sans " +
        "texte libre — le cas le PLUS fréquent — écrit en mémoire et n'en " +
        "dit rien: exactement le silence que §2.8 ferme.",
    );
  },
  cuts: [
    {
      name: "le classifieur n'est plus importé",
      expects: "N'EST PLUS IMPORTÉ",
      // ⚠️ RETIRÉ, PAS COMMENTÉ. `// <import>` contient encore la chaîne
      // cherchée: la mutation serait INOPÉRANTE et le rouge n'arriverait
      // jamais — la cicatrice « un audit d'appelants doit retirer les
      // commentaires », dans l'autre sens.
      apply: (src) => src.replace(IMPORT_LINE_FEEDBACK, ""),
    },
    {
      // ⚠️ ON DÉPLACE L'APPEL, ON NE SUPPRIME PAS LA GARDE. Retirer
      // `readDraftNote` ferait mordre « la garde d'entrée a disparu » — un
      // message différent, sur une propriété différente: la mutation
      // prouverait alors que le test sait lire un fichier, pas que l'ordre
      // est tenu.
      name: "le classifieur tourne avant sa garde d'entrée",
      expects: "AVANT SA GARDE D'ENTRÉE",
      apply: (src) =>
        src.replace(
          "const note = readDraftNote({",
          "await classifyAndPersistDraftNote(EARLY);\n          " +
            "const note = readDraftNote({",
        ),
    },
    {
      name: "le vocabulaire du bilan redevient les ingrédients seuls",
      expects: "LE VOCABULAIRE DU PLAN N'ATTEINT PLUS",
      apply: (src) =>
        src.replace(/planFoods: planVocabularyOf\(/, "planFoods: foodTermsOf("),
    },
    {
      name: "la source du bilan devient celle du brouillon",
      expects: "LA SOURCE N'EST PLUS `plan_feedback`",
      apply: setField("source", '"draft_note"'),
    },
    {
      name: "les aliments du plan deviennent une liste vide",
      expects: "LE VOCABULAIRE DU PLAN N'ATTEINT PLUS",
      apply: setField("planFoods", "[]"),
    },
    {
      name: "l'annonce du questionnaire n'est plus confiée au classifieur",
      expects: "N'EST PLUS CONFIÉ AU CLASSIFIEUR",
      apply: setField("alsoAnnounce", "[]"),
    },
    {
      name: "le repli d'annonce disparaît",
      expects: "LE REPLI D'ANNONCE A DISPARU",
      apply: (src) => src.replaceAll("notifyMemoryWrite(", "notifyNothing("),
    },
  ],
};

const LANES: readonly Lane[] = [MEAL, HOUSEHOLD, FEEDBACK];

// ---------------------------------------------------------------------------
// LES DEUX APPELS — le vrai fichier, puis la copie amputée
// ---------------------------------------------------------------------------

for (const lane of LANES) {
  Deno.test(`LANE ${lane.lane.toUpperCase()} — LE CÂBLAGE EST LÀ`, async () => {
    lane.assertWired(await source(lane.rel));
  });

  Deno.test(
    `LANE ${lane.lane.toUpperCase()} — ET L'ÉPINGLE ROUGIT QUAND ON LE RETIRE`,
    async () => {
      // ⚠️ SANS CE TEST, LE PRÉCÉDENT EST INDISCERNABLE D'UN `indexOf` QUI
      // CHERCHE UNE CHAÎNE DISPARUE: les deux rendent vert. C'est la preuve
      // CENTRALE de ce lot, et elle tourne à chaque run — pas une fois, dans
      // un rapport, sur une machine.
      const real = await source(lane.rel);
      // LE TÉMOIN, DANS CE TEST-CI. Sans lui, un `assertWired` cassé rendrait
      // ce test VERT (tout lève, donc tout « mord »).
      lane.assertWired(real);
      for (const cut of lane.cuts) {
        const mutated = cut.apply(real);
        assert(
          mutated !== real,
          `MUTATION INOPÉRANTE (« ${cut.name} »): la chaîne visée n'existe ` +
            `plus dans ${lane.rel}. L'assertion correspondante est donc verte ` +
            `pour la MAUVAISE raison — elle garde un symbole renommé.`,
        );
        const error = assertThrows(
          () => lane.assertWired(mutated),
          Error,
          undefined,
          `L'ÉPINGLE NE MORD PAS: « ${cut.name} » laisse ${lane.rel} VERT. ` +
            `C'est exactement l'état du lot 1C — 3507 tests verts sur un ` +
            `module qu'on pouvait retirer des trois générateurs.`,
        );
        assertStringIncludes(
          error.message,
          cut.expects,
          `LA MAUVAISE GARDE A MORDU sur « ${cut.name} » (${lane.rel}). ` +
            `Quelque chose a levé, mais pas l'assertion que cette mutation ` +
            `existe pour prouver: « quelque chose a échoué » ne dit pas que ` +
            `la propriété est tenue.`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// LA LANE QUI N'EN AVAIT PAS — retirée avec sa lane le 2026-08-19
// ---------------------------------------------------------------------------
//
// Il y avait ici un test « LANE WEEK-PLAN — elle ne lit AUCUNE note de
// brouillon, donc elle n'est pas câblée ». C'était un CONSTAT posé sur le
// source de `generate-week-plan-v1/index.ts`. Cette lane a été retirée: le
// test ne pouvait plus lire son fichier, et un constat sur un fichier absent
// n'épingle rien. Il part avec elle, il n'est pas remplacé.
//
// Ce qu'il gardait reste vrai des DEUX lanes restantes, et c'est la boucle
// ci-dessus qui le tient.
