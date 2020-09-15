const Modifier = require('./modifier')

module.exports = class Transformation extends Modifier {
  constructor ([regexp, format, flags]) {
    super()

    this.regexp = new RegExp(regexp, flags.join(''))
    this.format = format
  }

  create ([Construct, ...args]) {
    class Transformation extends Construct {
      constructor ({ regexp, format }, ...args) {
        super(...args)

        this.regexp = regexp
        this.format = format

        this.transform = (string, regexp, fold = sequence => sequence) =>
          this.format.reduce((result, sequence) => {
            const { group, insertion, replacement = '' } = sequence
            sequence instanceof Function
              ? fold = sequence
              : sequence instanceof Object
                ? result += fold(string.replace(regexp, group) ? insertion : replacement)
                : result += fold(string.replace(regexp, sequence))
            return result
          }, '')
      }

      activate (mirror, cursor, stops) {
        mirror.onDidDestroy(() => {
          const range = mirror.getRange()
          const buffer = cursor.editor.getBuffer()
          const text = this.transform(buffer.getTextInRange(range), this.regexp)
          buffer.setTextInRange(range, text)
        })
        super.activate(mirror, cursor, stops)
      }

      insert (cursor, value) {
        return super.insert(cursor, this.transform(value, this.regexp))
      }

      toString () {
        return this.transform(super.toString(), this.regexp)
      }
    }

    return new Transformation(this, ...args)
  }
}
