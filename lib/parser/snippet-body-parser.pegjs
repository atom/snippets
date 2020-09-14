{
  const toUpper = string => string.toLocaleUpperCase()
  const toLower = string => string.toLocaleLowerCase()
  const upperFirst = string => string.replace(/^\p{CWU}/u, char => toUpper(char))
  const lowerFirst = string => string.replace(/^\p{CWU}/u, char => toLower(char))

  // Handle and allow certain characters to be escaped in certain contexts
  const escapes = ['$']
  const escape = iterable => escapes.push(iterable)
  const escaped = value => escapes[escapes.length - 1].includes(value)
  // At some point phase out old textmate syntax
  let legacySyntax = false
}

/*
Test recursion $1 $a ${2} ${b} ${c:d} ${e:f${g:h}i} ${j:k${l|m,n,o${p}q,r${s:t}u,v${w|y,x|}z|}} $å ${ä} ${ö|1,2,3|}
Test transforms ...
Test escape sequences ...
*/

Snippet = body:(Expression / String)+ { return new Snippet(body, legacySyntax) }

Expression
  = "$" construct:Construct { return new Modifier().modify(identifier) }
  / "${" construct:Construct modifier:Modifier "}" { return modifier.modify(construct) }

Construct
  = identifier:Tabstop { return [Tabstop, identifier] }
  / identifier:Variable { return [Variable, identifier] }

Tabstop = Int

Variable = $(char:. & { return /[\p{L}\d_]/u.test(char) })+

Modifier
  = choices:Choice { return new Choice(choices) }
  / content:Placeholder { return new Placeholder(content) }
  / transformation:Transformation { return new Transformation(transformation) }
  / "" { return new Modifier() }

Choice = "|" first:Selection rest:("," @Selection)* "|" { return [first, ...rest] }

Selection = & { return escape('$,|') } @Snippet EOL

Placeholder = ":" & { /*{*/ return escape('$}') } @Snippet EOL

Transformation = "/" @RegExp "/" @Format "/" @$[gimsuy]*

RegExp = & { return escapes.push('/') } @String EOL

Format
  = & { return escape('\\(/') } @(ConditionalInsert / CaseFold / String)+ EOL
  / "" { return [''] }

ConditionalInsert
  = "(?" group:Int insert:Insert replacement:Insert? ")" {
      return { group: `$${group || '$'}`, insert, replacement }
    }

Insert = ":" & { return escape(':)') } @String EOL

CaseFold
  = "\\E" { return sequence => sequence }
  / "\\u" { return upperFirst }
  / "\\l" { return lowerFirst }
  / "\\U" { return toUpper }
  / "\\L" { return toLower }

Int = int:$[0-9]+ { return Number.parseInt(int) }

String = chars:(@Escape / @char:. & { return !escaped(char) })+ { return chars.join('') }

EOL = & { return escapes.pop() }

Escape
  = "\\n" { return '\n' }
  / "\\r" { return '\r' }
  / "\\v" { return '\v' }
  / "\\t" { return '\t' }
  / "\\b" { return '\b' }
  / "\\f" { return '\f' }
  / "\\u" codepoint:(UTF32 / UTF16) {
      return String.fromCodePoint(Number.parseInt(codepoint, 16))
    }
  / "\\" @char:. & { return escaped(char) }

UTF32 = "{" @$(Hex Hex? Hex? Hex? Hex? Hex?) "}"

UTF16 = $(Hex Hex Hex Hex)

Hex = [0-9a-f]i
