const {Point} = require('atom')

module.exports = { transformWithSubstitution, getEndpointOfText }

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
  }
}

function flagTransformText (str, flags) {
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

function transformWithSubstitution (input, substitution, transformResolver) {
  if (!substitution) { return input }

  return input.replace(substitution.find, (...match) => {
    const flags = {
      uppercaseAll: false,
      lowercaseAll: false,
      uppercaseNext: false,
      lowercaseNext: false
    }

    let result = ''

    substitution.replace.forEach(token => {
      if (typeof token === 'string') {
        result += flagTransformText(token, flags)
        return
      }

      if (token.escape !== undefined) {
        switch (token.escape) {
          case 'r':
            result += '\\r'
            break
          case 'n':
            result += '\\n'
            break
          case '$':
            result += '$'
            break
          default:
            ESCAPES[token.escape](flags)
        }
        return
      }

      if (token.backreference === undefined) { return } // NOTE: this shouldn't trigger, but can safeguard against future grammar refactors

      let original = match[token.backreference]

      if (original === undefined) {
        if (token.elsetext) {
          result += flagTransformText(token.elsetext, flags)
        }
        return
      }

      if (token.iftext !== undefined) { // NOTE: Should we treat the empty string as a match?
        original = token.iftext
      }

      if (token.transform) {
        if (transformResolver === undefined) return

        const { hasResolver, value } = transformResolver.resolve(token.transform, {transform: token.transform, input: original})
        if (hasResolver && value) {
          result += value
        }
        return
      }

      result += flagTransformText(original, flags)
    })

    return result
  })
}

function getEndpointOfText (text) {
  const newlineMatch = /\n/g // NOTE: This is the same as used by TextBuffer, so should work even with \r
  let row = 0
  let lastIndex = 0

  while (newlineMatch.exec(text) !== null) {
    row += 1
    lastIndex = newlineMatch.lastIndex
  }

  return new Point(row, text.length - lastIndex)
}
