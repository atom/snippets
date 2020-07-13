const {Range} = require('atom')
const TabStopList = require('./tab-stop-list')

let bodyParser;
function getBodyParser () {
  if (bodyParser == null) {
    bodyParser = require('./snippet-body-parser')
  }
  return bodyParser
}

/**
 * A template for generating Snippet Expansions. Holds the parse tree of the snippet source (lazily), resolving it
 * to a concrete insertion text + tab stops + transformations on demand, based on the provided context.
 */
module.exports = class Snippet {
  constructor({name, prefix, bodyText, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, bodyTree=null}) {
    this.name = name
    this.prefix = prefix
    this.bodyText = bodyText
    this.description = description
    this.descriptionMoreURL = descriptionMoreURL
    this.rightLabelHTML = rightLabelHTML
    this.leftLabel = leftLabel
    this.leftLabelHTML = leftLabelHTML
    this.bodyTree = bodyTree
    this.instanceCache = null // cache for non-dynamic expansion
  }

  /**
   * Takes this snippet "template" and returns insertion text + tab stops, where all variables have been evaluated
   */
  generateInstance(_context={}) {
    if (this.instanceCache) {
      return this.instanceCache;
    }

    if (!this.bodyTree) {
      this.bodyTree = getBodyParser().parse(this.bodyText)
    }

    const bodyText = []
    const tabStopList = new TabStopList(this);
    let row = 0
    let column = 0
    let dynamic = false // if this snippet has components that may depend on `context` (e.g., variables)

    // recursive helper function; mutates vars above
    const extractTabStops = bodyTree => {
      for (const segment of bodyTree) {
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
        } else if (typeof segment === 'string') {
          bodyText.push(segment)
          const segmentLines = segment.split('\n')
          column += segmentLines.shift().length
          let nextLine
          while ((nextLine = segmentLines.shift()) != null) {
            row += 1
            column = nextLine.length
          }
        }
      }
    }

    extractTabStops(this.bodyTree)

    const result = {bodyText: bodyText.join(''), lineCount: row + 1, tabStopList}
    if (!dynamic) {
      this.instanceCache = result
    }
    return result
  }
}
