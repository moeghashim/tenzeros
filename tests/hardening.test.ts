import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTokenBucket } from '../server/utils/rate-limit'
import { seedDemo } from '../server/utils/demo-seed'
import { readCelebrations } from '../app/utils/celebration-storage'
import { testDatabase } from './database'
import { aiContexts, agents, subscriptions } from '../server/db/schema'

describe('bounded rate limiting', () => {
  it('isolates clients, refills continuously, and reports seconds until retry', () => {
    const take = createTokenBucket(2, 2000)
    expect(take('a', 0)).toBe(0)
    expect(take('a', 0)).toBe(0)
    expect(take('a', 0)).toBe(2)
    expect(take('b', 0)).toBe(0)
    expect(take('a', 1000)).toBe(1)
    expect(take('a', 2000)).toBe(0)
    expect(take('a', 2000)).toBe(2)
    expect(take('a', 100000)).toBe(0)
    expect(take('a', 100000)).toBe(0)
    expect(take('a', 100000)).toBe(2)
  })
  it('bounds storage without evicting active clients, and reclaims expired entries', () => {
    const take = createTokenBucket(1, 1000, 1)
    expect(take('a', 0)).toBe(0)
    expect(take('b', 0)).toBe(1)
    expect(take('a', 0)).toBe(1)
    expect(take('b', 1000)).toBe(0)
  })
})

it('demo seed is usable offline, repeatable, and preserves edits', () => {
  const db = testDatabase()
  try {
    const workspace = seedDemo(db)
    const context = db.select().from(aiContexts).get()!
    const agent = db.select().from(agents).get()!
    db.update(aiContexts)
      .set({ content: 'Reviewed context' })
      .where(eq(aiContexts.id, context.id))
      .run()
    db.update(agents).set({ enabled: true }).where(eq(agents.id, agent.id)).run()
    expect(seedDemo(db).id).toBe(workspace.id)
    expect(db.select().from(aiContexts).all()).toHaveLength(4)
    expect(db.select().from(agents).all()).toHaveLength(6)
    expect(db.select().from(aiContexts).where(eq(aiContexts.id, context.id)).get()?.content).toBe(
      'Reviewed context',
    )
    expect(db.select().from(agents).where(eq(agents.id, agent.id)).get()?.enabled).toBe(true)
    expect(db.select().from(subscriptions).get()?.topupCreditsRemaining).toBe(2000)
    expect(seedDemo(db).contextStatus).toBe('ready')
  } finally {
    db.$client.close()
  }
})

it('celebration storage tolerates unavailable/corrupt storage and deduplicates keys', () => {
  expect(readCelebrations({ getItem: () => '{bad' }, 'key')).toEqual([])
  expect(
    readCelebrations(
      {
        getItem: () => {
          throw new Error('unavailable')
        },
      },
      'key',
    ),
  ).toEqual([])
  expect(
    readCelebrations({ getItem: () => '["connect_gmail",42,"connect_gmail"]' }, 'key'),
  ).toEqual(['connect_gmail'])
})
