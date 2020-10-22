const { CompositeDisposable } = require('atom')
const path = require('path')

const Construct = require('./construct')

module.exports = class Snippet extends Construct {
  static getVariables (cursor) {
    // Lazy getters for each variable
    return {
      // The currently selected text or the empty string
      get TM_SELECTED_TEXT () {
        delete this.TM_SELECTED_TEXT
        return (this.TM_SELECTED_TEXT = cursor.selection.getText())
      },
      // The contents of the current line
      get TM_CURRENT_LINE () {
        delete this.TM_CURRENT_LINE
        return (this.TM_CURRENT_LINE = cursor.getCurrentBufferLine())
      },
      // The contents of the word under cursor or the empty string
      get TM_CURRENT_WORD () {
        delete this.TM_CURRENT_WORD
        return (this.TM_CURRENT_WORD = cursor.editor.getTextInBufferRange(cursor.getCurrentWordBufferRange()))
      },
      // The zero-index based line number
      get TM_LINE_INDEX () {
        delete this.TM_LINE_INDEX
        return (this.TM_LINE_INDEX = cursor.getBufferRow().toString())
      },
      // The one-index based line number
      get TM_LINE_NUMBER () {
        delete this.TM_LINE_NUMBER
        // Does 'getScreenRow'work as intended?
        return (this.TM_LINE_NUMBER = (cursor.getScreenRow() + 1).toString())
      },
      // The filename of the current document
      get TM_FILENAME () {
        delete this.TM_FILENAME
        return (this.TM_FILENAME = cursor.editor.getTitle())
      },
      // The filename of the current document without its extensions
      get TM_FILENAME_BASE () {
        delete this.TM_FILENAME_BASE
        const filepath = cursor.editor.getTitle()
        return (this.TM_FILENAME_BASE = path.basename(filepath, path.extname(filepath)))
      },
      // The directory of the current document
      get TM_DIRECTORY () {
        delete this.TM_DIRECTORY
        return (this.TM_DIRECTORY = path.dirname(cursor.editor.getPath()))
      },
      // The full file path of the current document
      get TM_FILEPATH () {
        delete this.TM_FILEPATH
        return (this.TM_FILEPATH = cursor.editor.getPath())
      },
      // The contents of the clipboard
      get CLIPBOARD () {
        delete this.CLIPBOARD
        return (this.CLIPBOARD = atom.clipboard.read())
      },
      // The name of the opened workspace or folder
      get WORKSPACE_NAME () {
        delete this.WORKSPACE_NAME
        const [projectPath] = atom.project.relativizePath(cursor.editor.getPath())
        return (this.WORKSPACE_NAME = path.basename(projectPath))
      },
      // Insert the current date and time
      // The current year
      get CURRENT_YEAR () {
        delete this.CURRENT_YEAR
        return (this.CURRENT_YEAR = new Date().toLocaleString('default', { year: 'numeric' }))
      },
      // The current year's last two digits
      get CURRENT_YEAR_SHORT () {
        delete this.CURRENT_YEAR_SHORT
        return (this.CURRENT_YEAR_SHORT = new Date().toLocaleString('default', { year: '2-digit' }))
      },
      // The month as two digits
      get CURRENT_MONTH () {
        delete this.CURRENT_MONTH
        return (this.CURRENT_MONTH = new Date().toLocaleString('default', { month: '2-digit' }))
      },
      // The full name of the month
      get CURRENT_MONTH_NAME () {
        delete this.CURRENT_MONTH_NAME
        return (this.CURRENT_MONTH_NAME = new Date().toLocaleString('default', { month: 'long' }))
      },
      // The short name of the month
      get CURRENT_MONTH_NAME_SHORT () {
        delete this.CURRENT_MONTH_NAME_SHORT
        return (this.CURRENT_MONTH_NAME_SHORT = new Date().toLocaleString('default', { month: 'short' }))
      },
      // The day of the month
      get CURRENT_DATE () {
        delete this.CURRENT_DATE
        return (this.CURRENT_DATE = new Date().toLocaleString('default', { day: '2-digit' }))
      },
      // The name of day
      get CURRENT_DAY_NAME () {
        delete this.CURRENT_DAY_NAME
        return (this.CURRENT_DAY_NAME = new Date().toLocaleString('default', { weekday: 'long' }))
      },
      // The short name of the day
      get CURRENT_DAY_NAME_SHORT () {
        delete this.CURRENT_DAY_NAME_SHORT
        return (this.CURRENT_DAY_NAME_SHORT = new Date().toLocaleString('default', { weekday: 'short' }))
      },
      // The current hour in 24-hour clock format
      get CURRENT_HOUR () {
        delete this.CURRENT_HOUR
        return (this.CURRENT_HOUR = new Date().toLocaleString('default', { hour: '2-digit' }))
      },
      // The current minute
      get CURRENT_MINUTE () {
        delete this.CURRENT_MINUTE
        return (this.CURRENT_MINUTE = new Date().toLocaleString('default', { minute: '2-digit' }))
      },
      // The current second
      get CURRENT_SECOND () {
        delete this.CURRENT_SECOND
        return (this.CURRENT_SECOND = new Date().toLocaleString('default', { second: '2-digit' }))
      },
      // The number of seconds since the Unix epoch
      get CURRENT_SECONDS_UNIX () {
        delete this.CURRENT_SECONDS_UNIX
        return (this.CURRENT_SECONDS_UNIX = Math.round(new Date() / 1000).toString())
      }
      /*
      TODO?:
      Insert line or block comments, honoring the current language
      BLOCK_COMMENT_START
      BLOCK_COMMENT_END
      LINE_COMMENT
      */
    }
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
    super(0, false)

    this.body = body

    this.legacySyntax = legacySyntax
  }

  // helper cause Snippet isn't really ever available
  expand ({
    editor = atom.workspace.getActiveTextEditor(),
    cursor = editor.getLastCursor(),
    tabstops = editor.addMarkerLayer(),
    variables = {}
  } = {}) {
    if (this.legacySyntax) {
      atom.notifications.addWarning('Snippets: Snippet uses deprecated syntax.', {
        description: 'Old syntactic features will be removed in a future release',
        dismissable: true
      })
    }

    // Construct variables from given and global
    Object.defineProperties(variables,
      Object.getOwnPropertyDescriptors(Snippet.getVariables(cursor)))

    const disposables = new CompositeDisposable()

    // Define a marker that spans the whole snippet
    // This will also be used as the ending tabstop if there isn't an explicit one
    // Don't make this marker exclusive, so it expands with the inserts bellow
    this.mark({ tabstops, start: cursor.getBufferPosition(), exclusive: false })
    const marker = tabstops.getMarkers().pop()
    // Take care that our disposables are disposed if necessary
    disposables.add(
      cursor.onDidDestroy(() => disposables.dispose()),
      cursor.onDidChangePosition(({ newBufferPosition }) => {
        // Exclude endpoints, so that end tabstops don't trigger mirror logic
        if (!marker.getRange().containsPoint(newBufferPosition, true)) {
          disposables.dispose()
        }
      }))

    // We are the outmost snippet
    const parentSnippet = tabstops.getMarkerCount() === 1

    this.body.forEach(value => {
      value instanceof Object
        ? value.expand(editor, cursor, tabstops, variables)
        : this.insert(editor, cursor.getBufferPosition(), value)
    })

    // Only create tabstop stuff if we have any
    if (parentSnippet && tabstops.getMarkerCount() > 1) {
      const target = 'atom-text-editor:not([mini])'
      const iterate = `snippets:next-tab-stop-${tabstops.id}`
      // The markers aren't guaranteed to be in insertion order, as they're stored in an Object
      // Luckilly the ids used are integers and the values are fetched using 'Object.values'
      const stops = {
        iterator: Snippet.getTabstops(tabstops.getMarkers()).values(),
        next (event) {
          const { done, value: [stop, ...mirrors] = [] } = this.iterator.next()
          const editor = event.originalEvent.getModel();
          return done
            ? disposables.dispose()
            // Cheaty way of returning true concisely
            : [stop, ...mirrors].every(mirror => !stop.getProperties()
              .construct.activate(mirror, cursor, stop))
        }
      }

      disposables.add(
        { dispose: () => tabstops.destroy() },
        atom.keymaps.add(module.filename, { [target]: { tab: iterate } }),
        atom.commands.add(target, iterate, event => stops.next(event) ||
        event.abortKeyBinding()))

      // Go to the first tabstop
      stops.next()
    }

    return marker.getRange()
  }

  // We work as the default ending tabstop, this is a special case
  activate (marker, cursor) {
    cursor.setBufferPosition(marker.getRange().end)
  }

  toString () {
    return this.body.reduce((result, value) => result + value)
  }
}
