path = require 'path'
{Emitter, Disposable, CompositeDisposable} = require 'atom'
_ = require 'underscore-plus'
async = require 'async'
CSON = require 'season'
{File} = require 'pathwatcher'
fs = require 'fs-plus'

Snippet = require './snippet'
SnippetExpansion = require './snippet-expansion'

module.exports =
  loaded: false

  activate: ->
    @subscriptions = new CompositeDisposable

    @subscriptions.add atom.workspace.addOpener (uri) =>
      if uri is 'atom://.atom/snippets'
        atom.workspace.open(@getUserSnippetsPath())

    @loadAll()
    @watchUserSnippets (watchDisposable) =>
      @subscriptions.add(watchDisposable)

    snippets = this

    @subscriptions.add atom.commands.add 'atom-text-editor',
      'snippets:expand': (event) ->
        editor = @getModel()
        if snippets.snippetToExpandUnderCursor(editor)
          snippets.clearExpansions(editor)
          snippets.expandSnippetsUnderCursors(editor)
        else
          event.abortKeyBinding()

      'snippets:next-tab-stop': (event) ->
        editor = @getModel()
        event.abortKeyBinding() unless snippets.goToNextTabStop(editor)

      'snippets:previous-tab-stop': (event) ->
        editor = @getModel()
        event.abortKeyBinding() unless snippets.goToPreviousTabStop(editor)

      'snippets:available': (event) ->
        editor = @getModel()
        SnippetsAvailable = require './snippets-available'
        snippets.availableSnippetsView ?= new SnippetsAvailable(snippets)
        snippets.availableSnippetsView.toggle(editor)

    @subscriptions.add atom.workspace.observeTextEditors (editor) =>
      @clearExpansions(editor)

  deactivate: ->
    @emitter?.dispose()
    @emitter = null
    @editorSnippetExpansions?.clear()
    atom.config.transact => @subscriptions.dispose()

  getUserSnippetsPath: ->
    userSnippetsPath = CSON.resolve(path.join(atom.getConfigDirPath(), 'snippets'))
    userSnippetsPath ? path.join(atom.getConfigDirPath(), 'snippets.cson')

  loadAll: (callback) ->
    @loadBundledSnippets (bundledSnippets) =>
      @loadPackageSnippets (packageSnippets) =>
        @loadUserSnippets (userSnippets) =>
          atom.config.transact =>
            for snippetSet in [bundledSnippets, packageSnippets, userSnippets]
              for filepath, snippetsBySelector of snippetSet
                @add(filepath, snippetsBySelector)
          @doneLoading()

  loadBundledSnippets: (callback) ->
    bundledSnippetsPath = CSON.resolve(path.join(__dirname, 'snippets'))
    @loadSnippetsFile bundledSnippetsPath, (snippets) ->
      snippetsByPath = {}
      snippetsByPath[bundledSnippetsPath] = snippets
      callback(snippetsByPath)

  loadUserSnippets: (callback) ->
    userSnippetsPath = @getUserSnippetsPath()
    fs.stat userSnippetsPath, (error, stat) =>
      if stat?.isFile()
        @loadSnippetsFile userSnippetsPath, (snippets) ->
          result = {}
          result[userSnippetsPath] = snippets
          callback(result)
      else
        callback({})

  watchUserSnippets: (callback) ->
    userSnippetsPath = @getUserSnippetsPath()
    fs.stat userSnippetsPath, (error, stat) =>
      if stat?.isFile()
        userSnippetsFile = new File(userSnippetsPath)
        try
          userSnippetsFile.on 'moved removed contents-changed', => @handleUserSnippetsDidChange()
        catch e
          message = """
            Unable to watch path: `snippets.cson`. Make sure you have permissions
            to the `~/.atom` directory and `#{userSnippetsPath}`.

            On linux there are currently problems with watch sizes. See
            [this document][watches] for more info.
            [watches]:https://github.com/atom/atom/blob/master/docs/build-instructions/linux.md#typeerror-unable-to-watch-path
          """
          atom.notifications.addError(message, {dismissable: true})

        callback(new Disposable -> userSnippetsFile.off())
      else
        callback(new Disposable ->)

  handleUserSnippetsDidChange: ->
    userSnippetsPath = @getUserSnippetsPath()
    atom.config.transact =>
      atom.config.unset(null, source: userSnippetsPath)
      @loadSnippetsFile userSnippetsPath, (result) =>
        @add(userSnippetsPath, result)

  loadPackageSnippets: (callback) ->
    packages = atom.packages.getLoadedPackages()
    snippetsDirPaths = (path.join(pack.path, 'snippets') for pack in packages)
    async.map snippetsDirPaths, @loadSnippetsDirectory.bind(this), (error, results) =>
      callback(_.extend({}, results...))

  doneLoading: ->
    atom.packages.emit 'snippets:loaded'
    @loaded = true
    @getEmitter().emit 'did-load-snippets'

  onDidLoadSnippets: (callback) ->
    @getEmitter().on 'did-load-snippets', callback

  getEmitter: ->
    @emitter ?= new Emitter

  loadSnippetsDirectory: (snippetsDirPath, callback) ->
    fs.isDirectory snippetsDirPath, (isDirectory) =>
      return callback(null, {}) unless isDirectory

      fs.readdir snippetsDirPath, (error, entries) =>
        if error
          console.warn("Error reading snippets directory #{snippetsDirPath}", error)
          return callback(null, {})

        async.map(
          entries,
          (entry, done)  =>
            filePath = path.join(snippetsDirPath, entry)
            @loadSnippetsFile filePath, (snippets) =>
              done(null, {filePath, snippets})
          (error, results) =>
            snippetsByPath = {}
            for {filePath, snippets} in results
              snippetsByPath[filePath] = snippets
            callback(null, snippetsByPath)
        )

  loadSnippetsFile: (filePath, callback) ->
    return callback({}) unless CSON.isObjectPath(filePath)
    CSON.readFile filePath, (error, object={}) =>
      if error?
        console.warn "Error reading snippets file '#{filePath}': #{error.stack ? error}"
        atom.notifications?.addError("Failed to load snippets from '#{filePath}'", {detail: error.message, dismissable: true})
      callback(object)

  add: (filePath, snippetsBySelector) ->
    for selector, snippetsByName of snippetsBySelector
      snippetsByPrefix = {}
      for name, attributes of snippetsByName
        {prefix, body, bodyTree} = attributes
        continue if typeof body isnt 'string'

        # if `add` isn't called by the loader task (in specs for example), we need to parse the body
        bodyTree ?= @getBodyParser().parse(body)
        snippet = new Snippet({name, prefix, bodyTree, bodyText: body})
        snippetsByPrefix[snippet.prefix] = snippet
      atom.config.set('snippets', snippetsByPrefix, source: filePath, scopeSelector: selector)

  getBodyParser: ->
    @bodyParser ?= require './snippet-body-parser'

  getPrefixText: (snippets, editor) ->
    wordRegex = @wordRegexForSnippets(snippets)
    cursors = editor.getCursors()
    for cursor in cursors
      prefixStart = cursor.getBeginningOfCurrentWordBufferPosition({wordRegex})
      editor.getTextInRange([prefixStart, cursor.getBufferPosition()])

  # Get a RegExp of all the characters used in the snippet prefixes
  wordRegexForSnippets: (snippets) ->
    prefixes = {}

    for prefix of snippets
      prefixes[character] = true for character in prefix
    prefixCharacters = Object.keys(prefixes).join('')
    new RegExp("[#{_.escapeRegExp(prefixCharacters)}]+")

  # Get the best match snippet for the given prefix text.  This will return
  # the longest match where there is no exact match to the prefix text.
  snippetForPrefix: (snippets, prefix) ->
    longestPrefixMatch = null

    for snippetPrefix, snippet of snippets
      if snippetPrefix is prefix
        longestPrefixMatch = snippet
        break
      else if _.endsWith(prefix, snippetPrefix)
        longestPrefixMatch ?= snippet
        if snippetPrefix.length > longestPrefixMatch.prefix.length
          longestPrefixMatch = snippet

    longestPrefixMatch

  getSnippets: (editor) ->
    atom.config.get('snippets', scope: editor.getLastCursor().getScopeDescriptor())

  snippetToExpandUnderCursor: (editor) ->
    return false unless editor.getLastSelection().isEmpty()
    snippets = @getSnippets(editor)
    return false if _.isEmpty(snippets)

    prefix = @getPrefixText(snippets, editor)
    return false unless prefix and _.uniq(prefix).length is 1

    prefix = prefix[0]
    @snippetForPrefix(snippets, prefix)

  expandSnippetsUnderCursors: (editor) ->
    return false unless snippet = @snippetToExpandUnderCursor(editor)

    editor.transact =>
      cursors = editor.getCursors()
      for cursor in cursors
        cursorPosition = cursor.getBufferPosition()
        startPoint = cursorPosition.translate([0, -snippet.prefix.length], [0, 0])
        cursor.selection.setBufferRange([startPoint, cursorPosition])
        @insert(snippet, editor, cursor)
    true

  goToNextTabStop: (editor) ->
    nextTabStopVisited = false
    for expansion in @getExpansions(editor)
      if expansion?.goToNextTabStop()
        nextTabStopVisited = true
    nextTabStopVisited

  goToPreviousTabStop: (editor) ->
    previousTabStopVisited = false
    for expansion in @getExpansions(editor)
      if expansion?.goToPreviousTabStop()
        previousTabStopVisited = true
    previousTabStopVisited

  getExpansions: (editor) ->
    @editorSnippetExpansions?.get(editor) ? []

  clearExpansions: (editor) ->
    @editorSnippetExpansions ?= new WeakMap()
    @editorSnippetExpansions.set(editor, [])

  addExpansion: (editor, snippetExpansion) ->
    @getExpansions(editor).push(snippetExpansion)

  insert: (snippet, editor=atom.workspace.getActiveTextEditor(), cursor=editor.getLastCursor()) ->
    if typeof snippet is 'string'
      bodyTree = @getBodyParser().parse(snippet)
      snippet = new Snippet({name: '__anonymous', prefix: '', bodyTree, bodyText: snippet})

    new SnippetExpansion(snippet, editor, cursor, this)
