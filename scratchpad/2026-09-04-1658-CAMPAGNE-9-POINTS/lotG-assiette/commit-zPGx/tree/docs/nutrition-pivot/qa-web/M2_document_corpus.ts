/**
 * M2 — LE CORPUS D'UN DOCUMENT DU COACH, EN CONDITIONS RÉELLES.
 *
 * Vraie fonction edge, vraie base, vrai bucket, vrai modèle. Rien n'est simulé
 * ici: les tests purs (`document_corpus_test.ts`, 18) et les assertions SQL
 * (`coach_document_corpus_test.sql`, 33) couvrent déjà le découpage et les
 * contraintes. Ce fichier couvre ce qu'aucun des deux ne peut voir — la
 * JOINTURE entre le code et la base, qui est exactement ce que ce dépôt a
 * déjà payé plusieurs fois.
 *
 * CE QUI EST ÉPROUVÉ, ET POURQUOI CHAQUE CAS EXISTE
 *   E1  Un PDF texte normal: document + chunks + citations ANCRÉES à leur page.
 *   E2  Le brouillon rendu au coach ne contient AUCUNE citation. Si elle y
 *       restait, `parseCoachDoctrine` la jetterait en silence (on aurait payé
 *       la citation sans la garder) — ou pire, elle finirait recopiée dans le
 *       bloc compilé, c'est-à-dire des pages d'ebook injectées à chaque tour.
 *   E3  Redéposer LE MÊME fichier ne duplique rien. C'est le geste le plus
 *       fréquent d'un coach qui a vu un timeout.
 *   E4  Un SECOND document coexiste (l'unicité est par contenu, pas par coach).
 *   E5  Un PDF sans couche texte n'est PAS une panne: le coach obtient son
 *       brouillon, le corpus est vide, et l'état le dit.
 *   E5b Une citation qu'on ne peut pas ancrer s'écrit quand même, non ancrée.
 *       Passe par la coquille d'I/O directement: le modèle ne peut pas être
 *       sommé de produire une citation introuvable à la demande.
 *   E6  Un refus (pas de document, pas un PDF, PDF illisible) n'écrit RIEN.
 *       Une ligne de corpus créée par un tour refusé serait un fantôme.
 *   E7  Un PDF trop long est refusé AVANT le modèle et avant toute écriture.
 *   E8  Le coach B ne voit RIEN du corpus du coach A, par son propre JWT.
 *   E9  RGPD: l'objet déposé est sous `<id auth du coach>/…`. Les deux
 *       routines RGPD s'accrochent à ce préfixe; un autre chemin est invisible
 *       à l'export et survit à la purge.
 *   E10 L'interview (`compile`, sans document) n'écrit AUCUN document.
 *   E11 Le dépôt sans id auth ne fait PAS échouer le lot: le texte survit, le
 *       fichier est perdu, et c'est dit dans les warnings.
 *
 * USAGE
 *   ./scripts/local_extend_kong_functions_timeout.sh   # sinon 502 sur les longs appels
 *   set -a; . supabase/functions/night_llm.env; set +a
 *   deno run -A --node-modules-dir=none docs/nutrition-pivot/qa-web/M2_document_corpus.ts
 *
 * `--node-modules-dir=none` est NÉCESSAIRE: ce script fabrique ses PDF avec
 * `npm:pdf-lib`, que le `deno.json` de la racine ne déclare pas (les fonctions
 * edge ont le leur). Sans le drapeau, la résolution échoue avant le premier test.
 */
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

