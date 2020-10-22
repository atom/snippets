const Construct = require('./construct')

module.exports = class Variable extends Construct {
  expand (editor, cursor, tabstops, variables) {
    const position = cursor.getBufferPosition();
    this.identifier in variables
      ? this.insert(editor, position, variables[this.identifier])
      : this.mark({ tabstops, ...this.insert(editor, position, this.identifier) })
  }
}
