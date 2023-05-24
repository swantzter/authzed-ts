import { parseArgs } from 'node:util'
import { loadFromDb, loadFromFile, watchFile } from '../lib/schema.js'
import { parse } from '../lib/parser.js'
import { type RootAstNode, zedVisitor } from '../lib/visitor.js'
import { generate } from '../lib/generator.js'

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
    },
    help: {
      type: 'boolean',
      short: 'h'
    }
  }
})

async function printUsage () {
  await new Promise<void>(resolve => {
    process.stderr.write(`Command Line to generate types for @authzed-ts/client

Usage:
  zed-ts-gen --output <path> --file <path> [--watch]
  zed-ts-gen --output <path> --token <token> [--certificate-path <path>] [--endpoint <domain:port>]

Flags:
  -o, --output <path>           File to output the generated client to
  -f, --file <path>             Path to a .zed or .zaml file containing the schema
  -t, --token <token>           Token used to authenticate to SpiceDB for remote schema
      --certificate-path <path> path to certificate authoriy used to verify secure connections
      --watch                   Watch for changes to the schema and auto regenerate types
  -h, --help                    Show this message
`, () => { resolve() })
  })
}

async function validateArgs () {
  if (args.values.help) {
    await printUsage()
    return process.exit(0)
  }
  if (args.values.output == null) {
    await printUsage()
    console.error('\n--output is required')
    return process.exit(1)
  }
  if (args.values.file == null && args.values.token == null) {
    await printUsage()
    console.error('\nEither --file, or --token has to be provided')
    return process.exit(1)
  }
  if (args.values.file && [args.values.token, args.values['certificate-path']].some(v => v != null)) {
    await printUsage()
    console.error('\n--token, --permission-system, and --certificate-path are not valid options when --file is provided')
    return process.exit(1)
  }
  if (args.values.token != null && !!args.values.watch) {
    await printUsage()
    console.error('\nWatch mode not yet implemented for remote schema')
    return process.exit(1)
  }
}

async function processSchema (outputFile: string, schema: string) {
  const cst = parse(schema)
  const ast: RootAstNode[] = zedVisitor.visit(cst)

  await generate(outputFile, ast)
}

async function run () {
  await validateArgs()

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
