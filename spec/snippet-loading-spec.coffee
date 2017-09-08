path = require 'path'
fs = require 'fs-plus'
temp = require('temp').track()

describe "Snippet Loading", ->
  [configDirPath, snippetsService] = []

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
    waitsForPromise ->
      Promise.resolve(atom.packages.deactivatePackages('snippets'))
    runs ->
      jasmine.unspy(atom.packages, 'getLoadedPackages')

  activateSnippetsPackage = ->
    waitsForPromise ->
      atom.packages.activatePackage("snippets").then ({mainModule}) ->
        snippetsService = mainModule.provideSnippets()
        mainModule.loaded = false

    waitsFor "all snippets to load", 3000, ->
      snippetsService.bundledSnippetsLoaded()

  it "loads the bundled snippet template snippets", ->
    activateSnippetsPackage()

    runs ->
      jsonSnippet = snippetsService.snippetsForScopes(['.source.json'])['snip']
      expect(jsonSnippet.name).toBe 'Atom Snippet'
      expect(jsonSnippet.prefix).toBe 'snip'
      expect(jsonSnippet.body).toContain '"prefix":'
      expect(jsonSnippet.body).toContain '"body":'
      expect(jsonSnippet.tabStops.length).toBeGreaterThan(0)

      csonSnippet = snippetsService.snippetsForScopes(['.source.coffee'])['snip']
      expect(csonSnippet.name).toBe 'Atom Snippet'
      expect(csonSnippet.prefix).toBe 'snip'
      expect(csonSnippet.body).toContain "'prefix':"
      expect(csonSnippet.body).toContain "'body':"
      expect(csonSnippet.tabStops.length).toBeGreaterThan(0)

  it "loads non-hidden snippet files from atom packages with snippets directories", ->
    activateSnippetsPackage()

    runs ->
      snippet = snippetsService.snippetsForScopes(['.test'])['test']
      expect(snippet.prefix).toBe 'test'
      expect(snippet.body).toBe 'testing 123'

      snippet = snippetsService.snippetsForScopes(['.test'])['testd']
      expect(snippet.prefix).toBe 'testd'
      expect(snippet.body).toBe 'testing 456'
      expect(snippet.description).toBe 'a description'
      expect(snippet.descriptionMoreURL).toBe 'http://google.com'

      snippet = snippetsService.snippetsForScopes(['.test'])['testlabelleft']
      expect(snippet.prefix).toBe 'testlabelleft'
      expect(snippet.body).toBe 'testing 456'
      expect(snippet.leftLabel).toBe 'a label'

      snippet = snippetsService.snippetsForScopes(['.test'])['testhtmllabels']
      expect(snippet.prefix).toBe 'testhtmllabels'
      expect(snippet.body).toBe 'testing 456'
      expect(snippet.leftLabelHTML).toBe '<span style=\"color:red\">Label</span>'
      expect(snippet.rightLabelHTML).toBe '<span style=\"color:white\">Label</span>'

  it "logs a warning if package snippets files cannot be parsed", ->
    activateSnippetsPackage()

    runs ->
      # Warn about invalid-file, but don't even try to parse a hidden file
      expect(console.warn.calls.length).toBe 1
      expect(console.warn.mostRecentCall.args[0]).toMatch(/Error reading.*package-with-broken-snippets/)

  describe "::loadPackageSnippets(callback)", ->
    beforeEach ->
      # simulate a list of packages where the javascript core package is returned at the end
      atom.packages.getLoadedPackages.andReturn [
        atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-snippets'))
        atom.packages.loadPackage('language-javascript')
      ]

    it "allows other packages to override core packages' snippets", ->
      waitsForPromise ->
        atom.packages.activatePackage("language-javascript")

      activateSnippetsPackage()

      runs ->
        snippet = snippetsService.snippetsForScopes(['.source.js'])['log']
        expect(snippet.body).toBe "from-a-community-package"

  describe "::onDidLoadSnippets(callback)", ->
    it "invokes listeners when all snippets are loaded", ->
      loadedCallback = null

      waitsFor "package to activate", (done) ->
        atom.packages.activatePackage("snippets").then ({mainModule}) ->
          mainModule.onDidLoadSnippets(loadedCallback = jasmine.createSpy('onDidLoadSnippets callback'))
          done()

      waitsFor "onDidLoad callback to be called", -> loadedCallback.callCount > 0

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
      snippet = null

      waitsFor ->
        snippet = snippetsService.snippetsForScopes(['.foo'])['foo']

      runs ->
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
          snippet = snippetsService.snippetsForScopes(['.foo'])['foo']
          snippet?.body is 'bar2'

        runs ->
          fs.writeFileSync path.join(configDirPath, 'snippets.json'), ""

        waitsFor "snippets to be removed", ->
          not snippetsService.snippetsForScopes(['.foo'])['foo']

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
      snippet = null

      waitsFor ->
        snippet = snippetsService.snippetsForScopes(['.foo'])['foo']

      runs ->
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
          snippet = snippetsService.snippetsForScopes(['.foo'])['foo']
          snippet?.body is 'bar2'

        runs ->
          fs.writeFileSync path.join(configDirPath, 'snippets.cson'), ""

        waitsFor "snippets to be removed", ->
          snippet = snippetsService.snippetsForScopes(['.foo'])['foo']
          not snippet?

  it "notifies the user when the user snippets file cannot be loaded", ->
    fs.writeFileSync path.join(configDirPath, 'snippets.cson'), """
      ".junk":::
    """

    activateSnippetsPackage()

    runs ->
      expect(console.warn).toHaveBeenCalled()
      expect(atom.notifications.addError).toHaveBeenCalled() if atom.notifications?
