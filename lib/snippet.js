const Variable = require('./variable.js')

module.exports = class Snippet extends Variable {
  constructor ({ identifier = '__anonymous', prefix = '', registery, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, value, range }) {
    super({ identifier, value, range })
    this.prefix = prefix
    this.registery = registery
    this.description = description
    this.descriptionMoreURL = descriptionMoreURL
    this.rightLabelHTML = rightLabelHTML
    this.leftLabel = leftLabel
    this.leftLabelHTML = leftLabelHTML
  }
}
