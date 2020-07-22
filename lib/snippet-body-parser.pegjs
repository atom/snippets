{
  const upperFirst = (string, locale = navigator.language) =>
    string.replace(/^\p{CWU}/u, character => character.toLocaleUpperCase(locale))
  const lowerFirst = (string, locale = navigator.language) =>
    string.replace(/^\p{CWU}/u, character => character.toLocaleLowerCase(locale))
  const toUpper = (string, locale = navigator.language) => string.toLocaleUpperCase(locale)
  const toLower = (string, locale = navigator.language) => string.toLocaleLowerCase(locale)
}

Snippet = body:(Text / Variable)* { return new Snippet({ body }) }

Text = text:(@EscapeSequence / !Variable @.)+ { return text.join("") }

Variable
  = "$" variable:(Identifier / Expression) {
      switch (true) {
        case variable.body instanceof Set:
          return new Choice(variable)
        case Number.isInteger(variable.identifier):
          return new Tabstop(variable)
        default:
          return new Variable(variable)
      }
    }

Identifier
  = identifier:(Integer / $(character:. & { return /[\p{L}\d_]/u.test(character) })+) {
      return { identifier }
    }

Expression
  = "{"
    identifier:Identifier
    expression:(& { return !identifier.identifier.length } @Choice / Placeholder / Transformation)?
    "}" { return { ...identifier, ...expression } }

Placeholder = ":" body:(Value / Variable)+ { return { body } }

Value = text:(@EscapeSequence / !Variable @[^}])+ { return text.join("") }

Choice = "|" choices:(@Selection ","?)+ "|" { return { body: new Set(choices) } }

Selection = text:(@EscapeSequence / !Variable @[^,|}])+ { return text.join("") }

Transformation
  = "/" regexp:$[^/}]+ "/" format:Format "/" flags:$[gimsuy]* {
      return {
        transformation: (value) => {
          let fold = (sequence) => sequence
          regexp = new RegExp(regexp, flags)
          return format.reduce((result, sequence) => {
            if (sequence instanceof Function) {
              fold = sequence
            } else if (Array.isArray(sequence)) {
              const [group, insertion, replacement = ""] = sequence
              result += fold(value.replace(regexp, group) ? insertion : replacement)
            } else {
              result += fold(value.replace(regexp, sequence), value, regexp)
            }
            return result
          }, "")
        }
      }
    }

Format
  = (CaseFold / ConditionalInsert / Replacement)+
  / "" { return [""] }

Replacement
  = text:(@EscapeSequence / !CaseFold !ConditionalInsert @[^/}])+ { return text.join("") }

CaseFold
  = "\\E" { return sequence => sequence }
  / "\\u" { return upperFirst }
  / "\\l" { return lowerFirst }
  / "\\U" { return toUpper }
  / "\\L" { return toLower }

ConditionalInsert
  = "(?" group:Integer insertion:Insertion replacement:Insertion? ")" {
      return [`$${group}`, insertion, replacement != null ? replacement : undefined]
    }

Insertion = ":" text:(@EscapeSequence / @[^:)])+ { return text.join("") }

EscapeSequence
  = "\\n" { return "\n" }
  / "\\r" { return "\r" }
  / "\\v" { return "\v" }
  / "\\t" { return "\t" }
  / "\\b" { return "\b" }
  / "\\f" { return "\f" }
  / "\\u" codepoint:(UTF16 / UTF32) {
      return String.fromCodePoint(Number.parseInt(codepoint, 16))
    }
  / "\\" @.

UTF16 = $(HexDigit HexDigit HexDigit HexDigit)

UTF32 = "{" @$(HexDigit HexDigit? HexDigit? HexDigit? HexDigit? HexDigit?) "}"

HexDigit = [0-9a-f]i

Integer = integer:$[0-9]+ { return Number.parseInt(integer) }
