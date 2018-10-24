{Range} = require 'atom'
TabStopList = require './tab-stop-list'

# Given a snippet of a parse tree, returns a Set of all the indices of other
# tab stops referenced within, if any.
tabStopsReferencedWithinTabStopContent = (segment) ->
  results = []
  for item in segment
    if item.index?
      results.push item.index, tabStopsReferencedWithinTabStopContent(item.content)...

  new Set(results)

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
          referencedTabStops = tabStopsReferencedWithinTabStopContent(content)
          range = new Range(start, [row, column])
          tabStop = @tabStopList.findOrCreate({
            index: index,
            snippet: this
          })
          tabStop.addInsertion({
            range: range,
            substitution: substitution,
            references: Array.from(referencedTabStops)
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