import { admin, callAs, type Coach, makeCoach, sql } from "./harness.ts";
import { persistDocumentCorpus } from "../../../supabase/functions/_shared/keel/document_corpus_io.ts";
import { INTERVIEW_QUESTIONS } from "../../../supabase/functions/_shared/keel/doctrine_versions.ts";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name} — ${detail}`);
}
function banner(title: string): void {
  console.log("\n" + "═".repeat(78));
  console.log(`▌ ${title}`);
  console.log("═".repeat(78));
}

// ---------------------------------------------------------------------------
// Les documents de test
// ---------------------------------------------------------------------------
async function textPdf(pages: readonly (readonly string[])[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((line, i) =>
      page.drawText(line, { x: 50, y: 780 - i * 24, size: 12, font, color: rgb(0, 0, 0) })
    );
  }
  return await doc.save();
}

/** Un PDF de PAGES SANS TEXTE — l'ebook exporté en images, le scan. */
async function graphicsOnlyPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]);
    page.drawRectangle({ x: 40, y: 400, width: 500, height: 300, color: rgb(0.85, 0.85, 0.85) });
  }
  return await doc.save();
}

const METHOD_PAGES = [
  [
    "MY METHOD",
    "I never count calories with my athletes.",
    "I build the plate instead: protein first, then vegetables.",
  ],
  [
    "FATS",
    "Sunflower oil never goes on one of my plates.",
    "I use olive oil and butter, nothing else.",
  ],
  [
    "QUESTIONS I GET",
    "Can I have coffee in the morning? Yes, black, after water.",
  ],
];

const SECOND_PAGES = [
  [
    "TRAINING DAYS",
    "On a training day I add a starch at the meal after the session.",
    "I do not use protein shakes: real food, chewed, sitting down.",
  ],
];

const call = (coach: Coach, payload: Record<string, unknown>) =>
  callAs(coach, "coach-doctrine-v1", payload);

const compileDocument = (coach: Coach, bytes: Uint8Array, fileName: string) =>
  call(coach, {
    action: "compile_document",
    file_name: fileName,
    content_locale: "en",
    media: { mime_type: "application/pdf", base64: encodeBase64(bytes) },
  });

const countFor = async (coachId: string, table: string): Promise<number> => {
  const out = await sql(`select count(*) from ${table} where coach_id = '${coachId}'`);
  return Number(out.split("\n").slice(1)[0]?.trim() ?? 0);
};

// ---------------------------------------------------------------------------
banner("M2 — corpus documentaire du coach, conditions réelles");

const coachA = await makeCoach({ displayName: "Marlow", country: "GB" });
const coachB = await makeCoach({ displayName: "Other", country: "GB" });
console.log(`  coach A ${coachA.coachId} (auth ${coachA.userId})`);
console.log(`  coach B ${coachB.coachId}\n`);

// ---------------------------------------------------------------------------
banner("E1/E2 — un PDF texte: corpus écrit, citations ancrées, brouillon propre");

const methodBytes = await textPdf(METHOD_PAGES);
const r1 = await compileDocument(coachA, methodBytes, "methode.pdf");
check("E1 la fonction répond 200", r1.status === 200, `status ${r1.status}`);
check(
  "E1 le document est enregistré et son texte extrait",
  r1.json?.document_id != null && r1.json?.document_text_status === "extracted",
  `id=${r1.json?.document_id} status=${r1.json?.document_text_status} chunks=${r1.json?.document_chunks}`,
);
check(
  "E1 un chunk par page de texte",
  Number(r1.json?.document_chunks ?? 0) === METHOD_PAGES.length,
  `${r1.json?.document_chunks} chunks pour ${METHOD_PAGES.length} pages`,
);

const draftJson = JSON.stringify(r1.json?.draft ?? {});
check(
  "E2 le brouillon rendu au coach ne porte AUCUNE citation",
  !draftJson.includes('"quote"'),
  draftJson.includes('"quote"') ? "une `quote` a fuité dans le brouillon" : "aucune clé `quote`",
);
check(
  "E2 le brouillon a bien les sections de doctrine",
  Array.isArray(r1.json?.draft?.beliefs),
  `sections: ${Object.keys(r1.json?.draft ?? {}).join(", ")}`,
);

const citRows = await sql(
  `select entry_kind, page_number, (chunk_id is not null) as located
     from coach_document_citations where coach_id = '${coachA.coachId}' order by entry_kind`,
);
const citLines = citRows.split("\n").slice(1).filter(Boolean);
const located = citLines.filter((l) => l.trim().endsWith("|t")).length;
check(
  "E1 le document a produit des citations",
  citLines.length > 0,
  `${citLines.length} citation(s)`,
);
check(
  "E1 les citations sont ANCRÉES à une page du document",
  citLines.length > 0 && located === citLines.length,
  `${located}/${citLines.length} retrouvées dans le texte du document`,
);
// ⚠️ Mesure, pas assertion: le taux d'ancrage est la seule vérification
// automatique de « la citation vient bien du document ». S'il tombe, ce n'est
// pas ce test qui est faux, c'est l'extraction qui paraphrase.
console.log(`     (taux d'ancrage: ${located}/${citLines.length})`);

const pagesOk = await sql(
  `select count(*) from coach_document_citations c
     join coach_document_chunks k on k.id = c.chunk_id
    where c.coach_id = '${coachA.coachId}' and c.page_number <> k.page_number`,
);
check(
  "E1 la page d'une citation est celle de SON chunk",
  Number(pagesOk.split("\n").slice(1)[0]?.trim() ?? -1) === 0,
  "aucune citation ne pointe une page qui n'est pas la sienne",
);

// ---------------------------------------------------------------------------
banner("E9 — RGPD: le fichier est déposé sous l'id AUTH du coach");

const pathRow = await sql(
  `select storage_path from coach_documents where coach_id = '${coachA.coachId}'`,
);
const storagePath = pathRow.split("\n").slice(1)[0]?.trim() ?? "";
check(
  "E9 le chemin commence par l'id auth du coach (pas coaches.id)",
  storagePath.startsWith(`${coachA.userId}/`),
  storagePath || "(aucun chemin)",
);
const dl = await admin().storage.from("plan-documents").download(storagePath);
check(
  "E9 l'objet existe vraiment dans le bucket",
  !dl.error && dl.data != null,
  dl.error ? dl.error.message : `${(await dl.data!.arrayBuffer()).byteLength} octets`,
);

// ---------------------------------------------------------------------------
banner("E3/E4 — re-dépôt du même fichier, puis d'un second");

const before = {
  docs: await countFor(coachA.coachId, "coach_documents"),
  chunks: await countFor(coachA.coachId, "coach_document_chunks"),
  citations: await countFor(coachA.coachId, "coach_document_citations"),
};
const r3 = await compileDocument(coachA, methodBytes, "methode.pdf");
check("E3 le re-dépôt répond 200 (le coach a le droit)", r3.status === 200, `status ${r3.status}`);
const after = {
  docs: await countFor(coachA.coachId, "coach_documents"),
  chunks: await countFor(coachA.coachId, "coach_document_chunks"),
  citations: await countFor(coachA.coachId, "coach_document_citations"),
};
check(
  "E3 aucun document, chunk ni citation en double",
  after.docs === before.docs && after.chunks === before.chunks &&
    after.citations === before.citations,
  `docs ${before.docs}→${after.docs}, chunks ${before.chunks}→${after.chunks}, ` +
    `citations ${before.citations}→${after.citations}`,
);
check(
  "E3 la réponse rend le MÊME document_id",
  r3.json?.document_id === r1.json?.document_id,
  `${r1.json?.document_id} vs ${r3.json?.document_id}`,
);

const r4 = await compileDocument(coachA, await textPdf(SECOND_PAGES), "seance.pdf");
check(
  "E4 un second document coexiste avec le premier",
  r4.status === 200 && (await countFor(coachA.coachId, "coach_documents")) === 2,
  `status ${r4.status}${r4.json?.error ? ` ${r4.json.error}` : ""}${
    r4.json?.detail ? ` (${String(r4.json.detail).slice(0, 120)})` : ""
  } → ${await countFor(coachA.coachId, "coach_documents")} documents`,
);

// ---------------------------------------------------------------------------
banner("E5 — un PDF sans couche texte n'est pas une panne");

const r5 = await compileDocument(coachA, await graphicsOnlyPdf(2), "scan.pdf");
check(
  "E5 le coach obtient quand même sa réponse",
  r5.status === 200 && r5.json?.ok === true,
  `status ${r5.status}`,
);
check(
  "E5 l'état est `no_text_layer`, pas `extraction_failed`",
  r5.json?.document_text_status === "no_text_layer",
  String(r5.json?.document_text_status),
);
check(
  "E5 aucun chunk, et la ligne document existe quand même",
  Number(r5.json?.document_chunks ?? -1) === 0 && r5.json?.document_id != null,
  `chunks=${r5.json?.document_chunks} id=${r5.json?.document_id}`,
);

// ---------------------------------------------------------------------------
banner("E5b — une citation non ancrable s'écrit, non ancrée (coquille d'I/O)");

const scanBytes = await graphicsOnlyPdf(3);
const e5b = await persistDocumentCorpus(admin(), {
  coachId: coachB.coachId,
  coachUserId: coachB.userId,
  fileName: "scan-b.pdf",
  bytes: scanBytes,
  pageCount: 3,
  contentLocale: "en",
  citations: [
    { kind: "belief", entryKey: "la faim est une information", quote: "La faim est une information." },
    { kind: "qa", entryKey: "le cafe le matin", quote: "Le cafe le matin, oui, apres l'eau." },
  ],
});
check(
  "E5b le corpus est écrit malgré l'absence de texte",
  e5b.reason === "persisted" && e5b.textStatus === "no_text_layer",
  `reason=${e5b.reason} status=${e5b.textStatus} warnings=[${e5b.warnings.join("; ")}]`,
);
check(
  "E5b les deux citations sont enregistrées",
  e5b.citationsWritten === 2,
  `${e5b.citationsWritten} citation(s)`,
);
check(
  "E5b aucune n'est comptée comme introuvable — il n'y avait rien à chercher",
  e5b.citationsUnlocated === 0,
  `unlocated=${e5b.citationsUnlocated} (une accusation ici serait fausse)`,
);
const unanchored = await sql(
  `select count(*) from coach_document_citations
    where coach_id = '${coachB.coachId}' and chunk_id is null and page_number is null`,
);
check(
  "E5b elles sont en base, sans ancre et sans page",
  Number(unanchored.split("\n").slice(1)[0]?.trim() ?? 0) === 2,
  unanchored.split("\n").slice(1)[0]?.trim() ?? "?",
);

// ---------------------------------------------------------------------------
banner("E6/E7 — un tour refusé n'écrit RIEN");

const docsBeforeRefusals = await countFor(coachA.coachId, "coach_documents");

const noDoc = await call(coachA, { action: "compile_document", content_locale: "en" });
check(
  "E6 sans document: `document_required`, 400",
  noDoc.status === 400 && noDoc.json?.error === "document_required",
  `${noDoc.status} ${noDoc.json?.error}`,
);

const notPdf = await call(coachA, {
  action: "compile_document",
  content_locale: "en",
  media: { mime_type: "image/png", base64: encodeBase64(new Uint8Array([1, 2, 3, 4])) },
});
check(
  "E6 pas un PDF: `document_must_be_pdf`, 400",
  notPdf.status === 400 && notPdf.json?.error === "document_must_be_pdf",
  `${notPdf.status} ${notPdf.json?.error}`,
);

const garbage = await call(coachA, {
  action: "compile_document",
  content_locale: "en",
  media: { mime_type: "application/pdf", base64: encodeBase64(new TextEncoder().encode("pas un pdf")) },
});
check(
  "E6 PDF illisible: `document_unreadable`, 400",
  garbage.status === 400 && garbage.json?.error === "document_unreadable",
  `${garbage.status} ${garbage.json?.error}`,
);

const tooLong = await compileDocument(coachA, await graphicsOnlyPdf(121), "trop-long.pdf");
check(
  "E7 121 pages: `document_too_long`, 413",
  tooLong.status === 413 && tooLong.json?.error === "document_too_long",
  `${tooLong.status} ${tooLong.json?.error} page_count=${tooLong.json?.page_count}`,
);

check(
  "E6/E7 aucun de ces quatre refus n'a créé de document",
  (await countFor(coachA.coachId, "coach_documents")) === docsBeforeRefusals,
  `${docsBeforeRefusals} avant, ${await countFor(coachA.coachId, "coach_documents")} après`,
);

// ---------------------------------------------------------------------------
banner("E8 — le corpus d'un coach est invisible aux autres");

const leak = await admin().auth.admin.listUsers({ page: 1, perPage: 1 });
void leak;
// Par le JWT du coach B, à travers PostgREST — donc à travers les policies,
// pas à travers `service_role`.
const asB = await fetch(
  `${Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321"}/rest/v1/coach_document_chunks?select=id`,
  {
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      Authorization: `Bearer ${coachB.accessToken}`,
    },
  },
);
const bRows = await asB.json().catch(() => []);
check(
  "E8 le coach B ne lit AUCUN chunk du coach A",
  Array.isArray(bRows) && bRows.length === 0,
  `${Array.isArray(bRows) ? bRows.length : "?"} ligne(s) visibles (le coach A en a ${
    await countFor(coachA.coachId, "coach_document_chunks")
  })`,
);

