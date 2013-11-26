Snippet = require '../lib/snippet'
Snippets = require '../lib/snippets'
{_, WorkspaceView} = require 'atom'

describe "Snippets extension", ->
  [buffer, editorView, editor, snippets] = []
  beforeEach ->
    atom.packages.activatePackage('language-javascript', sync: true)
    atom.workspaceView = new WorkspaceView
    atom.workspaceView.openSync('sample.js')

    packageWithSnippets = atom.packages.loadPackage("package-with-snippets")

    spyOn(Snippets, 'loadAll')
    snippets = atom.packages.activatePackage("snippets").mainModule

    editorView = atom.workspaceView.getActiveView()
    editor = atom.workspaceView.getActivePaneItem()
    buffer = editorView.getBuffer()
    atom.workspaceView.simulateDomAttachment()
    atom.workspaceView.enableKeymap()

  describe "when 'tab' is triggered on the editorView", ->
    beforeEach ->
      snippets.add
        ".source.js":
          "without tab stops":
            prefix: "t1"
            body: "this is a test"

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

    describe "when the letters preceding the cursor trigger a snippet", ->
      describe "when the snippet contains no tab stops", ->
        it "replaces the prefix with the snippet text and places the cursor at its end", ->
          editorView.insertText("t1")
          expect(editorView.getCursorScreenPosition()).toEqual [0, 2]

          editorView.trigger keydownEvent('tab', target: editorView[0])
          expect(buffer.lineForRow(0)).toBe "this is a testvar quicksort = function () {"
          expect(editorView.getCursorScreenPosition()).toEqual [0, 14]

        it "inserts a real tab the next time a tab is pressed after the snippet is expanded", ->
          editorView.insertText("t1")
          editorView.trigger keydownEvent('tab', target: editorView[0])
          expect(buffer.lineForRow(0)).toBe "this is a testvar quicksort = function () {"
          editorView.trigger keydownEvent('tab', target: editorView[0])
          expect(buffer.lineForRow(0)).toBe "this is a test  var quicksort = function () {"

      describe "when the snippet contains tab stops", ->
        it "places the cursor at the first tab-stop, and moves the cursor in response to 'next-tab-stop' events", ->
          markerCountBefore = editorView.editor.getMarkerCount()
          editorView.setCursorScreenPosition([2, 0])
          editorView.insertText('t2')
          editorView.trigger keydownEvent('tab', target: editorView[0])
          expect(buffer.lineForRow(2)).toBe "go here next:() and finally go here:()"
          expect(buffer.lineForRow(3)).toBe "go here first:()"
          expect(buffer.lineForRow(4)).toBe "    if (items.length <= 1) return items;"
          expect(editorView.getSelectedBufferRange()).toEqual [[3, 15], [3, 15]]

          editorView.trigger keydownEvent('tab', target: editorView[0])
          expect(editorView.getSelectedBufferRange()).toEqual [[2, 14], [2, 14]]
          editorView.insertText 'abc'

          editorView.trigger keydownEvent('tab', target: editorView[0])
          expect(editorView.getSelectedBufferRange()).toEqual [[2, 40], [2, 40]]

          # tab backwards
          editorView.trigger keydownEvent('tab', shiftKey: true, target: editorView[0])
          expect(editorView.getSelectedBufferRange()).toEqual [[2, 14], [2, 17]] # should highlight text typed at tab stop

          editorView.trigger keydownEvent('tab', shiftKey: true, target: editorView[0])
          expect(editorView.getSelectedBufferRange()).toEqual [[3, 15], [3, 15]]

          # shift-tab on first tab-stop does nothing
          editorView.trigger keydownEvent('tab', shiftKey: true, target: editorView[0])
          expect(editorView.getCursorScreenPosition()).toEqual [3, 15]

          # tab through all tab stops, then tab on last stop to terminate snippet
          editorView.trigger keydownEvent('tab', target: editorView[0])
          editorView.trigger keydownEvent('tab', target: editorView[0])
          editorView.trigger keydownEvent('tab', target: editorView[0])
          expect(buffer.lineForRow(2)).toBe "go here next:(abc) and finally go here:(  )"
          expect(editorView.editor.getMarkerCount()).toBe markerCountBefore

        describe "when tab stops are nested", ->
          it "destroys the inner tab stop if the outer tab stop is modified", ->
            buffer.setText('')
            editorView.insertText 't5'
            editorView.trigger 'snippets:expand'
            expect(buffer.lineForRow(0)).toBe '"key": value'
            expect(editorView.getSelectedBufferRange()).toEqual [[0, 0], [0, 5]]
            editorView.insertText("foo")
            editorView.trigger keydownEvent('tab', target: editorView[0])
            expect(editorView.getSelectedBufferRange()).toEqual [[0, 5], [0, 10]]

        describe "when tab stops are separated by blank lines", ->
          it "correctly places the tab stops (regression)", ->
            buffer.setText('')
            editorView.insertText 't7'
            editorView.trigger 'snippets:expand'
            editorView.trigger 'snippets:next-tab-stop'
            expect(editor.getCursorBufferPosition()).toEqual [3, 25]

        describe "when the cursor is moved beyond the bounds of the current tab stop", ->
          it "terminates the snippet", ->
            editorView.setCursorScreenPosition([2, 0])
            editorView.insertText('t2')
            editorView.trigger keydownEvent('tab', target: editorView[0])

            editorView.moveCursorUp()
            editorView.moveCursorLeft()
            editorView.trigger keydownEvent('tab', target: editorView[0])

            expect(buffer.lineForRow(2)).toBe "go here next:(  ) and finally go here:()"
            expect(editorView.getCursorBufferPosition()).toEqual [2, 16]

            # test we can terminate with shift-tab
            editorView.setCursorScreenPosition([4, 0])
            editorView.insertText('t2')
            editorView.trigger keydownEvent('tab', target: editorView[0])
            editorView.trigger keydownEvent('tab', target: editorView[0])

            editorView.moveCursorRight()
            editorView.trigger keydownEvent('tab', shiftKey: true, target: editorView[0])
            expect(editorView.getCursorBufferPosition()).toEqual [4, 15]

      describe "when the snippet contains hard tabs", ->
        describe "when the edit session is in soft-tabs mode", ->
          it "translates hard tabs in the snippet to the appropriate number of spaces", ->
            expect(editor.getSoftTabs()).toBeTruthy()
            editorView.insertText("t3")
            editorView.trigger keydownEvent('tab', target: editorView[0])
            expect(buffer.lineForRow(1)).toBe "  line 2"
            expect(editor.getCursorBufferPosition()).toEqual [1, 8]

        describe "when the edit session is in hard-tabs mode", ->
          it "inserts hard tabs in the snippet directly", ->
            editor.setSoftTabs(false)
            editorView.insertText("t3")
            editorView.trigger keydownEvent('tab', target: editorView[0])
            expect(buffer.lineForRow(1)).toBe "\tline 2"
            expect(editor.getCursorBufferPosition()).toEqual [1, 7]

      describe "when the snippet prefix is indented", ->
        describe "when the snippet spans a single line", ->
          it "does not indent the next line", ->
            editorView.setCursorScreenPosition([2, Infinity])
            editorView.insertText ' t1'
            editorView.trigger 'snippets:expand'
            expect(buffer.lineForRow(3)).toBe "    var pivot = items.shift(), current, left = [], right = [];"

        describe "when the snippet spans multiple lines", ->
          it "indents the subsequent lines of the snippet to be even with the start of the first line", ->
            expect(editor.getSoftTabs()).toBeTruthy()
            editorView.setCursorScreenPosition([2, Infinity])
            editorView.insertText ' t3'
            editorView.trigger 'snippets:expand'
            expect(buffer.lineForRow(2)).toBe "    if (items.length <= 1) return items; line 1"
            expect(buffer.lineForRow(3)).toBe "      line 2"
            expect(editorView.getCursorBufferPosition()).toEqual [3, 12]

    describe "when the letters preceding the cursor don't match a snippet", ->
      it "inserts a tab as normal", ->
        editorView.insertText("xte")
        expect(editorView.getCursorScreenPosition()).toEqual [0, 3]

        editorView.trigger keydownEvent('tab', target: editorView[0])
        expect(buffer.lineForRow(0)).toBe "xte  var quicksort = function () {"
        expect(editorView.getCursorScreenPosition()).toEqual [0, 5]

    describe "when text is selected", ->
      it "inserts a tab as normal", ->
        editorView.insertText("t1")
        editorView.setSelectedBufferRange([[0, 0], [0, 2]])

        editorView.trigger keydownEvent('tab', target: editorView[0])
        expect(buffer.lineForRow(0)).toBe "  t1var quicksort = function () {"
        expect(editorView.getSelectedBufferRange()).toEqual [[0, 0], [0, 4]]

    describe "when a previous snippet expansion has just been undone", ->
      it "expands the snippet based on the current prefix rather than jumping to the old snippet's tab stop", ->
        editorView.insertText 't6\n'
        editorView.setCursorBufferPosition [0, 2]
        editorView.trigger keydownEvent('tab', target: editorView[0])
        expect(buffer.lineForRow(0)).toBe "first line"
        editorView.undo()
        expect(buffer.lineForRow(0)).toBe "t6"
        editorView.trigger keydownEvent('tab', target: editorView[0])
        expect(buffer.lineForRow(0)).toBe "first line"

  describe "snippet loading", ->
    beforeEach ->
      atom.packages.loadPackage('package-with-broken-snippets.tmbundle', sync: true)
      atom.packages.loadPackage('package-with-snippets')

      jasmine.unspy(window, "setTimeout")
      jasmine.unspy(snippets, 'loadAll')
      spyOn(snippets, 'loadAtomSnippets').andCallFake (path, done) -> done()
      spyOn(snippets, 'loadTextMateSnippets').andCallFake (path, done) -> done()

    it "loads non-hidden snippet files from all atom packages with snippets directories, logging a warning if a file can't be parsed", ->
      jasmine.unspy(snippets, 'loadAtomSnippets')
      spyOn(console, 'warn')
      snippets.loaded = false
      snippets.loadAll()

      waitsFor "all snippets to load", 30000, -> snippets.loaded

      runs ->
        expect(atom.syntax.getProperty(['.test'], 'snippets.test')?.constructor).toBe Snippet

        # warn about junk-file, but don't even try to parse a hidden file
        expect(console.warn).toHaveBeenCalled()
        expect(console.warn.calls.length).toBe 1

    it "loads snippets from all TextMate packages with snippets", ->
      jasmine.unspy(snippets, 'loadTextMateSnippets')
      spyOn(console, 'warn')
      snippets.loaded = false
      snippets.loadAll()

      waitsFor "all snippets to load", 30000, -> snippets.loaded

      runs ->
        snippet = atom.syntax.getProperty(['.source.js'], 'snippets.fun')
        expect(snippet.constructor).toBe Snippet
        expect(snippet.prefix).toBe 'fun'
        expect(snippet.name).toBe 'Function'
        expect(snippet.body).toBe """
          function function_name(argument) {
          \t// body...
          }
        """

        # warn about invalid.plist
        expect(console.warn).toHaveBeenCalled()
        expect(console.warn.calls.length).toBe 1

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
