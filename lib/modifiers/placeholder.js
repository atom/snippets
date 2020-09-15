const Modifier = require('./modifier')

module.exports = class Placeholder extends Modifier {
  constructor (snippet) {
    super()

    this.snippet = snippet
    // Set to false, so the notification doesn't get created multiple times
    this.snippet.legacySyntax = false
  }

  create ([Construct, ...args]) {
    class Placeholder extends Construct {
      constructor ({ snippet }, ...args) {
        super(...args)

        this.snippet = snippet
      }

      expand (cursor, tabstops, variables) {
        if (!(this.identifier in variables)) {
          this.mark({ tabstops, ...this.snippet.expand({ cursor, tabstops, variables }) })
        } else {
          super.expand(cursor, tabstops, variables)
        }
      }

      toString () {
        return this.snippet.toString()
      }
    }

    return new Placeholder(this, ...args)
  }
}
