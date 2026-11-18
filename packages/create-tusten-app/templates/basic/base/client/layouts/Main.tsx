import type { JSX } from 'react'
import { Link, Outlet } from '@tusten/core/client'

/**
 * Основной layout приложения.
 *
 * @returns JSX-элемент.
 */
export default function Main(): JSX.Element {
    return (
        <div className="app">
            <header className="header">
                <Link className="logo" href="/">
                    tusten
                </Link>
                <nav className="nav">
                    <Link href="/">Главная</Link>
                </nav>
            </header>
            <main className="main">
                <Outlet />
            </main>
            <footer className="footer">tusten · React 19 · Fastify · Vite</footer>
        </div>
    )
}
