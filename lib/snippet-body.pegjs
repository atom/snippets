{
  // Joins all consecutive strings in a collection without clobbering any
  // non-string members.
  function coalesce (parts) {
  	var result = [], ri;
    var part;
    for (var i = 0; i < parts.length; i++) {
      part = parts[i];
      ri = result.length - 1;
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
}
bodyContent = content:(tabStop / bodyContentText)* { return content; }
bodyContentText = text:bodyContentChar+ { return text.join(''); }
bodyContentChar = escaped / !tabStop char:. { return char; }

escaped = '\\' char:. { return char; }
tabStop =  tabStopWithTransformation /  tabStopWithPlaceholder / tabStopWithoutPlaceholder / simpleTabStop

simpleTabStop = '$' index:[0-9]+ {
  return { index: parseInt(index.join("")), content: [] };
}
tabStopWithoutPlaceholder = '${' index:[0-9]+ '}' {
  return { index: parseInt(index.join("")), content: [] };
}
tabStopWithPlaceholder = '${' index:[0-9]+ ':' content:placeholderContent '}' {
  return { index: parseInt(index.join("")), content: content };
}
tabStopWithTransformation = '${' index:[0-9]+ substitution:transformationSubstitution '}' {
  return {
    index: parseInt(index.join(""), 10),
    content: [],
    substitution: substitution
  };
}

placeholderContent = content:(tabStop / placeholderContentText / variable )* { return flatten(content); }
placeholderContentText = text:placeholderContentChar+ { return coalesce(text); }
placeholderContentChar = escaped / placeholderVariableReference / !tabStop !variable char:[^}] { return char; }

placeholderVariableReference = '$' digit:[0-9]+ {
  return { index: parseInt(digit.join(""), 10), content: [] };
}

variable = '${' variableContent '}' {
  return ''; // we eat variables and do nothing with them for now
}
variableContent = content:(variable / variableContentText)* { return content; }
variableContentText = text:variableContentChar+ { return text.join(''); }
variableContentChar = !variable char:('\\}' / [^}]) { return char; }

escapedForwardSlash = pair:'\\/' { return pair; }

// A pattern and replacement for a transformed tab stop.
transformationSubstitution = '/' find:(escapedForwardSlash / [^/])* '/' replace:formatString* '/' flags:[imy]* {
  let reFind = new RegExp(find.join(''), flags.join('') + 'g');
  return { find: reFind, replace: replace[0] };
}

formatString = content:(formatStringEscape / formatStringReference / escapedForwardSlash / [^/])+ {
  return content;
}
// Backreferencing a substitution. Different from a tab stop.
formatStringReference = '$' digits:[0-9]+ {
  return { backreference: parseInt(digits.join(''), 10) };
};
// One of the special control flags in a format string for case folding and
// other tasks.
formatStringEscape = '\\' flag:[ULulErn$] {
  return { escape: flag };
}
