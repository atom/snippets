const Modifier = require('./modifier')

module.exports = class Placeholder extends Modifier {
  constructor (snippet) {
    super()

    this.snippet = snippet
    // Set to false, so the notification doesn't get created multiple times
    this.snippet.legacySyntax = false
  }

  modify (construct) {
    class Placeholder extends construct.constructor {
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

    return Object.assign(new Placeholder(construct), this)
  }
}
