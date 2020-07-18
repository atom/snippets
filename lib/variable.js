module.exports = class Variable {
  constructor ({ identifier, value = [], range, transformation }) {
    this.identifier = identifier
    this.value = value
    this.range = range
    this.transformation = transformation
  }
}
