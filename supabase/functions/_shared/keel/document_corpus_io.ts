/**
 * LE CORPUS D'UN DOCUMENT DU COACH — la coquille d'I/O.
 * ===========================================================================
 *
 * La moitié impure de `document_corpus.ts`: lire le texte du PDF, déposer
 * l'original, écrire le document, ses chunks et ses citations. Séparée pour la
 * raison habituelle ici — la décision est pure et testable, la lecture ne
 * l'est pas.
 *
 * ── L'ARBITRAGE DE PANNE, ET IL EST DUR ─────────────────────────────────
 * RIEN DANS CE MODULE NE DOIT COÛTER SON EXTRACTION AU COACH.
 *
 * Le coach vient d'attendre deux minutes qu'un modèle lise cent pages. Le
 * corpus est un BÉNÉFICE SECONDAIRE de ce passage: il sert à ce qu'on puisse
 * relire le document plus tard, pas à produire le brouillon qu'il attend. Un
 * `throw` ici — bucket plein, PDF chiffré, insertion en conflit — lui rendrait
 * une erreur alors que son brouillon est prêt, et il redéposerait le fichier
 * pour obtenir exactement le même échec.
 *
 * Donc: `persistDocumentCorpus` ne lance jamais. Elle rend un compte rendu
 * NOMMÉ, que l'appelant journalise. Un « ça a raté » silencieux serait pire
 * que l'exception (cicatrice `as-cast-on-foreign-type-disarms-typecheck`: un
 * catch muet qui rend `null` comme un succès), donc chaque branche a son nom.
 */

import {
  boundQuote,
  chunkPages,
  type DocumentChunk,
  dedupeCitations,
  type ExtractedCitation,
  locateQuote,
} from "./document_corpus.ts";

/** Le bucket privé du dépôt source du coach — voir 20260727130000_keel_storage.sql. */
export const COACH_DOCUMENT_BUCKET = "plan-documents";

export type DocumentTextStatus = "extracted" | "no_text_layer" | "extraction_failed";

export interface ExtractedPdfText {
  status: DocumentTextStatus;
  /** Le texte page par page. Vide sauf sur `extracted`. */
  pages: string[];
  /** Renseigné sur `extraction_failed` seulement. */
  error?: string;
}

/**
 * Lit la couche texte d'un PDF, page par page.
 *
 * ── POURQUOI `unpdf` ET PAS `pdf-lib` ───────────────────────────────────
 * `pdf-lib` (déjà utilisé ici pour COMPTER les pages) ne sait pas extraire de
 * texte: il manipule la structure du document, pas son contenu rendu. `unpdf`
 * embarque une construction de pdf.js faite pour les runtimes sans DOM, ce qui
 * est exactement le nôtre.
 *
 * ── UN PDF SANS TEXTE N'EST PAS UNE PANNE ───────────────────────────────
 * Un ebook exporté en images, un scan: `getPageCount` réussit, l'extraction
 * rend des pages vides. C'est un FAIT sur le document, pas un incident, et les
 * confondre enverrait le coach chercher un bug qui n'existe pas. Le modèle,
 * lui, a très bien lu ce document — il le voit, il ne le lit pas comme du
 * texte. Ses citations resteront donc non ancrées, et c'est correct.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdfText> {
  try {
    // Import dynamique, comme `pdf-lib` dans `coach-doctrine-v1`: aucune autre
    // fonction n'a à payer le chargement de pdf.js au démarrage.
    const { extractText, getDocumentProxy } = await import("npm:unpdf@0.12.1");
    const proxy = await getDocumentProxy(bytes);
    const { text } = await extractText(proxy, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [String(text ?? "")]).map((p) => String(p ?? ""));
    const anyText = pages.some((p) => p.trim().length > 0);
    return anyText ? { status: "extracted", pages } : { status: "no_text_layer", pages: [] };
  } catch (error) {
    return {
      status: "extraction_failed",
      pages: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** L'empreinte du fichier — la clé d'idempotence d'un re-dépôt. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface PersistCorpusInput {
  readonly coachId: string;
  /** `coaches.user_id` — le PREMIER segment du chemin de stockage. Jamais `coaches.id`. */
  readonly coachUserId: string;
  readonly fileName: string | null;
  readonly bytes: Uint8Array;
  readonly pageCount: number;
  readonly contentLocale: string;
  readonly citations: readonly ExtractedCitation[];
}

