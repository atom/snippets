const Modifier = require('./modifier')

module.exports = class Choice extends Modifier {
  constructor ([first, ...rest]) {
    super()

    this.default = first
    this.choices = rest
  }

  modify ([Construct, identifier]) {
    class Choice extends Construct {
      constructor (identifier, { choices }) {
        super(identifier)

        this.choices = choices
      }

      activate (marker, cursor) {
        cursor.selection.setBufferRange(marker.getRange())
        // todo dropdownlist
      }

      expand (buffer, cursor, layer, variables) {
        if (this.identifier in variables && !variables[this.identifier]) {
          const position = cursor.getBufferPosition()
          layer.markRange(this.insert(buffer, position, this.default))
            .setProperties({ construct: this })
        } else {
          super.expand(buffer, cursor, layer, variables)
        }
      }

      toString () {
        return this.default.toString()
      }
    }

    return new Choice(identifier, this)
  }
}
