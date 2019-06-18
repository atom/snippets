const {Point, Range} = require('atom')
const TabStopList = require('./tab-stop-list')
const {transformWithSubstitution} = require('./util')

const tabStopsReferencedWithinTabStopContent = (segment) => {
  let results = []
  for (let item of segment) {
    if (item.index) {
      results.push(
        item.index,
        ...tabStopsReferencedWithinTabStopContent(item.content)
      )
    }
  }
  return new Set(results)
}

module.exports = class Snippet {
  constructor(params) {
    this.name = params.name
    this.prefix = params.prefix
    this.description = params.description
    this.descriptionMoreURL = params.descriptionMoreURL
    this.rightLabelHTML = params.rightLabelHTML
    this.leftLabel = params.leftLabel
    this.leftLabelHTML = params.leftLabelHTML
    this.bodyTree = params.bodyTree
    this.variableResolver = params.variableResolver
    this.transformResolver = params.transformResolver
  }

  toString (params = {startPosition: {row: 0, column: 0}, indent: ''}) {
    params.variableResolver = this.variableResolver
    params.transformResolver = this.transformResolver

    // accumulator to keep track of constructed text, tabstops, and position
    const acc = {
      tabStopList: new TabStopList(this),
      unknownVariables: new Map(), // name -> [range]
      bodyText: '',
      row: params.startPosition.row,
      column: params.startPosition.column
    }

    let endsWithTabstop = stringifyContent(this.bodyTree, params, acc)

    addTabstopsForUnknownVariables(acc.unknownVariables, acc.tabStopList)

    if (!acc.tabStopList.hasEndStop && !endsWithTabstop && atom.config.get('snippets.implicitEndTabstop')) {
      const endRange = new Range([acc.row, acc.column], [acc.row, acc.column])
      acc.tabStopList.findOrCreate({index: Infinity, snippet: this}).addInsertion({range: endRange})
    }

    return {body: acc.bodyText, tabStopList: acc.tabStopList}
  }
}

function addTabstopsForUnknownVariables (unknowns, tabStopList) {
  let index = tabStopList.getHighestIndex() + 1
  for (const ranges of unknowns.values()) {
    const tabstop = tabStopList.findOrCreate({index, snippet: this})
    for (const range of ranges) {
      tabstop.addInsertion({range})
    }
    index++
  }
}

function stringifyContent (content = [], params, acc) {
  let endsWithTabstop
  for (let node of content) {
    endsWithTabstop = true
    if (node.index !== undefined) { // only tabstops and choices have an index
      if (node.choice !== undefined) {
        stringifyChoice(node, params, acc)
        continue
      }
      stringifyTabstop(node, params, acc)
      continue
    }
    if (node.variable !== undefined) {
      stringifyVariable(node, params, acc)
      continue
    }
    stringifyText(node, params, acc)
    endsWithTabstop = false
  }
  return endsWithTabstop
}

function stringifyTabstop (node, params, acc) {
  const index = node.index === 0 ? Infinity : node.index
  const start = new Point(acc.row, acc.column)
  stringifyContent(node.content, params, acc)
  let referencedTabStops = tabStopsReferencedWithinTabStopContent(node.content)
  const range = new Range(start, [acc.row, acc.column])
  acc.tabStopList.findOrCreate({index, snippet: this}).addInsertion({
    range,
    substitution: node.substitution,
    references: [...referencedTabStops]
  })
}

function stringifyChoice (node, params, acc) {
  // TODO: Support choices
  // NOTE: will need to make sure all choices appear consistently
  //   VS Code treats first non-simple use as the true def. So
  //   `${1:foo} ${1|one,two|}` expands to `foo| foo|`, but reversing
  //   them expands to `one| one|` (with choice)
  if (node.choice.length > 0) {
    stringifyTabstop({...node, content: [node.choice[0]]}, params, acc)
  } else {
    stringifyTabstop(node, params, acc)
  }
}

// NOTE: VS Code does not apply the transformation in this case, so we won't either
function addUnknownVariable (variableName, acc) {
  const {row, column} = acc
  acc.bodyText += variableName
  acc.column += variableName.length
  const range = new Range([row, column], [row, acc.column])

  const ranges = acc.unknownVariables.get(variableName)
  if (ranges !== undefined) {
    ranges.push(range)
    return
  }

  acc.unknownVariables.set(variableName, [range])
}

function stringifyVariable (node, params, acc) {
  const {hasResolver, value} = params.variableResolver.resolve(node.variable, {variable: node.variable, ...params, ...acc})

  if (!hasResolver) { // variable unknown; convert to tabstop that goes at the end of all proper tabstops
    addUnknownVariable(node.variable, acc)
    return
  }

  let resolvedValue
  if (node.substitution) {
    try {
      resolvedValue = transformWithSubstitution(value || '', node.substitution, params.transformResolver)
    } catch (e) {
      atom.notifications.addError(`Failed to transform snippet variable $${segment.variable}`, {detail: e}) // TODO: add snippet location
    }
  } else {
    resolvedValue = value
  }

  if (resolvedValue == undefined) { // variable known, but no value: use default contents or (implicitly) empty string
    if (node.content) {
      stringifyContent(node.content, params, acc)
    }
    return
  }

  // if we get to here, the variable is effectively a regular string now
  stringifyText(resolvedValue, params, acc)
}

// NOTE: Unlike the original version, this also applies
//  the indent and uses the 'true' row and columns
function stringifyText (text, params, acc) {
  const origLength = text.length
  const replacement = '\n' + params.indent // NOTE: Line endings normalised by default for setTextInBufferRange

  let rowDiff = 0
  let finalOffset = 0

  text = text.replace(/\n/g, (...match) => {
    rowDiff += 1
    finalOffset = match[match.length - 2] // this holds the current match offset relative to the original string
    return replacement
  })

  if (rowDiff > 0) {
    acc.row += rowDiff
    acc.column = params.indent.length + (origLength - finalOffset - 1)
  } else {
    acc.column += origLength
  }

  acc.bodyText += text
}
