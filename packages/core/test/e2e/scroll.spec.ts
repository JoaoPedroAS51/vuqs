import type { Page } from '@playwright/test'
import { expect, expectUrl, test } from './fixtures'

for (const adapter of ['vue-router', 'browser-history']) {
  test.describe(adapter, () => {
    const path = `/${adapter}/scroll`

    test('scrolls to the top-left for true', async ({ page }) => {
      await openScrolled(page, path, { x: 500, y: 800 })

      await page.getByRole('button', { name: 'Scroll to top' }).click()

      await expectUrl(page, `${path}?page=2`)
      await expectScroll(page, { x: 0, y: 0 })
    })

    test('scrolls to a ScrollToOptions position with smooth behavior', async ({ page }) => {
      await openScrolled(page, path, { x: 0, y: 0 })

      await page.getByRole('button', { name: 'Scroll to 400 smoothly' }).click()

      await expectUrl(page, `${path}?page=2`)
      await expectScroll(page, { x: 0, y: 400 })
    })

    test('keeps the axis a ScrollToOptions object omits', async ({ page }) => {
      await openScrolled(page, path, { x: 500, y: 800 })

      await page.getByRole('button', { name: 'Scroll vertically to 0' }).click()

      await expectUrl(page, `${path}?page=2`)
      await expectScroll(page, { x: 500, y: 0 })
    })

    for (const name of ['Keep position', 'No scroll option']) {
      test(`keeps the position for "${name}"`, async ({ page }) => {
        await openScrolled(page, path, { x: 500, y: 800 })

        await page.getByRole('button', { name }).click()

        await expectUrl(page, `${path}?page=2`)
        await expect(page.getByTestId('page')).toHaveText('2')
        await afterRender(page)
        expect(await readScroll(page)).toEqual({ x: 500, y: 800 })
      })
    }

    test('navigates once with the scrolling value of coalesced writes', async ({ page }) => {
      await openScrolled(page, path, { x: 500, y: 800 })

      await page.getByRole('button', { name: 'Coalesce false and true' }).click()

      await expectUrl(page, `${path}?page=3`)
      await expectScroll(page, { x: 0, y: 0 })
    })

    test('reaches a position that exists only after the update renders', async ({ page }) => {
      await openScrolled(page, path, { x: 0, y: 0 })
      const maxBefore = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
      expect(maxBefore).toBeLessThan(2500)

      await page.getByRole('button', { name: 'Grow and scroll' }).click()

      await expectUrl(page, `${path}?rows=2`)
      await expectScroll(page, { x: 0, y: 2500 })
    })
  })
}

test.describe('vue-router scroll policy', () => {
  test('keeps the position for writes without a scrolling value when the router always scrolls', async ({ page }) => {
    const path = '/vue-router/scroll/top'
    await openScrolled(page, path, { x: 500, y: 800 })

    await page.getByRole('button', { name: 'No scroll option' }).click()
    await expectUrl(page, `${path}?page=2`)
    await afterRender(page)
    expect(await readScroll(page)).toEqual({ x: 500, y: 800 })

    await page.getByRole('button', { name: 'Keep position' }).click()
    await expectUrl(page, `${path}?page=3`)
    await afterRender(page)
    expect(await readScroll(page)).toEqual({ x: 500, y: 800 })
  })

  test('applies the router behavior to application navigation', async ({ page }) => {
    const path = '/vue-router/scroll/top'
    await openScrolled(page, path, { x: 0, y: 800 })

    await page.getByRole('button', { name: 'Keep position' }).click()
    await expectUrl(page, `${path}?page=2`)
    await page.getByRole('button', { name: 'Application navigation' }).click()

    await expectUrl(page, `${path}?page=3`)
    await expectScroll(page, { x: 0, y: 0 })
  })

  test('restores the saved position on back navigation after a write scrolls', async ({ page }) => {
    const path = '/vue-router/scroll/top'
    await openScrolled(page, path, { x: 0, y: 800 })

    await page.getByRole('button', { name: 'Push and reset scroll' }).click()
    await expectUrl(page, `${path}?page=2`)
    await expectScroll(page, { x: 0, y: 0 })

    await page.goBack()

    await expectUrl(page, path)
    await expectScroll(page, { x: 0, y: 800 })
  })

  test('applies a replaced router behavior to application navigation while writes keep their value', async ({ page }) => {
    const path = '/vue-router/scroll/keep'
    await openScrolled(page, path, { x: 0, y: 800 })
    await page.getByRole('button', { name: 'Keep position' }).click()
    await expectUrl(page, `${path}?page=2`)

    await page.getByRole('button', { name: 'Replace router scroll behavior' }).click()
    await page.getByRole('button', { name: 'Application navigation' }).click()
    await expectUrl(page, `${path}?page=3`)
    await expectScroll(page, { x: 0, y: 100 })

    await page.evaluate(() => window.scrollTo(0, 800))
    await expectScroll(page, { x: 0, y: 800 })

    await page.getByRole('button', { name: 'Keep position' }).click()
    await expectUrl(page, `${path}?page=4`)

    await afterRender(page)
    expect(await readScroll(page)).toEqual({ x: 0, y: 800 })
  })

  test('scrolls to the top-left for true with a router that keeps position', async ({ page }) => {
    const path = '/vue-router/scroll/keep'
    await openScrolled(page, path, { x: 500, y: 800 })

    await page.getByRole('button', { name: 'Scroll to top' }).click()

    await expectUrl(page, `${path}?page=2`)
    await expectScroll(page, { x: 0, y: 0 })
  })

  test('scrolls to the top-left for true with a router without scroll behavior', async ({ page }) => {
    const path = '/vue-router-bare/scroll'
    await openScrolled(page, path, { x: 500, y: 800 })

    await page.getByRole('button', { name: 'Scroll to top' }).click()

    await expectUrl(page, `${path}?page=2`)
    await expectScroll(page, { x: 0, y: 0 })
  })
})

interface ScrollPosition {
  x: number
  y: number
}

async function openScrolled(page: Page, path: string, position: ScrollPosition): Promise<void> {
  await page.goto(path)
  await expect(page.getByTestId('page')).toHaveText('1')
  await page.evaluate(({ x, y }) => window.scrollTo(x, y), position)
  await expectScroll(page, position)
}

async function expectScroll(page: Page, position: ScrollPosition): Promise<void> {
  await expect.poll(() => readScroll(page)).toEqual(position)
}

function readScroll(page: Page): Promise<ScrollPosition> {
  return page.evaluate(() => ({ x: Math.round(window.scrollX), y: Math.round(window.scrollY) }))
}

// Two animation frames cover the DOM update and any scroll queued after it.
function afterRender(page: Page): Promise<void> {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}
