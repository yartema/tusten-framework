import { afterEach, describe, expect, it } from 'vitest'
import { DEV_ERROR_HOOK, reportDevError, type DevErrorReporter } from '../../../packages/tusten/src/client/dev-report'

const globalStore = globalThis as unknown as Record<string, unknown>

afterEach(() => {
    delete globalStore[DEV_ERROR_HOOK]
})

describe('reportDevError', () => {
    it('без хука ничего не делает', () => {
        expect(() => reportDevError(new Error('x'))).not.toThrow()
    })

    it('передаёт ошибку и источник установленному хуку', () => {
        const calls: Array<[unknown, string | undefined]> = []
        const reporter: DevErrorReporter = (error, source) => calls.push([error, source])
        globalStore[DEV_ERROR_HOOK] = reporter

        const error = new Error('x')
        reportDevError(error, 'boundary')
        reportDevError('text')

        expect(calls).toHaveLength(2)
        expect(calls[0]).toEqual([error, 'boundary'])
        expect(calls[1]).toEqual(['text', 'client'])
    })
})
