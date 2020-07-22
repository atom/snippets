const Tabstop = require('./tabstop')

module.exports = class Choice extends Tabstop {
  constructor ({ body, ...variable }) {
    super(variable)
    // Pluck body out from constructing object, as it's assumed to be an array
    this.body = body
    this.length = Math.max(...[...this.body.values()].map(choice => choice.length))
  }

  expand (cursor, variables, disposables) {
    const index = cursor.editor.buffer.characterIndexForPosition(cursor.getBufferPosition())

    this.range = this.range.map(offset =>
      cursor.editor.buffer.positionForCharacterIndex(offset + index).toArray())

    const marker = cursor.editor.buffer.markRange(this.range)

    disposables.add({ dispose: () => { marker.destroy() } })

    disposables.add(marker.onDidChange((event, { textChanged, newTailPosition, newHeadPosition } = event) => {
      console.log(event)
      this.range = [newTailPosition.toArray(), newHeadPosition.toArray()]
      if (textChanged) {
        console.log(cursor.editor.buffer.getTextInRange(this.range))
        this.mirrors.forEach(mirror => {
          console.log(this.identifier, mirror)
        })
      }
    }))

    return super.expand(cursor, variables, disposables)
  }
}
