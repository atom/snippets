const { transformWithSubstitution } = require('./util')

class Insertion {
  constructor ({ range, substitution, choices=[] }) {
    this.range = range
    this.substitution = substitution
    if (substitution) {
      if (substitution.replace === undefined) {
        substitution.replace = ''
      }
    }
    this.choices = choices
  }

  isTransformation () {
    return !!this.substitution
  }

  isChoice () {
    return this.choices.length > 0
  }

  transform (input) {
    return transformWithSubstitution(input, this.substitution)
  }

}

module.exports = Insertion
