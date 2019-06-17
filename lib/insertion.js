const {transformWithSubstitution} = require('./util')

class Insertion {
  constructor ({range, substitution, references, choices=[], transformResolver}) {
    this.range = range
    this.substitution = substitution
    this.references = references
    if (substitution && substitution.replace === undefined) {
      substitution.replace = ''
    }
    this.choices = choices
    this.transformResolver = transformResolver
  }

  isTransformation () {
    return !!this.substitution
  }

  isChoice () {
    return this.choices.length > 0
  }

  transform (input) {
    return transformWithSubstitution(input, this.substitution, this.transformResolver)
  }
}

module.exports = Insertion
