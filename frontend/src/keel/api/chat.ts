// KEEL — LA BULLE. Le client de la conversation in-app.
//
// ── CE QUI REMPLACE QUOI ─────────────────────────────────────────────────────
// `hooks/useChat.ts` parlait à `whatsapp-sim-inbound` avec un drapeau
// `whatsappSim` et attendait la réponse en RELISANT l'historique dix-huit fois
// à une seconde d'intervalle (`waitForAssistantDelivery`). C'était le seul
// moyen d'observer un message écrit par un autre processus, faute de temps
// réel. Ce fichier n'en garde rien : `chat_messages` est dans la publication
// `supabase_realtime` depuis la migration `20260804120000`, et un message écrit
// EST un message livré.
//
// ── LES DEUX RÈGLES DE CE FICHIER ────────────────────────────────────────────
// 1. L'ID DU MESSAGE EST CHOISI PAR LE CLIENT, ET IL EST STABLE PAR ENVOI.
//    C'est la clé d'idempotence côté serveur (`inbound_dedup`). Un retry réseau
//    doit réutiliser le MÊME id, sinon il crée un second tour de moteur — et
//    c'est exactement ce qui arrive quand on génère l'id dans la fonction
//    d'envoi au lieu de le générer une fois pour l'intention d'envoi.
// 2. RIEN N'EST AFFICHÉ COMME ENVOYÉ TANT QUE LA BASE NE L'A PAS RENDU.
//    L'écho optimiste porte un état, et la ligne réelle le remplace par son id
//    de base. Sans ça, deux onglets affichent des choses différentes et le
//    rechargement contredit l'écran (edge case n°1).

import { supabase } from "../../lib/supabase";
import { readMemoryLines } from "./memoryView";

/** Le scope du canal in-app. Doit correspondre à `CHAT_SCOPE` côté serveur. */
export const CHAT_SCOPE = "app";

export type ChatButton = { payload: string; label: string };

/**
 * La photo portée par un message, quand il y en a une.
 *
 * `path` est une clé de bucket PRIVÉ, pas une URL: `meal-photos` n'a aucune
 * policy (W1.4 R3), donc le navigateur ne peut pas la lire directement. C'est
 * `signMealPhotoUrls` qui échange ce chemin contre une URL signée courte.
 *
 * `previewUrl` n'existe que sur l'écho optimiste — un `URL.createObjectURL` sur
 * le fichier local, pour que l'élève voie SA photo à la seconde où il l'envoie
 * plutôt qu'après l'aller-retour serveur + vision (6 à 9 s).
 */
export type ChatMedia = {
  path: string;
  contentType: string | null;
  previewUrl?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  buttons: ChatButton[];
  /**
   * `true` quand Sophia a écrit SANS que l'élève ait parlé — le tap du soir,
   * le point du dimanche, la relance après un silence.
   *
   * Le serveur écrivait déjà `metadata.is_proactive` à chaque livraison
   * (`delivery.ts`) et PERSONNE ne le lisait: une relance arrivée seule à 21h
   * était rendue exactement comme une réponse, donc elle ressemblait à la
   * réponse à quelque chose que l'élève n'avait pas dit. Le champ existait, le
   * sens était perdu entre la base et l'œil.
   */
  proactive: boolean;
  /**
   * ⟳ 2026-09-05 — Les TEXTES que cette bulle a écrits en mémoire
   * (`metadata.keel_memory_lines`, posé par le serveur avec le bouton
   * « Voir »). La bulle les remet dans l'adresse de la carte, qui allume ces
   * lignes-là et pas toutes celles du jour. Absent quand la bulle n'en porte
   * pas: la carte retombe sur le jour.
   */
  memoryLines?: readonly string[];
  /** La photo de ce message, quand il en porte une. */
  media?: ChatMedia;
  /** `true` tant que le serveur n'a pas confirmé l'écriture. */
  pending?: boolean;
  /** Non nul quand l'envoi a échoué : la bulle propose de réessayer. */
  failed?: boolean;
  /** L'id client, conservé pour pouvoir réessayer À L'IDENTIQUE. */
  clientMessageId?: string;
};

type ChatMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

/**
 * La photo écrite par `meal-photo-upload-v1` sur la ligne de conversation.
 *
 * Elle voyageait déjà dans `metadata.media_ref` — la couture est en place
 * depuis le chantier de-whatsapp — et PERSONNE ne la lisait: l'élève voyait
 * « [photo] » en texte à la place de son assiette. Lire ici plutôt que dans la
 * page garantit que l'historique et le flux Realtime en font la même lecture.
 */
function readMedia(metadata: Record<string, unknown> | null): ChatMedia | null {
  const raw = metadata?.media_ref;
  if (!raw || typeof raw !== "object") return null;
  const ref = raw as Record<string, unknown>;
  const path = String(ref.path ?? "").trim();
  if (!path) return null;
  const contentType = String(ref.content_type ?? "").trim();
  return { path, contentType: contentType || null };
}

function readButtons(metadata: Record<string, unknown> | null): ChatButton[] {
  const raw = metadata?.buttons;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => {
      if (!b || typeof b !== "object") return null;
      const payload = String((b as Record<string, unknown>).payload ?? "").trim();
      const label = String((b as Record<string, unknown>).label ?? "").trim();
      return payload && label ? { payload, label } : null;
    })
    .filter((b): b is ChatButton => b !== null);
}

export function toChatMessage(row: ChatMessageRow): ChatMessage {
  // `client_message_id` REMONTE de la ligne réelle, et c'est ce qui permet à
  // l'écho optimiste d'être remplacé au lieu d'être doublé.
  //
  // MESURÉ AU NAVIGATEUR: sans cette ligne, le message tapé s'affichait DEUX
  // fois — une fois en écho, une fois en ligne réelle — et aucun test unitaire
  // ne pouvait le voir, parce que le doublon naît de la rencontre entre l'état
  // React et une livraison Realtime. C'est le pattern « 6 des 8 défauts n'étaient
  // visibles qu'à l'exécution » de ce dépôt, appliqué au front.
  const clientMessageId = String(row.metadata?.client_message_id ?? "").trim();
  const media = readMedia(row.metadata);
  const memoryLines = row.role === "assistant"
    ? readMemoryLines(row.metadata)
    : [];
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    createdAt: row.created_at,
    buttons: readButtons(row.metadata),
    // Un message de l'élève n'est jamais proactif, quoi qu'en dise la
    // metadata: le drapeau vient de la décision de livraison, qui ne concerne
    // que les sortants. Le lire sur un entrant serait lire un champ qui n'a
    // pas de sens de ce côté-là.
    proactive: row.role === "assistant" && row.metadata?.is_proactive === true,
    ...(memoryLines.length > 0 ? { memoryLines } : {}),
    ...(media ? { media } : {}),
    ...(clientMessageId ? { clientMessageId } : {}),
  };
}

/** Page d'historique, du plus ancien au plus récent. */
export async function loadChatHistory(opts?: {
  limit?: number;
  /** Charge ce qui est STRICTEMENT plus ancien que ce curseur (pagination). */
  before?: string | null;
}): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = opts?.limit ?? 30;
  let query = supabase
    .from("chat_messages")
    .select("id,role,content,created_at,metadata")
    .eq("scope", CHAT_SCOPE)
    .order("created_at", { ascending: false })
    // +1 pour savoir s'il reste quelque chose SANS faire un second appel.
    .limit(limit + 1);
  if (opts?.before) query = query.lt("created_at", opts.before);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ChatMessageRow[];
  const hasMore = rows.length > limit;
  return {
    messages: rows.slice(0, limit).reverse().map(toChatMessage),
    hasMore,
  };
}

export type SendPayload =
  | { kind: "text"; text: string }
  | { kind: "button"; payload: string; label: string }
  | { kind: "form"; response: Record<string, unknown>; token: string };

export type SendResult = {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
};

