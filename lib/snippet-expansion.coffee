{CompositeDisposable, Range, Point} = require 'atom'

module.exports =
class SnippetExpansion
  settingTabStop: false
  isIgnoringBufferChanges: false

  constructor: (@snippet, @editor, @cursor, @snippets) ->
    @subscriptions = new CompositeDisposable

    @insertionsByIndex = []
    @markersForInsertions = new Map

    # The index of the active tab stop. We don't use the tab stop's own
    # numbering here; we renumber them consecutively starting at 0 in the order
    # in which they should be visited. So `$1` will always be index `0` in the
    # above list, and `$0` (if present) will always be the last index.
    @tabStopIndex = null

    # If, say, tab stop 4's placeholder references tab stop 2, then tab stop
    # 4's insertion goes into this map as a "related" insertion to tab stop 2.
    # We need to keep track of this because tab stop 4's marker will need to be
    # replaced while 2 is the active index.
    @relatedInsertionsByIndex = new Map

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
          # Insert the snippet body at the cursor.
          newRange = @cursor.selection.insertText(body, autoIndent: false)
          if @snippet.tabStopList.length > 0
            # Listen for cursor changes so we can decide whether to keep the
            # snippet active or terminate it.
            @subscriptions.add(
              @cursor.onDidChangePosition (event) => @cursorMoved(event)
            )
            @subscriptions.add(
              @cursor.onDidDestroy => @cursorDestroyed()
            )
            @placeTabStopMarkers(startPosition, tabStops)
            @snippets.addExpansion(@editor, this)
            @editor.normalizeTabsInBufferRange(newRange)

  # Set a flag on undo or redo so that we know not to re-apply transforms.
  # They're already accounted for in the history.
  onUndoOrRedo: (isUndo) =>
    @isUndoingOrRedoing = true

  cursorMoved: ({oldBufferPosition, newBufferPosition, textChanged}) ->
    return if @settingTabStop or textChanged

    insertionAtCursor = @insertionsByIndex[@tabStopIndex].find (insertion) =>
      marker = @markersForInsertions.get(insertion)
      marker.getBufferRange().containsPoint(newBufferPosition)

    @destroy() unless insertionAtCursor and not insertionAtCursor.isTransformation()

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
      for insertions, index in @insertionsByIndex
        @applyTransformations(index)

  applyTransformations: (tabStopIndex) ->
    insertions = [@insertionsByIndex[tabStopIndex]...]
    return if insertions.length is 0

    primaryInsertion = insertions.shift()
    primaryRange = @markersForInsertions.get(primaryInsertion).getBufferRange()
    inputText = @editor.getTextInBufferRange(primaryRange)

    @ignoringBufferChanges =>
      for insertion, index in insertions
        # Don't transform mirrored tab stops. They have their own cursors, so
        # mirroring happens automatically.
        continue unless insertion.isTransformation()

        marker = @markersForInsertions.get(insertion)
        range = marker.getBufferRange()

        outputText = insertion.transform(inputText)
        @editor.transact =>
          @editor.setTextInBufferRange(range, outputText)

        # Manually adjust the marker's range rather than rely on its internal
        # heuristics. (We don't have to worry about whether it's been
        # invalidated because setting its buffer range implicitly marks it as
        # valid again.)
        newRange = new Range(
          range.start,
          range.start.traverse(new Point(0, outputText.length))
        )
        marker.setBufferRange(newRange)

  placeTabStopMarkers: (startPosition, tabStops) ->
    # Tab stops within a snippet refer to one another by their external index
    # (1 for $1, 3 for $3, etc.). We respect the order of these tab stops, but
    # we renumber them starting at 0 and using consecutive numbers.
    #
    # Luckily, we don't need to convert between the two numbering systems very
    # often. But we do have to build a map from external index to our internal
    # index. We do this in a separate loop so that the table is complete before
    # we need to consult it in the following loop.
    indexTable = {}
    for tabStop, index in tabStops
      indexTable[tabStop.index] = index

    for tabStop, index in tabStops
      {insertions} = tabStop

      continue unless tabStop.isValid()

      for insertion in insertions
        {range} = insertion
        {start, end} = range
        references = null
        if insertion.references?
          references = insertion.references.map (external) ->
            indexTable[external]
        # Since this method is only called once at the beginning of a snippet
        # expansion, we know that 0 is about to be the active tab stop.
        shouldBeInclusive = (index is 0) or (references and references.includes(0))
        marker = @getMarkerLayer(@editor).markBufferRange([
          startPosition.traverse(start),
          startPosition.traverse(end)
        ], {exclusive: !shouldBeInclusive})

        @markersForInsertions.set(insertion, marker)
        if references?
          relatedInsertions = (@relatedInsertionsByIndex.get(index) or [])
          relatedInsertions.push(insertion)
          @relatedInsertionsByIndex.set(index, relatedInsertions)

      # Since we have to replace markers in place when we change their
      # exclusivity, we'll store them in a map keyed on the insertion itself.
      @insertionsByIndex[index] = insertions

    @setTabStopIndex(0)
    @applyAllTransformations()

  # When two insertion markers are directly adjacent to one another, and the
  # cursor is placed right at the border between them, the marker that should
  # "claim" the newly-typed content will vary based on context.
  #
  # All else being equal, that content should get added to the marker (if any)
  # whose tab stop is active (or the marker whose tab stop's placeholder
  # references an active tab stop). The `exclusive` setting controls whether a
  # marker grows to include content added at its edge.
  #
  # So we need to revisit the markers whenever the active tab stop changes,
  # figure out which ones need to be touched, and replace them with markers
  # that have the settings we need.
  adjustTabStopMarkers: (oldIndex, newIndex) ->
    # Take all the insertions belonging to the newly-active tab stop (and all
    # insertions whose placeholders reference the newly-active tab stop) and
    # change their markers to be inclusive.
    insertionsForNewIndex = [
      @insertionsByIndex[newIndex]...,
      (@relatedInsertionsByIndex.get(newIndex) or [])...
    ]
    for insertion in insertionsForNewIndex
      @replaceMarkerForInsertion(insertion, {exclusive: false})

    # Take all the insertions whose markers were made inclusive when they
    # became active and restore their original marker settings.
    insertionsForOldIndex = [
      @insertionsByIndex[oldIndex]...,
      (@relatedInsertionsByIndex.get(oldIndex) or [])...
    ]
    for insertion in insertionsForOldIndex
      @replaceMarkerForInsertion(insertion, {exclusive: true})

  replaceMarkerForInsertion: (insertion, settings) ->
    marker = @markersForInsertions.get(insertion)

    # If the marker is invalid or destroyed, return it as-is. Other methods
    # need to know if a marker has been invalidated or destroyed, and there's
    # no case in which we'd need to change the settings on such a marker anyway.
    return marker unless marker.isValid()
    return marker if marker.isDestroyed()

    # Otherwise, create a new marker with an identical range and the specified
    # settings.
    range = marker.getBufferRange()
    replacement = @getMarkerLayer(@editor).markBufferRange(range, settings)

    marker.destroy()
    @markersForInsertions.set(insertion, replacement)
    replacement

  goToNextTabStop: ->
    nextIndex = @tabStopIndex + 1
    if nextIndex < @insertionsByIndex.length
      if @setTabStopIndex(nextIndex)
        true
      else
        @goToNextTabStop()
    else
      # The user has tabbed past the last tab stop. If the last tab stop is a
      # $0, we shouldn't move the cursor any further.
      if @snippet.tabStopList.hasEndStop
        @destroy()
        false
      else
        succeeded = @goToEndOfLastTabStop()
        @destroy()
        succeeded

  goToPreviousTabStop: ->
    @setTabStopIndex(@tabStopIndex - 1) if @tabStopIndex > 0

  setTabStopIndex: (newIndex) ->
    oldIndex = @tabStopIndex
    @tabStopIndex = newIndex

    # Set a flag before we move any selections so that our change handlers will
    # know that the movements were initiated by us.
    @settingTabStop = true

    # Keep track of whether we placed any selections or cursors.
    markerSelected = false

    insertions = @insertionsByIndex[@tabStopIndex]
    return false if insertions.length is 0

    ranges = []
    @hasTransforms = false
    # Go through the active tab stop's markers to figure out where to place
    # cursors and/or selections.
    for insertion in insertions
      marker = @markersForInsertions.get(insertion)
      continue if marker.isDestroyed()
      continue unless marker.isValid()
      if insertion.isTransformation()
        # Set a flag for later, but skip transformation insertions because they
        # don't get their own cursors.
        @hasTransforms = true
        continue
      ranges.push(marker.getBufferRange())

    if ranges.length > 0
      # We have new selections to apply. Reuse existing selections if possible,
      # destroying the unused ones if we already have too many.
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
      # We placed at least one selection, so this tab stop was successfully
      # set. Update our return value.
      markerSelected = true

    @settingTabStop = false

    # If this snippet has at least one transform, we need to observe changes
    # made to the editor so that we can update the transformed tab stops.
    if @hasTransforms
      @snippets.observeEditor(@editor)
    else
      @snippets.stopObservingEditor(@editor)

    @adjustTabStopMarkers(oldIndex, newIndex) unless oldIndex is null

    markerSelected

  goToEndOfLastTabStop: ->
    size = @insertionsByIndex.length
    return unless size > 0
    insertions = @insertionsByIndex[size - 1]
    return unless insertions.length > 0
    lastMarker = @markersForInsertions.get(insertions[insertions.length - 1])
    if lastMarker.isDestroyed()
      false
    else
      @editor.setCursorBufferPosition(lastMarker.getEndBufferPosition())
      true

  destroy: ->
    @subscriptions.dispose()
    @getMarkerLayer(@editor).clear()
    @insertionsByIndex = []
    @snippets.stopObservingEditor(@editor)
    @snippets.clearExpansions(@editor)

  getMarkerLayer: ->
    @snippets.findOrCreateMarkerLayer(@editor)

  restore: (@editor) ->
    @snippets.addExpansion(@editor, this)
