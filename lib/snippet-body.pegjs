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
placeholderContent = content:(placeholderContentText / tabStop / variable )* { return content; }
placeholderContentText = text:placeholderContentChar+ { return text.join(''); }
placeholderContentChar = escaped / placeholderVariableReference / !tabStop !variable char:[^}] { return char; }

placeholderVariableReference = '$' digit:[0-9]+ { return { index: parseInt(digit.join(""), 10) }; }

variable = '${' variableContent '}' {
  return ''; // we eat variables and do nothing with them for now
}
variableContent = content:(variable / variableContentText)* { return content; }
variableContentText = text:variableContentChar+ { return text.join(''); }
variableContentChar = !variable char:('\\}' / [^}]) { return char; }

escapedForwardSlash = pair:'\\/' { return pair; }

// A pattern and replacement for a transformed tab stop.
transformationSubstitution = '/' find:([^/] / escapedForwardSlash)* '/' replace:formatString* '/' flags:[imy]* {
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
