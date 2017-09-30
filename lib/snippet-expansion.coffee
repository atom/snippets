{CompositeDisposable} = require 'atom'

module.exports =
class SnippetExpansion
  settingTabStop: false

  constructor: (@snippet, @editor, @cursor, @snippets) ->
    @subscriptions = new CompositeDisposable
    @tabStopMarkers = []
    @selections = [@cursor.selection]

    startPosition = @cursor.selection.getBufferRange().start
    body = @snippet.body
    indent = ""
    tabStopRanges = []
    if @snippet.lineCount > 1
      lines = body.split('\n')
      indent = @editor.lineTextForBufferRow(startPosition.row).match(/^\s*/)[0]
      for line, index in lines when index isnt 0 # Do not include initial line
        # Match first line's indent
        lines[index] = indent + line
      body = lines.join('\n')

    for tabStop in @snippet.tabStops
      ranges = []
      for range in tabStop
        unless startPosition.row is range.start.row
          # Add on the indent offset so that the tab stops are placed at the correct position
          range.start.column += indent.length
          range.end.column += indent.length
        ranges.push(range)
      tabStopRanges.push(ranges)

    @editor.transact =>
      newRange = @editor.transact =>
        @cursor.selection.insertText(body, autoIndent: false)
      if @snippet.tabStops.length > 0
        @subscriptions.add @cursor.onDidChangePosition (event) => @cursorMoved(event)
        @subscriptions.add @cursor.onDidDestroy => @cursorDestroyed()
        @placeTabStopMarkers(startPosition, tabStopRanges)
        @snippets.addExpansion(@editor, this)
        @editor.normalizeTabsInBufferRange(newRange)

  cursorMoved: ({oldBufferPosition, newBufferPosition, textChanged}) ->
    return if @settingTabStop or textChanged
    @destroy() unless @tabStopMarkers[@tabStopIndex].some (marker) ->
      marker.getBufferRange().containsPoint(newBufferPosition)

  cursorDestroyed: -> @destroy() unless @settingTabStop

  placeTabStopMarkers: (startPosition, tabStopRanges) ->
    for ranges in tabStopRanges
      @tabStopMarkers.push ranges.map ({start, end}) =>
        @editor.markBufferRange([startPosition.traverse(start), startPosition.traverse(end)])
    @setTabStopIndex(0)

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
          newSelection = @editor.addSelectionForBufferRange(range)
          @subscriptions.add newSelection.cursor.onDidChangePosition (event) => @cursorMoved(event)
          @subscriptions.add newSelection.cursor.onDidDestroy => @cursorDestroyed()
          @selections.push newSelection
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
