/**
 * LOT 4 (2026-09-08) — LA QUESTION DU SERVEUR, ET LA PHRASE QUI NE SE RELIT PAS.
 *
 * ⛔ CE TEST LIT LA SOURCE, ET C'EST ASSUMÉ (même convention que
 * `planDraftEnergy.int.test.ts`): il n'y a pas de rendu React dans cette
 * suite, et le fait à tenir est un ORDRE d'appels — lire, demander, répondre,
 * PUIS composer — que seul le texte du composant expose.
 *
 * Les deux défauts que ce fichier empêche de revenir:
 *   1. composer avant la réponse — un plan pour la mauvaise assiette;
 *   2. relire la phrase quelque part (adoption, page) — lire c'est APPLIQUER,
 *      donc relire c'est un cran d'appétit appliqué deux fois. Mesuré par
 *      lecture des deux pages le 2026-09-08: `writeFromDraft` relisait.
 */
import { describe, expect, it } from "vitest";
import { sourceFamily } from "../../../test/sourceFamily";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const read = (rel: string) => stripComments(sourceFamily(new URL(rel, import.meta.url)));

describe("PlanDraftDialog — la question avant la composition", () => {
  const src = read("./PlanDraftDialog.tsx");

  it("porte les QUATRE gestes, requis, et plus `onRemix` ni `noteOutcome` en prop", () => {
    expect(src).toMatch(/onReadNote: \(note: string\) => Promise<NoteOutcome>;/);
    expect(src).toMatch(/onAnswerNote: \(answer: NoteAnswer\) => Promise<NoteOutcome>;/);
    expect(src).toMatch(/onCompose: \(\) => Promise<void>;/);
    // ⟳ 2026-09-09 — la reprise locale, et ce qu'elle a pris (`edit`).
    expect(src).toMatch(/onEditCells: \(draftId: string, cells: ReadonlyArray<NoteCell>\) => Promise<void>;/);
    expect(src).toMatch(/\n {2}edit: DraftEdit \| null;/);
    expect(src).not.toMatch(/onRemix/);
    expect(src).not.toMatch(/noteOutcome: NoteOutcome \| null;/);
    // ⟳ 2026-09-24 — « Remplacer »: lire les raisons, puis refaire les plats.
    expect(src).toMatch(/onReadRejections: \(\s*draftId: string,\s*rejections: ReadonlyArray<DishRejection>,\s*\) => Promise<NoteOutcome>;/);
    expect(src).toMatch(/onReplaceDishes: \(\s*draftId: string,\s*rejections: ReadonlyArray<DishRejection>,\s*\) => Promise<void>;/);
  });

  it("s'arrête après la lecture quand une question est rendue — AVANT de composer", () => {
    const click = src.indexOf("const outcome = await onReadNote(note);");
    expect(click, "la reprise ne lit plus la phrase").toBeGreaterThan(0);
    const body = src.slice(click, click + 900);
    // ⟳ 2026-09-21 — L'ARRÊT PORTE MAINTENANT UN BLOC: le champ se vide LÀ,
    // sur ce chemin-ci, parce qu'il ne se vide plus qu'après la composition
    // sur l'autre (le placeholder revenait pendant les deux minutes
    // d'attente). Ce qui est tenu ici est l'ORDRE — l'arrêt avant la
    // composition —, pas la forme de l'instruction.
    const stop = body.indexOf("if (outcome.questions.length > 0) {");
    const compose = body.indexOf("await renderNow(outcome);");
    expect(stop, "aucun arrêt sur une question ouverte").toBeGreaterThan(0);
    expect(compose, "la reprise ne refait plus le plan").toBeGreaterThan(0);
    expect(stop, "on refait AVANT de regarder la question").toBeLessThan(compose);
  });

  it("⟳ 2026-09-25 — aucun tour ne se compte: il n'y a plus de limite de reprises", () => {
    // Décision produit: « il ne doit pas y avoir de limite de reprises dans
    // les faits ». Les quatre chemins qui composent (recomposer, refaire la
    // case, l'ajustement par exclusion, remplacer des plats) ne comptent rien.
    expect(src).not.toMatch(/countTurn|setTurnsUsed/);
    const fn = src.slice(src.indexOf("const composeNow = async () => {"));
    const body = fn.slice(0, fn.indexOf("};"));
    expect(body).toMatch(/await onCompose\(\);/);
    expect(src).toMatch(/await onEditCells\(draftId, outcome\.cells\);/);
    expect(src).toMatch(/await onEditExclusions\(draftId, outcome\.swaps\);/);
    expect(src).toMatch(/await onReplaceDishes\(id, rejections\);/);
  });

  it("⟳ pièce 4 — la case seule quand la phrase en désigne une ET qu'un brouillon est rangé, sinon tout", () => {
    const fn = src.slice(src.indexOf("const renderNow = async (outcome: NoteOutcome) => {"));
    const body = fn.slice(0, fn.indexOf("\n  };"));
    expect(body).toMatch(/if \(outcome\.cells\.length > 0 && draftId !== null\) \{/);
    expect(body).toMatch(/await onEditCells\(draftId, outcome\.cells\);/);
    expect(body).toMatch(/await composeNow\(\);/);
    // ⟳ 2026-09-24 — une note qui n'est QU'UNE exclusion modifie le brouillon,
    // et ce test vient AVANT la recomposition : sinon elle ne s'atteint jamais.
    // ⟳ 2026-09-25 — `noteIsLocalEdit`: l'exclusion seule, ou « à la place
    // de X, mets Y » pour ce plan.
    const exclusion = body.indexOf("if (draftId !== null && noteIsLocalEdit(outcome)) {");
    expect(exclusion).toBeGreaterThan(0);
    expect(exclusion).toBeLessThan(body.indexOf("await composeNow();"));
    // Ce qui se dit vient de `edit.taken` (les cases PRISES), jamais de la demande.
    expect(src).toMatch(/edit !== null && edit\.operation === "edit_cells" && edit\.taken\.length > 0/);
    expect(src).toMatch(/t\("plan\.draft\.cells_applied"/);
  });

  it("⟳ 2026-09-24 — les réponses partent ensemble, puis la suite: la note ne recompose que si quelque chose a bougé, le remplacement part toujours", () => {
    const fn = src.slice(src.indexOf("const continueAfterQuestions = async ("));
    const body = fn.slice(0, fn.indexOf("finally {"));
    // « Personne de la liste » (ou rien de coché) n'écrit rien, et se compte.
    expect(body).toMatch(/if \(memberId === null\) \{\s*skipped\+\+;\s*continue;/);
    const replace = body.indexOf("await replaceNow(then.draftId, then.rejections, merged);");
    // ⟳ 2026-09-25 — un remplacement pour ce plan (`swaps`) est aussi « quelque
    // chose qui a bougé »: sans lui dans la garde, il serait perdu en silence.
    const guard = body.indexOf("if (merged.announced.length === 0 && merged.cells.length === 0 && merged.swaps.length === 0) return;");
    const render = body.indexOf("await renderNow(merged);");
    expect(replace, "le remplacement ne part plus après les questions").toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(replace);
    expect(render).toBeGreaterThan(guard);
    // Trois questions au plus; le reste est compté comme passé.
    expect(src).toMatch(/questions: outcome\.questions\.slice\(0, NOTE_QUESTIONS_MAX\)/);
  });

  it("⟳ 2026-09-23 — « pour qui ? » sur un goût passe par le MÊME geste que la part, et le morceau repart tel quel", () => {
    // Le serveur nomme la bouche manquante (`clarify.entries`) depuis le
    // 2026-09-07 sans que rien ne la demande: « ma fille ne veut plus de
    // yaourt » avec deux filles n'écrivait rien et ne demandait rien. La
    // question `who` emprunte le canal de la part: mêmes boutons, même
    // échappatoire, et l'entrée à écrire (`entry`) voyage dans la question
    // et revient avec le tap — le front ne la lit pas.
    const fn = src.slice(src.indexOf("const continueAfterQuestions = async ("));
    const body = fn.slice(0, fn.indexOf("finally {"));
    expect(body).toMatch(/question\.kind === "portion"\s*\?\s*\{ kind: "portion", memberId, direction: question\.direction \}\s*:\s*\{ kind: "who", memberId, entry: question\.entry \}/);
    const api = read("../../api/planDraft.ts");
    expect(api).toMatch(/export type NoteQuestion = NotePortionQuestion \| NoteWhoQuestion;/);
    expect(api).toMatch(/export type NoteAnswer = NotePortionAnswer \| NoteWhoAnswer;/);
    // La lecture garde `who` AVEC son morceau, et refuse une question sans option lisible.
    expect(api).toMatch(/if \(row\.kind === "who" && row\.entry && typeof row\.entry === "object"\) \{/);
    expect(api).toMatch(/if \(options\.length === 0\) continue;/);
    // La réponse repart avec `entry` tel quel — jamais recomposé côté front.
    expect(api).toMatch(/: \{ kind: "who", member_id: answer\.memberId, entry: answer\.entry \}/);
  });

  it("⟳ 2026-09-24 — les questions sont une COUCHE: tant qu'elle est ouverte, le reste est inerte, et l'échappatoire existe", () => {
    // La couche est montée par `Modal`, qui rend fronton, corps et pied `inert`
    // tant qu'elle est là: ni le champ ni la reprise ne se touchent.
    // ⟳ 2026-09-24 — la couche ne porte plus QUE les questions (la raison de
    // « Changer » vit dans une bulle sous le bouton du plat).
    expect(src).toMatch(/layer=\{asking !== null\s*\?\s*\(\s*<NoteQuestionsLayer/);
    const modal = read("../ui/Modal.tsx");
    expect(modal.match(/inert=\{hasLayer\}/g)?.length, "fronton, corps et pied inertes").toBe(3);
    const layer = read("./NoteQuestionsLayer.tsx");
    expect(layer).toMatch(/t\("plan\.draft\.question_none"\)/);
    expect(layer).toMatch(/t\("plan\.draft\.question_who", \{ text: question\.text \}\)/);
  });

  it("⟳ 2026-09-24 — « Remplacer »: des plats barrés retirent l'adoption, et la lecture précède le remplacement", () => {
    // L'UN OU L'AUTRE: le fronton n'offre plus « Adopter », le pied n'a plus
    // qu'« Ajuster le plan ».
    expect(src).toMatch(/headerAction=\{strikeMode\s*\?\s*undefined/);
    const foot = src.slice(src.indexOf("    strikeMode\n      ? ("), src.indexOf("      : noteOpen\n"));
    expect(foot, "le pied des plats barrés a disparu").not.toBe("");
    expect(foot).not.toMatch(/runAdopt/);
    expect(foot).toMatch(/onClick=\{\(\) => void runReplace\(\)\}/);
    // Lire (et ranger) AVANT de refaire; une question arrête avant.
    const fn = src.slice(src.indexOf("const runReplace = async () => {"));
    const body = fn.slice(0, fn.indexOf("finally {"));
    const read1 = body.indexOf("await onReadRejections(draftId, rejections);");
    const stop = body.indexOf("openQuestions(outcome, { draftId, rejections });");
    const go = body.indexOf("await replaceNow(draftId, rejections, outcome);");
    expect(read1).toBeGreaterThan(0);
    expect(stop).toBeGreaterThan(read1);
    expect(go).toBeGreaterThan(stop);
    // Une allergie ou un régime rangé par une raison ⇒ tout le plan.
    const now = src.slice(src.indexOf("const replaceNow = async ("));
    expect(now.slice(0, now.indexOf("\n  };"))).toMatch(
      /if \(outcome\.announced\.some\(\(a\) => a\.kind === "safety"\)\) \{\s*await composeNow\(\);/,
    );
  });
});

describe("la phrase n'est lue QU'UNE fois — jamais par le composeur ni l'adoption", () => {
  const api = read("../../api/planDraft.ts");
  const setup = read("../../pages/SetupPage.tsx");
  const week = read("../../pages/StudentWeekPlanPage.tsx");

  it("`ComposeDraftInput` n'a plus de `note`, et ni `composeDraft` ni `writeFromDraft` n'appellent `readNote`", () => {
    expect(api).not.toMatch(/\n\s+note: string \| null;/);
    for (const name of ["composeDraft", "writeFromDraft"]) {
      const start = api.indexOf(`export async function ${name}(`);
      expect(start).toBeGreaterThan(0);
      const body = api.slice(start, api.indexOf("\n}\n", start));
      expect(body, `${name} relit la phrase`).not.toMatch(/readNote\(/);
    }
  });

  it("`readNote` et `answerNote` visent la même fonction, et `answerNote` ne porte pas de `draft_note`", () => {
    const answer = api.slice(api.indexOf("export async function answerNote("));
    const body = answer.slice(0, answer.indexOf("\n}\n"));
    expect(body).toMatch(/"keel-read-note-v1"/);
    // ⟳ 2026-09-23 — deux formes de réponse, discriminées par `kind`; la part
    // garde la sienne à l'octet près, et `who` ne porte que la bouche et le
    // morceau revenu tel quel.
    expect(body).toMatch(/answer: answer\.kind === "portion"\s*\?\s*\{ kind: "portion", member_id: answer\.memberId, direction: answer\.direction \}/);
    expect(body).toMatch(/: \{ kind: "who", member_id: answer\.memberId, entry: answer\.entry \}/);
    expect(body).not.toMatch(/draft_note/);
  });

  it("`editCells` demande `operation: edit_cells`, et ne recompose jamais tout à la place", () => {
    // ⟳ 2026-09-10 · LOT 7 — LE REPLI A DISPARU, ET C'EST LA PROPRIÉTÉ ICI.
    // Ce cas exigeait `if (input.lane !== "household") return await
    // composeDraft(input);` — la lane individuelle n'avait pas `edit_cells`.
    // Il n'y a plus de lane individuelle, et ce repli est devenu dangereux
    // plutôt qu'inutile: par lui, une reprise LOCALE se transformait en
    // recomposition COMPLÈTE sans que rien ne le dise (`edit` reste `null`, le
    // dialogue dit « refait », et les autres cases ont bougé).
    const fn = api.slice(api.indexOf("export async function editCells("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body, "le repli « recompose tout » est revenu")
      .not.toMatch(/composeDraft\(input\)/);
    expect(body).toMatch(/operation: "edit_cells",\s*draft_id: draftId,/);
    expect(api).toMatch(/Object\.assign\(body, extra\);/);
  });

  it("les deux pages montent les quatre gestes, ne retiennent plus de `draftNote`, et adoptent SANS phrase", () => {
    for (const [name, src] of [["SetupPage", setup], ["StudentWeekPlanPage", week]] as const) {
      expect(src, `${name}: onReadNote`).toMatch(/onReadNote=\{async \(note\) =>/);
      expect(src, `${name}: onAnswerNote`).toMatch(/onAnswerNote=\{async \(answer\) =>/);
      expect(src, `${name}: onCompose`).toMatch(/onCompose=\{async \(\) =>/);
      expect(src, `${name}: onEditCells`).toMatch(/onEditCells=\{async \(id, cells\) =>/);
      // ⟳ 2026-09-24 — « Remplacer ».
      expect(src, `${name}: onReadRejections`).toMatch(/onReadRejections=\{async \(id, rejections\) =>/);
      expect(src, `${name}: onReplaceDishes`).toMatch(/onReplaceDishes=\{async \(id, rejections\) =>/);
      expect(src, `${name}: edit`).toMatch(/edit=\{draft\?\.envelope\.edit \?\? null\}/);
      expect(src, `${name}: draftNote retenu`).not.toMatch(/setDraftNote\(/);
      // ⟳ 2026-09-21 — la page du plan adopte l'entrée de la SOURCE de
      // l'aperçu (« Composer un autre plan ») ou, à défaut, la fenêtre libre.
      expect(src, `${name}: writeFromDraft`).toMatch(
        /writeFromDraft\(\s*(draftSource\?\.input \?\? )?draftInput\((facts!)?\),/,
      );
    }
  });
});
