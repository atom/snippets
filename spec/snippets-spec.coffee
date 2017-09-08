path = require 'path'
temp = require('temp').track()
Snippets = require '../lib/snippets'

describe "Snippets extension", ->
  [editorElement, editor] = []

  simulateTabKeyEvent = ({shift}={}) ->
    event = atom.keymaps.constructor.buildKeydownEvent('tab', {shift, target: editorElement})
    atom.keymaps.handleKeyboardEvent(event)

  beforeEach ->
    spyOn(Snippets, 'loadAll')
    spyOn(Snippets, 'getUserSnippetsPath').andReturn('')

    waitsForPromise ->
      atom.workspace.open('sample.js')

    waitsForPromise ->
      atom.packages.activatePackage('language-javascript')

    waitsForPromise ->
      atom.packages.activatePackage("snippets")

    runs ->
      editor = atom.workspace.getActiveTextEditor()
      editorElement = atom.views.getView(editor)

  afterEach ->
    waitsForPromise ->
      Promise.resolve(atom.packages.deactivatePackage("snippets"))

  describe "provideSnippets interface", ->
    snippetsInterface = null

    beforeEach ->
      snippetsInterface = Snippets.provideSnippets()

    describe "bundledSnippetsLoaded", ->
      it "indicates the loaded state of the bundled snippets", ->
        Snippets.loaded = false
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe false
        Snippets.doneLoading()
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe true

      it "can insert a snippet", ->
        editor.setSelectedBufferRange([[0, 4], [0, 13]])
        snippetsInterface.insertSnippet("hello ${1:world}", editor)
        expect(editor.lineTextForBufferRow(0)).toBe "var hello world = function () {"

  it "ignores invalid snippets in the config", ->
    snippets = atom.packages.getActivePackage('snippets').mainModule

    invalidSnippets = null
    spyOn(snippets.scopedPropertyStore, 'getPropertyValue').andCallFake -> invalidSnippets
    expect(snippets.getSnippets(editor)).toEqual {}

    invalidSnippets = 'test'
    expect(snippets.getSnippets(editor)).toEqual {}

    invalidSnippets = []
    expect(snippets.getSnippets(editor)).toEqual {}

    invalidSnippets = 3
    expect(snippets.getSnippets(editor)).toEqual {}

    invalidSnippets = {a: null}
    expect(snippets.getSnippets(editor)).toEqual {}

  describe "when null snippets are present", ->
    beforeEach ->
      Snippets.add __filename,
        '.source.js':
          "some snippet":
            prefix: "t1"
            body: "this is a test"

        '.source.js .nope':
          "some snippet":
            prefix: "t1"
            body: null

    it "overrides the less-specific defined snippet", ->
      snippets = Snippets.provideSnippets()
      expect(snippets.snippetsForScopes(['.source.js'])['t1']).toBeTruthy()
      expect(snippets.snippetsForScopes(['.source.js .nope.not-today'])['t1']).toBeFalsy()

  describe "when 'tab' is triggered on the editor", ->
    beforeEach ->
      Snippets.add __filename,
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

          "multi-caret-multi-tabstop":
            prefix: "t9b"
            body: """
              with placeholder ${1:test}
              without placeholder $1
              second tabstop $2
              third tabstop $3
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

    it "parses snippets once, reusing cached ones on subsequent queries", ->
      spyOn(Snippets, "getBodyParser").andCallThrough()

      editor.insertText("t1")
      simulateTabKeyEvent()

      expect(Snippets.getBodyParser).toHaveBeenCalled()
      expect(editor.lineTextForBufferRow(0)).toBe "this is a testvar quicksort = function () {"
      expect(editor.getCursorScreenPosition()).toEqual [0, 14]

      Snippets.getBodyParser.reset()

      editor.setText("")
      editor.insertText("t1")
      simulateTabKeyEvent()

      expect(Snippets.getBodyParser).not.toHaveBeenCalled()
      expect(editor.lineTextForBufferRow(0)).toBe "this is a test"
      expect(editor.getCursorScreenPosition()).toEqual [0, 14]

      Snippets.getBodyParser.reset()

      Snippets.add __filename,
        ".source.js":
          "invalidate previous snippet":
            prefix: "t1"
            body: "new snippet"

      editor.setText("")
      editor.insertText("t1")
      simulateTabKeyEvent()

      expect(Snippets.getBodyParser).toHaveBeenCalled()
      expect(editor.lineTextForBufferRow(0)).toBe "new snippet"
      expect(editor.getCursorScreenPosition()).toEqual [0, 11]

    describe "when the snippet body is invalid or missing", ->
      it "does not register the snippet", ->
        editor.setText('')
        editor.insertText('bad1')
        atom.commands.dispatch editorElement, 'snippets:expand'
        expect(editor.getText()).toBe 'bad1'

        editor.setText('')
        editor.setText('bad2')
        atom.commands.dispatch editorElement, 'snippets:expand'
        expect(editor.getText()).toBe 'bad2'

    describe "when the letters preceding the cursor trigger a snippet", ->
      describe "when the snippet contains no tab stops", ->
        it "replaces the prefix with the snippet text and places the cursor at its end", ->
          editor.insertText("t1")
          expect(editor.getCursorScreenPosition()).toEqual [0, 2]

          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe "this is a testvar quicksort = function () {"
          expect(editor.getCursorScreenPosition()).toEqual [0, 14]

        it "inserts a real tab the next time a tab is pressed after the snippet is expanded", ->
          editor.insertText("t1")
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe "this is a testvar quicksort = function () {"
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe "this is a test  var quicksort = function () {"

      describe "when the snippet contains tab stops", ->
        it "places the cursor at the first tab-stop, and moves the cursor in response to 'next-tab-stop' events", ->
          markerCountBefore = editor.getMarkerCount()
          editor.setCursorScreenPosition([2, 0])
          editor.insertText('t2')
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(2)).toBe "go here next:() and finally go here:()"
          expect(editor.lineTextForBufferRow(3)).toBe "go here first:()"
          expect(editor.lineTextForBufferRow(4)).toBe "    if (items.length <= 1) return items;"
          expect(editor.getSelectedBufferRange()).toEqual [[3, 15], [3, 15]]

          simulateTabKeyEvent()
          expect(editor.getSelectedBufferRange()).toEqual [[2, 14], [2, 14]]
          editor.insertText 'abc'

          simulateTabKeyEvent()
          expect(editor.getSelectedBufferRange()).toEqual [[2, 40], [2, 40]]

          # tab backwards
          simulateTabKeyEvent(shift: true)
          expect(editor.getSelectedBufferRange()).toEqual [[2, 14], [2, 17]] # should highlight text typed at tab stop

          simulateTabKeyEvent(shift: true)
          expect(editor.getSelectedBufferRange()).toEqual [[3, 15], [3, 15]]

          # shift-tab on first tab-stop does nothing
          simulateTabKeyEvent(shift: true)
          expect(editor.getCursorScreenPosition()).toEqual [3, 15]

          # tab through all tab stops, then tab on last stop to terminate snippet
          simulateTabKeyEvent()
          simulateTabKeyEvent()
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(2)).toBe "go here next:(abc) and finally go here:(  )"
          expect(editor.getMarkerCount()).toBe markerCountBefore

        describe "when tab stops are nested", ->
          it "destroys the inner tab stop if the outer tab stop is modified", ->
            editor.setText('')
            editor.insertText 't5'
            atom.commands.dispatch editorElement, 'snippets:expand'
            expect(editor.lineTextForBufferRow(0)).toBe '"key": value'
            expect(editor.getSelectedBufferRange()).toEqual [[0, 0], [0, 5]]
            editor.insertText("foo")
            simulateTabKeyEvent()
            expect(editor.getSelectedBufferRange()).toEqual [[0, 5], [0, 10]]

        describe "when tab stops are separated by blank lines", ->
          it "correctly places the tab stops (regression)", ->
            editor.setText('')
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

            expect(editor.lineTextForBufferRow(2)).toBe "go here next:(  ) and finally go here:()"
            expect(editor.getCursorBufferPosition()).toEqual [2, 16]

            # test we can terminate with shift-tab
            editor.setCursorScreenPosition([4, 0])
            editor.insertText('t2')
            simulateTabKeyEvent()
            simulateTabKeyEvent()

            editor.moveRight()
            simulateTabKeyEvent(shift: true)
            expect(editor.getCursorBufferPosition()).toEqual [4, 15]

        describe "when the cursor is moved within the bounds of the current tab stop", ->
          it "should not terminate the snippet", ->
            editor.setCursorScreenPosition([0, 0])
            editor.insertText('t8')
            simulateTabKeyEvent()

            expect(editor.lineTextForBufferRow(0)).toBe "with placeholder test"
            editor.moveRight()
            editor.moveLeft()
            editor.insertText("foo")
            expect(editor.lineTextForBufferRow(0)).toBe "with placeholder tesfoot"

            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(1)).toBe "without placeholder var quicksort = function () {"
            editor.insertText("test")
            expect(editor.lineTextForBufferRow(1)).toBe "without placeholder testvar quicksort = function () {"
            editor.moveLeft()
            editor.insertText("foo")
            expect(editor.lineTextForBufferRow(1)).toBe "without placeholder tesfootvar quicksort = function () {"

        describe "when the backspace is press within the bounds of the current tab stop", ->
          it "should not terminate the snippet", ->
            editor.setCursorScreenPosition([0, 0])
            editor.insertText('t8')
            simulateTabKeyEvent()

            expect(editor.lineTextForBufferRow(0)).toBe "with placeholder test"
            editor.moveRight()
            editor.backspace()
            editor.insertText("foo")
            expect(editor.lineTextForBufferRow(0)).toBe "with placeholder tesfoo"

            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(1)).toBe "without placeholder var quicksort = function () {"
            editor.insertText("test")
            expect(editor.lineTextForBufferRow(1)).toBe "without placeholder testvar quicksort = function () {"
            editor.backspace()
            editor.insertText("foo")
            expect(editor.lineTextForBufferRow(1)).toBe "without placeholder tesfoovar quicksort = function () {"

      describe "when the snippet contains hard tabs", ->
        describe "when the edit session is in soft-tabs mode", ->
          it "translates hard tabs in the snippet to the appropriate number of spaces", ->
            expect(editor.getSoftTabs()).toBeTruthy()
            editor.insertText("t3")
            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(1)).toBe "  line 2"
            expect(editor.getCursorBufferPosition()).toEqual [1, 8]

        describe "when the edit session is in hard-tabs mode", ->
          it "inserts hard tabs in the snippet directly", ->
            editor.setSoftTabs(false)
            editor.insertText("t3")
            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(1)).toBe "\tline 2"
            expect(editor.getCursorBufferPosition()).toEqual [1, 7]

      describe "when the snippet prefix is indented", ->
        describe "when the snippet spans a single line", ->
          it "does not indent the next line", ->
            editor.setCursorScreenPosition([2, Infinity])
            editor.insertText ' t1'
            atom.commands.dispatch editorElement, 'snippets:expand'
            expect(editor.lineTextForBufferRow(3)).toBe "    var pivot = items.shift(), current, left = [], right = [];"

        describe "when the snippet spans multiple lines", ->
          it "indents the subsequent lines of the snippet to be even with the start of the first line", ->
            expect(editor.getSoftTabs()).toBeTruthy()
            editor.setCursorScreenPosition([2, Infinity])
            editor.insertText ' t3'
            atom.commands.dispatch editorElement, 'snippets:expand'
            expect(editor.lineTextForBufferRow(2)).toBe "    if (items.length <= 1) return items; line 1"
            expect(editor.lineTextForBufferRow(3)).toBe "      line 2"
            expect(editor.getCursorBufferPosition()).toEqual [3, 12]

      describe "when multiple snippets match the prefix", ->
        it "expands the snippet that is the longest match for the prefix", ->
          editor.insertText('t113')
          expect(editor.getCursorScreenPosition()).toEqual [0, 4]

          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe "t113  var quicksort = function () {"
          expect(editor.getCursorScreenPosition()).toEqual [0, 6]

          editor.undo()
          editor.undo()

          editor.insertText("tt1")
          expect(editor.getCursorScreenPosition()).toEqual [0, 3]

          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe "this is another testvar quicksort = function () {"
          expect(editor.getCursorScreenPosition()).toEqual [0, 20]

          editor.undo()
          editor.undo()

          editor.insertText("@t1")
          expect(editor.getCursorScreenPosition()).toEqual [0, 3]

          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe "@this is a testvar quicksort = function () {"
          expect(editor.getCursorScreenPosition()).toEqual [0, 15]

    describe "when the word preceding the cursor ends with a snippet prefix", ->
      it "inserts a tab as normal", ->
        editor.insertText("t1t1t1")
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "t1t1t1  var quicksort = function () {"

    describe "when the letters preceding the cursor don't match a snippet", ->
      it "inserts a tab as normal", ->
        editor.insertText("xxte")
        expect(editor.getCursorScreenPosition()).toEqual [0, 4]

        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "xxte  var quicksort = function () {"
        expect(editor.getCursorScreenPosition()).toEqual [0, 6]

    describe "when text is selected", ->
      it "inserts a tab as normal", ->
        editor.insertText("t1")
        editor.setSelectedBufferRange([[0, 0], [0, 2]])

        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "  t1var quicksort = function () {"
        expect(editor.getSelectedBufferRange()).toEqual [[0, 0], [0, 4]]

    describe "when a previous snippet expansion has just been undone", ->
      it "expands the snippet based on the current prefix rather than jumping to the old snippet's tab stop", ->
        editor.insertText 't6\n'
        editor.setCursorBufferPosition [0, 2]
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "first line"
        editor.undo()
        expect(editor.lineTextForBufferRow(0)).toBe "t6"
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "first line"

    describe "when the prefix contains non-word characters", ->
      it "selects the non-word characters as part of the prefix", ->
        editor.insertText("@unique")
        expect(editor.getCursorScreenPosition()).toEqual [0, 7]

        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "@unique seevar quicksort = function () {"
        expect(editor.getCursorScreenPosition()).toEqual [0, 11]

        editor.setCursorBufferPosition [10, 0]
        editor.insertText("'@unique")

        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(10)).toBe "'@unique see"
        expect(editor.getCursorScreenPosition()).toEqual [10, 12]

      it "does not select the whitespace before the prefix", ->
        editor.insertText("a; @unique")
        expect(editor.getCursorScreenPosition()).toEqual [0, 10]

        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "a; @unique seevar quicksort = function () {"
        expect(editor.getCursorScreenPosition()).toEqual [0, 14]

    describe "when snippet contains tabstops with or without placeholder", ->
      it "should create two markers", ->
        editor.setCursorScreenPosition([0, 0])
        editor.insertText('t8')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "with placeholder test"
        expect(editor.lineTextForBufferRow(1)).toBe "without placeholder var quicksort = function () {"

        expect(editor.getSelectedBufferRange()).toEqual [[0, 17], [0, 21]]

        simulateTabKeyEvent()
        expect(editor.getSelectedBufferRange()).toEqual [[1, 20], [1, 20]]

    describe "when snippet contains multi-caret tabstops with or without placeholder", ->
      it "should create two markers", ->
        editor.setCursorScreenPosition([0, 0])
        editor.insertText('t9')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe "with placeholder test"
        expect(editor.lineTextForBufferRow(1)).toBe "without placeholder var quicksort = function () {"
        editor.insertText('hello')
        expect(editor.lineTextForBufferRow(0)).toBe "with placeholder hello"
        expect(editor.lineTextForBufferRow(1)).toBe "without placeholder hellovar quicksort = function () {"

      it "terminates the snippet when cursors are destroyed", ->
        editor.setCursorScreenPosition([0, 0])
        editor.insertText('t9b')
        simulateTabKeyEvent()
        editor.getCursors()[0].destroy()
        simulateTabKeyEvent()

        expect(editor.lineTextForBufferRow(1)).toEqual("without placeholder   ")

      it "terminates the snippet expansion if a new cursor moves outside the bounds of the tab stops", ->
        editor.setCursorScreenPosition([0, 0])
        editor.insertText('t9b')
        simulateTabKeyEvent()
        editor.insertText('test')

        editor.getCursors()[0].destroy()
        editor.moveDown() # this should destroy the previous expansion
        editor.moveToBeginningOfLine()

        # this should insert whitespace instead of going through tabstops of the previous destroyed snippet
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(2).indexOf("  second")).toBe 0

      it "moves to the second tabstop after a multi-caret tabstop", ->
        editor.setCursorScreenPosition([0, 0])
        editor.insertText('t9b')
        simulateTabKeyEvent()
        editor.insertText('line 1')

        simulateTabKeyEvent()
        editor.insertText('line 2')

        simulateTabKeyEvent()
        editor.insertText('line 3')

        expect(editor.lineTextForBufferRow(2).indexOf("line 2 ")).toBe -1

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

          expect(editor.lineTextForBufferRow(0)).toBe "with placeholder test"
          expect(editor.lineTextForBufferRow(1)).toBe "without placeholder var quicksort = function () {"
          expect(editor.lineTextForBufferRow(13)).toBe "}; with placeholder test"
          expect(editor.lineTextForBufferRow(14)).toBe "without placeholder "

          editor.insertText('hello')
          expect(editor.lineTextForBufferRow(0)).toBe "with placeholder hello"
          expect(editor.lineTextForBufferRow(1)).toBe "without placeholder hellovar quicksort = function () {"
          expect(editor.lineTextForBufferRow(13)).toBe "}; with placeholder hello"
          expect(editor.lineTextForBufferRow(14)).toBe "without placeholder hello"

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
          expect(editor.lineTextForBufferRow(0)).toBe "t9  var quicksort = function () {"
          expect(editor.lineTextForBufferRow(12)).toBe "}; t8 "

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
          expect(editor.lineTextForBufferRow(0)).toBe "one t1 threevar quicksort = function () {"
          expect(editor.lineTextForBufferRow(7)).toBe "    }one t1 three"
          expect(editor.lineTextForBufferRow(12)).toBe "};one t1 three"

  describe "when atom://.atom/snippets is opened", ->
    it "opens ~/.atom/snippets.cson", ->
      jasmine.unspy(Snippets, 'getUserSnippetsPath')
      atom.workspace.destroyActivePaneItem()
      configDirPath = temp.mkdirSync('atom-config-dir-')
      spyOn(atom, 'getConfigDirPath').andReturn configDirPath
      atom.workspace.open('atom://.atom/snippets')

      waitsFor ->
        atom.workspace.getActiveTextEditor()?

      runs ->
        expect(atom.workspace.getActiveTextEditor().getURI()).toBe path.join(configDirPath, 'snippets.cson')

  describe "snippet insertion API", ->
    it "will automatically parse snippet definition and replace selection", ->
      editor.setSelectedBufferRange([[0, 4], [0, 13]])
      Snippets.insert("hello ${1:world}", editor)

      expect(editor.lineTextForBufferRow(0)).toBe "var hello world = function () {"
      expect(editor.getSelectedBufferRange()).toEqual [[0, 10], [0, 15]]

  describe "when the 'snippets:available' command is triggered", ->
    availableSnippetsView = null

    beforeEach ->
      Snippets.add __filename,
        ".source.js":
          "test":
            prefix: "test"
            body: "${1:Test pass you will}, young "

          "challenge":
            prefix: "chal"
            body: "$1: ${2:To pass this challenge}"

      delete Snippets.availableSnippetsView

      atom.commands.dispatch(editorElement, "snippets:available")

      waitsFor ->
        atom.workspace.getModalPanels().length is 1

      runs ->
        availableSnippetsView = atom.workspace.getModalPanels()[0].getItem()

    it "renders a select list of all available snippets", ->
      expect(availableSnippetsView.selectListView.getSelectedItem().prefix).toBe 'test'
      expect(availableSnippetsView.selectListView.getSelectedItem().name).toBe 'test'
      expect(availableSnippetsView.selectListView.getSelectedItem().bodyText).toBe '${1:Test pass you will}, young '

      availableSnippetsView.selectListView.selectNext()

      expect(availableSnippetsView.selectListView.getSelectedItem().prefix).toBe 'chal'
      expect(availableSnippetsView.selectListView.getSelectedItem().name).toBe 'challenge'
      expect(availableSnippetsView.selectListView.getSelectedItem().bodyText).toBe '$1: ${2:To pass this challenge}'

    it "writes the selected snippet to the editor as snippet", ->
      availableSnippetsView.selectListView.confirmSelection()

      expect(editor.getCursorScreenPosition()).toEqual [0, 18]
      expect(editor.getSelectedText()).toBe 'Test pass you will'
      expect(editor.lineTextForBufferRow(0)).toBe 'Test pass you will, young var quicksort = function () {'

    it "closes the dialog when triggered again", ->
      atom.commands.dispatch availableSnippetsView.selectListView.refs.queryEditor.element, 'snippets:available'
      expect(atom.workspace.getModalPanels().length).toBe 0
