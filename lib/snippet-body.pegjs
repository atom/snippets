{
  function makeInteger(i) {
    return parseInt(i.join(""), 10);
  }
}

bodyContent = content:(tabstop / choice / variable / text)* { return content; }

innerBodyContent = content:(tabstop / choice / variable / nonCloseBraceText)* { return content; }

tabstop = simpleTabstop / tabstopWithoutPlaceholder / tabstopWithPlaceholder / tabstopWithTransform

simpleTabstop = '$' index:int {
  return { index: makeInteger(index), content: [] }
}

tabstopWithoutPlaceholder = '${' index:int '}' {
  return { index: makeInteger(index), content: [] }
}

tabstopWithPlaceholder = '${' index:int ':' content:innerBodyContent '}' {
  return { index: makeInteger(index), content: content }
}

tabstopWithTransform = '${' index:int substitution:transform '}' {
  return {
    index: makeInteger(index),
    content: [],
    substitution: substitution
  }
}

choice = '${' index:int '|' choice:choicecontents '|}' {
  const content = choice.length > 0 ? [choice[0]] : []
  return { index: makeInteger(index), choice: choice, content: content }
}

choicecontents = elem:choicetext rest:(',' val:choicetext { return val } )* {
  return [elem, ...rest]
}

choicetext = choicetext:(choiceEscaped / [^|,] / barred:('|' &[^}]) { return barred.join('') } )+ {
  return choicetext.join('')
}

transform = '/' regex:regexString '/' replace:replace '/' flags:flags {
  return { find: new RegExp(regex, flags), replace: replace }
}

regexString = regex:(escaped / [^/])* {
  return regex.join('')
}

replace = (format / replacetext)*

format = simpleFormat / formatWithoutPlaceholder / formatWithCaseTransform / formatWithIf / formatWithIfElse / formatWithElse / formatEscape

simpleFormat = '$' index:int {
  return { backreference: makeInteger(index) }
}

formatWithoutPlaceholder = '${' index:int '}' {
  return { backreference: makeInteger(index) }
}

formatWithCaseTransform = '${' index:int ':' caseTransform:caseTransform '}' {
  return { backreference: makeInteger(index), transform: caseTransform }
}

formatWithIf = '${' index:int ':+' iftext:(nonCloseBraceText / '') '}' {
  return { backreference: makeInteger(index), iftext: iftext}
}

formatWithElse = '${' index:int (':-' / ':') elsetext:(nonCloseBraceText / '') '}' {
  return { backreference: makeInteger(index), elsetext: elsetext }
}

formatWithIfElse = '${' index:int ':?' iftext:nonColonText ':' elsetext:(nonCloseBraceText / '') '}' {
  return { backreference: makeInteger(index), iftext: iftext, elsetext: elsetext }
}

nonColonText = text:('\\:' / [^:])* {
	return text.join('')
}

formatEscape = '\\' flag:[ULulErn$] {
  return { escape: flag }
}

caseTransform = '/' type:[a-zA-Z]* {
  return type.join('')
}

replacetext = replacetext:(!formatEscape escaped / !format char:[^/] { return char })+ {
  return replacetext.join('')
}

variable = simpleVariable / variableWithoutPlaceholder / variableWithPlaceholder / variableWithTransform

simpleVariable = '$' name:variableName {
  return { variable: name }
}

variableWithoutPlaceholder = '${' name:variableName '}' {
  return { variable: name  }
}

variableWithPlaceholder = '${' name:variableName ':' content:innerBodyContent '}' {
  return { variable: name, content: content }
}

variableWithTransform = '${' name:variableName substitution:transform '}' {
  return { variable: name, substitution: substitution }
}

variableName = first:[a-zA-Z_] rest:[a-zA-Z_0-9]* {
  return first + rest.join('')
}

int = [0-9]+

escaped = '\\' char:. {
  switch (char) {
    case '$':
    case '\\':
    case '\x7D': // back brace; PEGjs would treat it as the JS scope end though
      return char
    default:
      return '\\' + char
  }
}

choiceEscaped = '\\' char:. {
  switch (char) {
    case '$':
    case '\\':
    case '\x7D':
    case '|':
    case ',':
      return char
    default:
      return '\\' + char
  }
}

flags = flags:[a-z]* {
  return flags.join('')
}

text = text:(escaped / !tabstop !variable !choice  char:. { return char })+ {
  return text.join('')
}

nonCloseBraceText = text:(escaped / !tabstop !variable !choice char:[^}] { return char })+ {
  return text.join('')
}
