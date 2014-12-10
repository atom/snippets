path = require 'path'

fs = require 'fs-plus'
temp = require('temp').track()

Snippet = require '../lib/snippet'
Snippets = require '../lib/snippets'
SnippetsAvailable = require '../lib/snippets-available'

describe "Snippets extension", ->
  [buffer, editorElement, editor, snippets] = []

  simulateTabKeyEvent = ({shiftKey}={}) ->
    event = keydownEvent('tab', {shiftKey, target: editorElement})
    atom.keymaps.handleKeyboardEvent(event.originalEvent)

  beforeEach ->
    spyOn(Snippets, 'loadAll')

    waitsForPromise ->
      atom.workspace.open('sample.js')

    waitsForPromise ->
      atom.packages.activatePackage('language-javascript')

    waitsForPromise ->
      atom.packages.activatePackage("snippets").then ({mainModule}) ->
        snippets = mainModule

    runs ->
      editor = atom.workspace.getActiveTextEditor()
      editorElement = atom.views.getView(editor)
      buffer = editor.getBuffer()

  describe "when 'tab' is triggered on the editor", ->
    beforeEach ->
      snippets.add __filename,
        ".source.js":
          "without tab stops":
            prefix: "t1"
            body: "this is a test"

          "overlapping prefix":
            prefix: "tt1"
            body: "this is another test"

          "special chars":
            prefix: "@unique"
            body: "@unique see"

          "tab stops":
            prefix: "t2"
            body: """
              go here next:($2) and finally go here:($0)
              go here first:($1)

            """

          "indented second line":
            prefix: "t3"
            body: """
              line 1
              \tline 2$1

            """

          "nested tab stops":
            prefix: "t5"
            body: '${1:"${2:key}"}: ${3:value}'

          "caused problems with undo":
            prefix: "t6"
            body: """
              first line$1
                ${2:placeholder ending second line}
            """

          "contains empty lines":
            prefix: "t7"
            body: """
              first line $1


              fourth line after blanks $2
            """
          "with/without placeholder":
            prefix: "t8"
            body: """
              with placeholder ${1:test}
              without placeholder ${2}
            """

          "multi-caret":
            prefix: "t9"
            body: """
              with placeholder ${1:test}
              without placeholder $1
            """

          "large indices":
            prefix: "t10"
            body: """
              hello${10} ${11:large} indices${1}
            """

          "no body":
            prefix: "bad1"

          "number body":
            prefix: "bad2"
            body: 100

          "many tabstops":
            prefix: "t11"
            body: """
              $0one${1} ${2:two} three${3}
            """

    describe "when the snippet body is invalid or missing", ->
      it "does not register the snippet", ->
        editor.setText('')
        editor.insertText('bad1')
        atom.commands.dispatch editorElement, 'snippets:expand'
        expect(buffer.getText()).toBe 'bad1'

        editor.setText('')
        editor.setText('bad2')
        atom.commands.dispatch editorElement, 'snippets:expand'
        expect(buffer.getText()).toBe 'bad2'

    describe "when the letters preceding the cursor trigger a snippet", ->
      describe "when the snippet contains no tab stops", ->
        it "replaces the prefix with the snippet text and places the cursor at its end", ->
          editor.insertText("t1")
          expect(editor.getCursorScreenPosition()).toEqual [0, 2]

          simulateTabKeyEvent()
          expect(buffer.lineForRow(0)).toBe "this is a testvar quicksort = function () {"
          expect(editor.getCursorScreenPosition()).toEqual [0, 14]

        it "inserts a real tab the next time a tab is pressed after the snippet is expanded", ->
          editor.insertText("t1")
          simulateTabKeyEvent()
          expect(buffer.lineForRow(0)).toBe "this is a testvar quicksort = function () {"
          simulateTabKeyEvent()
          expect(buffer.lineForRow(0)).toBe "this is a test  var quicksort = function () {"

      describe "when the snippet contains tab stops", ->
        it "places the cursor at the first tab-stop, and moves the cursor in response to 'next-tab-stop' events", ->
          markerCountBefore = editor.getMarkerCount()
          editor.setCursorScreenPosition([2, 0])
          editor.insertText('t2')
          simulateTabKeyEvent()
          expect(buffer.lineForRow(2)).toBe "go here next:() and finally go here:()"
          expect(buffer.lineForRow(3)).toBe "go here first:()"
          expect(buffer.lineForRow(4)).toBe "    if (items.length <= 1) return items;"
          expect(editor.getSelectedBufferRange()).toEqual [[3, 15], [3, 15]]

          simulateTabKeyEvent()
          expect(editor.getSelectedBufferRange()).toEqual [[2, 14], [2, 14]]
          editor.insertText 'abc'

          simulateTabKeyEvent()
          expect(editor.getSelectedBufferRange()).toEqual [[2, 40], [2, 40]]

          # tab backwards
          simulateTabKeyEvent(shiftKey: true)
          expect(editor.getSelectedBufferRange()).toEqual [[2, 14], [2, 17]] # should highlight text typed at tab stop

          simulateTabKeyEvent(shiftKey: true)
          expect(editor.getSelectedBufferRange()).toEqual [[3, 15], [3, 15]]

          # shift-tab on first tab-stop does nothing
          simulateTabKeyEvent(shiftKey: true)
          expect(editor.getCursorScreenPosition()).toEqual [3, 15]

          # tab through all tab stops, then tab on last stop to terminate snippet
          simulateTabKeyEvent()
          simulateTabKeyEvent()
          simulateTabKeyEvent()
          expect(buffer.lineForRow(2)).toBe "go here next:(abc) and finally go here:(  )"
          expect(editor.getMarkerCount()).toBe markerCountBefore

        describe "when tab stops are nested", ->
          it "destroys the inner tab stop if the outer tab stop is modified", ->
            buffer.setText('')
            editor.insertText 't5'
            atom.commands.dispatch editorElement, 'snippets:expand'
            expect(buffer.lineForRow(0)).toBe '"key": value'
            expect(editor.getSelectedBufferRange()).toEqual [[0, 0], [0, 5]]
            editor.insertText("foo")
            simulateTabKeyEvent()
            expect(editor.getSelectedBufferRange()).toEqual [[0, 5], [0, 10]]

        describe "when tab stops are separated by blank lines", ->
          it "correctly places the tab stops (regression)", ->
            buffer.setText('')
            editor.insertText 't7'
            atom.commands.dispatch editorElement, 'snippets:expand'
            atom.commands.dispatch editorElement, 'snippets:next-tab-stop'
            expect(editor.getCursorBufferPosition()).toEqual [3, 25]

        describe "when the cursor is moved beyond the bounds of the current tab stop", ->
          it "terminates the snippet", ->
            editor.setCursorScreenPosition([2, 0])
            editor.insertText('t2')
            simulateTabKeyEvent()

            editor.moveUp()
            editor.moveLeft()
            simulateTabKeyEvent()

            expect(buffer.lineForRow(2)).toBe "go here next:(  ) and finally go here:()"
            expect(editor.getCursorBufferPosition()).toEqual [2, 16]

            # test we can terminate with shift-tab
            editor.setCursorScreenPosition([4, 0])
            editor.insertText('t2')
            simulateTabKeyEvent()
            simulateTabKeyEvent()

            editor.moveRight()
            simulateTabKeyEvent(shiftKey: true)
            expect(editor.getCursorBufferPosition()).toEqual [4, 15]

        describe "when the cursor is moved within the bounds of the current tab stop", ->
          it "should not terminate the snippet", ->
            editor.setCursorScreenPosition([0, 0])
            editor.insertText('t8')
            simulateTabKeyEvent()

            expect(buffer.lineForRow(0)).toBe "with placeholder test"
            editor.moveRight()
            editor.moveLeft()
            editor.insertText("foo")
            expect(buffer.lineForRow(0)).toBe "with placeholder tesfoot"

            simulateTabKeyEvent()
            expect(buffer.lineForRow(1)).toBe "without placeholder var quicksort = function () {"
            editor.insertText("test")
            expect(buffer.lineForRow(1)).toBe "without placeholder testvar quicksort = function () {"
            editor.moveLeft()
            editor.insertText("foo")
            expect(buffer.lineForRow(1)).toBe "without placeholder tesfootvar quicksort = function () {"

        describe "when the backspace is press within the bounds of the current tab stop", ->
          it "should not terminate the snippet", ->
            editor.setCursorScreenPosition([0, 0])
            editor.insertText('t8')
            simulateTabKeyEvent()

            expect(buffer.lineForRow(0)).toBe "with placeholder test"
            editor.moveRight()
            editor.backspace()
            editor.insertText("foo")
            expect(buffer.lineForRow(0)).toBe "with placeholder tesfoo"

            simulateTabKeyEvent()
            expect(buffer.lineForRow(1)).toBe "without placeholder var quicksort = function () {"
            editor.insertText("test")
            expect(buffer.lineForRow(1)).toBe "without placeholder testvar quicksort = function () {"
            editor.backspace()
            editor.insertText("foo")
            expect(buffer.lineForRow(1)).toBe "without placeholder tesfoovar quicksort = function () {"

      describe "when the snippet contains hard tabs", ->
        describe "when the edit session is in soft-tabs mode", ->
          it "translates hard tabs in the snippet to the appropriate number of spaces", ->
            expect(editor.getSoftTabs()).toBeTruthy()
            editor.insertText("t3")
            simulateTabKeyEvent()
            expect(buffer.lineForRow(1)).toBe "  line 2"
            expect(editor.getCursorBufferPosition()).toEqual [1, 8]

        describe "when the edit session is in hard-tabs mode", ->
          it "inserts hard tabs in the snippet directly", ->
            editor.setSoftTabs(false)
            editor.insertText("t3")
            simulateTabKeyEvent()
            expect(buffer.lineForRow(1)).toBe "\tline 2"
            expect(editor.getCursorBufferPosition()).toEqual [1, 7]

      describe "when the snippet prefix is indented", ->
        describe "when the snippet spans a single line", ->
          it "does not indent the next line", ->
            editor.setCursorScreenPosition([2, Infinity])
            editor.insertText ' t1'
            atom.commands.dispatch editorElement, 'snippets:expand'
            expect(buffer.lineForRow(3)).toBe "    var pivot = items.shift(), current, left = [], right = [];"

        describe "when the snippet spans multiple lines", ->
          it "indents the subsequent lines of the snippet to be even with the start of the first line", ->
            expect(editor.getSoftTabs()).toBeTruthy()
            editor.setCursorScreenPosition([2, Infinity])
            editor.insertText ' t3'
            atom.commands.dispatch editorElement, 'snippets:expand'
            expect(buffer.lineForRow(2)).toBe "    if (items.length <= 1) return items; line 1"
            expect(buffer.lineForRow(3)).toBe "      line 2"
            expect(editor.getCursorBufferPosition()).toEqual [3, 12]

      describe "when multiple snippets match the prefix", ->
        it "expands the snippet that is the longest match for the prefix", ->
          editor.insertText('t113')
          expect(editor.getCursorScreenPosition()).toEqual [0, 4]

          simulateTabKeyEvent()
          expect(buffer.lineForRow(0)).toBe "t113  var quicksort = function () {"
          expect(editor.getCursorScreenPosition()).toEqual [0, 6]

          editor.undo()
          editor.undo()

          editor.insertText("tt1")
          expect(editor.getCursorScreenPosition()).toEqual [0, 3]

          simulateTabKeyEvent()
          expect(buffer.lineForRow(0)).toBe "this is another testvar quicksort = function () {"
          expect(editor.getCursorScreenPosition()).toEqual [0, 20]

          editor.undo()
          editor.undo()

          editor.insertText("@t1")
          expect(editor.getCursorScreenPosition()).toEqual [0, 3]

          simulateTabKeyEvent()
          expect(buffer.lineForRow(0)).toBe "@this is a testvar quicksort = function () {"
          expect(editor.getCursorScreenPosition()).toEqual [0, 15]

    describe "when the letters preceding the cursor don't match a snippet", ->
      it "inserts a tab as normal", ->
        editor.insertText("xxte")
        expect(editor.getCursorScreenPosition()).toEqual [0, 4]

        simulateTabKeyEvent()
        expect(buffer.lineForRow(0)).toBe "xxte  var quicksort = function () {"
        expect(editor.getCursorScreenPosition()).toEqual [0, 6]

    describe "when text is selected", ->
      it "inserts a tab as normal", ->
        editor.insertText("t1")
        editor.setSelectedBufferRange([[0, 0], [0, 2]])

        simulateTabKeyEvent()
        expect(buffer.lineForRow(0)).toBe "  t1var quicksort = function () {"
        expect(editor.getSelectedBufferRange()).toEqual [[0, 0], [0, 4]]

    describe "when a previous snippet expansion has just been undone", ->
      it "expands the snippet based on the current prefix rather than jumping to the old snippet's tab stop", ->
        editor.insertText 't6\n'
        editor.setCursorBufferPosition [0, 2]
        simulateTabKeyEvent()
        expect(buffer.lineForRow(0)).toBe "first line"
        editor.undo()
        expect(buffer.lineForRow(0)).toBe "t6"
        simulateTabKeyEvent()
        expect(buffer.lineForRow(0)).toBe "first line"

    describe "when the prefix contains non-word characters", ->
      it "selects the non-word characters as part of the prefix", ->
        editor.insertText("@unique")
        expect(editor.getCursorScreenPosition()).toEqual [0, 7]

        simulateTabKeyEvent()
        expect(buffer.lineForRow(0)).toBe "@unique seevar quicksort = function () {"
        expect(editor.getCursorScreenPosition()).toEqual [0, 11]

        editor.setCursorBufferPosition [10, 0]
        editor.insertText("'@unique")

        simulateTabKeyEvent()
        expect(buffer.lineForRow(10)).toBe "'@unique see"
        expect(editor.getCursorScreenPosition()).toEqual [10, 12]

      it "does not select the whitespace before the prefix", ->
        editor.insertText("a; @unique")
        expect(editor.getCursorScreenPosition()).toEqual [0, 10]

        simulateTabKeyEvent()
        expect(buffer.lineForRow(0)).toBe "a; @unique seevar quicksort = function () {"
        expect(editor.getCursorScreenPosition()).toEqual [0, 14]

    describe "when snippet contains tabstops with or without placeholder", ->
      it "should create two markers", ->
        markerCountBefore = editor.getMarkerCount()
        editor.setCursorScreenPosition([0, 0])
        editor.insertText('t8')
        simulateTabKeyEvent()
        expect(buffer.lineForRow(0)).toBe "with placeholder test"
        expect(buffer.lineForRow(1)).toBe "without placeholder var quicksort = function () {"
        expect(editor.getMarkerCount()).toBe 3

        expect(editor.getSelectedBufferRange()).toEqual [[0, 17], [0, 21]]

        simulateTabKeyEvent()
        expect(editor.getSelectedBufferRange()).toEqual [[1, 20], [1, 20]]

    describe "when snippet contains multi-caret tabstops with or without placeholder", ->
      it "should create two markers", ->
        editor.setCursorScreenPosition([0, 0])
        editor.insertText('t9')
        simulateTabKeyEvent()
        expect(buffer.lineForRow(0)).toBe "with placeholder test"
        expect(buffer.lineForRow(1)).toBe "without placeholder var quicksort = function () {"
        editor.insertText('hello')
        expect(buffer.lineForRow(0)).toBe "with placeholder hello"
        expect(buffer.lineForRow(1)).toBe "without placeholder hellovar quicksort = function () {"

    describe "when the snippet contains tab stops with an index >= 10", ->
      it "parses and orders the indices correctly", ->
        editor.setText('t10')
        editor.setCursorScreenPosition([0, 3])
        simulateTabKeyEvent()
        expect(editor.getText()).toBe "hello large indices"
        expect(editor.getCursorBufferPosition()).toEqual [0, 19]
        simulateTabKeyEvent()
        expect(editor.getCursorBufferPosition()).toEqual [0, 5]
        simulateTabKeyEvent()
        expect(editor.getSelectedBufferRange()).toEqual [[0, 6], [0, 11]]

    describe "when there are multiple cursors", ->
      describe "when the cursors share a common snippet prefix", ->
        it "expands the snippet for all cursors and allows simultaneous editing", ->
          editor.insertText('t9')
          editor.setCursorBufferPosition([12, 2])
          editor.insertText(' t9')
          editor.addCursorAtBufferPosition([0, 2])
          simulateTabKeyEvent()

          expect(buffer.lineForRow(0)).toBe "with placeholder test"
          expect(buffer.lineForRow(1)).toBe "without placeholder var quicksort = function () {"
          expect(buffer.lineForRow(13)).toBe "}; with placeholder test"
          expect(buffer.lineForRow(14)).toBe "without placeholder "

          editor.insertText('hello')
          expect(buffer.lineForRow(0)).toBe "with placeholder hello"
          expect(buffer.lineForRow(1)).toBe "without placeholder hellovar quicksort = function () {"
          expect(buffer.lineForRow(13)).toBe "}; with placeholder hello"
          expect(buffer.lineForRow(14)).toBe "without placeholder hello"

        describe "when there are many tabstops", ->
          it "moves the cursors between the tab stops for their corresponding snippet when tab and shift-tab are pressed", ->
            editor.addCursorAtBufferPosition([7, 5])
            editor.addCursorAtBufferPosition([12, 2])
            editor.insertText('t11')
            simulateTabKeyEvent()

            cursors = editor.getCursors()
            expect(cursors.length).toEqual 3

            expect(cursors[0].getBufferPosition()).toEqual [0, 3]
            expect(cursors[1].getBufferPosition()).toEqual [7, 8]
            expect(cursors[2].getBufferPosition()).toEqual [12, 5]
            expect(cursors[0].selection.isEmpty()).toBe true
            expect(cursors[1].selection.isEmpty()).toBe true
            expect(cursors[2].selection.isEmpty()).toBe true

            simulateTabKeyEvent()
            expect(cursors[0].getBufferPosition()).toEqual [0, 7]
            expect(cursors[1].getBufferPosition()).toEqual [7, 12]
            expect(cursors[2].getBufferPosition()).toEqual [12, 9]
            expect(cursors[0].selection.isEmpty()).toBe false
            expect(cursors[1].selection.isEmpty()).toBe false
            expect(cursors[2].selection.isEmpty()).toBe false
            expect(cursors[0].selection.getText()).toEqual 'two'
            expect(cursors[1].selection.getText()).toEqual 'two'
            expect(cursors[2].selection.getText()).toEqual 'two'

            simulateTabKeyEvent()
            expect(cursors[0].getBufferPosition()).toEqual [0, 13]
            expect(cursors[1].getBufferPosition()).toEqual [7, 18]
            expect(cursors[2].getBufferPosition()).toEqual [12, 15]
            expect(cursors[0].selection.isEmpty()).toBe true
            expect(cursors[1].selection.isEmpty()).toBe true
            expect(cursors[2].selection.isEmpty()).toBe true

            simulateTabKeyEvent()
            expect(cursors[0].getBufferPosition()).toEqual [0, 0]
            expect(cursors[1].getBufferPosition()).toEqual [7, 5]
            expect(cursors[2].getBufferPosition()).toEqual [12, 2]
            expect(cursors[0].selection.isEmpty()).toBe true
            expect(cursors[1].selection.isEmpty()).toBe true
            expect(cursors[2].selection.isEmpty()).toBe true

      describe "when the cursors do not share common snippet prefixes", ->
        it "inserts tabs as normal", ->
          editor.insertText('t9')
          editor.setCursorBufferPosition([12, 2])
          editor.insertText(' t8')
          editor.addCursorAtBufferPosition([0, 2])
          simulateTabKeyEvent()
          expect(buffer.lineForRow(0)).toBe "t9  var quicksort = function () {"
          expect(buffer.lineForRow(12)).toBe "}; t8 "

      describe "when a snippet is triggered within an existing snippet expansion", ->
        it "ignores the snippet expansion and goes to the next tab stop", ->
          editor.addCursorAtBufferPosition([7, 5])
          editor.addCursorAtBufferPosition([12, 2])
          editor.insertText('t11')
          simulateTabKeyEvent()
          simulateTabKeyEvent()

          editor.insertText('t1')
          simulateTabKeyEvent()

          cursors = editor.getCursors()
          expect(cursors.length).toEqual 3

          expect(cursors[0].getBufferPosition()).toEqual [0, 12]
          expect(cursors[1].getBufferPosition()).toEqual [7, 17]
          expect(cursors[2].getBufferPosition()).toEqual [12, 14]
          expect(cursors[0].selection.isEmpty()).toBe true
          expect(cursors[1].selection.isEmpty()).toBe true
          expect(cursors[2].selection.isEmpty()).toBe true
          expect(buffer.lineForRow(0)).toBe "one t1 threevar quicksort = function () {"
          expect(buffer.lineForRow(7)).toBe "    }one t1 three"
          expect(buffer.lineForRow(12)).toBe "};one t1 three"

  describe "snippet loading", ->
    [configDirPath, packageWithSnippets, packageWithBrokenSnippets] = []

    beforeEach ->
      packageWithBrokenSnippets = atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-broken-snippets'))
      packageWithSnippets =  atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-snippets'))
      configDirPath = temp.mkdirSync('atom-config-dir-')

      jasmine.unspy(window, "setTimeout")
      jasmine.unspy(snippets, 'loadAll')
      spyOn(atom.packages, 'getLoadedPackages').andReturn [packageWithSnippets, packageWithBrokenSnippets]
      spyOn(atom, 'getConfigDirPath').andReturn configDirPath

    afterEach ->
      # Unspy here so other afterEach blocks don't run with this spy active
      jasmine.unspy(atom.packages, 'getLoadedPackages')

    it "loads non-hidden snippet files from all atom packages with snippets directories, logging a warning if a file can't be parsed", ->
      spyOn(console, 'warn')
      snippets.loaded = false
      snippets.loadAll()

      waitsFor "all snippets to load", 30000, -> snippets.loaded

      runs ->
        expect(atom.syntax.getProperty(['.test'], 'snippets.test')?.constructor).toBe Snippet

        # warn about junk-file, but don't even try to parse a hidden file
        expect(console.warn).toHaveBeenCalled()
        expect(console.warn.calls.length).toBe 1

    it "loads ~/.atom/snippets.json when it exists", ->
      fs.writeFileSync path.join(configDirPath, 'snippets.json'), """
        {
          ".foo": {
            "foo snippet": {
              "prefix": "foo",
              "body": "bar"
            }
          }
        }
      """
      spyOn(console, 'warn')
      snippets.loaded = false
      snippets.loadAll()

      waitsFor "all snippets to load", 30000, -> snippets.loaded

      runs ->
        expect(atom.syntax.getProperty(['.foo'], 'snippets.foo')?.constructor).toBe Snippet

    it "loads ~/.atom/snippets.cson when it exists", ->
      fs.writeFileSync path.join(configDirPath, 'snippets.cson'), """
        ".foo":
          "foo snippet":
            "prefix": "foo"
            "body": "bar"
      """
      spyOn(console, 'warn')
      snippets.loaded = false
      snippets.loadAll()

      waitsFor "all snippets to load", 30000, -> snippets.loaded

      runs ->
        expect(atom.syntax.getProperty(['.foo'], 'snippets.foo')?.constructor).toBe Snippet

    it "notifies the user when the file cannot be loaded", ->
      spyOn(atom.notifications, 'addError') if atom.notifications?

      fs.writeFileSync path.join(configDirPath, 'snippets.cson'), """
        ".junk":::
      """
      spyOn(console, 'warn')
      snippets.loaded = false
      snippets.loadAll()

      waitsFor "all snippets to load", 30000, -> snippets.loaded

      runs ->
        # warn about junk-file, but don't even try to parse a hidden file
        expect(console.warn).toHaveBeenCalled()
        expect(atom.notifications.addError).toHaveBeenCalled() if atom.notifications?

    it "loads the bundled snippet template snippets", ->
      spyOn(console, 'warn')
      snippets.loaded = false
      snippets.loadAll()

      waitsFor "all snippets to load", 30000, -> snippets.loaded

      runs ->
        expect(atom.syntax.getProperty(['.source.json'], 'snippets.snip')?.constructor).toBe Snippet
        expect(atom.syntax.getProperty(['.source.coffee'], 'snippets.snip')?.constructor).toBe Snippet

  describe "snippet body parser", ->
    it "breaks a snippet body into lines, with each line containing tab stops at the appropriate position", ->
      bodyTree = snippets.getBodyParser().parse """
        the quick brown $1fox ${2:jumped ${3:over}
        }the ${4:lazy} dog
      """

      expect(bodyTree).toEqual [
        "the quick brown ",
        { index: 1, content: [] },
        "fox ",
        {
          index: 2,
          content: [
            "jumped ",
            { index: 3, content: ["over"]},
            "\n"
          ],
        }
        "the "
        { index: 4, content: ["lazy"] },
        " dog"
      ]

    it "removes interpolated variables in placeholder text (we don't currently support it)", ->
      bodyTree = snippets.getBodyParser().parse """
        module ${1:ActiveRecord::${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}}
      """

      expect(bodyTree).toEqual [
        "module ",
        {
          "index": 1,
          "content": ["ActiveRecord::", ""]
        }
      ]

  describe "when atom://.atom/snippets is opened", ->
    it "opens ~/.atom/snippets.cson", ->
      atom.workspace.destroyActivePaneItem()
      configDirPath = temp.mkdirSync('atom-config-dir-')
      spyOn(atom, 'getConfigDirPath').andReturn configDirPath
      atom.workspace.open('atom://.atom/snippets')

      waitsFor ->
        atom.workspace.getActiveEditor()?

      runs ->
        expect(atom.workspace.getActiveEditor().getUri()).toBe path.join(configDirPath, 'snippets.cson')

  describe "when ~/.atom/snippets.cson changes", ->
    it "reloads the snippets", ->
      jasmine.unspy(window, "setTimeout")
      jasmine.unspy(snippets, 'loadAll')
      spyOn(snippets, 'loadPackageSnippets').andCallFake ->
        process.nextTick -> snippets.doneLoading()
      configDirPath = temp.mkdirSync('atom-config-dir-')
      spyOn(atom, 'getConfigDirPath').andReturn configDirPath
      snippetsPath = path.join(configDirPath, 'snippets.cson')
      fs.writeFileSync(snippetsPath, '')

      snippets.loaded = false
      snippets.loadAll()

      waitsFor "all snippets to load", 30000, -> snippets.loaded

      runs ->
        expect(atom.syntax.getProperty(['.test'], 'snippets.test')).toBeUndefined()
        fs.writeFileSync snippetsPath, """
          ".test":
            "Test Snippet":
              prefix: "test"
              body: "testing 123"
        """

      waitsFor "snippets to be added", ->
        atom.syntax.getProperty(['.test'], 'snippets.test')?

      runs ->
        expect(atom.syntax.getProperty(['.test'], 'snippets.test')?.constructor).toBe Snippet
        fs.removeSync(snippetsPath)

      waitsFor "snippets to be removed", ->
        atom.syntax.getProperty(['.test'], 'snippets.test')?

  describe "snippet insertion API", ->
    it "will automatically parse snippet definition and replace selection", ->
      editor.setSelectedBufferRange([[0, 4], [0, 13]])
      Snippets.insert("hello ${1:world}", editor)

      expect(buffer.lineForRow(0)).toBe "var hello world = function () {"
      expect(editor.getMarkerCount()).toBe 2
      expect(editor.getSelectedBufferRange()).toEqual [[0, 10], [0, 15]]

  describe "snippet available selector", ->
    availableSnippetsView = null

    beforeEach ->
      snippets.add __filename,
        ".source.js":
          "test":
            prefix: "test"
            body: "${1:Test pass you will}, young "

          "challenge":
            prefix: "chal"
            body: "$1: ${2:To pass this challenge}"

      availableSnippetsView = new SnippetsAvailable(snippets)
      availableSnippetsView.toggle(editor)

    it "will draw a SelectListView to select a snippet from the snippets passed to the constructor", ->
      expect(availableSnippetsView.getSelectedItem().prefix).toBe 'test'
      expect(availableSnippetsView.getSelectedItem().name).toBe 'test'
      expect(availableSnippetsView.getSelectedItem().bodyText).toBe '${1:Test pass you will}, young '

      atom.commands.dispatch availableSnippetsView.filterEditorView[0], 'core:move-down'
      expect(availableSnippetsView.getSelectedItem().prefix).toBe 'chal'
      expect(availableSnippetsView.getSelectedItem().name).toBe 'challenge'
      expect(availableSnippetsView.getSelectedItem().bodyText).toBe '$1: ${2:To pass this challenge}'

    it "will write the selected snippet to the editor as snippet", ->
      atom.commands.dispatch availableSnippetsView.filterEditorView[0], 'core:confirm'
      expect(editor.getCursorScreenPosition()).toEqual [0, 18]
      expect(editor.getSelectedText()).toBe 'Test pass you will'
      expect(buffer.lineForRow(0)).toBe 'Test pass you will, young var quicksort = function () {'
