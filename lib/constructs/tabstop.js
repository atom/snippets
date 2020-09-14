const Construct = require('./construct')

module.exports = class Tabstop extends Construct {
  expand (buffer, cursor, layer, variables) {
    const start = cursor.getBufferPosition()
    this.mark({ layer, start })
  }
}
