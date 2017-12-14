{CompositeDisposable, Range, Point} = require 'atom'
SnippetHistoryProvider = require './snippet-history-provider';

module.exports =
class SnippetExpansion
  settingTabStop: false
  isIgnoringBufferChanges: false

  constructor: (@snippet, @editor, @cursor, @snippets) ->
    @subscriptions = new CompositeDisposable
    @tabStopMarkers = []
    @selections = [@cursor.selection]
    @observeHistory(true)

    startPosition = @cursor.selection.getBufferRange().start
    {body, tabStopList} = @snippet
    tabStops = tabStopList.toArray();
    if @snippet.lineCount > 1 and indent = @editor.lineTextForBufferRow(startPosition.row).match(/^\s*/)[0]
      # Add proper leading indentation to the snippet
      body = body.replace(/\n/g, '\n' + indent)

      tabStops = tabStops.map (tabStop) ->
        tabStop.copyWithIndent(indent);

    @editor.transact =>
      @ignoringBufferChanges =>
        newRange = @editor.transact =>
          @cursor.selection.insertText(body, autoIndent: false)
        if @snippet.tabStopList.length > 0
          @subscriptions.add @cursor.onDidChangePosition (event) => @cursorMoved(event)
          @subscriptions.add @cursor.onDidDestroy => @cursorDestroyed()
          @placeTabStopMarkers(startPosition, tabStops)
          @snippets.addExpansion(@editor, this)
          @editor.normalizeTabsInBufferRange(newRange)

  # Spy on the TextBuffer's history provider so that we know when a buffer
  # change is because of an undo or redo. In these situations we shouldn't try
  # to apply transformations because any changes to the transformation are
  # already part of the history.
  observeHistory: (bool) ->
    buffer = @editor.getBuffer()
    @existingProvider = buffer.historyProvider unless @existingProvider?
    if bool
      newProvider = SnippetHistoryProvider(@existingProvider, {
        undo: => @onUndoOrRedo(true)
        redo: => @onUndoOrRedo(false)
      })
      buffer.setHistoryProvider(newProvider)
    else
      buffer.setHistoryProvider(@existingProvider)
      @existingProvider = null

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
    hadChangeListener = !!@editorListeners
    wasIgnoringBufferChanges = @isIgnoringBufferChanges

    @setEditorListener(false)
    @isIgnoringBufferChanges = true

    callback()

    @isIgnoringBufferChanges = wasIgnoringBufferChanges
    @setEditorListener(true) if hadChangeListener

  setEditorListener: (bool) ->
    buffer = @editor.getBuffer()
    if bool
      unless @editorListener
        @editorListeners = new CompositeDisposable
        @editorListeners.add buffer.onDidChangeText (event) =>
          @textChanged(event)
        @subscriptions.add(@editorListeners)
    else
      if @editorListeners
        @editorListeners.dispose()
        @editorListeners = null

  applyAllTransformations: ->
    for item, index in @tabStopMarkers
      @applyTransformations(index, true)

  applyTransformations: (tabStop, initial = false) ->
    items = [@tabStopMarkers[tabStop]...]
    return if items.length == 0

    primary = items.shift()
    primaryRange = primary.marker.getBufferRange()
    inputText = @editor.getTextInBufferRange(primaryRange)

    @ignoringBufferChanges =>
      for item, index in items
        {marker, insertion} = item
        range = marker.getBufferRange()

        # Don't transform mirrored tab stops. They have their own cursors, so
        # mirroring happens automatically.
        continue if !insertion.isTransformation()

        outputText = insertion.transform(inputText)
        @editor.transact =>
          @editor.setTextInBufferRange(range, outputText)
        newRange = new Range(
          range.start,
          range.start.traverse(new Point(0, outputText.length))
        )
        marker.setBufferRange(newRange)

    @editor.groupChangesSinceCheckpoint(@checkpoint) if @checkpoint
    @checkpoint = @editor.createCheckpoint()

  placeTabStopMarkers: (startPosition, tabStops) ->
    for tabStop, index in tabStops
      {insertions} = tabStop
      @tabStopMarkers[index] ?= []
      for insertion in insertions
        {range} = insertion
        {start, end} = range
        marker = @editor.markBufferRange([startPosition.traverse(start), startPosition.traverse(end)])
        @tabStopMarkers[index].push({
          index: index,
          marker: marker,
          insertion: insertion
        })
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
      @destroy()
      false

  goToPreviousTabStop: ->
    @setTabStopIndex(@tabStopIndex - 1) if @tabStopIndex > 0

  setTabStopIndex: (@tabStopIndex) ->
    @settingTabStop = true
    markerSelected = false

    items = @tabStopMarkers[@tabStopIndex]
    return false unless items

    ranges = []
    @hasTransforms = false
    for item in items
      {marker, insertion} = item
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
    @setEditorListener(@hasTransforms)
    markerSelected

  destroy: ->
    @subscriptions.dispose()
    for items in @tabStopMarkers
      item.marker.destroy() for item in items
    @tabStopMarkers = []
    @snippets.clearExpansions(@editor)
    @observeHistory(false)

  restore: (@editor) ->
    @snippets.addExpansion(@editor, this)
