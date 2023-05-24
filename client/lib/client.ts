import { v1 } from '@authzed/authzed-node'

export interface ZedIdTransformer {
  /** Takes application-code ID and returns Authzed friendly ID */
  serialize: (objectId: string) => string
  /** Takes Authzed friendly ID and returns application-code ID */
  parse: (objectId: string) => string
}

export interface ZedClientConstructorArgs {
  /** Optionally the default prefix prepended for all your resources */
  defaultPermissionSystem?: string
  /**
   * Optional functions that all object ID's will be passed through converting
   * between your ID's and Authzed ID's. Primarily useful if you have disallowed
   * characters in your ID's like `.` and want to replace it with something else
   */
  idTransformer?: ZedIdTransformer
}

export interface SchemaMetadata {
  caveats: Record<string, Record<string, unknown>>
  objects: Record<string, {
    permissions: Record<string, {
      subjectType: keyof SchemaMetadata['objects'][string]['relations'][string]
      caveat: keyof SchemaMetadata['caveats']
    }>
    relations: Record<string, Record<string, {
      caveat: keyof SchemaMetadata['caveats']
      wildcard: boolean
    }>>
  }>
}

interface BoolConsistency {
  type: 'minimizeLatency' | 'fullyConsistent'
}
interface TokenConsistency {
  type: 'atLeastAsFresh' | 'atExactSnapshot'
  token: string
}
type Consistency = BoolConsistency | TokenConsistency

export interface CheckPermissionOptions <CaveatContext extends Record<string, unknown>> {
  consistency?: Consistency
  caveatContext?: Partial<CaveatContext>
}

export interface LookupResourcesOptions <CaveatContext extends Record<string, unknown>> {
  consistency?: Consistency
  caveatContext?: Partial<CaveatContext>
}

export interface DefineWriteRelationshipOptions <M extends SchemaMetadata, CaveatName extends keyof M['caveats']> {
  operation?: 'TOUCH' | 'CREATE' | 'DELETE'
  caveatName?: CaveatName
  caveatContext?: Partial<M['caveats'][CaveatName]>
}

type WriteRelationshipsInternalOptions = Brand<{
  resource: [string, string | number]
  relation: string
  subject: [string, string | number] | [string, string | number, string]
  options: DefineWriteRelationshipOptions<SchemaMetadata, keyof SchemaMetadata['caveats']>
}, 'authzed-ts-write-relationship'>

type Brand<K, T> = K & { __brand: T }

export class ZedClient <M extends SchemaMetadata> {
  private readonly client: v1.ZedPromiseClientInterface
  public readonly defaultPermissionSystem?: string
  public readonly idTransformer?: ZedIdTransformer

  constructor (client: v1.ZedClientInterface, options: ZedClientConstructorArgs = {}) {
    this.client = client.promises
    this.defaultPermissionSystem = options.defaultPermissionSystem
    this.idTransformer = options.idTransformer
  }

  private prefixObjectType (objectType: string) {
    return !this.defaultPermissionSystem && !objectType.includes('/')
      ? `${this.defaultPermissionSystem}/${objectType}`
      : objectType
  }

  private getConsistency (consistency?: Consistency) {
    if (!consistency) return
    switch (consistency.type) {
      case 'fullyConsistent':
        return v1.Consistency.create({
          requirement: {
            oneofKind: 'fullyConsistent',
            fullyConsistent: true
          }
        })
      case 'minimizeLatency':
        return v1.Consistency.create({
          requirement: {
            oneofKind: 'minimizeLatency',
            minimizeLatency: true
          }
        })
      case 'atLeastAsFresh':
        return v1.Consistency.create({
          requirement: {
            oneofKind: 'atLeastAsFresh',
            atLeastAsFresh: v1.ZedToken.create({ token: consistency.token })
          }
        })
      case 'atExactSnapshot':
        return v1.Consistency.create({
          requirement: {
            oneofKind: 'atExactSnapshot',
            atExactSnapshot: v1.ZedToken.create({ token: consistency.token })
          }
        })
      default:
        throw new TypeError('Invalid consistency type provided')
    }
  }

  private getObjectRef (objectType: string, objectId: string | number) {
    return v1.ObjectReference.create({
      objectType: this.prefixObjectType(objectType),
      objectId: this.idTransformer?.serialize(`${objectId}`) ?? `${objectId}`
    })
  }

  private getSubjectRef (subjectType: string, subjectId: string | number, relation?: string) {
    return v1.SubjectReference.create({
      object: this.getObjectRef(subjectType, subjectId),
      optionalRelation: relation
    })
  }

  // ===========================================================================
  // Permissions
  // ===========================================================================
  async checkPermission <
    ResourceType extends keyof M['objects'] extends string ? keyof M['objects'] : never,

    Permission extends
    (keyof M['objects'][ResourceType]['permissions'] extends string ? keyof M['objects'][ResourceType]['permissions'] : never) |
    (keyof M['objects'][ResourceType]['relations'] extends string ? keyof M['objects'][ResourceType]['relations'] : never),

    SubjectType extends
    M['objects'][ResourceType]['permissions'][Permission] extends string
      ? (M['objects'][ResourceType]['permissions'][Permission] extends string ? M['objects'][ResourceType]['permissions'][Permission] : never)
      : (keyof M['objects'][ResourceType]['relations'][Permission] extends string ? keyof M['objects'][ResourceType]['relations'][Permission] : never),

