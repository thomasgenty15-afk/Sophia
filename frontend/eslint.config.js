import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // `const { local_id: _localId, ...row } = c` est L'IDIOME du dépôt pour
      // retirer une clé d'un objet avant qu'il parte en base. Nommer la clé
      // écartée n'est pas facultatif: c'est la seule façon de l'omettre. Le
      // défaut du plugin est `ignoreRestSiblings: false`, il rendait donc une
      // erreur sur chaque clé volontairement jetée — et la seule « réparation »
      // possible aurait été de désarmer la règle par un commentaire, fichier
      // par fichier. L'option existe exactement pour ce cas.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
])