/**
 * Envoie un tour. `clientMessageId` est fourni par l'appelant EXPRÈS : c'est
 * lui qui rend un retry idempotent, et il doit donc survivre à l'échec.
 */
export async function sendChatMessage(
  clientMessageId: string,
  payload: SendPayload,
  opts?: { replyTo?: string | null },
): Promise<SendResult> {
  const body: Record<string, unknown> = {
    client_message_id: clientMessageId,
    kind: payload.kind,
    reply_to: opts?.replyTo ?? null,
  };
  if (payload.kind === "text") body.text = payload.text;
  if (payload.kind === "button") {
    body.button_payload = payload.payload;
    body.text = payload.label;
  }
  if (payload.kind === "form") {
    body.form_response = payload.response;
    body.form_token = payload.token;
  }

  const { data, error } = await supabase.functions.invoke("chat-inbound-v1", {
    body,
  });
  if (error) {
    return { ok: false, error: error.message ?? "send_failed" };
  }
  const result = (data ?? {}) as { ok?: boolean; duplicate?: boolean; error?: string };
  if (result.error) return { ok: false, error: result.error };
  return { ok: result.ok !== false, duplicate: result.duplicate === true };
}

// ── LA FUSION DE LISTE ──────────────────────────────────────────────────────
//
// Extraite de l'écran EXPRÈS: le doublon d'affichage naît de la rencontre entre
// un état React et une livraison Realtime, et il n'est donc reproductible dans
// un test QUE si la fusion est une fonction pure appelable sans DOM. La version
// enfouie dans le composant n'a été trouvée qu'au navigateur.

/**
 * Insère une ligne réelle dans la liste affichée.
 *
 * DEUX déduplications, et il en faut deux :
 *   1. par `clientMessageId` — la ligne réelle CHASSE son écho optimiste ;
 *   2. par `id` — deux livraisons Realtime du même INSERT (deux onglets, une
 *      reconnexion) ne doublent pas.
 * N'en faire qu'une laisse un doublon visible dans l'autre cas.
 */
/**
 * L'APERÇU LOCAL SURVIT À SON ÉCHO.
 *
 * La ligne réelle porte un CHEMIN de bucket, pas une URL — il faut encore la
 * faire signer (un aller-retour). L'écho, lui, portait déjà un `blob:` affiché
 * à l'écran. Sans ce report, la photo DISPARAÎT à la seconde où le serveur
 * confirme, puis revient une fraction de seconde plus tard: un clignotement
 * pile au moment où l'élève regarde son assiette.
 *
 * Même famille que le report de `clientMessageId`: ce que l'écho savait et que
 * la ligne réelle ignore doit traverser la fusion, sinon on régresse en
 * confirmant.
 */
function carryPreview(incoming: ChatMessage, echo: ChatMessage | undefined): ChatMessage {
  const preview = echo?.media?.previewUrl;
  if (!preview || !incoming.media || incoming.media.previewUrl) return incoming;
  return { ...incoming, media: { ...incoming.media, previewUrl: preview } };
}

export function mergeMessage(
  list: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  const echo = incoming.clientMessageId
    ? list.find((m) =>
      m.clientMessageId === incoming.clientMessageId && m.id !== incoming.id
    )
    : undefined;
  const withoutEcho = incoming.clientMessageId
    ? list.filter((m) =>
      !(m.clientMessageId === incoming.clientMessageId && m.id !== incoming.id)
    )
    : list;
  if (withoutEcho.some((m) => m.id === incoming.id)) return withoutEcho;
  const next = [...withoutEcho, carryPreview(incoming, echo)];
  next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return next;
}

/**
 * Fusionne une page d'historique fraîche avec ce qui est encore en vol.
 *
 * Un écho dont la ligne réelle est ARRIVÉE dans cette page doit disparaître ;
 * un écho dont la ligne n'est pas encore là doit SURVIVRE, sinon le message
 * qu'on vient de taper clignote à chaque reconnexion.
 */
