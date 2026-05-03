import { useNavigate } from "react-router-dom";
import SEO from "../components/SEO";
import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";
import { ArrowRight, Check, Leaf, MessageCircle, Shield, Sparkles, X } from "lucide-react";

const Formules = () => {
  const navigate = useNavigate();
  const { startSession } = useOnboardingAmbientAudio();
  const seoDescription =
    "Consulte les tarifs de Sophia, le coach IA personnel sur WhatsApp : essai gratuit, plan clair, soutien proactif et option Architecte.";

  const handleStartOnboarding = () => {
    startSession();
    navigate("/onboarding-v2");
  };

  const plans = [
    {
      name: "Le Plan",
      price: "9,90€",
      intro: "Pour clarifier ton changement et suivre une direction simple.",
      featured: false,
      items: ["Plan IA clair", "Actions prioritaires", "Suivi dans l'app"],
      missing: ["Sophia sur WhatsApp", "Architecte"],
    },
    {
      name: "L'Alliance",
      price: "19,90€",
      intro: "Le coeur de Sophia : ton plan + ton coach IA sur WhatsApp.",
      featured: true,
      items: ["Tout ce qu'il y a dans Le Plan", "Sophia sur WhatsApp", "Présence proactive", "Soutien sans culpabilisation"],
      missing: ["Architecte"],
    },
    {
      name: "L'Architecte",
      price: "29,90€",
      intro: "Pour ajouter un travail plus profond sur ton identité.",
      featured: false,
      items: ["Tout ce qu'il y a dans L'Alliance", "Messages illimités", "Travail sur l'identité", "Déconstruction des blocages"],
      missing: [],
    },
  ];

  return (
    <div className="min-h-screen bg-[#fbf7ef] text-[#17211d] font-sans selection:bg-[#cfe8d7] selection:text-[#17211d]">
      <SEO
        title="Tarifs du coach IA WhatsApp"
        description={seoDescription}
        canonical="https://sophia-coach.ai/formules"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Formules Sophia Coach",
          url: "https://sophia-coach.ai/formules",
          description: seoDescription,
          inLanguage: "fr-FR",
        }}
      />

      <nav className="fixed top-0 z-50 w-full border-b border-white/30 bg-[#fffaf1]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-bold tracking-tight md:text-xl">Sophia</span>
          </button>
          <div className="flex items-center gap-4 md:gap-8">
            <div className="hidden gap-6 text-sm font-semibold text-[#52635b] md:flex">
              <button onClick={() => navigate("/le-plan")} className="hover:text-[#17211d]">Le Plan</button>
              <button onClick={() => navigate("/l-architecte")} className="hover:text-[#17211d]">L'Architecte</button>
              <button className="text-[#002d21]">Offres</button>
              <button onClick={() => navigate("/legal")} className="hover:text-[#17211d]">Légal</button>
            </div>
            <button
              onClick={handleStartOnboarding}
              className="rounded-full bg-[#17211d] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#31453b]/18 transition-colors hover:bg-[#002d21] md:px-5 md:py-2.5 md:text-sm"
            >
              Essai gratuit
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 text-sm font-semibold text-[#52635b] md:hidden">
          <button onClick={() => navigate("/le-plan")} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Le Plan</button>
          <button onClick={() => navigate("/l-architecte")} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Architecte</button>
          <button className="shrink-0 rounded-full bg-[#e3f1e6] px-4 py-2 text-[#002d21]">Offres</button>
          <button onClick={() => navigate("/legal")} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Légal</button>
        </div>
      </nav>

      <main className="pt-32 md:pt-36">
        <section className="relative overflow-hidden px-4 pb-16 pt-8 text-center md:px-6 md:pb-24">
          <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[linear-gradient(130deg,#f7d8bb_0%,#e9eedc_34%,#c6e5db_66%,#c5d9f1_100%)] opacity-80" />
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/36 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#002d21] shadow-sm backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" />
              14 jours pour ressentir la différence
            </div>
            <h1 className="text-5xl font-bold leading-[0.95] tracking-tight md:text-7xl">
              Commence gratuitement.
              <span className="block text-[#002d21]">Choisis ensuite le bon niveau.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#405148] md:text-2xl md:leading-10">
              Pendant 14 jours, tu peux tester Sophia : plan clair, soutien sur WhatsApp et premières briques de l'Architecte. Sans engagement.
            </p>
          </div>
        </section>

        <section className="px-4 pb-20 md:px-6 md:pb-28">
          <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3 md:items-start">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={
                  plan.featured
                    ? "relative rounded-[2rem] bg-[#002d21] p-7 text-white shadow-2xl shadow-[#7f917f]/28 md:-translate-y-4"
                    : "rounded-[2rem] border border-[#eadfce] bg-white/66 p-7 shadow-sm backdrop-blur"
                }
              >
                {plan.featured && (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d1ded4] px-4 py-1 text-xs font-bold uppercase tracking-wide text-[#17211d]">
                    Le plus naturel
                  </div>
                )}
                <h2 className="text-2xl font-bold">{plan.name}</h2>
                <p className={plan.featured ? "mt-3 min-h-[72px] text-sm leading-6 text-white/66" : "mt-3 min-h-[72px] text-sm leading-6 text-[#52635b]"}>
                  {plan.intro}
                </p>
                <div className="mt-7">
                  <span className="text-5xl font-bold">{plan.price}</span>
                  <span className={plan.featured ? "text-white/50" : "text-[#6f8178]"}>/mois</span>
                </div>
                <button
                  onClick={handleStartOnboarding}
                  className={
                    plan.featured
                      ? "mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#d1ded4] px-5 py-4 font-bold text-[#17211d] transition-colors hover:bg-white"
                      : "mt-7 flex w-full items-center justify-center gap-2 rounded-full border border-[#d7cbb9] bg-white/70 px-5 py-4 font-bold text-[#17211d] transition-colors hover:bg-[#e3f1e6]"
                  }
                >
                  Commencer
                  <ArrowRight className="h-4 w-4" />
                </button>
                <div className="mt-7 space-y-4">
                  {plan.items.map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      {item.includes("WhatsApp") ? (
                        <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#70d099]" />
                      ) : item.includes("Soutien") ? (
                        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#70d099]" />
                      ) : (
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#70d099]" />
                      )}
                      <span className={plan.featured ? "text-sm text-white/82" : "text-sm text-[#405148]"}>{item}</span>
                    </div>
                  ))}
                  {plan.missing.map((item) => (
                    <div key={item} className="flex items-start gap-3 opacity-45">
                      <X className="mt-0.5 h-5 w-5 shrink-0" />
                      <span className="text-sm line-through">{item}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-[#f4eee4] px-4 py-20 md:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-bold tracking-tight md:text-5xl">Questions fréquentes</h2>
            <div className="mt-12 space-y-5">
              {[
                ["Comment fonctionne l'essai gratuit ?", "Tu accèdes à Sophia pendant 14 jours. À la fin, tu choisis si tu veux continuer."],
                ["Pourquoi Sophia est différente de ChatGPT ?", "ChatGPT attend que tu viennes. Sophia garde ton plan en tête et revient vers toi sur WhatsApp quand ton changement a besoin de soutien."],
                ["Est-ce que je peux changer d'offre ?", "Oui. Tu peux commencer simplement, puis passer à l'Alliance ou à l'Architecte quand tu veux aller plus loin."],
              ].map(([question, answer]) => (
                <div key={question} className="rounded-3xl bg-[#fffaf1] p-6 shadow-sm">
                  <Leaf className="mb-4 h-5 w-5 text-[#002d21]" />
                  <h3 className="font-bold">{question}</h3>
                  <p className="mt-2 leading-7 text-[#52635b]">{answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Formules;
