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
    this.tabStopMarkers = []
    this.selections = [this.cursor.selection]

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
          const newRange = this.cursor.selection.insertText(body, {autoIndent: false})
          if (this.snippet.tabStopList.length > 0) {
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
    const itemWithCursor = this.tabStopMarkers[this.tabStopIndex].find(item => item.marker.getBufferRange().containsPoint(newBufferPosition))

    if (itemWithCursor && !itemWithCursor.insertion.isTransformation()) { return }

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
        this.applyTransformations(index, true))
    })
  }

  applyTransformations (tabStop, initial = false) {
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
        this.editor.transact(() => this.editor.setTextInBufferRange(range, outputText))
        const newRange = new Range(
          range.start,
          range.start.traverse(new Point(0, outputText.length))
        )
        marker.setBufferRange(newRange)
      }
    })
  }

  placeTabStopMarkers (startPosition, tabStops) {
    for (const tabStop of tabStops) {
      const {insertions} = tabStop
      const markers = []

      if (!tabStop.isValid()) { continue }

      for (const insertion of insertions) {
        const {range} = insertion
        const {start, end} = range
        const marker = this.getMarkerLayer(this.editor).markBufferRange([
          startPosition.traverse(start),
          startPosition.traverse(end)
        ])
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

  goToNextTabStop () {
    const nextIndex = this.tabStopIndex + 1
    if (nextIndex < this.tabStopMarkers.length) {
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

  setTabStopIndex (tabStopIndex) {
    this.tabStopIndex = tabStopIndex
    this.settingTabStop = true
    let markerSelected = false

    const items = this.tabStopMarkers[this.tabStopIndex]
    if (items.length === 0) { return false }

    const ranges = []
    this.hasTransforms = false
    for (const item of items) {
      const {marker, insertion} = item
      if (marker.isDestroyed()) { continue }
      if (!marker.isValid()) { continue }
      if (insertion.isTransformation()) {
        this.hasTransforms = true
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
    if (this.hasTransforms) { this.snippets.observeEditor(this.editor) }

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
  }

  getMarkerLayer () {
    return this.snippets.findOrCreateMarkerLayer(this.editor)
  }

  restore (editor) {
    this.editor = editor
    this.snippets.addExpansion(this.editor, this)
  }
}
