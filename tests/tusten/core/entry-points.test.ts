import { describe, expect, it } from 'vitest'
import * as core from '../../../packages/tusten/src/index'
import * as client from '../../../packages/tusten/src/client/index'
import * as server from '../../../packages/tusten/src/server'

/**
 * Имена рантайм-экспортов, которые есть в обоих пространствах.
 *
 * @param a первый entry point.
 * @param b второй entry point.
 * @returns пересечение имён.
 */
function intersection(a: object, b: object): string[] {
    const other = new Set(Object.keys(b))
    return Object.keys(a).filter((key) => other.has(key))
}

describe('entry points: нет дублирующих экспортов', () => {
    it('core ↔ client', () => {
        expect(intersection(core, client)).toEqual([])
    })

    it('core ↔ server', () => {
        expect(intersection(core, server)).toEqual([])
    })

    it('client ↔ server', () => {
        expect(intersection(client, server)).toEqual([])
    })

    it('defineConfig — только в core', () => {
        expect('defineConfig' in core).toBe(true)
        expect('defineConfig' in client).toBe(false)
        expect('defineConfig' in server).toBe(false)
    })
})
