{Range} = require 'atom'
TabStopList = require './tab-stop-list'

module.exports =
class Snippet
  constructor: ({@name, @prefix, @bodyText, @description, @descriptionMoreURL, @rightLabelHTML, @leftLabel, @leftLabelHTML, bodyTree}) ->
    @tabStopList = new TabStopList(this)
    @body = @extractTabStops(bodyTree)

  extractTabStops: (bodyTree) ->
    tabStopsByIndex = {}
    bodyText = []
    [row, column] = [0, 0]

    # recursive helper function; mutates vars above
    extractTabStops = (bodyTree) =>
      for segment in bodyTree
        if segment.index?
          {index, content, substitution} = segment
          index = Infinity if index is 0
          start = [row, column]
          extractTabStops(content)
          range = new Range(start, [row, column])
          tabStop = @tabStopList.findOrCreate({
            index: index,
            snippet: this
          });
          tabStop.addInsertion({
            range: range,
            substitution: substitution
          })
        else if typeof segment is 'string'
          bodyText.push(segment)
          segmentLines = segment.split('\n')
          column += segmentLines.shift().length
          while (nextLine = segmentLines.shift())?
            row += 1
            column = nextLine.length

    extractTabStops(bodyTree)
    @lineCount = row + 1
    @insertions = @tabStopList.getInsertions()

    bodyText.join('')
