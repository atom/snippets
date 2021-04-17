const Expression = require('./expression')

module.exports = class Transformation extends Expression {
  constructor (identifier, [regexp, format, flags]) {
    super(identifier)

    this.regexp = new RegExp(regexp, flags.join(''))
    this.format = format
  }

  activate (editor, cursor, stop, mirror) {
    super.activate(editor, cursor, stop, mirror)
    mirror.onDidDestroy(() => {
      const range = mirror.getBufferRange()
      const buffer = editor.getBuffer()
      buffer.setTextInRange(range, this.transform(buffer.getTextInRange(range)))
    })
  }

  transform (string, regexp = this.regexp) {
    let fold = sequence => sequence
    return this.format.reduce((result, sequence) => {
      const [group, insertion, replacement = ''] = sequence
      sequence instanceof Function
        ? fold = sequence
        : sequence instanceof Object
          ? result += fold(string.replace(regexp, group) ? insertion : replacement)
          : result += fold(string.replace(regexp, sequence))
      return result
    }, '')
  }

  insert (editor, cursor, value) {
    return super.insert(editor, cursor, this.transform(value))
  }

  toString () {
    return this.transform(super.toString())
  }
}
