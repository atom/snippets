const { Range } = require('atom')

const Variable = require('./variable')

module.exports = class Tabstop extends Variable {
  constructor (variable) {
    super(variable)

    this.mirrors = []
  }

  expand (cursor, variables, disposables, offset) {
    this.range = new Range(...[offset, offset + this.length]
      .map(index => cursor.editor.buffer.positionForCharacterIndex(index)))
    this.marker = cursor.editor.buffer.markRange(this.range)

    disposables.add({ dispose: () => { this.marker.destroy() } })

    disposables.add(this.marker.onDidChange(({ textChanged, newTailPosition, newHeadPosition }) => {
      this.range = new Range(newTailPosition, newHeadPosition)
      if (textChanged) {
        console.log(this.range)
        console.log('"' + cursor.editor.buffer.getTextInRange(this.range) + '"')
        console.log(this.identifier)
        this.mirrors.forEach(mirror => {
          console.log(this.identifier, mirror)
        })
      }
    }))

    return super.expand(cursor, variables, disposables, offset)
  }
}
