const Construct = require('./construct')

module.exports = class Variable extends Construct {
  expand (cursor, tabstops, variables) {
    this.identifier in variables
      ? this.insert(cursor, variables[this.identifier])
      : this.mark({ tabstops, ...this.insert(cursor, this.identifier) })
  }
}
