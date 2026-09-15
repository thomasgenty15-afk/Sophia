/**
 * LE CORPUS D'UN DOCUMENT DU COACH — découpage et ancrage, purs.
 * ===========================================================================
 *
 * Autorité: docs/keel/MODEL.md, et l'en-tête de `doctrine_document.ts`.
 *
 * ── LE TROU QUE CE MODULE FERME ─────────────────────────────────────────
 * `compile_document` lit un PDF de cent pages, en tire une trentaine
 * d'entrées, et **jette le document**. Il n'est stocké nulle part: ni bucket,
 * ni table, ni texte. Ce qui n'a pas été extrait au premier passage n'est pas
 * « perdu pour ce brouillon », il est perdu, point — la seule façon de le
 * retrouver est de redemander le fichier au coach.
 *
 * Trois choses en dépendent, et aucune n'est théorique:
 *   1. le coach ne peut pas voir ce qui a été IGNORÉ de son document, donc il
 *      ne peut pas juger l'extraction, donc il la croit ou il la rejette en
 *      bloc;
 *   2. une meilleure extraction, plus tard, ne peut pas être rejouée: elle
 *      exige un geste du coach qu'il ne refera pas;
 *   3. la mesure M1 (`docs/nutrition-pivot/qa-web/M1-block-budget.txt`) dit
 *      que le bloc compilé passe ~10k tokens dès le premier ebook, injectés à
 *      chaque tour. Le jour où il faut RÉCUPÉRER au lieu de tout injecter, il
 *      faut un corpus à récupérer. Il n'y en a pas.
 *
 * Ce module est la moitié pure de la réparation: découper, et ancrer. La
 * lecture du PDF, le bucket et les écritures sont dans `document_corpus_io.ts`,
 * pour la raison habituelle ici — la décision est testable, l'I/O non.
 *
 * ⚠️ CE MODULE NE PRODUIT AUCUNE MÉTHODE. Un chunk n'est pas une entrée de
 * doctrine, ne porte aucune clé de conviction, et rien en aval ne le lit pour
 * composer quoi que ce soit. Le chemin vers l'élève passe UNIQUEMENT par
 * `coach_doctrines`, et il commence par un clic du coach.
 */

/**
 * La taille d'un chunk, en caractères.
 *
 * Ce n'est pas un réglage de récupération — il n'y a pas encore de
 * récupération. C'est une taille de STOCKAGE choisie pour rester utilisable
 * telle quelle: assez grande pour qu'un chunk contienne l'argument complet
 * d'un paragraphe (une citation coupée en deux ne s'ancre dans aucun des deux
 * morceaux), assez petite pour qu'afficher « d'où ça vient » ne déverse pas
 * une page entière sur l'écran du coach.
 */
export const CHUNK_MAX_CHARS = 1200;

export interface DocumentChunk {
  /** Ordre global dans le document, 0-based. Stable, c'est la clé de tri. */
  readonly ordinal: number;
  /** La page d'où il vient, 1-based. Un chunk ne traverse JAMAIS une page. */
  readonly pageNumber: number;
  readonly text: string;
}

/**
 * Nettoie le texte d'une page tel que le rend un extracteur PDF.
 *
 * Trois choses, et la troisième est la seule qui compte pour l'ancrage:
 *   1. les fins de ligne sont normalisées;
 *   2. les espaces répétés sont repliés — une extraction PDF en produit des
 *      colonnes entières (justification, tabulations de mise en page);
 *   3. les retours à la ligne SIMPLES deviennent des espaces, les doubles
 *      restent. Un PDF coupe ses lignes à la largeur de la colonne, pas aux
 *      phrases: sans ce repli, une citation de deux lignes ne se retrouve
 *      jamais dans le texte, parce qu'elle contient un `\n` que le modèle,
 *      lui, n'a pas recopié.
 */
export function normalizePageText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    // Les ligatures et césures de fin de ligne: « nutri-\ntion » -> « nutrition ».
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?<!\n)\n(?!\n)/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

