import { CstParser, Lexer, type TokenType, createToken as orgCreateToken } from 'chevrotain'

// This is based on https://github.com/Chevrotain/chevrotain/blob/6d210a382b6473379aa7e40857ecf42e14b1248f/examples/grammars/graphql/graphql.js

// ----------------- lexer -----------------
const allTokens: TokenType[] = []

const createToken: typeof orgCreateToken = function (...args) {
  const newToken = orgCreateToken.apply(null, args)
  allTokens.push(newToken)
  return newToken
}

const keywordTokens: TokenType[] = []
const createKeywordToken: typeof orgCreateToken = function (config) {
  if (!config.longer_alt) {
    config.longer_alt = Identifier
  } else if (Array.isArray(config.longer_alt)) {
    config.longer_alt.push(Identifier)
  } else if (config.longer_alt) {
    config.longer_alt = [config.longer_alt, Identifier]
  }
  const newToken = createToken(config)
  keywordTokens.push(newToken)
  newToken.CATEGORIES ??= []
  newToken.CATEGORIES.push(Keyword)
  return newToken
}

/* eslint-disable @typescript-eslint/no-unused-vars -- tokens are collected in our `createToken` wrapper */

// B1 - Ignored-Tokens
const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED
})

const LineTerminator = createToken({
  name: 'LineTerminator',
  pattern: /\n\r|\r|\n/,
  group: Lexer.SKIPPED
})

const SingleLineComment = createToken({
  name: 'SingleLineComment',
  pattern: /\/\/[^\n\r]*/,
  group: Lexer.SKIPPED
})

const MultipleLineComment = createToken({
  name: 'MultipleLineComment',
  pattern: /\/\*.*\*\//,
  line_breaks: true,
  group: Lexer.SKIPPED
})

/* eslint-enable @typescript-eslint/no-unused-vars -- tokens are collected in our `createToken` wrapper */

// B2 - Lexical Tokens
const RArrow = createToken({ name: 'RArrow', pattern: '->' }) // Must be defined before Minus and RAngle

const LParen = createToken({ name: 'LParen', pattern: '(' })
const RParen = createToken({ name: 'RParen', pattern: ')' })
const LCurly = createToken({ name: 'LCurly', pattern: '{' })
const RCurly = createToken({ name: 'RCurly', pattern: '}' })
const LAngle = createToken({ name: 'LAngle', pattern: '<' })
const RAngle = createToken({ name: 'RAngle', pattern: '>', longer_alt: RArrow })

const VerticalLine = createToken({ name: 'VerticalLine', pattern: '|' })
const Plus = createToken({ name: 'Plus', pattern: '+' })
const Minus = createToken({ name: 'Minus', pattern: '-', longer_alt: RArrow })
const Ampersand = createToken({ name: 'Ampersand', pattern: '&' })
const ForwardSlash = createToken({ name: 'ForwardSlash', pattern: '/' })

const Equals = createToken({ name: 'Equals', pattern: '=' })
const Colon = createToken({ name: 'Colon', pattern: ':' })
const Hash = createToken({ name: 'Hash', pattern: '#' })
const Star = createToken({ name: 'Star', pattern: '*' })
const Ellipsis = createToken({ name: 'Ellipsis', pattern: '...' })
const Comma = createToken({ name: 'Comma', pattern: ',' })

// keywords and Name
// Name must not be placed into the TokenTypeList before any keywords
// as it can match any keyword, so we use "orgCreateToken"
// TODO: create a NameOrKeyword token
const Identifier = orgCreateToken({
  name: 'Identifier',
  pattern: /[_A-Za-z][_0-9A-Za-z]*/
})
const Keyword = createToken({ name: 'Keyword', pattern: Lexer.NA })
const Caveat = createKeywordToken({ name: 'Caveat', pattern: 'caveat' })
const Definition = createKeywordToken({ name: 'Definition', pattern: 'definition' })
const Relation = createKeywordToken({ name: 'Relation', pattern: 'relation' })
const Permission = createKeywordToken({ name: 'Permission', pattern: 'permission' })

const With = createKeywordToken({ name: 'With', pattern: 'with' })
const Nil = createKeywordToken({ name: 'Nil', pattern: 'nil' })

// We manually add the general Identifier (Name) AFTER all the keyword token types.
allTokens.push(Identifier)

export const ZedLexer = new Lexer(allTokens)

// ----------------- parser -----------------
class ZedParser extends CstParser {
  constructor () {
    super(allTokens)
    this.performSelfAnalysis()
  }

  public schema = this.RULE('schema', () => {
    this.MANY(() => {
      this.SUBRULE(this.definition)
    })
  })

