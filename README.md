# Authzed TS

This package wraps [`@authzed/autzed-node`][authzed-node] and provides a higher
level interface with optional type-safety through code generation.

Note that this library is somewhat PoC, the utilities for code generation
and the actual client are shipped in the same package creating a somewhat
large installation, rather than packaging the code-generation as a separate
package you can install as a dev-dependency.

[authzed-node]: https://www.npmjs.com/package/@authzed/authzed-node
