module.exports = class Construct {
  constructor (identifier) {
    this.identifier = identifier
  }

  write (buffer, range, value) {
    return buffer.setTextInRange(range, value)
  }

  insert (buffer, position, value) {
    return buffer.insert(position, value)
  }

  deactivate (marker, buffer) {
    marker.destroy()
  }

  activate (marker, cursor) {
    cursor.selection.setBufferRange(marker.getRange())
  }

  mark ({ layer, start, end = start, exclusive = true, construct = this }) {
    layer.markRange({ start, end }, { exclusive }).setProperties({ construct })
  }

  toString () {
    return ''
  }
}
