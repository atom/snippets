{
  // Joins all consecutive strings in a collection without clobbering any
  // non-string members.
  function coalesce (parts) {
    const result = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const ri = result.length - 1;
      if (typeof part === 'string' && typeof result[ri] === 'string') {
        result[ri] = result[ri] + part;
      } else {
        result.push(part);
      }
    }
    return result;
  }

  function flatten (parts) {
    return parts.reduce(function (flat, rest) {
      return flat.concat(Array.isArray(rest) ? flatten(rest) : rest);
    }, []);
  }

  function makeInteger(i) {
    return parseInt(i.join(""), 10);
  }
}

bodyContent = content:(tabstop / placeholder / choice / variable)* { return content; }

tabstop = simpleTabstop / tabStopWithoutPlaceholder / tabStopWithTransformation

simpleTabstop = '$' index:int {
	return { index: makeInteger(index), content: [] }
}

tabStopWithoutPlaceholder = '${' index:int '}' {
	return { index: makeInteger(index), content: [] }
}

tabStopWithTransformation = '${' index:int substitution:transform '}' {
	return {
    	index: makeInteger(index),
        content: [],
        substitution: substitution
    }
}


placeholder = '${' index:int ':' content:bodyContent '}' {
	return { index: makeInteger(index), content: content }
}

choice = '${' index:int '|' foo:choicecontents '|}' {
	return { foo }
}

choicecontents = elem:choicetext rest:(',' rest:choicecontents { return rest } )? {
	if (rest) {
    	return [elem, ...rest]
    }
    return [elem]
}

choicetext = choicetext:(escaped / [^|,] / '|' [^}] )+ {
	return choicetext.join('')
}

transform = '/' regex:regex '/' replace:replace '/' {
    return { regex: regex, format: replace }
}

regex = regex:(escaped / [^/])* {
	return regex.join('')
}

replace = format

format = '$' index:int {
	return { index: makeInteger(index) }
}

variable = [a-zA-Z_]+

int = [0-9]+

escaped = '\\' char:. { return char }

token = escaped / !tabstop char:. { return char }

text = text:token+ { return text.join('') }