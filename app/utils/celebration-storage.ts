/** Storage can be disabled or contain data written by an older app version. */
export function readCelebrations(storage: Pick<Storage, 'getItem'>, key: string): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) || '[]')
    return Array.isArray(value)
      ? [...new Set(value.filter((v): v is string => typeof v === 'string'))]
      : []
  } catch {
    return []
  }
}
