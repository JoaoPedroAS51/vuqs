import type { Codec } from '../../src/core/codecs/codec'
import type { ParsedQueryValue } from '../../src/core/query/types'
import { describe, expect, it } from 'vitest'
import { codecs } from '../../src/core/codecs/catalog'

const OPERATIONS_PER_BATCH = 100

interface Payload extends Record<string, ParsedQueryValue> {
  enabled: boolean
  rows: { id: number, label: string }[]
}

function parseCase<T>(name: string, codec: Codec<T>, inputs: ParsedQueryValue[], expected: T[]) {
  return { name, operation: codec.parse, inputs, expected }
}

function serializeCase<T>(name: string, codec: Codec<T>, values: T[], expected: ParsedQueryValue[]) {
  return {
    name,
    operation: (index: number) => codec.serialize(values[index]),
    inputs: values.map((_, index) => index),
    expected,
  }
}

function payload(size: number, offset: number): Payload {
  return {
    enabled: offset === 0,
    rows: Array.from({ length: size }, (_, index) => ({ id: index + offset, label: `item-${index + offset}` })),
  }
}

function validatePayload(value: unknown): Payload {
  if (typeof value !== 'object' || value === null || !('enabled' in value) || typeof value.enabled !== 'boolean' || !('rows' in value) || !Array.isArray(value.rows)) {
    throw new TypeError('invalid payload')
  }

  for (const row of value.rows) {
    if (typeof row !== 'object' || row === null || typeof row.id !== 'number' || typeof row.label !== 'string') {
      throw new TypeError('invalid row')
    }
  }

  return value as Payload
}

const integerArray = codecs.arrayOf(codecs.integer)
const json = codecs.json<Payload>()
const validatedJson = codecs.json({ validate: validatePayload })

const scalarCases = [
  parseCase('integer text', codecs.integer, ['42', '43'], [42, 43]),
  parseCase('integer native', codecs.integer, [42, 43], [42, 43]),
  parseCase('float text', codecs.float, ['1.5', '2.5'], [1.5, 2.5]),
  parseCase('float native', codecs.float, [1.5, 2.5], [1.5, 2.5]),
  parseCase('boolean text', codecs.boolean, ['true', 'false'], [true, false]),
  parseCase('boolean native', codecs.boolean, [true, false], [true, false]),
]

const arrayCases = [10, 100, 1000].flatMap((size) => {
  const values = [0, 1].map(offset => Array.from({ length: size }, (_, index) => index + offset))
  const text = values.map(items => items.map(String))

  return [
    parseCase(`integer array text ${size}`, integerArray, text, values),
    parseCase(`integer array native ${size}`, integerArray, values, values),
  ]
})

const jsonCases = [10, 100].flatMap((size) => {
  const values = [payload(size, 0), payload(size, 1)]
  const text = values.map(value => JSON.stringify(value))

  return [
    parseCase(`JSON text ${size}`, json, text, values),
    parseCase(`JSON native ${size}`, json, values, values),
    parseCase(`JSON text validated ${size}`, validatedJson, text, values),
    parseCase(`JSON native validated ${size}`, validatedJson, values, values),
  ]
})

describe('codec parsing', () => {
  it.for([...scalarCases, ...arrayCases, ...jsonCases])('$name', async ({ operation, inputs, expected }, { bench }) => {
    for (const [index, input] of inputs.entries()) {
      expect(operation(input)).toEqual(expected[index])
    }

    let index = 0
    let result: unknown
    let decoded = 0
    await bench('100 parses', () => {
      for (let count = 0; count < OPERATIONS_PER_BATCH; count++) {
        result = operation(inputs[index])
        index = (index + 1) % inputs.length
        decoded += result === undefined ? 0 : 1
      }
    }).run()

    expect(decoded).toBeGreaterThan(0)
    expect(result).toEqual(expected[(index + inputs.length - 1) % inputs.length])
  })
})

describe('codec serialization', () => {
  it.for([
    serializeCase('integer', codecs.integer, [42, 43], ['42', '43']),
    serializeCase('float', codecs.float, [1.5, 2.5], ['1.5', '2.5']),
    serializeCase('boolean', codecs.boolean, [true, false], ['true', 'false']),
    ...[10, 100, 1000].map((size) => {
      const values = [0, 1].map(offset => Array.from({ length: size }, (_, index) => index + offset))
      return serializeCase(`integer array ${size}`, integerArray, values, values.map(items => items.map(String)))
    }),
    ...[10, 100].map((size) => {
      const values = [payload(size, 0), payload(size, 1)]
      return serializeCase(`JSON ${size}`, json, values, values.map(value => JSON.stringify(value)))
    }),
  ])('$name', async ({ operation, inputs, expected }, { bench }) => {
    for (const [index, input] of inputs.entries()) {
      expect(operation(input)).toEqual(expected[index])
    }

    let index = 0
    let result: unknown
    let encoded = 0
    await bench('100 serializations', () => {
      for (let count = 0; count < OPERATIONS_PER_BATCH; count++) {
        result = operation(inputs[index])
        index = (index + 1) % inputs.length
        encoded += result === undefined ? 0 : 1
      }
    }).run()

    expect(encoded).toBeGreaterThan(0)
    expect(result).toEqual(expected[(index + inputs.length - 1) % inputs.length])
  })
})
