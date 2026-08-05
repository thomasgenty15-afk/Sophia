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
  loadChatSettings,
  mergeHistoryPage,
  mergeMessage,
  type SendPayload,
  sendChatMessage,
  setProactiveMuted,
  subscribeToChat,
} from "../api/chat";
import {
  holdConversationVisible,
  isDesktopNotificationOptIn,
  markConversationRead,
  notificationPermission,
  requestNotificationPermission,
  setDesktopNotificationOptIn,
  supportsDesktopNotifications,
} from "../lib/chatUnread";
import KeelAppShell from "../components/KeelAppShell";
import { Button } from "../components/ui/Button";
import WeeklyCheckInDialog, {
  type WeeklyCheckInValues,
} from "../components/WeeklyCheckInDialog";
import { isWeeklyCheckInToken } from "../api/weeklyCheckIn";
import {
  ACCEPTED_PHOTO_MIME_TYPES,
  MAX_PHOTO_BYTES,
  signMealPhotoUrls,
  uploadMealPhoto,
} from "../api/mealPhoto";
import { t } from "../i18n/t";

type Status = "connecting" | "live" | "offline";

/**
 * Le texte que le SERVEUR écrit sur une photo sans légende
 * (`meal-photo-upload-v1`, « une photo sans légende a quand même besoin d'un
 * texte lisible dans le journal »). Il existe pour le journal, pas pour l'œil:
 * l'afficher sous l'image reviendrait à légender une assiette par le mot
 * « photo ». Constante partagée plutôt que littéral dans le rendu — le jour où
 * le serveur change de marqueur, c'est ici qu'on le voit.
 */
const PHOTO_PLACEHOLDER = "[photo]";

/**
 * Un interrupteur de réglage, avec son explication.
 *
 * `role="switch"` + `aria-checked` plutôt qu'une case à cocher stylée: l'état
 * doit être annoncé, et un `div` cliquable ne l'est jamais. L'explication est
 * liée par `aria-describedby` — « Check-ins from Sophia, on » sans la phrase qui
 * dit ce que ça coupe est exactement le réglage qu'on actionne à contresens.
 */