/**
 * Découpe des pages en chunks ordonnés.
 *
 * ── UN CHUNK NE TRAVERSE PAS UNE PAGE, ET C'EST LA SEULE RÈGLE DURE ─────
 * Un chunk à cheval sur deux pages n'a pas de numéro de page. Or le numéro de
 * page est TOUT ce que la citation apporte au coach: « c'est écrit p. 42 » se
 * vérifie en dix secondes, « c'est écrit quelque part » ne se vérifie pas.
 * Fusionner deux pages courtes pour équilibrer les tailles échangerait la
 * seule propriété utile contre une statistique plus jolie.
 *
 * Les pages sans texte ne produisent AUCUN chunk (et pas un chunk vide): une
 * page de photo dans un ebook est une page réelle, pas une donnée manquante.
 */
export function chunkPages(
  pages: readonly unknown[],
  maxChars: number = CHUNK_MAX_CHARS,
): DocumentChunk[] {
  const cap = Math.max(1, Math.floor(maxChars));
  const out: DocumentChunk[] = [];
  let ordinal = 0;

  for (const [index, rawPage] of pages.entries()) {
    const pageNumber = index + 1;
    const text = normalizePageText(rawPage);
    if (!text) continue;

    for (const piece of splitToCap(text, cap)) {
      out.push({ ordinal, pageNumber, text: piece });
      ordinal++;
    }
  }
  return out;
}

/**
 * Coupe un texte en morceaux d'au plus `cap` caractères.
 *
 * L'ordre des frontières essayées est un ordre de PRÉFÉRENCE, pas une
 * optimisation: paragraphe, puis phrase, puis espace, puis coupe franche. Un
 * texte sans aucune de ces frontières existe (une table des matières, une
 * langue sans espaces) et doit se découper quand même — un `while` qui ne
 * trouve pas de frontière et ne progresse pas est une boucle infinie sur le
 * fichier d'un coach.
 */
