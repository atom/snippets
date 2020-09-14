const Modifier = require('./modifier')

module.exports = class Placeholder extends Modifier {
  constructor (snippet) {
    super()

    this.snippet = snippet
    // Set to false, so the notification doesn't get created multiple times
    this.snippet.legacySyntax = false
  }

  modify ([Construct, identifier]) {
    class Placeholder extends Construct {
      constructor (identifier, { snippet }) {
        super(identifier)

        this.snippet = snippet
      }

      expand (buffer, cursor, layer, variables) {
        if (!(this.identifier in variables)) {
          this.mark({ layer, ...this.snippet.expand({ buffer, cursor, variables }) })
        } else {
          super.expand(buffer, cursor, layer, variables)
        }
      }

      toString () {
        return this.snippet.toString()
      }
    }

    return new Placeholder(identifier, this)
  }
}
