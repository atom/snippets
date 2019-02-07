const {Range} = require('atom')
const TabStopList = require('./tab-stop-list')


/*

1. Snippet stores the parsed snippet template

2. Template variables are resolved on demand

3. Followed by insertion

*/

module.exports = class Snippet {
  constructor({name, prefix, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, bodyTree, variableResolver}) {
    this.name = name
    this.prefix = prefix
    this.description = description
    this.descriptionMoreURL = descriptionMoreURL
    this.rightLabelHTML = rightLabelHTML
    this.leftLabel = leftLabel
    this.leftLabelHTML = leftLabelHTML
    this.bodyTree = bodyTree
    this.variableResolver = variableResolver
  }

  toString () {
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
            debugger
            const value = this.variableResolver.resolve({ name: segment.variable })
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
