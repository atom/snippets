const { CompositeDisposable } = require('atom')
const path = require('path')

const TabstopList = require('../tabstop-list')
const Construct = require('./construct')

module.exports = class Snippet extends Construct {
  static getVariables (buffer, cursor, variables) {
    // Lazy getters for each variable
    return {
      ...variables,
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
        return (this.TM_CURRENT_WORD = buffer.getTextInRange(cursor.getCurrentWordBufferRange()))
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
        return (this.TM_FILENAME = path.basename(buffer.getPath()))
      },
      // The filename of the current document without its extensions
      get TM_FILENAME_BASE () {
        delete this.TM_FILENAME_BASE
        const filepath = buffer.getPath()
        return (this.TM_FILENAME_BASE = path.basename(filepath, path.extname(filepath)))
      },
      // The directory of the current document
      get TM_DIRECTORY () {
        delete this.TM_DIRECTORY
        return (this.TM_DIRECTORY = path.dirname(buffer.getPath()))
      },
      // The full file path of the current document
      get TM_FILEPATH () {
        delete this.TM_FILEPATH
        return (this.TM_FILEPATH = buffer.getPath())
      },
      // The contents of the clipboard
      get CLIPBOARD () {
        delete this.CLIPBOARD
        return (this.CLIPBOARD = atom.clipboard.read())
      },
      // The name of the opened workspace or folder
      get WORKSPACE_NAME () {
        delete this.WORKSPACE_NAME
        const [projectPath] = atom.project.relativizePath(buffer.getPath())
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

  // we use static (for memory reasons and)? to enforce that snippets don't alter
  // their own internal state once created (so they can be pre-generated and reused)
  static expand (snippet, buffer, cursor, variables, editor) {
    const disposables = new CompositeDisposable()

    // Construct variables from given and global
    Object.defineProperties(variables, Object.getOwnPropertyDescriptors(Snippet.getVariables(buffer, cursor)))

    // Create a new layer to store created tabstops
    const layer = buffer.addMarkerLayer({ role: 'tabstops' })

    disposables.add({ dispose: () => layer.destroy() })

    // Define a marker that spans the whole snippet
    // This will also be used as the ending tabstop if there isn't an explicit one
    // Unlike all other tabstops, this marker isn't exclusive, meaning it expands
    // with the inserted snippet bellow
    snippet.mark({ layer, start: cursor.getBufferPosition(), exclusive: false })
    const [marker] = layer.getMarkers()

    snippet.body.forEach(value => {
      value instanceof Object
        ? value.expand(buffer, cursor, layer, variables)
        : snippet.insert(buffer, cursor.getBufferPosition(), value)
    })

    // Only create tabstop stuff if we have any
    if (layer.getMarkerCount() > 1) {
      // The underlying data-structure is an Object, so the markers aren't guaranteed
      // to be in insertion order. in reality they will be, as the ids used are integers
      const tabstops = new TabstopList(layer.getMarkers()).entries()

      const nextStop = () => {
        const next = tabstops.next()
        if (next.done) {
          return disposables.dispose()
        }

        const { value: [id, [stopId, ...mirrorIds] = []] } = next

        const previous = tabstops[id - 1] || []

        previous.forEach(stopId => {
          const stop = layer.getMarker(stopId)
          stop.getProperties().construct.deactivate(stop, buffer)
        })

        const stop = layer.getMarker(stopId)
        const { construct } = stop.getProperties()

        construct.activate(stop, cursor)
        mirrorIds.forEach(mirrorId =>
          editor.decorateMarker(layer.getMarker(mirrorId), { type: 'highlight' }))

        return true
      }

      const target = 'atom-text-editor:not([mini])'
      const next = `snippets:next-tab-stop-${layer.id}`

      disposables.add(
        atom.keymaps.add(module.filename, { [target]: { tab: next } }),
        atom.commands.add(target, next, event => nextStop() ||
        event.abortKeyBinding()))

      // Go to the first tabstop
      nextStop()
    }

    disposables.add(
      cursor.onDidDestroy(() => disposables.dispose()),
      cursor.onDidChangePosition(({ newBufferPosition }) => {
        // Exclude endpoints, so that end tabstops don't trigger mirror logic
        if (!marker.getRange().containsPoint(newBufferPosition, true)) {
          disposables.dispose()
        }
      }))

    return marker.getRange()
  }

  constructor (body, legacySyntax) {
    // This snippet will work as the default ending tabstop
    super(0)

    this.body = body

    this.legacySyntax = legacySyntax
  }

  // helper cause Snippet isn't really ever available
  expand ({
    buffer = atom.workspace.getActiveTextEditor().getBuffer(),
    cursor = atom.workspace.getActiveTextEditor().getLastCursor(),
    variables = {},
    // We absolutely need the same editor the cursor belongs to
    editor = cursor.editor
  } = {}) {
    if (this.legacySyntax) {
      atom.notifications.addWarning('Snippets: Snippet uses deprecated syntax.', {
        description: 'Old syntactic features will be removed in a future release',
        dismissable: true
      })
    }

    return Snippet.expand(this, buffer, cursor, variables, editor)
  }

  // We work as the default ending tabstop, this is a special case
  activate (marker, cursor) {
    cursor.setBufferPosition(marker.getRange().end)
  }

  toString () {
    return this.body.reduce((result, value) => result + value)
  }
}
