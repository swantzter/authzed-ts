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

export type SchemaPermissionsMetadata = Record<string, Record<string, { subjectType: string, context: Record<string, unknown> }>>
export type SchemaRelationsMetadata = Record<string, Record<string, Array<{ subjectType: string, caveats: Record<string, Record<string, unknown>>, wildcards: boolean }>>>

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
  caveatContext?: CaveatContext
}

export interface LookupResourcesOptions <CaveatContext extends Record<string, unknown>> {
  consistency?: Consistency
  caveatContext?: CaveatContext
}

export class ZedClient <
  P extends SchemaPermissionsMetadata,
  R extends SchemaRelationsMetadata
> {
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
    ResourceType extends keyof P extends string ? keyof P : never,
    Permission extends keyof P[ResourceType] extends string ? keyof P[ResourceType] : never,
    SubjectType extends P[ResourceType][Permission]['subjectType']
  > (
    [resourceType, resourceId]: [ResourceType | `${string}/${ResourceType}`, string | number],
    permission: Permission,
    [subjectType, subjectId]: [SubjectType | `${string}/${SubjectType}`, string | number],
    options?: CheckPermissionOptions<P[ResourceType][Permission]['context']>
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
    ResourceType extends keyof P extends string ? keyof P : never,
    Permission extends keyof P[ResourceType] extends string ? keyof P[ResourceType] : never,
    SubjectType extends P[ResourceType][Permission]['subjectType']
    > (
    resourceType: ResourceType | `${string}/${ResourceType}`,
    permission: Permission,
    [subjectType, subjectId]: [SubjectType | `${string}/${SubjectType}`, string | number],
    options?: LookupResourcesOptions<P[ResourceType][Permission]['context']>
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
    ResourceType extends keyof R extends string ? keyof R : never,
    Relation extends keyof R[ResourceType] extends string ? keyof R[ResourceType] : never,
    SubjectType extends R[ResourceType][Relation][number]['subjectType'],
    CaveatName extends keyof R[ResourceType][Relation][number]['caveats'] extends string ? keyof R[ResourceType][Relation][number]['caveats'] : never,
    CaveatType extends R[ResourceType][Relation][number]['caveats'][CaveatName],
  > (
    relationship: {
      operation: 'CREATE' | 'DELETE' | 'TOUCH'
      resource: [ResourceType | `${string}/${ResourceType}`, string | number]
      relation: Relation
      // TODO: I think this one is wrong and the three param version might have more subjectTypes allowed?
      /** [subjectType, subjectId, subRelation?] */
      subject: [SubjectType | `${string}/${SubjectType}`, string | number] | [SubjectType, string | number, string]
      caveat?: [CaveatName, CaveatType]
    }
  ) {
    return relationship
  }

  // TODO: Unfortunately you need to call the defineWriteRelationship function
  // on each array member to get type completion, it'd be nice to improve that
  async writeRelationships (relationships: Array<ReturnType<typeof this.defineWriteRelationship>>) {
    const resp = await this.client.writeRelationships(v1.WriteRelationshipsRequest.create({
      updates: relationships.map(r => v1.RelationshipUpdate.create({
        relationship: v1.Relationship.create({
          resource: this.getObjectRef(r.resource[0], r.resource[1]),
          relation: r.relation,
          subject: this.getSubjectRef(r.subject[0], r.subject[1], r.subject[2]),
          optionalCaveat: r.caveat?.[0]
            ? v1.ContextualizedCaveat.create({ caveatName: r.caveat[0], context: r.caveat[1] })
            : undefined
        }),
        operation: v1.RelationshipUpdate_Operation[r.operation]
      }))
    }))

    return {
      zedToken: resp.writtenAt
    }
  }
}
