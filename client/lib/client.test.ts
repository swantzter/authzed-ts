/* eslint-disable @typescript-eslint/consistent-type-definitions, @typescript-eslint/ban-types */
import { v1 } from '@authzed/authzed-node'
import { ZedClient } from './client'

const _client = v1.NewClient('')

type ZedClientType = {
  caveats: {
    test_caveat: {
      a: number
      b: number[]
      c: Record<string, string>
    }
    second_caveat: {
      a: number
      b: number[]
      c: Record<string, string>
    }
  }

  objects: {
    user: {
      permissions: {}
      relations: {}
    }

    group: {
      permissions: {}
      relations: {
        member: {
          user: {
            caveat: 'second_caveat'
            wildcard: true
          }
        }
      }
    }

    document: {
      permissions: {
        write:
        {
          subjectType: keyof ZedClientType['objects']['document']['relations']['writer'] // writer
          caveat: ZedClientType['objects']['document']['relations']['writer'][keyof ZedClientType['objects']['document']['relations']['writer']]['caveat']
        } | {
          subjectType: keyof ZedClientType['objects']['document']['relations']['banned'] // banned
          caveat: ZedClientType['objects']['document']['relations']['banned'][keyof ZedClientType['objects']['document']['relations']['banned']]['caveat']
        } | {
          subjectType: keyof ZedClientType['objects']['group']['relations']['member'] // group->member
          caveat: ZedClientType['objects']['group']['relations']['member'][keyof ZedClientType['objects']['group']['relations']['member']]['caveat']
        }

        read: {
          subjectType: keyof ZedClientType['objects']['document']['relations']['reader'] // reader
          caveat: ZedClientType['objects']['document']['relations']['reader'][keyof ZedClientType['objects']['document']['relations']['reader']]['caveat']
        } | {
          subjectType: ZedClientType['objects']['document']['permissions']['write']['subjectType'] // write
          caveat: ZedClientType['objects']['document']['permissions']['write']['caveat']
        } | {
          subjectType: keyof ZedClientType['objects']['group']['relations']['member'] // group->member
          caveat: ZedClientType['objects']['group']['relations']['member'][keyof ZedClientType['objects']['group']['relations']['member']]['caveat']
        }

        nope: never
      }
      relations: {
        writer: {
          user: {
            caveat: never
            wildcard: false
          }
        }
        reader: {
          user: {
            caveat: never
            wildcard: false
          }
        }
        banned: {
          user: {
            caveat: never
            wildcard: false
          }
        }
        group: {
          group: {
            caveat: 'test_caveat'
            wildcard: false
          }
        }
      }
    }
  }
}

// type PersonPermissionsMeta = {
//   organisation: {
//     context: Record<string, undefined>
//     subjectType: 'organisation'
//   }
//   view_person: {
//     context: Record<string, undefined>
//     subjectType: PermissionsMeta['organisation']['view_organisation']['subjectType']
//   }
//   edit_person: {
//     context: Record<string, undefined>
//     subjectType: PermissionsMeta['organisation']['edit_organisation']['subjectType']
//   }
// }

// type OrganisationPermissionsMeta = {
//   parent: {
//     context: Record<string, undefined>
//     subjectType: 'organisation'
//   }
//   child: {
//     context: Record<string, undefined>
//     subjectType: 'organisation'
//   }

//   direct_admin: {
//     context: Record<string, undefined>
//     subjectType: 'person' | 'system'
//   }
//   direct_viewer: {
//     context: Record<string, undefined>
//     subjectType: 'person' | 'system'
//   }
//   direct_member: {
//     context: Record<string, undefined>
//     subjectType: 'person'
//   }

//   admin: {
//     context: Record<string, undefined>
//     subjectType: PermissionsMeta['organisation']['direct_admin']['subjectType']
//   }
//   viewer: {
//     context: Record<string, undefined>
//     subjectType: PermissionsMeta['organisation']['admin']['subjectType'] | PermissionsMeta['organisation']['direct_viewer']['subjectType']
//   }

//   view_organisation: {
//     context: Record<string, undefined>
//     subjectType: PermissionsMeta['organisation']['admin']['subjectType'] | PermissionsMeta['organisation']['viewer']['subjectType'] | PermissionsMeta['organisation']['direct_member']['subjectType']
//   }
//   edit_organisation: {
//     context: Record<string, undefined>
//     subjectType: PermissionsMeta['organisation']['admin']['subjectType']
//   }
// }

// type SystemPermissionsMeta = {}

// type PermissionsMeta = {
//   person: PersonPermissionsMeta

//   organisation: OrganisationPermissionsMeta

//   system: SystemPermissionsMeta
// }

// type CaveatIs_tuesdayParameters = {
//   'today': string
// }

// type RelationsMeta = {
//   organisation: {
//     parent: [
//       {
//         subjectType: 'organisation'
//         caveats: {
//           'is_tuesday': CaveatIs_tuesdayParameters
//         }
//         wildcards: false
//       }
//     ]
//     child: [
//       {
//         subjectType: 'organisation'
//         caveats: Record<string, Record<string, unknown>>
//         wildcards: false
//       }
//     ]

//     direct_admin: [
//       {
//         subjectType: 'person'
//         caveats: Record<string, Record<string, unknown>>
//         wildcards: false
//       },
//       {
//         subjectType: 'system'
//         caveats: Record<string, Record<string, unknown>>
//         wildcards: false
//       }
//     ]
//     direct_viewer: [
//       {
//         subjectType: 'person'
//         caveats: Record<string, Record<string, unknown>>
//         wildcards: true
//       },
//       {
//         subjectType: 'system'
//         caveats: Record<string, Record<string, unknown>>
//         wildcards: true
//       }
//     ]
//     direct_member: [
//       {
//         subjectType: 'person'
//         caveats: Record<string, Record<string, unknown>>
//         wildcards: false
//       }
//     ]
//   }
// }

const zedClient = new ZedClient<ZedClientType>(_client)

void zedClient.checkPermission(['document', 1], 'group', ['group', 1])

void zedClient.lookupResources('document', 'group', ['group', 1], { caveatContext: { a: 1, c: { d: 'e' } } })
void zedClient.lookupResources('document', 'group', ['group', 1])

void zedClient.writeRelationships([
  zedClient.defineWriteRelationship(['document', 1], 'group', ['group', 1]),
  zedClient.defineWriteRelationship(['document', 1], 'reader', ['user', 1])
])
