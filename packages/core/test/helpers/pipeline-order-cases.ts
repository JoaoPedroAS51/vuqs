export type Band = 'pre' | 'default' | 'post'

export interface OrderCase {
  name: string
  /** Registrations in installation order. */
  registrations: ReadonlyArray<{ label: string, enforce?: Band }>
  /** The handwritten expected execution order. */
  expected: readonly string[]
}

// Data-only fixture of literal registration sequences and handwritten expected orders,
// shared by the runtime pipeline suite and the descriptor ordering assertions.
export const orderCases: readonly OrderCase[] = [
  {
    name: 'registration order within the default band',
    registrations: [{ label: 'F' }, { label: 'C' }, { label: 'G' }],
    expected: ['F', 'C', 'G'],
  },
  {
    name: 'pre before default before post, whatever the installation order',
    registrations: [
      { label: 'default' },
      { label: 'post', enforce: 'post' },
      { label: 'pre', enforce: 'pre' },
    ],
    expected: ['pre', 'default', 'post'],
  },
  {
    name: 'same-band ties keep installation order',
    registrations: [
      { label: 'd1' },
      { label: 'post1', enforce: 'post' },
      { label: 'd2' },
      { label: 'pre1', enforce: 'pre' },
      { label: 'pre2', enforce: 'pre' },
      { label: 'post2', enforce: 'post' },
    ],
    expected: ['pre1', 'pre2', 'd1', 'd2', 'post1', 'post2'],
  },
  {
    name: 'a post registration installed first still runs last',
    registrations: [{ label: 'omit', enforce: 'post' }, { label: 'guarantee' }],
    expected: ['guarantee', 'omit'],
  },
]
