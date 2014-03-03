_ = require 'underscore-plus'
{Subscriber} = require 'emissary'
{Point, Range} = require 'atom'
Snippet = require './snippet'

module.exports =
class SnippetExpansion
  Subscriber.includeInto(this)

  snippet: null
  tabStopMarkers: null
  settingTabStop: false


  constructor: (@snippet, @editor) ->
    startPosition = @selectToBoundaryPosition()

    @editor.transact =>
      [newRange] = @editor.insertText(snippet.body, autoIndent: false)
      if snippet.tabStops.length > 0
        @subscribe @editor, 'cursor-moved.snippet-expansion', (e) => @cursorMoved(e)
        @placeTabStopMarkers(startPosition, snippet.tabStops)
        @editor.snippetExpansion = this
        @editor.normalizeTabsInBufferRange(newRange)
      @indentSubsequentLines(startPosition.row, snippet) if snippet.lineCount > 1

  selectToBoundaryPosition: ->
    cursor = @editor.getCursor()
    line = cursor.getCurrentBufferLine()
    newColumn = cursor.getBufferColumn()
    column = newColumn
    row = cursor.getBufferRow()
    while newColumn >= 0
      break if Snippet.prefixBoundary.test line[newColumn - 1]
      newColumn--
    if newColumn < 0 then newColumn = 0
    startPoint = new Point(row, newColumn)
    endPoint = new Point(row, column)
    @editor.setSelectedBufferRange new Range(startPoint, endPoint)
    startPoint

  cursorMoved: ({oldBufferPosition, newBufferPosition, textChanged}) ->
    return if @settingTabStop or textChanged
    oldTabStops = @tabStopsForBufferPosition(oldBufferPosition)
    newTabStops = @tabStopsForBufferPosition(newBufferPosition)
    @destroy() unless _.intersection(oldTabStops, newTabStops).length

  placeTabStopMarkers: (startPosition, tabStopRanges) ->
    @tabStopMarkers = tabStopRanges.map ({start, end}) =>
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
    markerSelected = @editor.selectMarker(@tabStopMarkers[@tabStopIndex])
    @settingTabStop = false
    markerSelected

  tabStopsForBufferPosition: (bufferPosition) ->
    _.intersection(@tabStopMarkers, @editor.findMarkers(containsBufferPosition: bufferPosition))

  destroy: ->
    @unsubscribe()
    marker.destroy() for marker in @tabStopMarkers
    @editor.snippetExpansion = null

  restore: (@editor) ->
    @editor.snippetExpansion = this
