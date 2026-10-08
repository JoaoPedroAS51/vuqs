import { expect, expectUrl, test } from './fixtures'

for (const adapter of ['vue-router', 'browser-history']) {
  test.describe(adapter, () => {
    const path = `/${adapter}/catalog`

    test('pushes and replaces entries and follows back and forward navigation', async ({ page }) => {
      await page.goto(`${path}?q=initial`)

      await page.getByRole('button', { name: 'Push search' }).click()
      await expectUrl(page, `${path}?q=pushed`)
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('pushed')
      await page.getByRole('button', { name: 'Replace search' }).click()
      await expectUrl(page, `${path}?q=replaced`)
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('replaced')

      await page.goBack()

      await expectUrl(page, `${path}?q=initial`)
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('initial')

      await page.goForward()

      await expectUrl(page, `${path}?q=replaced`)
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('replaced')
    })

    test('commits writes from separate components in one history entry', async ({ page }) => {
      await page.goto(`${path}?q=initial&page=2`)

      await page.getByRole('button', { name: 'Apply preset' }).click()
      await expectUrl(page, `${path}?q=sale&page=3&tags=red&tags=blue`)
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('sale')
      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 3, tags: ['red', 'blue'] }))

      await page.goBack()

      await expectUrl(page, `${path}?q=initial&page=2`)
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('initial')
      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 2, tags: [] }))

      await page.goForward()

      await expectUrl(page, `${path}?q=sale&page=3&tags=red&tags=blue`)
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('sale')
      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 3, tags: ['red', 'blue'] }))
    })
  })
}
