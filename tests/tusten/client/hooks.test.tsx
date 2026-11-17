// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Slice } from '../../../packages/tusten/src/client/slices/Slice'
import { SliceRegistry } from '../../../packages/tusten/src/client/slices/SliceRegistry'
import { RootProvider } from '../../../packages/tusten/src/client/context/RootProvider'
import { useSlice } from '../../../packages/tusten/src/client/hooks/useSlice'
import { useStrictSlice } from '../../../packages/tusten/src/client/hooks/useStrictSlice'
import { useSliceRef } from '../../../packages/tusten/src/client/hooks/useSliceRef'
import { usePathname } from '../../../packages/tusten/src/client/hooks/usePathname'
import { useParams } from '../../../packages/tusten/src/client/hooks/useParams'
import { useQuery } from '../../../packages/tusten/src/client/hooks/useQuery'
import { getRouter, useRouter } from '../../../packages/tusten/src/client/hooks/useRouter'
import { useNavigation } from '../../../packages/tusten/src/client/hooks/useNavigation'
import { Link } from '../../../packages/tusten/src/client/Link'
import type { TustenClientRouter } from '../../../packages/tusten/src/types'
import { usePageMeta } from '../../../packages/tusten/src/client/hooks/usePageMeta'

/** Тестовый слайс. */
class CounterSlice extends Slice<number> {}

/**
 * Обёртка с провайдером.
 *
 * @param props.children дочерние.
 * @param props.registry реестр слайсов.
 * @param props.router router (path/params/query/routeId).
 * @param props
 * @returns JSX.
 */
function Wrapper(props: { children: ReactNode; registry: SliceRegistry; router?: Partial<TustenClientRouter> }) {
    const router: TustenClientRouter = {
        path: '/',
        params: {},
        query: {},
        routeId: 'home',
        ...props.router,
    }
    return (
        <RootProvider sliceRegistry={props.registry} router={router}>
            {props.children}
        </RootProvider>
    )
}

