const fs = require('fs-plus')
const peg = require('pegjs')

const Snippet = require('../lib/snippet')
const Variable = require('../lib/variable')
const VariableRegistery = require('../lib/variable-registery')

const grammar = fs.readFileSync(require.resolve('../lib/snippet-body-parser.pegjs'), 'utf8')


describe("Snippet Body Parser", () => {
  beforeEach(() => {
    this.registery = new VariableRegistery()
    this.bodyParser = peg.generate(grammar, { context: { Snippet, Variable, registery: this.registery } })
  })
  it("breaks a snippet body into lines, with each line containing tab stops at the appropriate position", () => {
    const snippet = this.bodyParser.parse(`\
the quick brown $1fox \${2:jumped \${3:over}
}the \${4:lazy} dog\
`)

    expect(snippet).toEqual(new Snippet({
      registery : this.registery,
      range: [0, 61],
      value: [
        'the quick brown ',
        this.registery.add(new Variable({ identifier: '1', range: [16, 18], value: [] })),
        'fox ',
        new Variable({
          identifier: '2',
          range: [22, 44],
          value: [
            'jumped ',
            this.registery.add(new Variable({ identifier: '3', range: [33, 42], value: ['over'] })),
            '\n'
          ]
        }),
        'the ',
        this.registery.add(new Variable({ identifier: '4', range: [48, 57], value: ['lazy'] })),
        ' dog'
      ]
    }))
  })

  it("removes interpolated variables in placeholder text (we don't currently support it)", () => {
    const bodyTree = bodyParser.parse("module ${1:ActiveRecord::${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}}");
    expect(bodyTree).toEqual([
      "module ",
      {
        "index": 1,
        "content": ["ActiveRecord::", ""]
      }
    ]);
  });

  it("skips escaped tabstops", () => {
    const bodyTree = bodyParser.parse("snippet $1 escaped \\$2 \\\\$3");
    expect(bodyTree).toEqual([
      "snippet ",
      {
        index: 1,
        content: []
      },
      " escaped $2 \\",
      {
        index: 3,
        content: []
      }
    ]);
  });

  it("includes escaped right-braces", () => {
    const bodyTree = bodyParser.parse("snippet ${1:{\\}}");
    expect(bodyTree).toEqual([
      "snippet ",
      {
        index: 1,
        content: ["{}"]
      }
    ]);
  });

  it("parses a snippet with transformations", () => {
    const bodyTree = bodyParser.parse("<${1:p}>$0</${1/f/F/}>");
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
    const bodyTree = bodyParser.parse("${1:placeholder} ${1/(.)/\\u$1/} $1 ${2:ANOTHER} ${2/^(.*)$/\\L$1/} $2");
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
    const bodyTree = bodyParser.parse("${1:placeholder}\n${1/(.)/\\u$1/}\n$1");
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
    const bodyTree = bodyParser.parse("<${1:p}>$0</${1/(.)(.*)/\\u$1$2/}>");
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
    const bodyTree = bodyParser.parse("<${1:p}>$0</${1/(.)\\/(.*)/\\u$1$2/}>");
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
    const bodyTree = bodyParser.parse("$4console.${3:log}('${2:$1}', $1);$0");
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
    const bodyTree = bodyParser.parse("$4console.${3:log}('${2:uh $1}', $1);$0");
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
