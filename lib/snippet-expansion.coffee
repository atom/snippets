_ = require 'underscore-plus'
{Subscriber} = require 'emissary'

module.exports =
class SnippetExpansion
  Subscriber.includeInto(this)

  tabStopMarkers: []
  settingTabStop: false

  constructor: (@snippet, @editor) ->
    startPosition = @editor.getSelectedBufferRange().start

    @editor.transact =>
      [newRange] = @editor.insertText(snippet.body, autoIndent: false)
      if snippet.tabStops.length > 0
        @subscribe @editor, 'cursor-moved', (event) => @cursorMoved(event)
        @placeTabStopMarkers(startPosition, snippet.tabStops)
        @editor.snippetExpansion = this
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
        [startPosition.add(start), startPosition.add(end)]
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
    @editor.setSelectedBufferRanges @tabStopMarkers[@tabStopIndex]
    @settingTabStop = false
    true

  tabStopsForBufferPosition: (bufferPosition) ->
    _.intersection(@tabStopMarkers, @editor.findMarkers(containsBufferPosition: bufferPosition))

  destroy: ->
    @unsubscribe()
    @tabStopMarkers.length = 0
    @editor.snippetExpansion = null

  restore: (@editor) ->
    @editor.snippetExpansion = this
