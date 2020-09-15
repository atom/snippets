module.exports = class Construct {
  constructor (identifier) {
    this.identifier = identifier
  }

  insert (cursor, value) {
    return cursor.editor.getBuffer().insert(cursor.getBufferPosition(), value)
  }

  activate (mirror, cursor, stop) {
    if (mirror === stop) {
      cursor.selection.setBufferRange(stop.getRange())
      const subscription = cursor.onDidChangePosition(({ newBufferPosition }) => {
        if (!stop.getRange().containsPoint(newBufferPosition)) {
          stop.destroy()
          subscription.dispose()
        }
      })
    } else {
      cursor.editor.decorateMarker(mirror, { type: 'highlight' })
      stop.onDidDestroy(() => mirror.destroy())
    }
  }

  mark ({ tabstops, start, end = start, exclusive = true, construct = this }) {
    tabstops.markRange({ start, end }, { exclusive }).setProperties({ construct })
  }

  toString () {
    return ''
  }
}
