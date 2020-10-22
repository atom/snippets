const Construct = require('./construct')

module.exports = class Tabstop extends Construct {
  expand (editor, cursor, tabstops, variables) {
    this.mark({ tabstops, start: cursor.getBufferPosition() })
  }
}
