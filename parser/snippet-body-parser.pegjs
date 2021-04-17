{
  const toUpper = string => string.toLocaleUpperCase()
  const toLower = string => string.toLocaleLowerCase()
  const upperFirst = string => string.replace(/^\p{CWU}/u, char => toUpper(char))

  // Handle and allow certain characters to be escaped in certain contexts
  const escapes = ['$']
  const escape = iterable => escapes.push(iterable)
  const escaped = value => escapes[escapes.length - 1].includes(value)
}

Snippet = body:(Expression / String)+ { return new Snippet(body) }

Expression
  = "$" id:(Tabstop / Variable) { return new Expression(id) }
  / "${" id:(Tabstop / Variable) "}" { return new Expression(id) }
  / "${" id:(Tabstop / Variable) content:Placeholder "}" { return new Placeholder(id, content) }
  / "${" id:Variable transformation:Transformation "}" { return new Transformation(id, transformation) }
  / "${" id:Tabstop choices:Choice "}" { return new Choice(id, choices) }

Tabstop = Int

Variable = $(char:. & { return /[\p{L}\d_]/u.test(char) })+

Choice = "|" first:Selection rest:("," @Selection)* "|" { return [...rest, first] }

Selection = & { return escape(',|') } @String EOL

Placeholder = ":" & { /*{*/ return escape('$}') } @Snippet EOL

Transformation = "/" @RegExp "/" @Format "/" @$[gimsuy]*

RegExp = & { return escape('/') } @String EOL

Format
  = & { return escape('$/') } @(Insert / String)+ EOL
  / "" { return [''] }

Insert
  = '$' @Int
  / '${' @Int '}'
  / '${' @Int ':' & { /*{*/ return escape('}') } @Transform EOL '}'

Transform
  = '/upcase' { return toUpper }
  / '/downcase' { return toLower }
  / '/capitalize' { return upperFirst }
  / '+' if_:String { return [if_, ''] }
  / '-'? else_:String { return ['', else_] }
  / '?' & { return escape(':') } @String EOL ':' @String

Int = int:$[0-9]+ { return Number.parseInt(int) }

String = chars:(@Escape / @char:. & { return !escaped(char) })+ { return chars.join('') }

EOL = & { return escapes.pop() }

Escape = "\\" @char:. & { return escaped(char) }
