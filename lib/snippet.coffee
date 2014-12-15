_ = require 'underscore-plus'
{Range} = require 'atom'

module.exports =
  create: ({name, prefix, bodyText, bodyTree}) ->
    {body, tabStops, lineCount} = extractTabStops(bodyTree)
    {
      name,
      prefix,
      bodyText,
      body,
      tabStops, lineCount
    }

extractTabStops = (bodyTree) ->
  tabStopsByIndex = {}
  tabStops = []
  bodyText = []
  lineCount = 0
  [row, column] = [0, 0]

  extract = (bodyTree) ->
    for segment in bodyTree
      if segment.index?
        { index, content } = segment
        index = Infinity if index == 0
        start = [row, column]
        extract(content)
        tabStopsByIndex[index] ?= []
        tabStopsByIndex[index].push new Range(start, [row, column])
      else if _.isString(segment)
        bodyText.push(segment)
        segmentLines = segment.split('\n')
        column += segmentLines.shift().length
        while (nextLine = segmentLines.shift())?
          row += 1
          column = nextLine.length

  extract(bodyTree)

  tabStops = []
  for index in _.keys(tabStopsByIndex).sort((a, b) -> a - b)
    tabStops.push tabStopsByIndex[index]

  {
    tabStops,
    lineCount: row + 1,
    body: bodyText.join('')
  }
