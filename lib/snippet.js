const {Point, Range} = require('atom')
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
    // accumulator to keep track of constructed text, tabstops, and position
    const acc = {
      variableResolver: this.variableResolver, // TODO: Pass this in a more sensible way? (IDK; make all these functions methods?)
      tabStopList: new TabStopList(this),
      unknownVariables: new Map(), // name -> [range]
      bodyText: '',
      row: params.startPosition.row,
      column: params.startPosition.column
    }

    stringifyContent(this.bodyTree, params, acc)

    addTabstopsForUnknownVariables(acc.unknownVariables, acc.tabStopList)

    return { body: acc.bodyText, tabStopList: acc.tabStopList }
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

function stringifyContent (content=[], params, acc) {
  for (let node of content) {
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
  }
}

function stringifyTabstop (node, params, acc) {
  const index = node.index === 0 ? Infinity : node.index
  const start = new Point(acc.row, acc.column)
  stringifyContent(node.content, params, acc)
  const range = new Range(start, [acc.row, acc.column])
  acc.tabStopList.findOrCreate({index, snippet: this}).addInsertion({range, substitution: node.substitution})
}

function stringifyChoice (node, params, acc) {
  // TODO: Support choices
  // NOTE: will need to make sure all choices appear consistently
  //   VS Code treats first non-simple use as the true def. So
  //   `${1:foo} ${1|one,two|}` expands to `foo| foo|`, but reversing
  //    them expands to `one| one|` (with choice)
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
  const {hasResolver, value} = acc.variableResolver.resolve({name: node.variable, ...params, ...acc})

  if (!hasResolver) { // variable unknown; convert to tabstop that goes at the end of all proper tabstops
    addUnknownVariable(node.variable, acc)
    return
  }

  let resolvedValue
  if (node.substitution) {
    resolvedValue = applyVariableTransformation(value || '', node.substitution)
  } else {
    resolvedValue = value
  }

  if (resolvedValue === undefined) { // variable known, but no value: use default contents or (implicitly) empty string
    if (node.content) {
      stringifyContent(node.content, params, acc)
    }
    return
  }

  // if we get to here, the variable is effectively a regular string now
  stringifyText(resolvedValue, params, acc)
}

// NOTE: Unlike the original version, this also applies
//  the indent and uses the "true" row and columns
function stringifyText (text, params, acc) {
  const origLength = text.length
  const replacement = '\n' + params.indent

  let rowDiff = 0
  let finalOffset = 0

  text = text.replace(/\n/g, (...arg) => {
    rowDiff += 1
    finalOffset = arg[arg.length - 2] // this holds the current match offset relative to the original string
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
      if (index >= match.length - 2) { throw new Error ("Index too high") }

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
