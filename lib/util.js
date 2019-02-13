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

function transformWithSubstitution (input, substitution) {
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
      } else if (token.backreference !== undefined) {
        const original = match[token.backreference]
        if (token.transform) {
          switch (token.transform) {
            case 'upcase':
              result += original.toLocaleUpperCase()
              break
            case 'downcase':
              result += original.toLocaleLowerCase()
              break
            case 'capitalize':
              result += original ? original[0].toLocaleUpperCase() + original.substr(1) : ''
              break
            default: {} // TODO: Allow custom transformation handling (important for future proofing changes in the standard)
          }
        } else {
          result += flagTransformText(original, flags)
        }
      }
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