const asBCitations = await fetch(
  `${Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321"}/rest/v1/coach_document_citations?select=quote`,
  {
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      Authorization: `Bearer ${coachB.accessToken}`,
    },
  },
);
const bCitations = await asBCitations.json().catch(() => []);
check(
  "E8 le coach B ne lit que SES citations (celles de E5b)",
  Array.isArray(bCitations) && bCitations.length === 2,
  `${Array.isArray(bCitations) ? bCitations.length : "?"} citation(s)`,
);

// ---------------------------------------------------------------------------
banner("E10 — l'interview n'écrit aucun document");

const docsBeforeInterview = await countFor(coachB.coachId, "coach_documents");
const interview = await call(coachB, {
  action: "compile",
  answers: [
    {
      section: "beliefs",
      question: INTERVIEW_QUESTIONS[0].question,
      answer: "Hunger is information, not weakness.",
    },
    {
      section: "forbidden",
      question: INTERVIEW_QUESTIONS[1].question,
      answer: "I never tell anyone to do six small meals a day.",
    },
  ],
});
check(
  "E10 `compile` répond sans toucher au corpus",
  interview.status === 200 &&
    (await countFor(coachB.coachId, "coach_documents")) === docsBeforeInterview,
  `status ${interview.status}${interview.json?.error ? ` ${interview.json.error}` : ""}, ` +
    `documents ${docsBeforeInterview} → ${await countFor(coachB.coachId, "coach_documents")}`,
);
check(
  "E10 le brouillon d'interview ne porte pas de citation non plus",
  !JSON.stringify(interview.json?.draft ?? {}).includes('"quote"'),
  "aucune clé `quote` (l'interview n'a pas de document à citer)",
);

