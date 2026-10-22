export const testRuntimeConfig = {
  sessionSecret: 'tenzeros-test-secret-at-least-thirty-two-characters',
  deepseekApiKey: '', deepseekBaseUrl: 'https://api.deepseek.com', deepseekModel: 'deepseek-chat', llmMock: true,
}
export const useRuntimeConfig = () => testRuntimeConfig
