_ = require 'underscore-plus'
{Range} = require 'atom'

module.exports =
class Snippet
  constructor: ({@name, @prefix, @bodyText, @description, @descriptionMoreURL, @rightLabelHTML, @leftLabel, @leftLabelHTML, bodyTree}) ->
    @body = @extractTabStops(bodyTree)

  extractTabStops: (bodyTree) ->
    tabStopsByIndex = {}
    bodyText = []
    [row, column] = [0, 0]

    # recursive helper function; mutates vars above
    extractTabStops = (bodyTree) ->
      for segment in bodyTree
        if segment.index?
          {index, content} = segment
          index = Infinity if index is 0
          start = [row, column]
          extractTabStops(content)
          tabStopsByIndex[index] ?= []
          tabStopsByIndex[index].push new Range(start, [row, column])
        else if _.isString(segment)
          bodyText.push(segment)
          segmentLines = segment.split('\n')
          column += segmentLines.shift().length
          while (nextLine = segmentLines.shift())?
            row += 1
            column = nextLine.length

    extractTabStops(bodyTree)
    # If tab stop for end has not been explicitly defined and last tab stop does not include end of snippet,
    # then the ending tab stop is placed at the end of the snippet.
    snippetEnd = new Range([row, column], [row, column])
    lastIndex = index for index of tabStopsByIndex
    tabStopsByIndex[Infinity] = [snippetEnd] if lastIndex? and lastIndex isnt 'Infinity' and not tabStopsByIndex[lastIndex][0].isEqual(snippetEnd)

    @lineCount = row + 1
    @tabStops = []
    for index in _.keys(tabStopsByIndex).sort(((arg1, arg2) -> arg1-arg2))
      @tabStops.push tabStopsByIndex[index]

    bodyText.join('')
