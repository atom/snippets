_ = require 'underscore-plus'
{Subscriber} = require 'emissary'
variable     = require './variable'

module.exports =
class SnippetExpansion
  Subscriber.includeInto(this)

  settingTabStop: false

  constructor: (@snippet, @editor, @cursor=@editor.getCursor(), @snippets) ->
    @tabStopMarkers = []
    @selections = [@cursor.selection]

    startPosition = @cursor.selection.getBufferRange().start

    @editor.transact =>
      newRange = @editor.transact =>
        body = variable.fixLineNum(snippet.body, startPosition)
        @cursor.selection.insertText(body, autoIndent: false)
      if snippet.tabStops.length > 0
        @subscribe @cursor, 'moved', (event) => @cursorMoved(event)
        @placeTabStopMarkers(startPosition, snippet.tabStops)
        @snippets.addExpansion(@editor, this)
        @editor.normalizeTabsInBufferRange(newRange)
      @indentSubsequentLines(startPosition.row, snippet) if snippet.lineCount > 1
    
  cursorMoved: ({oldBufferPosition, newBufferPosition, textChanged}) ->
    return if @settingTabStop or textChanged
    oldTabStops = @tabStopsForBufferPosition(oldBufferPosition)
    newTabStops = @tabStopsForBufferPosition(newBufferPosition)
    @destroy() unless _.intersection(oldTabStops, newTabStops).length

  placeTabStopMarkers: (startPosition, tabStopRanges) ->
    for ranges in tabStopRanges
      @tabStopMarkers.push ranges.map ({start, end}) =>
        @editor.markBufferRange([startPosition.add(start), startPosition.add(end)])
    @setTabStopIndex(0)

  indentSubsequentLines: (startRow, snippet) ->
    initialIndent = @editor.lineForBufferRow(startRow).match(/^\s*/)[0]
    for row in [startRow + 1...startRow + snippet.lineCount]
      @editor.buffer.insert([row, 0], initialIndent)

  goToNextTabStop: ->
    nextIndex = @tabStopIndex + 1
    if nextIndex < @tabStopMarkers.length
      if @setTabStopIndex(nextIndex)
        true
      else
        @goToNextTabStop()
    else
      @destroy()
      false

  goToPreviousTabStop: ->
    @setTabStopIndex(@tabStopIndex - 1) if @tabStopIndex > 0

  setTabStopIndex: (@tabStopIndex) ->
    @settingTabStop = true
    markerSelected = false

    ranges = []
    for marker in @tabStopMarkers[@tabStopIndex] when marker.isValid()
      ranges.push(marker.getBufferRange())

    if ranges.length > 0
      selection.destroy() for selection in @selections[ranges.length...]
      @selections = @selections[...ranges.length]
      for range, i in ranges
        if @selections[i]
          @selections[i].setBufferRange(range)
        else
          @selections.push @editor.addSelectionForBufferRange(range)
      markerSelected = true

    @settingTabStop = false
    markerSelected

  tabStopsForBufferPosition: (bufferPosition) ->
    _.intersection(@tabStopMarkers[@tabStopIndex],
      @editor.findMarkers(containsBufferPosition: bufferPosition))

  destroy: ->
    @unsubscribe()
    for markers in @tabStopMarkers
      marker.destroy() for marker in markers
    @tabStopMarkers = []
    @snippets.clearExpansions(@editor)

  restore: (@editor) ->
    @snippets.addExpansion(@editor, this)
