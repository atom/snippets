const {CompositeDisposable, Range, Point} = require('atom')

module.exports = class SnippetExpansion {
  constructor(snippet, editor, cursor, snippets) {
    this.settingTabStop = false
    this.isIgnoringBufferChanges = false
    this.onUndoOrRedo = this.onUndoOrRedo.bind(this)
    this.snippet = snippet
    this.editor = editor
    this.cursor = cursor
    this.snippets = snippets
    this.subscriptions = new CompositeDisposable
    this.selections = [this.cursor.selection]

    // Holds the `Insertion` instance corresponding to each tab stop marker. We
    // don't use the tab stop's own numbering here; we renumber them
    // consecutively starting at 0 in the order in which they should be
    // visited. So `$1` (if present) will always be at index `0`, and `$0` (if
    // present) will always be the last index.
    this.insertionsByIndex = []

    // Each insertion has a corresponding marker. We keep them in a map so we
    // can easily reassociate an insertion with its new marker when we destroy
    // its old one.
    this.markersForInsertions = new Map()

    // The index of the active tab stop.
    this.tabStopIndex = null

    // If, say, tab stop 4's placeholder references tab stop 2, then tab stop
    // 4's insertion goes into this map as a "related" insertion to tab stop 2.
    // We need to keep track of this because tab stop 4's marker will need to
    // be replaced while 2 is the active index.
    this.relatedInsertionsByIndex = new Map()

    const startPosition = this.cursor.selection.getBufferRange().start
    let {body, tabStopList} = this.snippet
    let tabStops = tabStopList.toArray()

    let indent = this.editor.lineTextForBufferRow(startPosition.row).match(/^\s*/)[0]
    if (this.snippet.lineCount > 1 && indent) {
      // Add proper leading indentation to the snippet
      body = body.replace(/\n/g, `\n${indent}`)

      tabStops = tabStops.map(tabStop => tabStop.copyWithIndent(indent))
    }

    this.editor.transact(() => {
      this.ignoringBufferChanges(() => {
        this.editor.transact(() => {
          // Insert the snippet body at the cursor.
          const newRange = this.cursor.selection.insertText(body, {autoIndent: false})
          if (this.snippet.tabStopList.length > 0) {
            // Listen for cursor changes so we can decide whether to keep the
            // snippet active or terminate it.
            this.subscriptions.add(this.cursor.onDidChangePosition(event => this.cursorMoved(event)))
            this.subscriptions.add(this.cursor.onDidDestroy(() => this.cursorDestroyed()))
            this.placeTabStopMarkers(startPosition, tabStops)
            this.snippets.addExpansion(this.editor, this)
            this.editor.normalizeTabsInBufferRange(newRange)
          }
        })
      })
    })
  }

  // Set a flag on undo or redo so that we know not to re-apply transforms.
  // They're already accounted for in the history.
  onUndoOrRedo (isUndo) {
    this.isUndoingOrRedoing = true
  }

  cursorMoved ({oldBufferPosition, newBufferPosition, textChanged}) {
    if (this.settingTabStop || textChanged) { return }
    const insertionAtCursor = this.insertionsByIndex[this.tabStopIndex].find(insertion => {
      let marker = this.markersForInsertions.get(insertion)
      return marker.getBufferRange().containsPoint(newBufferPosition)
    })

    if (insertionAtCursor && !insertionAtCursor.isTransformation()) { return }

    this.destroy()
  }

  cursorDestroyed () { if (!this.settingTabStop) { this.destroy() } }

  textChanged (event) {
    if (this.isIgnoringBufferChanges) { return }

    // Don't try to alter the buffer if all we're doing is restoring a
    // snapshot from history.
    if (this.isUndoingOrRedoing) {
      this.isUndoingOrRedoing = false
      return
    }

    this.applyTransformations(this.tabStopIndex)
  }

  ignoringBufferChanges (callback) {
    const wasIgnoringBufferChanges = this.isIgnoringBufferChanges
    this.isIgnoringBufferChanges = true
    callback()
    this.isIgnoringBufferChanges = wasIgnoringBufferChanges
  }

  applyAllTransformations () {
    this.editor.transact(() => {
      this.insertionsByIndex.forEach((insertion, index) =>
        this.applyTransformations(index))
    })
  }

  applyTransformations (tabStopIndex) {
    const insertions = [...this.insertionsByIndex[tabStopIndex]]
    if (insertions.length === 0) { return }

    const primaryInsertion = insertions.shift()
    const primaryRange = this.markersForInsertions.get(primaryInsertion).getBufferRange()
    const inputText = this.editor.getTextInBufferRange(primaryRange)

    this.ignoringBufferChanges(() => {
      for (const [index, insertion] of insertions.entries()) {
        // Don't transform mirrored tab stops. They have their own cursors, so
        // mirroring happens automatically.
        if (!insertion.isTransformation()) { continue }

        var marker = this.markersForInsertions.get(insertion)
        var range = marker.getBufferRange()

        var outputText = insertion.transform(inputText)
        this.editor.transact(() => this.editor.setTextInBufferRange(range, outputText))

        // Manually adjust the marker's range rather than rely on its internal
        // heuristics. (We don't have to worry about whether it's been
        // invalidated because setting its buffer range implicitly marks it as
        // valid again.)
        const newRange = new Range(
          range.start,
          range.start.traverse(new Point(0, outputText.length))
        )
        marker.setBufferRange(newRange)
      }
    })
  }

  placeTabStopMarkers (startPosition, tabStops) {
    // Tab stops within a snippet refer to one another by their external index
    // (1 for $1, 3 for $3, etc.). We respect the order of these tab stops, but
    // we renumber them starting at 0 and using consecutive numbers.
    //
    // Luckily, we don't need to convert between the two numbering systems very
    // often. But we do have to build a map from external index to our internal
    // index. We do this in a separate loop so that the table is complete
    // before we need to consult it in the following loop.
    const indexTable = {}
    for (let [index, tabStop] of tabStops.entries()) {
      indexTable[tabStop.index] = index
    }

    for (let [index, tabStop] of tabStops.entries()) {
      const {insertions} = tabStop

      if (!tabStop.isValid()) { continue }

      for (const insertion of insertions) {
        const {range} = insertion
        const {start, end} = range
        let references = null
        if (insertion.references) {
          references = insertion.references.map(external => indexTable[external])
        }
        // Since this method is called only once at the beginning of a snippet expansion, we know that 0 is about to be the active tab stop.
        const shouldBeInclusive = (index === 0) || (references && references.includes(0))
        const marker = this.getMarkerLayer(this.editor).markBufferRange([
          startPosition.traverse(start),
          startPosition.traverse(end)
        ], { exclusive: !shouldBeInclusive })
        // Now that we've created these markers, we need to store them in a
        // data structure because they'll need to be deleted and re-created
        // when their exclusivity changes.
        this.markersForInsertions.set(insertion, marker)

        if (references) {
          const relatedInsertions = this.relatedInsertionsByIndex.get(index) || []
          relatedInsertions.push(insertion)
          this.relatedInsertionsByIndex.set(index, relatedInsertions)
        }
      }
      this.insertionsByIndex[index] = insertions
    }

    this.setTabStopIndex(0)
    this.applyAllTransformations()
  }

  // When two insertion markers are directly adjacent to one another, and the
  // cursor is placed right at the border between them, the marker that should
  // "claim" the newly typed content will vary based on context.
  //
  // All else being equal, that content should get added to the marker (if any)
  // whose tab stop is active, or else the marker whose tab stop's placeholder
  // references an active tab stop. The `exclusive` setting on a marker
  // controls whether that marker grows to include content added at its edge.
  //
  // So we need to revisit the markers whenever the active tab stop changes,
  // figure out which ones need to be touched, and replace them with markers
  // that have the settings we need.
  adjustTabStopMarkers (oldIndex, newIndex) {
    // Take all the insertions whose markers were made inclusive when they
    // became active and restore their original marker settings.
    const insertionsForOldIndex = [
      ...this.insertionsByIndex[oldIndex],
      ...(this.relatedInsertionsByIndex.get(oldIndex) || [])
    ]

    for (let insertion of insertionsForOldIndex) {
      this.replaceMarkerForInsertion(insertion, {exclusive: true})
    }

    // Take all the insertions belonging to the newly active tab stop (and all
    // insertions whose placeholders reference the newly active tab stop) and
    // change their markers to be inclusive.
    const insertionsForNewIndex = [
      ...this.insertionsByIndex[newIndex],
      ...(this.relatedInsertionsByIndex.get(newIndex) || [])
    ]

    for (let insertion of insertionsForNewIndex) {
      this.replaceMarkerForInsertion(insertion, {exclusive: false})
    }
  }

  replaceMarkerForInsertion (insertion, settings) {
    const marker = this.markersForInsertions.get(insertion)

    // If the marker is invalid or destroyed, return it as-is. Other methods
    // need to know if a marker has been invalidated or destroyed, and we have
    // no need to change the settings on such markers anyway.
    if (!marker.isValid() || marker.isDestroyed()) {
      return marker
    }

    // Otherwise, create a new marker with an identical range and the specified
    // settings.
    const range = marker.getBufferRange()
    const replacement = this.getMarkerLayer(this.editor).markBufferRange(range, settings)

    marker.destroy()
    this.markersForInsertions.set(insertion, replacement)
    return replacement
  }

  goToNextTabStop () {
    const nextIndex = this.tabStopIndex + 1
    if (nextIndex < this.insertionsByIndex.length) {
      if (this.setTabStopIndex(nextIndex)) {
        return true
      } else {
        return this.goToNextTabStop()
      }
    } else {
      // The user has tabbed past the last tab stop. If the last tab stop is a
      // $0, we shouldn't move the cursor any further.
      if (this.snippet.tabStopList.hasEndStop) {
        this.destroy()
        return false
      } else {
        const succeeded = this.goToEndOfLastTabStop()
        this.destroy()
        return succeeded
      }
    }
  }

  goToPreviousTabStop () {
    if (this.tabStopIndex > 0) { this.setTabStopIndex(this.tabStopIndex - 1) }
  }

  setTabStopIndex (newIndex) {
    const oldIndex = this.tabStopIndex
    this.tabStopIndex = newIndex
    // Set a flag before moving any selections so that our change handlers know
    // that the movements were initiated by us.
    this.settingTabStop = true
    // Keep track of whether we placed any selections or cursors.
    let markerSelected = false

    const insertions = this.insertionsByIndex[this.tabStopIndex]
    if (insertions.length === 0) { return false }

    const ranges = []
    this.hasTransforms = false

    // Go through the active tab stop's markers to figure out where to place
    // cursors and/or selections.
    for (const insertion of insertions) {
      const marker = this.markersForInsertions.get(insertion)
      if (marker.isDestroyed()) { continue }
      if (!marker.isValid()) { continue }
      if (insertion.isTransformation()) {
        // Set a flag for later, but skip transformation insertions because
        // they don't get their own cursors.
        this.hasTransforms = true
        continue
      }
      ranges.push(marker.getBufferRange())
    }

    if (ranges.length > 0) {
      // We have new selections to apply. Reuse existing selections if
      // possible, destroying the unused ones if we already have too many.
      for (const selection of this.selections.slice(ranges.length)) { selection.destroy() }
      this.selections = this.selections.slice(0, ranges.length)
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]
        if (this.selections[i]) {
          this.selections[i].setBufferRange(range)
        } else {
          const newSelection = this.editor.addSelectionForBufferRange(range)
          this.subscriptions.add(newSelection.cursor.onDidChangePosition(event => this.cursorMoved(event)))
          this.subscriptions.add(newSelection.cursor.onDidDestroy(() => this.cursorDestroyed()))
          this.selections.push(newSelection)
        }
      }
      // We placed at least one selection, so this tab stop was successfully
      // set.
      markerSelected = true
    }

    this.settingTabStop = false
    // If this snippet has at least one transform, we need to observe changes
    // made to the editor so that we can update the transformed tab stops.
    if (this.hasTransforms) {
      this.snippets.observeEditor(this.editor)
    } else {
      this.snippets.stopObservingEditor(this.editor)
    }

    if (oldIndex !== null) {
      this.adjustTabStopMarkers(oldIndex, newIndex)
    }

    return markerSelected
  }

  goToEndOfLastTabStop () {
    const size = this.insertionsByIndex.length
    if (size === 0) { return }
    const insertions = this.insertionsByIndex[size - 1]
    if (insertions.length === 0) { return }
    const lastMarker = this.markersForInsertions.get(insertions[insertions.length - 1])

    if (lastMarker.isDestroyed()) {
      return false
    } else {
      this.seditor.setCursorBufferPosition(lastMarker.getEndBufferPosition())
      return true
    }
  }

  destroy () {
    this.subscriptions.dispose()
    this.getMarkerLayer(this.editor).clear()
    this.insertionsByIndex = []
    this.relatedInsertionsByIndex = new Map()
    this.markersForInsertions = new Map();
    this.snippets.stopObservingEditor(this.editor)
    this.snippets.clearExpansions(this.editor)
  }

  getMarkerLayer () {
    return this.snippets.findOrCreateMarkerLayer(this.editor)
  }

  restore (editor) {
    this.editor = editor
    this.snippets.addExpansion(this.editor, this)
  }
}
