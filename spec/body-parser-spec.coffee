BodyParser = require '../lib/snippet-body-parser'

describe "Snippet Body Parser", ->
  it "parses a snippet with transformations", ->
    bodyTree = BodyParser.parse """
    <${1:p}>$0</${1/f/F/}>
    """
    expect(bodyTree).toEqual [
      '<',
      { index: 1, content: ['p'] },
      '>',
      { index: 0, content: [] },
      '</',
      { index: 1, content: [], substitution: { find: /f/g, replace: ['F'] } },
      '>'
    ]

  it "parses a snippet with multiple tab stops with transformations", ->
    bodyTree = BodyParser.parse """
    ${1:placeholder} ${1/(.)/\\u$1/} $1 ${2:ANOTHER} ${2/^(.*)$/\\L$1/} $2
    """

    expect(bodyTree).toEqual [
      { index: 1, content: ['placeholder'] },
      ' ',
      {
        index: 1,
        content: [],
        substitution: {
          find: /(.)/g,
          replace: [
            { escape: 'u' },
            { backreference: 1 }
          ]
        }
      },
      ' ',
      { index: 1, content: [] },
      ' ',
      { index: 2, content: ['ANOTHER'] },
      ' ',
      {
        index: 2,
        content: [],
        substitution: {
          find: /^(.*)$/g,
          replace: [
            { escape: 'L' },
            { backreference: 1 }
          ]
        }
      },
      ' ',
      { index: 2, content: [] },
    ]


  it "parses a snippet with transformations and mirrors", ->
    bodyTree = BodyParser.parse """
    ${1:placeholder}\n${1/(.)/\\u$1/}\n$1
    """

    expect(bodyTree).toEqual [
      { index: 1, content: ['placeholder'] },
      '\n',
      {
        index: 1,
        content: [],
        substitution: {
          find: /(.)/g,
          replace: [
            { escape: 'u' },
            { backreference: 1 }
          ]
        }
      },
      '\n',
      { index: 1, content: [] }
    ]

  it "parses a snippet with transformations and placeholder values", ->
    bodyTree = BodyParser.parse """
    <${1:p}>$0</${1/f/F/:whatever}>
    """
    expect(bodyTree).toEqual [
      '<',
      { index: 1, content: ['p'] },
      '>',
      { index: 0, content: [] },
      '</',
      { index: 1, content: ['whatever'], substitution: { find: /f/g, replace: ['F'] } },
      '>'
    ]

  it "parses a snippet with a format string and case-control flags", ->
    bodyTree = BodyParser.parse """
    <${1:p}>$0</${1/(.)(.*)/\\u$1$2/}>
    """

    expect(bodyTree).toEqual [
      '<',
      { index: 1, content: ['p'] },
      '>',
      { index: 0, content: [] },
      '</',
      {
        index: 1,
        content: [],
        substitution: {
          find: /(.)(.*)/g,
          replace: [
            { escape: 'u' },
            { backreference: 1 },
            { backreference: 2 }
          ]
        }
      },
      '>'
    ]

  it "breaks a snippet body into lines, with each line containing tab stops at the appropriate position", ->
    bodyTree = BodyParser.parse """
      the quick brown $1fox ${2:jumped ${3:over}
      }the ${4:lazy} dog
    """

    expect(bodyTree).toEqual [
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
      }
      "the "
      {index: 4, content: ["lazy"]},
      " dog"
    ]

  it "removes interpolated variables in placeholder text (we don't currently support it)", ->
    bodyTree = BodyParser.parse """
      module ${1:ActiveRecord::${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}}
    """

    expect(bodyTree).toEqual [
      "module ",
      {
        "index": 1,
        "content": ["ActiveRecord::", ""]
      }
    ]

  it "skips escaped tabstops", ->
    bodyTree = BodyParser.parse """
      snippet $1 escaped \\$2 \\\\$3
    """

    expect(bodyTree).toEqual [
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
    ]

  it "includes escaped right-braces", ->
    bodyTree = BodyParser.parse """
      snippet ${1:{\\}}
    """

    expect(bodyTree).toEqual [
      "snippet ",
      {
        index: 1,
        content: ["{}"]
      }
    ]
