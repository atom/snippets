const {Range} = require('atom')
const TabStopList = require('./tab-stop-list')

module.exports = class Snippet {
  constructor({name, prefix, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, bodyTree, bodyText, variableResolver}) {
    this.name = name
    this.prefix = prefix
    this.description = description
    this.descriptionMoreURL = descriptionMoreURL
    this.rightLabelHTML = rightLabelHTML
    this.leftLabel = leftLabel
    this.leftLabelHTML = leftLabelHTML
    this.bodyTree = bodyTree
    this.bodyText = bodyText
    this.variableResolver = variableResolver
  }

  toString (params) {
    const tabStopList = new TabStopList(this)
    const bodyText = []
    let row = 0
    let column = 0

    // recursive helper function; mutates vars above
    let extractTabStops = bodyTree => {
      for (let segment of bodyTree) {
        if (segment.index != null) {
          let {index, content, substitution} = segment
          if (index === 0) { index = Infinity; }
          const start = [row, column]
          extractTabStops(content)
          const range = new Range(start, [row, column])
          const tabStop = tabStopList.findOrCreate({
            index,
            snippet: this
          })
          tabStop.addInsertion({ range, substitution })
        } else {
          if (segment.variable != undefined) {
            const value = this.variableResolver.resolve({ name: segment.variable, ...params })
            if (value === undefined) {
              if (segment.content) {
                extractTabStops(segment.content)
              }
            } else {
              segment = value
            }
          }

          if (typeof segment === 'string') {
            bodyText.push(segment)
            var segmentLines = segment.split('\n')
            column += segmentLines.shift().length
            let nextLine
            while ((nextLine = segmentLines.shift()) != null) {
              row += 1
              column = nextLine.length
            }
          }
        }
      }
    }

    extractTabStops(this.bodyTree)
    this.lineCount = row + 1
    this.insertions = tabStopList.getInsertions()

    return { body: bodyText.join(''), tabStopList }
  }
}
