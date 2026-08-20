---
name: frontend-patterns
description: 'Use when the user is working in a React, Next.js, or modern JS/TS component codebase — writing, debugging, refactoring, or reviewing UI code. Covers: hooks behavior and pitfalls (useEffect dependency loops, stale closures, unstable object/function props, custom hooks), when memoization actually helps (useMemo, useCallback, React.memo), re-render and render-performance diagnosis, state architecture (useState, useReducer, Context, Zustand, prop drilling), data fetching and loading/error states, forms and validation (controlled inputs, react-hook-form, Zod schemas and resolvers, per-field errors), error boundaries, code splitting, list virtualization, animation, and accessible interactive components (focus traps, keyboard nav, ARIA). Trigger on symptom-first reports too ("infinite loop", "re-rendering constantly", "component too big", "state feels wrong"), and on requests to review a PR, diff, or set of .tsx/.jsx component and hook files. Skip for non-component work: build tooling, bundler config, plain CSS/HTML templates, e2e tests, or visual design direction.'
---

# Frontend Development Patterns

Modern frontend patterns for React, Next.js, and performant user interfaces.

## What this app actually uses

The patterns below are general; the stack in this repository is specific, and where they disagree
the repository wins. Examples mentioning Next.js, SWR, framer-motion, or `@tanstack/react-virtual`
are illustrative — none of them is installed here.

| Concern | In `apps/web` |
| --- | --- |
| Framework | React 19 + Vite, no Next.js — routing is `react-router` 7 |
| Components | Mantine 8 (`@mantine/core`, `dates`, `notifications`) |
| Server state | TanStack Query 5 over an axios client with one error translation |
| Client state | Zustand 5, only for what genuinely spans routes |
| Forms | `react-hook-form` 7 + Zod 4 through `@hookform/resolvers` |
| Tests | Vitest 4 + Testing Library + `user-event` + MSW 2, in jsdom |

## When to Activate

- Building React components (composition, props, rendering)
- Managing state (useState, useReducer, Zustand, Context)
- Implementing data fetching (SWR, React Query, server components)
- Optimizing performance (memoization, virtualization, code splitting)
- Working with forms (validation, controlled inputs, Zod schemas)
- Handling client-side routing and navigation
- Building accessible, responsive UI patterns

## Privacy and Data Boundaries

Frontend examples should use synthetic or domain-generic data. Do not collect, log, persist, or display credentials, access tokens, SSNs, health data, payment details, private emails, phone numbers, or other sensitive personal data unless the user explicitly requests a scoped implementation with appropriate validation, redaction, and access controls.

Avoid adding analytics, tracking pixels, third-party scripts, or external data sinks without explicit approval. When handling user data, prefer least-privilege APIs, client-side redaction before logging, and server-side validation for every boundary.

## Component Patterns

### Composition Over Inheritance

```typescript
// PASS: GOOD: Component composition
interface CardProps {
  children: React.ReactNode
  variant?: 'default' | 'outlined'
}

export function Card({ children, variant = 'default' }: CardProps) {
  return <div className={`card card-${variant}`}>{children}</div>
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="card-header">{children}</div>
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>
}

// Usage
<Card>
  <CardHeader>Title</CardHeader>
  <CardBody>Content</CardBody>
</Card>
```

### Compound Components

```typescript
interface TabsContextValue {
  activeTab: string
  setActiveTab: (tab: string) => void
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined)

export function Tabs({ children, defaultTab }: {
  children: React.ReactNode
  defaultTab: string
}) {
  const [activeTab, setActiveTab] = useState(defaultTab)

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  )
}

export function TabList({ children }: { children: React.ReactNode }) {
  return <div className="tab-list">{children}</div>
}

export function Tab({ id, children }: { id: string, children: React.ReactNode }) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('Tab must be used within Tabs')

  return (
    <button
      className={context.activeTab === id ? 'active' : ''}
      onClick={() => context.setActiveTab(id)}
    >
      {children}
    </button>
  )
}

// Usage
<Tabs defaultTab="overview">
  <TabList>
    <Tab id="overview">Overview</Tab>
    <Tab id="details">Details</Tab>
  </TabList>
</Tabs>
```

### Render Props Pattern

