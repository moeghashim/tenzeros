import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { expect, it } from 'vitest'

const root = resolve('.')
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts as Record<
  string,
  string
>

it.each([
  {
    label: '.env path',
    filePath: 'custom/workspace.db',
    hostPath: undefined,
    expected: 'custom/workspace.db',
  },
  {
    label: 'host environment override',
    filePath: 'custom/workspace.db',
    hostPath: 'override.db',
    expected: 'override.db',
  },
  {
    label: 'default without .env',
    filePath: undefined,
    hostPath: undefined,
    expected: '.data/tenzeros.db',
  },
])('migration and seed share the $label', ({ filePath, hostPath, expected }) => {
  const cwd = mkdtempSync(join(tmpdir(), 'tenzeros-db-commands-'))
  try {
    // Run the actual package commands from a fixture root, never reading the
    // developer's .env or modifying their database. Symlinks supply code/deps.
    for (const name of ['node_modules', 'scripts', 'server', 'shared'])
      symlinkSync(join(root, name), join(cwd, name), 'dir')
    if (filePath) writeFileSync(join(cwd, '.env'), `DATABASE_PATH=${filePath}\n`)
    const env = { ...process.env }
    delete env.DATABASE_PATH
    if (hostPath) env.DATABASE_PATH = hostPath
    const run = (name: string) => {
      const [executable, ...args] = scripts[name]!.split(' ')
      expect(executable).toBe('node')
      execFileSync(process.execPath, args, { cwd, env, stdio: 'pipe', timeout: 10000 })
    }
    run('db:migrate')
    const path = join(cwd, expected)
    expect(existsSync(path)).toBe(true)
    let db = new Database(path, { readonly: true })
    try {
      expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 0 })
    } finally {
      db.close()
    }
    run('db:seed')
    db = new Database(path, { readonly: true })
    try {
      expect(db.prepare('SELECT email FROM users').all()).toEqual([
        { email: 'demo@tenzeros.local' },
      ])
      expect(db.prepare('SELECT COUNT(*) AS count FROM ai_contexts').get()).toEqual({ count: 4 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM agents').get()).toEqual({ count: 6 })
    } finally {
      db.close()
    }
    for (const other of ['custom/workspace.db', 'override.db', '.data/tenzeros.db'])
      if (other !== expected) expect(existsSync(join(cwd, other))).toBe(false)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
