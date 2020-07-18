module.exports = class VariableRegistery extends Map {
  add (variable) {
    this.has(variable.identifier)
      ? this.get(variable.identifier).unshift(variable)
      : this.set(variable.identifier, [variable])
    return variable
  }
}
