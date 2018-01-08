{CompositeDisposable, Range, Point} = require 'atom'

module.exports =
class SnippetExpansion
  settingTabStop: false
  isIgnoringBufferChanges: false

  constructor: (@snippet, @editor, @cursor, @snippets) ->
    @subscriptions = new CompositeDisposable
    @tabStopMarkers = []
    @selections = [@cursor.selection]

    startPosition = @cursor.selection.getBufferRange().start
    {body, tabStopList} = @snippet
    tabStops = tabStopList.toArray()
    if @snippet.lineCount > 1 and indent = @editor.lineTextForBufferRow(startPosition.row).match(/^\s*/)[0]
      # Add proper leading indentation to the snippet
      body = body.replace(/\n/g, '\n' + indent)

      tabStops = tabStops.map (tabStop) ->
        tabStop.copyWithIndent(indent)

    @editor.transact =>
      @ignoringBufferChanges =>
        @editor.transact =>
          newRange = @cursor.selection.insertText(body, autoIndent: false)
          if @snippet.tabStopList.length > 0
            @subscriptions.add @cursor.onDidChangePosition (event) => @cursorMoved(event)
            @subscriptions.add @cursor.onDidDestroy => @cursorDestroyed()
            @placeTabStopMarkers(startPosition, tabStops)
            @snippets.addExpansion(@editor, this)
            @editor.normalizeTabsInBufferRange(newRange)

  # Set a flag on undo or redo so that we know not to re-apply transforms.
  # They're already accounted for in the history.
  onUndoOrRedo: (isUndo) =>
    @isUndoingOrRedoing = true

  cursorMoved: ({oldBufferPosition, newBufferPosition, textChanged}) ->
    return if @settingTabStop or textChanged
    @destroy() unless @tabStopMarkers[@tabStopIndex].some (item) ->
      item.marker.getBufferRange().containsPoint(newBufferPosition)

  cursorDestroyed: -> @destroy() unless @settingTabStop

  textChanged: (event) ->
    return if @isIgnoringBufferChanges

    # Don't try to alter the buffer if all we're doing is restoring a
    # snapshot from history.
    if @isUndoingOrRedoing
      @isUndoingOrRedoing = false
      return

    @applyTransformations(@tabStopIndex)

  ignoringBufferChanges: (callback) ->
    wasIgnoringBufferChanges = @isIgnoringBufferChanges
    @isIgnoringBufferChanges = true
    callback()
    @isIgnoringBufferChanges = wasIgnoringBufferChanges

  applyAllTransformations: ->
    @editor.transact =>
      for item, index in @tabStopMarkers
        @applyTransformations(index, true)

  applyTransformations: (tabStop, initial = false) ->
    items = [@tabStopMarkers[tabStop]...]
    return if items.length is 0

    primary = items.shift()
    primaryRange = primary.marker.getBufferRange()
    inputText = @editor.getTextInBufferRange(primaryRange)

    @ignoringBufferChanges =>
      for item, index in items
        {marker, insertion} = item
        range = marker.getBufferRange()

        # Don't transform mirrored tab stops. They have their own cursors, so
        # mirroring happens automatically.
        continue unless insertion.isTransformation()

        outputText = insertion.transform(inputText)
        @editor.transact =>
          @editor.setTextInBufferRange(range, outputText)
        newRange = new Range(
          range.start,
          range.start.traverse(new Point(0, outputText.length))
        )
        marker.setBufferRange(newRange)

  placeTabStopMarkers: (startPosition, tabStops) ->
    for tabStop in tabStops
      {insertions} = tabStop
      markers = []

      continue unless tabStop.isValid()

      for insertion in insertions
        {range} = insertion
        {start, end} = range
        marker = @snippets.getMarkerLayer(@editor).markBufferRange([startPosition.traverse(start), startPosition.traverse(end)])
        markers.push({
          index: markers.length,
          marker: marker,
          insertion: insertion
        })

      @tabStopMarkers.push(markers)

    @setTabStopIndex(0)
    @applyAllTransformations()

  goToNextTabStop: ->
    nextIndex = @tabStopIndex + 1
    if nextIndex < @tabStopMarkers.length
      if @setTabStopIndex(nextIndex)
        true
      else
        @goToNextTabStop()
    else
      succeeded = @goToEndOfLastTabStop()
      @destroy()
      succeeded

  goToPreviousTabStop: ->
    @setTabStopIndex(@tabStopIndex - 1) if @tabStopIndex > 0

  setTabStopIndex: (@tabStopIndex) ->
    @settingTabStop = true
    markerSelected = false

    items = @tabStopMarkers[@tabStopIndex]
    return false if items.length is 0

    ranges = []
    @hasTransforms = false
    for item in items
      {marker, insertion} = item
      continue if marker.isDestroyed()
      continue unless marker.isValid()
      if insertion.isTransformation()
        @hasTransforms = true
        continue
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
    # If this snippet has at least one transform, we need to observe changes
    # made to the editor so that we can update the transformed tab stops.
    @snippets.observeEditor(@editor) if @hasTransforms
    markerSelected

  goToEndOfLastTabStop: ->
    return unless @tabStopMarkers.length > 0
    items = @tabStopMarkers[@tabStopMarkers.length - 1]
    return unless items.length > 0
    {marker: lastMarker} = items[items.length - 1]
    if lastMarker.isDestroyed()
      false
    else
      @editor.setCursorBufferPosition(lastMarker.getEndBufferPosition())
      true

  destroy: ->
    @subscriptions.dispose()
    @getMarkerLayer(@editor).clear()
    @tabStopMarkers = []
    @snippets.stopObservingEditor(@editor)
    @snippets.clearExpansions(@editor)

  getMarkerLayer: ->
    @snippets.getMarkerLayer(@editor)

  restore: (@editor) ->
    @snippets.addExpansion(@editor, this)
