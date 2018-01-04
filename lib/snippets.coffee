path = require 'path'
{Emitter, Disposable, CompositeDisposable, File} = require 'atom'
_ = require 'underscore-plus'
async = require 'async'
CSON = require 'season'
fs = require 'fs-plus'
ScopedPropertyStore = require 'scoped-property-store'

Snippet = require './snippet'
SnippetExpansion = require './snippet-expansion'
EditorStore = require './editor-store'
{getPackageRoot} = require './helpers'

module.exports =
  activate: ->
    @loaded = false
    @userSnippetsPath = null
    @snippetIdCounter = 0
    @parsedSnippetsById = new Map
    @scopedPropertyStore = new ScopedPropertyStore
    @subscriptions = new CompositeDisposable
    @subscriptions.add atom.workspace.addOpener (uri) =>
      if uri is 'atom://.atom/snippets'
        atom.workspace.openTextFile(@getUserSnippetsPath())

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
    @editorSnippetExpansions = null
    atom.config.transact => @subscriptions.dispose()

  getUserSnippetsPath: ->
    return @userSnippetsPath if @userSnippetsPath?

    @userSnippetsPath = CSON.resolve(path.join(atom.getConfigDirPath(), 'snippets'))
    @userSnippetsPath ?= path.join(atom.getConfigDirPath(), 'snippets.cson')
    @userSnippetsPath

  loadAll: ->
    @loadBundledSnippets (bundledSnippets) =>
      @loadPackageSnippets (packageSnippets) =>
        @loadUserSnippets (userSnippets) =>
          atom.config.transact =>
            for snippetSet in [bundledSnippets, packageSnippets, userSnippets]
              for filepath, snippetsBySelector of snippetSet
                @add(filepath, snippetsBySelector)
            return
          @doneLoading()

  loadBundledSnippets: (callback) ->
    bundledSnippetsPath = CSON.resolve(path.join(getPackageRoot(), 'lib', 'snippets'))
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
        userSnippetsFileDisposable = new CompositeDisposable()
        userSnippetsFile = new File(userSnippetsPath)
        try
          userSnippetsFileDisposable.add userSnippetsFile.onDidChange => @handleUserSnippetsDidChange()
          userSnippetsFileDisposable.add userSnippetsFile.onDidDelete => @handleUserSnippetsDidChange()
          userSnippetsFileDisposable.add userSnippetsFile.onDidRename => @handleUserSnippetsDidChange()
        catch e
          message = """
            Unable to watch path: `snippets.cson`. Make sure you have permissions
            to the `~/.atom` directory and `#{userSnippetsPath}`.

            On linux there are currently problems with watch sizes. See
            [this document][watches] for more info.
            [watches]:https://github.com/atom/atom/blob/master/docs/build-instructions/linux.md#typeerror-unable-to-watch-path
          """
          atom.notifications.addError(message, {dismissable: true})

        callback(userSnippetsFileDisposable)
      else
        callback(new Disposable -> )

  handleUserSnippetsDidChange: ->
    userSnippetsPath = @getUserSnippetsPath()
    atom.config.transact =>
      @clearSnippetsForPath(userSnippetsPath)
      @loadSnippetsFile userSnippetsPath, (result) =>
        @add(userSnippetsPath, result)

  loadPackageSnippets: (callback) ->
    packages = atom.packages.getLoadedPackages()
    snippetsDirPaths = (path.join(pack.path, 'snippets') for pack in packages).sort (a, b) ->
      if /\/app\.asar\/node_modules\//.test(a) then -1 else 1
    async.map snippetsDirPaths, @loadSnippetsDirectory.bind(this), (error, results) ->
      callback(_.extend({}, results...))

  doneLoading: ->
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
          (entry, done) =>
            filePath = path.join(snippetsDirPath, entry)
            @loadSnippetsFile filePath, (snippets) ->
              done(null, {filePath, snippets})
          (error, results) ->
            snippetsByPath = {}
            for {filePath, snippets} in results
              snippetsByPath[filePath] = snippets
            callback(null, snippetsByPath)
        )

  loadSnippetsFile: (filePath, callback) ->
    return callback({}) unless CSON.isObjectPath(filePath)
    CSON.readFile filePath, (error, object={}) ->
      if error?
        console.warn "Error reading snippets file '#{filePath}': #{error.stack ? error}"
        atom.notifications.addError("Failed to load snippets from '#{filePath}'", {detail: error.message, dismissable: true})
      callback(object)

  add: (filePath, snippetsBySelector) ->
    for selector, snippetsByName of snippetsBySelector
      unparsedSnippetsByPrefix = {}
      for name, attributes of snippetsByName
        {prefix, body} = attributes
        attributes.name = name
        attributes.id = @snippetIdCounter++
        if typeof body is 'string'
          unparsedSnippetsByPrefix[prefix] = attributes
        else if not body?
          unparsedSnippetsByPrefix[prefix] = null

      @storeUnparsedSnippets(unparsedSnippetsByPrefix, filePath, selector)
    return

  getScopeChain: (object) ->
    scopesArray = object?.getScopesArray?()
    scopesArray ?= object
    scopesArray
      .map (scope) ->
        scope = ".#{scope}" unless scope[0] is '.'
        scope
      .join(' ')

  storeUnparsedSnippets: (value, path, selector) ->
    unparsedSnippets = {}
    unparsedSnippets[selector] = {"snippets": value}
    @scopedPropertyStore.addProperties(path, unparsedSnippets, priority: @priorityForSource(path))

  clearSnippetsForPath: (path) ->
    for scopeSelector of @scopedPropertyStore.propertiesForSource(path)
      for prefix, attributes of @scopedPropertyStore.propertiesForSourceAndSelector(path, scopeSelector)
        @parsedSnippetsById.delete(attributes.id)

      @scopedPropertyStore.removePropertiesForSourceAndSelector(path, scopeSelector)
    return

  parsedSnippetsForScopes: (scopeDescriptor) ->
    unparsedSnippetsByPrefix = @scopedPropertyStore.getPropertyValue(@getScopeChain(scopeDescriptor), "snippets")
    unparsedSnippetsByPrefix ?= {}
    snippets = {}
    for prefix, attributes of unparsedSnippetsByPrefix
      continue if typeof attributes?.body isnt 'string'

      {id, name, body, bodyTree, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML} = attributes

      unless @parsedSnippetsById.has(id)
        bodyTree ?= @getBodyParser().parse(body)
        snippet = new Snippet({id, name, prefix, bodyTree, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, bodyText: body})
        @parsedSnippetsById.set(id, snippet)

      snippets[prefix] = @parsedSnippetsById.get(id)
    snippets

  priorityForSource: (source) ->
    if source is @getUserSnippetsPath()
      1000
    else
      0

  getBodyParser: ->
    @bodyParser ?= require './snippet-body-parser'

  # Get an {Object} with these keys:
  # * `snippetPrefix`: the possible snippet prefix text preceding the cursor
  # * `wordPrefix`: the word preceding the cursor
  #
  # Returns `null` if the values aren't the same for all cursors
  getPrefixText: (snippets, editor) ->
    wordRegex = @wordRegexForSnippets(snippets)
    [snippetPrefix, wordPrefix] = []

    for cursor in editor.getCursors()
      position = cursor.getBufferPosition()

      prefixStart = cursor.getBeginningOfCurrentWordBufferPosition({wordRegex})
      cursorSnippetPrefix = editor.getTextInRange([prefixStart, position])
      return null if snippetPrefix? and cursorSnippetPrefix isnt snippetPrefix
      snippetPrefix = cursorSnippetPrefix

      wordStart = cursor.getBeginningOfCurrentWordBufferPosition()
      cursorWordPrefix = editor.getTextInRange([wordStart, position])
      return null if wordPrefix? and cursorWordPrefix isnt wordPrefix
      wordPrefix = cursorWordPrefix

    {snippetPrefix, wordPrefix}

  # Get a RegExp of all the characters used in the snippet prefixes
  wordRegexForSnippets: (snippets) ->
    prefixes = {}

    for prefix of snippets
      prefixes[character] = true for character in prefix

    prefixCharacters = Object.keys(prefixes).join('')
    new RegExp("[#{_.escapeRegExp(prefixCharacters)}]+")

  # Get the best match snippet for the given prefix text.  This will return
  # the longest match where there is no exact match to the prefix text.
  snippetForPrefix: (snippets, prefix, wordPrefix) ->
    longestPrefixMatch = null

    for snippetPrefix, snippet of snippets
      if prefix.endsWith(snippetPrefix) and wordPrefix.length <= snippetPrefix.length
        if not longestPrefixMatch? or snippetPrefix.length > longestPrefixMatch.prefix.length
          longestPrefixMatch = snippet

    longestPrefixMatch

  getSnippets: (editor) ->
    @parsedSnippetsForScopes(editor.getLastCursor().getScopeDescriptor())

  snippetToExpandUnderCursor: (editor) ->
    return false unless editor.getLastSelection().isEmpty()
    snippets = @getSnippets(editor)
    return false if _.isEmpty(snippets)

    if prefixData = @getPrefixText(snippets, editor)
      @snippetForPrefix(snippets, prefixData.snippetPrefix, prefixData.wordPrefix)

  expandSnippetsUnderCursors: (editor) ->
    return false unless snippet = @snippetToExpandUnderCursor(editor)

    @getStore(editor).observeHistory({
      undo: (event) =>
        @onUndoOrRedo(editor, event, true)
      redo: (event) =>
        @onUndoOrRedo(editor, event, false)
    })

    editor.transact =>
      cursors = editor.getCursors()
      for cursor in cursors
        cursorPosition = cursor.getBufferPosition()
        startPoint = cursorPosition.translate([0, -snippet.prefix.length], [0, 0])
        cursor.selection.setBufferRange([startPoint, cursorPosition])
        @insert(snippet, editor, cursor)
      return
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

  getStore: (editor) ->
    EditorStore.findOrCreate(editor)

  getExpansions: (editor) ->
    @getStore(editor).getExpansions()

  clearExpansions: (editor) ->
    store = @getStore(editor)
    store.clearExpansions()
    # There are no more active instances of this expansion, so we should undo
    # the spying we set up on this editor.
    store.stopObserving()
    store.stopObservingHistory()

  addExpansion: (editor, snippetExpansion) ->
    @getStore(editor).addExpansion(snippetExpansion)

  textChanged: (editor, event) ->
    store = @getStore(editor)
    activeExpansions = store.getExpansions()

    return if activeExpansions.length is 0 or activeExpansions[0].isIgnoringBufferChanges

    @ignoringTextChangesForEditor editor, ->
      editor.transact ->
        for expansion in activeExpansions
          expansion.textChanged(event)

    # Create a checkpoint here to consolidate all the changes we just made into
    # the transaction that prompted them.
    @makeCheckpoint(editor)

  # Perform an action inside the editor without triggering our `textChanged`
  # callback.
  ignoringTextChangesForEditor: (editor, callback) ->
    @stopObservingEditor(editor)
    callback()
    @observeEditor(editor)

  observeEditor: (editor) ->
    @getStore(editor).observe (event) =>
      @textChanged(editor, event)

  stopObservingEditor: (editor) ->
    @getStore(editor).stopObserving()

  makeCheckpoint: (editor) ->
    @getStore(editor).makeCheckpoint()

  insert: (snippet, editor=atom.workspace.getActiveTextEditor(), cursor=editor.getLastCursor()) ->
    if typeof snippet is 'string'
      bodyTree = @getBodyParser().parse(snippet)
      snippet = new Snippet({name: '__anonymous', prefix: '', bodyTree, bodyText: snippet})
    new SnippetExpansion(snippet, editor, cursor, this)

  getUnparsedSnippets: ->
    _.deepClone(@scopedPropertyStore.propertySets)

  provideSnippets: ->
    bundledSnippetsLoaded: => @loaded
    insertSnippet: @insert.bind(this)
    snippetsForScopes: @parsedSnippetsForScopes.bind(this)
    getUnparsedSnippets: @getUnparsedSnippets.bind(this)

  onUndoOrRedo: (editor, isUndo) ->
    activeExpansions = @getExpansions(editor)
    for expansion in activeExpansions
      expansion.onUndoOrRedo(isUndo)
