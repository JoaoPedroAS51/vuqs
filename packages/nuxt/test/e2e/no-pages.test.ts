import { fileURLToPath } from 'node:url'
import { $fetch, createPage, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('no-pages fixture', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/no-pages', import.meta.url)),
    browser: true,
  })

  it('reads query state during SSR with the minimal router', async () => {
    const html = await $fetch<string>('/catalog?q=sale&tags=red&tags=blue')

    expect(html).toContain('<p id="adapter">nuxt-minimal</p>')
    expect(html).toContain('<p id="search">sale</p>')
    expect(html).toContain('<p id="tags">red,blue</p>')
  })

  it('renders defaults and isolates concurrent SSR requests', async () => {
    const [first, second, empty] = await Promise.all([
      $fetch<string>('/?q=first'),
      $fetch<string>('/?q=second'),
      $fetch<string>('/'),
    ])

    expect(first).toContain('<p id="search">first</p>')
    expect(second).toContain('<p id="search">second</p>')
    expect(empty).toContain('<p id="search">none</p>')
  })

  it('hydrates, writes and clears while preserving the path, hash and unmanaged query', async () => {
    const page = await createPage('/catalog?q=initial&keep=yes#section')
    try {
      expect(await page.locator('#adapter').textContent()).toBe('nuxt-minimal')
      expect(await page.locator('#search').textContent()).toBe('initial')
      const historyLength = await page.evaluate(() => history.length)

      await page.locator('#replace').click()
      await page.waitForURL('**/catalog?q=replaced&keep=yes#section')
      expect(await page.locator('#search').textContent()).toBe('replaced')
      expect(await page.evaluate(() => history.length)).toBe(historyLength)

      await page.locator('#push').click()
      await page.waitForURL('**/catalog?q=pushed&keep=yes#section')
      expect(await page.evaluate(() => history.length)).toBe(historyLength + 1)

      await page.goBack()
      await page.waitForURL('**/catalog?q=replaced&keep=yes#section')
      await page.waitForFunction(() => document.querySelector('#search')?.textContent === 'replaced')
      await page.goForward()
      await page.waitForURL('**/catalog?q=pushed&keep=yes#section')
      await page.waitForFunction(() => document.querySelector('#search')?.textContent === 'pushed')

      await page.locator('#clear').click()
      await page.waitForURL('**/catalog?keep=yes#section')
      expect(await page.locator('#search').textContent()).toBe('none')

      await page.locator('#tags-write').click()
      await page.waitForURL('**/catalog?keep=yes&tags=red&tags=blue#section')
      expect(await page.locator('#tags').textContent()).toBe('red,blue')
      await page.reload({ waitUntil: 'networkidle' })
      expect(await page.locator('#tags').textContent()).toBe('red,blue')
    }
    finally {
      await page.close()
    }
  })
})
