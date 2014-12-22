path = require 'path'
fs = require 'fs-plus'
temp = require('temp').track()

describe "Snippet Loading", ->
  configDirPath = null

  beforeEach ->
    configDirPath = temp.mkdirSync('atom-config-dir-')
    spyOn(atom, 'getConfigDirPath').andReturn configDirPath

    spyOn(console, 'warn')
    spyOn(atom.notifications, 'addError') if atom.notifications?

    spyOn(atom.packages, 'getLoadedPackages').andReturn [
      atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-snippets'))
      atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-broken-snippets')),
    ]

  afterEach ->
    jasmine.unspy(atom.packages, 'getLoadedPackages')

  activateSnippetsPackage = ->
    module = null

    waitsForPromise ->
      atom.packages.activatePackage("snippets").then ({mainModule}) ->
        module = mainModule
        module.loaded = false

    waitsFor "all snippets to load", 3000, ->
      module.loaded

  it "loads the bundled snippet template snippets", ->
    activateSnippetsPackage()

    runs ->
      jsonSnippet = atom.config.get(['.source.json'], 'snippets.snip')
      expect(jsonSnippet.name).toBe 'Atom Snippet'
      expect(jsonSnippet.prefix).toBe 'snip'
      expect(jsonSnippet.body).toContain('"prefix":')
      expect(jsonSnippet.body).toContain('"body":')
      expect(jsonSnippet.tabStops.length).toBeGreaterThan(0)

      csonSnippet = atom.config.get(['.source.coffee'], 'snippets.snip')
      expect(csonSnippet.name).toBe 'Atom Snippet'
      expect(csonSnippet.prefix).toBe 'snip'
      expect(csonSnippet.body).toContain ("'prefix':")
      expect(csonSnippet.body).toContain ("'body':")
      expect(csonSnippet.tabStops.length).toBeGreaterThan(0)

  it "loads non-hidden snippet files from atom packages with snippets directories", ->
    activateSnippetsPackage()

    runs ->
      snippet = atom.config.get(['.test'], 'snippets.test')
      expect(snippet.prefix).toBe 'test'
      expect(snippet.body).toBe 'testing 123'

  it "logs a warning if package snippets files cannot be parsed", ->
    activateSnippetsPackage()

    runs ->
      # Warn about invalid-file, but don't even try to parse a hidden file
      expect(console.warn.calls.length).toBe 1
      expect(console.warn.mostRecentCall.args[0]).toMatch(/Error reading.*package-with-broken-snippets/)

  describe "when ~/.atom/snippets.json exists", ->
    beforeEach ->
      fs.writeFileSync path.join(configDirPath, 'snippets.json'), """
        {
          ".foo": {
            "foo snippet": {
              "prefix": "foo",
              "body": "bar1"
            }
          }
        }
      """
      activateSnippetsPackage()

    it "loads the snippets from that file", ->
      snippet = atom.config.get(['.foo'], 'snippets.foo')
      expect(snippet.name).toBe 'foo snippet'
      expect(snippet.prefix).toBe "foo"
      expect(snippet.body).toBe "bar1"

    describe "when that file changes", ->
      it "reloads the snippets", ->
        fs.writeFileSync path.join(configDirPath, 'snippets.json'), """
          {
            ".foo": {
              "foo snippet": {
                "prefix": "foo",
                "body": "bar2"
              }
            }
          }
        """

        waitsFor "snippets to be changed", ->
          atom.config.get(['.foo'], 'snippets.foo').body is 'bar2'

        runs ->
          fs.writeFileSync path.join(configDirPath, 'snippets.json'), ""

        waitsFor "snippets to be removed", ->
          not atom.config.get(['.foo'], 'snippets.foo')?

  describe "when ~/.atom/snippets.cson exists", ->
    beforeEach ->
      fs.writeFileSync path.join(configDirPath, 'snippets.cson'), """
        ".foo":
          "foo snippet":
            "prefix": "foo"
            "body": "bar1"
      """
      activateSnippetsPackage()

    it "loads the snippets from that file", ->
      snippet = atom.config.get(['.foo'], 'snippets.foo')
      expect(snippet.name).toBe 'foo snippet'
      expect(snippet.prefix).toBe "foo"
      expect(snippet.body).toBe "bar1"

    describe "when that file changes", ->
      it "reloads the snippets", ->
        fs.writeFileSync path.join(configDirPath, 'snippets.cson'), """
          ".foo":
            "foo snippet":
              "prefix": "foo"
              "body": "bar2"
        """

        waitsFor "snippets to be changed", ->
          atom.config.get(['.foo'], 'snippets.foo').body is 'bar2'

        runs ->
          fs.writeFileSync path.join(configDirPath, 'snippets.cson'), ""

        waitsFor "snippets to be removed", ->
          not atom.config.get(['.foo'], 'snippets.foo')?

  it "notifies the user when the user snippets file cannot be loaded", ->
    fs.writeFileSync path.join(configDirPath, 'snippets.cson'), """
      ".junk":::
    """

    activateSnippetsPackage()

    runs ->
      expect(console.warn).toHaveBeenCalled()
      expect(atom.notifications.addError).toHaveBeenCalled() if atom.notifications?