    CaveatName extends
    Permission extends keyof M['objects'][ResourceType]['permissions']
      ? M['objects'][ResourceType]['permissions'][Permission]['caveat']
      : M['objects'][ResourceType]['relations'][Permission][SubjectType]['caveat']
  > (
    [resourceType, resourceId]: [ResourceType | `${string}/${ResourceType}`, string | number],
    permission: Permission,
    [subjectType, subjectId]: [SubjectType | `${string}/${SubjectType}`, string | number],
    options?: CheckPermissionOptions<M['caveats'][CaveatName]>
  ) {
    const resp = await this.client.checkPermission(v1.CheckPermissionRequest.create({
      resource: this.getObjectRef(resourceType, resourceId),
      permission,
      subject: this.getSubjectRef(subjectType, subjectId),
      consistency: this.getConsistency(options?.consistency),
      context: options?.caveatContext
    }))

    return {
      hasPermission: resp.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION,
      zedToken: resp.checkedAt
    }
  }

  async lookupResources <
    ResourceType extends keyof M['objects'] extends string ? keyof M['objects'] : never,

    Permission extends
    (keyof M['objects'][ResourceType]['permissions'] extends string ? keyof M['objects'][ResourceType]['permissions'] : never) |
    (keyof M['objects'][ResourceType]['relations'] extends string ? keyof M['objects'][ResourceType]['relations'] : never),

    SubjectType extends
    M['objects'][ResourceType]['permissions'][Permission] extends string
      ? (M['objects'][ResourceType]['permissions'][Permission] extends string ? M['objects'][ResourceType]['permissions'][Permission] : never)
      : (keyof M['objects'][ResourceType]['relations'][Permission] extends string ? keyof M['objects'][ResourceType]['relations'][Permission] : never),

    CaveatName extends
    Permission extends keyof M['objects'][ResourceType]['permissions']
      ? M['objects'][ResourceType]['permissions'][Permission]['caveat']
      : M['objects'][ResourceType]['relations'][Permission][SubjectType]['caveat']
  > (
    resourceType: ResourceType | `${string}/${ResourceType}`,
    permission: Permission,
    [subjectType, subjectId]: [SubjectType | `${string}/${SubjectType}`, string | number],
    options?: LookupResourcesOptions<M['caveats'][CaveatName]>
  ) {
    const resp = await this.client.lookupResources(v1.LookupResourcesRequest.create({
      resourceObjectType: this.prefixObjectType(resourceType),
      permission,
      subject: this.getSubjectRef(subjectType, subjectId),
      consistency: this.getConsistency(options?.consistency),
      context: options?.caveatContext
    }))

    return {
      resourceIds: resp.map(r => this.idTransformer?.parse(r.resourceObjectId) ?? r.resourceObjectId),
      zedToken: resp.at(-1)?.lookedUpAt
    }
  }

  // ===========================================================================
  // Relationships
  // ===========================================================================
  defineWriteRelationship <
    ResourceType extends keyof M['objects'] extends string ? keyof M['objects'] : never,

    Relation extends keyof M['objects'][ResourceType]['relations'] extends string ? keyof M['objects'][ResourceType]['relations'] : never,

    SubjectType extends
    Relation extends keyof M['objects'][ResourceType]['relations']
      ? (keyof M['objects'][ResourceType]['relations'][Relation] extends string ? keyof M['objects'][ResourceType]['relations'][Relation] : never)
      : never,

    CaveatName extends M['objects'][ResourceType]['relations'][Relation][SubjectType]['caveat']
  > (
    /** [resourceType, resourceId] */
    [resourceType, resourceId]: [ResourceType | `${string}/${ResourceType}`, string | number],
    relation: Relation,
    // TODO: I think this one is wrong and the three param version might have more subjectTypes allowed?
    /** [subjectType, subjectId, subRelation?] */
    [subjectType, subjectId, subRelation]: [SubjectType | `${string}/${SubjectType}`, string | number] | [SubjectType | `${string}/${SubjectType}`, string | number, string],
    options: DefineWriteRelationshipOptions<M, CaveatName> = { operation: 'TOUCH' }
  ): WriteRelationshipsInternalOptions {
    return {
      resource: [resourceType, resourceId] as [ResourceType | `${string}/${ResourceType}`, string | number],
      relation,
      subject: [subjectType, subjectId, subRelation] as [SubjectType | `${string}/${SubjectType}`, string | number] | [SubjectType | `${string}/${SubjectType}`, string | number, string],
      options
    } as unknown as WriteRelationshipsInternalOptions
  }

  // TODO: Unfortunately you need to call the defineWriteRelationship function
  // on each array member to get type completion, it'd be nice to improve that
  async writeRelationships (relationships: WriteRelationshipsInternalOptions[]) {
    const resp = await this.client.writeRelationships(v1.WriteRelationshipsRequest.create({
      updates: relationships.map(r => v1.RelationshipUpdate.create({
        relationship: v1.Relationship.create({
          resource: this.getObjectRef(r.resource[0], r.resource[1]),
          relation: r.relation,
          subject: this.getSubjectRef(r.subject[0], r.subject[1], r.subject[2]),
          optionalCaveat: r.options.caveatContext?.[0]
            ? v1.ContextualizedCaveat.create({ caveatName: r.options.caveatName, context: r.options.caveatContext })
            : undefined
        }),
        operation: v1.RelationshipUpdate_Operation[r.options.operation ?? 'TOUCH']
      }))
    }))

    return {
      zedToken: resp.writtenAt
    }
  }
}
