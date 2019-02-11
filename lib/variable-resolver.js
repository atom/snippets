const path = require("path")

module.exports = class VariableResolver {
  constructor (resolvers = new Map) {
    this.resolvers = new Map([
      ["CLIPBOARD", resolveClipboard],

      ["TM_SELECTED_TEXT", resolveSelected],
      ["TM_CURRENT_LINE", resolveCurrentLine],
      ["TM_CURRENT_WORD", resolveCurrentWord],
      ["TM_LINE_INDEX", resolveLineIndex],
      ["TM_LINE_NUMBER", resolveLineNumber],
      ["TM_FILENAME", resolveFileName],
      ["TM_FILENAME_BASE", resolveFileNameBase],
      ["TM_DIRECTORY", resolveFileDirectory],
      ["TM_FILEPATH", resolveFilePath],

      ["CURRENT_YEAR", resolveYear],
      ["CURRENT_YEAR_SHORT", resolveYearShort],
      ["CURRENT_MONTH", resolveMonth],
      ["CURRENT_MONTH_NAME", resolveMonthName],
      ["CURRENT_MONTH_NAME_SHORT", resolveMonthNameShort],
      ["CURRENT_DATE", resolveDate],
      ["CURRENT_DAY_NAME", resolveDayName],
      ["CURRENT_DAY_NAME_SHORT", resolveDayNameShort],
      ["CURRENT_HOUR", resolveHour],
      ["CURRENT_MINUTE", resolveMinute],
      ["CURRENT_SECOND", resolveSecond],

      ["BLOCK_COMMENT_START", resolveBlockCommentStart],
      ["BLOCK_COMMENT_END", resolveBlockCommentEnd],
      ["LINE_COMMENT", resolveLineComment],

      ...resolvers
    ])
  }

  add (resolver) {
    const varName = resolver.name
    const resolve = resolver.resolve
    if (typeof varName !== 'string' || typeof resolve !== 'function') return
    this.resolvers.set(varName, resolve)
  }


  /*
  params = {
    editor: the TextEditor we are expanding in
    cursor: the cursor we are expanding from
    indent: the indent of the original cursor line. Automatically applied to all text (post variable transformation)
    selectionRange: the original selection range of the cursor. This has been modified on the actual cursor to now select the prefix
    startPosition: the cursor selection start position, after being adjusted to select the prefix
    row: the row the start of the variable will be inserted on (final)
    column: the column the start of the variable will be inserted on (final; accounts for indent)
  }
  */
  resolve (params) {
    const resolver = this.resolvers.get(params.name)

    if (resolver) {
      return {
        hasResolver: true,
        value: resolver(params)
      }
    }

    return {
      hasResolver: false,
      value: undefined
    }
  }
}

function resolveClipboard () {
  return atom.clipboard.read()
}

function resolveSelected ({editor, selectionRange}) {
  if (!selectionRange || selectionRange.isEmpty()) return undefined
  return editor.getTextInBufferRange(selectionRange)
}

function resolveCurrentLine ({editor, cursor}) {
  return editor.lineTextForBufferRow(cursor.getBufferRow())
}

function resolveCurrentWord ({editor, cursor}) {
  return editor.getTextInBufferRange(cursor.getCurrentWordBufferRange())
}

function resolveLineIndex ({cursor}) {
  return `${cursor.getBufferRow()}`
}

function resolveLineNumber ({cursor}) {
  return `${cursor.getBufferRow() + 1}`
}

function resolveFileName ({editor}) {
  return editor.getTitle()
}

function resolveFileNameBase ({editor}) {
  const fileName = resolveFileName({editor})
  if (!fileName) { return undefined }

  const index = fileName.lastIndexOf('.')
  if (index >= 0) {
    return fileName.slice(0, index)
  }

  return fileName
}

function resolveFileDirectory ({editor}) {
  const filePath = editor.getPath()
  if (filePath === undefined) return undefined
  return path.dirname(filePath)
}

function resolveFilePath ({editor}) {
  return editor.getPath()
}


// TODO: Use correct locale
function resolveYear () {
  return new Date().toLocaleString('en-us', { year: 'numeric' })
}

function resolveYearShort () { // last two digits of year
  return new Date().toLocaleString('en-us', { year: '2-digit' })
}

function resolveMonth () {
  return new Date().toLocaleString('en-us', { month: '2-digit' })
}

function resolveMonthName () {
  return new Date().toLocaleString('en-us', { month: 'long' })
}

function resolveMonthNameShort () {
  return new Date().toLocaleString('en-us', { month: 'short' })
}

function resolveDate () {
  return new Date().toLocaleString('en-us', { day: '2-digit' })
}

function resolveDayName () {
  return new Date().toLocaleString('en-us', { weekday: 'long' })
}

function resolveDayNameShort () {
  return new Date().toLocaleString('en-us', { weekday: 'short' })
}

function resolveHour () {
  return new Date().toLocaleString('en-us', { hour12: false, hour: '2-digit' })
}

function resolveMinute () {
  return new Date().toLocaleString('en-us', { minute: '2-digit' })
}

function resolveSecond () {
  return new Date().toLocaleString('en-us', { second: '2-digit' })
}

// TODO: wait for https://github.com/atom/atom/issues/18812
// Could make a start with what we have; one of the two should be available
function getEditorCommentStringsForPoint (_editor, _point) {
  return { line: '//', start: '/*', end: '*/' }
}

function resolveBlockCommentStart ({editor, cursor}) {
  const delims = getEditorCommentStringsForPoint(editor, cursor.getBufferPosition())
  return delims.start
}

function resolveBlockCommentEnd ({editor, cursor}) {
  const delims = getEditorCommentStringsForPoint(editor, cursor.getBufferPosition())
  return delims.end
}

function resolveLineComment ({editor, cursor}) {
  const delims = getEditorCommentStringsForPoint(editor, cursor.getBufferPosition())
  return delims.line
}
