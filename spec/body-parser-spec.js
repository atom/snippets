const BodyParser = require('../lib/snippet-body-parser')

function expectMatch(input, tree) {
  expect(BodyParser.parse(input)).toEqual(tree)
}

describe('Snippet Body Parser', () => {
  it('parses a snippet with no special behaviour', () => {
    expectMatch('${} $ n $}1} ${/upcase/} \n world ${||}', [
      '${} $ n $}1} ${/upcase/} \n world ${||}'
    ])
  })

  describe('for snippets with tabstops', () => {
    it('parses simple tabstops', () => {
      expectMatch('hello$1world$2', [
        'hello',
        {index: 1, content: []},
        'world',
        {index: 2, content: []}
      ])
    })

    it('parses verbose tabstops', () => {
      expectMatch('hello${1}world${2}', [
        'hello',
        {index: 1, content: []},
        'world',
        {index: 2, content: []}
      ])
    })

    it('skips escaped tabstops', () => {
      expectMatch('$1 \\$2 $3 \\\\$4 \\\\\\$5 $6', [
        {index: 1, content: []},
        ' $2 ',
        {index: 3, content: []},
        ' \\',
        {index: 4, content: []},
        ' \\$5 ',
        {index: 6, content: []}
      ])
    })

    describe('for tabstops with placeholders', () => {
      it('parses them', () => {
        expectMatch('hello${1:placeholder}world', [
          'hello',
          {index: 1, content: ['placeholder']},
          'world'
        ])
      })

      it('allows escaped back braces', () => {
        expectMatch('${1:{}}', [
          {index: 1, content: ['{']},
          '}'
        ])
        expectMatch('${1:{\\}}', [
          {index: 1, content: ['{}']}
        ])
      })
    })

    it('parses tabstops with transforms', () => {
      expectMatch('${1/.*/$0/}', [
        {
          index: 1,
          content: [],
          substitution: {
            find: /.*/,
            replace: [{backreference: 0}]
          }
        }
      ])
    })

    it('parses tabstops with choices', () => {
      expectMatch('${1|on}e,t\\|wo,th\\,ree|}', [
        {index: 1, content: ['on}e'], choice: ['on}e', 't|wo', 'th,ree']}
      ])
    })

    it('parses nested tabstops', () => {
      expectMatch('${1:place${2:hol${3:der}}}', [
        {
          index: 1,
          content: [
            'place',
            {index: 2, content: [
              'hol',
              {index: 3, content: ['der']}
            ]}
          ]
        }
      ])
    })
  })

  describe('for snippets with variables', () => {
    it('parses simple variables', () => {
      expectMatch('$f_o_0', [{variable: 'f_o_0'}])
      expectMatch('$_FOO', [{variable: '_FOO'}])
    })

    it('parses verbose variables', () => {
      expectMatch('${foo}', [{variable: 'foo'}])
      expectMatch('${FOO}', [{variable: 'FOO'}])
    })

    it('parses variables with placeholders', () => {
      expectMatch('${f:placeholder}', [{variable: 'f', content: ['placeholder']}])
      expectMatch('${f:foo$1 $VAR}', [
        {
          variable: 'f',
          content: [
            'foo',
            {index: 1, content: []},
            ' ',
            {variable: 'VAR'}
          ]
        }
      ])
    })

    it('parses variables with transforms', () => {
      expectMatch('${f/.*/$0/}', [
        {
          variable: 'f',
          substitution: {
            find: /.*/,
            replace: [
              {backreference: 0}
            ]
          }
        }
      ])
    })
  })

  describe('for escaped characters', () => {
    it('treats a selection of escaped characters specially', () => {
      expectMatch('\\$ \\\\ \\}', [
        '$ \\ }'
      ])
    })

    it('returns the literal slash and character otherwise', () => {
      expectMatch('\\ \\. \\# \\n \\r \\', [
        '\\ \\. \\# \\n \\r \\'
      ])
    })
  })

  describe('for transforms', () => {
    it('allows an empty transform', () => {
      expectMatch('${a///}', [
        {
          variable: 'a',
          substitution: {
            find: new RegExp(),
            replace: []
          }
        }
      ])
    })

    it('appends the declared flags', () => {
      expectMatch('${a/.//g}', [
        {
          variable: 'a',
          substitution: {
            find: /./g,
            replace: []
          }
        }
      ])
      expectMatch('${a/.//gimuy}', [ // s flag not available apparently
        {
          variable: 'a',
          substitution: {
            find: /./gimuy,
            replace: []
          }
        }
      ])
      // NOTE: We do not try to filter out invalid flags. This
      // helps protect against future flag changes, such as when
      // 's' is introduced
    })

    it('allows searching with an escaped forwards slash', () => {
      expectMatch('${a/^\\/5/bar/}', [
        {
          variable: 'a',
          substitution: {
            find: /^\/5/,
            replace: ['bar']
          }
        }
      ])
    })

    it('allows an escaped back brace, removing the backslash', () => {
      expectMatch('${a/^\\}5//}', [
        {
          variable: 'a',
          substitution: {
            find: /^}5/,
            replace: []
          }
        }
      ])
    })

    it('supports worded transformations', () => {
      expectMatch('${a/./foo${0:/Bar}/}', [
        {
          variable: 'a',
          substitution: {
            find: /./,
            replace: [
              'foo',
              {
                backreference: 0,
                transform: 'Bar'
              }
            ]
          }
        }
      ])
    })

    it('supports flag transformations', () => {
      expectMatch('${a/./foo\\ubar\\n\\r\\U\\L\\l\\E\\$0/}', [
        {
          variable: 'a',
          substitution: {
            find: /./,
            replace: [
              'foo',
              {escape: 'u'},
              'bar',
              {escape: 'n'},
              {escape: 'r'},
              {escape: 'U'},
              {escape: 'L'},
              {escape: 'l'},
              {escape: 'E'},
              '$0'
            ]
          }
        }
      ])
    })

    it('treats invalid flag transforms as literal', () => {
      expectMatch('${a/./foo\\p5/}', [
        {
          variable: 'a',
          substitution: {
            find: /./,
            replace: [
              'foo\\p5'
            ]
          }
        }
      ])
    })

    it('supports if-else replacements', () => {
      // NOTE: the '+' cannot be escaped. If you want it to be part of
      // a placeholder (else only), use ':-'
      // NOTE 2: the ${n:<else>} syntax should really be deprecated,
      // as it's very easy to accidentally use; e.g., when you have an invalid
      // transformation like `${1:/foo3}` (has number)
      expectMatch('${a/./${1:+foo$0bar\\}baz}/}', [
        {
          variable: 'a',
          substitution: {
            find: /./,
            replace: [
              {
                backreference: 1,
                iftext: 'foo$0bar}baz'
              }
            ]
          }
        }
      ])

      expectMatch('${a/./${1:-foo$0bar\\}baz}/}', [
        {
          variable: 'a',
          substitution: {
            find: /./,
            replace: [
              {
                backreference: 1,
                elsetext: 'foo$0bar}baz'
              }
            ]
          }
        }
      ])

      expectMatch('${a/./${1:foo$0bar\\}baz}/}', [
        {
          variable: 'a',
          substitution: {
            find: /./,
            replace: [
              {
                backreference: 1,
                elsetext: 'foo$0bar}baz'
              }
            ]
          }
        }
      ])

      // NOTE: colon can be escaped in if text, but not in else text as it is
      // unnecessary
      expectMatch('${a/./${1:?foo$0bar\\}baz\\:hux\\\\:foo$0bar\\}baz\\:hux\\\\}/}', [
        {
          variable: 'a',
          substitution: {
            find: /./,
            replace: [
              {
                backreference: 1,
                iftext: 'foo$0bar}baz:hux\\',
                elsetext: 'foo$0bar}baz\\:hux\\'
              }
            ]
          }
        }
      ])
    })
  })

  describe('on miscellaneous examples', () => {
    it('handles a simple snippet', () => {
      expectMatch(
        'the quick brown $1fox ${2:jumped ${3:over}\n}the ${4:lazy} dog',
        [
          'the quick brown ',
          {index: 1, content: []},
          'fox ',
          {
            index: 2,
            content: [
              'jumped ',
              {index: 3, content: ['over']},
              '\n'
            ]
          },
          'the ',
          {index: 4, content: ['lazy']},
          ' dog'
        ]
      )
    })

    it('handles a snippet with a transformed variable', () => {
      expectMatch(
        'module ${1:ActiveRecord::${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/\\u$1/g}}',
        [
          'module ',
          {
            index: 1,
            content: [
              'ActiveRecord::',
              {
                variable: 'TM_FILENAME',
                substitution: {
                  find: /(?:\A|_)([A-Za-z0-9]+)(?:\.rb)?/g,
                  replace: [
                    {escape: 'u'},
                    {backreference: 1}
                  ]
                }
              }
            ]
          }
        ]
      )
    })

    it('handles a snippet with multiple tab stops with transformations', () => {
      expectMatch(
        '${1:placeholder} ${1/(.)/\\u$1/} $1 ${2:ANOTHER} ${2/^(.*)$/\\L$1/} $2',
        [
          {index: 1, content: ['placeholder']},
          ' ',
          {
            index: 1,
            content: [],
            substitution: {
              find: /(.)/,
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
              find: /^(.*)$/,
              replace: [
                {escape: 'L'},
                {backreference: 1}
              ]
            }
          },
          ' ',
          {index: 2, content: []}
        ]
      )
    })

    it('handles a snippet with a placeholder that mirrors another tab stops content', () => {
      expectMatch(
        '$4console.${3:log}(\'${2:$1}\', $1);$0',
        [
          {index: 4, content: []},
          'console.',
          {index: 3, content: ['log']},
          '(\'',
          {
            index: 2,
            content: [{index: 1, content: []}]
          },
          '\', ',
          {index: 1, content: []},
          ');',
          {index: 0, content: []}
        ]
      )
    })
  })
})
