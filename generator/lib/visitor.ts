import { zedParser } from './parser.js'
import type { ArrowExpressionCstChildren, AtomicExpressionCstChildren, CaveatDefinitionCstChildren, CaveatExpressionCstChildren, CaveatParameterCstChildren, CaveatParameterTypeCstChildren, CaveatReferenceCstChildren, DefinitionCstChildren, ExclusionExpressionCstChildren, ExpressionCstChildren, ICstNodeVisitor, IntersectExpressionCstChildren, NamespaceCstChildren, ObjectDefinitionCstChildren, ParenthesisExpressionCstChildren, PermissionCstChildren, RelationCstChildren, SchemaCstChildren, TypePathCstChildren, TypeReferenceCstChildren, TypeReferenceTargetCstChildren, UnionExpressionCstChildren, WildcardCstChildren } from './zed_cst.d.ts'

// Obtains the default CstVisitor constructor to extend.
const BaseCstVisitor = zedParser.getBaseCstVisitorConstructor()

interface BaseAstNode {
  type: string
}

export interface ObjectDefinitionAstNode extends BaseAstNode {
  type: 'OBJECT_DEFINITION'
  name: string
  relations: RelationAstNode[]
  permissions: PermissionAstNode[]
}

export interface RelationAstNode extends BaseAstNode {
  type: 'RELATION'
  name: string
  objectReferences: ObjectReferenceAstNode[]
}

export interface ObjectReferenceAstNode extends BaseAstNode {
  type: 'OBJECT_REFERENCE'
  name: string
  target: string | null
  caveat: string | null
  wildcard: boolean
}

export interface PermissionAstNode extends BaseAstNode {
  type: 'PERMISSION'
  name: string
  expression: ExpressionAstNode[]
}
// export interface ParenthesisExpressionAstNode extends BaseAstNode {
//   type: 'PARENTHESIS_EXPRESSION'
//   expression: ExpressionAstNode
// }

// export interface BaseExpressionAstNode {
//   type: string
//   operands: ExpressionAstNode
// }

// export interface ExclusionExpressionAstNode extends BaseExpressionAstNode {
//   type: 'EXCLUSION_EXPRESSION'
// }
// export interface UnionExpressionAstNode extends BaseExpressionAstNode {
//   type: 'UNION_EXPRESSION'
// }
// export interface IntersectExpressionAstNode extends BaseExpressionAstNode {
//   type: 'INTERSECT_EXPRESSION'
// }

export interface NilAstNode extends BaseAstNode {
  type: 'NIL'
}
export interface PermissionOrRelationReferenceAstNode extends BaseAstNode {
  type: 'PERMISSION_OR_RELATION_REFERENCE'
  name: string
  target: string | null
}

export type ExpressionAstNode =
  // ExclusionExpressionAstNode |
  // UnionExpressionAstNode |
  // IntersectExpressionAstNode |
  // ParenthesisExpressionAstNode |
  NilAstNode |
  PermissionOrRelationReferenceAstNode

export interface CaveatDefinitionAstNode extends BaseAstNode {
  type: 'CAVEAT_DEFINITION'
  name: string
  parameters: CaveatParameterAstNode[]
}

export interface CaveatParameterAstNode extends BaseAstNode {
  type: 'CAVEAT_PARAMETER'
  name: string
  parameterType: ParameterTypeAstNode
}

export interface ComplexParameterTypeAstNode extends BaseAstNode {
  type: 'COMPLEX_PARAMETER_TYPE'
  name: string
  typeArgs: ParameterTypeAstNode[]
}

export interface SimpleParameterTypeAstNode extends BaseAstNode {
  type: 'SIMPLE_PARAMETER_TYPE'
  name: string
}

export type ParameterTypeAstNode = ComplexParameterTypeAstNode | SimpleParameterTypeAstNode

export type RootAstNode = ObjectDefinitionAstNode | CaveatDefinitionAstNode

// This is deliberately not creating a complete AST, since there are simply
// things we don't care about at all for our TS generation needs
export class ZedVisitor extends BaseCstVisitor implements ICstNodeVisitor<undefined, BaseAstNode | BaseAstNode[] | undefined | null | string> {
  constructor () {
    super()
    // This helper will detect any missing or redundant methods on this visitor
    this.validateVisitor()
  }

  schema (ctx: SchemaCstChildren) {
    return ctx.definition?.map(d => this.visit(d)) ?? []
  }

  definition (ctx: DefinitionCstChildren) {
    return ctx.objectDefinition ? this.visit(ctx.objectDefinition) : this.visit(ctx.caveatDefinition!)
  }

  objectDefinition (ctx: ObjectDefinitionCstChildren) {
    return {
      type: 'OBJECT_DEFINITION',
      name: this.visit(ctx.typePath),
      relations: ctx.relation?.map(r => this.visit(r)) ?? [],
      permissions: ctx.permission?.map(p => this.visit(p)) ?? []
    }
  }

  typePath (ctx: TypePathCstChildren) {
    return ctx.Identifier[0].image
  }

  namespace (ctx: NamespaceCstChildren) {
    return undefined
  }

  relation (ctx: RelationCstChildren) {
    return {
      type: 'RELATION',
      name: ctx.Identifier[0].image,
      objectReferences: ctx.typeReference.map(tr => this.visit(tr))
    }
  }

