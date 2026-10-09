import { expect, expectUrl, test } from './fixtures'

const path = '/vue-router/navigation'

test('rolls back a blocked write and accepts the next navigation', async ({ page }) => {
  await page.goto(`${path}?q=initial`)
  await page.getByRole('button', { name: 'Block navigation' }).click()

  await page.getByRole('searchbox', { name: 'Search' }).fill('blocked')

  await expect(page.getByTestId('guard-status')).toHaveText('blocked')
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('initial')
  await expectUrl(page, `${path}?q=initial`)

  await page.getByRole('button', { name: 'Allow navigation' }).click()
  await page.getByRole('searchbox', { name: 'Search' }).fill('accepted')

  await expectUrl(page, `${path}?q=accepted`)
  await expect(page.getByTestId('guard-status')).toHaveText('committed')
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('accepted')
})

test('preserves a newer state while an earlier navigation is waiting in a guard', async ({ page }) => {
  await page.goto(`${path}?q=initial`)
  await page.getByRole('button', { name: 'Hold next navigation' }).click()

  await page.getByRole('searchbox', { name: 'Search' }).fill('first')
  await expect(page.getByTestId('guard-status')).toHaveText('waiting')
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('first')
  await expect(page.getByTestId('state')).toHaveText('first')
  await expectUrl(page, `${path}?q=initial`)

  await page.getByRole('searchbox', { name: 'Search' }).fill('latest')
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('latest')
  await expect(page.getByTestId('state')).toHaveText('latest')
  await expectUrl(page, `${path}?q=initial`)
  await page.getByRole('button', { name: 'Release navigation' }).click()

  await expectUrl(page, `${path}?q=latest`)
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('latest')

  await page.goBack()
  await expectUrl(page, `${path}?q=first`)
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('first')
  await page.goForward()
  await expectUrl(page, `${path}?q=latest`)
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('latest')
})
