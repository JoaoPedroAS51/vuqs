import { expect, expectUrl, test } from './fixtures'

for (const adapter of ['vue-router', 'browser-history']) {
  test.describe(adapter, () => {
    const path = `/${adapter}/catalog`

    test('reads typed values and repeated params on direct entry and after reload', async ({ page }) => {
      await page.goto(`${path}?q=caf%C3%A9+%26+tea&page=2&tags=red&tags=blue`)

      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('café & tea')
      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 2, tags: ['red', 'blue'] }))
      await expect(page.getByRole('checkbox', { name: 'Red', exact: true })).toBeChecked()
      await expect(page.getByRole('checkbox', { name: 'Blue', exact: true })).toBeChecked()

      await page.getByRole('searchbox', { name: 'Search' }).fill('a+b / café')
      await page.getByRole('spinbutton', { name: 'Page' }).fill('4')
      await page.getByRole('checkbox', { name: 'Red', exact: true }).uncheck()
      await expectUrl(page, `${path}?q=a%2Bb+%2F+caf%C3%A9&page=4&tags=blue`)

      await page.reload()

      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('a+b / café')
      await expect(page.getByRole('spinbutton', { name: 'Page' })).toHaveValue('4')
      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 4, tags: ['blue'] }))
      await expect(page.getByRole('checkbox', { name: 'Red', exact: true })).not.toBeChecked()
      await expect(page.getByRole('checkbox', { name: 'Blue', exact: true })).toBeChecked()
    })

    test('preserves the path, hash and unmanaged params when writing and clearing', async ({ page }) => {
      await page.goto(`${path}?q=initial&page=2&utm=campaign&keep=one&keep=two#results`)

      await page.getByRole('button', { name: 'Apply preset' }).click()
      await expectUrl(page, `${path}?q=sale&page=3&tags=red&tags=blue&utm=campaign&keep=one&keep=two#results`)

      await page.getByRole('button', { name: 'Clear all' }).click()

      await expectUrl(page, `${path}?utm=campaign&keep=one&keep=two#results`)
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 1, tags: [] }))
    })

    test('resolves defaults without writing them and omits a selected default', async ({ page }) => {
      await page.goto(path)

      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 1, tags: [] }))
      await expectUrl(page, path)

      await page.getByRole('spinbutton', { name: 'Page' }).fill('2')
      await expectUrl(page, `${path}?page=2`)
      await page.getByRole('spinbutton', { name: 'Page' }).fill('1')

      await expectUrl(page, path)
      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 1, tags: [] }))
    })

    test('renders the default for an invalid URL value and accepts a later edit', async ({ page }) => {
      await page.goto(`${path}?page=invalid`)

      await expect(page.getByRole('spinbutton', { name: 'Page' })).toHaveValue('1')
      await expectUrl(page, `${path}?page=invalid`)
      await page.getByRole('spinbutton', { name: 'Page' }).fill('3')

      await expectUrl(page, `${path}?page=3`)
      await expect(page.getByTestId('filters')).toHaveText(JSON.stringify({ page: 3, tags: [] }))
    })
  })
}
