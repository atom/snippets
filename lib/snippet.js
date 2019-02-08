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
          if (segment.variable !== undefined) {
            let value = this.variableResolver.resolve({ name: segment.variable, ...params })
            if (value === undefined) {
              if (segment.content) {
                extractTabStops(segment.content)
              }
            } else {
              if (segment.substitution) {
                try {
                  value = applyVariableTransformation(value, segment.substitution)
                } catch (e) {
                  atom.notifications.addError(`Failed to transform snippet variable $${segment.variable}`, { stack: e })
                }
              }
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

function applyVariableTransformation (value, substitution) {
  // TODO: Better bounds and type checking so errors aren't as cryptic

  const replace = substitution.replace
  const result = value.replace(substitution.find, (...match) => {
    let interimResult = ''
    for (let i = 0; i < replace.length; i++) {
      if (typeof replace[i] === "string") {
        interimResult += replace[i]
        continue
      }

      const format = replace[i]

      const index = format.backreference
      if (index >= match.length - 2) { continue }

      let capture = match[index]
      if (capture === undefined) { continue }

      if (format.transform) {
        // TODO: Support custom transforms as well?
        switch (format.transform) {
          case 'upcase':
            capture = capture.toLocaleUpperCase()
            break
          case 'downcase':
            capture = capture.toLocaleLowerCase()
            break
          case 'capitalize':
            capture = capture ? capture[0].toLocaleUpperCase() + capture.substr(1) : ''
            break
          default: {}
        }
      }

      interimResult += capture
    }

    return interimResult
  })

  return result
}
