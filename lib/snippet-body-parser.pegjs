{
  const upperFirst = (string, locale = navigator.language) =>
    string.replace(/^\p{CWU}/u, (character) => character.toLocaleUpperCase(locale));
  const lowerFirst = (string, locale = navigator.language) =>
    string.replace(/^\p{CWU}/u, (character) => character.toLocaleLowerCase(locale));
  const toUpper = (string, locale = navigator.language) =>
    string.toLocaleUpperCase(locale);
  const toLower = (string, locale = navigator.language) =>
    string.toLocaleLowerCase(locale);
}

Snippet
  = snippet:(PlainText / Variable)* {
      return new Snippet({ value: snippet, range: range(), registery });
    }

PlainText
  = plaintext:(@EscapeSequence / !Variable @.)+ { return plaintext.join(''); }

Variable
  = "$" variable:(Identifier / Expression) {
      return registery.add(new Variable({ ...variable, range: range() }));
    }

Identifier
  = identifier:$(
    Integer
    / (character:. & { return /[\p{L}\d_]/u.test(character); })+
  ) { return { identifier }; }

Expression
  = "{"
    identifier:Identifier
    expression:(Placeholder / Choice / Transformation)?
    "}" { return { ...identifier, ...expression }; }

Placeholder = ":" value:(Value / Variable)+ { return { value }; }

Value
  = characters:(@EscapeSequence / !Variable @[^}])+ { return characters.join(''); }

Choice = "|" choices:(@Selection ","?)+ "|" { return { value:[choices] }; }

Selection
  = characters:(@EscapeSequence / !Variable @[^,|}])+ { return characters.join(''); }

Transformation
  = "/" regexp:$[^/}]+ "/" format:Format "/" flags:$[gimsuy]* {
      return {
      	format,
        transformation: (value) => {
          let fold = (sequence) => sequence;
          regexp = new RegExp(regexp, flags);
          return format.reduce((result, sequence) => {
            if (sequence instanceof Function) {
              fold = sequence;
            } else if (Array.isArray(sequence)) {
              const [group, insertion, replacement = ''] = sequence;
              result += fold(value.replace(regexp, group) ? insertion : replacement);
            } else {
              result += fold(value.replace(regexp, sequence), value, regexp);
            }
            return result;
          }, '');
        },
      };
    }

Format
  = (
    CaseFold
    / ConditionalInsert
    / Replacement
  )+
  / "" { return ['']; }

Replacement = characters:(@EscapeSequence / !CaseFold !ConditionalInsert @[^/}])+ { return characters.join(''); }

CaseFold
  = "\\E" { return (sequence) => sequence; }
  / "\\u" { return upperFirst; }
  / "\\l" { return lowerFirst; }
  / "\\U" { return toUpper; }
  / "\\L" { return toLower; }

ConditionalInsert
  = "(?" group:$Integer insertion:Insertion replacement:Insertion? ")" {
      return [`$${group}`, insertion, replacement != null ? replacement : undefined];
    }

Insertion
  = ":" characters:(@EscapeSequence / @[^:)])+ { return characters.join(''); }

EscapeSequence
  = "\\n" { return '\n'; }
  / "\\r" { return '\r'; }
  / "\\v" { return '\v'; }
  / "\\t" { return '\t'; }
  / "\\b" { return '\b'; }
  / "\\f" { return '\f'; }
  / "\\u" codepoint:(UTF16 / UTF32) {
      return String.fromCodePoint(Number.parseInt(codepoint, 16));
    }
  / "\\" @.

UTF16 = $(HexDigit HexDigit HexDigit HexDigit)

UTF32 = "{" @$(HexDigit HexDigit? HexDigit? HexDigit? HexDigit? HexDigit?) "}"

HexDigit = [0-9a-f]i

Integer = [0-9]+
