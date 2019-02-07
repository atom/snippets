module.exports = class VariableResolver {
  constructor (resolvers = new Map) {
    this.resolvers = new Map([
      ["CLIPBOARD", resolveClipboard],
      ...resolvers
    ])
  }

  add (variable, resolver) {
    this.resolvers.set(variable, resolver)
  }

  resolve (params) {

    const resolver = this.resolvers.get(params.name)

    if (resolver) {
      return resolver(params)
    }

    return undefined
  }
}

function resolveClipboard () {
  return atom.clipboard.read()
}