describe('React hooks', () => {
    let registry: SliceRegistry

    beforeEach(() => {
        registry = new SliceRegistry()
        ;(globalThis as { __rootNavigate?: unknown }).__rootNavigate = {
            push: vi.fn(async () => undefined),
            replace: vi.fn(async () => undefined),
            back: vi.fn(),
            prefetch: vi.fn(async () => undefined),
            reload: vi.fn(async () => undefined),
        }
        // jsdom: заглушить real navigation (иначе warning)
        vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
        vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    })

    afterEach(() => {
        cleanup()
        delete (globalThis as { __rootNavigate?: unknown }).__rootNavigate
    })

    describe('useSlice', () => {
        it('undefined, если слайса нет', () => {
            const { result } = renderHook(() => useSlice('nope'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBeUndefined()
        })

        it('возвращает слайс и его state', () => {
            const slice = new CounterSlice()
            slice.hydrate(42)
            registry.setPage('counter', slice)
            const { result } = renderHook(() => useSlice<CounterSlice>('counter'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBe(slice)
            expect(result.current?.state).toBe(42)
        })

        it('rerender на setState', () => {
            const slice = new CounterSlice()
            slice.hydrate(0)
            registry.setPage('counter', slice)

            /**
             *
             */
            function Test() {
                const s = useSlice<CounterSlice>('counter')
                return <span data-testid="v">{s?.state}</span>
            }

            const { getByTestId } = render(
                <Wrapper registry={registry}>
                    <Test />
                </Wrapper>,
            )
            expect(getByTestId('v').textContent).toBe('0')

            act(() => {
                slice.setState(7)
            })
            expect(getByTestId('v').textContent).toBe('7')
        })

        it('пересоздание слайса по key (dispose + set)', () => {
            const sliceA = new CounterSlice()
            sliceA.hydrate(1)
            registry.setPage('c', sliceA)

            const { result } = renderHook(() => useSlice<CounterSlice>('c'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current?.state).toBe(1)

            const sliceB = new CounterSlice()
            sliceB.hydrate(2)
            registry.setPage('c', sliceB)

            // Перепроверить через renderHook
            const { result: r2 } = renderHook(() => useSlice<CounterSlice>('c'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(r2.current?.state).toBe(2)
        })

        it('после adoptPage подписка переезжает на новый инстанс', () => {
            const sliceA = new CounterSlice()
            sliceA.hydrate(1)
            registry.setPage('c', sliceA)

            /**
             *
             */
            function Test() {
                const s = useSlice<CounterSlice>('c')
                return <span data-testid="v">{s?.state}</span>
            }

            const tree = (
                <Wrapper registry={registry}>
                    <Test />
                </Wrapper>
            )
            const { getByTestId, rerender } = render(tree)
            expect(getByTestId('v').textContent).toBe('1')

            const next = new SliceRegistry()
            const sliceB = new CounterSlice()
            sliceB.hydrate(2)
            next.setPage('c', sliceB)

            // Как в client-entry: adoptPage, затем полный render дерева.
            registry.adoptPage(next)
            rerender(
                <Wrapper registry={registry}>
                    <Test />
                </Wrapper>,
            )
            expect(getByTestId('v').textContent).toBe('2')

            act(() => {
                sliceB.setState(3)
            })
            expect(getByTestId('v').textContent).toBe('3')
        })
    })

    describe('useStrictSlice', () => {
        it('бросает, если слайса нет', () => {
            expect(() =>
                renderHook(() => useStrictSlice('nope'), {
                    wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
                }),
            ).toThrow()
        })

        it('возвращает слайс', () => {
            const slice = new CounterSlice()
            slice.hydrate(5)
            registry.setPage('c', slice)
            const { result } = renderHook(() => useStrictSlice<CounterSlice>('c'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBe(slice)
        })

        it('после adoptGlobal подписка переезжает на новый инстанс', () => {
            const sliceA = new CounterSlice()
            sliceA.hydrate(1)
            registry.setGlobal('g', sliceA)

            /**
             *
             */
            function Test() {
                const s = useStrictSlice<CounterSlice>('g')
                return <span data-testid="v">{s.state}</span>
            }

            const { getByTestId, rerender } = render(
                <Wrapper registry={registry}>
                    <Test />
                </Wrapper>,
            )
            expect(getByTestId('v').textContent).toBe('1')

            const next = new SliceRegistry()
            const sliceB = new CounterSlice()
            sliceB.hydrate(2)
            next.setGlobal('g', sliceB)

            registry.adoptGlobal(next)
            rerender(
                <Wrapper registry={registry}>
                    <Test />
                </Wrapper>,
            )
            expect(getByTestId('v').textContent).toBe('2')

            act(() => {
                sliceB.setState(3)
            })
            expect(getByTestId('v').textContent).toBe('3')
        })
    })

    describe('useSliceRef', () => {
        it('undefined, если нет', () => {
            const { result } = renderHook(() => useSliceRef('nope'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBeUndefined()
        })

        it('возвращает слайс', () => {
            const slice = new CounterSlice()
            slice.hydrate(0)
            registry.setPage('c', slice)
            const { result } = renderHook(() => useSliceRef<CounterSlice>('c'), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            expect(result.current).toBe(slice)
        })
    })

    describe('usePathname / useParams / useQuery', () => {
        it('usePathname', () => {
            const { result } = renderHook(() => usePathname(), {
                wrapper: ({ children }) => (
                    <Wrapper registry={registry} router={{ path: '/blog/hello' }}>
                        {children}
                    </Wrapper>
                ),
            })
            expect(result.current).toBe('/blog/hello')
        })

        it('useParams', () => {
            const { result } = renderHook(() => useParams(), {
                wrapper: ({ children }) => (
                    <Wrapper registry={registry} router={{ params: { slug: 'hello' } }}>
                        {children}
                    </Wrapper>
                ),
            })
            expect(result.current).toEqual({ slug: 'hello' })
        })

        it('useQuery', () => {
            const { result } = renderHook(() => useQuery(), {
                wrapper: ({ children }) => (
                    <Wrapper registry={registry} router={{ query: { tab: 'x' } }}>
                        {children}
                    </Wrapper>
                ),
            })
            expect(result.current).toEqual({ tab: 'x' })
        })

        it('смена router prop — usePathname обновляется', () => {
            /**
             *
             */
            function Inner() {
                return <span data-testid="p">{usePathname()}</span>
            }
            /**
             *
             * @param root0
             * @param root0.path
             */
            function Test({ path }: { path: string }) {
                return (
                    <RootProvider sliceRegistry={registry} router={{ path, params: {}, query: {}, routeId: 'x' }}>
                        <Inner />
                    </RootProvider>
                )
            }

            const { getByTestId, rerender } = render(<Test path="/a" />)
            expect(getByTestId('p').textContent).toBe('/a')
            rerender(<Test path="/b" />)
            expect(getByTestId('p').textContent).toBe('/b')
        })
    })

    describe('usePageMeta', () => {
        it('устанавливает title', () => {
            function Comp() {
                usePageMeta({ title: 'Custom' })
                return null
            }
            render(<Comp />)
            expect(document.title).toBe('Custom')
        })

        it('создаёт meta[name] если нет', () => {
            function Comp() {
                usePageMeta({ meta: [{ name: 'description', content: 'X' }] })
                return null
            }
            render(<Comp />)
            const el = document.querySelector<HTMLMetaElement>('meta[name="description"]')
            expect(el?.content).toBe('X')
        })

        it('обновляет существующий meta', () => {
            const existing = document.createElement('meta')
            existing.name = 'description'
            existing.content = 'old'
            document.head.appendChild(existing)

            function Comp() {
                usePageMeta({ meta: [{ name: 'description', content: 'new' }] })
                return null
            }
            render(<Comp />)
            expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toBe('new')
        })

        it('рендерит microdata JSON-LD', () => {
            function Comp() {
                usePageMeta({ microdata: { '@type': 'Article' } })
                return null
            }
            render(<Comp />)
            const script = document.querySelector('script[type="application/ld+json"]')
            expect(script?.textContent).toContain('"@type":"Article"')
        })
    })

    describe('useNavigation', () => {
        it('возвращает состояние маршрута и методы', async () => {
            const { result } = renderHook(() => useNavigation(), {
                wrapper: ({ children }) => (
                    <Wrapper
                        registry={registry}
                        router={{ path: '/blog/hello', params: { slug: 'hello' }, query: { tab: 'x' } }}
                    >
                        {children}
                    </Wrapper>
                ),
            })
            expect(result.current.pathname).toBe('/blog/hello')
            expect(result.current.params).toEqual({ slug: 'hello' })
            expect(result.current.query).toEqual({ tab: 'x' })
            expect(result.current.route).toBeNull()

            await result.current.push('/about')
            await result.current.reload({ global: false })
            const nav = (
                globalThis as {
                    __rootNavigate?: {
                        push: ReturnType<typeof vi.fn>
                        reload: ReturnType<typeof vi.fn>
                    }
                }
            ).__rootNavigate!
            expect(nav.push).toHaveBeenCalledWith('/about')
            expect(nav.reload).toHaveBeenCalledWith({ global: false })
        })

        it('работает вне <RootProvider>', () => {
            const { result } = renderHook(() => useNavigation())
            expect(result.current.pathname).toBe(window.location.pathname)
            expect(result.current.params).toEqual({})
            expect(result.current.query).toEqual({})
            expect(result.current.route).toBeNull()
            expect(typeof result.current.reload).toBe('function')
        })
    })

    describe('useRouter', () => {
        it('push', async () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            await result.current.push('/about')
            const nav = (globalThis as { __rootNavigate?: { push: ReturnType<typeof vi.fn> } }).__rootNavigate!
            expect(nav.push).toHaveBeenCalledWith('/about')
        })

        it('replace', async () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            await result.current.replace('/x')
            const nav = (globalThis as { __rootNavigate?: { replace: ReturnType<typeof vi.fn> } }).__rootNavigate!
            expect(nav.replace).toHaveBeenCalledWith('/x')
        })

        it('back', () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            result.current.back()
            const nav = (globalThis as { __rootNavigate?: { back: ReturnType<typeof vi.fn> } }).__rootNavigate!
            expect(nav.back).toHaveBeenCalled()
        })

        it('prefetch', async () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            await result.current.prefetch('/about')
            const nav = (globalThis as { __rootNavigate?: { prefetch: ReturnType<typeof vi.fn> } }).__rootNavigate!
            expect(nav.prefetch).toHaveBeenCalledWith('/about')
        })

        it('reload пробрасывает опции', async () => {
            const { result } = renderHook(() => useRouter(), {
                wrapper: ({ children }) => <Wrapper registry={registry}>{children}</Wrapper>,
            })
            await result.current.reload({ global: false, remount: true })
            const nav = (globalThis as { __rootNavigate?: { reload: ReturnType<typeof vi.fn> } }).__rootNavigate!
            expect(nav.reload).toHaveBeenCalledWith({ global: false, remount: true })
        })

        it('reload до инициализации client-entry — полная перезагрузка', () => {
            const g = globalThis as { __rootNavigate?: unknown }
            const saved = g.__rootNavigate
            delete g.__rootNavigate
            try {
                // jsdom не даёт подменить location.reload — проверяем, что
                // запасной навигатор реализует метод и не падает на сервере.
                expect(typeof getRouter().reload).toBe('function')
            } finally {
                g.__rootNavigate = saved
            }
        })

        it('getRouter работает вне <RootProvider>', async () => {
            await getRouter().push('/about')
            const nav = (globalThis as { __rootNavigate?: { push: ReturnType<typeof vi.fn> } }).__rootNavigate!
            expect(nav.push).toHaveBeenCalledWith('/about')
        })

        it('useRouter не требует <RootProvider>', () => {
            const { result } = renderHook(() => useRouter())
            expect(typeof result.current.push).toBe('function')
        })

        it('до инициализации client-entry — запасной навигатор', () => {
            const g = globalThis as { __rootNavigate?: unknown }
            const saved = g.__rootNavigate
            delete g.__rootNavigate
            try {
                const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
                getRouter().back()
                expect(back).toHaveBeenCalled()
                back.mockRestore()
            } finally {
                g.__rootNavigate = saved
            }
        })
    })

    describe('<Link>', () => {
        it('рендерит <a> с href и className', () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about" className="nav-link">
                        About
                    </Link>
                </Wrapper>,
            )
            const a = container.querySelector('a')!
            expect(a.getAttribute('href')).toBe('/about')
            expect(a.className).toBe('nav-link')
            expect(a.textContent).toBe('About')
        })

        it('click вызывает push', async () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about">About</Link>
                </Wrapper>,
            )
            fireEvent.click(container.querySelector('a')!)
            await new Promise((r) => setTimeout(r, 0))
            const nav = (globalThis as { __rootNavigate?: { push: ReturnType<typeof vi.fn> } }).__rootNavigate!
            expect(nav.push).toHaveBeenCalledWith('/about')
        })

        it('Ctrl+Click не перехватывается', async () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about">About</Link>
                </Wrapper>,
            )
            fireEvent.click(container.querySelector('a')!, { ctrlKey: true })
            await new Promise((r) => setTimeout(r, 0))
            const nav = (globalThis as { __rootNavigate?: { push: ReturnType<typeof vi.fn> } }).__rootNavigate!
            expect(nav.push).not.toHaveBeenCalled()
        })

        it('prefetch on hover', async () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about" prefetch>
                        About
                    </Link>
                </Wrapper>,
            )
            fireEvent.mouseOver(container.querySelector('a')!)
            await new Promise((r) => setTimeout(r, 0))
            const nav = (
                globalThis as {
                    __rootNavigate?: { prefetch: ReturnType<typeof vi.fn> }
                }
            ).__rootNavigate!
            expect(nav.prefetch).toHaveBeenCalledWith('/about')
        })

        it('без prefetch — hover не вызывает prefetch', async () => {
            const { container } = render(
                <Wrapper registry={registry}>
                    <Link href="/about">About</Link>
                </Wrapper>,
            )
            fireEvent.mouseOver(container.querySelector('a')!)
            await new Promise((r) => setTimeout(r, 0))
            const nav = (
                globalThis as {
                    __rootNavigate?: { prefetch: ReturnType<typeof vi.fn> }
                }
            ).__rootNavigate!
            expect(nav.prefetch).not.toHaveBeenCalled()
        })
    })
})
