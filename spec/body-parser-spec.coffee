BodyParser = require '../lib/snippet-body-parser'

describe "Snippet Body Parser", ->
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
