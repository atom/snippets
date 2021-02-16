const {Range} = require('atom')
const TabStopList = require('./tab-stop-list')

function tabStopsReferencedWithinTabStopContent (segment) {
  const results = []
  for (const item of segment) {
    if (item.index) {
      results.push(item.index, ...tabStopsReferencedWithinTabStopContent(item.content))
    }
  }
  return new Set(results)
}

module.exports = class Snippet {
  constructor({name, prefix, bodyText, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, bodyTree}) {
    this.name = name
    this.prefix = prefix
    this.bodyText = bodyText
    this.description = description
    this.descriptionMoreURL = descriptionMoreURL
    this.rightLabelHTML = rightLabelHTML
    this.leftLabel = leftLabel
    this.leftLabelHTML = leftLabelHTML
    this.tabStopList = new TabStopList(this)
    this.body = this.extractTabStops(bodyTree)
  }

  extractTabStops (bodyTree) {
    const bodyText = []
    let row = 0
    let column = 0

    // recursive helper function; mutates vars above
    let extractTabStops = bodyTree => {
      for (const segment of bodyTree) {
        if (segment.index != null) {
          let {index, content, substitution} = segment
          if (index === 0) { index = Infinity; }
          const start = [row, column]
          extractTabStops(content)
          const referencedTabStops = tabStopsReferencedWithinTabStopContent(content)
          const range = new Range(start, [row, column])
          const tabStop = this.tabStopList.findOrCreate({
            index,
            snippet: this
          })
          tabStop.addInsertion({
            range,
            substitution,
            references: Array.from(referencedTabStops)
          })
        } else if (typeof segment === 'string') {
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

    extractTabStops(bodyTree)
    this.lineCount = row + 1
    this.insertions = this.tabStopList.getInsertions()

    return bodyText.join('')
  }
}
