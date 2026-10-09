import type { Page } from '@playwright/test'
import { expect, expectUrl, test } from './fixtures'

const path = '/vue-router/storage'

async function storedQuery(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const stored = localStorage.getItem('vuqs:e2e:filters')
    return stored === null ? null : JSON.parse(stored).query
  })
}

test('persists state and restores an empty URL after reopening the page', async ({ page }) => {
  await page.goto(path)
  await expect(page.getByTestId('storage-status')).toHaveText('ready')

  await page.getByRole('searchbox', { name: 'Search' }).fill('stored')
  await page.getByRole('spinbutton', { name: 'Page' }).fill('3')
  await expectUrl(page, `${path}?q=stored&page=3`)
  await expect.poll(() => storedQuery(page)).toEqual({ q: 'stored', page: '3' })

  await page.goto(path)

  await expect(page.getByTestId('storage-status')).toHaveText('ready')
  await expectUrl(page, `${path}?q=stored&page=3`)
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('stored')
  await expect(page.getByRole('spinbutton', { name: 'Page' })).toHaveValue('3')
})

test('prefers URL state to stored params without merging omitted params', async ({ page }) => {
  await page.goto(`${path}?q=stored&page=3`)
  await expect(page.getByTestId('storage-status')).toHaveText('ready')
  await expect.poll(() => storedQuery(page)).toEqual({ q: 'stored', page: '3' })

  await page.goto(`${path}?q=from-url`)

  await expect(page.getByTestId('storage-status')).toHaveText('ready')
  await expectUrl(page, `${path}?q=from-url`)
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('from-url')
  await expect(page.getByRole('spinbutton', { name: 'Page' })).toHaveValue('1')
  await expect.poll(() => storedQuery(page)).toEqual({ q: 'from-url' })
})

test('clears persisted state so reload does not restore it', async ({ page }) => {
  await page.goto(`${path}?q=stored&page=3`)
  await expect(page.getByTestId('storage-status')).toHaveText('ready')
  await expect.poll(() => storedQuery(page)).toEqual({ q: 'stored', page: '3' })

  await page.getByRole('button', { name: 'Clear all' }).click()
  await expectUrl(page, path)
  await expect.poll(() => storedQuery(page)).toBeNull()
  await page.reload()

  await expect(page.getByTestId('storage-status')).toHaveText('ready')
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
  await expect(page.getByRole('spinbutton', { name: 'Page' })).toHaveValue('1')
  await expectUrl(page, path)
  await expect.poll(() => storedQuery(page)).toBeNull()
})
