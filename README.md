# Authzed TS

This project wraps [`@authzed/autzed-node`][authzed-node] and provides a higher
level interface with optional type-safety through code generation.

The API is meant to somewhat mimic the zed-cli.

[authzed-node]: https://www.npmjs.com/package/@authzed/authzed-node

## Usage

### Code generation

```sh
npm install --save-dev @authzed-ts/generator
```

You'll need your schema either in a `.zed` or `.zaml` file (`.yaml` also works,
it just needs to have a `schema` property in the root of the document)
containing your schema, or you can provide a token to fetch it from a SpiceDB
server.

This package only provides the command `zed-ts-gen` which you can use to create
a ts file with the necessary types to make `@authzed-ts/client` type-safe,
for details on how to do that, see ``

### Client

```sh
npm install @authzed-ts/client
```

Whilst the client does work without the code-generation piece and provides a
more abstracted interface to `@authzed/authzed-node` out of the box, it's
of course recommended to use it with the code generation, so assuming you've
generated an output file at `./client-type.ts` you can then create your client as
follows

```ts
import { v1 } from '@authzed/authzed-node'
import { ZedClient } from '@authzed-ts/client'
import { ZedClientType } from './client-type'

// You pass a client you created yourself so you can have full control over auth
// and certificates, etc. which are created using different methods on `v1`
const _client = v1.NewClient()

export const zedClient = new ZedClient<ZedClientType>(_client)

// the order is like a permission tuple, resource, permission, subject
void zedClient.checkPermission(['document', 1], 'group', ['group', 1])

void zedClient.lookupResources('document', 'group', ['group', 1], { caveatContext: { a: 1, c: { d: 'e' } } })
void zedClient.lookupResources('document', 'group', ['group', 1])

void zedClient.writeRelationships([
  zedClient.defineWriteRelationship(['document', 1], 'group', ['group', 1]),
  zedClient.defineWriteRelationship(['document', 1], 'reader', ['user', 1])
])
```
