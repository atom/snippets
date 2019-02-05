const path = require('path')
const {Emitter, Disposable, CompositeDisposable, File} = require('atom')
const _ = require('underscore-plus')
const async = require('async')
const CSON = require('season')
const fs = require('fs-plus')
const ScopedPropertyStore = require('scoped-property-store')

const Snippet = require('./snippet')
const SnippetExpansion = require('./snippet-expansion')
const EditorStore = require('./editor-store')
const {getPackageRoot} = require('./helpers')

module.exports = {
  activate() {
    console.log("Using local package snippets")
    this.loaded = false
    this.userSnippetsPath = null
    this.snippetIdCounter = 0
    this.snippetsByPackage = new Map
    this.parsedSnippetsById = new Map
    this.editorMarkerLayers = new WeakMap

    this.scopedPropertyStore = new ScopedPropertyStore
    // The above ScopedPropertyStore will store the main registry of snippets.
    // But we need a separate ScopedPropertyStore for the snippets that come
    // from disabled packages. They're isolated so that they're not considered
    // as candidates when the user expands a prefix, but we still need the data
    // around so that the snippets provided by those packages can be shown in
    // the settings view.
    this.disabledSnippetsScopedPropertyStore = new ScopedPropertyStore

    this.subscriptions = new CompositeDisposable
    this.subscriptions.add(atom.workspace.addOpener(uri => {
      if (uri === 'atom://.atom/snippets') {
        return atom.workspace.openTextFile(this.getUserSnippetsPath())
      }
    })
    )

    this.loadAll()
    this.watchUserSnippets(watchDisposable => {
      return this.subscriptions.add(watchDisposable)
    })

    this.subscriptions.add(atom.config.onDidChange('core.packagesWithSnippetsDisabled', ({newValue, oldValue}) => {
      return this.handleDisabledPackagesDidChange(newValue, oldValue)
    })
    )

    const snippets = this

    return this.subscriptions.add(atom.commands.add('atom-text-editor', {
      'snippets:expand'(event) {
        const editor = this.getModel()
        if (snippets.snippetToExpandUnderCursor(editor)) {
          snippets.clearExpansions(editor)
          return snippets.expandSnippetsUnderCursors(editor)
        } else {
          return event.abortKeyBinding()
        }
      },

      'snippets:next-tab-stop'(event) {
        const editor = this.getModel()
        if (!snippets.goToNextTabStop(editor)) { return event.abortKeyBinding() }
      },

      'snippets:previous-tab-stop'(event) {
        const editor = this.getModel()
        if (!snippets.goToPreviousTabStop(editor)) { return event.abortKeyBinding() }
      },

      'snippets:available'(event) {
        const editor = this.getModel()
        const SnippetsAvailable = require('./snippets-available')
        if (snippets.availableSnippetsView == null) { snippets.availableSnippetsView = new SnippetsAvailable(snippets) }
        return snippets.availableSnippetsView.toggle(editor)
      }
    }
    )
    )
  },

  deactivate() {
    if (this.emitter != null) {
      this.emitter.dispose()
    }
    this.emitter = null
    this.editorSnippetExpansions = null
    return atom.config.transact(() => this.subscriptions.dispose())
  },

  getUserSnippetsPath() {
    if (this.userSnippetsPath != null) { return this.userSnippetsPath }

    this.userSnippetsPath = CSON.resolve(path.join(atom.getConfigDirPath(), 'snippets'))
    if (this.userSnippetsPath == null) { this.userSnippetsPath = path.join(atom.getConfigDirPath(), 'snippets.cson') }
    return this.userSnippetsPath
  },

  loadAll() {
    return this.loadBundledSnippets(bundledSnippets => {
      return this.loadPackageSnippets(packageSnippets => {
        return this.loadUserSnippets(userSnippets => {
          atom.config.transact(() => {
            for (let snippetSet of [bundledSnippets, packageSnippets, userSnippets]) {
              for (let filepath in snippetSet) {
                const snippetsBySelector = snippetSet[filepath]
                this.add(filepath, snippetsBySelector)
              }
            }
          })
          return this.doneLoading()
        })
      })
    })
  },

  loadBundledSnippets(callback) {
    const bundledSnippetsPath = CSON.resolve(path.join(getPackageRoot(), 'lib', 'snippets'))
    return this.loadSnippetsFile(bundledSnippetsPath, function(snippets) {
      const snippetsByPath = {}
      snippetsByPath[bundledSnippetsPath] = snippets
      return callback(snippetsByPath)
    })
  },

  loadUserSnippets(callback) {
    const userSnippetsPath = this.getUserSnippetsPath()
    return fs.stat(userSnippetsPath, (error, stat) => {
      if ((stat != null ? stat.isFile() : undefined)) {
        return this.loadSnippetsFile(userSnippetsPath, function(snippets) {
          const result = {}
          result[userSnippetsPath] = snippets
          return callback(result)
        })
      } else {
        return callback({})
      }
    })
  },

  watchUserSnippets(callback) {
    const userSnippetsPath = this.getUserSnippetsPath()
    return fs.stat(userSnippetsPath, (error, stat) => {
      if (stat != null ? stat.isFile() : undefined) {
        const userSnippetsFileDisposable = new CompositeDisposable()
        const userSnippetsFile = new File(userSnippetsPath)
        try {
          userSnippetsFileDisposable.add(userSnippetsFile.onDidChange(() => this.handleUserSnippetsDidChange()))
          userSnippetsFileDisposable.add(userSnippetsFile.onDidDelete(() => this.handleUserSnippetsDidChange()))
          userSnippetsFileDisposable.add(userSnippetsFile.onDidRename(() => this.handleUserSnippetsDidChange()))
        } catch (e) {
          const message = `\
Unable to watch path: \`snippets.cson\`. Make sure you have permissions
to the \`~/.atom\` directory and \`${userSnippetsPath}\`.

On linux there are currently problems with watch sizes. See
[this document][watches] for more info.
[watches]:https://github.com/atom/atom/blob/master/docs/build-instructions/linux.md#typeerror-unable-to-watch-path\
`
          atom.notifications.addError(message, {dismissable: true})
        }

        return callback(userSnippetsFileDisposable)
      } else {
        return callback(new Disposable(function() {}) )
      }
    })
  },

  // Called when a user's snippets file is changed, deleted, or moved so that we
  // can immediately re-process the snippets it contains.
  handleUserSnippetsDidChange() {
    const userSnippetsPath = this.getUserSnippetsPath()
    return atom.config.transact(() => {
      this.clearSnippetsForPath(userSnippetsPath)
      return this.loadSnippetsFile(userSnippetsPath, result => {
        return this.add(userSnippetsPath, result)
      })
    })
  },

  // Called when the "Enable" checkbox is checked/unchecked in the Snippets
  // section of a package's settings view.
  handleDisabledPackagesDidChange(newDisabledPackages, oldDisabledPackages) {
    let p
    const packagesToAdd = []
    const packagesToRemove = []
    if (oldDisabledPackages == null) { oldDisabledPackages = [] }
    if (newDisabledPackages == null) { newDisabledPackages = [] }
    for (p of Array.from(oldDisabledPackages)) {
      if (!newDisabledPackages.includes(p)) { packagesToAdd.push(p) }
    }

    for (p of Array.from(newDisabledPackages)) {
      if (!oldDisabledPackages.includes(p)) { packagesToRemove.push(p) }
    }

    return atom.config.transact(() => {
      for (p of Array.from(packagesToRemove)) { this.removeSnippetsForPackage(p) }
      return (() => {
        const result = []
        for (p of Array.from(packagesToAdd)) {           result.push(this.addSnippetsForPackage(p))
        }
        return result
      })()
    })
  },

  addSnippetsForPackage(packageName) {
    const snippetSet = this.snippetsByPackage.get(packageName)
    return (() => {
      const result = []
      for (let filePath in snippetSet) {
        const snippetsBySelector = snippetSet[filePath]
        result.push(this.add(filePath, snippetsBySelector))
      }
      return result
    })()
  },

  removeSnippetsForPackage(packageName) {
    const snippetSet = this.snippetsByPackage.get(packageName)
    // Copy these snippets to the "quarantined" ScopedPropertyStore so that they
    // remain present in the list of unparsed snippets reported to the settings
    // view.
    this.addSnippetsInDisabledPackage(snippetSet)
    return (() => {
      const result = []
      for (let filePath in snippetSet) {
        const snippetsBySelector = snippetSet[filePath]
        result.push(this.clearSnippetsForPath(filePath))
      }
      return result
    })()
  },

  loadPackageSnippets(callback) {
    let pack
    const disabledPackageNames = atom.config.get('core.packagesWithSnippetsDisabled') || []
    const packages = atom.packages.getLoadedPackages().sort(function(pack, b) {
      if (/\/app\.asar\/node_modules\//.test(pack.path)) { return -1 } else { return 1 }
    })

    const snippetsDirPaths = ((() => {
      const result = []
      for (pack of Array.from(packages)) {         result.push(path.join(pack.path, 'snippets'))
      }
      return result
    })())

    return async.map(snippetsDirPaths, this.loadSnippetsDirectory.bind(this), (error, results) => {
      let result
      const zipped = ((() => {
        const result1 = []
        for (let key in results) {
          result = results[key]
          result1.push({result, pack: packages[key]})
        }
        return result1
      })())
      const enabledPackages = []
      for (let o of Array.from(zipped)) {
        // Skip packages that contain no snippets.
        if (Object.keys(o.result).length === 0) { continue }
        // Keep track of which snippets come from which packages so we can
        // unload them selectively later. All packages get put into this map,
        // even disabled packages, because we need to know which snippets to add
        // if those packages are enabled again.
        this.snippetsByPackage.set(o.pack.name, o.result)
        if (disabledPackageNames.includes(o.pack.name)) {
          // Since disabled packages' snippets won't get added to the main
          // ScopedPropertyStore, we'll keep track of them in a separate
          // ScopedPropertyStore so that they can still be represented in the
          // settings view.
          this.addSnippetsInDisabledPackage(o.result)
        } else {
          enabledPackages.push(o.result)
        }
      }

      return callback(_.extend({}, ...Array.from(enabledPackages)))
    })
  },

  doneLoading() {
    this.loaded = true
    return this.getEmitter().emit('did-load-snippets')
  },

  onDidLoadSnippets(callback) {
    return this.getEmitter().on('did-load-snippets', callback)
  },

  getEmitter() {
    return this.emitter != null ? this.emitter : (this.emitter = new Emitter)
  },

  loadSnippetsDirectory(snippetsDirPath, callback) {
    return fs.isDirectory(snippetsDirPath, isDirectory => {
      if (!isDirectory) { return callback(null, {}) }

      return fs.readdir(snippetsDirPath, (error, entries) => {
        if (error) {
          console.warn(`Error reading snippets directory ${snippetsDirPath}`, error)
          return callback(null, {})
        }

        return async.map(
          entries,
          (entry, done) => {
            const filePath = path.join(snippetsDirPath, entry)
            return this.loadSnippetsFile(filePath, snippets => done(null, {filePath, snippets}))
          },
          function(error, results) {
            const snippetsByPath = {}
            for (let {filePath, snippets} of Array.from(results)) {
              snippetsByPath[filePath] = snippets
            }
            return callback(null, snippetsByPath)
        })
      })
    })
  },

  loadSnippetsFile(filePath, callback) {
    if (!CSON.isObjectPath(filePath)) { return callback({}) }
    return CSON.readFile(filePath, {allowDuplicateKeys: false}, function(error, object) {
      if (object == null) { object = {} }
      if (error != null) {
        console.warn(`Error reading snippets file '${filePath}': ${error.stack != null ? error.stack : error}`)
        atom.notifications.addError(`Failed to load snippets from '${filePath}'`, {detail: error.message, dismissable: true})
      }
      return callback(object)
    })
  },

  add(filePath, snippetsBySelector, isDisabled) {
    if (isDisabled == null) { isDisabled = false }
    for (let selector in snippetsBySelector) {
      const snippetsByName = snippetsBySelector[selector]
      const unparsedSnippetsByPrefix = {}
      for (let name in snippetsByName) {
        const attributes = snippetsByName[name]
        const {prefix, body} = attributes
        attributes.name = name
        attributes.id = this.snippetIdCounter++
        if (typeof body === 'string') {
          unparsedSnippetsByPrefix[prefix] = attributes
        } else if ((body == null)) {
          unparsedSnippetsByPrefix[prefix] = null
        }
      }

      this.storeUnparsedSnippets(unparsedSnippetsByPrefix, filePath, selector, isDisabled)
    }
  },

  addSnippetsInDisabledPackage(bundle) {
    return (() => {
      const result = []
      for (let filePath in bundle) {
        const snippetsBySelector = bundle[filePath]
        result.push(this.add(filePath, snippetsBySelector, true))
      }
      return result
    })()
  },

  getScopeChain(object) {
    let scopesArray = __guardMethod__(object, 'getScopesArray', o => o.getScopesArray())
    if (scopesArray == null) { scopesArray = object }
    return scopesArray
      .map(function(scope) {
        if (scope[0] !== '.') { scope = `.${scope}` }
        return scope}).join(' ')
  },

  storeUnparsedSnippets(value, path, selector, isDisabled) {
    // The `isDisabled` flag determines which scoped property store we'll use.
    // Active snippets get put into one and inactive snippets get put into
    // another. Only the first one gets consulted when we look up a snippet
    // prefix for expansion, but both stores have their contents exported when
    // the settings view asks for all available snippets.
    if (isDisabled == null) { isDisabled = false }
    const unparsedSnippets = {}
    unparsedSnippets[selector] = {"snippets": value}
    const store = isDisabled ? this.disabledSnippetsScopedPropertyStore : this.scopedPropertyStore
    return store.addProperties(path, unparsedSnippets, {priority: this.priorityForSource(path)})
  },

  clearSnippetsForPath(path) {
    for (let scopeSelector in this.scopedPropertyStore.propertiesForSource(path)) {
      const object = this.scopedPropertyStore.propertiesForSourceAndSelector(path, scopeSelector)
      for (let prefix in object) {
        const attributes = object[prefix]
        this.parsedSnippetsById.delete(attributes.id)
      }

      this.scopedPropertyStore.removePropertiesForSourceAndSelector(path, scopeSelector)
    }
  },

  parsedSnippetsForScopes(scopeDescriptor) {
    let attributes, prefix, unparsedLegacySnippetsByPrefix
    const unparsedSnippetsByPrefix = this.scopedPropertyStore.getPropertyValue(
      this.getScopeChain(scopeDescriptor),
      "snippets"
    )

    const legacyScopeDescriptor = typeof atom.config.getLegacyScopeDescriptorForNewScopeDescriptor === 'function' ? atom.config.getLegacyScopeDescriptorForNewScopeDescriptor(scopeDescriptor) : undefined
    if (legacyScopeDescriptor != null) {
      unparsedLegacySnippetsByPrefix = this.scopedPropertyStore.getPropertyValue(
        this.getScopeChain(legacyScopeDescriptor),
        "snippets"
      )
    }

    const snippets = {}

    if (unparsedSnippetsByPrefix != null) {
      for (prefix in unparsedSnippetsByPrefix) {
        attributes = unparsedSnippetsByPrefix[prefix]
        if (typeof (attributes != null ? attributes.body : undefined) !== 'string') { continue }
        snippets[prefix] = this.getParsedSnippet(attributes)
      }
    }

    if (unparsedLegacySnippetsByPrefix != null) {
      for (prefix in unparsedLegacySnippetsByPrefix) {
        attributes = unparsedLegacySnippetsByPrefix[prefix]
        if (snippets[prefix] != null) { continue }
        if (typeof (attributes != null ? attributes.body : undefined) !== 'string') { continue }
        snippets[prefix] = this.getParsedSnippet(attributes)
      }
    }

    return snippets
  },

  getParsedSnippet(attributes) {
    let snippet = this.parsedSnippetsById.get(attributes.id)
    if (snippet == null) {
      let {id, prefix, name, body, bodyTree, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML} = attributes
      if (bodyTree == null) { bodyTree = this.getBodyParser().parse(body) }
      snippet = new Snippet({id, name, prefix, bodyTree, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, bodyText: body})
      this.parsedSnippetsById.set(attributes.id, snippet)
    }
    return snippet
  },

  priorityForSource(source) {
    if (source === this.getUserSnippetsPath()) {
      return 1000
    } else {
      return 0
    }
  },

  getBodyParser() {
    return this.bodyParser != null ? this.bodyParser : (this.bodyParser = require('./snippet-body-parser'))
  },

  // Get an {Object} with these keys:
  // * `snippetPrefix`: the possible snippet prefix text preceding the cursor
  // * `wordPrefix`: the word preceding the cursor
  //
  // Returns `null` if the values aren't the same for all cursors
  getPrefixText(snippets, editor) {
    const wordRegex = this.wordRegexForSnippets(snippets)
    let [snippetPrefix, wordPrefix] = Array.from([])

    for (let cursor of Array.from(editor.getCursors())) {
      const position = cursor.getBufferPosition()

      const prefixStart = cursor.getBeginningOfCurrentWordBufferPosition({wordRegex})
      const cursorSnippetPrefix = editor.getTextInRange([prefixStart, position])
      if ((snippetPrefix != null) && (cursorSnippetPrefix !== snippetPrefix)) { return null }
      snippetPrefix = cursorSnippetPrefix

      const wordStart = cursor.getBeginningOfCurrentWordBufferPosition()
      const cursorWordPrefix = editor.getTextInRange([wordStart, position])
      if ((wordPrefix != null) && (cursorWordPrefix !== wordPrefix)) { return null }
      wordPrefix = cursorWordPrefix
    }

    return {snippetPrefix, wordPrefix}
  },

  // Get a RegExp of all the characters used in the snippet prefixes
  wordRegexForSnippets(snippets) {
    const prefixes = {}

    for (let prefix in snippets) {
      for (let character of Array.from(prefix)) { prefixes[character] = true }
    }

    const prefixCharacters = Object.keys(prefixes).join('')
    return new RegExp(`[${_.escapeRegExp(prefixCharacters)}]+`)
  },

  // Get the best match snippet for the given prefix text.  This will return
  // the longest match where there is no exact match to the prefix text.
  snippetForPrefix(snippets, prefix, wordPrefix) {
    let longestPrefixMatch = null

    for (let snippetPrefix in snippets) {
      const snippet = snippets[snippetPrefix]
      if (prefix.endsWith(snippetPrefix) && (wordPrefix.length <= snippetPrefix.length)) {
        if ((longestPrefixMatch == null) || (snippetPrefix.length > longestPrefixMatch.prefix.length)) {
          longestPrefixMatch = snippet
        }
      }
    }

    return longestPrefixMatch
  },

  getSnippets(editor) {
    return this.parsedSnippetsForScopes(editor.getLastCursor().getScopeDescriptor())
  },

  snippetToExpandUnderCursor(editor) {
    let prefixData
    if (!editor.getLastSelection().isEmpty()) { return false }
    const snippets = this.getSnippets(editor)
    if (_.isEmpty(snippets)) { return false }

    if (prefixData = this.getPrefixText(snippets, editor)) {
      return this.snippetForPrefix(snippets, prefixData.snippetPrefix, prefixData.wordPrefix)
    }
  },

  expandSnippetsUnderCursors(editor) {
    let snippet
    if (!(snippet = this.snippetToExpandUnderCursor(editor))) { return false }

    this.getStore(editor).observeHistory({
      undo: event => {
        return this.onUndoOrRedo(editor, event, true)
      },
      redo: event => {
        return this.onUndoOrRedo(editor, event, false)
      }
    })

    this.findOrCreateMarkerLayer(editor)
    editor.transact(() => {
      const cursors = editor.getCursors()
      for (let cursor of Array.from(cursors)) {
        const cursorPosition = cursor.getBufferPosition()
        const startPoint = cursorPosition.translate([0, -snippet.prefix.length], [0, 0])
        cursor.selection.setBufferRange([startPoint, cursorPosition])
        this.insert(snippet, editor, cursor)
      }
    })
    return true
  },

  goToNextTabStop(editor) {
    let nextTabStopVisited = false
    for (let expansion of Array.from(this.getExpansions(editor))) {
      if (expansion != null ? expansion.goToNextTabStop() : undefined) {
        nextTabStopVisited = true
      }
    }
    return nextTabStopVisited
  },

  goToPreviousTabStop(editor) {
    let previousTabStopVisited = false
    for (let expansion of Array.from(this.getExpansions(editor))) {
      if (expansion != null ? expansion.goToPreviousTabStop() : undefined) {
        previousTabStopVisited = true
      }
    }
    return previousTabStopVisited
  },

  getStore(editor) {
    return EditorStore.findOrCreate(editor)
  },

  createMarkerLayer(editor) {
    return this.editorMarkerLayers.set(editor, editor.addMarkerLayer({maintainHistory: true}))
  },

  findOrCreateMarkerLayer(editor) {
    let layer = this.editorMarkerLayers.get(editor)
    if (layer == null) {
      layer = editor.addMarkerLayer({maintainHistory: true})
      this.editorMarkerLayers.set(editor, layer)
    }
    return layer
  },

  getExpansions(editor) {
    return this.getStore(editor).getExpansions()
  },

  clearExpansions(editor) {
    const store = this.getStore(editor)
    store.clearExpansions()
    // There are no more active instances of this expansion, so we should undo
    // the spying we set up on this editor.
    store.stopObserving()
    return store.stopObservingHistory()
  },

  addExpansion(editor, snippetExpansion) {
    return this.getStore(editor).addExpansion(snippetExpansion)
  },

  textChanged(editor, event) {
    const store = this.getStore(editor)
    const activeExpansions = store.getExpansions()

    if ((activeExpansions.length === 0) || activeExpansions[0].isIgnoringBufferChanges) { return }

    this.ignoringTextChangesForEditor(editor, () =>
      editor.transact(() =>
        Array.from(activeExpansions).map((expansion) =>
          expansion.textChanged(event))
      )
    )

    // Create a checkpoint here to consolidate all the changes we just made into
    // the transaction that prompted them.
    return this.makeCheckpoint(editor)
  },

  // Perform an action inside the editor without triggering our `textChanged`
  // callback.
  ignoringTextChangesForEditor(editor, callback) {
    this.stopObservingEditor(editor)
    callback()
    return this.observeEditor(editor)
  },

  observeEditor(editor) {
    return this.getStore(editor).observe(event => {
      return this.textChanged(editor, event)
    })
  },

  stopObservingEditor(editor) {
    return this.getStore(editor).stopObserving()
  },

  makeCheckpoint(editor) {
    return this.getStore(editor).makeCheckpoint()
  },

  insert(snippet, editor, cursor) {
    if (editor == null) { editor = atom.workspace.getActiveTextEditor() }
    if (cursor == null) { cursor = editor.getLastCursor() }
    if (typeof snippet === 'string') {
      const bodyTree = this.getBodyParser().parse(snippet)
      snippet = new Snippet({name: '__anonymous', prefix: '', bodyTree, bodyText: snippet})
    }
    return new SnippetExpansion(snippet, editor, cursor, this)
  },

  getUnparsedSnippets() {
    const results = []
    const iterate = sets =>
      (() => {
        const result = []
        for (let item of Array.from(sets)) {
          const newItem = _.deepClone(item)
          // The atom-slick library has already parsed the `selector` property, so
          // it's an AST here instead of a string. The object has a `toString`
          // method that turns it back into a string. That custom behavior won't
          // be preserved in the deep clone of the object, so we have to handle it
          // separately.
          newItem.selectorString = item.selector.toString()
          result.push(results.push(newItem))
        }
        return result
      })()


    iterate(this.scopedPropertyStore.propertySets)
    iterate(this.disabledSnippetsScopedPropertyStore.propertySets)
    return results
  },

  provideSnippets() {
    return {
      bundledSnippetsLoaded: () => this.loaded,
      insertSnippet: this.insert.bind(this),
      snippetsForScopes: this.parsedSnippetsForScopes.bind(this),
      getUnparsedSnippets: this.getUnparsedSnippets.bind(this),
      getUserSnippetsPath: this.getUserSnippetsPath.bind(this)
    }
  },

  onUndoOrRedo(editor, isUndo) {
    const activeExpansions = this.getExpansions(editor)
    return Array.from(activeExpansions).map((expansion) =>
      expansion.onUndoOrRedo(isUndo))
  }
}

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName)
  } else {
    return undefined
  }
}