import { test, expect } from '@playwright/test'
for (const route of ['signup', 'login'])
  test(`${route} cannot leak PII before hydration`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false }),
      page = await context.newPage()
    const navigations: string[] = []
    page.on('request', (r) => {
      if (r.isNavigationRequest()) navigations.push(r.url())
    })
    await page.goto(`http://localhost:3100/${route}`)
    await expect(page.locator('form')).toHaveAttribute('method', 'post')
    await expect(page.locator('button[type=submit]')).toBeDisabled()
    await page.locator('input[name=name]').fill('Private Name')
    await page.locator('input[name=email]').fill('private@example.test')
    await page.locator('input[name=email]').press('Enter')
    expect(navigations.every((url) => !url.includes('private') && !url.includes('name='))).toBe(
      true,
    )
    expect(new URL(page.url()).search).toBe('')
    await context.close()
  })
