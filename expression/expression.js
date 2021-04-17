module.exports = class Expression {
  constructor (identifier) {
    this.identifier = identifier
  }

  expand (editor, cursor, tabstops, variables) {
    // Check whether we are a tabstop or a variable
    Number.isInteger(this.identifier)
      // Create a tabstop marker at our position
      ? this.mark({ tabstops, start: cursor.getBufferPosition() })
      // Check whether we are a know variable or not
      : this.identifier in variables
        // Insert the variables value
        ? this.insert(editor, cursor, variables[this.identifier])
        // Insert 'this.identifier' and create a tabstop marker with it selected
        : this.mark({ tabstops, ...this.insert(editor, cursor, this.identifier) })
  }

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

  mark ({ tabstops, start, end = start, exclusive = true, expression = this }) {
    tabstops.markBufferRange({ start, end }, { exclusive }).setProperties({ expression })
  }

  toString () {
    return ''
  }
}