export function mergeHistoryPage(
  previous: ChatMessage[],
  page: ChatMessage[],
): ChatMessage[] {
  const landed = new Set(
    page.map((m) => m.clientMessageId).filter(Boolean) as string[],
  );
  const inFlight = previous.filter((m) =>
    (m.pending || m.failed) &&
    !(m.clientMessageId && landed.has(m.clientMessageId))
  );
  // Même report que dans `mergeMessage`: c'est CE chemin que la photo emprunte
  // en pratique (`onPickPhoto` finit par un `refetch`), donc l'oublier ici
  // suffirait à faire clignoter chaque envoi.
  const echoes = new Map(
    previous
      .filter((m) => m.clientMessageId && m.media?.previewUrl)
      .map((m) => [m.clientMessageId as string, m]),
  );
  const merged = [
    ...page.map((m) =>
      m.clientMessageId ? carryPreview(m, echoes.get(m.clientMessageId)) : m
    ),
    ...inFlight,
  ];
  merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return merged;
}

// ── LES RÉGLAGES DE LA BULLE, ET L'ÉTAT DE LECTURE ──────────────────────────
//
// Deux colonnes de `profiles`, écrites par le propriétaire de la ligne:
//   * `proactive_muted_at` — l'ancien STOP, re-fondé en réglage produit. La
//     politique de livraison le respectait scrupuleusement depuis le chantier
//     de-whatsapp et AUCUN écran ne pouvait le poser: le seul chemin était un
//     UPDATE SQL. Une garde que l'utilisateur ne peut pas atteindre est une
//     garde qui n'existe pas pour lui.
//   * `chat_last_read_at` — l'ancre du compteur de non-lus (migration
//     `20260805160000`).
//
// Aucune RPC: la RLS `..._self` est déjà la frontière, et un aller-retour de
// plus par-dessus ne protégerait rien.

export type ChatSettings = {
  /** L'élève a coupé les relances proactives. Les réponses continuent. */
  muted: boolean;
  /** Dernière ouverture de la conversation. `null` = jamais ouverte. */
  lastReadAt: string | null;
  /**
   * `profiles.slot_meal_ask_enabled` — TRI-ÉTAT, BRUT.
   *
   * ⛔ ON NE RÉDUIT PAS ICI. `null` veut dire « personne n'a choisi », et c'est
   * l'OBJECTIF qui décide alors. Le réduire dans ce chargeur ferait une
   * deuxième écriture de la règle (`slotMealAskSwitchFrom` est la première), et
   * c'est celle qu'on relit le moins qui finirait par diverger.
   */
  slotMealAskEnabled: boolean | null;
  /**
   * L'objectif, pour la réduction ET pour savoir si l'interrupteur a lieu
   * d'être offert. `null` = pas de ligne `student_goals`, ce qui est le cas de
   * la majorité des comptes.
   */
  goal: string | null;
};

export async function loadChatSettings(userId: string): Promise<ChatSettings> {
  const { data, error } = await supabase
    .from("profiles")
    .select("proactive_muted_at,chat_last_read_at,slot_meal_ask_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as {
    proactive_muted_at?: string | null;
    chat_last_read_at?: string | null;
    slot_meal_ask_enabled?: boolean | null;
  };

  // ⚠️ UNE SECONDE LECTURE, ET ELLE NE FAIT PAS ÉCHOUER LA PREMIÈRE. Sans
  // objectif on ne sait pas si l'interrupteur a lieu d'être offert — mais un
  // échec ici ne doit pas faire disparaître le panneau de réglages entier. Il
  // rend `null`, l'interrupteur ne s'offre pas, et le reste marche.
  let goal: string | null = null;
  try {
    const g = await supabase
      .from("student_goals")
      .select("goal")
      .eq("user_id", userId)
      .maybeSingle();
    goal = String((g.data as { goal?: unknown } | null)?.goal ?? "").trim() ||
      null;
  } catch {
    goal = null;
  }

  return {
    muted: Boolean(row.proactive_muted_at),
    lastReadAt: row.chat_last_read_at ?? null,
    slotMealAskEnabled: row.slot_meal_ask_enabled === null ||
        row.slot_meal_ask_enabled === undefined
      ? null
      : Boolean(row.slot_meal_ask_enabled),
    goal,
  };
}

