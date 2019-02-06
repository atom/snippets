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
transform = '/' regex:regex '/' replace:replace '/' flags:flags {
    return { regex: regex, format: replace, flags: flags }
}

regex = regex:(escaped / [^/])* {
	return new RegExp(regex.join(''))
}

replace = (format / replacetext)*

// TODO: Format with conditionals on match
format = simpleFormat / formatWithoutPlaceholder / formatWithCaseTransform

simpleFormat = '$' index:int {
	return { index: makeInteger(index) }
}

formatWithoutPlaceholder = '${' index:int '}' {
	return { index: makeInteger(index) }
}

formatWithCaseTransform = '${' index:int ':' casetransform:casetransform '}' {
	return { index: makeInteger(index), transform: casetransform }
}

casetransform = '/' type:[a-zA-Z]* {
	type = type.join('')
	switch (type) {
    	case 'upcase':
      case 'downcase':
      case 'capitalize':
      	return type
      default:
      	return 'none'
    }
}

replacetext = replacetext:(escaped / !format char:[^/] { return char })+ {
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
    case '\x7D':
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

token = escaped / !tabstop !tabstopWithPlaceholder !variable !choice  char:. { return char }

flags = flags:[a-z]* {
	return flags.join('') + 'g'
}

text = text:token+ { return text.join('') }

nonCloseBraceText = text:(escaped / !tabstop !tabstopWithPlaceholder !variable !choice char:[^}] { return char })+ {
    return text.join('')
}