import { createInterface, type Interface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

/** Интерактивный ввод. */
export interface Prompter {
    /**
     * Задаёт вопрос со свободным ответом.
     *
     * @param question текст вопроса.
     * @returns ответ пользователя (может быть пустым).
     */
    text(question: string): Promise<string>
    /**
     * Задаёт вопрос да/нет.
     *
     * @param question текст вопроса.
     * @param defaultValue ответ по Enter.
     * @returns ответ.
     */
    confirm(question: string, defaultValue: boolean): Promise<boolean>
    /**
     * Предлагает выбрать один вариант.
     *
     * @param question текст вопроса.
     * @param options варианты.
     * @param defaultIndex индекс варианта по Enter.
     * @returns выбранное значение.
     */
    select<T extends string>(
        question: string,
        options: ReadonlyArray<{ value: T; label: string }>,
        defaultIndex: number,
    ): Promise<T>
    /** Закрывает readline. */
    close(): void
}

/**
 * Создаёт промптер на stdin/stdout.
 *
 * Без внешних зависимостей: номер варианта или имя пакетного менеджера.
 * Стрелочное меню потребовало бы raw-mode и ручной обработки клавиш — для
 * MVP это лишняя сложность и ещё один источник багов на Windows.
 *
 * @param input поток ввода.
 * @param output поток вывода.
 * @returns промптер.
 */
export function createPrompter(input = stdin, output = stdout): Prompter {
    const rl: Interface = createInterface({ input, output })

    // Ctrl+C во время вопроса: readline не всегда бросает AbortError.
    rl.on('SIGINT', () => {
        output.write('\nОтменено\n')
        rl.close()
        process.exit(130)
    })

    /**
     * Печатает вопрос.
     *
     * @param question текст.
     * @returns ответ.
     */
    const ask = async (question: string): Promise<string> => {
        const answer = await rl.question(question)
        return answer.trim()
    }

    return {
        async text(question: string): Promise<string> {
            return ask(`${question}: `)
        },

        async confirm(question: string, defaultValue: boolean): Promise<boolean> {
            const hint = defaultValue ? 'Y/n' : 'y/N'
            for (;;) {
                const answer = (await ask(`${question} (${hint}): `)).toLowerCase()
                if (answer === '') return defaultValue
                if (['y', 'yes', 'д', 'да'].includes(answer)) return true
                if (['n', 'no', 'н', 'нет'].includes(answer)) return false
                output.write('Ответьте "y" или "n".\n')
            }
        },

        async select<T extends string>(
            question: string,
            options: ReadonlyArray<{ value: T; label: string }>,
            defaultIndex: number,
        ): Promise<T> {
            output.write(`${question}:\n`)
            options.forEach((option, index) => {
                const marker = index === defaultIndex ? ' (по умолчанию)' : ''
                output.write(`  ${index + 1}) ${option.label}${marker}\n`)
            })

            for (;;) {
                const answer = await ask(`Выбор [${defaultIndex + 1}]: `)
                if (answer === '') return options[defaultIndex]!.value

                const byNumber = Number(answer)
                if (Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= options.length) {
                    return options[byNumber - 1]!.value
                }

                const byValue = options.find(
                    (option) => option.value === answer || option.value === answer.toLowerCase(),
                )
                if (byValue) return byValue.value

                output.write(`Введите номер 1–${options.length} или имя варианта.\n`)
            }
        },

        close(): void {
            rl.close()
        },
    }
}
