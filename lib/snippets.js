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
  activate () {
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
    }))

    this.loadAll()
    this.watchUserSnippets(watchDisposable => {
      this.subscriptions.add(watchDisposable)
    })

    this.subscriptions.add(atom.config.onDidChange('core.packagesWithSnippetsDisabled', ({newValue, oldValue}) => {
       this.handleDisabledPackagesDidChange(newValue, oldValue)
    }))

    const snippets = this

    this.subscriptions.add(atom.commands.add('atom-text-editor', {
      'snippets:expand'(event) {
        const editor = this.getModel()
        if (snippets.snippetToExpandUnderCursor(editor)) {
          snippets.clearExpansions(editor)
          snippets.expandSnippetsUnderCursors(editor)
        } else {
          event.abortKeyBinding()
        }
      },

      'snippets:next-tab-stop'(event) {
        const editor = this.getModel()
        if (!snippets.goToNextTabStop(editor)) { event.abortKeyBinding() }
      },

      'snippets:previous-tab-stop'(event) {
        const editor = this.getModel()
        if (!snippets.goToPreviousTabStop(editor)) { event.abortKeyBinding() }
      },

      'snippets:available'(event) {
        const editor = this.getModel()
        const SnippetsAvailable = require('./snippets-available')
        if (snippets.availableSnippetsView == null) { snippets.availableSnippetsView = new SnippetsAvailable(snippets) }
        snippets.availableSnippetsView.toggle(editor)
      }
    }))
  },

  deactivate () {
    if (this.emitter != null) {
      this.emitter.dispose()
    }
    this.emitter = null
    this.editorSnippetExpansions = null
    atom.config.transact(() => this.subscriptions.dispose())
  },

  getUserSnippetsPath () {
    if (this.userSnippetsPath != null) { return this.userSnippetsPath }

    this.userSnippetsPath = CSON.resolve(path.join(atom.getConfigDirPath(), 'snippets'))
    if (this.userSnippetsPath == null) { this.userSnippetsPath = path.join(atom.getConfigDirPath(), 'snippets.cson') }
    return this.userSnippetsPath
  },

  loadAll () {
    this.loadBundledSnippets(bundledSnippets => {
      this.loadPackageSnippets(packageSnippets => {
        this.loadUserSnippets(userSnippets => {
          atom.config.transact(() => {
            for (const snippetSet of [bundledSnippets, packageSnippets, userSnippets]) {
              for (const filepath in snippetSet) {
                const snippetsBySelector = snippetSet[filepath]
                this.add(filepath, snippetsBySelector)
              }
            }
          })
          this.doneLoading()
        })
      })
    })
  },

  loadBundledSnippets (callback) {
    const bundledSnippetsPath = CSON.resolve(path.join(getPackageRoot(), 'lib', 'snippets'))
    this.loadSnippetsFile(bundledSnippetsPath, snippets => {
      const snippetsByPath = {}
      snippetsByPath[bundledSnippetsPath] = snippets
      callback(snippetsByPath)
    })
  },

  loadUserSnippets (callback) {
    const userSnippetsPath = this.getUserSnippetsPath()
    fs.stat(userSnippetsPath, (error, stat) => {
      if (stat != null && stat.isFile()) {
        this.loadSnippetsFile(userSnippetsPath, snippets => {
          const result = {}
          result[userSnippetsPath] = snippets
          callback(result)
        })
      } else {
        callback({})
      }
    })
  },

  watchUserSnippets (callback) {
    const userSnippetsPath = this.getUserSnippetsPath()
    fs.stat(userSnippetsPath, (error, stat) => {
      if (stat != null && stat.isFile()) {
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

        callback(userSnippetsFileDisposable)
      } else {
        callback(new Disposable())
      }
    })
  },

  // Called when a user's snippets file is changed, deleted, or moved so that we
  // can immediately re-process the snippets it contains.
  handleUserSnippetsDidChange () {
    const userSnippetsPath = this.getUserSnippetsPath()
    atom.config.transact(() => {
      this.clearSnippetsForPath(userSnippetsPath)
      this.loadSnippetsFile(userSnippetsPath, result => {
        this.add(userSnippetsPath, result)
      })
    })
  },

  // Called when the "Enable" checkbox is checked/unchecked in the Snippets
  // section of a package's settings view.
  handleDisabledPackagesDidChange (newDisabledPackages = [], oldDisabledPackages = []) {
    const packagesToAdd = []
    const packagesToRemove = []
    for (const p of oldDisabledPackages) {
      if (!newDisabledPackages.includes(p)) { packagesToAdd.push(p) }
    }

    for (const p of newDisabledPackages) {
      if (!oldDisabledPackages.includes(p)) { packagesToRemove.push(p) }
    }

    atom.config.transact(() => {
      for (const p of packagesToRemove) { this.removeSnippetsForPackage(p) }
      for (const p of packagesToAdd) { this.addSnippetsForPackage(p) }
    })
  },

  addSnippetsForPackage (packageName) {
    const snippetSet = this.snippetsByPackage.get(packageName)
    for (const filePath in snippetSet) {
      const snippetsBySelector = snippetSet[filePath]
      this.add(filePath, snippetsBySelector)
    }
  },

  removeSnippetsForPackage (packageName) {
    const snippetSet = this.snippetsByPackage.get(packageName)
    // Copy these snippets to the "quarantined" ScopedPropertyStore so that they
    // remain present in the list of unparsed snippets reported to the settings
    // view.
    this.addSnippetsInDisabledPackage(snippetSet)
    for (const filePath in snippetSet) {
      this.clearSnippetsForPath(filePath)
    }
  },

  loadPackageSnippets (callback) {
    const disabledPackageNames = atom.config.get('core.packagesWithSnippetsDisabled') || []
    const packages = atom.packages.getLoadedPackages().sort((pack, _) => {
      return /\/node_modules\//.test(pack.path) ? -1 : 1
    })

    const snippetsDirPaths = []
    for (const pack of packages) {
      snippetsDirPaths.push(path.join(pack.path, 'snippets'))
    }

    async.map(snippetsDirPaths, this.loadSnippetsDirectory.bind(this), (error, results) => {
      const zipped = []
      for (const key in results) {
        zipped.push({result: results[key], pack: packages[key]})
      }

      const enabledPackages = []
      for (const o of zipped) {
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

      callback(_.extend({}, ...enabledPackages))
    })
  },

  doneLoading () {
    this.loaded = true
    this.getEmitter().emit('did-load-snippets')
  },

  onDidLoadSnippets (callback) {
    this.getEmitter().on('did-load-snippets', callback)
  },

  getEmitter () {
    if (this.emitter == null) {
      this.emitter = new Emitter
    }
    return this.emitter
  },

  loadSnippetsDirectory (snippetsDirPath, callback) {
    fs.isDirectory(snippetsDirPath, isDirectory => {
      if (!isDirectory) { return callback(null, {}) }

      fs.readdir(snippetsDirPath, (error, entries) => {
        if (error) {
          console.warn(`Error reading snippets directory ${snippetsDirPath}`, error)
          return callback(null, {})
        }

        async.map(
          entries,
          (entry, done) => {
            const filePath = path.join(snippetsDirPath, entry)
            this.loadSnippetsFile(filePath, snippets => done(null, {filePath, snippets}))
          },
          (error, results) => {
            const snippetsByPath = {}
            for (const {filePath, snippets} of results) {
              snippetsByPath[filePath] = snippets
            }
            callback(null, snippetsByPath)
        })
      })
    })
  },

  loadSnippetsFile (filePath, callback) {
    if (!CSON.isObjectPath(filePath)) { return callback({}) }
    CSON.readFile(filePath, {allowDuplicateKeys: false}, (error, object = {}) => {
      if (error != null) {
        console.warn(`Error reading snippets file '${filePath}': ${error.stack != null ? error.stack : error}`)
        atom.notifications.addError(`Failed to load snippets from '${filePath}'`, {detail: error.message, dismissable: true})
      }
      callback(object)
    })
  },

  add (filePath, snippetsBySelector, isDisabled = false) {
    for (const selector in snippetsBySelector) {
      const snippetsByName = snippetsBySelector[selector]
      const unparsedSnippetsByPrefix = {}
      for (const name in snippetsByName) {
        const attributes = snippetsByName[name]
        const {prefix, body} = attributes
        attributes.name = name
        attributes.id = this.snippetIdCounter++
        if (typeof body === 'string') {
          unparsedSnippetsByPrefix[prefix] = attributes
        } else if (body == null) {
          unparsedSnippetsByPrefix[prefix] = null
        }
      }

      this.storeUnparsedSnippets(unparsedSnippetsByPrefix, filePath, selector, isDisabled)
    }
  },

  addSnippetsInDisabledPackage (bundle) {
    for (const filePath in bundle) {
      const snippetsBySelector = bundle[filePath]
      this.add(filePath, snippetsBySelector, true)
    }
  },

  getScopeChain (object) {
    let scopesArray = object
    if (object && object.getScopesArray) {
      scopesArray = object.getScopesArray()
    }

    return scopesArray
      .map(scope => scope[0] === '.' ? scope : `.${scope}`)
      .join(' ')
  },

  storeUnparsedSnippets (value, path, selector, isDisabled = false) {
    // The `isDisabled` flag determines which scoped property store we'll use.
    // Active snippets get put into one and inactive snippets get put into
    // another. Only the first one gets consulted when we look up a snippet
    // prefix for expansion, but both stores have their contents exported when
    // the settings view asks for all available snippets.
    const unparsedSnippets = {}
    unparsedSnippets[selector] = {"snippets": value}
    const store = isDisabled ? this.disabledSnippetsScopedPropertyStore : this.scopedPropertyStore
    store.addProperties(path, unparsedSnippets, {priority: this.priorityForSource(path)})
  },

  clearSnippetsForPath (path) {
    for (const scopeSelector in this.scopedPropertyStore.propertiesForSource(path)) {
      const object = this.scopedPropertyStore.propertiesForSourceAndSelector(path, scopeSelector)
      for (const prefix in object) {
        const attributes = object[prefix]
        this.parsedSnippetsById.delete(attributes.id)
      }

      this.scopedPropertyStore.removePropertiesForSourceAndSelector(path, scopeSelector)
    }
  },

  parsedSnippetsForScopes (scopeDescriptor) {
    let unparsedLegacySnippetsByPrefix

    const unparsedSnippetsByPrefix = this.scopedPropertyStore.getPropertyValue(
      this.getScopeChain(scopeDescriptor),
      "snippets"
    )

    const legacyScopeDescriptor = atom.config.getLegacyScopeDescriptorForNewScopeDescriptor
      ? atom.config.getLegacyScopeDescriptorForNewScopeDescriptor(scopeDescriptor)
      : undefined

    if (legacyScopeDescriptor) {
      unparsedLegacySnippetsByPrefix = this.scopedPropertyStore.getPropertyValue(
        this.getScopeChain(legacyScopeDescriptor),
        "snippets"
      )
    }

    const snippets = {}

    if (unparsedSnippetsByPrefix) {
      for (const prefix in unparsedSnippetsByPrefix) {
        const attributes = unparsedSnippetsByPrefix[prefix]
        if (typeof (attributes != null ? attributes.body : undefined) !== 'string') { continue }
        snippets[prefix] = this.getParsedSnippet(attributes)
      }
    }

    if (unparsedLegacySnippetsByPrefix) {
      for (const prefix in unparsedLegacySnippetsByPrefix) {
        const attributes = unparsedLegacySnippetsByPrefix[prefix]
        if (snippets[prefix]) { continue }
        if (typeof (attributes != null ? attributes.body : undefined) !== 'string') { continue }
        snippets[prefix] = this.getParsedSnippet(attributes)
      }
    }

    return snippets
  },

  getParsedSnippet (attributes) {
    let snippet = this.parsedSnippetsById.get(attributes.id)
    if (snippet == null) {
      let {id, prefix, name, body, bodyTree, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML} = attributes
      if (bodyTree == null) { bodyTree = this.getBodyParser().parse(body) }
      snippet = new Snippet({id, name, prefix, bodyTree, description, descriptionMoreURL, rightLabelHTML, leftLabel, leftLabelHTML, bodyText: body})
      this.parsedSnippetsById.set(attributes.id, snippet)
    }
    return snippet
  },

  priorityForSource (source) {
    if (source === this.getUserSnippetsPath()) {
      return 1000
    } else {
      return 0
    }
  },

  getBodyParser () {
    if (this.bodyParser == null) {
      this.bodyParser = require('./snippet-body-parser')
    }
    return this.bodyParser
  },

  // Get an {Object} with these keys:
  // * `snippetPrefix`: the possible snippet prefix text preceding the cursor
  // * `wordPrefix`: the word preceding the cursor
  //
  // Returns `null` if the values aren't the same for all cursors
  getPrefixText (snippets, editor) {
    const wordRegex = this.wordRegexForSnippets(snippets)

    let snippetPrefix = null
    let wordPrefix = null

    for (const cursor of editor.getCursors()) {
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
  wordRegexForSnippets (snippets) {
    const prefixes = {}

    for (const prefix in snippets) {
      for (const character of prefix) { prefixes[character] = true }
    }

    const prefixCharacters = Object.keys(prefixes).join('')
    return new RegExp(`[${_.escapeRegExp(prefixCharacters)}]+`)
  },

  // Get the best match snippet for the given prefix text.  This will return
  // the longest match where there is no exact match to the prefix text.
  snippetForPrefix (snippets, prefix, wordPrefix) {
    let longestPrefixMatch = null

    for (const snippetPrefix in snippets) {
      const snippet = snippets[snippetPrefix]
      if (prefix.endsWith(snippetPrefix) && (wordPrefix.length <= snippetPrefix.length)) {
        if ((longestPrefixMatch == null) || (snippetPrefix.length > longestPrefixMatch.prefix.length)) {
          longestPrefixMatch = snippet
        }
      }
    }

    return longestPrefixMatch
  },

  getSnippets (editor) {
    return this.parsedSnippetsForScopes(editor.getLastCursor().getScopeDescriptor())
  },

  snippetToExpandUnderCursor (editor) {
    if (!editor.getLastSelection().isEmpty()) { return false }
    const snippets = this.getSnippets(editor)
    if (_.isEmpty(snippets)) { return false }

    const prefixData = this.getPrefixText(snippets, editor)
    if (prefixData) {
      return this.snippetForPrefix(snippets, prefixData.snippetPrefix, prefixData.wordPrefix)
    }
  },

  expandSnippetsUnderCursors (editor) {
    const snippet = this.snippetToExpandUnderCursor(editor)
    if (!snippet) { return false }

    this.getStore(editor).observeHistory({
      undo: event => { this.onUndoOrRedo(editor, event, true) },
      redo: event => { this.onUndoOrRedo(editor, event, false) }
    })

    this.findOrCreateMarkerLayer(editor)
    editor.transact(() => {
      const cursors = editor.getCursors()
      for (const cursor of cursors) {
        const cursorPosition = cursor.getBufferPosition()
        const startPoint = cursorPosition.translate([0, -snippet.prefix.length], [0, 0])
        cursor.selection.setBufferRange([startPoint, cursorPosition])
        this.insert(snippet, editor, cursor)
      }
    })
    return true
  },

  goToNextTabStop (editor) {
    let nextTabStopVisited = false
    for (const expansion of this.getExpansions(editor)) {
      if (expansion && expansion.goToNextTabStop()) {
        nextTabStopVisited = true
      }
    }
    return nextTabStopVisited
  },

  goToPreviousTabStop (editor) {
    let previousTabStopVisited = false
    for (const expansion of this.getExpansions(editor)) {
      if (expansion && expansion.goToPreviousTabStop()) {
        previousTabStopVisited = true
      }
    }
    return previousTabStopVisited
  },

  getStore (editor) {
    return EditorStore.findOrCreate(editor)
  },

  findOrCreateMarkerLayer (editor) {
    let layer = this.editorMarkerLayers.get(editor)
    if (layer === undefined) {
      layer = editor.addMarkerLayer({maintainHistory: true})
      this.editorMarkerLayers.set(editor, layer)
    }
    return layer
  },

  getExpansions (editor) {
    return this.getStore(editor).getExpansions()
  },

  clearExpansions (editor) {
    const store = this.getStore(editor)
    store.clearExpansions()
    // There are no more active instances of this expansion, so we should undo
    // the spying we set up on this editor.
    store.stopObserving()
    store.stopObservingHistory()
  },

  addExpansion (editor, snippetExpansion) {
    this.getStore(editor).addExpansion(snippetExpansion)
  },

  textChanged (editor, event) {
    const store = this.getStore(editor)
    const activeExpansions = store.getExpansions()

    if ((activeExpansions.length === 0) || activeExpansions[0].isIgnoringBufferChanges) { return }

    this.ignoringTextChangesForEditor(editor, () =>
      editor.transact(() =>
        activeExpansions.map(expansion => expansion.textChanged(event)))
    )

    // Create a checkpoint here to consolidate all the changes we just made into
    // the transaction that prompted them.
    this.makeCheckpoint(editor)
  },

  // Perform an action inside the editor without triggering our `textChanged`
  // callback.
  ignoringTextChangesForEditor (editor, callback) {
    this.stopObservingEditor(editor)
    callback()
    this.observeEditor(editor)
  },

  observeEditor (editor) {
    this.getStore(editor).observe(event => this.textChanged(editor, event))
  },

  stopObservingEditor (editor) {
    this.getStore(editor).stopObserving()
  },

  makeCheckpoint (editor) {
    this.getStore(editor).makeCheckpoint()
  },

  insert (snippet, editor, cursor) {
    if (editor == null) { editor = atom.workspace.getActiveTextEditor() }
    if (cursor == null) { cursor = editor.getLastCursor() }
    if (typeof snippet === 'string') {
      const bodyTree = this.getBodyParser().parse(snippet)
      snippet = new Snippet({name: '__anonymous', prefix: '', bodyTree, bodyText: snippet})
    }
    return new SnippetExpansion(snippet, editor, cursor, this)
  },

  getUnparsedSnippets () {
    const results = []
    const iterate = sets => {
      for (const item of sets) {
        const newItem = _.deepClone(item)
        // The atom-slick library has already parsed the `selector` property, so
        // it's an AST here instead of a string. The object has a `toString`
        // method that turns it back into a string. That custom behavior won't
        // be preserved in the deep clone of the object, so we have to handle it
        // separately.
        newItem.selectorString = item.selector.toString()
        results.push(newItem)
      }
    }

    iterate(this.scopedPropertyStore.propertySets)
    iterate(this.disabledSnippetsScopedPropertyStore.propertySets)
    return results
  },

  provideSnippets () {
    return {
      bundledSnippetsLoaded: () => this.loaded,
      insertSnippet: this.insert.bind(this),
      snippetsForScopes: this.parsedSnippetsForScopes.bind(this),
      getUnparsedSnippets: this.getUnparsedSnippets.bind(this),
      getUserSnippetsPath: this.getUserSnippetsPath.bind(this)
    }
  },

  onUndoOrRedo (editor, isUndo) {
    const activeExpansions = this.getExpansions(editor)
    activeExpansions.forEach(expansion => expansion.onUndoOrRedo(isUndo))
  }
}
