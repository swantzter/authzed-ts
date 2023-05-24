import { parseArgs } from 'node:util'
import { loadFromDb, loadFromFile, watchFile } from '../lib/schema'
import { parse } from '../lib/parser'
import { type RootAstNode, zedVisitor } from '../lib/visitor'
import { generate } from '../lib/generator'

const args = parseArgs({
  options: {
    output: {
      type: 'string',
      short: 'o'
    },
    file: {
      type: 'string',
      short: 'f'
    },
    // 'permission-system': {
    //   type: 'string'
    // },
    token: {
      type: 'string',
      short: 't'
    },
    'certificate-path': {
      type: 'string'
    },
    endpoint: {
      type: 'string'
    },
    insecure: {
      type: 'boolean'
    },
    watch: {
      type: 'boolean'
    }
  }
})

function printUsage () {
  console.log(`Command Line to generate types for @authzed-ts/client

Usage:
  zed-ts-gen --output <path> --file <path> [--watch]
  zed-ts-gen --output <path> --token <token> [--certificate-path <path>] [--endpoint <domain:port>]

Flags:
  -o, --output <path>           File to output the generated client to
  -f, --file <path>             Path to a .zed or .zaml file containing the schema
  -t, --token <token>           Token used to authenticate to SpiceDB for remote schema
      --certificate-path <path> path to certificate authoriy used to verify secure connections
      --watch                   Watch for changes to the schema and auto regenerate types
`)
}

function validateArgs () {
  if (args.values.output == null) {
    console.error('--output is required')
    printUsage()
    return process.exit(1)
  }
  if (args.values.file == null && args.values.token == null) {
    console.error('Either --file, or --token has to be provided')
    printUsage()
    return process.exit(1)
  }
  if (args.values.file && [args.values.token, args.values['certificate-path']].some(v => v != null)) {
    console.error('--token, --permission-system, and --certificate-path are not valid options when --file is provided')
    printUsage()
    return process.exit(1)
  }
  if (args.values.token != null && !!args.values.watch) {
    console.error('Watch mode not yet implemented for remote schema')
    printUsage()
    return process.exit(1)
  }
}

async function processSchema (outputFile: string, schema: string) {
  const cst = parse(schema)
  const ast: RootAstNode[] = zedVisitor.visit(cst)

  await generate(outputFile, ast)
}

async function run () {
  validateArgs()

  if (args.values.watch) {
    watchFile(args.values.file!, async schema => {
      try {
        await processSchema(args.values.output!, schema)
      } catch (err) {
        console.warn(err)
      }
    })
  } else {
    let schema
    if (args.values.file) {
      schema = await loadFromFile(args.values.file)
    } else {
      schema = await loadFromDb({
        token: args.values.token!,
        endpoint: args.values.endpoint,
        certificatePath: args.values['certificate-path'],
        insecure: args.values.insecure
      })
    }

    await processSchema(args.values.output!, schema)
  }
}

run()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
