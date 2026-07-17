import { CheckCircle2, MessageCircle } from "lucide-react";

// Sophia's WhatsApp number (digits only, no "+"), used for the wa.me deep link.
// Mirrors DEFAULT_WHATSAPP_NUMBER in whatsapp-webhook.
const WHATSAPP_NUMBER =
  (import.meta.env.VITE_WHATSAPP_NUMBER ?? "33674637278").trim();

// Pre-filled reply to the opt-in template Sophia already sent. "Absolument !"
// is recognized as an opt-in yes by the webhook; wa.me pre-fills it in the
// user's composer, editable, and they still press send themselves.
const OPTIN_REPLY_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${
  encodeURIComponent("Absolument !")
}`;

type PlanSavedModalProps = {
  open: boolean;
  whatsappOptedIn: boolean;
  onClose: () => void;
};

export default function PlanSavedModal(
  { open, whatsappOptedIn, onClose }: PlanSavedModalProps,
) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-emerald-200 bg-white p-6 shadow-[0_28px_90px_-36px_rgba(15,23,42,0.5)]">
        <div className="flex items-start gap-4">
          <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[var(--action-green)]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--action-green)]">
              Plan enregistré
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-950">
              Ton plan est prêt
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Le plan est enregistré. Sophia va t'accompagner pour le réaliser.
              Passe à la prochaine transformation lorsque celle-ci est terminée.
            </p>
          </div>
        </div>
        {!whatsappOptedIn
          ? (
            <div className="mt-5 rounded-2xl border-2 border-[#25D366] bg-[#25D366]/10 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#128C7E]">
                ⚠️ Dernière étape — indispensable
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">
                Sophia t'a envoyé un message sur WhatsApp. Réponds-lui pour
                qu'elle puisse t'accompagner — sans ça, elle ne peut pas
                t'écrire.
              </p>
              <a
                href={OPTIN_REPLY_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-4 text-base font-bold text-white shadow-md transition hover:bg-[#1EBE5A]"
              >
                <MessageCircle className="h-5 w-5" />
                Répondre à Sophia sur WhatsApp
              </a>
              <p className="mt-2 text-center text-xs text-stone-500">
                Ta réponse est pré-remplie — tu peux la modifier avant d'envoyer.
              </p>
            </div>
          )
          : null}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={!whatsappOptedIn
              ? "inline-flex items-center rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-500 transition hover:bg-stone-50"
              : "inline-flex items-center rounded-xl bg-[var(--action-green)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#014232]"}
          >
            {!whatsappOptedIn ? "Plus tard" : "Ok"}
          </button>
        </div>
      </div>
    </div>
  );
}
