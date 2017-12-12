{Range} = require 'atom'
TabStop = require './tab-stop'

class TabStopList
  constructor: (@snippet) ->
    @list = {}
    @length = 0

  toArray: () ->
    results = []
    @forEachIndex (index) =>
      results.push(@list[index])
    results

  findOrCreate: ({ index, snippet }) ->
    @list[index] = new TabStop({ index, snippet }) unless @list[index]
    @length = Object.keys(@list).length
    @list[index]

  forEachIndex: (iterator) ->
    indices = Object.keys(@list).sort (a1, a2) -> a1 - a2
    indices.forEach(iterator)

  getInsertions: () ->
    results = []
    @forEachIndex (index) =>
      results.push(@list[index].insertions...)
    results


module.exports =
class Snippet
  constructor: ({@id, @name, @prefix, @bodyText, @description, @descriptionMoreURL, @rightLabelHTML, @leftLabel, @leftLabelHTML, bodyTree}) ->
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
          {index, content} = segment
          index = Infinity if index is 0
          start = [row, column]
          extractTabStops(content)
          range = new Range(start, [row, column])
          substitution = segment.substitution || null
          tabStop = @tabStopList.findOrCreate({
            index: index,
            snippet: this
          })
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
