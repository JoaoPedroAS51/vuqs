import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('basic fixture', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
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
})
