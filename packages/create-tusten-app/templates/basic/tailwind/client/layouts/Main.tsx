import type { JSX } from 'react'
import { Link, Outlet } from '@tusten/core/client'

/**
 * Основной layout приложения.
 *
 * @returns JSX-элемент.
 */
export default function Main(): JSX.Element {
    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                <Link className="text-lg font-bold text-indigo-600" href="/">
                    tusten
                </Link>
                <nav className="text-sm text-slate-600">
                    <Link className="hover:text-slate-900" href="/">
                        Главная
                    </Link>
                </nav>
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                <Outlet />
            </main>
            <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
                tusten · React 19 · Fastify · Vite
            </footer>
        </div>
    )
}
