_ = require 'underscore-plus'
{Range} = require 'atom'
varValue = require './variable'

module.exports =
class Snippet
  constructor: ({@name, @prefix, @bodyText, bodyTree}) ->
    @body = @extractTabStops(bodyTree)

  extractTabStops: (bodyTree) ->
    tabStopsByIndex = {}
    bodyText = []
    [row, column] = [0, 0]

    # recursive helper function; mutates vars above
    extractTabStops = (bodyTree) ->
      for segment in bodyTree
        if segment.index?
          { index, content } = segment
          index = Infinity if index == 0
          start = [row, column]
          extractTabStops(content)
          tabStopsByIndex[index] ?= []
          tabStopsByIndex[index].push new Range(start, [row, column])
        else if (variable = segment.variable)
          value = varValue(variable)
          bodyText.push(value)
          column += value.length
        else if _.isString(segment)
          bodyText.push(segment)
          segmentLines = segment.split('\n')
          column += segmentLines.shift().length
          while (nextLine = segmentLines.shift())?
            row += 1
            column = nextLine.length

    extractTabStops(bodyTree)
    @lineCount = row + 1
    @tabStops = []
    for index in _.keys(tabStopsByIndex).sort(((arg1, arg2) -> arg1-arg2))
      @tabStops.push tabStopsByIndex[index]

    bodyText.join('')
