const Expression = require('./expression')

module.exports = class Placeholder extends Expression {
  constructor (identifier, snippet) {
    super(identifier)

    this.snippet = snippet
  }

  expand (editor, cursor, tabstops, variables) {
    if (!(this.identifier in variables)) {
      this.mark({ tabstops, ...this.snippet.expand({ editor, cursor, tabstops, variables }) })
    } else {
      super.expand(editor, cursor, tabstops, variables)
    }
  }

  toString () {
    return this.snippet.toString()
  }
}
