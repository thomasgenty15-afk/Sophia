import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Catches render-time exceptions so a crash in any page shows a recoverable
 * panel instead of a blank white screen (the app has no other error boundary,
 * so without this any thrown error blanks the whole SPA with no way out).
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface in the console so the crash is diagnosable instead of silent.
    console.error("Unhandled render error", error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-[#f7f6f2] px-4 py-8 text-stone-950 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl items-center">
          <section className="w-full overflow-hidden rounded-[28px] border border-stone-200 bg-white p-8 shadow-[0_28px_90px_-48px_rgba(31,41,55,0.55)]">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50">
              <AlertTriangle className="h-5 w-5 text-stone-700" />
            </div>
            <h1 className="mt-6 text-2xl font-semibold leading-tight text-stone-950">
              Une erreur est survenue
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              L’affichage a rencontré un problème. Rien n’a été perdu — recharge
              la page pour reprendre. Si le souci persiste, déconnecte-toi puis
              reconnecte-toi.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              <RotateCcw className="h-4 w-4" />
              Recharger la page
            </button>
          </section>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