  public definition = this.RULE('definition', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.caveatDefinition) },
      { ALT: () => this.SUBRULE(this.objectDefinition) }
    ])
  })

  public objectDefinition = this.RULE('objectDefinition', () => {
    this.CONSUME(Definition)
    this.SUBRULE(this.typePath)
    this.CONSUME(LCurly)
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.relation) },
        { ALT: () => this.SUBRULE(this.permission) }
      ])
    })
    this.CONSUME(RCurly)
  })

  public typePath = this.RULE('typePath', () => {
    this.OPTION(() => {
      this.SUBRULE(this.namespace)
    })
    this.CONSUME2(Identifier)
  })

  public namespace = this.RULE('namespace', () => {
    this.CONSUME(Identifier)
    this.CONSUME(ForwardSlash)
  })

  public relation = this.RULE('relation', () => {
    this.CONSUME(Relation)
    this.CONSUME(Identifier)
    this.CONSUME(Colon)
    this.AT_LEAST_ONE_SEP({
      SEP: VerticalLine,
      DEF: () => {
        this.SUBRULE(this.typeReference)
      }
    })
  })

  public typeReference = this.RULE('typeReference', () => {
    this.SUBRULE(this.typePath)
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.wildcard) },
        { ALT: () => this.SUBRULE(this.typeReferenceTarget) }
      ])
    })
    this.OPTION1(() => {
      this.SUBRULE(this.caveatReference)
    })
  })

  public wildcard = this.RULE('wildcard', () => {
    this.CONSUME(Colon)
    this.CONSUME(Star)
  })

  public typeReferenceTarget = this.RULE('typeReferenceTarget', () => {
    this.CONSUME(Hash)
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(Ellipsis) }
    ])
  })

  public caveatReference = this.RULE('caveatReference', () => {
    this.CONSUME(With)
    this.SUBRULE(this.typePath)
  })

  public permission = this.RULE('permission', () => {
    this.CONSUME(Permission)
    this.CONSUME(Identifier)
    this.CONSUME(Equals)
    this.SUBRULE(this.expression)
  })

  public expression = this.RULE('expression', () => {
    this.SUBRULE(this.exclusionExpression)
  })

  public exclusionExpression = this.RULE('exclusionExpression', () => {
    this.SUBRULE(this.intersectExpression, { LABEL: 'lhs' })
    this.MANY(() => {
      this.CONSUME(Minus)
      this.SUBRULE1(this.intersectExpression, { LABEL: 'rhs' })
    })
  })

  public intersectExpression = this.RULE('intersectExpression', () => {
    this.SUBRULE(this.unionExpression, { LABEL: 'lhs' })
    this.MANY(() => {
      this.CONSUME(Ampersand)
      this.SUBRULE1(this.unionExpression, { LABEL: 'rhs' })
    })
  })

  public unionExpression = this.RULE('unionExpression', () => {
    this.SUBRULE(this.atomicExpression, { LABEL: 'lhs' })
    this.MANY(() => {
      this.CONSUME(Plus)
      this.SUBRULE1(this.atomicExpression, { LABEL: 'rhs' })
    })
  })

  public atomicExpression = this.RULE('atomicExpression', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.parenthesisExpression) },
      { ALT: () => this.SUBRULE(this.arrowExpression) },
      { ALT: () => this.CONSUME(Nil) }
    ])
  })

  public parenthesisExpression = this.RULE('parenthesisExpression', () => {
    this.CONSUME(LParen)
    this.SUBRULE(this.expression)
    this.CONSUME(RParen)
  })

  public arrowExpression = this.RULE('arrowExpression', () => {
    // NOTE: Nested arrows are not yet supported, but SpiceDB's own parser allows it
    this.AT_LEAST_ONE_SEP({
      SEP: RArrow,
      DEF: () => this.CONSUME(Identifier)
    })
  })

  public caveatDefinition = this.RULE('caveatDefinition', () => {
    this.CONSUME(Caveat)
    this.SUBRULE(this.typePath)
    this.CONSUME(LParen)
    this.AT_LEAST_ONE_SEP({
      SEP: Comma,
      DEF: () => {
        this.SUBRULE(this.caveatParameter)
      }
    })
    this.CONSUME(RParen)
    this.CONSUME(LCurly)
    // TODO: this.SUBRULE(this.caveatExpression)
    this.CONSUME(RCurly)
  })

  public caveatParameter = this.RULE('caveatParameter', () => {
    this.CONSUME(Identifier)
    this.SUBRULE(this.caveatParameterType)
  })

  public caveatParameterType = this.RULE('caveatParameterType', () => {
    this.CONSUME(Identifier)
    this.OPTION(() => {
      this.CONSUME(LAngle)
      // NOTE: No complex type currently allows multiple type arguments, but SpiceDB's own parser supports it
      this.AT_LEAST_ONE_SEP({
        SEP: Comma,
        DEF: () => {
          this.SUBRULE(this.caveatParameterType)
        }
      })
      this.CONSUME(RAngle)
    })
  })

  public caveatExpression = this.RULE('caveatExpression', () => {
    // TODO: preferably we just skip this, I do'nt want to implement a CEL parser too
  })
}

// This should only ever be called once.
export const zedParser = new ZedParser()

export function parse (text: string) {
  const lexingResult = ZedLexer.tokenize(text)
  // `input` is a setter which will reset the parser's state.
  zedParser.input = lexingResult.tokens
  const output = zedParser.schema()

  if (zedParser.errors.length > 0) {
    throw new Error('Errors encountered while parsing zed schema', { cause: zedParser.errors })
  }

  return output
}
