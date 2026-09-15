import React from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

import { t } from '../keel/i18n/t';

/**
 * /email-verified — le retour du lien de confirmation d'e-mail.
 *
 * ⚠️ CET ÉCRAN EST SUR LE CHEMIN HEUREUX, PAS DANS UN COIN. `Auth.tsx` le
 * nomme en `emailRedirectTo` à l'inscription coach: c'est la page qui dit à
 * quelqu'un que son compte existe vraiment. Il portait cinq phrases en dur et
 * pas un seul `t()`, donc un coach qui s'inscrivait en français — drapeau sur
 * FR, e-mail de confirmation français — atterrissait sur le seul écran anglais
 * de son inscription.
 *
 * Il vit sous le namespace `auth`, avec le reste de la porte, et la route est
 * déclarée dans `PAGE_NAMESPACES`: sans la déclaration, `uiLocaleForPath`
 * l'aurait rendu en anglais quoi qu'on traduise, et sans l'extraction la
 * déclaration n'aurait rien traduit. Les deux gestes ne valent qu'ensemble.
 */
export default function EmailVerified() {
  const location = useLocation();
  const hasCode = new URLSearchParams(location.search).has('code');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center animate-fade-in-up">
        <div className="mx-auto w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-emerald-200 mb-8 transform transition-transform hover:scale-105 duration-300">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
          {t('auth.verified.title')}
        </h1>
        <p className="text-lg text-slate-600 mb-10 max-w-md mx-auto leading-relaxed">
          {t('auth.verified.body')}
          <br />
          <span className="font-medium text-slate-900">
            {t('auth.verified.back_to_tab')}
          </span>{' '}
          {t('auth.verified.carry_on')}
        </p>

        {/*
          Deux phrases, parce qu'il y a deux situations. Avec `?code`, la
          session a déjà été échangée dans l'onglet d'origine et celui-ci ne
          sert plus à rien; sans, on ne peut que supposer que le lien vient
          d'être cliqué. Une seule phrase affirmerait dans un cas ce qu'on ne
          sait que dans l'autre.
        */}
        <p className="text-xs text-slate-400 mt-8 font-medium">
          {hasCode
            ? t('auth.verified.close_tab')
            : t('auth.verified.close_tab_maybe')}
        </p>
      </div>
    </div>
  );
}
