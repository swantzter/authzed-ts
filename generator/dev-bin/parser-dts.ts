import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { generateCstDts } from 'chevrotain'
import { zedParser } from '../lib/parser.js'

const dtsString = generateCstDts(zedParser.getGAstProductions())
const dtsPath = resolve(__dirname, '..', 'lib', 'zed_cst.d.ts')
writeFileSync(dtsPath, dtsString, 'utf-8')