// ---------------------------------------------------------------------------
banner("E11 — sans id auth, le texte survit et le fichier est perdu, à voix haute");

const e11 = await persistDocumentCorpus(admin(), {
  coachId: coachB.coachId,
  coachUserId: "",
  fileName: "orphelin.pdf",
  bytes: await textPdf([["Une page de texte pour le corpus orphelin."]]),
  pageCount: 1,
  contentLocale: "en",
  citations: [],
});
check(
  "E11 le document et ses chunks sont écrits",
  e11.reason === "persisted" && e11.chunksWritten === 1,
  `reason=${e11.reason} chunks=${e11.chunksWritten}`,
);
check(
  "E11 le fichier n'est PAS déposé, et c'est dit",
  e11.storagePath === null && e11.warnings.some((w) => w.includes("RGPD")),
  `warnings=[${e11.warnings.join("; ")}]`,
);

// ---------------------------------------------------------------------------
banner("E12 — une page longue, accentuée, se découpe en gardant SA page");

const longFrench = "Je construis l'assiette autour des protéines, jamais autour d'un " +
  "chiffre : la faim est une information, et un élève qui a faim quatre-vingt-dix " +
  "minutes après un repas a mangé un repas mal construit, ce qui est ma faute. ";
const e12 = await persistDocumentCorpus(admin(), {
  coachId: coachB.coachId,
  coachUserId: coachB.userId,
  fileName: "page-longue.pdf",
  // Une seule page, largement au-dessus du plafond d'un chunk.
  bytes: await textPdf([
    Array.from({ length: 30 }, (_, i) => `${i + 1}. ${longFrench}`),
    ["Deuxième page, courte."],
  ]),
  pageCount: 2,
  contentLocale: "fr",
  citations: [{
    kind: "belief",
    entryKey: "la faim est une information",
    quote: "la faim est une information",
  }],
});
const e12Pages = await sql(
  `select page_number, count(*) from coach_document_chunks
    where document_id = '${e12.documentId}' group by page_number order by page_number`,
);
check(
  "E12 la page longue produit plusieurs chunks",
  e12.chunksWritten > 2,
  `${e12.chunksWritten} chunks — ${e12Pages.split("\n").slice(1).join(" / ")}`,
);
const e12Cross = await sql(
  `select count(*) from coach_document_chunks
    where document_id = '${e12.documentId}' and page_number not in (1,2)`,
);
check(
  "E12 aucun chunk n'invente une page",
  Number(e12Cross.split("\n").slice(1)[0]?.trim() ?? -1) === 0,
  "toutes les pages sont 1 ou 2",
);
check(
  "E12 la citation accentuée s'ancre quand même",
  e12.citationsUnlocated === 0 && e12.citationsWritten === 1,
  `écrites=${e12.citationsWritten} introuvables=${e12.citationsUnlocated}`,
);

