const {CompositeDisposable, Range, Point} = require('atom')
const {getEndpointOfText} = require('./util')

module.exports = class SnippetExpansion {
  constructor (snippet, editor, cursor, oldSelectionRange, snippets) {
    this.settingTabStop = false
    this.isIgnoringBufferChanges = false
    this.onUndoOrRedo = this.onUndoOrRedo.bind(this)
    this.isUndoingOrRedoing = false
    this.snippet = snippet
    this.editor = editor
    this.cursor = cursor
    this.snippets = snippets
    this.subscriptions = new CompositeDisposable
    this.insertionsByIndex = []
    this.markersForInsertions = new Map()

    // The index of the active tab stop. We don't use the tab stop's own
    // numbering here; we renumber them consecutively starting at 0 in the order
    // in which they should be visited. So `$1` will always be index `0` in the
    // above list, and `$0` (if present) will always be the last index.
    this.tabStopIndex = null

    // If, say, tab stop 4's placeholder references tab stop 2, then tab stop
    // 4's insertion goes into this map as a "related" insertion to tab stop 2.
    // We need to keep track of this because tab stop 4's marker will need to be
    // replaced while 2 is the active index.
    this.relatedInsertionsByIndex = new Map()

    this.selections = [this.cursor.selection]

    const startPosition = this.cursor.selection.getBufferRange().start

    const {body, tabStopList} = this.snippet.toString({
      editor: this.editor,
      cursor: this.cursor,
      indent: this.editor.lineTextForBufferRow(startPosition.row).match(/^\s*/)[0],
      selectionRange: oldSelectionRange, // used by variable resolver
      startPosition: startPosition
    })

    this.tabStopList = tabStopList

    const tabStops = this.tabStopList.toArray()
    this.ignoringBufferChanges(() => {
      // Insert the snippet body at the cursor.
      const newRange = this.cursor.selection.insertText(body, {autoIndent: false})
      if (this.tabStopList.length > 0) {
        // Listen for cursor changes so we can decide whether to keep the
        // snippet active or terminate it.
        this.subscriptions.add(this.cursor.onDidChangePosition(event => this.cursorMoved(event)))
        this.subscriptions.add(this.cursor.onDidDestroy(() => this.cursorDestroyed()))
        this.placeTabStopMarkers(tabStops)
        this.snippets.addExpansion(this.editor, this)
        this.editor.normalizeTabsInBufferRange(newRange)
      }
    })
  }

  // Set a flag on undo or redo so that we know not to re-apply transforms.
  // They're already accounted for in the history.
  onUndoOrRedo (isUndo) {
    this.isUndoingOrRedoing = true
    this.isUndo = isUndo
  }

  cursorMoved ({oldBufferPosition, newBufferPosition, textChanged}) {
    if (this.settingTabStop || (textChanged && !this.isUndoingOrRedoing)) { return }

    const insertionAtCursor = this.insertionsByIndex[this.tabStopIndex].find((insertion) => {
      let marker = this.markersForInsertions.get(insertion)
      return marker.getBufferRange().containsPoint(newBufferPosition)
    })

    if (insertionAtCursor && !insertionAtCursor.isTransformation()) {
      // The cursor is still inside an insertion. Return so that the snippet doesn't get destroyed.
      return
    }

    // we get here if there is no item for the current index with the cursor
    if (this.isUndoingOrRedoing) {
      if (this.isUndo) {
        this.goToPreviousTabStop()
      } else {
        this.goToNextTabStop()
      }
      return
    }

    this.destroy()
    this.snippets.destroyExpansions(this.editor)
  }

  cursorDestroyed () {
    if (!this.settingTabStop) {
      this.destroy()
      this.snippets.destroyExpansions(this.editor)
    }
  }

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
    this.insertionsByIndex.forEach((_, index) => this.applyTransformations(index))
  }

  applyTransformations (tabStop) {
    const insertions = [...this.insertionsByIndex[tabStop]]
    if (insertions.length === 0) { return }

    const primaryInsertion = insertions.shift()
    const primaryRange = this.markersForInsertions.get(primaryInsertion).getBufferRange()
    const inputText = this.editor.getTextInBufferRange(primaryRange)

    this.ignoringBufferChanges(() => {
      for (const insertion of insertions) {
        // Don't transform mirrored tab stops. They have their own cursors, so
        // mirroring happens automatically.
        if (!insertion.isTransformation()) { continue }

        let marker = this.markersForInsertions.get(insertion)
        let range = marker.getBufferRange()

        var outputText = insertion.transform(inputText)

        this.editor.setTextInBufferRange(range, outputText)
        // this.editor.buffer.groupLastChanges()

        // Manually adjust the marker's range rather than rely on its internal
        // heuristics. (We don't have to worry about whether it's been
        // invalidated because setting its buffer range implicitly marks it as
        // valid again.)
        const newRange = new Range(
          range.start,
          range.start.traverse(getEndpointOfText(outputText))
        )
        marker.setBufferRange(newRange)
      }
    })
  }

  placeTabStopMarkers (tabStops) {
    // Tab stops within a snippet refer to one another by their external index
    // (1 for $1, 3 for $3, etc.). We respect the order of these tab stops, but
    // we renumber them starting at 0 and using consecutive numbers.
    //
    // Luckily, we don't need to convert between the two numbering systems very
    // often. But we do have to build a map from external index to our internal
    // index. We do this in a separate loop so that the table is complete before
    // we need to consult it in the following loop.
    let indexTable = {}
    Object.keys(tabStops).forEach((key, index) => {
      let tabStop = tabStops[key]
      indexTable[tabStop.index] = index
    })
    const markerLayer = this.getMarkerLayer(this.editor)

    let tabStopIndex = -1
    for (const tabStop of tabStops) {
      tabStopIndex++
      const {insertions} = tabStop
      if (!tabStop.isValid()) { continue }

      for (const insertion of insertions) {
        const {range: {start, end}} = insertion
        let references = null
        if (insertion.references) {
          references = insertion.references.map(external => indexTable[external])
        }
        // Since this method is only called once at the beginning of a snippet
        // expansion, we know that 0 is about to be the active tab stop.
        let shouldBeInclusive = (tabStopIndex === 0) || (references && references.includes(0))

        const marker = markerLayer.markBufferRange(insertion.range, {exclusive: !shouldBeInclusive})
        this.markersForInsertions.set(insertion, marker)
        if (references) {
          let relatedInsertions = this.relatedInsertionsByIndex.get(tabStopIndex) || []
          relatedInsertions.push(insertion)
          this.relatedInsertionsByIndex.set(tabStopIndex, relatedInsertions)
        }
      }

      // Since we have to replace markers in place when we change their
      // exclusivity, we'll store them in a map keyed on the insertion itself.
      this.insertionsByIndex[tabStopIndex] = insertions
    }

    this.setTabStopIndex(0)
    this.applyAllTransformations()
  }

  // When two insertion markers are directly adjacent to one another, and the
  // cursor is placed right at the border between them, the marker that should
  // "claim" the newly-typed content will vary based on context.
  //
  // All else being equal, that content should get added to the marker (if any)
  // whose tab stop is active (or the marker whose tab stop's placeholder
  // references an active tab stop). The `exclusive` setting controls whether a
  // marker grows to include content added at its edge.
  //
  // So we need to revisit the markers whenever the active tab stop changes,
  // figure out which ones need to be touched, and replace them with markers
  // that have the settings we need.
  adjustTabStopMarkers (oldIndex, newIndex) {
    // Take all the insertions belonging to the newly-active tab stop (and all
    // insertions whose placeholders reference the newly-active tab stop) and
    // change their markers to be inclusive.
    let insertionsForNewIndex = [
      ...this.insertionsByIndex[newIndex],
      ...(this.relatedInsertionsByIndex.get(newIndex) || [])
    ]

    for (let insertion of insertionsForNewIndex) {
      this.replaceMarkerForInsertion(insertion, {exclusive: false})
    }

    // Take all the insertions whose markers were made inclusive when they
    // became active and restore their original marker settings.
    let insertionsForOldIndex = [
      ...this.insertionsByIndex[oldIndex],
      ...(this.relatedInsertionsByIndex.get(oldIndex) || [])
    ]

    for (let insertion of insertionsForOldIndex) {
      this.replaceMarkerForInsertion(insertion, {exclusive: true})
    }
  }

  replaceMarkerForInsertion (insertion, settings) {
    let marker = this.markersForInsertions.get(insertion)

    // If the marker is invalid or destroyed, return it as-is. Other methods
    // need to know if a marker has been invalidated or destroyed, and there's
    // no case in which we'd need to change the settings on such a marker
    // anyway.
    if (!marker.isValid() || marker.isDestroyed()) {
      return marker
    }

    // Otherwise, create a new marker with an identical range and the specified
    // settings.
    let range = marker.getBufferRange()
    let replacement = this.getMarkerLayer(this.editor).markBufferRange(range, settings)

    marker.destroy()
    this.markersForInsertions.set(insertion, replacement)
    return replacement
  }

  goToNextTabStop () {
    const nextIndex = this.tabStopIndex + 1

    // if we have an endstop (implicit ends have already been added) it will be the last one
    if (nextIndex === this.insertionsByIndex.length - 1 && this.tabStopList.hasEndStop) {
      const succeeded = this.setTabStopIndex(nextIndex)
      this.destroy()
      return {succeeded, isDestroyed: true}
    }

    // we are not at the end, and the next is not the endstop; just go to next stop
    if (nextIndex < this.insertionsByIndex.length) {
      const succeeded = this.setTabStopIndex(nextIndex)
      if (succeeded) { return {succeeded, isDestroyed: false} }
      return this.goToNextTabStop()
    }

    // we have just tabbed past the final tabstop; silently clean up, and let an actual tab be inserted
    this.destroy()
    return {succeeded: false, isDestroyed: true}
  }

  goToPreviousTabStop () {
    if (this.tabStopIndex > 0) {
      return {
        succeeded: this.setTabStopIndex(this.tabStopIndex - 1),
        isDestroyed: false
      }
    }
    return {
      succeeded: atom.config.get('snippets.disableTabDedentInSnippet'),
      isDestroyed: false
    }
  }

  setTabStopIndex (tabStopIndex) {
    let oldIndex = this.tabStopIndex
    this.tabStopIndex = tabStopIndex

    // Set a flag before we move any selections so that our change handlers
    // will know that the movements were initiated by us.
    this.settingTabStop = true

    // Keep track of whether we replaced any selections or cursors.
    let markerSelected = false

    let insertions = this.insertionsByIndex[this.tabStopIndex]
    if (insertions.length === 0) { return false }

    const ranges = []
    let hasTransforms = false
    // Go through the active tab stop's markers to figure out where to place
    // cursors and/or selections.
    for (const insertion of insertions) {
      const marker = this.markersForInsertions.get(insertion)
      if (marker.isDestroyed() || !marker.isValid()) { continue }
      if (insertion.isTransformation()) {
        // Set a flag for later, but skip transformation insertions because
        // they don't get their own cursors.
        hasTransforms = true
        continue
      }
      ranges.push(marker.getBufferRange())
    }

    if (ranges.length > 0) {
      // We have new selections to apply. Reuse existing selections if
      // possible, and destroy the unused ones if we already have too many.
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
      // set. Update our return value.
      markerSelected = true
    }

    this.settingTabStop = false
    // If this snippet has at least one transform, we need to observe changes
    // made to the editor so that we can update the transformed tab stops.
    if (hasTransforms) {
      this.snippets.observeEditor(this.editor)
    } else {
      this.snippets.stopObservingEditor(this.editor)
    }

    if (oldIndex !== null) {
      this.adjustTabStopMarkers(oldIndex, this.tabStopIndex)
    }

    return markerSelected
  }

  destroy () {
    this.subscriptions.dispose()
    this.insertionsByIndex = []
  }

  getMarkerLayer () {
    return this.snippets.findOrCreateMarkerLayer(this.editor)
  }

  restore (editor) {
    this.editor = editor
    this.snippets.addExpansion(this.editor, this)
  }
}
