import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Regras de privacidade impostas por lint.
 *
 * O requisito de processamento local nao pode depender de disciplina de
 * revisao. Estas regras transformam uma violacao num erro de build.
 */
const APIS_DE_REDE = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      'fetch e proibido nesta camada. Os bytes das imagens nunca saem do dispositivo. ' +
      'O binario WASM e carregado pelo proprio magick-wasm a partir de um URL da nossa origem.',
  },
  {
    selector: "NewExpression[callee.name=/^(XMLHttpRequest|WebSocket|EventSource)$/]",
    message: 'Cliente de rede proibido nesta camada. Ver docs/privacidade.md.',
  },
  {
    selector: "MemberExpression[object.name='navigator'][property.name='sendBeacon']",
    message: 'sendBeacon e proibido. Nao existe telemetria sobre ficheiros do utilizador.',
  },
  {
    selector: "MemberExpression[object.name='navigator'][property.name='clipboard']",
    message: 'Escrita para a area de transferencia proibida nesta camada.',
  },
]

const REGRA_OBJECT_URL = [
  {
    selector: "MemberExpression[property.name=/^(createObjectURL|revokeObjectURL)$/]",
    message:
      'Use lib/files/objectUrls.ts. Chamadas diretas impedem garantir que cada ' +
      'createObjectURL tem revoke correspondente.',
  },
]

const APIS_DE_PERSISTENCIA = [
  {
    selector: "Identifier[name=/^(localStorage|sessionStorage|indexedDB)$/]",
    message:
      'Persistencia proibida. Imagens e metadados nunca sao guardados no dispositivo ' +
      'para alem do tempo de vida da pagina. Ver CLAUDE.md, seccao 2.',
  },
  {
    selector: "MemberExpression[object.name='caches']",
    message: 'Cache Storage proibida. Nao fazemos cache de ficheiros do utilizador.',
  },
  {
    selector: "MemberExpression[property.name='registerServiceWorker']",
    message: 'Service workers proibidos nesta fase. Ver CLAUDE.md, seccao 2.11.',
  },
]

export default tseslint.config(
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts', '*-temp.mjs'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Object URLs so podem nascer e morrer num sitio, para o par create/revoke
  // ser auditavel num unico ficheiro.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/files/objectUrls.ts'],
    rules: { 'no-restricted-syntax': ['error', ...REGRA_OBJECT_URL] },
  },

  // Camadas que tocam nos bytes do utilizador: sem rede, sem persistencia.
  //
  // IMPORTANTE: no flat config, o mesmo nome de regra num bloco posterior
  // SUBSTITUI o anterior, nao acumula. Por isso a regra dos object URLs tem de
  // ser repetida aqui. Sem isto, ficheiros em features/converter perdiam-na em
  // silencio, o que foi apanhado ao testar as regras com violacoes reais.
  {
    files: [
      'src/lib/image-engine/**/*.ts',
      'src/lib/files/**/*.ts',
      'src/lib/download/**/*.ts',
      'src/workers/**/*.ts',
      'src/features/converter/**/*.{ts,tsx}',
    ],
    ignores: ['src/lib/files/objectUrls.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...REGRA_OBJECT_URL,
        ...APIS_DE_REDE,
        ...APIS_DE_PERSISTENCIA,
      ],
    },
  },

  // O modulo dos object URLs tem de poder chamar a API que encapsula, mas
  // continua sem rede e sem persistencia.
  {
    files: ['src/lib/files/objectUrls.ts'],
    rules: { 'no-restricted-syntax': ['error', ...APIS_DE_REDE, ...APIS_DE_PERSISTENCIA] },
  },

  {
    files: ['scripts/**/*.mjs', '*.config.{ts,mjs}', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
)
