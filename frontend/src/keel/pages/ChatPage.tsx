// KEEL — LA BULLE, l'écran.
//
// C'est la conversation avec Sophia, et depuis le chantier de-whatsapp c'est LE
// canal, plus un simulateur. Elle vit sous `/app/chat` avec son entrée de nav :
// une route sans lien est une fonctionnalité que personne n'a (voir l'en-tête
// de `KeelAppShell`).

import React from "react";
import { useAuth } from "../../context/AuthContext";
import {
  type ChatMessage,
  loadChatHistory,
  mergeHistoryPage,
  mergeMessage,
  type SendPayload,
  sendChatMessage,
  subscribeToChat,
} from "../api/chat";
import KeelAppShell from "../components/KeelAppShell";
import { Button } from "../components/ui/Button";
import WeeklyCheckInDialog, {
  type WeeklyCheckInValues,
} from "../components/WeeklyCheckInDialog";
import { isWeeklyCheckInToken } from "../api/weeklyCheckIn";
import { t } from "../i18n/t";

type Status = "connecting" | "live" | "offline";

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [status, setStatus] = React.useState<Status>("connecting");
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Le jeton de la semaine dont le formulaire est ouvert, ou null. Il ne porte
  // QUE la semaine: l'élève est identifié par son JWT, côté serveur.
  const [weeklyToken, setWeeklyToken] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const refetch = React.useCallback(async () => {
    try {
      const page = await loadChatHistory({ limit: 30 });
      setHasMore(page.hasMore);
      setMessages((prev) => mergeHistoryPage(prev, page.messages));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  React.useEffect(() => {
    if (!user?.id) return;
    const sub = subscribeToChat({
      userId: user.id,
      onMessage: (message) => {
        setMessages((prev) => mergeMessage(prev, message));
        if (message.role === "assistant") setThinking(false);
      },
      // Premier abonnement ET reconnexion: le même geste. Realtime ne rejoue
      // pas ce qui s'est passé pendant la coupure.
      onResubscribed: () => {
        setStatus("live");
        void refetch();
      },
      onStatus: (s) => {
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("offline");
        }
      },
    });
    return () => sub.unsubscribe();
  }, [user?.id, refetch]);

  // Repli par sondage quand le temps réel est tombé. Volontairement lent : ce
  // n'est pas un second chemin de livraison, c'est un filet.
  React.useEffect(() => {
    if (status !== "offline") return;
    const timer = setInterval(() => void refetch(), 15_000);
    return () => clearInterval(timer);
  }, [status, refetch]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thinking]);

  const send = React.useCallback(
    async (payload: SendPayload, echo: string) => {
      if (sending) return;
      const clientMessageId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      setSending(true);
      setThinking(true);
      setError(null);
      setMessages((prev) => [...prev, {
        id: `pending-${clientMessageId}`,
        role: "user",
        content: echo,
        createdAt: nowIso,
        buttons: [],
        pending: true,
        clientMessageId,
      }]);

      const result = await sendChatMessage(clientMessageId, payload);
      setSending(false);
      if (!result.ok) {
        setThinking(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId
              ? { ...m, pending: false, failed: true }
              : m
          )
        );
        setError(result.error ?? t("chat.error.send"));
        return;
      }
      // La ligne réelle arrive par Realtime et remplace l'écho. Un refetch
      // couvre le cas où l'abonnement était tombé au moment de l'envoi.
      await refetch();
    },
    [sending, refetch],
  );

  // Un bouton de point hebdo n'ENVOIE rien: il OUVRE le formulaire. C'est la
  // seule catégorie de bouton qui ne va pas droit au serveur, et elle est
  // reconnue par la FORME de son payload — pas par le libellé, qui est de
  // l'affichage et peut être traduit.
  const onButton = React.useCallback(
    (payload: string, label: string) => {
      if (isWeeklyCheckInToken(payload)) {
        setWeeklyToken(payload);
        return;
      }
      void send({ kind: "button", payload, label }, label);
    },
    [send],
  );

  const submitWeekly = React.useCallback(
    (values: WeeklyCheckInValues) => {
      const token = weeklyToken;
      if (!token) return;
      setWeeklyToken(null);
      void send(
        { kind: "form", response: values, token },
        t("chat.weekly.title"),
      );
    },
    [weeklyToken, send],
  );

  const onSubmit = (event: React.FormEvent) => {
    // `preventDefault` D'ABORD, avant la moindre condition de sortie.
    //
    // MESURÉ AU NAVIGATEUR: avec le `return` d'un brouillon vide placé AVANT,
    // le formulaire partait en soumission NATIVE — c'est-à-dire un GET sur la
    // page, donc un rechargement complet. Symptôme observé: le message tapé
    // disparaissait, le champ se vidait, aucune requête ne partait, et
    // l'historique se rechargeait comme si de rien n'était. Un envoi
    // silencieusement perdu, indiscernable d'un envoi jamais tenté.
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send({ kind: "text", text }, text);
  };

  const loadOlder = async () => {
    const oldest = messages.find((m) => !m.pending && !m.failed);
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const page = await loadChatHistory({ limit: 30, before: oldest.createdAt });
      setHasMore(page.hasMore);
      setMessages((prev) => [...page.messages, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  // Seul le DERNIER message assistant porte des boutons actifs. Répondre à une
  // question armée plus ancienne en remontant le fil ne doit pas la réactiver :
  // la plus récente gagne (edge case n°3, règle héritée des templates).
  const lastAssistantId = [...messages].reverse().find((m) =>
    m.role === "assistant" && m.buttons.length > 0
  )?.id ?? null;

  return (
    <KeelAppShell
      variant="student"
      title={t("chat.title")}
      subtitle={t("chat.subtitle")}
    >
      <div className="flex flex-col gap-3">
        {status === "offline" && (
          <p
            role="status"
            className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {t("chat.status.offline")}
          </p>
        )}

        <div
          className="flex max-h-[60vh] min-h-[40vh] flex-col gap-3 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4"
          data-testid="chat-log"
        >
          {hasMore && (
            <div className="flex justify-center">
              <Button size="sm" onClick={loadOlder} disabled={loadingMore}>
                {loadingMore ? t("chat.history.loading") : t("chat.history.more")}
              </Button>
            </div>
          )}

          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">
              {t("chat.empty")}
            </p>
          )}

          {messages.map((message) => (
            <div
              key={message.clientMessageId ?? message.id}
              className={message.role === "user"
                ? "flex justify-end"
                : "flex justify-start"}
            >
              <div className="max-w-[85%]">
                <div
                  data-role={message.role}
                  className={[
                    "whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                    message.role === "user"
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-900",
                    message.pending ? "opacity-60" : "",
                    message.failed ? "ring-1 ring-red-300" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {message.content}
                </div>
                {message.failed && (
                  <p className="mt-1 text-xs text-red-600">
                    {t("chat.error.send")}
                  </p>
                )}
                {message.buttons.length > 0 && message.id === lastAssistantId && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.buttons.map((button) => (
                      <Button
                        key={button.payload}
                        size="sm"
                        disabled={sending}
                        onClick={() => onButton(button.payload, button.label)}
                      >
                        {button.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <p className="text-sm text-gray-400" data-testid="chat-thinking">
              {t("chat.thinking")}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {weeklyToken && (
          <WeeklyCheckInDialog
            busy={sending}
            onSubmit={submitWeekly}
            onCancel={() => setWeeklyToken(null)}
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("chat.input.placeholder")}
            aria-label={t("chat.input.placeholder")}
            className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={sending || !draft.trim()}>
            {t("chat.send")}
          </Button>
        </form>
      </div>
    </KeelAppShell>
  );
}
