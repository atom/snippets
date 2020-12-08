module.exports = class Construct {
  constructor (identifier) {
    this.identifier = identifier
  }

  expand () {}

  insert (editor, cursor, value) {
    return editor.getBuffer().insert(cursor.getBufferPosition(), value)
  }

  activate (editor, cursor, stop, mirror) {
    if (mirror === stop) {
      cursor.selection.setBufferRange(stop.getBufferRange())
      const subscription = cursor.onDidChangePosition(({ newBufferPosition }) => {
        if (!stop.getBufferRange().containsPoint(newBufferPosition)) {
          stop.destroy()
          subscription.dispose()
        }
      })
    } else {
      editor.decorateMarker(mirror, { type: 'highlight' })
      stop.onDidDestroy(() => mirror.destroy())
    }
  }

  mark ({ tabstops, start, end = start, exclusive = true, construct = this }) {
    tabstops.markBufferRange({ start, end }, { exclusive }).setProperties({ construct })
  }

  toString () {
    return ''
  }
}
