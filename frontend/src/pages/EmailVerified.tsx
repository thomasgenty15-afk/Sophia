import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function EmailVerified() {
  const location = useLocation();
  const hasCode = new URLSearchParams(location.search).has('code');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center animate-fade-in-up">
        <div className="mx-auto w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-emerald-200 mb-8 transform transition-transform hover:scale-105 duration-300">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">Email confirmé !</h1>
        <p className="text-lg text-slate-600 mb-10 max-w-md mx-auto leading-relaxed">
          Merci d’avoir pris le temps de confirmer ton adresse.
          <br />
          <span className="font-medium text-slate-900">Tu peux maintenant retourner sur l’onglet d’origine</span> pour continuer ton parcours.
        </p>

        <div className="space-y-4 max-w-xs mx-auto">
          <Link
            to="/"
            className="w-full inline-flex justify-center py-4 px-6 rounded-2xl shadow-lg shadow-indigo-200 text-base font-bold text-white bg-slate-900 hover:bg-indigo-600 hover:shadow-indigo-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all items-center gap-2 group"
          >
            Retourner à l'accueil <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link to="/auth" className="block text-center text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors py-2">
            Ou me connecter directement
          </Link>
        </div>

        <p className="text-xs text-slate-400 mt-12 font-medium">
          {hasCode
            ? "Tu peux fermer cet onglet."
            : "Si tu viens de cliquer sur le lien, tu peux fermer cet onglet."}
        </p>
      </div>
    </div>
  );
}


