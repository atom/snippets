const {CompositeDisposable, Range, Point} = require('atom')
const {getEndpointOfText} = require('./util')

module.exports = class SnippetExpansion {
  constructor(snippet, editor, cursor, oldSelectionRange, snippets) {
    this.settingTabStop = false
    this.isIgnoringBufferChanges = false
    this.onUndoOrRedo = this.onUndoOrRedo.bind(this)
    this.isUndoingOrRedoing = false
    this.snippet = snippet
    this.editor = editor
    this.cursor = cursor
    this.snippets = snippets
    this.subscriptions = new CompositeDisposable
    this.tabStopMarkers = []
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
    this.insertBarrierCheckpoint()
    this.editor.transact(() => {
      this.ignoringBufferChanges(() => {
        const newRange = this.cursor.selection.insertText(body, {autoIndent: false})
        if (this.tabStopList.length > 0) {
          this.subscriptions.add(this.cursor.onDidChangePosition(event => this.cursorMoved(event)))
          this.subscriptions.add(this.cursor.onDidDestroy(() => this.cursorDestroyed()))
          this.placeTabStopMarkers(tabStops)
          this.snippets.addExpansion(this.editor, this)
          this.editor.normalizeTabsInBufferRange(newRange)
        }
      })
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
    const itemWithCursor = this.tabStopMarkers[this.tabStopIndex].find(item => item.marker.getBufferRange().containsPoint(newBufferPosition))

    if (itemWithCursor && !itemWithCursor.insertion.isTransformation()) { return }

    // we get here if there is no item for the current index with the cursor
    if (this.isUndoingOrRedoing) {
      if (this.isUndo) {
        this.goToPreviousTabStop(false) // don't set an undo break checkpoint
      } else {
        this.goToNextTabStop(false)
      }
      return
    }

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
      this.tabStopMarkers.forEach((item, index) =>
        this.applyTransformations(index))
    })
  }

  applyTransformations (tabStop) {
    const items = [...this.tabStopMarkers[tabStop]]
    if (items.length === 0) { return }

    const primary = items.shift()
    const primaryRange = primary.marker.getBufferRange()
    const inputText = this.editor.getTextInBufferRange(primaryRange)

    this.ignoringBufferChanges(() => {
      for (const item of items) {
        const {marker, insertion} = item
        var range = marker.getBufferRange()

        // Don't transform mirrored tab stops. They have their own cursors, so
        // mirroring happens automatically.
        if (!insertion.isTransformation()) { continue }

        var outputText = insertion.transform(inputText)

        this.editor.setTextInBufferRange(range, outputText)
        const newRange = new Range(
          range.start,
          range.start.traverse(getEndpointOfText(outputText))
        )
        marker.setBufferRange(newRange)
      }
    })
  }

  placeTabStopMarkers (tabStops) {
    const markerLayer = this.getMarkerLayer(this.editor)

    for (const tabStop of tabStops) {
      const {insertions} = tabStop
      const markers = []

      if (!tabStop.isValid()) { continue }

      for (const insertion of insertions) {
        const marker = markerLayer.markBufferRange(insertion.range)
        markers.push({
          index: markers.length,
          marker,
          insertion
        })
      }

      this.tabStopMarkers.push(markers)
    }

    this.setTabStopIndex(0)
    this.applyAllTransformations()
  }

  insertBarrierCheckpoint () {
    this.editor.buffer.historyProvider.createCheckpoint({markers: undefined, isBarrier: false}) // HACK: We need `isBarrier`, but the normal methods enforce false
  }

  goToNextTabStop (breakUndo=true) {
    if (breakUndo) this.insertBarrierCheckpoint()
    const nextIndex = this.tabStopIndex + 1

    // if we have an endstop (implicit ends have already been added) it will be the last one
    if (nextIndex === this.tabStopMarkers.length - 1 && this.tabStopList.hasEndStop) {
      const succeeded = this.setTabStopIndex(nextIndex)
      this.destroy()
      return succeeded
    }

    // we are not at the end, and the next is not the endstop; just go to next stop
    if (nextIndex < this.tabStopMarkers.length) {
      return this.setTabStopIndex(nextIndex) || this.goToNextTabStop()
    }

    // we have just tabbed past the final tabstop; silently clean up, and let an actual tab be inserted
    this.destroy()
    return false
  }

  goToPreviousTabStop (breakUndo=true) {
    if (this.tabStopIndex > 0) {
      if (breakUndo) this.insertBarrierCheckpoint()
      this.setTabStopIndex(this.tabStopIndex - 1)
    }
  }

  setTabStopIndex (tabStopIndex) {
    this.tabStopIndex = tabStopIndex
    this.settingTabStop = true
    let markerSelected = false

    const items = this.tabStopMarkers[this.tabStopIndex]
    if (items.length === 0) { return false }

    const ranges = []
    let hasTransforms = false
    for (const item of items) {
      const {marker, insertion} = item
      if (marker.isDestroyed() || !marker.isValid()) { continue }
      if (insertion.isTransformation()) {
        hasTransforms = true
        continue
      }
      ranges.push(marker.getBufferRange())
    }

    if (ranges.length > 0) {
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
      markerSelected = true
    }

    this.settingTabStop = false
    // If this snippet has at least one transform, we need to observe changes
    // made to the editor so that we can update the transformed tab stops.
    if (hasTransforms) { this.snippets.observeEditor(this.editor) }

    return markerSelected
  }

  goToEndOfLastTabStop () {
    if (this.tabStopMarkers.length === 0) { return }
    const items = this.tabStopMarkers[this.tabStopMarkers.length - 1]
    if (items.length === 0) { return }
    const {marker: lastMarker} = items[items.length - 1]
    if (lastMarker.isDestroyed()) {
      return false
    } else {
      this.editor.setCursorBufferPosition(lastMarker.getEndBufferPosition())
      return true
    }
  }

  destroy () {
    this.subscriptions.dispose()
    this.getMarkerLayer(this.editor).clear()
    this.tabStopMarkers = []
    this.snippets.stopObservingEditor(this.editor)
    this.snippets.clearExpansions(this.editor)
    this.snippets.snippetChoiceProvider.deactivate() // TODO: Move to clearExpansions?
  }

  getMarkerLayer () {
    return this.snippets.findOrCreateMarkerLayer(this.editor)
  }

  restore (editor) {
    this.editor = editor
    this.snippets.addExpansion(this.editor, this)
  }
}
