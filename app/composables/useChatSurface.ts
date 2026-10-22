export function useChatSurface() {
  const chatId = useState<string | null>('dockedChatId', () => null)
  const pendingFlowCelebration = useState<string | null>('pendingFlowCelebration', () => null)
  return {
    chatId,
    pendingFlowCelebration,
    openDocked: (id: string) => {
      chatId.value = id
    },
    close: () => {
      chatId.value = null
    },
  }
}
