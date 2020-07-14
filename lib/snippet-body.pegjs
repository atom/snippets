/*

Target grammar:

(Based on VS Code and TextMate, with particular emphasis on supporting LSP snippets)
See https://microsoft.github.io/language-server-protocol/specification#snippet_syntax

any ::= (text | tabstop | choice | variable)*

text ::= anything that's not something else

tabstop ::= '$' int | '${' int '}' | '${' int transform '}' | '${' int ':' any '}'

choice ::= '${' int '|' text (',' text)* '|}'

variable ::= '$' var | '${' var '}' | '${' var ':' any '}' | '${' var transform '}'

transform ::= '/' regex '/' replace '/' options

replace ::= (format | text)*

format ::= '$' int | '${' int '}' | '${' int ':' modifier '}' | '${' int ':+' if:replace '}' | '${' int ':?' if:replace ':' else:replace '}' | '${' int ':-' else:replace '}' | '${' int ':' else:replace '}'

regex ::= JS regex value

options ::= JS regex options // NOTE: Unrecognised options should be ignored for the best fault tolerance (can log a warning though)

var ::= [a-zA-Z_][a-zA-Z_0-9]*

int ::= [0-9]+

*/

// Grab anything that isn't \ or $, then try to build a special node out of it, and (at the top level) if that fails then just accept it as text
topLevelContent = content:(text / escapedTopLevel / tabStop / choice / variable / any)* { return content; }

tabStopContent = content:(text / escapedTabStop / tabStop / choice / variable)* { return content; }

tabStop = tabStopSimple / tabStopWithoutPlaceholder / tabStopWithPlaceholder / tabStopWithTransform

tabStopSimple = '$' n:integer { return { index: n }; }

tabStopWithoutPlaceholder = '${' n:integer '}' { return { index: n }; }

tabStopWithPlaceholder = '${' n:integer ':' content:tabStopContent '}' { return { index: n, content }; }

tabStopWithTransform = '${' n:integer t:transformation '}' { return { index: n, transformation: t }; }

transformation = '/' capture:regexString '/' replace:replace '/' flags:flags { return { capture, flags, replace }; }

regexString = r:[^/]* { return r.join(""); }

replace = (format / replaceText)*

format = formatSimple / formatPlain / formatWithModifier / formatWithIf / formatWithIfElse / formatWithElse

formatSimple = '$' n:integer { return { backreference: n }; }

formatPlain = '${' n:integer '}' { return { backreference: n }; }

formatWithModifier = '${' n:integer ':' modifier:modifier '}' { return { backreference: n, modifier }; }

formatWithIf = '${' n:integer ':+' ifContent:replace '}' { return { backreference: n, ifContent }; }

formatWithIfElse = '${' n:integer ':?' ifContent:replace ':' elseContent:replace '}' { return { backreference: n, ifContent, elseContent }; }

formatWithElse = '${' n:integer ':' '-'? elseContent:replace { return { backreference: n, elseContent }; }

modifier = '/' modifier:var { return modifier; }

flags = f:[a-z]* { return f; }

choice = '${' n:integer '|' choiceText (',' choiceText)* '|}'

variable = variableSimple / variablePlain / variableWithPlaceholder / variableWithTransform

variableSimple = '$' v:var { return { variable: v }; }

variablePlain = '${' v:var '}' { return { variable: v }; }

variableWithPlaceholder = '${' v:var ':' content:tabStopContent '}' { return { variable: v, content }; }

variableWithTransform = '${' v:var t:transformation '}' { return { variable: v, transformation: t }; }

text = t:[^$\\}]+ { return t.join("") }

choiceText = t:[^,|]+ { return t.join(""); }

replaceText = t:[^$\\}/]+ { return t.join(""); }

// Match an escaped character. The set of characters that can be escaped is based on context, generally restricted to the minimum set that enables expressing any text content
escapedTopLevel = '\\' c:[$\\}] { return c; }

escapedTabStop = escapedTopLevel

escapedChoice = '\\' c:[$\\,|] { return c; }

// Match nonnegative integers like those used for tab stop ordering
integer = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

// Match variable names like TM_SELECTED_TEXT
var = a:[a-zA-Z_] b:[a-zA-Z_0-9]* { return a + b.join(""); }

// Match any single character. Useful to resolve any parse errors where something that looked like it would be special had malformed syntax.
any = a:. { return a; }
