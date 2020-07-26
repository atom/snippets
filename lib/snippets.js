const { Emitter, CompositeDisposable, File } = require('atom')

const CSON = require('season')
const path = require('path')
const peg = require('pegjs')
const fs = require('fs')

const ScopedPropertyStore = require('scoped-property-store')

const Snippet = require('./snippet')
const Variable = require('./variable')
const Tabstop = require('./tabstop')
const Choice = require('./choice')

module.exports = class Snippets {
  static async activate () {
    this.subscriptions = new CompositeDisposable()
    this.snippetsByScopes = new ScopedPropertyStore()
    this.packageDisposables = new WeakMap()

    this.loaded = false
    this.emitter = new Emitter()

    this.subscriptions.add(
      atom.workspace.addOpener(uri => uri === 'atom://.atom/snippets'
        ? atom.workspace.openTextFile(this.userSnippetsPath)
        : undefined),
      atom.commands.add('atom-text-editor', 'snippets:available', () => {
        const editor = atom.workspace.getActiveTextEditor()
        this.availableSnippetsView.toggle(editor)
      }),
      atom.packages.onDidActivatePackage(bundle => this.loadPackage(bundle)),
      atom.packages.onDidDeactivatePackage(bundle => this.unloadPackage(bundle)))

    await Promise.all([
      this.loadUserSnippets(),
      ...atom.packages.getActivePackages()
        .sort(({ path }) => /\/node_modules\//.test(path) ? -1 : 1)
        .map(bundle => this.loadPackage(bundle))
    ])

    this.loaded = true
    this.emitter.emit('did-load-snippets')
  }

  static get availableSnippetsView () {
    delete this.availableSnippetsView

    const SnippetsAvailable = require('./snippets-available')
    return (this.availableSnippetsView = new SnippetsAvailable(this))
  }

  static deactivate () {
    this.emitter.dispose()
    this.subscriptions.dispose()
  }

  static get bodyParser () {
    delete this.bodyParser
    const grammar = fs.readFileSync(path.join(module.filename, '../snippet-body-parser.pegjs'), 'utf8')
    return (this.bodyParser = peg.generate(grammar, {
      context: {
        Snippet,
        Variable,
        Tabstop,
        Choice
      }
    }))
  }

  static getUserSnippetsPath () {
    let userSnippetsPath = path.join(atom.getConfigDirPath(), 'snippets.json')
    try {
      fs.accessSync(this.userSnippetsPath)
    } catch (error) {
      userSnippetsPath = path.join(userSnippetsPath, '../snippets.cson')
    }
    return userSnippetsPath
  }

  static get userSnippetsPath () {
    delete this.userSnippetsPath

    return (this.userSnippetsPath = this.getUserSnippetsPath())
  }

  static async loadSnippetsFile (filepath) {
    const priority = filepath === this.userSnippetsPath ? 1000 : 0
    return await new Promise((resolve, reject) =>
      CSON.readFile(filepath, (error, object) => error == null
        ? resolve(this.snippetsByScopes.addProperties(filepath, object, { priority }))
        : reject(error)))
  }

  static async loadUserSnippets () {
    try {
      const userSnippetsFile = new File(this.userSnippetsPath)
      if (this.packageDisposables.has(this)) {
        this.packageDisposables.get(this).dispose()
      }
      this.packageDisposables.set(this, new CompositeDisposable(
        await this.loadSnippetsFile(this.userSnippetsPath),
        userSnippetsFile.onDidChange(() => this.loadUserSnippets()),
        userSnippetsFile.onDidDelete(() => {
          this.packageDisposables.get(this).dispose()
          this.userSnippetsPath = this.getUserSnippetsPath()
        }),
        userSnippetsFile.onDidRename(() => {
          this.packageDisposables.get(this).dispose()
          this.userSnippetsPath = this.getUserSnippetsPath()
        })))
    } catch (error) {
      console.warn(`Error loading snippets from '${this.userSnippetsPath}': ${error.stack != null ? error.stack : error}`)
      atom.notifications.addWarning(`\
        Unable to load snippets from \`${this.userSnippetsPath}\`.
        Make sure you have permissions to access the directory and file.
        `, { detail: error.message, dismissable: true })
    }
  }

  static async loadPackage (bundle) {
    const snippetsDirectory = path.join(bundle.path, 'snippets')
    try {
      const files = await fs.promises.readdir(snippetsDirectory)
      files.forEach(async file => {
        const snippetsFile = path.join(snippetsDirectory, file)
        try {
          const disposable = await this.loadSnippetsFile(snippetsFile)
          this.packageDisposables.has(bundle)
            ? this.packageDisposables.get(bundle).add(disposable)
            : this.packageDisposables.set(bundle, new CompositeDisposable(disposable))
        } catch (error) {
          console.warn(`Error loading snippets from '${snippetsFile}': ${error.stack != null ? error.stack : error}`)
          atom.notifications.addWarning(`\
            Unable to load snippets from \`${snippetsFile}\`.
            Make sure you have permissions to access the directory and file.
            `, { detail: error.message, dismissable: true })
        }
      })
    } catch (error) {
      if (error.code === 'ENOTDIR' || error.code === 'ENOENT') {
        // Path either doesn't exist, or isn't a directory
        return
      }
      console.warn(`Error reading snippets directory ${snippetsDirectory}`, error)
    }
  }

  static unloadPackage (bundle) {
    if (this.packageDisposables.has(bundle)) {
      this.packageDisposables.get(bundle).dispose()
      this.packageDisposables.delete(bundle)
    }
  }

  static onDidLoadSnippets (callback) {
    this.emitter.on('did-load-snippets', callback)
  }

  static snippets () {
    return {
      parse: string => this.bodyParser.parse(string),
      userSnippetsPath: () => this.userSnippetsPath,
      snippets: () => this.snippetsByScopes,
      loaded: () => this.loaded
    }
  }
}
