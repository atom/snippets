const { CompositeDisposable } = require('atom')

const Tabstop = require('./tabstop')

module.exports = class Snippet extends Tabstop {
  static getVariables (cursor) {
    return {}
  }

  constructor (variable) {
    super(variable)

    this.disposables = new CompositeDisposable()
  }

  get name () {
    return this.identifier || '__anonymous'
  }

  destroy (cursor = atom.workspace.getActiveTextEditor().getLastCursor()) {
    this.disposables.dispose()
    // Normalize line endings (why isn't there a method for this?)
    cursor.editor.buffer.setTextInRange(this.range, cursor.editor.buffer.getTextInRange(this.range))
    cursor.editor.normalizeTabsInBufferRange(this.range)
  }

  expand (cursor, variables = {}) {
    // Construct variables from given and global without given variables overriding global ones
    variables = { ...variables, ...Snippet.getVariables(cursor) }

    const index = cursor.editor.buffer.characterIndexForPosition(cursor.getBufferPosition())

    // Insert snippet text without normalizing line endings, so variabe ranges match
    cursor.editor.buffer.insert(cursor.getBufferPosition(), this.toString(), { normalizeLineEndings: false })

    // Generate tabstops and expanded text
    this.stops = super.expand(cursor, variables, this.disposables, index)
      // shift-tab could be implemented by defining a custom iterator / linked list
      // Sorts stops in ascending order, leaving zero last
      .sort(({ identifier: a }, { identifier: b }) => !a - !b || a - b)
    // Include an ending tabstop if one not present
    if (this.stops[this.stops.length - 1].identifier !== 0) {
      this.stops.push({ range: [this.range.end, this.range.end] })
    }

    const target = 'atom-text-editor:not([mini])'
    const next = `snippets:next-tab-stop-${this.identifier}`

    this.disposables.add(
      atom.commands.add(target, next, event =>
        this.nextStop(cursor) || event.abortKeyBinding()),
      atom.keymaps.add(module.filename, { [target]: { tab: next } }),
      cursor.onDidChangePosition(({ newBufferPosition }) => {
        if (!this.range.containsPoint(newBufferPosition)) {
          this.destroy(cursor)
        }
      }))

    this.nextStop(cursor)
    return this
  }

  nextStop (cursor) {
    const stop = this.stops.shift()
    if (stop) {
      cursor.selection.setBufferRange(stop.range)
      return true
    }
    this.destroy()
  }
}
