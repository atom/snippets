const Construct = require('./construct')

module.exports = class Variable extends Construct {
  expand (editor, cursor, tabstops, variables) {
    this.identifier in variables
      ? this.insert(editor, cursor, variables[this.identifier])
      : this.mark({ tabstops, ...this.insert(editor, cursor, this.identifier) })
  }
}