/**
 * Allume ou éteint la question par repas.
 *
 * ⛔ ON ÉCRIT UN BOOLÉEN EXPLICITE, JAMAIS `null`. `null` veut dire « personne
 * n'a choisi »; y revenir depuis l'écran effacerait le choix de la personne au
 * lieu de l'inverser. Les deux gestes de cet interrupteur sont `true` et
 * `false`, et rien d'autre.
 */
export async function setSlotMealAsk(
  userId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ slot_meal_ask_enabled: enabled })
    .eq("id", userId);
  if (error) throw error;
}

/**
 * Coupe ou rallume les relances.
 *
 * Le serveur lit la PRÉSENCE d'une date, pas un booléen: rallumer écrit `null`,
 * jamais `false`. Un booléen aurait perdu QUAND l'élève a coupé, et cette date
 * est ce qui rend l'arbitrage lisible plus tard.
 */
export async function setProactiveMuted(
  userId: string,
  muted: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ proactive_muted_at: muted ? new Date().toISOString() : null })
    .eq("id", userId);
  if (error) throw error;
}

/**
 * Combien de messages de Sophia depuis la dernière ouverture.
 *
 * `head: true` — on veut le nombre, pas les lignes. `sinceIso === null` compte
 * TOUT, ce qui est le sens exact de « jamais ouvert » (voir le backfill
 * asymétrique de la migration).
 */
export async function countUnreadAssistantMessages(
  sinceIso: string | null,
): Promise<number> {
  let query = supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("scope", CHAT_SCOPE)
    .eq("role", "assistant");
  if (sinceIso) query = query.gt("created_at", sinceIso);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Marque la conversation comme lue, et rend l'horodatage écrit.
 *
 * L'appelant DOIT réutiliser cette valeur comme nouvelle ancre plutôt que de
 * refabriquer un `new Date()` de son côté: entre les deux, un message peut être
 * arrivé, et il serait alors compté comme lu sans l'avoir été.
 */
export async function markChatRead(userId: string): Promise<string> {
  const atIso = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ chat_last_read_at: atIso })
    .eq("id", userId);
  if (error) throw error;
  return atIso;
}

export type ChatSubscription = { unsubscribe: () => void };

/**
 * S'abonne aux messages de l'élève.
 *
 * ── LE REFETCH À LA (RE)CONNEXION N'EST PAS UNE PRÉCAUTION, C'EST LE CONTRAT ──
 * Une souscription Realtime ne rejoue PAS ce qui s'est passé pendant la coupure.
 * Sans le `onResubscribed` ci-dessous, un message proactif écrit pendant que
 * l'onglet dormait n'apparaîtrait jamais — et l'écran serait faux sans jamais
 * l'être visiblement (edge case n°2). Le rappel est déclenché à CHAQUE passage
 * en `SUBSCRIBED`, y compris le premier : un abonnement et une reconnexion sont
 * la même chose vus d'ici.
 */
export function subscribeToChat(args: {
  userId: string;
  onMessage: (message: ChatMessage) => void;
  onResubscribed: () => void;
  onStatus?: (status: string) => void;
}): ChatSubscription {
  const channel = supabase
    .channel(`keel-chat-${args.userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        // Le filtre serveur réduit le bruit ; la RLS reste la vraie frontière.
        filter: `user_id=eq.${args.userId}`,
      },
      (payload) => {
        const row = payload.new as ChatMessageRow & { scope?: string };
        if (row?.scope !== CHAT_SCOPE) return;
        args.onMessage(toChatMessage(row));
      },
    )
    .subscribe((status) => {
      args.onStatus?.(status);
      if (status === "SUBSCRIBED") args.onResubscribed();
    });

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
