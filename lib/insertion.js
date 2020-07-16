const ESCAPES = {
  u: (flags) => {
    flags.lowercaseNext = false
    flags.uppercaseNext = true
  },
  l: (flags) => {
    flags.uppercaseNext = false
    flags.lowercaseNext = true
  },
  U: (flags) => {
    flags.lowercaseAll = false
    flags.uppercaseAll = true
  },
  L: (flags) => {
    flags.uppercaseAll = false
    flags.lowercaseAll = true
  },
  E: (flags) => {
    flags.uppercaseAll = false
    flags.lowercaseAll = false
  },
  r: (flags, result) => {
    result.push('\\r')
  },
  n: (flags, result) => {
    result.push('\\n')
  },
  $: (flags, result) => {
    result.push('$')
  }
}

function transformText (str, flags) {
  if (flags.uppercaseAll) {
    return str.toUpperCase()
  } else if (flags.lowercaseAll) {
    return str.toLowerCase()
  } else if (flags.uppercaseNext) {
    flags.uppercaseNext = false
    return str.replace(/^./, s => s.toUpperCase())
  } else if (flags.lowercaseNext) {
    return str.replace(/^./, s => s.toLowerCase())
  }
  return str
}

class Insertion {
  constructor ({ range, transformation }) {
    this.range = range
    this.transformation = transformation
    if (transformation) {
      this.replacer = this.makeReplacer(transformation.replace)
    }
  }

  isTransformation () {
    return !!this.transformation
  }

  makeReplacer (replace) {
    return function replacer (...match) {
      let flags = {
        uppercaseAll: false,
        lowercaseAll: false,
        uppercaseNext: false,
        lowercaseNext: false
      }
      replace = [...replace]
      let result = []
      replace.forEach(token => {
        if (typeof token === 'string') {
          result.push(transformText(token, flags))
        } else if (token.modifier) {
          ESCAPES[token.modifier](flags, result)
        } else if (token.backreference) {
          let transformed = transformText(match[token.backreference], flags)
          result.push(transformed)
        }
      })
      return result.join('')
    }
  }

  transform (input) {
    let { transformation } = this
    if (!transformation) { return input }
    return input.replace(transformation.find, this.replacer)
  }
}

module.exports = Insertion
