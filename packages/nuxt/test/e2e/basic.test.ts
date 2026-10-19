import type { NuxtPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('basic fixture', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    browser: true,
  })

  it('reads query state from the URL during SSR through the auto-imported composables', async () => {
    const html = await $fetch<string>('/?q=sale&page=3&sort=price')

    expect(html).toContain('<p id="search">sale</p>')
    expect(html).toContain('<p id="page">3</p>')
    expect(html).toContain('<p id="sort">price</p>')
    expect(html).toContain('<p id="model-sort">price</p>')
    expect(html).toContain('<p id="active">true</p>')
  })

  it('renders codec defaults when the query is empty', async () => {
    const html = await $fetch<string>('/')

    expect(html).toContain('<p id="search">none</p>')
    expect(html).toContain('<p id="page">1</p>')
    expect(html).toContain('<p id="sort">name</p>')
    expect(html).toContain('<p id="model-sort">name</p>')
    expect(html).toContain('<p id="active">false</p>')
  })
  it('falls back to defaults for invalid query values during SSR', async () => {
    const html = await $fetch<string>('/?page=invalid&sort=unknown')

    expect(html).toContain('<p id="page">1</p>')
    expect(html).toContain('<p id="sort">name</p>')
    expect(html).toContain('<p id="active">false</p>')
  })

  it('keeps query state isolated between concurrent SSR requests', async () => {
    const [first, second] = await Promise.all([
      $fetch<string>('/?q=first&page=2&sort=price'),
      $fetch<string>('/?q=second&page=7'),
    ])

    expect(first).toContain('<p id="search">first</p>')
    expect(first).toContain('<p id="page">2</p>')
    expect(first).toContain('<p id="sort">price</p>')
    expect(first).toContain('<p id="active">true</p>')
    expect(second).toContain('<p id="search">second</p>')
    expect(second).toContain('<p id="page">7</p>')
    expect(second).toContain('<p id="sort">name</p>')
    expect(second).toContain('<p id="active">false</p>')

    const next = await $fetch<string>('/')
    expect(next).toContain('<p id="search">none</p>')
    expect(next).toContain('<p id="page">1</p>')
    expect(next).toContain('<p id="sort">name</p>')
    expect(next).toContain('<p id="active">false</p>')
  })

  describe('scroll', () => {
    it.each([
      { button: '#scroll-true', expected: 0 },
      { button: '#scroll-object', expected: 400 },
    ])('scrolls a $button write as requested', async ({ button, expected }) => {
      const page = await openScrolled('/scroll', 800)
      try {
        await page.locator(button).click()
        await page.waitForURL('**/scroll?page=2')
        await page.waitForFunction(y => Math.round(window.scrollY) === y, expected)
      }
      finally {
        await page.close()
      }
    })

    it.each(['#scroll-false', '#scroll-unset'])('keeps the position for a %s write', async (button) => {
      const page = await openScrolled('/scroll', 800)
      try {
        await page.locator(button).click()
        await page.waitForURL('**/scroll?page=2')
        await expectPositionAfterRender(page, 800)
      }
      finally {
        await page.close()
      }
    })

    it('keeps the position for a write on a URL with a hash', async () => {
      const page = await openScrolled('/scroll#reviews', 100)
      try {
        await page.locator('#scroll-unset').click()
        await page.waitForURL('**/scroll?page=2#reviews')
        await expectPositionAfterRender(page, 100)
      }
      finally {
        await page.close()
      }
    })

    it('scrolls an application navigation to the hash target', async () => {
      const page = await openScrolled('/scroll', 0)
      try {
        await page.locator('#navigate-reviews').click()
        await page.waitForURL('**/scroll#reviews')
        await page.waitForFunction(() => {
          const top = document.querySelector('#reviews')!.getBoundingClientRect().top
          return Math.abs(top) <= 1
        })
      }
      finally {
        await page.close()
      }
    })
  })
})

async function openScrolled(path: string, y: number): Promise<NuxtPage> {
  const page = await createPage(path)
  await page.evaluate(top => window.scrollTo(0, top), y)
  await page.waitForFunction(top => Math.round(window.scrollY) === top, y)
  return page
}

async function expectPositionAfterRender(page: NuxtPage, y: number): Promise<void> {
  await page.waitForFunction(() => document.querySelector('#page')?.textContent?.trim() === '2')
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(y)
}
