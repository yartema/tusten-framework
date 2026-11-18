import { describe, expect, it } from 'vitest'
import {
    IMMUTABLE_CACHE_CONTROL,
    REVALIDATE_CACHE_CONTROL,
    resolveStaticCacheControl,
} from '../../../packages/tusten/src/server/static-cache'

describe('resolveStaticCacheControl', () => {
    it('хэшированные чанки и ассеты — immutable', () => {
        expect(resolveStaticCacheControl('/project/dist/client/chunks/HomePage-a1b2c3d4.js')).toBe(
            IMMUTABLE_CACHE_CONTROL,
        )
        expect(resolveStaticCacheControl('/project/dist/client/assets/index-9f8e7d6c.css')).toBe(
            IMMUTABLE_CACHE_CONTROL,
        )
    })

    it('Windows-разделители нормализуются', () => {
        expect(resolveStaticCacheControl('C:\\app\\dist\\client\\chunks\\View-0a1b2c3d.js')).toBe(
            IMMUTABLE_CACHE_CONTROL,
        )
    })

    it('client.js не хэшируется — только ревалидация', () => {
        expect(resolveStaticCacheControl('/project/dist/client/client.js')).toBe(REVALIDATE_CACHE_CONTROL)
    })

    it('хэшированный entry в assets — immutable', () => {
        expect(resolveStaticCacheControl('/project/dist/client/assets/client-entry-1a2b3c4d.js')).toBe(
            IMMUTABLE_CACHE_CONTROL,
        )
    })

    it('суффикс предсжатия не мешает правилу', () => {
        expect(resolveStaticCacheControl('/project/dist/client/assets/client-entry-1a2b3c4d.js.br')).toBe(
            IMMUTABLE_CACHE_CONTROL,
        )
        expect(resolveStaticCacheControl('/project/dist/client/client.js.gz')).toBe(REVALIDATE_CACHE_CONTROL)
    })

    it('файлы из public — ревалидация', () => {
        expect(resolveStaticCacheControl('/project/public/robots.txt')).toBe(REVALIDATE_CACHE_CONTROL)
        expect(resolveStaticCacheControl('/project/public/logo-abc123.svg')).toBe(REVALIDATE_CACHE_CONTROL)
    })

    it('хэш вне chunks/assets не считается immutable', () => {
        expect(resolveStaticCacheControl('/project/dist/client/other/file-a1b2c3d4.js')).toBe(REVALIDATE_CACHE_CONTROL)
    })

    it('слишком короткий «хэш» не считается immutable', () => {
        expect(resolveStaticCacheControl('/project/dist/client/chunks/file-ab12.js')).toBe(REVALIDATE_CACHE_CONTROL)
    })

    it('вложенные каталоги внутри assets поддерживаются', () => {
        expect(resolveStaticCacheControl('/project/dist/client/assets/fonts/inter-1a2b3c4d.woff2')).toBe(
            IMMUTABLE_CACHE_CONTROL,
        )
    })
})
