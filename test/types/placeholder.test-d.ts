import { expectTypeOf } from 'vitest'

// Placeholder so the type-test suite is not empty before the first module lands.
expectTypeOf<string>().toEqualTypeOf<string>()
