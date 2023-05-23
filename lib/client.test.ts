import { v1 } from '@authzed/authzed-node'
import { ZedClient } from './client'

const _client = v1.NewClient('')

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type PermissionsMeta = {
  person: {
    organisation: {
      context: Record<string, undefined>
      subjectType: 'organisation'
    }
    view_person: {
      context: Record<string, undefined>
      subjectType: PermissionsMeta['organisation']['view_organisation']['subjectType']
    }
    edit_person: {
      context: Record<string, undefined>
      subjectType: PermissionsMeta['organisation']['edit_organisation']['subjectType']
    }
  }

  organisation: {
    parent: {
      context: Record<string, undefined>
      subjectType: 'organisation'
    }
    child: {
      context: Record<string, undefined>
      subjectType: 'organisation'
    }

    direct_admin: {
      context: Record<string, undefined>
      subjectType: 'person' | 'system'
    }
    direct_viewer: {
      context: Record<string, undefined>
      subjectType: 'person' | 'system'
    }
    direct_member: {
      context: Record<string, undefined>
      subjectType: 'person'
    }

    admin: {
      context: Record<string, undefined>
      subjectType: PermissionsMeta['organisation']['direct_admin']['subjectType']
    }
    viewer: {
      context: Record<string, undefined>
      subjectType: PermissionsMeta['organisation']['admin']['subjectType'] | PermissionsMeta['organisation']['direct_viewer']['subjectType']
    }

    view_organisation: {
      context: Record<string, undefined>
      subjectType: PermissionsMeta['organisation']['admin']['subjectType'] | PermissionsMeta['organisation']['viewer']['subjectType'] | PermissionsMeta['organisation']['direct_member']['subjectType']
    }
    edit_organisation: {
      context: Record<string, undefined>
      subjectType: PermissionsMeta['organisation']['admin']['subjectType']
    }
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  system: {}
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type RelationsMeta = {
  organisation: {
    parent: [
      {
        subjectType: 'organisation'
        caveats: {
          'is_tuesday': { today: string }
        }
        wildcards: false
      }
    ]
    child: [
      {
        subjectType: 'organisation'
        caveats: Record<string, Record<string, unknown>>
        wildcards: false
      }
    ]

    direct_admin: [
      {
        subjectType: 'person'
        caveats: Record<string, Record<string, unknown>>
        wildcards: false
      },
      {
        subjectType: 'system'
        caveats: Record<string, Record<string, unknown>>
        wildcards: false
      }
    ]
    direct_viewer: [
      {
        subjectType: 'person'
        caveats: Record<string, Record<string, unknown>>
        wildcards: true
      },
      {
        subjectType: 'system'
        caveats: Record<string, Record<string, unknown>>
        wildcards: true
      }
    ]
    direct_member: [
      {
        subjectType: 'person'
        caveats: Record<string, Record<string, unknown>>
        wildcards: false
      }
    ]
  }
}

const zedClient = new ZedClient<PermissionsMeta, RelationsMeta>(_client)

zedClient.checkPermission(['organisation', 1], 'view_organisation', ['person', 2])
zedClient.checkPermission(['organisation', 1], 'edit_organisation', ['system', 2])

zedClient.checkPermission(['person', 1], 'view_person', ['system', 2])

zedClient.lookupResources('organisation', 'view_organisation', ['person', 1])

zedClient.writeRelationships([
  zedClient.defineWriteRelationship({ operation: 'TOUCH', resource: ['organisation', 1], relation: 'parent', subject: ['organisation', 1], caveat: ['is_tuesday', { today: 'abc' }] })
])
