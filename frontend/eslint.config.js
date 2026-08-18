import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'

export default [
  // public/ holds vendored assets (tesseract worker etc.), not our code.
  { ignores: ['dist', 'public'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // `<Button />` is a *use* of `Button`, but core ESLint cannot see that —
      // only this rule marks JSX-referenced identifiers as read. Without it the
      // unused-vars check has to be told to ignore every capitalised name
      // (the Vite template's `varsIgnorePattern: '^[A-Z_]'`), which exempts
      // essentially every component import and lets dead ones pile up unseen.
      'react/jsx-uses-vars': 'error',
      // `const { [field]: _, ...rest } = prev` is how a key gets dropped; the
      // binding exists to be discarded, so only the rest siblings are a use.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Context modules export a provider component plus its hook, and the
    // shadcn/ui primitives export cva variant objects alongside the
    // component. Both are the intended module shape; the only cost is
    // coarser dev-time hot reload, so the fast-refresh rule is noise here.
    files: ['src/contexts/**/*.{js,jsx}', 'src/components/ui/**/*.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Tooling + E2E run in Node (process, __dirname) rather than the browser.
    files: ['vite.config.js', 'vitest.config.js', 'playwright.config.js', 'e2e/**/*.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