// ---------------------------------------------------------------------------
banner("E13 — double dépôt SIMULTANÉ du même fichier (le double-clic)");

// La course sur l'index unique: les deux inserts partent avant que l'un ait
// commité. C'est le geste réel d'un coach dont la première tentative « ne
// répond pas ». Sans la reprise sur conflit, l'un des deux rendrait
// `document_write_failed` alors que rien n'a mal tourné.
const raceBytes = await textPdf([["Un document unique pour la course."]]);
const [raceA, raceB] = await Promise.all([
  persistDocumentCorpus(admin(), {
    coachId: coachB.coachId,
    coachUserId: coachB.userId,
    fileName: "course.pdf",
    bytes: raceBytes.slice(),
    pageCount: 1,
    contentLocale: "en",
    citations: [{ kind: "belief", entryKey: "course", quote: "Un document unique pour la course." }],
  }),
  persistDocumentCorpus(admin(), {
    coachId: coachB.coachId,
    coachUserId: coachB.userId,
    fileName: "course.pdf",
    bytes: raceBytes.slice(),
    pageCount: 1,
    contentLocale: "en",
    citations: [{ kind: "belief", entryKey: "course", quote: "Un document unique pour la course." }],
  }),
]);
check(
  "E13 les deux appels réussissent",
  raceA.documentId != null && raceB.documentId != null &&
    raceA.reason !== "document_write_failed" && raceB.reason !== "document_write_failed",
  `A=${raceA.reason} B=${raceB.reason}`,
);
check(
  "E13 ils désignent LE MÊME document",
  raceA.documentId === raceB.documentId,
  `${raceA.documentId} vs ${raceB.documentId}`,
);
const raceChunks = await sql(
  `select count(*) from coach_document_chunks where document_id = '${raceA.documentId}'`,
);
check(
  "E13 le texte n'est pas écrit deux fois",
  Number(raceChunks.split("\n").slice(1)[0]?.trim() ?? -1) === 1,
  `${raceChunks.split("\n").slice(1)[0]?.trim()} chunk(s) pour 1 page`,
);

