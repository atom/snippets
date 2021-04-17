const { CompositeDisposable, File } = require('atom')

const CSON = require('season')
const path = require('path')

const { promises: fs } = require('fs')

const ScopedPropertyStore = require('scoped-property-store')

const AvailableSnippetsView = require('./available-snippets-view')

const parser = require('./parser/snippet-body-parser.js')

// TODO: Convert private arrow functions into methods once atom supports them
module.exports = class Snippets {
  static #disposables = new CompositeDisposable()
  // This needs to be made available now even if we reconstruct it on activation
  // as service objects can potentially access it before that happens
  static #snippetsByScopes = new ScopedPropertyStore()
  static #snippetsByPackage = new WeakMap()

  static #userSnippetsFile
  static #userSnippetsBasename = path.join(atom.getConfigDirPath(), 'snippets')

  static #userSnippetsURI = 'atom://.atom/snippets'

  // TODO: Uncomment once atom supports private methods
  // static get #userSnippetsPath () {
  //   // See #loadUserSnippets
  //   return this.#userSnippetsFile.getPath()
  // }

  static snippets () {
    // Consider having a static frozen object and not creating a new one each
    // call, as modifying the service object is often a mistake / bad practice
    return {
      parse: string => parser.parse(string),
      // TODO: Drop 'snippets' prefix 'snippets.snippetsByScopes' is too verbose
      snippetsByScopes: () => this.#snippetsByScopes,
      snippetsByPackage: () => this.#snippetsByPackage,
      // Returns the path _currently in use_
      userSnippetsPath: () => this.#userSnippetsFile.getPath()
    }
  }

  static async activate () {
    // As there's no built-in way to be notified when package activation is
    // complete, the loading of package snippets has to be started synchronously
    // (before our activationPromise resolves) so that service consumers can
    // reliably access the generated promises.
    const promises = atom.packages.getLoadedPackages().map(pack =>
      this.#snippetsByPackage.set(pack, this.#loadPackage(pack)).get(pack))

    // The above also applies to '#userSnippetsFile' and '#userSnippetsPath'
    promises.push(this.#loadUserSnippets({ dispose: () => {} }))

    this.#disposables.add(
      atom.workspace.addOpener(uri => uri === this.#userSnippetsURI &&
        atom.workspace.open(this.#userSnippetsFile.getPath())),
      atom.packages.onDidLoadPackage(pack =>
        this.#snippetsByPackage.set(pack, this.#loadPackage(pack))),
      atom.config.observe('core.packagesWithSnippetsDisabled', packs =>
        this.#togglePackages(new Set(packs))),
      atom.commands.add('atom-text-editor', 'snippets:available', event =>
        new AvailableSnippetsView(this.snippets(), event.currentTarget.getModel())))

    await Promise.all(promises)
  }

  static deactivate () {
    this.#disposables.dispose()
  }

  static #readSnippets = async (filepath) => {
    try {
      return await new Promise((resolve, reject) =>
        CSON.readFile(filepath, (error, object) =>
          error == null ? resolve(object) : reject(error)))
    } catch (error) {
      atom.notifications.addWarning(`Unable to load snippets from: '${filepath}'`, {
        description: 'Make sure you have permissions to access the directory and file.',
        detail: error.toString(),
        stack: error.stack,
        dismissable: true
      })
      return {}
    }
  }

  // Also updates the user snippets file
  static #loadUserSnippets = async (oldSnippets, priority = 1) => {
    // Remove old user defined snippets
    oldSnippets.dispose()

    this.#userSnippetsFile = new File(`${this.#userSnippetsBasename}.json`)
    if (!(await this.#userSnippetsFile.exists())) {
      this.#userSnippetsFile = new File(`${this.#userSnippetsBasename}.cson`)
    }
    await this.#userSnippetsFile.create()
    const snippets = await this.#readSnippets(this.#userSnippetsFile.getPath())

    const disposable = new CompositeDisposable(
      this.#snippetsByScopes.addProperties(this.#userSnippetsFile.getPath(), snippets, { priority }),
      this.#userSnippetsFile.onDidChange(() => this.#loadUserSnippets(disposable)),
      this.#userSnippetsFile.onDidDelete(() => this.#loadUserSnippets(disposable)),
      this.#userSnippetsFile.onDidRename(() => this.#loadUserSnippets(disposable)),
      { dispose: () => this.#disposables.remove(disposable) })

    this.#disposables.add(disposable)
  }

  static #loadPackage = async (pack) => {
    const directory = path.join(pack.path, 'snippets')
    try {
      const files = await fs.readdir(directory)
      const snippets = files.map(file => this.#readSnippets(path.join(directory, file)))
      // Reduces the snippets into a single object
      return Object.assign(...await Promise.all(snippets))
    } catch (error) {
      if (error.code !== 'ENOTDIR' && error.code !== 'ENOENT') {
        atom.notifications.addError(`Error reading snippets directory ${directory}`, {
          description: 'Make sure you have permissions to access the directory.',
          detail: error.toString(),
          stack: error.stack,
          dismissable: true
        })
      }
      // Path either doesn't exist, or isn't a directory
      return {}
    }
  }

  static #togglePackages = (packs) => {
    // Technically we could compute and toggle only the packages that were
    // enabled / disabled, but that would result in more complex code and often
    // be slower because of how many iterations 'ScopedPropertyStore' would make
    // over its own internal data structures. Thus we just reset
    this.#snippetsByScopes = new ScopedPropertyStore()
    // (Eventually) Reconstruct the whole scoped snippet storage
    atom.packages.getLoadedPackages()
      .filter(({ name }) => !packs.has(name))
      .forEach(pack => this.#snippetsByPackage.get(pack).then(snippets =>
        this.#snippetsByScopes.addProperties(pack.path, snippets)))
  }
}
