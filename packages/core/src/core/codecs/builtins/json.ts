import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Codec } from '../codec'
import { createCodec } from '../codec'

/**
 * Builds a codec that reads JSON text or an already-parsed query value.
 *
 * @remarks
 * Strings are decoded with `JSON.parse`. Objects and arrays are read as complete
 * values, including empty structures. Nullish query nodes, non-finite numeric
 * nodes, and invalid JSON text parse as absent (`undefined`).
 *
 * `validate` accepts a callback or a synchronous Standard Schema. It receives
 * the decoded or already-parsed value. The callback return value or schema
 * output is the codec result. Validation issues and throws parse as absent.
 * Without `validate`, the value is returned as `T` without schema validation.
 * Schema output must round-trip through `JSON.stringify` and validation.
 * The returned codec's `parse` throws `TypeError` if a Standard Schema returns
 * an asynchronous result.
 *
 * @param options - Optional callback or Standard Schema validator.
 * @param options.validate - The synchronous validator for the decoded value.
 * @returns A JSON codec whose value type is inferred from the validator output.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | `JSON.parse`}
 */
export function createJsonCodec<T>(options: { validate: StandardSchemaV1<unknown, T> }): Codec<T>

export function createJsonCodec<T>(options?: { validate?: (value: unknown) => T }): Codec<T>

export function createJsonCodec<T>(options: { validate?: ((value: unknown) => T) | StandardSchemaV1<unknown, T> }): Codec<T>

export function createJsonCodec<T>(options: { validate?: ((value: unknown) => T) | StandardSchemaV1<unknown, T> } = {}): Codec<T> {
  return createCodec<T>({
    parse: (raw) => {
      if (raw === null || raw === undefined || (typeof raw === 'number' && !Number.isFinite(raw))) {
        return undefined
      }

      let result: StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>

      try {
        const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw

        if (!options.validate) {
          return parsed as T
        }

        if (!('~standard' in options.validate)) {
          return options.validate(parsed)
        }

        result = options.validate['~standard'].validate(parsed)
      }
      catch {
        return undefined
      }

      if (isAsyncValidation(result)) {
        void Promise.resolve(result).catch(() => {})
        throw new TypeError('[vuqs] codecs.json: Standard Schema validation must be synchronous.')
      }

      return result.issues ? undefined : result.value
    },
    serialize: value => JSON.stringify(value),
  })
}

function isAsyncValidation<T>(
  result: StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>,
): result is Promise<StandardSchemaV1.Result<T>> {
  return 'then' in result && typeof result.then === 'function'
}