function SettingSwitch({
  testId,
  label,
  help,
  checked,
  disabled,
  onToggle,
}: {
  testId: string;
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const helpId = `${testId}-help`;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p id={helpId} className="mt-0.5 text-xs text-gray-500">{help}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={helpId}
        data-testid={testId}
        disabled={disabled}
        onClick={onToggle}
        className={[
          "mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-gray-900" : "bg-gray-300",
          disabled ? "cursor-not-allowed opacity-50" : "",
        ].filter(Boolean).join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

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
  // chemin de bucket -> URL signée. `meal-photos` est privé et sans policy, donc
  // une photo ne s'affiche qu'après cet échange (voir `signMealPhotoUrls`).
  const [photoUrls, setPhotoUrls] = React.useState<Record<string, string>>({});
  // ── LES RÉGLAGES ──────────────────────────────────────────────────────────
  // `muted === null` = pas encore chargé. Distinct de `false`: afficher
  // « les relances sont actives » avant de le savoir, c'est promettre à
  // quelqu'un qui les a coupées qu'elles sont revenues.
  const [muted, setMuted] = React.useState<boolean | null>(null);
  const [notifyOptIn, setNotifyOptIn] = React.useState(false);
  const [notifyPermission, setNotifyPermission] = React.useState(
    notificationPermission(),
  );
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsBusy, setSettingsBusy] = React.useState(false);
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

  // ── « LU » EST UN GESTE, PAS UNE SUPPOSITION ───────────────────────────────
  // Tant que cet écran est monté ET l'onglet au premier plan, ce qui arrive est
  // lu à la seconde où ça s'affiche. Le compteur du shell doit donc le savoir:
  // sans `holdConversationVisible`, un message reçu la bulle ouverte ferait
  // monter un badge que l'élève ne peut faire retomber qu'en changeant de page.
  React.useEffect(() => holdConversationVisible(), []);

  React.useEffect(() => {
    if (!user?.id) return;
    // À l'ouverture, et à chaque retour sur l'onglet. Le second cas compte
    // autant que le premier: laisser la bulle ouverte dans un onglet de fond
    // est le comportement NORMAL, et sans l'écouteur ci-dessous l'élève
    // reviendrait sur une conversation lue avec un badge qui dit le contraire.
    void markConversationRead();
    const onVisible = () => {
      if (document.visibilityState === "visible") void markConversationRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.id]);

  React.useEffect(() => {
    if (!user?.id) return;
    const sub = subscribeToChat({
      userId: user.id,
      onMessage: (message) => {
        setMessages((prev) => mergeMessage(prev, message));
        if (message.role === "assistant") setThinking(false);
        // Il vient de s'afficher sous ses yeux. L'ancre avance, sinon le badge
        // se rallumerait au prochain changement d'écran.
        if (
          message.role === "assistant" &&
          document.visibilityState === "visible"
        ) {
          void markConversationRead();
        }
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

  // Les réglages, au chargement. Un échec est AVALÉ et laisse `muted` à `null`:
  // le bloc affiche alors son libellé neutre plutôt qu'un état inventé.
  React.useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await loadChatSettings(user.id);
        if (!cancelled) setMuted(settings.muted);
      } catch {
        // Voir ci-dessus.
      }
    })();
    setNotifyOptIn(isDesktopNotificationOptIn());
    return () => { cancelled = true; };
  }, [user?.id]);

  const toggleMuted = React.useCallback(async () => {
    if (!user?.id || muted === null || settingsBusy) return;
    const next = !muted;
    setSettingsBusy(true);
    // Optimiste, puis remis en place si l'écriture échoue: un interrupteur qui
    // ne bouge qu'après l'aller-retour donne l'impression de ne pas répondre.
    setMuted(next);
    try {
      await setProactiveMuted(user.id, next);
    } catch (err) {
      setMuted(!next);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingsBusy(false);
    }
  }, [user?.id, muted, settingsBusy]);

  // LA PERMISSION N'EST DEMANDÉE QUE SUR UN GESTE. Un `requestPermission()` au
  // montage est le motif que les navigateurs pénalisent et que les gens
  // refusent par réflexe — un refus est DÉFINITIF pour l'origine, donc demander
  // trop tôt ferme la porte pour de bon.
  const toggleNotifications = React.useCallback(async () => {
    if (notifyOptIn) {
      setDesktopNotificationOptIn(false);
      setNotifyOptIn(false);
      return;
    }
    let permission = notificationPermission();
    if (permission === "default") permission = await requestNotificationPermission();
    setNotifyPermission(permission);
    if (permission !== "granted") return;
    setDesktopNotificationOptIn(true);
    setNotifyOptIn(true);
  }, [notifyOptIn]);

  // ── LES URLS DES PHOTOS ────────────────────────────────────────────────────
  // Déclenché par l'arrivée de messages porteurs d'un chemin non encore signé:
  // le premier chargement, la pagination, et une photo qui revient par Realtime
  // passent donc tous par ici, sans code dédié pour chacun.
  //
  // Ne signe QUE ce qui manque. Sans ce filtre, chaque message reçu relancerait
  // la signature de toute la conversation — et comme l'effet écrit `photoUrls`,
  // il se redéclencherait lui-même.
  //
  // Un échec est AVALÉ, volontairement: une photo qu'on n'arrive pas à signer
  // laisse une bulle sans image, ce qui est vrai et lisible. Faire échouer la
  // conversation entière pour ça serait le mauvais arbitrage — c'est déjà la
  // règle du bandeau d'erreur, qui est réservé à l'envoi.
  React.useEffect(() => {
    const missing = [
      ...new Set(
        messages
          .map((m) => m.media?.path)
          .filter((p): p is string => Boolean(p) && !(p! in photoUrls)),
      ),
    ];
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const urls = await signMealPhotoUrls(missing);
        if (!cancelled && Object.keys(urls).length > 0) {
          setPhotoUrls((prev) => ({ ...prev, ...urls }));
        }
      } catch {
        // Voir ci-dessus: muet par conception.
      }
    })();
    return () => { cancelled = true; };
  }, [messages, photoUrls]);

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
        proactive: false,
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

  // ── LA PHOTO DE REPAS, DANS LA CONVERSATION ────────────────────────────────
  // Elle ne passe PAS par `chat-inbound-v1`: `meal-photo-upload-v1` est le seul
  // chemin qui touche le bucket (il n'existe aucune policy sur
  // `storage.objects`, W1), et c'est lui qui écrit la photo ET son accusé dans
  // la bulle. Un second chemin d'upload contournerait la vérification par
  // octets magiques et le calcul de la date locale côté serveur.
  const onPickPhoto = React.useCallback(
    async (file: File | null) => {
      if (!file || sending) return;
      const mime = file.type.toLowerCase();
      if (!(ACCEPTED_PHOTO_MIME_TYPES as readonly string[]).includes(mime)) {
        setError(t("chat.photo.error.type"));
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError(t("chat.photo.error.size"));
        return;
      }
      const clientMessageId = crypto.randomUUID();
      // L'APERÇU LOCAL, tout de suite. La chaîne complète — upload, vision,
      // accusé — prend 6 à 9 secondes; sans image pendant ce temps, l'élève
      // regarde une bulle grise et ne sait pas ce qu'il vient d'envoyer.
      // `URL.createObjectURL` n'attend rien: le fichier est déjà dans l'onglet.
      const previewUrl = URL.createObjectURL(file);
      setSending(true);
      setThinking(true);
      setError(null);
      setMessages((prev) => [...prev, {
        id: `pending-${clientMessageId}`,
        role: "user",
        content: t("chat.photo.sending"),
        createdAt: new Date().toISOString(),
        buttons: [],
        proactive: false,
        // `path` vide: cet écho n'a pas encore de chemin de bucket — il en aura
        // un quand la ligne réelle le chassera. Seul `previewUrl` s'affiche.
        media: { path: "", contentType: mime, previewUrl },
        pending: true,
        clientMessageId,
      }]);
      try {
        await uploadMealPhoto({
          file,
          slotKey: null,
          clientUploadId: clientMessageId,
          chatClientMessageId: clientMessageId,
        });
        await refetch();
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId
              ? { ...m, pending: false, failed: true }
              : m
          )
        );
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
        setThinking(false);
      }
    },
    [sending, refetch],
  );

  // Les `blob:` créés pour les aperçus sont relâchés au démontage. Un
  // `revokeObjectURL` posé plus tôt — à l'arrivée de la ligne réelle — ferait
  // clignoter la bulle: l'aperçu disparaîtrait avant que l'URL signée ne soit
  // revenue. On garde les deux le temps de l'écran, et on nettoie en sortant.
  const previewUrlsRef = React.useRef<Set<string>>(new Set());
  for (const m of messages) {
    if (m.media?.previewUrl) previewUrlsRef.current.add(m.media.previewUrl);
  }
  React.useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

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

        {/* LES RÉGLAGES DE LA BULLE — ici, et pas dans une page « compte ».
            Ce qu'ils gouvernent (quand Sophia écrit d'elle-même, et comment on
            l'apprend) ne se comprend qu'au-dessus de la conversation. Repliés
            par défaut: un interrupteur permanent au-dessus d'un fil de
            discussion invite à couper. */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            {t("chat.settings.toggle")}
          </Button>
        </div>

        {settingsOpen && (
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <SettingSwitch
              testId="setting-checkins"
              label={t("chat.settings.checkins.label")}
              help={t("chat.settings.checkins.help")}
              // `muted === null` = pas encore su. On le rend inactif plutôt que
              // de deviner: un interrupteur qui affiche le mauvais état pendant
              // une seconde est un interrupteur qu'on actionne à contresens.
              checked={muted === null ? false : !muted}
              disabled={muted === null || settingsBusy}
              onToggle={() => void toggleMuted()}
            />
            <SettingSwitch
              testId="setting-notifications"
              label={t("chat.settings.notify.label")}
              help={supportsDesktopNotifications()
                ? (notifyPermission === "denied"
                  ? t("chat.settings.notify.blocked")
                  : t("chat.settings.notify.help"))
                : t("chat.settings.notify.unsupported")}
              checked={notifyOptIn}
              disabled={!supportsDesktopNotifications() ||
                (notifyPermission === "denied" && !notifyOptIn)}
              onToggle={() => void toggleNotifications()}
            />
          </div>
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
                {/* CE MESSAGE N'EST PAS UNE RÉPONSE, ET ÇA SE VOIT.
                    Sans cette ligne, une relance arrivée seule à 21h était
                    rendue exactement comme une réponse — donc elle se lisait
                    comme la réponse à quelque chose que l'élève n'avait pas
                    dit. Le serveur écrivait `is_proactive` depuis le premier
                    jour du canal in-app et personne ne le lisait. */}
                {message.proactive && (
                  <p
                    data-testid="chat-proactive-label"
                    className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wide text-gray-400"
                  >
                    {t("chat.proactive.label")}
                  </p>
                )}
                {/* LA PHOTO, AU-DESSUS DE SON TEXTE. L'aperçu local gagne tant
                    qu'il existe: il est déjà à l'écran, et le remplacer par
                    l'URL signée ferait un rechargement visible pour la même
                    image. `alt` reste vide — c'est une image décorative de la
                    conversation, et son contenu est déjà décrit par l'accusé
                    de Sophia juste en dessous. */}
                {message.media
                  ? (() => {
                    const src = message.media.previewUrl ??
                      photoUrls[message.media.path];
                    if (!src) return null;
                    return (
                      <img
                        src={src}
                        alt=""
                        data-testid="chat-photo"
                        className={[
                          "mb-1 max-h-72 w-auto rounded-2xl object-cover",
                          message.pending ? "opacity-60" : "",
                        ].filter(Boolean).join(" ")}
                      />
                    );
                  })()
                  : null}
                {/* LE TEXTE, sauf quand il n'y en a pas.
                    `meal-photo-upload-v1` écrit `content: "[photo]"` quand
                    l'élève n'a pas mis de légende — c'est un marqueur pour que
                    le JOURNAL reste lisible, pas une phrase à afficher sous une
                    image qu'on voit déjà. Une légende, elle, s'affiche. */}
                {message.media && message.content.trim() === PHOTO_PLACEHOLDER
                  ? null
                  : (
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
                  )}
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
          <label
            className="inline-flex cursor-pointer items-center rounded-full border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            aria-label={t("chat.photo.label")}
          >
            {t("chat.photo.label")}
            <input
              type="file"
              accept={ACCEPTED_PHOTO_MIME_TYPES.join(",")}
              className="hidden"
              disabled={sending}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                // Le champ est remis à zéro pour que RE-choisir le même fichier
                // redéclenche `change`. Sans ça, un envoi raté ne peut pas être
                // réessayé avec la même photo.
                e.target.value = "";
                void onPickPhoto(file);
              }}
            />
          </label>
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
