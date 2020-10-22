const { CompositeDisposable, File } = require('atom')

const season = require('season')
const path = require('path')
const fs = require('fs')

const ScopedPropertyStore = require('scoped-property-store')

const parser = require('./parser/snippet-body-parser.js')

module.exports = class Snippets {
  static async activate () {
    this.disposables = new CompositeDisposable()
    this.snippetsByScopes = new ScopedPropertyStore()
    this.packageDisposables = new WeakMap()

    this.disposables.add(
      { dispose: () => delete this.loaded },
      atom.workspace.addOpener(uri => uri === 'atom://.atom/snippets'
        ? atom.workspace.openTextFile(this.userSnippetsPath)
        : undefined),
      atom.commands.add('atom-text-editor', 'snippets:available', () =>
        this.availableSnippetsView.toggle(atom.workspace.getActiveTextEditor())),
      atom.packages.onDidActivatePackage(pack => this.loadPackage(pack)),
      atom.packages.onDidDeactivatePackage(pack => this.unloadPackage(pack)))

    await (this.loaded = Promise.all([
      this.loadUserSnippets(),
      ...atom.packages.getActivePackages().map(pack => this.loadPackage(pack))
    ]).then(() => true))
  }

  static get availableSnippetsView () {
    delete this.availableSnippetsView

    const SnippetsAvailable = require('./snippets-available')
    return (this.availableSnippetsView = new SnippetsAvailable(this))
  }

  static get userSnippetsPath () {
    let userSnippetsPath = path.join(atom.getConfigDirPath(), 'snippets.json')
    try {
      fs.accessSync(this.userSnippetsPath)
    } catch (error) {
      userSnippetsPath = path.join(userSnippetsPath, '../snippets.cson')
    }
    return userSnippetsPath
  }

  static loadSnippetsFile (filepath) {
    const priority = filepath === this.userSnippetsPath ? 1000 : 0
    return new Promise((resolve, reject) =>
      season.readFile(filepath, (error, object) => error == null
        ? resolve(this.snippetsByScopes.addProperties(filepath, object, { priority }))
        : reject(error)))
  }

  static async loadUserSnippets () {
    const userSnippetsPath = this.userSnippetsPath
    try {
      const userSnippetsFile = new File(userSnippetsPath)
      // Allow user defined snippets to be reloaded
      this.unloadPackage(this)
      this.packageDisposables.set(this, new CompositeDisposable(
        await this.loadSnippetsFile(userSnippetsPath),
        userSnippetsFile.onDidChange(() => this.loadUserSnippets()),
        userSnippetsFile.onDidDelete(() => this.loadUserSnippets()),
        userSnippetsFile.onDidRename(() => this.loadUserSnippets())))
    } catch (error) {
      atom.notifications.addWarning(`Unable to load snippets from: '${userSnippetsPath}'`, {
        description: 'Make sure you have permissions to access the directory and file.',
        detail: error.toString(),
        dismissable: true
      })
    }
  }

  static async loadPackage (pack) {
    const snippetsDirectory = path.join(pack.path, 'snippets')
    try {
      const files = await fs.promises.readdir(snippetsDirectory)
      files.forEach(async file => {
        const snippetsFile = path.join(snippetsDirectory, file)
        try {
          const disposable = await this.loadSnippetsFile(snippetsFile)
          this.packageDisposables.has(pack)
            ? this.packageDisposables.get(pack).add(disposable)
            : this.packageDisposables.set(pack, new CompositeDisposable(disposable))
        } catch (error) {
          atom.notifications.addWarning(`Unable to load snippets from: '${snippetsFile}'`, {
            description: 'Make sure you have permissions to access the directory and file.',
            detail: error.toString(),
            dismissable: true
          })
        }
      })
    } catch (error) {
      if (error.code !== 'ENOTDIR' && error.code !== 'ENOENT') {
        atom.notifications.addError(`Error reading snippets directory ${snippetsDirectory}`, {
          description: 'Make sure you have permissions to access the directory and file.',
          detail: error.toString(),
          stack: error.stack,
          dismissable: true
        })
      }
      // Path either doesn't exist, or isn't a directory
    }
  }

  static unloadPackage (pack) {
    if (this.packageDisposables.has(pack)) {
      this.packageDisposables.get(pack).dispose()
      this.packageDisposables.delete(pack)
    }
  }

  static snippets () {
    return {
      parse: string => parser.parse(string),
      userSnippetsPath: () => this.userSnippetsPath,
      snippetsByScopes: () => this.snippetsByScopes,
      loaded: () => this.loaded || Promise.resolve(false)
    }
  }

  static get deactivate () {
    return this.disposables.dispose
  }
}
