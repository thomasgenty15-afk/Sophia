import { BarChart3, LayoutDashboard, Loader2, ShieldAlert, Terminal } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ADMIN_LINKS = [
  {
    href: "/admin/usage",
    label: "Usage & Costs",
    description: "Suivi des tokens, des couts et de la consommation par source.",
    icon: BarChart3,
  },
  {
    href: "/admin/production-log",
    label: "Production log",
    description: "Journal de production agrege pour le web, WhatsApp, Stripe et les Edge Functions.",
    icon: Terminal,
  },
] as const;

export default function AdminDashboard() {
  const { user, loading, isAdmin } = useAuth();

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900/50 border border-neutral-800 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-neutral-800 rounded-xl flex items-center justify-center mx-auto mb-4">
            <LayoutDashboard className="w-6 h-6 text-neutral-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Sophia Admin</h1>
          <p className="text-neutral-400 mb-6">Acces restreint au personnel autorise uniquement.</p>
          <a
            href="/auth?redirect=/admin"
            className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white font-medium rounded-xl transition-colors"
          >
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-red-950/20 border border-red-900/50 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-red-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-red-200 mb-2">Acces refuse</h1>
          <p className="text-red-400/80 mb-4 text-sm">
            Votre compte n&apos;a pas les privileges administrateur requis.
          </p>
          <div className="text-xs text-neutral-500 bg-neutral-900/50 p-2 rounded border border-neutral-800 break-all">
            {user.email}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur border-b border-neutral-800">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center border border-indigo-500/20">
            <LayoutDashboard className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h1 className="font-semibold text-white leading-none">Sophia Admin</h1>
            <p className="text-xs text-neutral-500 mt-1 font-mono">SYS.ADMIN</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <section className="bg-neutral-900/30 border border-neutral-800 rounded-2xl p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-neutral-500 mb-3">Status</p>
          <h2 className="text-2xl font-semibold text-white mb-3">Les outils d&apos;eval ont ete retires du produit.</h2>
          <p className="text-neutral-400 max-w-3xl">
            Les routes et fonctions liees a `run-evals` et `simulate-user` ont ete supprimees.
            Cette page sert desormais de point d&apos;entree pour les autres outils d&apos;administration encore actifs.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ADMIN_LINKS.map(({ href, label, description, icon: Icon }) => (
            <a
              key={href}
              href={href}
              className="group bg-neutral-900/30 border border-neutral-800 rounded-2xl p-6 hover:border-neutral-700 hover:bg-neutral-900/50 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{label}</h3>
              <p className="text-sm text-neutral-400">{description}</p>
            </a>
          ))}
        </section>
      </main>
    </div>
  );
}