export interface PersistCorpusResult {
  /** `null` quand rien n'a pu être écrit. */
  documentId: string | null;
  /** Nommé, jamais générique — c'est ce qui part au journal. */
  reason:
    | "persisted"
    | "already_known"
    | "document_write_failed"
    | "chunks_write_failed"
    | "no_coach";
  textStatus: DocumentTextStatus;
  chunksWritten: number;
  citationsWritten: number;
  /** Combien de citations n'ont PAS été retrouvées dans le texte du document. */
  citationsUnlocated: number;
  storagePath: string | null;
  /** Ce qui a mal tourné sans faire échouer le lot. Journalisé, jamais rendu au coach. */
  warnings: string[];
}

/**
 * Écrit le document, son texte découpé, et ses citations ancrées.
 *
 * L'ORDRE DES ÉCRITURES PORTE UNE DÉCISION: la ligne `coach_documents` part en
 * premier, AVANT le dépôt du fichier. On veut l'id pour nommer l'objet, et
 * surtout on veut que le texte survive à un bucket en panne — c'est le texte
 * qui sert, l'original est un confort. L'inverse (fichier d'abord) laisserait
 * des objets orphelins qu'aucune purge ne connaît.
 */
export async function persistDocumentCorpus(
  db: unknown,
  input: PersistCorpusInput,
): Promise<PersistCorpusResult> {
  const warnings: string[] = [];
  const fail = (
    reason: PersistCorpusResult["reason"],
    textStatus: DocumentTextStatus,
    documentId: string | null = null,
  ): PersistCorpusResult => ({
    documentId,
    reason,
    textStatus,
    chunksWritten: 0,
    citationsWritten: 0,
    citationsUnlocated: 0,
    storagePath: null,
    warnings,
  });

  const coachId = String(input.coachId ?? "").trim();
  if (!coachId) return fail("no_coach", "extraction_failed");

  // deno-lint-ignore no-explicit-any
  const client = db as any;

  // ── L'ORDRE EST UNE CORRECTION, PAS UNE PRÉFÉRENCE ──────────────────────
  // pdf.js TRANSFÈRE le buffer qu'on lui donne: après extraction, l'original
  // est DÉTACHÉ. Toute lecture ultérieure des mêmes octets échoue —
  // « Cannot perform Construct on a detached ArrayBuffer » — et comme ce
  // module ne lance jamais, ça se serait vu comme « le corpus n'a pas été
  // écrit », sans cause lisible. Mesuré en run réel le 2026-08-06.
  // Deux gardes, parce qu'une seule se perdrait au prochain déplacement de
  // ligne: l'empreinte est calculée AVANT, et l'extracteur reçoit une COPIE
  // (les octets originaux servent encore au dépôt du fichier, plus bas).
  let contentSha: string;
  try {
    contentSha = await sha256Hex(input.bytes);
  } catch (error) {
    warnings.push(`sha256 failed: ${error instanceof Error ? error.message : String(error)}`);
    return fail("document_write_failed", "extraction_failed");
  }

  const extracted = await extractPdfText(input.bytes.slice());
  if (extracted.error) warnings.push(`text extraction failed: ${extracted.error}`);
  const chunks = extracted.status === "extracted" ? chunkPages(extracted.pages) : [];
  // ⚠️ Un PDF dont TOUTES les pages sont sous le seuil de contenu utile rendrait
  // `extracted` avec zéro chunk, ce que le CHECK `..._text_status_matches_
  // content` refuse. On redescend l'état plutôt que de faire échouer la ligne:
  // « pas de couche texte exploitable » est vrai, et c'est la même conséquence.
  const textStatus: DocumentTextStatus = extracted.status === "extracted" && chunks.length === 0
    ? "no_text_layer"
    : extracted.status;
  const textChars = chunks.reduce((n, c) => n + c.text.length, 0);

  // ── LA LIGNE DOCUMENT ───────────────────────────────────────────────────
  const row = {
    coach_id: coachId,
    filename: (input.fileName ?? "").trim().slice(0, 200) || null,
    byte_size: input.bytes.byteLength,
    page_count: Math.max(1, Math.floor(input.pageCount)),
    content_locale: String(input.contentLocale ?? "en").trim() || "en",
    content_sha256: contentSha,
    text_status: textStatus,
    text_chars: textChars,
    chunk_count: chunks.length,
  };

  let documentId: string | null = null;
  let alreadyKnown = false;
  try {
    const inserted = await client
      .from("coach_documents")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (inserted?.error) {
      // Le re-dépôt du MÊME fichier: l'index unique (coach_id, content_sha256)
      // le refuse, et c'est ce qu'on veut. On récupère la ligne existante
      // plutôt que d'échouer — le coach a le droit de redéposer son ebook.
      const existing = await client
        .from("coach_documents")
        .select("id, text_status")
        .eq("coach_id", coachId)
        .eq("content_sha256", contentSha)
        .maybeSingle();
      if (existing?.error || !existing?.data?.id) {
        warnings.push(`document insert failed: ${String(inserted.error.message ?? inserted.error)}`);
        return fail("document_write_failed", textStatus);
      }
      documentId = String(existing.data.id);
      alreadyKnown = true;
      // Un premier passage qui n'avait pas de texte et un second qui en a: on
      // remplace. L'inverse (on avait le texte, on ne l'a plus) ne se produit
      // pas pour un contenu identique, et si ça arrivait ce serait une
      // régression d'extracteur — on ne détruit pas un corpus sur ce doute.
      if (String(existing.data.text_status ?? "") !== "extracted" && textStatus === "extracted") {
        alreadyKnown = false;
        await client.from("coach_document_chunks").delete().eq("document_id", documentId);
        const patched = await client
          .from("coach_documents")
          .update({ text_status: textStatus, text_chars: textChars, chunk_count: chunks.length })
          .eq("id", documentId);
        if (patched?.error) warnings.push(`document patch failed: ${patched.error.message}`);
      }
    } else {
      documentId = String(inserted?.data?.id ?? "") || null;
    }
  } catch (error) {
    warnings.push(`document write threw: ${error instanceof Error ? error.message : String(error)}`);
    return fail("document_write_failed", textStatus);
  }
  if (!documentId) return fail("document_write_failed", textStatus);

  // ── LE FICHIER ──────────────────────────────────────────────────────────
  // Convention de chemin porteuse (20260727130000): `<auth user id>/…`. Les
  // deux routines RGPD s'y accrochent; un chemin qui ne commence pas par l'id
  // du propriétaire est invisible à l'export et survit à la purge.
  let storagePath: string | null = null;
  const ownerId = String(input.coachUserId ?? "").trim();
  if (!ownerId) {
    warnings.push("no coach user id: source file not stored (RGPD path convention)");
  } else if (!alreadyKnown) {
    const path = `${ownerId}/doctrine/${documentId}.pdf`;
    try {
      const up = await client.storage.from(COACH_DOCUMENT_BUCKET).upload(path, input.bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (up?.error) {
        warnings.push(`source file not stored: ${String(up.error.message ?? up.error)}`);
      } else {
        storagePath = path;
        const patched = await client
          .from("coach_documents")
          .update({ storage_path: path })
          .eq("id", documentId);
        if (patched?.error) warnings.push(`storage_path not recorded: ${patched.error.message}`);
      }
    } catch (error) {
      warnings.push(
        `source file upload threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ── LES CHUNKS ──────────────────────────────────────────────────────────
  let chunksWritten = 0;
  if (chunks.length > 0 && !alreadyKnown) {
    const payload = chunks.map((c) => ({
      document_id: documentId,
      coach_id: coachId,
      ordinal: c.ordinal,
      page_number: c.pageNumber,
      // Le CHECK borne à 4000; `chunkPages` borne déjà bien en dessous, mais
      // une borne de base qui n'est pas respectée par l'écrivain est une ligne
      // perdue sur un document réel, pas un test qui rougit.
      text: c.text.slice(0, 4000),
      char_count: Math.min(c.text.length, 4000),
    }));
    try {
      const res = await client.from("coach_document_chunks").insert(payload);
      if (res?.error) {
        warnings.push(`chunks insert failed: ${String(res.error.message ?? res.error)}`);
        return {
          ...fail("chunks_write_failed", textStatus, documentId),
          storagePath,
        };
      }
      chunksWritten = payload.length;
    } catch (error) {
      warnings.push(
        `chunks insert threw: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ...fail("chunks_write_failed", textStatus, documentId), storagePath };
    }
  }

  // ── LES CITATIONS ───────────────────────────────────────────────────────
  // Elles s'écrivent MÊME si le corpus est vide (document scanné): la citation
  // reste la phrase que le coach lira à côté de l'entrée. Elle est simplement
  // non ancrée, et `text_status` dit pourquoi sans accuser le modèle.
  //
  // ── UN DOCUMENT DÉJÀ CONNU N'EN REÇOIT AUCUNE, ET C'EST MESURÉ ─────────
  // Deux lectures du MÊME PDF ne rendent pas exactement les mêmes entrées: le
  // modèle en formule une autrement, et sa clé naturelle change. Écrire quand
  // même faisait grossir la liste à chaque re-dépôt (mesuré: +1 citation au
  // second passage, 2026-08-06) avec des citations qui ne correspondent à
  // AUCUNE entrée du brouillon courant. Le geste le plus fréquent d'un coach
  // qui a vu un timeout deviendrait une accumulation silencieuse.
  // Le document est le même; sa lecture de référence est la première.
  const storedChunks: DocumentChunk[] = chunks;
  const wanted = alreadyKnown ? [] : dedupeCitations(
    input.citations.map((c) => ({ ...c, quote: boundQuote(c.quote) })),
  );
  let citationsWritten = 0;
  let citationsUnlocated = 0;
  if (wanted.length > 0) {
    // L'ancrage n'est TENTÉ que si on a du texte. Sur un document sans couche
    // texte, tout serait « introuvable » et on transformerait une propriété du
    // fichier en soupçon sur le modèle.
    const canLocate = textStatus === "extracted" && storedChunks.length > 0;
    let chunkIds: Map<number, string> = new Map();
    if (canLocate) {
      try {
        const res = await client
          .from("coach_document_chunks")
          .select("id, ordinal")
          .eq("document_id", documentId);
        if (res?.error) throw new Error(String(res.error.message ?? res.error));
        chunkIds = new Map(
          ((res?.data ?? []) as { id: string; ordinal: number }[])
            .map((r) => [Number(r.ordinal), String(r.id)] as const),
        );
      } catch (error) {
        warnings.push(
          `chunk ids unreadable, citations stored unanchored: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const payload = wanted.map((c) => {
      const hit = canLocate ? locateQuote(c.quote, storedChunks) : null;
      const chunkId = hit ? chunkIds.get(hit.ordinal) ?? null : null;
      if (canLocate && !hit) citationsUnlocated++;
      return {
        coach_id: coachId,
        document_id: documentId,
        chunk_id: chunkId,
        entry_kind: c.kind,
        entry_key: c.entryKey,
        quote: c.quote,
        // La page suit le chunk RETROUVÉ, jamais le chunk demandé: une page
        // sans chunk_id serait une localisation qu'on ne peut pas rouvrir.
        page_number: chunkId ? hit!.pageNumber : null,
      };
    });

    try {
      // `upsert` avec `ignoreDuplicates`: un re-dépôt du même document ne doit
      // pas faire échouer TOUT le lot sur la contrainte d'unicité — la
      // première citation gagne, comme le dit `dedupeCitations`.
      const res = await client
        .from("coach_document_citations")
        .upsert(payload, {
          onConflict: "document_id,entry_kind,entry_key",
          ignoreDuplicates: true,
        })
        .select("id");
      if (res?.error) {
        warnings.push(`citations insert failed: ${String(res.error.message ?? res.error)}`);
      } else {
        citationsWritten = Array.isArray(res?.data) ? res.data.length : payload.length;
      }
    } catch (error) {
      warnings.push(
        `citations insert threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    documentId,
    reason: alreadyKnown ? "already_known" : "persisted",
    textStatus,
    chunksWritten,
    citationsWritten,
    citationsUnlocated,
    storagePath,
    warnings,
  };
}
