module.exports = class Variable {
  constructor ({ identifier, body = [''], transformation }) {
    this.identifier = identifier
    this.body = body
    this.transformation = transformation

    this.length = this.body.reduce((length, value) => length + value.length, 0)
  }

  transform (value) {
    return this.transformation
      ? this.transformation(value)
      : value
  }

  expand (cursor, variables, disposables, offset) {
    if (this.identifier in variables) {
      this.body = this.transform(variables[this.identifier])
      this.length = this.body.length
      offset += this.length
      return this.body
    }
    return Array.isArray(this.body)
      ? this.body.flatMap(value => {
        if (value instanceof Variable) {
          const expansion = value.expand(cursor, variables, disposables, offset)
          offset += value.length
          return [value, ...expansion]
        }
        offset += value.length
        return []
      }) : ''
  }

  toString () {
    return Array.isArray(this.body)
      ? this.body.reduce((string, value) => string + value, '')
      : this.body || ''
  }
}
