export type WorkspaceContexts = {
  contexts: {
    id: string
    workspaceId: string
    name: string
    content: string
    type: 'prompt'
    createdAt: string
    updatedAt: string
  }[]
  status: 'pending' | 'ready' | 'failed'
  error: string | null
  canEdit: boolean
  workspaceId: string
}