```typescript
interface DataLoaderProps<T> {
  url: string
  children: (data: T | null, loading: boolean, error: Error | null) => React.ReactNode
}

export function DataLoader<T>({ url, children }: DataLoaderProps<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [url])

  return <>{children(data, loading, error)}</>
}

// Usage
<DataLoader<Market[]> url="/api/markets">
  {(markets, loading, error) => {
    if (loading) return <Spinner />
    if (error) return <Error error={error} />
    return <MarketList markets={markets!} />
  }}
</DataLoader>
```

## Custom Hooks Patterns

### State Management Hook

```typescript
export function useToggle(initialValue = false): [boolean, () => void] {
  const [value, setValue] = useState(initialValue)

  const toggle = useCallback(() => {
    setValue(v => !v)
  }, [])

  return [value, toggle]
}

// Usage
const [isOpen, toggleOpen] = useToggle()
```

### Async Data Fetching Hook

```typescript
interface UseQueryOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  enabled?: boolean
}

export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: UseQueryOptions<T>
) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)

  // Keep the latest fetcher/options in refs so refetch stays referentially
  // stable even when callers pass inline functions and object literals.
  // Without this, every render creates a new refetch, and the effect below
  // re-runs after each state update - an infinite fetch loop.
  const fetcherRef = useRef(fetcher)
  const optionsRef = useRef(options)
  useEffect(() => {
    fetcherRef.current = fetcher
    optionsRef.current = options
  })

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await fetcherRef.current()
      setData(result)
      optionsRef.current?.onSuccess?.(result)
    } catch (err) {
      const error = err as Error
      setError(error)
      optionsRef.current?.onError?.(error)
    } finally {
      setLoading(false)
    }
  }, [])

  const enabled = options?.enabled !== false

  useEffect(() => {
    if (enabled) {
      refetch()
    }
  }, [key, enabled, refetch])

  return { data, error, loading, refetch }
}

// Usage
const { data: markets, loading, error, refetch } = useQuery(
  'markets',
  () => fetch('/api/markets').then(r => r.json()),
  {
    onSuccess: data => console.log('Fetched', data.length, 'markets'),
    onError: err => console.error('Failed:', err)
  }
)
```

### Debounce Hook

```typescript
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// Usage
const [searchQuery, setSearchQuery] = useState('')
const debouncedQuery = useDebounce(searchQuery, 500)

useEffect(() => {
  if (debouncedQuery) {
    performSearch(debouncedQuery)
  }
}, [debouncedQuery])
```

## State Management Patterns

### Context + Reducer Pattern

```typescript
interface State {
  markets: Market[]
  selectedMarket: Market | null
  loading: boolean
}

type Action =
  | { type: 'SET_MARKETS'; payload: Market[] }
  | { type: 'SELECT_MARKET'; payload: Market }
  | { type: 'SET_LOADING'; payload: boolean }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_MARKETS':
      return { ...state, markets: action.payload }
    case 'SELECT_MARKET':
      return { ...state, selectedMarket: action.payload }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    default:
      return state
  }
}

const MarketContext = createContext<{
  state: State
  dispatch: Dispatch<Action>
} | undefined>(undefined)

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    markets: [],
    selectedMarket: null,
    loading: false
  })

  return (
    <MarketContext.Provider value={{ state, dispatch }}>
      {children}
    </MarketContext.Provider>
  )
}

export function useMarkets() {
  const context = useContext(MarketContext)
  if (!context) throw new Error('useMarkets must be used within MarketProvider')
  return context
}
```

## Performance Optimization

### Memoization

```typescript
// PASS: useMemo for expensive computations
// Copy before sorting - Array.prototype.sort mutates in place
const sortedMarkets = useMemo(() => {
  return [...markets].sort((a, b) => b.volume - a.volume)
}, [markets])

// PASS: useCallback for functions passed to children
const handleSearch = useCallback((query: string) => {
  setSearchQuery(query)
}, [])

// PASS: React.memo for pure components
export const MarketCard = React.memo<MarketCardProps>(({ market }) => {
  return (
    <div className="market-card">
      <h3>{market.name}</h3>
      <p>{market.description}</p>
    </div>
  )
})
```

### Code Splitting & Lazy Loading

```typescript
import { lazy, Suspense } from 'react'

// PASS: Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'))
const ThreeJsBackground = lazy(() => import('./ThreeJsBackground'))

export function Dashboard() {
  return (
    <div>
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart data={data} />
      </Suspense>

      <Suspense fallback={null}>
        <ThreeJsBackground />
      </Suspense>
    </div>
  )
}
```

### Virtualization for Long Lists

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

