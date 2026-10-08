import type { Page } from '@playwright/test'
import { test as base, expect } from '@playwright/test'

export const test = base.extend<{ browserErrors: void }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        errors.push(message.text())
      }
    })
    await use()
    expect(errors, 'Unexpected browser errors or warnings').toEqual([])
  }, { auto: true }],
})

export { expect }

export async function expectUrl(page: Page, path: string): Promise<void> {
  function location(url: URL): { pathname: string, query: [string, string][], hash: string } {
    url.searchParams.sort()
    return { pathname: url.pathname, query: [...url.searchParams], hash: url.hash }
  }

  await expect.poll(() => location(new URL(page.url()))).toEqual(location(new URL(path, page.url())))
}
