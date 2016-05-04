_ = require 'underscore-plus'
{CompositeDisposable} = require 'atom'

module.exports =
class SnippetExpansion
  settingTabStop: false

  constructor: (@snippet, @editor, @cursor, @snippets) ->
    @subscriptions = new CompositeDisposable
    @tabStopMarkers = []
    @selections = [@cursor.selection]

    startPosition = @cursor.selection.getBufferRange().start

    @editor.transact =>
      newRange = @editor.transact =>
        @cursor.selection.insertText(snippet.body, autoIndent: false)
      if snippet.tabStops.length > 0
        if @editor.onDidUpdateSelections?
          @subscriptions.add @editor.onDidUpdateSelections ({updated, touched, destroyed}) =>
            for selection in @selections
              if updated.has(selection) and not touched.has(selection)
                @cursorMoved(selection.cursor.getBufferPosition())

            if destroyed.size isnt 0
              @cursorDestroyed()
        else
          @subscriptions.add @cursor.onDidChangePosition (event) => @cursorMoved(event.newBufferPosition) unless event.textChanged
          @subscriptions.add @cursor.onDidDestroy => @cursorDestroyed()
        @placeTabStopMarkers(startPosition, snippet.tabStops)
        @snippets.addExpansion(@editor, this)
        @editor.normalizeTabsInBufferRange(newRange)
      @indentSubsequentLines(startPosition.row, snippet) if snippet.lineCount > 1

  cursorMoved: (position) ->
    return if @settingTabStop

    @destroy() unless @tabStopMarkers[@tabStopIndex].some (marker) ->
      marker.getBufferRange().containsPoint(position)

  cursorDestroyed: -> @destroy() unless @settingTabStop

  placeTabStopMarkers: (startPosition, tabStopRanges) ->
    for ranges in tabStopRanges
      @tabStopMarkers.push ranges.map ({start, end}) =>
        @editor.markBufferRange([startPosition.traverse(start), startPosition.traverse(end)])
    @setTabStopIndex(0)

  indentSubsequentLines: (startRow, snippet) ->
    initialIndent = @editor.lineTextForBufferRow(startRow).match(/^\s*/)[0]
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
    @editor.transact =>
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
            selection = @editor.addSelectionForBufferRange(range)
            @selections.push(selection)
            unless @editor.onDidUpdateSelections?
              @subscriptions.add selection.cursor.onDidChangePosition (event) => @cursorMoved(event.newBufferPosition) unless event.textChanged
              @subscriptions.add selection.cursor.onDidDestroy => @cursorDestroyed()
        markerSelected = true
    @settingTabStop = false
    markerSelected

  destroy: ->
    @subscriptions.dispose()
    for markers in @tabStopMarkers
      marker.destroy() for marker in markers
    @tabStopMarkers = []
    @snippets.clearExpansions(@editor)

  restore: (@editor) ->
    @snippets.addExpansion(@editor, this)
