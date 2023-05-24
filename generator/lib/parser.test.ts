/* eslint-env mocha */
import assert from 'node:assert'
import { parse } from './parser'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = fileURLToPath(new URL('.', import.meta.url))

describe('ZedParser', () => {
  describe('full_example.zed', () => {
    const fullExample = readFileSync(path.resolve(__dirname, '../../test/schemas/full_example.zed'), 'utf-8')

    it('Parses without error', () => {
      assert.doesNotThrow(() => {
        try {
          const result = parse(fullExample)
          writeFileSync(path.resolve(__dirname, '../../test/schemas/full_example.json'), JSON.stringify(result, null, 2), 'utf-8')
        } catch (err) {
          console.error(err)
          throw err
        }
      })
    })
  })
})
