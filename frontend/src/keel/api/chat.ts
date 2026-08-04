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

/** Le scope du canal in-app. Doit correspondre à `CHAT_SCOPE` côté serveur. */
export const CHAT_SCOPE = "app";

export type ChatButton = { payload: string; label: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  buttons: ChatButton[];
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
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    createdAt: row.created_at,
    buttons: readButtons(row.metadata),
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
export function mergeMessage(
  list: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  const withoutEcho = incoming.clientMessageId
    ? list.filter((m) =>
      !(m.clientMessageId === incoming.clientMessageId && m.id !== incoming.id)
    )
    : list;
  if (withoutEcho.some((m) => m.id === incoming.id)) return withoutEcho;
  const next = [...withoutEcho, incoming];
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
  const merged = [...page, ...inFlight];
  merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return merged;
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
