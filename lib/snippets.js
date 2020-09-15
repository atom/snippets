const { Emitter, CompositeDisposable, File } = require('atom')

const CSON = require('season')
const path = require('path')
const fs = require('fs')

const ScopedPropertyStore = require('scoped-property-store')

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

  static get parser () {
    delete this.parser

    return (this.parser = require('./parser/snippet-body-parser.js'))
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

  static loadSnippetsFile (filepath) {
    const priority = filepath === this.userSnippetsPath ? 1000 : 0
    return new Promise((resolve, reject) =>
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
      atom.notifications.addWarning(`Unable to load snippets from: '${this.userSnippetsPath}'`, {
        description: 'Make sure you have permissions to access the directory and file.',
        detail: error.toString(),
        dismissable: true
      })
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
          atom.notifications.addWarning(`Unable to load snippets from: '${snippetsFile}'`, {
            description: 'Make sure you have permissions to access the directory and file.',
            detail: error.toString(),
            dismissable: true
          })
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
      parse: string => this.parser.parse(string),
      userSnippetsPath: () => this.userSnippetsPath,
      snippetsByScopes: () => this.snippetsByScopes,
      loaded: () => this.loaded
    }
  }
}
