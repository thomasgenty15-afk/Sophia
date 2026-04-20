import { Loader2, Sparkles } from "lucide-react";

type FreeTextCaptureProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  clarificationPrompt?: string | null;
  introTitle?: string;
  introText?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
};

export function FreeTextCapture({
  value,
  onChange,
  onSubmit,
  isSubmitting,
  clarificationPrompt,
  introTitle = "Sophia écoute d'abord.",
  introText = "Écris comme tu parles. Il n'y a rien à formuler « correctement ».",
  title = "Qu'aimerais-tu changer ou améliorer en ce moment ?",
  description = "Plus ton texte est concret, plus la suite sera utile. Tu peux parler de ce qui bloque, de ce que tu voudrais retrouver, ou de ce que tu n'arrives plus à tenir.",
  submitLabel,
}: FreeTextCaptureProps) {
  const isDisabled = value.trim().length < 8 || isSubmitting;

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-8 overflow-hidden rounded-2xl border border-blue-100 bg-white p-5 shadow-sm md:p-8">
        <div className="mb-6 flex items-center gap-3 text-sm text-gray-600">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-gray-900">
              {introTitle}
            </p>
            <p>
              {introText}
            </p>
          </div>
        </div>

        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 sm:text-xs">
          Expression libre
        </p>
        <h1 className="mb-3 font-serif text-2xl font-bold leading-tight text-gray-900 md:text-4xl">
          {title}
        </h1>
        <p className="mb-6 max-w-2xl text-base leading-relaxed text-gray-600">
          {description}
        </p>

        {clarificationPrompt && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="mb-1 font-semibold">
              J'ai besoin d'un peu plus de matière.
            </p>
            <p>{clarificationPrompt}</p>
          </div>
        )}

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Exemple : Je me sens épuisé, je reporte tout, et j'ai l'impression de ne plus avancer dans ma vie pro..."
          className="min-h-[250px] w-full rounded-xl border border-gray-200 bg-gray-50 p-5 text-base leading-7 text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 md:min-h-[320px] md:text-lg"
        />

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-gray-500">
            Tu peux tout écrire d'un bloc. Sophia s'occupe de remettre de
            l'ordre.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 mt-6 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-[0_-8px_32px_rgba(15,23,42,0.06)] backdrop-blur">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isDisabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-base font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel ?? (clarificationPrompt ? "Réessayer" : "Continuer")}
        </button>
      </div>
    </section>
  );
}
