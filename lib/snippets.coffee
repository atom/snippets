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
    @snippetsByPackage = new Map
    @parsedSnippetsById = new Map
    @editorMarkerLayers = new WeakMap

    @scopedPropertyStore = new ScopedPropertyStore
    # The above ScopedPropertyStore will store the main registry of snippets.
    # But we need a separate ScopedPropertyStore for the snippets that come
    # from disabled packages. They're isolated so that they're not considered
    # as candidates when the user expands a prefix, but we still need the data
    # around so that the snippets provided by those packages can be shown in
    # the settings view.
    @disabledSnippetsScopedPropertyStore = new ScopedPropertyStore

    @subscriptions = new CompositeDisposable
    @subscriptions.add atom.workspace.addOpener (uri) =>
      if uri is 'atom://.atom/snippets'
        atom.workspace.openTextFile(@getUserSnippetsPath())

    @loadAll()
    @watchUserSnippets (watchDisposable) =>
      @subscriptions.add(watchDisposable)

    @subscriptions.add atom.config.onDidChange 'core.packagesWithSnippetsDisabled', ({newValue, oldValue}) =>
      @handleDisabledPackagesDidChange(newValue, oldValue)

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

  # Called when a user's snippets file is changed, deleted, or moved so that we
  # can immediately re-process the snippets it contains.
  handleUserSnippetsDidChange: ->
    userSnippetsPath = @getUserSnippetsPath()
    atom.config.transact =>
      @clearSnippetsForPath(userSnippetsPath)
      @loadSnippetsFile userSnippetsPath, (result) =>
        @add(userSnippetsPath, result)

  # Called when the "Enable" checkbox is checked/unchecked in the Snippets
  # section of a package's settings view.
  handleDisabledPackagesDidChange: (newDisabledPackages, oldDisabledPackages) ->
    packagesToAdd = []
    packagesToRemove = []
    oldDisabledPackages ?= []
    newDisabledPackages ?= []
    for p in oldDisabledPackages
      packagesToAdd.push(p) unless newDisabledPackages.includes(p)

    for p in newDisabledPackages
      packagesToRemove.push(p) unless oldDisabledPackages.includes(p)

    atom.config.transact =>
      @removeSnippetsForPackage(p) for p in packagesToRemove
      @addSnippetsForPackage(p) for p in packagesToAdd

  addSnippetsForPackage: (packageName) ->
    snippetSet = @snippetsByPackage.get(packageName)
    for filePath, snippetsBySelector of snippetSet
      @add(filePath, snippetsBySelector)

  removeSnippetsForPackage: (packageName) ->
    snippetSet = @snippetsByPackage.get(packageName)
    for filePath, snippetsBySelector of snippetSet
      @clearSnippetsForPath(filePath)

  loadPackageSnippets: (callback) ->
    disabledPackageNames = atom.config.get('core.packagesWithSnippetsDisabled') or []
    packages = atom.packages.getLoadedPackages().sort (pack, b) ->
      if /\/app\.asar\/node_modules\//.test(pack.path) then -1 else 1

    snippetsDirPaths = (path.join(pack.path, 'snippets') for pack in packages)

    async.map snippetsDirPaths, @loadSnippetsDirectory.bind(this), (error, results) =>
      zipped = ({result: result, pack: packages[key]} for key, result of results)
      enabledPackages = []
      for o in zipped
        # Skip packages that contain no snippets.
        continue if Object.keys(o.result).length is 0
        # Keep track of which snippets come from which packages so we can
        # unload them selectively later. All packages get put into this map,
        # even disabled packages, because we need to know which snippets to add
        # if those packages are enabled again.
        @snippetsByPackage.set(o.pack.name, o.result)
        if disabledPackageNames.includes(o.pack.name)
          # Since disabled packages' snippets won't get added to the main
          # ScopedPropertyStore, we'll keep track of them in a separate
          # ScopedPropertyStore so that they can still be represented in the
          # settings view.
          @addSnippetsInDisabledPackage(o.result)
        else
          enabledPackages.push(o.result)

      callback(_.extend({}, enabledPackages...))

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
    CSON.readFile filePath, {allowDuplicateKeys: false}, (error, object={}) ->
      if error?
        console.warn "Error reading snippets file '#{filePath}': #{error.stack ? error}"
        atom.notifications.addError("Failed to load snippets from '#{filePath}'", {detail: error.message, dismissable: true})
      callback(object)

  add: (filePath, snippetsBySelector, isDisabled = false) ->
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

      @storeUnparsedSnippets(unparsedSnippetsByPrefix, filePath, selector, isDisabled)
    return

  addSnippetsInDisabledPackage: (bundle) ->
    for filePath, snippetsBySelector of bundle
      @add(filePath, snippetsBySelector, true)

  getScopeChain: (object) ->
    scopesArray = object?.getScopesArray?()
    scopesArray ?= object
    scopesArray
      .map (scope) ->
        scope = ".#{scope}" unless scope[0] is '.'
        scope
      .join(' ')

  storeUnparsedSnippets: (value, path, selector, isDisabled = false) ->
    # The `isDisabled` flag determines which scoped property store we'll use.
    # Active snippets get put into one and inactive snippets get put into
    # another. Only the first one gets consulted when we look up a snippet
    # prefix for expansion, but both stores have their contents exported when
    # the settings view asks for all available snippets.
    unparsedSnippets = {}
    unparsedSnippets[selector] = {"snippets": value}
    store = if isDisabled then @disabledSnippetsScopedPropertyStore else @scopedPropertyStore
    store.addProperties(path, unparsedSnippets, priority: @priorityForSource(path))

  clearSnippetsForPath: (path) ->
    for scopeSelector of @scopedPropertyStore.propertiesForSource(path)
      for prefix, attributes of @scopedPropertyStore.propertiesForSourceAndSelector(path, scopeSelector)
        @parsedSnippetsById.delete(attributes.id)

      @scopedPropertyStore.removePropertiesForSourceAndSelector(path, scopeSelector)
    return

  parsedSnippetsForScopes: (scopeDescriptor) ->
    unparsedSnippetsByPrefix = @scopedPropertyStore.getPropertyValue(
      @getScopeChain(scopeDescriptor),
      "snippets"
    )

    legacyScopeDescriptor = atom.config.getLegacyScopeDescriptorForNewScopeDescriptor?(scopeDescriptor)
    if legacyScopeDescriptor?
      unparsedLegacySnippetsByPrefix = @scopedPropertyStore.getPropertyValue(
        @getScopeChain(legacyScopeDescriptor),
        "snippets"
      )

    snippets = {}

    if unparsedSnippetsByPrefix?
      for prefix, attributes of unparsedSnippetsByPrefix
        continue if typeof attributes?.body isnt 'string'
        snippets[prefix] = @getParsedSnippet(attributes)

    if unparsedLegacySnippetsByPrefix?
      for prefix, attributes of unparsedLegacySnippetsByPrefix
        continue if snippets[prefix]?
        continue if typeof attributes?.body isnt 'string'
        snippets[prefix] = @getParsedSnippet(attributes)

    snippets

  getParsedSnippet: (attributes) ->
    snippet = @parsedSnippetsById.get(attributes.id)
    unless snippet?
      {id, prefix, name, body, bodyTree, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML} = attributes
      bodyTree ?= @getBodyParser().parse(body)
      snippet = new Snippet({id, name, prefix, bodyTree, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, bodyText: body})
      @parsedSnippetsById.set(attributes.id, snippet)
    snippet

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

    @findOrCreateMarkerLayer(editor)
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

  createMarkerLayer: (editor) ->
    @editorMarkerLayers.set(editor, editor.addMarkerLayer({maintainHistory: true}))

  findOrCreateMarkerLayer: (editor) ->
    layer = @editorMarkerLayers.get(editor)
    unless layer?
      layer = editor.addMarkerLayer({maintainHistory: true})
      @editorMarkerLayers.set(editor, layer)
    layer

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
    results = []
    iterate = (sets) ->
      for item in sets
        newItem = _.deepClone(item)
        # The atom-slick library has already parsed the `selector` property, so
        # it's an AST here instead of a string. The object has a `toString`
        # method that turns it back into a string. That custom behavior won't
        # be preserved in the deep clone of the object, so we have to handle it
        # separately.
        newItem.selectorString = item.selector.toString()
        results.push(newItem)

    iterate(@scopedPropertyStore.propertySets)
    iterate(@disabledSnippetsScopedPropertyStore.propertySets)
    results

  provideSnippets: ->
    bundledSnippetsLoaded: => @loaded
    insertSnippet: @insert.bind(this)
    snippetsForScopes: @parsedSnippetsForScopes.bind(this)
    getUnparsedSnippets: @getUnparsedSnippets.bind(this)

  onUndoOrRedo: (editor, isUndo) ->
    activeExpansions = @getExpansions(editor)
    for expansion in activeExpansions
      expansion.onUndoOrRedo(isUndo)
