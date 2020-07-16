const BodyParser = require('../lib/snippet-body-parser');

describe("Snippet Body Parser", () => {
  function expectMatch(input, tree) {
    expect(BodyParser.parse(input)).toEqual(tree);
  }

  it("parses snippets with no special behaviour as plain text", () => {
    const plainSnippets = [
      "foo $ bar",
      "$% $ 1 ${/upcase} \n ${|world|} ${3foo}",
    ];

    for (const plain of plainSnippets) {
      expectMatch(plain, [plain]);
    }
  });

  it("parses simple tab stops", () => {
    expectMatch("hello$1world${2}", [
      "hello", {index: 1, content: []}, "world", {index: 2, content: []},
    ]);
  });

  it("doesn't find escaped tab stops", () => {
    expectMatch("\\$1", ["$1"]);
  })

  it("parses simple variables", () => {
    expectMatch("hello$foo2__bar&baz${abc}d", [
      "hello", {variable: "foo2__bar"}, "&baz", {variable: "abc"}, "d"
    ]);
  });

  describe("only escapes a select few characters", () => {
    const escapeTest = "\\$ \\\\ \\} \\% \\* \\, \\| \\{ \\n \\r \\:";

    const escapeResolveTop = "$ \\ } \\% \\* \\, \\| \\{ \\n \\r \\:";

    const escapeResolveChoice = "\\$ \\ \\} \\% \\* , | \\{ \\n \\r \\:";

    it("only escapes '$', '\\', and '}' in top level text", () => {
      expectMatch(escapeTest, [
        escapeResolveTop
      ]);
    });

    it("escapes the same characters inside tab stop placeholders as in top level text", () => {
      expectMatch(`\${1:${escapeTest}}`, [
        {index: 1, content: [escapeResolveTop]},
      ]);
    });

    it("escapes the same characters inside variable placeholders as in top level text", () => {
      expectMatch(`\${foo:${escapeTest}}`, [
        {variable: "foo", content: [escapeResolveTop]},
      ]);
    });

    it("escapes ',', '|', and '\\' in choice text", () => {
      expectMatch(`\${1|${escapeTest}|}`, [
        {index: 1, choices: [escapeResolveChoice]},
      ]);
    });
  });

  it("does not recognise a tab stop with transformation if the transformation is invalid regex", () => {
    expectMatch("${1/foo/bar/a}", ["${1/foo/bar/a}"]); // invalid flag
    expectMatch("${1/fo)o/bar/}", ["${1/fo)o/bar/}"]); // invalid body
  });

  it("breaks a snippet body into lines, with each line containing tab stops at the appropriate position", () => {
    expectMatch("the quick brown $1fox ${2:jumped ${3:over}\n}the ${4:lazy} dog", [
      "the quick brown ",
      {index: 1, content: []},
      "fox ",
      {
        index: 2,
        content: [
          "jumped ",
          {index: 3, content: ["over"]},
          "\n"
        ],
      },
      "the ",
      {index: 4, content: ["lazy"]},
      " dog"
    ]);
  });

  it("removes interpolated variables in placeholder text (we don't currently support it)", () => {
    expect(t("module ${1:ActiveRecord::${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}}")).toEqual([
      "module ",
      {
        index: 1,
        content: ["ActiveRecord::", ""]
      }
    ]);
  });

  it("skips escaped tabstops", () => {
    expectMatch("$1 \\$2 $3 \\\\$4 \\\\\\$5 $6", [
      {index: 1, content: []},
      ' $2 ',
      {index: 3, content: []},
      ' \\',
      {index: 4, content: []},
      ' \\$5 ',
      {index: 6, content: []}
    ]);
  });

  it("includes escaped right-braces", () => {
    expectMatch("snippet ${1:{\\}}", [
      "snippet ",
      {
        index: 1,
        content: ["{}"]
      }
    ]);
  });

  it("parses a snippet with transformations", () => {
    const bodyTree = BodyParser.parse("<${1:p}>$0</${1/f/F/}>");
    expect(bodyTree).toEqual([
      '<',
      {index: 1, content: ['p']},
      '>',
      {index: 0, content: []},
      '</',
      {index: 1, content: [], substitution: {find: /f/g, replace: ['F']}},
      '>'
    ]);
  });

  it("parses a snippet with multiple tab stops with transformations", () => {
    const bodyTree = BodyParser.parse("${1:placeholder} ${1/(.)/\\u$1/} $1 ${2:ANOTHER} ${2/^(.*)$/\\L$1/} $2");
    expect(bodyTree).toEqual([
      {index: 1, content: ['placeholder']},
      ' ',
      {
        index: 1,
        content: [],
        substitution: {
          find: /(.)/g,
          replace: [
            {escape: 'u'},
            {backreference: 1}
          ]
        }
      },
      ' ',
      {index: 1, content: []},
      ' ',
      {index: 2, content: ['ANOTHER']},
      ' ',
      {
        index: 2,
        content: [],
        substitution: {
          find: /^(.*)$/g,
          replace: [
            {escape: 'L'},
            {backreference: 1}
          ]
        }
      },
      ' ',
      {index: 2, content: []},
    ]);
  });


  it("parses a snippet with transformations and mirrors", () => {
    const bodyTree = BodyParser.parse("${1:placeholder}\n${1/(.)/\\u$1/}\n$1");
    expect(bodyTree).toEqual([
      {index: 1, content: ['placeholder']},
      '\n',
      {
        index: 1,
        content: [],
        substitution: {
          find: /(.)/g,
          replace: [
            {escape: 'u'},
            {backreference: 1}
          ]
        }
      },
      '\n',
      {index: 1, content: []}
    ]);
  });

  it("parses a snippet with a format string and case-control flags", () => {
    const bodyTree = BodyParser.parse("<${1:p}>$0</${1/(.)(.*)/\\u$1$2/}>");
    expect(bodyTree).toEqual([
      '<',
      {index: 1, content: ['p']},
      '>',
      {index: 0, content: []},
      '</',
      {
        index: 1,
        content: [],
        substitution: {
          find: /(.)(.*)/g,
          replace: [
            {escape: 'u'},
            {backreference: 1},
            {backreference: 2}
          ]
        }
      },
      '>'
    ]);
  });

  it("parses a snippet with an escaped forward slash in a transform", () => {
    // Annoyingly, a forward slash needs to be double-backslashed just like the
    // other escapes.
    const bodyTree = BodyParser.parse("<${1:p}>$0</${1/(.)\\/(.*)/\\u$1$2/}>");
    expect(bodyTree).toEqual([
      '<',
      {index: 1, content: ['p']},
      '>',
      {index: 0, content: []},
      '</',
      {
        index: 1,
        content: [],
        substitution: {
          find: /(.)\/(.*)/g,
          replace: [
            {escape: 'u'},
            {backreference: 1},
            {backreference: 2}
          ]
        }
      },
      '>'
    ]);
  });

  it("parses a snippet with a placeholder that mirrors another tab stop's content", () => {
    const bodyTree = BodyParser.parse("$4console.${3:log}('${2:$1}', $1);$0");
    expect(bodyTree).toEqual([
      {index: 4, content: []},
      'console.',
      {index: 3, content: ['log']},
      '(\'',
      {
        index: 2, content: [
          {index: 1, content: []}
        ]
      },
      '\', ',
      {index: 1, content: []},
      ');',
      {index: 0, content: []}
    ]);
  });

  it("parses a snippet with a placeholder that mixes text and tab stop references", () => {
    const bodyTree = BodyParser.parse("$4console.${3:log}('${2:uh $1}', $1);$0");
    expect(bodyTree).toEqual([
      {index: 4, content: []},
      'console.',
      {index: 3, content: ['log']},
      '(\'',
      {
        index: 2, content: [
          'uh ',
          {index: 1, content: []}
        ]
      },
      '\', ',
      {index: 1, content: []},
      ');',
      {index: 0, content: []}
    ]);
  });
});
