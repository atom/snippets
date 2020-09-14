const Modifier = require('./modifier')

module.exports = class Transformation extends Modifier {
  constructor ([regexp, format, flags]) {
    super()

    this.regexp = new RegExp(regexp, flags.join(''))
    this.format = format
  }

  modify ([Construct, identifier]) {
    class Transformation extends Construct {
      constructor (identifier, { regexp, format }) {
        super(identifier)

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

      deactivate (marker, buffer) {
        const range = marker.getRange()
        this.write(buffer, range, buffer.getTextInRange(range))
      }

      write (buffer, range, value) {
        return buffer.setTextInRange(range, this.transform(value, this.regexp))
      }

      insert (buffer, position, value) {
        return buffer.insert(position, this.transform(value, this.regexp))
      }

      toString () {
        return this.transform(super.toString(), this.regexp)
      }
    }

    return new Transformation(identifier, this)
  }
}