export function VirtualMarketList({ markets }: { markets: Market[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: markets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,  // Estimated row height
    overscan: 5  // Extra items to render
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <MarketCard market={markets[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Form Handling Patterns

### Controlled Form with Validation

```typescript
interface FormData {
  name: string
  description: string
  endDate: string
}

interface FormErrors {
  name?: string
  description?: string
  endDate?: string
}

export function CreateMarketForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    endDate: ''
  })

  const [errors, setErrors] = useState<FormErrors>({})

  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    } else if (formData.name.length > 200) {
      newErrors.name = 'Name must be under 200 characters'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    try {
      await createMarket(formData)
      // Success handling
    } catch (error) {
      // Error handling
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
        placeholder="Market name"
      />
      {errors.name && <span className="error">{errors.name}</span>}

      {/* Other fields */}

      <button type="submit">Create Market</button>
    </form>
  )
}
```

## Error Boundary Pattern

```typescript
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Usage
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

## Animation Patterns

### Framer Motion Animations

```typescript
import { motion, AnimatePresence } from 'framer-motion'

// PASS: List animations
export function AnimatedMarketList({ markets }: { markets: Market[] }) {
  return (
    <AnimatePresence>
      {markets.map(market => (
        <motion.div
          key={market.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <MarketCard market={market} />
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

// PASS: Modal animations
export function Modal({ isOpen, onClose, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="modal-content"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

## Accessibility Patterns

### Keyboard Navigation

```typescript
export function Dropdown({ options, onSelect }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        onSelect(options[activeIndex])
        setIsOpen(false)
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  return (
    <div
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      onKeyDown={handleKeyDown}
    >
      {/* Dropdown implementation */}
    </div>
  )
}
```

### Focus Management

```typescript
export function Modal({ isOpen, onClose, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Save currently focused element
      previousFocusRef.current = document.activeElement as HTMLElement

      // Focus modal
      modalRef.current?.focus()
    } else {
      // Restore focus when closing
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  return isOpen ? (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      {children}
    </div>
  ) : null
}
```

## Testing UI you can trust

A hundred and fifty-six green tests once shipped four accessibility regressions that a person found
in the first minute of looking at the page: a `<main>` nested inside another `<main>`, a skip link
placed inside the region it exists to skip, a favicon 404 on every load, and three icon buttons
announced as nothing but "button". No test caught any of them, because no test asked.

They share a shape worth naming: **all four are defects of relationship, not of existence.** A
landmark duplicated is a *count*. A skip link in the wrong place is a *position*. A button with no
accessible name is an *absence inside a present element*. Every assertion of the form "the element
is there" passes on all four.

So assert the relationship:

```typescript
// Weak: passes whether there is one <main> or three
expect(screen.getByRole('main')).toBeInTheDocument()

// Strong: the page has exactly one, and the skip link precedes it
expect(screen.getAllByRole('main')).toHaveLength(1)
const [skip] = screen.getAllByRole('link', { name: /pular/i })
expect(skip.compareDocumentPosition(screen.getByRole('main')))
  .toBe(Node.DOCUMENT_POSITION_FOLLOWING)

// Strong: the icon button says what it does, in the words a screen reader speaks
expect(screen.getByRole('button', { name: 'Remover responsável' })).toBeEnabled()
```

Prefer `getByRole` with an accessible name over `getByLabelText` almost everywhere. Not mainly for
robustness — because the accessible name **is** what a screen reader announces, so the assertion and
the user's experience are the same fact. The honest query and the reliable query turn out to be one
query.

### Two jsdom traps that lie about where the problem is

**A component positioned by floating-ui does not open in jsdom.** Mantine's `Select` renders its
dropdown with `display: none` because there is no layout to position against; the options exist in
the DOM and are invisible to every role query (`getByRole('option')` finds zero, and passing
`{ hidden: true }` finds everything). No click, `mouseDown`, `ArrowDown`, or `Enter` opens it. The
symptom reads as "the query never loaded". When a choice has to be testable, reach for
`NativeSelect` — a real `<select>`, which works with `register()` without `watch`/`setValue`, and on
a phone opens the operating system's own picker.

**A required marker pollutes the label's text.** Mantine's `withAsterisk` appends `" *"` to the
`<label>` content (aria-hidden, but still `textContent`), so the label reads "Nome *" while the
accessible name stays "Nome". `getByLabelText` reads the text and misses; `getByRole` reads the
accessible name and hits. The symptom reads as "the field does not exist". Where there is no role to
query — a bare `input type="date"` has none — use `getByLabelText` with a prefix regex.

The lesson under both, and worth carrying into the next unexplained failure: **the symptom names
where the assertion failed, not where the cause lives.** Time is lost searching the query, the
fetch, or the render, when the answer was layout, or text versus accessible name.

### Prove the test can fail

A green test is evidence of nothing until you have seen it red for the right reason. Break the thing
it guards — swap the landmark for a `div`, move the outlet outside `<main>`, mark the wrong link as
current — and confirm that this test fails and the others do not. It costs a minute and it is the
only way to tell a test that holds the behaviour from a test that holds a coincidence.

This is how the "relationship, not existence" claim stops being a slogan: with the id moved onto a
wrapping `div`, and with the outlet rendered beside `<main>` instead of inside it, the old
existence-style cases stayed green and only the relationship cases went red.

**A mutation that survives is a question, not a verdict.** Removing the guard and watching the suite
stay green does not mean the guard is useless — it means no test distinguishes the two worlds, and
you do not yet know why. The answer is rarely "delete it". In one real case the redundancy was
accidental: a stale-time default made a cache invalidation a no-op, and giving that screen its own
freshness turned a decorative guard into a real one. In another it was genuine: two independent
protections covered the same failure, and the honest resolution was to keep both and write down
that neither proves itself alone. Measured across seventy-six injected defects, eleven survived —
and every survivor pointed at a test measuring the wrong thing, not at missing code.

### Four ways an assertion lies to you

**`await` inside an assertion argument runs in the wrong order.**
`expect(screen.getByRole('main')).toContainElement(await screen.findByText('x'))` evaluates
`getByRole` *first*, while the screen is still the loading state. Await on its own line, then assert.

**"The environment cannot observe this" is a claim about the DOM, so measure it.** A defect in the
application and a genuine limitation of jsdom produce the same red test and demand opposite
treatments — one is a bug to file, the other is a case to delete. Dump `outerHTML` in both states
before deciding. Mantine's burger *does* record its state (`data-opened`), it simply never announces
it: an application defect wearing the costume of an environment limit.

**A `test.todo` that prescribes a fix should be written after trying the fix.** Reading a library's
source tells you the attribute is missing; it does not tell you that passing it from outside
reaches the DOM. Try it, then write the todo.

**Noting "CSS does not run here" without looking for the victim.** When a component writes a class
the test cannot evaluate, spend one grep on whether that class has any rule at all. A class with no
rule anywhere is a real defect — the visually-hidden skip link that is not hidden — and the
untestability is exactly what hides it.

Then close the hole, because writing the missing rule does not create a guard for it. Vitest turns a
`.module.css` import into a proxy of class names and never evaluates the sheet, so the rule you just
restored can be deleted tomorrow with the suite still green. Switch CSS processing on for the files
that carry decisions and assert the computed value:

```typescript
// vite.config.ts — modules only; Mantine's own sheets are large and decide nothing here
test: { css: { include: [/\.module\.css$/] } }

expect(getComputedStyle(skipLink).transform).not.toBe('none')
```

**A rule that is missing is one failure; rules in the wrong order are another, and it is worse.**
Trimming a component library's stylesheet by importing per component invites you to sort the imports
alphabetically, which is what a tidy list wants. Put `UnstyledButton.css` after `Button.css` — one
strips border, background and padding, the other restores them, same specificity — and every button
in the application goes bare. What makes this the hardest defect in this section is what stayed
correct: the DOM, the classes, the elements they sit on, the accessibility tree, and all three
hundred and twenty-six tests. Nothing was wrong with the markup, so nothing that reads markup could
tell.

Looking at the DOM proves the markup is right; proving the screen is right takes the image. So take
a screenshot after any change to how styles are bundled or ordered — and then pin what you learned
where a machine can check it, by asserting the order of the selectors in the built stylesheet:

```typescript
// the artifact, not the source: reads dist/ and fails if the cascade flips back
expect(sheet.indexOf(UNSTYLED_BUTTON_CLASS)).toBeLessThan(sheet.indexOf(BUTTON_CLASS))
```

And when a test replaces another, delete the one it replaces in the same edit. Two cases guarding
one behaviour, one of them subtly wrong, is worse than either alone.

**Remember**: Modern frontend patterns enable maintainable, performant user interfaces. Choose patterns that fit your project complexity.
