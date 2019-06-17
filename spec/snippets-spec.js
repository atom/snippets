const path = require('path')
const fs = require('fs')
const temp = require('temp').track()
const CSON = require('season')
const Snippets = require('../lib/snippets')
const {TextEditor} = require('atom')

describe('Snippets extension', () => {
  let editorElement
  let editor

  function simulateTabKeyEvent ({shift}={}) {
    const event = atom.keymaps.constructor.buildKeydownEvent('tab', {shift, target: editorElement})
    atom.keymaps.handleKeyboardEvent(event)
  }

  function expandSnippetUnderCursor () {
    atom.commands.dispatch(editorElement, 'snippets:expand')
  }

  function gotoNextTabstop () {
    atom.commands.dispatch(editorElement, 'snippets:next-tab-stop')
  }

  function gotoPreviousTabstop () {
    atom.commands.dispatch(editorElement, 'snippets:previous-tab-stop')
  }

  beforeEach(() => {
    spyOn(Snippets, 'loadAll')
    spyOn(Snippets, 'getUserSnippetsPath').andReturn('')

    waitsForPromise(() => atom.workspace.open())
    waitsForPromise(() => atom.packages.activatePackage('snippets'))

    runs(() => {
      editor = atom.workspace.getActiveTextEditor()
      editorElement = atom.views.getView(editor)
    })
  })

  afterEach(() => {
    waitsForPromise(() => atom.packages.deactivatePackage('snippets'))
  })

  describe('provideSnippets interface', () => {
    let snippetsInterface = null

    beforeEach(() => {
      snippetsInterface = Snippets.provideSnippets()
    })

    describe('bundledSnippetsLoaded', () => {
      it('indicates the loaded state of the bundled snippets', () => {
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe(false)
        Snippets.doneLoading()
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe(true)
      })

      it('resets the loaded state after snippets is deactivated', () => {
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe(false)
        Snippets.doneLoading()
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe(true)

        waitsForPromise(() => atom.packages.deactivatePackage('snippets'))
        waitsForPromise(() => atom.packages.activatePackage('snippets'))

        runs(() => {
          expect(snippetsInterface.bundledSnippetsLoaded()).toBe(false)
          Snippets.doneLoading()
          expect(snippetsInterface.bundledSnippetsLoaded()).toBe(true)
        })
      })
    })

    describe('insertSnippet', () => {
      it('can insert a snippet', () => {
        editor.setText('var quicksort = function () {')
        editor.setSelectedBufferRange([[0, 4], [0, 13]])
        snippetsInterface.insertSnippet("hello world", editor)
        expect(editor.lineTextForBufferRow(0)).toBe("var hello world = function () {")
      })
    })
  })

  it('returns false for snippetToExpandUnderCursor if getSnippets returns {}', () => {
    snippets = atom.packages.getActivePackage('snippets').mainModule
    expect(snippets.snippetToExpandUnderCursor(editor)).toEqual(false)
  })

  it('ignores invalid snippets in the config', () => {
    snippets = atom.packages.getActivePackage('snippets').mainModule

    invalidSnippets = null
    spyOn(snippets.scopedPropertyStore, 'getPropertyValue').andCallFake(() => invalidSnippets)
    expect(snippets.getSnippets(editor)).toEqual({})

    invalidSnippets = 'test'
    expect(snippets.getSnippets(editor)).toEqual({})

    invalidSnippets = []
    expect(snippets.getSnippets(editor)).toEqual({})

    invalidSnippets = 3
    expect(snippets.getSnippets(editor)).toEqual({})

    invalidSnippets = {a: null}
    expect(snippets.getSnippets(editor)).toEqual({})
  })

  describe('when null snippets are present', () => {
    beforeEach(() => {
      Snippets.add(__filename, {
        '.source.js': {
          'some snippet': {
            prefix: 't1',
            body: 'this is a test'
          }
        },
        '.source.js .nope': {
          'some snippet': {
            prefix: 't1',
            body: null
          }
        }
      })
    })

    it('overrides the less-specific defined snippet', () => {
      snippets = Snippets.provideSnippets()
      expect(snippets.snippetsForScopes(['.source.js'])['t1']).toBeTruthy()
      expect(snippets.snippetsForScopes(['.source.js .nope.not-today'])['t1']).toBeFalsy()
    })
  })

  describe('when "tab" is triggered on the editor', () => {
    const testSnippets = CSON.readFileSync(path.join(__dirname, 'fixtures', 'test-snippets.cson'))

    beforeEach(() => {
      Snippets.add(__filename, testSnippets)
      editor.setSoftTabs(false) // hard tabs are easier to reason with
      editor.setText('')
    })

    it('parses snippets once, reusing cached ones on subsequent queries', () => {
      spyOn(Snippets, 'getBodyParser').andCallThrough()
      editor.setText('var quicksort = function () {')
      editor.setCursorBufferPosition([0, 0])
      editor.insertText('t1')
      simulateTabKeyEvent()

      expect(Snippets.getBodyParser).toHaveBeenCalled()
      expect(editor.lineTextForBufferRow(0)).toBe('this is a testvar quicksort = function () {')
      expect(editor.getCursorScreenPosition()).toEqual([0, 14])

      Snippets.getBodyParser.reset()

      editor.setText('')
      editor.insertText('t1')
      simulateTabKeyEvent()

      expect(Snippets.getBodyParser).not.toHaveBeenCalled()
      expect(editor.lineTextForBufferRow(0)).toBe('this is a test')
      expect(editor.getCursorScreenPosition()).toEqual([0, 14])

      Snippets.getBodyParser.reset()

      Snippets.add(__filename, {
        '*': {
          'invalidate previous snippet': {
            prefix: 't1',
            body: 'new snippet'
          }
        }
      })

      editor.setText('')
      editor.insertText('t1')
      simulateTabKeyEvent()

      expect(Snippets.getBodyParser).toHaveBeenCalled()
      expect(editor.lineTextForBufferRow(0)).toBe('new snippet')
      expect(editor.getCursorScreenPosition()).toEqual([0, 11])
    })

    describe('when the snippet body is invalid or missing', () => {
      it('does not register the snippet', () => {
        editor.insertText('bad1')
        expandSnippetUnderCursor()
        expect(editor.getText()).toBe('bad1')

        editor.setText('')
        editor.setText('bad2')
        expandSnippetUnderCursor()
        expect(editor.getText()).toBe('bad2')
      })
    })

    describe('when the letters preceding the cursor trigger a snippet', () => {
      describe('when the snippet contains no tab stops', () => {
        it('replaces the prefix with the snippet text and places the cursor at its end', () => {
          editor.setText('hello world')
          editor.setCursorBufferPosition([0, 6])
          editor.insertText('t1')
          expect(editor.getCursorScreenPosition()).toEqual([0, 8])

          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('hello this is a testworld')
          expect(editor.getCursorScreenPosition()).toEqual([0, 20])
        })

        it('inserts a real tab the next time a tab is pressed after the snippet is expanded', () => {
          editor.insertText('t1')
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('this is a test')
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('this is a test\t')
        })
      })

      describe('when the snippet contains tab stops', () => {
        it('places the cursor at the first tab-stop, and moves the cursor in response to "next-tab-stop" events', () => {
          markerCountBefore = editor.getMarkerCount()
          editor.insertText('t2')
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('go here next:() and finally go here:()')
          expect(editor.lineTextForBufferRow(1)).toBe('go here first:()')
          expect(editor.getSelectedBufferRange()).toEqual([[1, 15], [1, 15]])
          editor.insertText('abc')

          simulateTabKeyEvent()
          expect(editor.getSelectedBufferRange()).toEqual([[0, 14], [0, 14]])

          // tab backwards
          simulateTabKeyEvent({shift: true})
          expect(editor.getSelectedBufferRange()).toEqual([[1, 15], [1, 18]]) // should highlight text typed at tab stop

          // shift-tab on first tab-stop does nothing
          simulateTabKeyEvent({shift: true})
          expect(editor.getSelectedBufferRange()).toEqual([[1, 15], [1, 18]])

          // jump to second tab-stop
          simulateTabKeyEvent()
          expect(editor.getSelectedBufferRange()).toEqual([[0, 14], [0, 14]])

          // jump to end tab-stop
          simulateTabKeyEvent()
          expect(editor.getSelectedBufferRange()).toEqual([[0, 37], [0, 37]])

          expect(editor.lineTextForBufferRow(0)).toBe('go here next:() and finally go here:()')
          expect(editor.lineTextForBufferRow(1)).toBe('go here first:(abc)')
          expect(editor.getMarkerCount()).toBe(markerCountBefore)

          // We have reached $0, so the next tab press should be an actual tab
          simulateTabKeyEvent()
          const firstLine = 'go here next:() and finally go here:(\t)';
          expect(editor.lineTextForBufferRow(0)).toBe(firstLine)
          expect(editor.getSelectedBufferRange()).toEqual([[0, firstLine.length - 1], [0, firstLine.length - 1]])
        })

        describe('when tab stops are nested', () => {
          it('destroys the inner tab stop if the outer tab stop is modified', () => {
            editor.insertText('t5')
            expandSnippetUnderCursor()
            expect(editor.lineTextForBufferRow(0)).toBe("'key': value")
            expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 5]])
            editor.insertText('foo')
            simulateTabKeyEvent()
            expect(editor.getSelectedBufferRange()).toEqual([[0, 5], [0, 10]])
          })
        })

        describe('when the only tab stop is an end stop', () => {
          it('terminates the snippet immediately after moving the cursor to the end stop', () => {
            editor.insertText('t1a')
            simulateTabKeyEvent()

            expect(editor.lineTextForBufferRow(0)).toBe('something  strange')
            expect(editor.getCursorBufferPosition()).toEqual([0, 10])

            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(0)).toBe('something \t strange')
            expect(editor.getCursorBufferPosition()).toEqual([0, 11])
          })
        })

        describe('when tab stops are separated by blank lines', () => {
          it('correctly places the tab stops (regression)', () => {
            editor.insertText('t7')
            expandSnippetUnderCursor()
            gotoNextTabstop()
            expect(editor.getCursorBufferPosition()).toEqual([3, 25])
          })
        })

        describe('when the cursor is moved beyond the bounds of the current tab stop', () => {
          it('terminates the snippet', () => {
            editor.insertText('t2')
            simulateTabKeyEvent()

            editor.moveUp()
            editor.moveLeft()
            simulateTabKeyEvent()

            expect(editor.lineTextForBufferRow(0)).toBe('go here next:(\t) and finally go here:()')
            expect(editor.getCursorBufferPosition()).toEqual([0, 15])
          })
        })

        describe('when the cursor is moved within the bounds of the current tab stop', () => {
          it('should not terminate the snippet', () => {
            editor.insertText('t8')
            simulateTabKeyEvent()

            expect(editor.lineTextForBufferRow(0)).toBe('with placeholder test')
            editor.moveRight()
            editor.moveLeft()
            editor.insertText('foo')
            expect(editor.lineTextForBufferRow(0)).toBe('with placeholder tesfoot')

            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(1)).toBe('without placeholder ')
            editor.insertText('test')
            expect(editor.lineTextForBufferRow(1)).toBe('without placeholder test')
            editor.moveLeft()
            editor.insertText('foo')
            expect(editor.lineTextForBufferRow(1)).toBe('without placeholder tesfoot')

            simulateTabKeyEvent({shift: true})
            expect(editor.getSelectedBufferRange()).toEqual([[0, 17], [0, 24]])
          })
        })

        describe('when the backspace is press within the bounds of the current tab stop', () => {
          it('should not terminate the snippet', () => {
            editor.insertText('t8')
            simulateTabKeyEvent()

            expect(editor.lineTextForBufferRow(0)).toBe('with placeholder test')
            editor.moveRight()
            editor.backspace()
            editor.insertText('foo')
            expect(editor.lineTextForBufferRow(0)).toBe('with placeholder tesfoo')

            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(1)).toBe('without placeholder ')
            editor.insertText('test')
            expect(editor.lineTextForBufferRow(1)).toBe('without placeholder test')
            editor.backspace()
            editor.insertText('foo')
            expect(editor.lineTextForBufferRow(1)).toBe('without placeholder tesfoo')
          })
        })

      })

      describe('when the snippet contains hard tabs', () => {
        describe('when the edit session is in soft-tabs mode', () => {
          beforeEach(() => editor.setSoftTabs(true))

          it('translates hard tabs in the snippet to the appropriate number of spaces', () => {
            expect(editor.getSoftTabs()).toBeTruthy()
            editor.insertText('t3')
            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(1)).toBe('  line 2')
            expect(editor.getCursorBufferPosition()).toEqual([1, 8])
          })
        })

        describe('when the edit session is in hard-tabs mode', () => {
          beforeEach(() => editor.setSoftTabs(false))

          it('inserts hard tabs in the snippet directly', () => {
            expect(editor.getSoftTabs()).toBeFalsy()
            editor.insertText('t3')
            simulateTabKeyEvent()
            expect(editor.lineTextForBufferRow(1)).toBe("\tline 2")
            expect(editor.getCursorBufferPosition()).toEqual([1, 7])
          })
        })
      })

      describe('when the snippet prefix is indented', () => {
        describe('when the snippet spans a single line', () => {
          it('does not indent the next line', () => {
            editor.setText('first line\n\t\nthird line')
            editor.setCursorScreenPosition([1, Infinity])
            editor.insertText('t1')
            expect(editor.lineTextForBufferRow(1)).toBe('\tt1')
            expandSnippetUnderCursor()
            expect(editor.lineTextForBufferRow(2)).toBe('third line')
          })
        })

        describe('when the snippet spans multiple lines', () => {
          it('indents the subsequent lines of the snippet to be even with the start of the first line', () => {
            editor.setSoftTabs(true)
            const tabSpace = editor.getTabText()
            editor.setText(tabSpace + 't3')
            expandSnippetUnderCursor()
            expect(editor.lineTextForBufferRow(0)).toBe(tabSpace + 'line 1')
            expect(editor.lineTextForBufferRow(1)).toBe(tabSpace + tabSpace + 'line 2')
            gotoNextTabstop()
            expect(editor.getCursorBufferPosition()).toEqual([2, tabSpace.length])
          })
        })
      })

      describe('when the snippet spans multiple lines', () => {
        beforeEach(() => {
          // editor.update() returns a Promise that never gets resolved, so we
          // need to return undefined to avoid a timeout in the spec.
          // TODO: Figure out why `editor.update({autoIndent: true})` never gets resolved.
          editor.update({autoIndent: true})
        })

        it('places tab stops correctly', () => {
          editor.insertText('t3')
          expandSnippetUnderCursor()
          expect(editor.getCursorBufferPosition()).toEqual([1, 7])
          gotoNextTabstop()
          expect(editor.getCursorBufferPosition()).toEqual([2, 0])
        })

        it('indents the subsequent lines of the snippet based on the indent level before the snippet is inserted', () => {
          editor.insertText('\tt4b')
          expandSnippetUnderCursor()

          expect(editor.lineTextForBufferRow(0)).toBe('\t = line 1 {')
          expect(editor.lineTextForBufferRow(1)).toBe('\t  line 2')
          expect(editor.lineTextForBufferRow(2)).toBe('\t}')
          expect(editor.getCursorBufferPosition()).toEqual([0, 1])
        })

        it('does not change the relative positioning of the tab stops when inserted multiple times', () => {
          editor.insertText('t4')
          expandSnippetUnderCursor()

          expect(editor.getSelectedBufferRange()).toEqual([[0, 5], [0, 6]])
          gotoNextTabstop()
          expect(editor.getSelectedBufferRange()).toEqual([[1, 2], [1, 9]])

          editor.insertText('t4')
          expandSnippetUnderCursor()

          expect(editor.getSelectedBufferRange()).toEqual([[1, 7], [1, 8]])
          gotoNextTabstop()
          expect(editor.getSelectedBufferRange()).toEqual([[2, 4], [2, 11]]) // prefix was on line indented by 2 spaces

          editor.setText('')
          editor.insertText('t4')
          expandSnippetUnderCursor()

          expect(editor.getSelectedBufferRange()).toEqual([[0, 5], [0, 6]])
          gotoNextTabstop()
          expect(editor.getSelectedBufferRange()).toEqual([[1, 2], [1, 9]])
        })
      })

      describe('when multiple snippets match the prefix', () => {
        it('expands the snippet that is the longest match for the prefix', () => {
          editor.setText('t113')
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('t113\t')
          expect(editor.getCursorBufferPosition()).toEqual([0, 5])

          editor.setText('tt1')
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('this is another test')
          expect(editor.getCursorBufferPosition()).toEqual([0, 20])

          editor.setText('@t1')
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('@this is a test')
          expect(editor.getCursorBufferPosition()).toEqual([0, 15])
        })
      })
    })

    describe('when the word preceding the cursor ends with a snippet prefix', () => {
      it('inserts a tab as normal', () => {
        editor.setText('t1t1t1')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('t1t1t1\t')
      })
    })

    describe("when the letters preceding the cursor don't match a snippet", () => {
      it('inserts a tab as normal', () => {
        editor.setText('xxte')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('xxte\t')
        expect(editor.getCursorBufferPosition()).toEqual([0, 5])
      })
    })

    describe('when text is selected', () => {
      it('inserts a tab as normal', () => {
        editor.setText('t1')
        editor.setSelectedBufferRange([[0, 0], [0, 2]])
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('\tt1')
        expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 3]])
      })
    })

    describe('when a previous snippet expansion has just been undone', () => {
      it("expands the snippet based on the current prefix rather than jumping to the old snippet's tab stop", () => {
        editor.setText('t6\n')
        editor.setCursorBufferPosition([0, 2])
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('first line')
        expect(editor.lineTextForBufferRow(1)).toBe('  placeholder ending second line')

        editor.undo()
        expect(editor.lineTextForBufferRow(0)).toBe('t6')
        expect(editor.lineTextForBufferRow(1)).toBe('')

        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('first line')
        expect(editor.lineTextForBufferRow(1)).toBe('  placeholder ending second line')
      })
    })

    describe('when the prefix contains non-word characters', () => {
      it('selects the non-word characters as part of the prefix', () => {
        editor.setText("!@#$%^&*()-_=+[]{}54|\\;:?.,unique")
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe("@unique see")
        expect(editor.getCursorScreenPosition()).toEqual([0, 11])

        editor.setText("'!@#$%^&*()-_=+[]{}54|\\;:?.,unique") // has ' at start (this char is not in any loaded snippet prefix)
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe("'@unique see")
        expect(editor.getCursorBufferPosition()).toEqual([0, 12])
      })

      it('does not select the whitespace before the prefix', () => {
        editor.setText('a; !@#$%^&*()-_=+[]{}54|\\;:?.,unique')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('a; @unique see')
        expect(editor.getCursorBufferPosition()).toEqual([0, 14])
      })
    })

    describe('when snippet contains tabstops with and without placeholder', () => {
      it('should create two markers', () => {
        editor.setText('t8')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('with placeholder test')
        expect(editor.lineTextForBufferRow(1)).toBe('without placeholder ')
        expect(editor.getSelectedBufferRange()).toEqual([[0, 17], [0, 21]])

        simulateTabKeyEvent()
        expect(editor.getSelectedBufferRange()).toEqual([[1, 20], [1, 20]])
      })
    })

    describe('when snippet contains multi-caret tabstops with and without placeholder', () => {
      it('should create two markers', () => {
        editor.setText('t9')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('with placeholder test')
        expect(editor.lineTextForBufferRow(1)).toBe('without placeholder ')
        editor.insertText('hello')
        expect(editor.lineTextForBufferRow(0)).toBe('with placeholder hello')
        expect(editor.lineTextForBufferRow(1)).toBe('without placeholder hello')
      })

      it('terminates the snippet when cursors are destroyed', () => {
        editor.setText('t9b')
        simulateTabKeyEvent()
        editor.getCursors()[0].destroy()
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toEqual("with placeholder test")
        expect(editor.lineTextForBufferRow(1)).toEqual("without placeholder \t")
      })

      it('terminates the snippet expansion if a new cursor moves outside the bounds of the tab stops', () => {
        editor.setCursorScreenPosition([0, 0])
        editor.insertText('t9b')
        simulateTabKeyEvent()
        editor.insertText('test')

        editor.getCursors()[0].destroy()
        editor.moveDown() // this should destroy the previous expansion
        editor.moveToBeginningOfLine()

        // this should insert whitespace instead of going through tabstops of the previous destroyed snippet
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(2).indexOf("\tsecond")).toBe(0)
      })

      it('moves to the second tabstop after a multi-caret tabstop', () => {
        editor.setText('t9b')
        simulateTabKeyEvent()
        editor.insertText('line 1')

        simulateTabKeyEvent()
        editor.insertText('line 2')

        simulateTabKeyEvent()
        editor.insertText('line 3')

        expect(editor.lineTextForBufferRow(0)).toBe('with placeholder line 1')
        expect(editor.lineTextForBufferRow(1)).toBe('without placeholder line 1')
        expect(editor.lineTextForBufferRow(2)).toBe('second tabstop line 2')
        expect(editor.lineTextForBufferRow(3)).toBe('third tabstop line 3')
      })

      it("mirrors input properly when a tabstop's placeholder refers to another tabstop", () => {
        editor.setText('t17')
        simulateTabKeyEvent()
        editor.insertText('foo')
        expect(editor.getText()).toBe("console.log('uh foo', foo);")

        simulateTabKeyEvent()
        editor.insertText('bar')
        expect(editor.getText()).toBe("console.log('bar', foo);")
      })
    })

    describe('when the snippet contains tab stops with transformations', () => {
      it('transforms the text typed into the first tab stop before setting it in the transformed tab stop', () => {
        editor.setText('t12')
        simulateTabKeyEvent()
        expect(editor.getText()).toBe('[b][/b]')
        editor.insertText('img src')
        expect(editor.getText()).toBe('[img src][/img]')
      })

      it('bundles the transform mutations along with the original manual mutation for the purposes of undo and redo', () => {
        // NOTE: Most likely spec here to fail on CI, as it is time based
        const transactionDuration = 300

        editor.setText('t12')
        simulateTabKeyEvent()
        editor.transact(transactionDuration, () => {
          editor.insertText('i')
        })
        expect(editor.getText()).toBe("[i][/i]")

        editor.transact(transactionDuration, () => {
          editor.insertText('mg src')
        })
        expect(editor.getText()).toBe("[img src][/img]")

        editor.undo()
        expect(editor.getText()).toBe("[b][/b]")

        editor.redo()
        expect(editor.getText()).toBe("[img src][/img]")
      })

      it('can pick the right insertion to use as the primary even if a transformed insertion occurs first in the snippet', () => {
        editor.setText('t16')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe('& Q & q')
        expect(editor.getCursorBufferPosition()).toEqual([0, 7])

        editor.insertText('rst')
        expect(editor.lineTextForBufferRow(0)).toBe('& RST & rst')
      })

      it('silently ignores a tab stop without a non-transformed insertion to use as the primary', () => {
        editor.setText('t15')
        simulateTabKeyEvent()
        expect(editor.lineTextForBufferRow(0)).toBe(' & ')

        editor.insertText('a')
        expect(editor.lineTextForBufferRow(0)).toBe(' & a')
        expect(editor.getCursorBufferPosition()).toEqual([0, 4])
      })
    })

    describe('when the snippet contains mirrored tab stops and tab stops with transformations', () => {
      it('adds cursors for the mirrors but not the transformations', () => {
        editor.setText('t13')
        simulateTabKeyEvent()
        expect(editor.getCursors().length).toBe(2)
        expect(editor.getText()).toBe('placeholder\nPLACEHOLDER\n')

        editor.insertText('foo')
        expect(editor.getText()).toBe('foo\nFOO\nfoo')
      })
    })

    describe('when the snippet contains multiple tab stops, some with transformations and some without', () => {
      it('does not get confused', () => {
        editor.setText('t14')
        simulateTabKeyEvent()
        expect(editor.getCursors().length).toBe(2)
        expect(editor.getText()).toBe('placeholder PLACEHOLDER  ANOTHER another ')

        simulateTabKeyEvent()
        expect(editor.getCursors().length).toBe(2)

        editor.insertText('FOO')
        expect(editor.getText()).toBe('placeholder PLACEHOLDER  FOO foo FOO')
      })
    })

    describe('when the snippet has a transformed tab stop such that it is possible to move the cursor between the ordinary tab stop and its transformed version without an intermediate step', () => {
      it('terminates the snippet upon such a cursor move', () => {
        editor.setText('t18')
        simulateTabKeyEvent()
        expect(editor.getText()).toBe('// \n// ')
        expect(editor.getCursorBufferPosition()).toEqual([0, 3])

        editor.insertText('wat')
        expect(editor.getText()).toBe('// wat\n// ===')
        // Move the cursor down one line, then up one line. This puts the cursor
        // back in its previous position, but the snippet should no longer be
        // active, so when we type more text, it should not be mirrored.
        editor.moveDown()
        editor.moveUp()
        editor.insertText('wat')
        expect(editor.getText()).toBe('// watwat\n// ===')
      })
    })

    describe('when the snippet contains tab stops with an index >= 10', () => {
      it('parses and orders the indices correctly', () => {
        editor.setText('t10')
        simulateTabKeyEvent()
        expect(editor.getText()).toBe('hello large indices')
        expect(editor.getCursorBufferPosition()).toEqual([0, 19])

        simulateTabKeyEvent()
        expect(editor.getCursorBufferPosition()).toEqual([0, 5])

        simulateTabKeyEvent()
        expect(editor.getSelectedBufferRange()).toEqual([[0, 6], [0, 11]])
      })
    })

    describe('when the snippet has two adjacent tab stops', () => {
      it('ensures insertions are treated as part of the active tab stop', () => {
        editor.setText('t19')
        editor.setCursorScreenPosition([0, 3])
        simulateTabKeyEvent()
        expect(editor.getText()).toBe('barbaz')
        expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 3]])
        editor.insertText('w')
        expect(editor.getText()).toBe('wbaz')
        editor.insertText('at')
        expect(editor.getText()).toBe('watbaz')
        simulateTabKeyEvent()
        expect(editor.getSelectedBufferRange()).toEqual([[0, 3], [0, 6]])
        editor.insertText('foo')
        expect(editor.getText()).toBe('watfoo')
      })
    })

    describe('when the snippet has a placeholder with a tabstop mirror at its edge', () => {
      it('allows the associated marker to include the inserted text', () => {
        editor.setText('t20')
        editor.setCursorScreenPosition([0, 3])
        simulateTabKeyEvent()
        expect(editor.getText()).toBe('foobarbaz ')
        expect(editor.getCursors().length).toBe(2)
        let selections = editor.getSelections()
        expect(selections[0].getBufferRange()).toEqual([[0, 0], [0, 3]])
        expect(selections[1].getBufferRange()).toEqual([[0, 10], [0, 10]])
        editor.insertText('nah')
        expect(editor.getText()).toBe('nahbarbaz nah')
        simulateTabKeyEvent()
        editor.insertText('meh')
        simulateTabKeyEvent()
        editor.insertText('yea')
        expect(editor.getText()).toBe('nahmehyea')
      })
    })

    describe('when there are multiple cursors', () => {
      describe('when the cursors share a common snippet prefix', () => {
        it('expands the snippet for all cursors and allows simultaneous editing', () => {
          editor.setText('t9\nt9')
          editor.setCursorBufferPosition([0, 2])
          editor.addCursorAtBufferPosition([1, 2])
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('with placeholder test')
          expect(editor.lineTextForBufferRow(1)).toBe('without placeholder ')
          expect(editor.lineTextForBufferRow(2)).toBe('with placeholder test')
          expect(editor.lineTextForBufferRow(3)).toBe('without placeholder ')

          editor.insertText('hello')
          expect(editor.lineTextForBufferRow(0)).toBe('with placeholder hello')
          expect(editor.lineTextForBufferRow(1)).toBe('without placeholder hello')
          expect(editor.lineTextForBufferRow(2)).toBe('with placeholder hello')
          expect(editor.lineTextForBufferRow(3)).toBe('without placeholder hello')
        })

        it('applies transformations identically to single-expansion mode', () => {
          editor.setText('t14\nt14')
          editor.setCursorBufferPosition([1, 3])
          editor.addCursorAtBufferPosition([0, 3])
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('placeholder PLACEHOLDER  ANOTHER another ')
          expect(editor.lineTextForBufferRow(1)).toBe('placeholder PLACEHOLDER  ANOTHER another ')

          editor.insertText('testing')
          expect(editor.lineTextForBufferRow(0)).toBe('testing TESTING testing ANOTHER another ')
          expect(editor.lineTextForBufferRow(1)).toBe('testing TESTING testing ANOTHER another ')

          simulateTabKeyEvent()
          editor.insertText('AGAIN')
          expect(editor.lineTextForBufferRow(0)).toBe('testing TESTING testing AGAIN again AGAIN')
          expect(editor.lineTextForBufferRow(1)).toBe('testing TESTING testing AGAIN again AGAIN')
        })

        it('bundles transform-induced mutations into a single history entry along with their triggering edit, even across multiple snippets', () => {
          // NOTE: Another likely spec to fail on CI, as it is time based
          const transactionDuration = 300

          editor.setText('t14\nt14')
          editor.setCursorBufferPosition([1, 3])
          editor.addCursorAtBufferPosition([0, 3])
          simulateTabKeyEvent()
          editor.transact(transactionDuration, () => {
            editor.insertText('testing')
          })
          simulateTabKeyEvent()

          editor.transact(transactionDuration, () => {
            editor.insertText('AGAIN')
          })

          editor.undo()
          expect(editor.lineTextForBufferRow(0)).toBe('testing TESTING testing ANOTHER another ')
          expect(editor.lineTextForBufferRow(1)).toBe('testing TESTING testing ANOTHER another ')

          editor.undo()
          expect(editor.lineTextForBufferRow(0)).toBe('placeholder PLACEHOLDER  ANOTHER another ')
          expect(editor.lineTextForBufferRow(1)).toBe('placeholder PLACEHOLDER  ANOTHER another ')

          editor.redo()
          expect(editor.lineTextForBufferRow(0)).toBe('testing TESTING testing ANOTHER another ')
          expect(editor.lineTextForBufferRow(1)).toBe('testing TESTING testing ANOTHER another ')

          editor.redo()
          expect(editor.lineTextForBufferRow(0)).toBe('testing TESTING testing AGAIN again AGAIN')
          expect(editor.lineTextForBufferRow(1)).toBe('testing TESTING testing AGAIN again AGAIN')
        })
      })

      describe('when there are many tabstops', () => {
        it('moves the cursors between the tab stops for their corresponding snippet when tab and shift-tab are pressed', () => {
          editor.setText('t11\nt11\nt11')
          editor.setCursorBufferPosition([0, 3])
          editor.addCursorAtBufferPosition([1, 3])
          editor.addCursorAtBufferPosition([2, 3])
          simulateTabKeyEvent()
          const cursors = editor.getCursors()
          expect(cursors.length).toEqual(3)

          expect(cursors[0].getBufferPosition()).toEqual([0, 3])
          expect(cursors[1].getBufferPosition()).toEqual([1, 3])
          expect(cursors[2].getBufferPosition()).toEqual([2, 3])
          expect(cursors[0].selection.isEmpty()).toBe(true)
          expect(cursors[1].selection.isEmpty()).toBe(true)
          expect(cursors[2].selection.isEmpty()).toBe(true)

          simulateTabKeyEvent()
          expect(cursors[0].selection.getBufferRange()).toEqual([[0, 4], [0, 7]])
          expect(cursors[1].selection.getBufferRange()).toEqual([[1, 4], [1, 7]])
          expect(cursors[2].selection.getBufferRange()).toEqual([[2, 4], [2, 7]])

          simulateTabKeyEvent()
          expect(cursors[0].getBufferPosition()).toEqual([0, 13])
          expect(cursors[1].getBufferPosition()).toEqual([1, 13])
          expect(cursors[2].getBufferPosition()).toEqual([2, 13])
          expect(cursors[0].selection.isEmpty()).toBe(true)
          expect(cursors[1].selection.isEmpty()).toBe(true)
          expect(cursors[2].selection.isEmpty()).toBe(true)

          simulateTabKeyEvent()
          expect(cursors[0].getBufferPosition()).toEqual([0, 0])
          expect(cursors[1].getBufferPosition()).toEqual([1, 0])
          expect(cursors[2].getBufferPosition()).toEqual([2, 0])
          expect(cursors[0].selection.isEmpty()).toBe(true)
          expect(cursors[1].selection.isEmpty()).toBe(true)
          expect(cursors[2].selection.isEmpty()).toBe(true)
        })
      })

      describe('when the cursors do not share common snippet prefixes', () => {
        it('inserts tabs as normal', () => {
          editor.setText('t8\nt9')
          editor.setCursorBufferPosition([0, 2])
          editor.addCursorAtBufferPosition([1, 2])
          simulateTabKeyEvent()
          expect(editor.lineTextForBufferRow(0)).toBe('t8\t')
          expect(editor.lineTextForBufferRow(1)).toBe('t9\t')
        })
      })

      describe('when a snippet is triggered within an existing snippet expansion', () => {
        it ('ignores the snippet expansion and goes to the next tab stop', () => {
          // NOTE: The snippet will actually expand if triggered by expandSnippetUnderCursor()
          // So the title should be 'when a snippet is triggered with TAB', or the spec is wrong

          editor.setText('t11')
          simulateTabKeyEvent()
          simulateTabKeyEvent()

          editor.insertText('t1')
          expect(editor.getText()).toEqual('one t1 three')
          expect(editor.getCursorBufferPosition()).toEqual([0, 6])

          simulateTabKeyEvent()
          expect(editor.getText()).toEqual('one t1 three')
          expect(editor.getCursorBufferPosition()).toEqual([0, 12])
        })
      })
    })

    describe('when the editor is not a pane item (regression)', () => {
      it('handles tab stops correctly', () => {
        // NOTE: Possibly flaky test
        const transactionDuration = 300
        editor.setText('t2')
        simulateTabKeyEvent()
        editor.transact(transactionDuration, () => {
          editor.insertText('ABC')
        })
        expect(editor.lineTextForBufferRow(1)).toEqual('go here first:(ABC)')

        editor.undo()
        editor.undo()
        expect(editor.getText()).toBe('t2')
        simulateTabKeyEvent()
        editor.transact(transactionDuration, () => {
          editor.insertText('ABC')
        })
        expect(editor.getText()).toContain('go here first:(ABC)')
      })
    })
  })

  describe('when atom://.atom/snippets is opened', () => {
    it('opens ~/.atom/snippets.cson', () => {
      jasmine.unspy(Snippets, 'getUserSnippetsPath')
      atom.workspace.destroyActivePaneItem()
      const configDirPath = temp.mkdirSync('atom-config-dir-')
      spyOn(atom, 'getConfigDirPath').andReturn(configDirPath)
      atom.workspace.open('atom://.atom/snippets')

      waitsFor(() => atom.workspace.getActiveTextEditor()) // NOTE: CS had a trailing ?

      runs(() => {
        expect(atom.workspace.getActiveTextEditor().getURI()).toBe(path.join(configDirPath, 'snippets.cson'))
      })
    })
  })

  describe('snippet insertion API', () => {
    it('will automatically parse snippet definition and replace selection', () => {
      editor.setText('var quicksort = function () {')
      editor.setSelectedBufferRange([[0, 4], [0, 13]])
      Snippets.insert('hello ${1:world}', editor)

      expect(editor.lineTextForBufferRow(0)).toBe('var hello world = function () {')
      expect(editor.getSelectedBufferRange()).toEqual([[0, 10], [0, 15]])
    })
  })

  describe('when the "snippets:available" command is triggered', () => {
    let availableSnippetsView = null

    beforeEach(() => {
      Snippets.add(__filename, {
        '*': {
          'test': {
            prefix: 'test',
            body: '${1:Test pass you will}, young '
          },
          'challenge': {
            prefix: 'chal',
            body: '$1: ${2:To pass this challenge}'
          }
        }
      })

      delete Snippets.availableSnippetsView

      atom.commands.dispatch(editorElement, "snippets:available")

      waitsFor(() => atom.workspace.getModalPanels().length === 1)

      runs(() => {
        availableSnippetsView = atom.workspace.getModalPanels()[0].getItem()
      })
    })

    it('renders a select list of all available snippets', () => {
      expect(availableSnippetsView.selectListView.getSelectedItem().prefix).toBe('test')
      expect(availableSnippetsView.selectListView.getSelectedItem().name).toBe('test')
      expect(availableSnippetsView.selectListView.getSelectedItem().toString().body).toBe('Test pass you will, young ')

      availableSnippetsView.selectListView.selectNext()

      expect(availableSnippetsView.selectListView.getSelectedItem().prefix).toBe('chal')
      expect(availableSnippetsView.selectListView.getSelectedItem().name).toBe('challenge')
      expect(availableSnippetsView.selectListView.getSelectedItem().toString().body).toBe(': To pass this challenge')
    })

    it('writes the selected snippet to the editor as snippet', () => {
      availableSnippetsView.selectListView.confirmSelection()
      expect(editor.getCursorBufferPosition()).toEqual([0, 18])
      expect(editor.getSelectedText()).toBe('Test pass you will')
      expect(editor.getText()).toBe('Test pass you will, young ')
    })

    it('closes the dialog when triggered again', () => {
      atom.commands.dispatch(availableSnippetsView.selectListView.refs.queryEditor.element, 'snippets:available')
      expect(atom.workspace.getModalPanels().length).toBe(0)
    })
  })
})
