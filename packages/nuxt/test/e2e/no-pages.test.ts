import type { NuxtPage } from '@nuxt/test-utils/e2e'
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

  describe('scroll', () => {
    it.each([
      { button: '#scroll-true', from: { x: 500, y: 800 }, url: '**/scroll?page=2', expected: { x: 0, y: 0 } },
      { button: '#scroll-object', from: { x: 0, y: 0 }, url: '**/scroll?page=2', expected: { x: 0, y: 400 } },
      { button: '#scroll-vertical', from: { x: 500, y: 800 }, url: '**/scroll?page=2', expected: { x: 500, y: 0 } },
      { button: '#scroll-coalesce', from: { x: 500, y: 800 }, url: '**/scroll?page=3', expected: { x: 0, y: 0 } },
    ])('scrolls a $button write as requested', async ({ button, from, url, expected }) => {
      const page = await openScrolled(from)
      try {
        await page.locator(button).click()
        await page.waitForURL(url)
        await waitForScroll(page, expected)
      }
      finally {
        await page.close()
      }
    })

    it.each(['#scroll-false', '#scroll-unset'])('keeps the position for a %s write', async (button) => {
      const page = await openScrolled({ x: 500, y: 800 })
      try {
        await page.locator(button).click()
        await page.waitForURL('**/scroll?page=2')
        await page.waitForFunction(() => document.querySelector('#page')?.textContent?.trim() === '2')
        await page.evaluate(() => new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }))
        expect(await readScroll(page)).toEqual({ x: 500, y: 800 })
      }
      finally {
        await page.close()
      }
    })

    it('reaches a position that exists only after the update renders', async () => {
      const page = await openScrolled({ x: 0, y: 0 })
      try {
        const maxBefore = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
        expect(maxBefore).toBeLessThan(2500)

        await page.locator('#scroll-grow').click()
        await page.waitForURL('**/scroll?rows=2')
        await waitForScroll(page, { x: 0, y: 2500 })
      }
      finally {
        await page.close()
      }
    })
  })
})

interface ScrollPosition {
  x: number
  y: number
}

async function openScrolled(position: ScrollPosition): Promise<NuxtPage> {
  const page = await createPage('/scroll')
  await page.evaluate(({ x, y }) => window.scrollTo(x, y), position)
  await waitForScroll(page, position)
  return page
}

async function waitForScroll(page: NuxtPage, { x, y }: ScrollPosition): Promise<void> {
  await page.waitForFunction(
    expected => Math.round(window.scrollX) === expected.x && Math.round(window.scrollY) === expected.y,
    { x, y },
  )
}

function readScroll(page: NuxtPage): Promise<ScrollPosition> {
  return page.evaluate(() => ({ x: Math.round(window.scrollX), y: Math.round(window.scrollY) }))
}
