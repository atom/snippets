const Construct = require('./construct')

module.exports = class Variable extends Construct {
  expand (buffer, cursor, layer, variables) {
    const position = cursor.getBufferPosition()
    this.identifier in variables
      ? this.insert(buffer, position, variables[this.identifier])
      : this.mark({ layer, ...this.insert(buffer, position, this.identifier) })
  }
}
