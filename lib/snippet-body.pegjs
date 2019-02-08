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
  return { index: makeInteger(index), choice: choice }
}

choicecontents = elem:choicetext rest:(',' val:choicetext { return val } )* {
  return [elem, ...rest]
}

choicetext = choicetext:(choiceEscaped / [^|,] / barred:('|' &[^}]) { return barred.join('') } )+ {
  return choicetext.join('')
}

// Transform is applied when tabbed off
transform = '/' regex:regexString '/' replace:replace '/' flags:flags {
  return { find: new RegExp(regex, flags), replace: replace }
}

regexString = regex:(escaped / [^/])* {
  return regex.join('')
}

replace = (format / replacetext)*

// TODO: Support conditionals
format = simpleFormat / formatWithoutPlaceholder / formatWithCaseTransform / formatEscape

simpleFormat = '$' index:int {
  return { backreference: makeInteger(index) }
}

formatWithoutPlaceholder = '${' index:int '}' {
  return { backreference: makeInteger(index) }
}

formatWithCaseTransform = '${' index:int ':' casetransform:casetransform '}' {
  return { backreference: makeInteger(index), transform: casetransform }
}

formatEscape = '\\' flag:[ULulErn$] {
  return { escape: flag }
}

casetransform = '/' type:[a-zA-Z]* {
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

text = text:(escaped / !tabstop !tabstopWithPlaceholder !variable !choice  char:. { return char })+ {
  return text.join('')
}

nonCloseBraceText = text:(escaped / !tabstop !tabstopWithPlaceholder !variable !choice char:[^}] { return char })+ {
    return text.join('')
}
