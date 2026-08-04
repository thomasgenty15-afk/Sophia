import { CheckCircle2, MessageCircle } from "lucide-react";

type PlanSavedModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function PlanSavedModal(
  { open, onClose }: PlanSavedModalProps,
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
        {/* DE-WHATSAPP — le bloc « réponds à Sophia sur WhatsApp » est mort.
            Il portait un deep link `wa.me` avec une réponse pré-remplie, et il
            existait parce que sans opt-in Meta, Sophia ne pouvait pas écrire.
            La conversation vit maintenant dans l'app: il n'y a plus de porte
            à ouvrir, seulement un écran à rejoindre. */}
        <a
          href="/app/chat"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--action-green)] px-5 py-4 text-base font-semibold text-white shadow-md transition hover:bg-[#014232]"
        >
          <MessageCircle className="h-5 w-5" />
          Ouvrir la conversation
        </a>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-500 transition hover:bg-stone-50"
          >
            Ok
          </button>
        </div>
      </div>
    </div>
  );
}
