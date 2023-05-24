/* eslint-disable no-lone-blocks */
import { mkdirSync, writeFileSync } from 'node:fs'
import type { ParameterTypeAstNode, RootAstNode } from './visitor.js'
import path from 'node:path'
import dedent from 'dedent'

// TODO: implement locks so generations happen in series when watching

const caveatSimpleTypeToTypescriptType = {
  any: 'any',

  int: 'number',
  uint: 'number',
  double: 'number',

  bool: 'boolean',

  string: 'string',
  bytes: 'string',
  duration: 'string',
  timestamp: 'string',
  ipaddress: 'string'
}
function isCaveatSimpleType (k: string): k is keyof typeof caveatSimpleTypeToTypescriptType {
  return k in caveatSimpleTypeToTypescriptType
}

function caveatTypeToTsType (caveatType: ParameterTypeAstNode): string {
  if (caveatType.type === 'SIMPLE_PARAMETER_TYPE') {
    if (!isCaveatSimpleType(caveatType.name)) throw new TypeError(`Unknown simple Zed type ${caveatType.name} found in Ast`)
    return caveatSimpleTypeToTypescriptType[caveatType.name]
  } else {
    switch (caveatType.name) {
      case 'map': {
        if (caveatType.typeArgs.length !== 1) throw new TypeError('Invalid number of type arguments given to map, should be exactly one')
        return `Record<string, ${caveatType.typeArgs.map(ta => caveatTypeToTsType(ta)).join(', ')}>`
      }
      case 'list': {
        if (caveatType.typeArgs.length !== 1) throw new TypeError('Invalid number of type arguments given to list, should be exactly one')
        return `Array<${caveatType.typeArgs.map(ta => caveatTypeToTsType(ta)).join(', ')}>`
      }
      default:
        throw new TypeError(`Unknown complex Zed type ${caveatType.name} found in Ast`)
    }
  }
}

interface Definitions {
  caveats: Record<string, Record<string, unknown>>
  objects: Record<string, {
    permissions: Record<string, Record<string, Array<{ targetObject: string, permission: string } | { targetObject: string, relation: string }>>>
    relations: Record<string, Record<string, { wildcard: boolean, caveat: string[] }>>
  }>
}

export async function generate (targetPath: string, ast: RootAstNode[]) {
  /**
   * To do this with validation the easiest is probably to do it in a couple
   * passes, we're essentially converting from our custom Ast to another
   * custom tree that we can convert easily into ts without much logic
   *
   * 1. Create records with all our definitions as keys, one object for
   *    caveats, one for objects.
   * 2. Add in all our relation names and permission names to those definitions
   * 3. Add detail to those, since we can now check if a permission or relation
   *    exists on another object, or if a caveat exists in the schema
   */

  const definitions: Definitions = {
    caveats: {},
    objects: {}
  }

  // 1. prepare our tree with all object and caveat root types,
  // as well as all caveat parameter types and object relation- and permission-
  // names, this allows lookups and validation in pass 2
  for (const definition of ast) {
    switch (definition.type) {
      case 'CAVEAT_DEFINITION':
        definitions.caveats[definition.name] = Object.fromEntries(definition.parameters.map(p => [p.name, caveatTypeToTsType(p.parameterType)]))
        break
      case 'OBJECT_DEFINITION':
        definitions.objects[definition.name] = {
          permissions: Object.fromEntries(definition.permissions.map(p => [p.name, {}])),
          relations: Object.fromEntries(definition.relations.map(r => [r.name, {}]))
        }
        break
      default:
        throw new Error(`Invalid root Ast node ${(definition as any).type}`)
    }
  }

  // TODO: const unresolvedSubRelations = []
  // 2. create all the information about each relation and permission,
  // namely what the allowed subject types are, and what caveat parameters
  // can be passed
  for (const definition of ast) {
    if (definition.type !== 'OBJECT_DEFINITION') continue
    const currentObj = definitions.objects[definition.name]!

    for (const relation of definition.relations) {
      currentObj.relations[relation.name] ??= {}
      for (const objRef of relation.objectReferences) {
        currentObj.relations[relation.name][objRef.name] ??= {
          caveat: [],
          wildcard: false
        }

        if (objRef.caveat) currentObj.relations[relation.name][objRef.name].caveat.push(objRef.caveat)
        if (objRef.wildcard) currentObj.relations[relation.name][objRef.name].wildcard = true
      }
    }

    for (const permission of definition.permissions) {
      currentObj.permissions[permission.name] ??= {}
      for (const objRef of permission.expression) {
        if (objRef.type === 'NIL') continue
        if (objRef.target) {
          const key = `${objRef.name}->${objRef.target}`
          // We've already processed this reference, but it might've been included again in another parenthesis or what have you
          if (key in currentObj.permissions[permission.name]) continue

          const resolvedRelation = currentObj.relations[objRef.name]
          if (!resolvedRelation) throw new TypeError(`Left hand of arrow expression must reference a relation in the same object, '${key}' on '${definition.name}' does not`)

          // TODO: resolveArrowReference(definitions.objects, resolvedRelation, objRef.target)
        } else {
          // We've already processed this reference, but it might've been included again in another parenthesis or what have you
          if (objRef.name in currentObj.permissions[permission.name]) continue
          const targetsRelation = Object.keys(currentObj.relations).includes(objRef.name)

          if (targetsRelation && !(objRef.name in currentObj.relations)) throw new TypeError(`Targetting unknown relation '${objRef.name}' in '${definition.name}'`)
          else if (!targetsRelation && !(objRef.name in currentObj.permissions)) throw new TypeError(`Targetting unknown permission '${objRef.name}' in '${definition.name}'`)

          currentObj.permissions[permission.name][objRef.name] ??= [{
            targetObject: definition.name,
            ...(targetsRelation ? { relation: objRef.name } : { permission: objRef.name })
          }]
        }
      }
    }
  }

  // 3. Third pass to resolve thing#otherThing

  console.dir(definitions, { depth: Infinity })

  // 4. Render to TS
  const code = render(definitions)
  console.log(code)

  const fullPath = path.resolve(process.cwd(), targetPath)
  mkdirSync(path.dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, code, 'utf-8')
}

