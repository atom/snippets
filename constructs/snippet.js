const { CompositeDisposable } = require('atom')
const path = require('path')

const Construct = require('./construct')

module.exports = class Snippet extends Construct {
  static VARIABLES = {
    // The currently selected text or the empty string
    TM_SELECTED_TEXT: (editor, cursor) => cursor.selection.getText(),
    // The contents of the current line
    TM_CURRENT_LINE: (editor, cursor) => cursor.getCurrentBufferLine(),
    // The contents of the word under cursor or the empty string
    TM_CURRENT_WORD: (editor, cursor) => editor.getTextInBufferRange(cursor.getCurrentWordBufferRange()),
    // The zero-index based line number
    TM_LINE_INDEX: (editor, cursor) => cursor.getBufferRow().toString(),
    // The one-index based line number
    // Does 'getScreenRow'work as intended?
    TM_LINE_NUMBER: (editor, cursor) => (cursor.getScreenRow() + 1).toString(),
    // The filename of the current document
    TM_FILENAME: (editor, cursor) => editor.getTitle(),
    // The filename of the current document without its extensions
    TM_FILENAME_BASE: (editor, cursor, filepath = editor.getTitle()) => path.basename(filepath, path.extname(filepath)),
    // The directory of the current document
    TM_DIRECTORY: (editor, cursor) => path.dirname(editor.getPath()),
    // The full file path of the current document
    TM_FILEPATH: (editor, cursor) => editor.getPath(),
    // The contents of the clipboard
    CLIPBOARD: (editor, cursor) => atom.clipboard.read(),
    // The name of the opened workspace or folder
    WORKSPACE_NAME: (editor, cursor, [projectPath] = atom.project.relativizePath(editor.getPath())) => path.basename(projectPath),
    // Insert the current date and time
    // The current year
    CURRENT_YEAR: (editor, cursor) => new Date().toLocaleString('default', { year: 'numeric' }),
    // The current year's last two digits
    CURRENT_YEAR_SHORT: (editor, cursor) => new Date().toLocaleString('default', { year: '2-digit' }),
    // The month as two digits
    CURRENT_MONTH: (editor, cursor) => new Date().toLocaleString('default', { month: '2-digit' }),
    // The full name of the month
    CURRENT_MONTH_NAME: (editor, cursor) => new Date().toLocaleString('default', { month: 'long' }),
    // The short name of the month
    CURRENT_MONTH_NAME_SHORT: (editor, cursor) => new Date().toLocaleString('default', { month: 'short' }),
    // The day of the month
    CURRENT_DATE: (editor, cursor) => new Date().toLocaleString('default', { day: '2-digit' }),
    // The name of day
    CURRENT_DAY_NAME: (editor, cursor) => new Date().toLocaleString('default', { weekday: 'long' }),
    // The short name of the day
    CURRENT_DAY_NAME_SHORT: (editor, cursor) => new Date().toLocaleString('default', { weekday: 'short' }),
    // The current hour in 24-hour clock format
    CURRENT_HOUR: (editor, cursor) => new Date().toLocaleString('default', { hour: '2-digit' }),
    // The current minute
    CURRENT_MINUTE: (editor, cursor) => new Date().toLocaleString('default', { minute: '2-digit' }),
    // The current second
    CURRENT_SECOND: (editor, cursor) => new Date().toLocaleString('default', { second: '2-digit' }),
    // The number of seconds since the Unix epoch
    CURRENT_SECONDS_UNIX: (editor, cursor) => Math.round(new Date() / 1000).toString(),
    //
    // TODO?:
    // Insert line or block comments, honoring the current language
    // BLOCK_COMMENT_START
    // BLOCK_COMMENT_END
    // LINE_COMMENT
    //
    // custom = custom variables
    PROXY: (editor, cursor, custom) => new Proxy({}, {
      get: (cache, property) => property in this.VARIABLES
        ? (cache[property] = this.VARIABLES[property]())
        : property in custom
          ? custom[property]
          // We should never see this value used
          : null,
      has: (cache, property) => property in this.VARIABLES || property in custom
    })
  }

  static getTabstops (markers) {
    const tabstops = []
    const unknowns = []

    markers.forEach(marker => {
      const { construct } = marker.getProperties()

      Number.isInteger(construct.identifier)
        ? Array.isArray(tabstops[construct.identifier])
            ? tabstops[construct.identifier].push(marker)
            : tabstops[construct.identifier] = [marker]
        : unknowns.push([marker])
    })
    // Include all unknown variables at the end
    if (unknowns.length) {
      tabstops.push(...unknowns)
    }
    // Move 0th tabstop to last
    tabstops.push(tabstops.shift())

    return tabstops
  }

  constructor (body, legacySyntax) {
    // This snippet will work as the default ending tabstop
    super(0)

    this.body = body

    this.legacySyntax = legacySyntax
  }

  // We work as the default ending tabstop, this is a special case
  activate (editor, cursor, stop, mirror) {
    cursor.setBufferPosition(stop.getBufferRange().end)
  }

  // helper cause Snippet isn't really ever available
  expand ({
    editor = atom.workspace.getActiveTextEditor(),
    cursor = editor.getLastCursor(),
    tabstops = editor.addMarkerLayer(), // This is a _Display_MarkerLayer
    variables = {}
  } = {}) {
    if (this.legacySyntax) {
      atom.notifications.addWarning('Snippets: Snippet uses deprecated syntax.', {
        description: 'Old syntactic features will be removed in a future release',
        dismissable: true
      })
    }

    // Construct a variable proxy to access given and built-in variables
    variables = Snippet.VARIABLES.PROXY(editor, cursor, variables)

    // Define a marker that spans the whole snippet
    // This will also be used as the ending tabstop if there isn't an explicit one
    // Don't make this marker exclusive, so it expands with the inserts bellow
    this.mark({ tabstops, start: cursor.getBufferPosition(), exclusive: false })
    const marker = tabstops.getMarkers().pop()
    // Take care that our disposables are disposed if necessary
    const disposables = new CompositeDisposable(
      cursor.onDidDestroy(() => disposables.dispose()),
      cursor.onDidChangePosition(({ newBufferPosition }) => {
        // Exclude endpoints, so that end tabstops don't trigger mirror logic
        if (!marker.getBufferRange().containsPoint(newBufferPosition, true)) {
          disposables.dispose()
        }
      }))

    // We are the outmost snippet
    const parentSnippet = tabstops.getMarkerCount() === 1

    this.body.forEach(value => value instanceof Object
      ? value.expand(editor, cursor, tabstops, variables)
      : this.insert(editor, cursor, value))

    // Only create tabstop stuff if we have any
    if (parentSnippet && tabstops.getMarkerCount() > 1) {
      const target = 'atom-text-editor:not([mini])'
      const iterate = `snippets:next-tab-stop-${tabstops.id}`
      // The markers aren't guaranteed to be in insertion order, as they're stored in an Object
      // Luckilly the ids used are integers and the values are fetched using 'Object.values'
      const stops = {
        iterator: Snippet.getTabstops(tabstops.getMarkers()).values(),
        next () {
          const iteration = this.iterator.next()
          if (!iteration.done) {
            const { value: [stop] } = iteration
            const { construct } = stop.getProperties()
            iteration.value.forEach(mirror => construct.activate(editor, cursor, stop, mirror))
            return true
          }
          disposables.dispose()
        }
      }

      disposables.add(
        { dispose: () => tabstops.destroy() },
        atom.keymaps.add(module.filename, { [target]: { tab: iterate } }),
        atom.commands.add(target, iterate, event => stops.next() ||
        event.abortKeyBinding()))

      // Go to the first tabstop
      stops.next()
    }

    return marker.getBufferRange()
  }

  toString () {
    return this.body.reduce((result, value) => result + value)
  }
}
