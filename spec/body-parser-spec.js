const SnippetParser = require('../lib/snippet-body-parser');

describe("Snippet Body Parser", () => {
  // Helper for testing a snippet parse tree. The `input`
  // is the snippet string, the `tree` is the expected
  // parse tree.
  function expectMatch(input, tree) {
    expect(SnippetParser.parse(input)).toEqual(tree);
  }

  describe("when parsing tab stops", () => {
    it("parses simple tab stops", () => {
      expectMatch("hello$1world${2}", [
        "hello", { index: 1 }, "world", { index: 2 },
      ]);
    });

    it("skips escaped tab stops", () => {
      expectMatch("$1 \\$2 $3", [
        { index: 1 },
        " $2 ",
        { index: 3 },
      ]);
    });

    it("only allows non-negative integer stop numbers", () => {
      expectMatch("$0", [{ index: 0 }]);
      expectMatch("$99999", [{ index: 99999 }]);
      expectMatch("$-1", ["$-1"]);
      expectMatch("${-1}", ["${-1}"]);
      expectMatch("$1.5", [{ index: 1 }, ".5"]);
      expectMatch("${1.5}", ["${1.5}"]);
    });

    describe("with placeholders", () => {
      it("allows placeholders to be empty", () => {
        expectMatch("${1:}", [{ index: 1, content: [] }]);
      });

      it("allows placeholders to be arbitrary", () => {
        expectMatch("${1:${2}$foo${3|a,b|}}", [
          {
            index: 1,
            content: [
              { index: 2 },
              { variable: "foo" },
              { index: 3, choices: ["a", "b"] },
            ]
          }
        ]);
      });

      it("even lets placeholders contain placeholders", () => {
        expectMatch("${1:${2:${3:levels}}}", [
          {
            index: 1,
            content: [
              {
                index: 2,
                content: [
                  {
                    index: 3,
                    content: [
                      "levels"
                    ]
                  }
                ]
              }
            ]
          }
        ]);
      });

      it("ends the placeholder at an unmatched '}'", () => {
        expectMatch("${1:}}", [
          {
            index: 1,
            content: []
          },
          "}"
        ]);
      });

      it("allows escaping '}' in placeholders", () => {
        expectMatch("${1:\\}}", [{ index: 1, content: ["}"] }]);
      });

      it("allows '$' in placeholders", () => {
        expectMatch("${1:$}", [
          {
            index: 1,
            content: [
              "$"
            ]
          }
        ]);
      });
    });

    // See the transformations section for more thorough testing
    describe("with transformations", () => {
      it("parses simple transformations", () => {
        expectMatch("${1/foo/bar/}", [
          {
            index: 1,
            transformation: {
              find: /foo/,
              replace: [
                "bar"
              ]
            }
          }
        ]);
      });
    });
  });

  describe("when parsing variables", () => {
    it("parses simple variables", () => {
      expectMatch("hello$foo2__bar&baz${abc}d", [
        "hello",
        { variable: "foo2__bar" },
        "&baz",
        { variable: "abc" },
        "d"
      ]);
    });

    it("skips escaped variables", () => {
      expectMatch("\\$foo $b\\ar $\\{baz}", [
        "$foo ",
        { variable: "b" },
        "\\ar $\\{baz}",
      ]);
    });

    describe("naming", () => {
      it("only allows ASCII letters, numbers, and underscores in names", () => {
        expectMatch("$abc_123-not", [{ variable: "abc_123" }, "-not"]);
      });

      it("allows names to start with underscores", () => {
        expectMatch("$__properties", [{ variable: "__properties" }]);
      });

      it("doesn't allow names to start with a number", () => {
        expectMatch("$1foo", [{ index: 1 }, "foo"]);
      });
    });

    // The placeholder implementation is expected to be the same as for tab stops, so
    // see the tab stop placeholder section for more thorough tests
    describe("with placeholders", () => {
      it("allows placeholders to be arbitrary", () => {
        expectMatch("${foo:${2}$bar${3|a,b|}}", [
          {
            variable: "foo",
            content: [
              { index: 2 },
              { variable: "bar" },
              { index: 3, choices: ["a", "b"] },
            ]
          }
        ]);
      });

      it("allows escaping '}' in placeholders", () => {
        expectMatch("${foo:\\}}", [{ variable: "foo", content: ["}"] }]);
      });
    });

    // See the transformations section for more thorough testing
    describe("with transformations", () => {
      it("parses simple transformations", () => {
        expectMatch("${var/foo/bar/}", [
          {
            variable: "var",
            transformation: {
              find: /foo/,
              replace: [
                "bar"
              ]
            }
          }
        ]);
      });
    });
  });

  describe("when parsing choices", () => {
    it("parses simple choices", () => {
      expectMatch("${1|a,b,c|}", [{ index: 1, choices: ["a", "b", "c"] }]);
    });

    it("parses empty choices", () => {
      expectMatch("${1||}", [{ index: 1, choices: [] }]);
    });

    it("skips escaped choices", () => {
      expectMatch("\\${1|a|}", ["${1|a|}"]);
    });

    it("treats choice items as plain text", () => {
      expectMatch("${1|$2,$foo|}", [{ index: 1, choices: ["$2", "$foo"] }]);
    });

    it("only allows ',' and '|' to be escaped in choice text", () => {
      expectMatch("${1|a,b\\,c,d\\|},e\\$f|}", [
        {
          index: 1,
          choices: [
            "a",
            "b,c",
            "d|}",
            "e\\$f"
          ]
        }
      ]);
    });
  });

  describe("when parsing transformations", () => {
    it("allows an empty transformation", () => {
      expectMatch("${1///}", [{ index: 1, transformation: { find: new RegExp(""), replace: [] } }]);
    });

    it("applies flags to the find regex", () => {
      expectMatch("${1/foo/bar/gimsuy}", [
        {
          index: 1,
          transformation: {
            find: /foo/gimsuy,
            replace: [
              "bar"
            ]
          }
        }
      ]);
    });

    it("does not parse invalid regex as transformations", () => {
      expectMatch("${1/foo/bar/a}", ["${1/foo/bar/a}"]); // invalid flag
      expectMatch("${1/fo)o$1/$bar/}", [
        "${1/fo)o",
        { index: 1 },
        "/",
        { variable: "bar" },
        "/}"
      ]);
    });

    it("allows and preserves all escapes in regex strings", () => {
      expectMatch("${1/foo\\/\\$\\:\\n\\r/baz/}", [
        {
          index: 1,
          transformation: {
            find: /foo\/\$\:\n\r/,
            replace: [
              "baz"
            ]
          }
        }
      ]);
    });

    describe("when parsing the replace section", () => {
      // Helper for testing the relacement part of
      // transformations, which are relatively deep in
      // the tree and have a lot of behaviour to cover
      // NOTE: Only use when the replace section is expected to
      // be valid, or else you will be testing against the
      // boilerplate (which is not a good idea)
      function expectReplaceMatch(replace, tree) {
        expectMatch(`\${1/foo/${replace}/}`, [
          {
            index: 1,
            transformation: {
              find: /foo/,
              replace: tree,
            }
          }
        ]);
      }

      it("allows '$' and '}' as plain text if not part of a format", () => {
        expectReplaceMatch("$}", ["$}"]);
      });

      it("allows inline 'escaped modifiers'", () => {
        expectReplaceMatch("foo\\E\\l\\L\\u\\Ubar", [
          "foo",
          { modifier: "E" },
          { modifier: "l" },
          { modifier: "L" },
          { modifier: "u" },
          { modifier: "U" },
          "bar"
        ]);
      });

      it("allows '$', '\\', and '/' to be escaped", () => {
        expectReplaceMatch("\\$1 \\\\ \\/", [
          "$1 \\ /"
        ]);
      });

      describe("when parsing formats", () => {
        it("parses simple formats", () => {
          expectReplaceMatch("$1${2}", [
            { backreference: 1 },
            { backreference: 2 }
          ]);
        });

        it("parses formats with modifiers", () => {
          expectReplaceMatch("${1:/upcase}", [
            {
              backreference: 1,
              modifier: "upcase",
            }
          ]);
        });

        it("parses formats with an if branch", () => {
          expectReplaceMatch("${1:+foo$2$bar}", [
            {
              backreference: 1,
              ifContent: [
                "foo",
                { backreference: 2, },
                "$bar" // no variables inside a replace / format
              ]
            }
          ]);
        });

        it("parses formats with if and else branches", () => {
          expectReplaceMatch("${1:?foo\\:stillIf:bar\\}stillElse}", [
            {
              backreference: 1,
              ifContent: [
                "foo:stillIf"
              ],
              elseContent: [
                "bar}stillElse"
              ]
            }
          ]);
        });

        it("parses formats with an else branch", () => {
          expectReplaceMatch("${1:-foo}", [
            {
              backreference: 1,
              elseContent: [
                "foo"
              ]
            }
          ]);
        });

        it("parses formats with the old else branch syntax", () => {
          expectReplaceMatch("${1:foo}", [
            {
              backreference: 1,
              elseContent: [
                "foo"
              ]
            }
          ]);
        });

        it("allows nested replacements inside of formats", () => {
          expectReplaceMatch("${1:+${2:-${3:?a lot of:layers}}}", [
            {
              backreference: 1,
              ifContent: [
                {
                  backreference: 2,
                  elseContent: [
                    {
                      backreference: 3,
                      ifContent: [
                        "a lot of"
                      ],
                      elseContent: [
                        "layers"
                      ]
                    }
                  ]
                }
              ]
            }
          ]);
        });
      });
    });
  });

  describe("when parsing escaped characters", () => {
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
        { index: 1, content: [escapeResolveTop] },
      ]);
    });

    it("escapes the same characters inside variable placeholders as in top level text", () => {
      expectMatch(`\${foo:${escapeTest}}`, [
        { variable: "foo", content: [escapeResolveTop] },
      ]);
    });

    it("escapes ',', '|', and '\\' in choice text", () => {
      expectMatch(`\${1|${escapeTest}|}`, [
        { index: 1, choices: [escapeResolveChoice] },
      ]);
    });
  });

  describe("when a potential non-text parse fails", () => {
    it("accepts the first character as text and resumes", () => {
      expectMatch("${1:${2}${3}", [
        "${1:",
        { index: 2 },
        { index: 3 }
      ]);
    });
  });

  describe("examples", () => {
    it("breaks a snippet body into lines, with each line containing tab stops at the appropriate position", () => {
      expectMatch("the quick brown $1fox ${2:jumped ${3:over}\n}the ${4:lazy} dog", [
        "the quick brown ",
        { index: 1 },
        "fox ",
        {
          index: 2,
          content: [
            "jumped ",
            { index: 3, content: ["over"] },
            "\n"
          ],
        },
        "the ",
        { index: 4, content: ["lazy"] },
        " dog"
      ]);
    });

    it("supports interpolated variables in placeholder text", () => {
      expectMatch("module ${1:ActiveRecord::${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}}", [
        "module ",
        {
          index: 1,
          content: [
            "ActiveRecord::",
            {
              variable: "TM_FILENAME",
              transformation: {
                find: /(?:\A|_)([A-Za-z0-9]+)(?:\.rb)?/g,
                replace: [
                  "(?2::",
                  {
                    modifier: "u",
                  },
                  {
                    backreference: 1,
                  },
                  ")",
                ]
              }
            }
          ],
        }
      ]);
    });

    it("parses a snippet with transformations", () => {
      expectMatch("<${1:p}>$0</${1/f/F/}>", [
        '<',
        { index: 1, content: ['p'] },
        '>',
        { index: 0 },
        '</',
        { index: 1, transformation: { find: /f/, replace: ['F'] } },
        '>',
      ]);
    });

    it("parses a snippet with multiple tab stops with transformations", () => {
      expectMatch("${1:placeholder} ${1/(.)/\\u$1/} $1 ${2:ANOTHER} ${2/^(.*)$/\\L$1/} $2", [
        { index: 1, content: ['placeholder'] },
        ' ',
        {
          index: 1,
          transformation: {
            find: /(.)/,
            replace: [
              { modifier: 'u' },
              { backreference: 1 },
            ],
          },
        },
        ' ',
        { index: 1 },
        ' ',
        { index: 2, content: ['ANOTHER'] },
        ' ',
        {
          index: 2,
          transformation: {
            find: /^(.*)$/,
            replace: [
              { modifier: 'L' },
              { backreference: 1 },
            ],
          },
        },
        ' ',
        { index: 2 },
      ]);
    });

    it("parses a snippet with transformations and mirrors", () => {
      expectMatch("${1:placeholder}\n${1/(.)/\\u$1/}\n$1", [
        { index: 1, content: ['placeholder'] },
        '\n',
        {
          index: 1,
          transformation: {
            find: /(.)/,
            replace: [
              { modifier: 'u' },
              { backreference: 1 },
            ],
          },
        },
        '\n',
        { index: 1 },
      ]);
    });

    it("parses a snippet with a format string and case-control flags", () => {
      expectMatch("<${1:p}>$0</${1/(.)(.*)/\\u$1$2/}>", [
        '<',
        { index: 1, content: ['p'] },
        '>',
        { index: 0 },
        '</',
        {
          index: 1,
          transformation: {
            find: /(.)(.*)/,
            replace: [
              { modifier: 'u' },
              { backreference: 1 },
              { backreference: 2 },
            ],
          },
        },
        '>',
      ]);
    });

    it("parses a snippet with an escaped forward slash in a transform", () => {
      expectMatch("<${1:p}>$0</${1/(.)\\/(.*)/\\u$1$2/}>", [
        '<',
        { index: 1, content: ['p'] },
        '>',
        { index: 0 },
        '</',
        {
          index: 1,
          transformation: {
            find: /(.)\/(.*)/,
            replace: [
              { modifier: 'u' },
              { backreference: 1 },
              { backreference: 2 },
            ],
          },
        },
        '>',
      ]);
    });

    it("parses a snippet with a placeholder that mirrors another tab stop's content", () => {
      expectMatch("$4console.${3:log}('${2:$1}', $1);$0", [
        { index: 4 },
        'console.',
        { index: 3, content: ['log'] },
        '(\'',
        {
          index: 2, content: [
            { index: 1 }
          ]
        },
        '\', ',
        { index: 1 },
        ');',
        { index: 0 }
      ]);
    });

    it("parses a snippet with a placeholder that mixes text and tab stop references", () => {
      expectMatch("$4console.${3:log}('${2:uh $1}', $1);$0", [
        { index: 4 },
        'console.',
        { index: 3, content: ['log'] },
        '(\'',
        {
          index: 2, content: [
            'uh ',
            { index: 1 }
          ]
        },
        '\', ',
        { index: 1 },
        ');',
        { index: 0 }
      ]);
    });
  });
});
