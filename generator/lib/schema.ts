import path from 'node:path'
import { readFileSync, watch } from 'node:fs'
import { parse } from 'yaml'
import { v1 } from '@authzed/authzed-node'

export async function loadFromFile (filePath: string) {
  const fullPath = path.resolve(process.cwd(), filePath)
  const schemaOrZaml = readFileSync(fullPath, 'utf-8')

  // Attempt YAML parsing in case it's a .zaml file
  try {
    const yaml = parse(schemaOrZaml)
    return yaml.schema
  } catch {}

  // if it isn't, we assume this is a .zed file
  return schemaOrZaml
}

export function watchFile (filePath: string, watcher: (schema: string) => Promise<void> | void) {
  const fullPath = path.resolve(process.cwd(), filePath)

  watch(fullPath, 'utf-8', (event, filePath) => {
    void loadFromFile(filePath)
      .then(schema => { void watcher(schema)?.catch() })
      .catch(err => {
        console.error(new Error('Failed to watch file', { cause: err }))
        process.exit(1)
      })
  })
}

interface LoadFromDbOptions {
  endpoint?: string
  token: string
  certificatePath?: string
  insecure?: boolean
}
export async function loadFromDb (options: LoadFromDbOptions) {
  let client: v1.ZedPromiseClientInterface
  if (options.certificatePath) {
    const fullCertPath = path.resolve(process.cwd(), options.certificatePath)
    const certificate = readFileSync(fullCertPath)
    const defaultClient = v1.NewClientWithCustomCert(
      options.token,
      options.endpoint,
      certificate
    )
    client = defaultClient.promises
  } else {
    const defaultClient = v1.NewClient(
      options.token,
      options.endpoint,
      options.insecure ? v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS : v1.ClientSecurity.SECURE
    )
    client = defaultClient.promises
  }

  const schemaResp = await client.readSchema(v1.ReadSchemaRequest.create({}))

  return schemaResp.schemaText
}