  typeReference (ctx: TypeReferenceCstChildren) {
    return {
      type: 'OBJECT_REFERENCE',
      name: this.visit(ctx.typePath),
      target: ctx.typeReferenceTarget ? this.visit(ctx.typeReferenceTarget) : null,
      caveat: ctx.caveatReference ? this.visit(ctx.caveatReference) : null,
      wildcard: !!ctx.wildcard
    }
  }

  wildcard (ctx: WildcardCstChildren) {
    return undefined
  }

  typeReferenceTarget (ctx: TypeReferenceTargetCstChildren) {
    return ctx.Identifier?.[0].image ?? ctx.Ellipsis?.[0].image ?? null
  }

  caveatReference (ctx: CaveatReferenceCstChildren) {
    return this.visit(ctx.typePath)
  }

  permission (ctx: PermissionCstChildren) {
    return {
      type: 'PERMISSION',
      name: ctx.Identifier[0].image,
      expression: this.visit(ctx.expression)
    }
  }

  expression (ctx: ExpressionCstChildren) {
    return this.visit(ctx.exclusionExpression)
  }

  exclusionExpression (ctx: ExclusionExpressionCstChildren) {
    // if (!ctx.rhs) {
    //   return this.visit(ctx.lhs)
    // } else {
    //   return {
    //     type: 'EXCLUSION_EXPRESSION',
    //     operands: [
    //       this.visit(ctx.lhs),
    //       ...ctx.rhs.map(rhs => this.visit(rhs))
    //     ]
    //   }
    // }
    // I've realised I don't really care about the expression calculation
    // any type part of the expression will be a valid subject
    const lhs = this.visit(ctx.lhs)
    return [
      ...(Array.isArray(lhs) ? lhs : [lhs]),
      ...(ctx.rhs?.flatMap(rhs => this.visit(rhs)) ?? [])
    ]
  }

  intersectExpression (ctx: IntersectExpressionCstChildren) {
    // if (!ctx.rhs) {
    //   return this.visit(ctx.lhs)
    // } else {
    //   return {
    //     type: 'INTERSECT_EXPRESSION',
    //     operands: [
    //       this.visit(ctx.lhs),
    //       ...ctx.rhs.map(rhs => this.visit(rhs))
    //     ]
    //   }
    // }
    const lhs = this.visit(ctx.lhs)
    return [
      ...(Array.isArray(lhs) ? lhs : [lhs]),
      ...(ctx.rhs?.flatMap(rhs => this.visit(rhs)) ?? [])
    ]
  }

  unionExpression (ctx: UnionExpressionCstChildren) {
    // if (!ctx.rhs) {
    //   return this.visit(ctx.lhs)
    // } else {
    //   return {
    //     type: 'UNION_EXPRESSION',
    //     operands: [
    //       this.visit(ctx.lhs),
    //       ...ctx.rhs.map(rhs => this.visit(rhs))
    //     ]
    //   }
    // }
    const lhs = this.visit(ctx.lhs)
    return [
      ...(Array.isArray(lhs) ? lhs : [lhs]),
      ...(ctx.rhs?.flatMap(rhs => this.visit(rhs)) ?? [])
    ]
  }

  atomicExpression (ctx: AtomicExpressionCstChildren) {
    if (ctx.Nil) return { type: 'NIL' }
    else if (ctx.arrowExpression) return this.visit(ctx.arrowExpression)
    else if (ctx.parenthesisExpression) return this.visit(ctx.parenthesisExpression)
  }

  parenthesisExpression (ctx: ParenthesisExpressionCstChildren) {
    // return {
    //   type: 'PARENTHESIS_EXPRESSION',
    //   expression: this.visit(ctx.expression)
    // }
    return this.visit(ctx.expression)
  }

  arrowExpression (ctx: ArrowExpressionCstChildren) {
    return {
      type: 'PERMISSION_OR_RELATION_REFERENCE',
      name: ctx.Identifier[0].image,
      target: ctx.Identifier[1]?.image ?? null
    }
  }

  // Caveats
  caveatDefinition (ctx: CaveatDefinitionCstChildren) {
    return {
      type: 'CAVEAT_DEFINITION',
      name: this.visit(ctx.typePath),
      parameters: ctx.caveatParameter.map(p => this.visit(p))
    }
  }

  caveatParameter (ctx: CaveatParameterCstChildren) {
    return {
      type: 'CAVEAT_PARAMETER',
      name: ctx.Identifier[0].image,
      parameterType: this.visit(ctx.caveatParameterType)
    }
  }

  caveatParameterType (ctx: CaveatParameterTypeCstChildren) {
    if (ctx.LAngle) {
      return {
        type: 'COMPLEX_PARAMETER_TYPE',
        name: ctx.Identifier[0].image,
        typeArgs: ctx.caveatParameterType?.map(cpt => this.visit(cpt))
      }
    } else {
      return {
        type: 'SIMPLE_PARAMETER_TYPE',
        name: ctx.Identifier[0].image
      }
    }
  }

  caveatExpression (ctx: CaveatExpressionCstChildren) {
    return undefined
  }
}

export const zedVisitor = new ZedVisitor()
