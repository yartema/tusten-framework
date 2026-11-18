import { JSX, ReactNode } from 'react'
import { getNavigation } from '@tusten/core'
import { Link, Outlet, usePathname, useSlice } from '@tusten/core/client'
import type { UserInfoSlice } from '../User/loaders/userInfo'

/** Демо-slug для динамического пункта «Blog»: каталог сам URL не придумывает. */
const BLOG_DEMO_SLUG = 'hello'

/**
 * Основной layout: header с навигацией, main, footer.
 * @returns JSX-элемент.
 */
export default function Main(): JSX.Element {
    return (
        <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
            <Header />
            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                <Outlet />
            </main>
            <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
                tusten · React 19 · Fastify · Vite
            </footer>
        </div>
    )
}

/**
 * Шапка с логотипом и навигацией.
 *
 * @returns JSX-элемент.
 */
function Header(): JSX.Element {
    const user = useSlice<UserInfoSlice>('userInfo')
    const permissions = user?.state?.permissions

    // Каталог статичен, а права и выбранный slug — прикладные данные:
    // фильтр и сортировка считаются в рендере, чтобы обновиться после логина.
    const items = getNavigation()
        .filter((item) => (typeof item.permission === 'string' ? permissions?.get(item.permission) === true : true))
        .map((item) => (item.dynamic && item.id === 'blog' ? { ...item, href: `/blog/${BLOG_DEMO_SLUG}` } : item))
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))

    return (
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2 text-lg font-bold">
                    <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-sm font-mono text-white">tusten</span>
                    <span className="text-slate-700">demo</span>
                </Link>
                <nav className="flex gap-1">
                    {items.map((item) => {
                        const title = typeof item.title === 'string' ? item.title : item.id
                        return item.href ? (
                            <NavLink key={item.id} href={item.href}>
                                {title}
                            </NavLink>
                        ) : (
                            <span key={item.id} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-400">
                                {title}
                            </span>
                        )
                    })}
                </nav>
            </div>
        </header>
    )
}

/** Пропсы `NavLink`. */
interface NavLinkProps {
    /** Целевой путь. */
    href: string
    /** Текст. */
    children: ReactNode
}

/**
 * Навигационная ссылка с active-состоянием.
 *
 * @param props пропсы.
 * @returns JSX-элемент.
 */
function NavLink(props: NavLinkProps): JSX.Element {
    const path = usePathname()
    const isActive = path === props.href

    return (
        <Link
            href={props.href}
            className={
                'rounded-md px-3 py-1.5 text-sm font-medium transition ' +
                (isActive ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
            }
        >
            {props.children}
        </Link>
    )
}