function splitToCap(text: string, cap: number): string[] {
  if (text.length <= cap) return [text];

  const out: string[] = [];
  let rest = text;
  while (rest.length > cap) {
    const window = rest.slice(0, cap);
    const cut = lastIndexOfAny(window, ["\n\n"]) ??
      lastIndexOfAny(window, [". ", "! ", "? ", "; ", ".\n"]) ??
      lastIndexOfAny(window, [" "]) ??
      cap;
    // Une frontière trop précoce (< 40 % du cap) ferait des chunks minuscules
    // sur un texte à ponctuation dense; on préfère alors la coupe franche.
    const at = cut < Math.floor(cap * 0.4) ? cap : cut;
    const head = rest.slice(0, at).trim();
    if (head) out.push(head);
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** L'index APRÈS la dernière occurrence d'un des séparateurs, ou `null`. */
function lastIndexOfAny(window: string, seps: readonly string[]): number | null {
  let best = -1;
  for (const sep of seps) {
    const i = window.lastIndexOf(sep);
    if (i > best) best = i + sep.length;
  }
  return best > 0 ? best : null;
}

/**
 * La forme sous laquelle deux textes se comparent.
 *
 * Même famille que `foldTerm` (doctrine_document.ts), mais PAS la même
 * fonction et délibérément: `foldTerm` déduplique des noms d'aliments courts,
 * celle-ci cherche une phrase dans une page. Elle garde donc les chiffres et
 * replie tout le reste — un modèle qui recopie une citation change les
 * guillemets typographiques, les tirets, les espaces insécables, et parfois la
 * casse. Comparer les caractères bruts ferait échouer l'ancrage sur des
 * citations parfaitement exactes.
 */
export function foldForSearch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Retrouve le chunk qui contient cette citation.
 *
 * ── POURQUOI ÇA COMPTE PLUS QUE « SAVOIR LA PAGE » ──────────────────────
 * Une citation est censée être COPIÉE du document (le prompt le dit trois
 * fois, la base la refuse vide). Une citation introuvable dans le texte du
 * document est donc l'un des deux cas suivants, et les deux méritent d'être
 * su: le modèle a paraphrasé, ou il a inventé. C'est la seule vérification
 * automatique possible de la garde « pas de citation, pas d'entrée » — sans
 * elle, la garde vérifie qu'une chaîne est non vide, pas qu'elle vient du
 * document.
 *
 * ⚠️ NE JAMAIS interpréter un `null` comme une accusation quand le document
 * n'a PAS de couche texte (PDF scanné): il n'y a alors rien à chercher, et
 * tout serait « introuvable ». L'appelant ne tente l'ancrage que sur un
 * document dont l'extraction a réussi — c'est pour ça que `text_status` existe.
 *
 * Le repli sur les 12 premiers mots attrape le cas courant: le modèle cite
 * juste, puis tronque ou recolle la fin d'une phrase.
 */
export function locateQuote(
  quote: unknown,
  chunks: readonly DocumentChunk[],
): DocumentChunk | null {
  const needle = foldForSearch(quote);
  if (!needle) return null;

  for (const chunk of chunks) {
    if (foldForSearch(chunk.text).includes(needle)) return chunk;
  }

  const words = needle.split(" ").filter(Boolean);
  if (words.length < 6) return null;
  const prefix = words.slice(0, 12).join(" ");
  for (const chunk of chunks) {
    if (foldForSearch(chunk.text).includes(prefix)) return chunk;
  }
  return null;
}

// ---------------------------------------------------------------------------
// LES CITATIONS
// ---------------------------------------------------------------------------

/**
 * Ce qu'une citation vise. Un jeton par section de doctrine, plus `food` pour
 * les propositions d'aliments (qui vivent, elles, dans `coach_food_proposals`).
 */
export const CITATION_KINDS = [
  "belief",
  "forbidden",
  "vocabulary",
  "arbitration",
  "qa",
  "food",
] as const;
export type CitationKind = (typeof CITATION_KINDS)[number];

export interface ExtractedCitation {
  readonly kind: CitationKind;
  /** La clé naturelle de l'entrée citée — voir `citationEntryKey`. */
  readonly entryKey: string;
  /** La phrase du document, telle que le modèle l'a rendue. */
  readonly quote: string;
}

/** Le plafond de `coach_document_citations.entry_key` (CHECK en base). */
export const CITATION_ENTRY_KEY_MAX_CHARS = 200;
/** Le plafond de `coach_document_citations.quote` (CHECK en base). */
export const CITATION_QUOTE_MAX_CHARS = 400;

/**
 * La clé qui relie une citation à l'entrée qu'elle justifie.
 *
 * ── POURQUOI PAS UN INDEX, ET POURQUOI PAS UN UUID ──────────────────────
 * Au moment de l'extraction, l'entrée n'existe nulle part: le brouillon n'est
 * PAS enregistré (« l'IA transcrit, n'écrit jamais »), le coach va le relire,
 * le corriger, en supprimer. Un index de tableau serait faux dès la première
 * suppression; un uuid désignerait une ligne qui n'existera peut-être jamais.
 *
 * La clé est donc le TEXTE de l'entrée, replié. Conséquence assumée et qui est
 * la bonne: si le coach réécrit la phrase, la clé change et la citation
 * n'apparaît plus en face. C'est exact — ce n'est plus la phrase du document.
 */
export function citationEntryKey(raw: unknown): string {
  return foldForSearch(raw).slice(0, CITATION_ENTRY_KEY_MAX_CHARS).trim();
}

/**
 * Borne une citation à ce que la base accepte.
 *
 * Tronquée plutôt que jetée, exactement comme `parseDocumentExtraction` le
 * fait déjà des citations d'aliments: une citation trop longue reste
 * utilisable pour décider.
 */
export function boundQuote(raw: unknown): string {
  const quote = String(raw ?? "").trim();
  if (quote.length <= CITATION_QUOTE_MAX_CHARS) return quote;
  return `${quote.slice(0, CITATION_QUOTE_MAX_CHARS - 3)}...`;
}

/**
 * Déduplique des citations sur `(kind, entryKey)`.
 *
 * L'index unique de la base l'exige, mais ce n'est pas la raison: un modèle
 * qui cite deux fois la même conviction rendrait, sans ça, une écriture par
 * lot qui échoue ENTIÈREMENT sur un doublon — et un document parfaitement
 * lisible ne produirait aucun corpus. La première citation gagne.
 */
export function dedupeCitations(
  citations: readonly ExtractedCitation[],
): ExtractedCitation[] {
  const seen = new Set<string>();
  const out: ExtractedCitation[] = [];
  for (const c of citations) {
    if (!c.entryKey || !c.quote) continue;
    const key = `${c.kind} ${c.entryKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
