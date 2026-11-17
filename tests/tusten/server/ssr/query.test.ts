import { describe, expect, it } from 'vitest'
import { queryToObject } from '../../../../packages/tusten/src/server/ssr/query'

describe('queryToObject', () => {
    it('без query — пустой объект', () => {
        expect(queryToObject('/page')).toEqual({})
    })

    it('разбирает пары и `+` как пробел', () => {
        expect(queryToObject('/page?a=1&b=hello+world')).toEqual({ a: '1', b: 'hello world' })
    })

    it('при повторе ключа побеждает последнее значение', () => {
        expect(queryToObject('/page?tag=a&tag=b')).toEqual({ tag: 'b' })
    })

    it('битый percent-encoding не бросает', () => {
        expect(() => queryToObject('/page?q=%')).not.toThrow()
        expect(queryToObject('/page?q=%')).toEqual({ q: '%' })
    })
})
