// KEEL — CE QUI AVERTIT QU'UN MESSAGE EST ARRIVÉ.
//
// ── LE TROU QUE CE MODULE REFERME ────────────────────────────────────────────
// En sortant de WhatsApp, on a gardé le message et perdu l'avertissement. La
// livraison est devenue une écriture dans `chat_messages` + Realtime, ce qui
// est plus simple, plus fiable et gratuit — mais Realtime ne peint QUE l'onglet
// ouvert. Le tap du soir, le point du dimanche et la relance à 72 h partaient
// donc vers un écran que personne ne regardait, et la boucle « remarquer »
// (PLAN-NUIT §1.3) — celle pour laquelle le coach paie — reposait entièrement
// sur la chance que l'élève ait l'app ouverte au bon moment.
//
// ── POURQUOI UN STORE, ET PAS UN ÉTAT DE PAGE ────────────────────────────────
// Le badge vit dans la barre de nav, donc sur TOUTES les pages élève; le
// marquage « lu » se fait dans la conversation. Deux composants qui ne se
// contiennent pas doivent partager un fait: le nombre de messages non lus. Un
// contexte React aurait fait le travail, au prix d'un provider de plus autour
// d'un arbre qui n'en a aucun; un module avec des abonnés est plus petit et
// n'oblige aucun appelant à se déplacer.
//
// ── LA DÉCISION DE NOTIFIER EST PURE, EXPRÈS ─────────────────────────────────
// `shouldRaiseDesktopNotification` ne touche ni au DOM ni au réseau. C'est la
// règle du dépôt (`delivery_policy.ts` en est l'archétype côté serveur): une
// règle produit doit être lisible et testable sans son environnement. Ici ça
// compte double — la condition dépend de `document.hidden` et d'une permission
// navigateur, deux choses qu'un test n'a pas, et la version enfouie dans le
// gestionnaire d'événement n'aurait été éprouvée qu'à la main.

import { supabase } from "../../lib/supabase";
import {
  type ChatMessage,
  CHAT_SCOPE,
  countUnreadAssistantMessages,
  loadChatSettings,
  markChatRead,
  toChatMessage,
} from "../api/chat";

/**
 * Le réglage « notification système » est LOCAL, pas en base — et c'est une
 * différence de nature, pas un raccourci.
 *
 * `proactive_muted_at` gouverne ce que le SERVEUR envoie: il vaut pour l'élève,
 * partout, sur tous ses appareils. Une notification navigateur est accordée par
 * origine ET par appareil: la ranger en base promettrait qu'activer sur le
 * portable l'active sur le téléphone, ce que le navigateur n'accorde pas.
 */
const DESKTOP_NOTIFICATION_KEY = "keel.chat.desktop_notifications";

export type NotificationPermissionLike = "default" | "granted" | "denied";

export type DesktopNotificationInput = {
  /** Le message est-il arrivé sans que l'élève ait parlé ? */
  proactive: boolean;
  /** L'onglet est-il en arrière-plan ? Au premier plan, le badge suffit. */
  documentHidden: boolean;
  /** L'élève a-t-il demandé les notifications sur CET appareil ? */
  optedIn: boolean;
  permission: NotificationPermissionLike;
};

/**
 * Quatre conditions, toutes nécessaires.
 *
 * `proactive` est la première parce que c'est la seule qui porte du sens
 * produit: notifier une RÉPONSE serait notifier quelqu'un de ce qu'il vient de
 * demander. C'est le bruit qui apprend à ignorer les notifications, et donc ce
 * qui ferait rater la seule qui compte — la relance après un silence.
 */
export function shouldRaiseDesktopNotification(
  input: DesktopNotificationInput,
): boolean {
  if (!input.proactive) return false;
  if (!input.documentHidden) return false;
  if (!input.optedIn) return false;
  return input.permission === "granted";
}