function render (definitions: Definitions) {
  function i (text: string) {
    return text.split('\n').map(t => `${' '.repeat(ind)}${t}`).join('\n')
  }
  const sections: string[] = []
  let ind = 0

  sections.push(i('export type ZedClientType = {'))
  ind += 2
  {
    sections.push(i('caveats: {'))
    ind += 2
    {
      for (const [name, types] of Object.entries(definitions.caveats)) {
        sections.push(i(`'${name}': {`))
        ind += 2

        for (const [param, type] of Object.entries(types)) {
          sections.push(i(`'${param}': ${type}`))
        }

        ind -= 2
        sections.push(i('}'))
      }
    }
    ind -= 2
    sections.push(i('}'))

    sections.push(i('objects: {'))
    ind += 2
    {
      for (const [name, { permissions, relations }] of Object.entries(definitions.objects)) {
        sections.push(i(`'${name}': {`))
        ind += 2

        if (Object.keys(permissions).length === 0) {
          sections.push(i('permissions: {}'))
        } else {
          sections.push(i('permissions: {'))
          ind += 2

          for (const [name, pointers] of Object.entries(permissions)) {
            if (Object.keys(pointers).length === 0) {
              sections.push(i(`'${name}': never`))
            } else {
              sections.push(i(`'${name}':`))
              const flatPointers = Object.values(pointers)
                .flat()
                .map(p => dedent`{
                  subjectType: ${
                    'permission' in p
                      ? `ZedClientType['objects']['${p.targetObject}']['permissions']['${p.permission}']['subjectType']`
                      : `keyof ZedClientType['objects']['${p.targetObject}']['relations']['${p.relation}']`
                  }
                  caveat: ${
                    'permission' in p
                      ? `ZedClientType['objects']['${p.targetObject}']['permissions']['${p.permission}']['caveat']`
                      : `ZedClientType['objects']['${p.targetObject}']['relations']['${p.relation}'][keyof ZedClientType['objects']['${p.targetObject}']['relations']['${p.relation}']]['caveat']`
                  }
                }`)
                .join(' | ')
              sections.push(i(flatPointers))
            }
          }

          ind -= 2
          sections.push(i('}'))
        }

        if (Object.keys(relations).length === 0) {
          sections.push(i('relations: {}'))
        } else {
          sections.push(i('relations: {'))
          ind += 2

          for (const [name, meta] of Object.entries(relations)) {
            sections.push(i(`'${name}': {`))
            ind += 2

            for (const [objType, { caveat, wildcard }] of Object.entries(meta)) {
              sections.push(i(`'${objType}': {`))
              ind += 2

              sections.push(i(`caveat: ${caveat.length === 0 ? 'never' : caveat.map(c => `'${c}'`).join(' | ')}`))
              sections.push(i(`wildcard: ${wildcard}`))

              ind -= 2
              sections.push(i('}'))
            }

            ind -= 2
            sections.push(i('}'))
          }

          ind -= 2
          sections.push(i('}'))
        }

        ind -= 2
        sections.push(i('}'))
      }
    }
    ind -= 2
    sections.push(i('}'))
  }
  ind -= 2
  sections.push(i('}\n'))

  return sections.join('\n')
}