// ---------------------------------------------------------------------------
banner("E14 — MESURE: ce que pèse le corpus d'un ebook au plafond (120 pages)");

// Pas d'appel au modèle ici, et c'est délibéré: on mesure le CORPUS, pas
// l'extraction. Le chiffre sert à dimensionner la récupération sémantique
// (combien de passages, quelle taille) le jour où elle arrivera.
const ebookPage = Array.from(
  { length: 26 },
  (_, i) =>
    `${i + 1}. Le repas se construit autour d'une source de proteines, puis des ` +
    `legumes, puis un feculent si la seance le demande. Rien ici ne se compte.`,
);
const t0 = Date.now();
const e14 = await persistDocumentCorpus(admin(), {
  coachId: coachB.coachId,
  coachUserId: coachB.userId,
  fileName: "ebook-120p.pdf",
  bytes: await textPdf(Array.from({ length: 120 }, () => ebookPage)),
  pageCount: 120,
  contentLocale: "fr",
  citations: [],
});
const e14ms = Date.now() - t0;
const e14Row = await sql(
  `select text_chars, chunk_count from coach_documents where id = '${e14.documentId}'`,
);
const [chars, chunkCount] = (e14Row.split("\n").slice(1)[0] ?? "0|0").split("|").map((n) =>
  Number(n.trim())
);
check(
  "E14 un ebook de 120 pages s'écrit entièrement",
  e14.reason === "persisted" && chunkCount > 100,
  `${chunkCount} chunks, ${chars.toLocaleString("en-US")} caractères, ${e14ms} ms`,
);
console.log(
  `     → à titre de comparaison, le bloc de méthode compilé d'un tel coach\n` +
    `       pèse ~10 000 tokens (M1). Le corpus, lui, en fait ~${
      Math.round(chars / 4 / 1000)
    }k — c'est\n` +
    `       exactement pourquoi on RÉCUPÈRE dedans au lieu de l'injecter.`,
);

// ---------------------------------------------------------------------------
banner("BILAN");
const failed = results.filter((r) => !r.ok);
console.log(`  ${results.length - failed.length}/${results.length} vert`);
for (const f of failed) console.log(`  ❌ ${f.name} — ${f.detail}`);
console.log("");
if (failed.length > 0) Deno.exit(1);