/**
 * Le compteur après l'arrivée d'un message.
 *
 * Séparé du store pour la même raison que la fusion de liste l'est de l'écran:
 * le cas qui casse — un message qui arrive PENDANT que la conversation est
 * ouverte — n'est reproductible que si la règle est appelable sans React.
 *
 * `conversationVisible` veut dire « l'élève a la bulle sous les yeux ». Le
 * message est alors lu à la seconde où il s'affiche, et l'incrémenter
 * produirait un badge que rien ne peut faire retomber sans changer de page.
 */
export function nextUnreadCount(args: {
  current: number;
  message: Pick<ChatMessage, "role">;
  conversationVisible: boolean;
}): number {
  if (args.message.role !== "assistant") return args.current;
  if (args.conversationVisible) return args.current;
  return args.current + 1;
}

/** Le corps de la notification: le message, coupé net s'il est long. */
export function notificationBody(content: string, max = 120): string {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// ── LE STORE ────────────────────────────────────────────────────────────────

type Listener = (count: number) => void;

const listeners = new Set<Listener>();
let unread = 0;
let anchorIso: string | null = null;
let trackedUserId: string | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
/**
 * Vrai tant que la conversation est à l'écran. Posé par `ChatPage`.
 * Volontairement un compteur d'écrans montés plutôt qu'un booléen: en
 * navigation React, le nouvel écran se monte avant que l'ancien ne se démonte,
 * et un booléen se serait retrouvé à `false` alors que la bulle était visible.
 */
let visibleConversations = 0;

function emit(): void {
  for (const listener of listeners) listener(unread);
}

export function getUnreadCount(): number {
  return unread;
}

export function subscribeUnread(listener: Listener): () => void {
  listeners.add(listener);
  listener(unread);
  return () => {
    listeners.delete(listener);
  };
}

export function isDesktopNotificationOptIn(): boolean {
  try {
    return globalThis.localStorage?.getItem(DESKTOP_NOTIFICATION_KEY) === "1";
  } catch {
    // Stockage refusé (navigation privée stricte, cookies bloqués): pas d'opt-in,
    // et surtout pas d'exception qui casserait le rendu de la conversation.
    return false;
  }
}

export function setDesktopNotificationOptIn(value: boolean): void {
  try {
    if (value) globalThis.localStorage?.setItem(DESKTOP_NOTIFICATION_KEY, "1");
    else globalThis.localStorage?.removeItem(DESKTOP_NOTIFICATION_KEY);
  } catch {
    // Voir ci-dessus: le réglage ne survivra pas au rechargement, et c'est tout.
  }
}

export function notificationPermission(): NotificationPermissionLike {
  const ctor = (globalThis as { Notification?: { permission?: string } })
    .Notification;
  if (!ctor) return "denied";
  const value = String(ctor.permission ?? "default");
  return value === "granted" || value === "denied" ? value : "default";
}

/** `true` si le navigateur sait notifier — il y en a qui ne savent pas. */
export function supportsDesktopNotifications(): boolean {
  return Boolean((globalThis as { Notification?: unknown }).Notification);
}

export async function requestNotificationPermission(): Promise<
  NotificationPermissionLike
> {
  const ctor = (globalThis as {
    Notification?: { requestPermission?: () => Promise<string> };
  }).Notification;
  if (!ctor?.requestPermission) return "denied";
  try {
    const result = await ctor.requestPermission();
    return result === "granted" || result === "denied" ? result : "default";
  } catch {
    return "denied";
  }
}

function raiseNotification(message: ChatMessage, title: string): void {
  const Ctor = (globalThis as {
    Notification?: new (title: string, options?: unknown) => unknown;
  }).Notification;
  if (!Ctor) return;
  try {
    new Ctor(title, {
      body: notificationBody(message.content),
      // Une seule notification de conversation à l'écran: la suivante remplace
      // la précédente. Sans `tag`, trois relances de trois jours empilent trois
      // bannières que l'élève balaie une par une.
      tag: "keel-chat",
    });
  } catch {
    // Certains navigateurs refusent `new Notification` hors service worker
    // (Android/Chrome). L'échec est silencieux: le badge, lui, est déjà à jour.
  }
}

/**
 * Déclare que la conversation est (ou n'est plus) à l'écran.
 * Rend la fonction de retrait, pour un `useEffect` sans ambiguïté.
 */
export function holdConversationVisible(): () => void {
  visibleConversations += 1;
  return () => {
    visibleConversations = Math.max(0, visibleConversations - 1);
  };
}

export function isConversationVisible(): boolean {
  return visibleConversations > 0;
}

/**
 * Démarre le suivi pour un élève. Idempotent: rappeler avec le MÊME id ne
 * réabonne pas (un second canal du même nom fait taire le premier chez
 * supabase-js, et le badge cesserait de bouger sans rien signaler).
 */
export async function startUnreadTracking(
  userId: string,
  options?: { notificationTitle?: string },
): Promise<void> {
  if (!userId) return;
  if (trackedUserId === userId && channel) {
    await refreshUnread();
    return;
  }
  stopUnreadTracking();
  trackedUserId = userId;

  await refreshUnread();

  channel = supabase
    .channel(`keel-chat-unread-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `user_id=eq.${userId}`,
      },
      (payload: { new?: Record<string, unknown> }) => {
        const row = payload.new as
          | (Record<string, unknown> & { scope?: string })
          | undefined;
        if (!row || row.scope !== CHAT_SCOPE) return;
        const message = toChatMessage(row as never);
        const conversationVisible = isConversationVisible() &&
          !documentHidden();
        const next = nextUnreadCount({
          current: unread,
          message,
          conversationVisible,
        });
        if (next !== unread) {
          unread = next;
          emit();
        }
        if (
          shouldRaiseDesktopNotification({
            proactive: message.proactive,
            documentHidden: documentHidden(),
            optedIn: isDesktopNotificationOptIn(),
            permission: notificationPermission(),
          })
        ) {
          raiseNotification(message, options?.notificationTitle ?? "Sophia");
        }
      },
    )
    // Realtime ne rejoue rien pendant une coupure: la reconnexion doit
    // RECOMPTER, exactement comme la conversation doit re-télécharger sa page.
    .subscribe((status: string) => {
      if (status === "SUBSCRIBED") void refreshUnread();
    });
}

export function stopUnreadTracking(): void {
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  trackedUserId = null;
  unread = 0;
  anchorIso = null;
  emit();
}

function documentHidden(): boolean {
  const doc = (globalThis as { document?: { hidden?: boolean } }).document;
  if (!doc) return false;
  return doc.hidden === true;
}

/** Recompte depuis la base. Utilisé au démarrage et à chaque reconnexion. */
export async function refreshUnread(): Promise<void> {
  if (!trackedUserId) return;
  try {
    const settings = await loadChatSettings(trackedUserId);
    anchorIso = settings.lastReadAt;
    const count = await countUnreadAssistantMessages(anchorIso);
    if (count !== unread) {
      unread = count;
      emit();
    }
  } catch {
    // Un compteur illisible ne doit pas casser l'écran qui le porte. Le badge
    // garde sa dernière valeur connue — le côté sûr est de ne pas prétendre
    // « zéro », qui se lit « rien de neuf ».
  }
}

/**
 * L'élève a la conversation sous les yeux: tout est lu.
 *
 * L'ancre écrite est celle que le serveur a datée, pas un `new Date()` local:
 * entre les deux, un message peut arriver, et il serait compté lu sans l'avoir
 * été.
 */
export async function markConversationRead(): Promise<void> {
  if (!trackedUserId) return;
  try {
    anchorIso = await markChatRead(trackedUserId);
    if (unread !== 0) {
      unread = 0;
      emit();
    }
  } catch {
    // Idem: on ne casse pas la conversation pour un compteur.
  }
}
