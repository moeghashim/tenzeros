export default defineNuxtConfig({
  compatibilityDate: '2026-10-22',
  devtools: { enabled: false },
  css: ['@fontsource/inter/400.css', '@fontsource/inter/500.css', '@fontsource/inter/600.css', '~/assets/css/tokens.css', '~/assets/css/base.css'],
  typescript: { strict: true },
  runtimeConfig: {
    sessionSecret: '',
    deepseekApiKey: '',
    deepseekBaseUrl: 'https://api.deepseek.com',
    deepseekModel: 'deepseek-chat',
    llmMock: false,
  },
  nitro: { preset: 'node-server', externals: { external: ['better-sqlite3'] } },
  app: { head: { title: 'Tenzeros', htmlAttrs: { lang: 'en' }, meta: [{ name: 'description', content: 'Your workspace, ready for what comes next.' }] } },
})
