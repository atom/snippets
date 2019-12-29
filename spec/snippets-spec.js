/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const temp = require('temp').track();
const Snippets = require('../lib/snippets');
const {TextEditor} = require('atom');

describe("Snippets extension", function() {
  let [editorElement, editor] = Array.from([]);

  const simulateTabKeyEvent = function(param) {
    if (param == null) { param = {}; }
    const {shift} = param;
    const event = atom.keymaps.constructor.buildKeydownEvent('tab', {shift, target: editorElement});
    return atom.keymaps.handleKeyboardEvent(event);
  };

  beforeEach(function() {
    spyOn(Snippets, 'loadAll');
    spyOn(Snippets, 'getUserSnippetsPath').andReturn('');

    waitsForPromise(() => atom.workspace.open('sample.js'));

    waitsForPromise(() => atom.packages.activatePackage('language-javascript'));

    waitsForPromise(() => atom.packages.activatePackage('snippets'));

    return runs(function() {
      editor = atom.workspace.getActiveTextEditor();
      return editorElement = atom.views.getView(editor);
    });
  });

  afterEach(() => waitsForPromise(() => atom.packages.deactivatePackage('snippets')));

  describe("provideSnippets interface", function() {
    let snippetsInterface = null;

    beforeEach(() => snippetsInterface = Snippets.provideSnippets());

    describe("bundledSnippetsLoaded", function() {
      it("indicates the loaded state of the bundled snippets", function() {
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe(false);
        Snippets.doneLoading();
        return expect(snippetsInterface.bundledSnippetsLoaded()).toBe(true);
      });

      return it("resets the loaded state after snippets is deactivated", function() {
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe(false);
        Snippets.doneLoading();
        expect(snippetsInterface.bundledSnippetsLoaded()).toBe(true);

        waitsForPromise(() => atom.packages.deactivatePackage('snippets'));
        waitsForPromise(() => atom.packages.activatePackage('snippets'));

        return runs(function() {
          expect(snippetsInterface.bundledSnippetsLoaded()).toBe(false);
          Snippets.doneLoading();
          return expect(snippetsInterface.bundledSnippetsLoaded()).toBe(true);
        });
      });
    });

    return describe("insertSnippet", () => it("can insert a snippet", function() {
      editor.setSelectedBufferRange([[0, 4], [0, 13]]);
      snippetsInterface.insertSnippet("hello ${1:world}", editor);
      return expect(editor.lineTextForBufferRow(0)).toBe("var hello world = function () {");
    }));
  });

  it("returns false for snippetToExpandUnderCursor if getSnippets returns {}", function() {
    const snippets = atom.packages.getActivePackage('snippets').mainModule;
    return expect(snippets.snippetToExpandUnderCursor(editor)).toEqual(false);
  });

  it("ignores invalid snippets in the config", function() {
    const snippets = atom.packages.getActivePackage('snippets').mainModule;

    let invalidSnippets = null;
    spyOn(snippets.scopedPropertyStore, 'getPropertyValue').andCallFake(() => invalidSnippets);
    expect(snippets.getSnippets(editor)).toEqual({});

    invalidSnippets = 'test';
    expect(snippets.getSnippets(editor)).toEqual({});

    invalidSnippets = [];
    expect(snippets.getSnippets(editor)).toEqual({});

    invalidSnippets = 3;
    expect(snippets.getSnippets(editor)).toEqual({});

    invalidSnippets = {a: null};
    return expect(snippets.getSnippets(editor)).toEqual({});
});

  describe("when null snippets are present", function() {
    beforeEach(() => Snippets.add(__filename, {
      '.source.js': {
        "some snippet": {
          prefix: "t1",
          body: "this is a test"
        }
      },

      '.source.js .nope': {
        "some snippet": {
          prefix: "t1",
          body: null
        }
      }
    }
    ));

    return it("overrides the less-specific defined snippet", function() {
      const snippets = Snippets.provideSnippets();
      expect(snippets.snippetsForScopes(['.source.js'])['t1']).toBeTruthy();
      return expect(snippets.snippetsForScopes(['.source.js .nope.not-today'])['t1']).toBeFalsy();
    });
  });

  describe("when 'tab' is triggered on the editor", function() {
    beforeEach(() => Snippets.add(__filename, {
      ".source.js": {
        "without tab stops": {
          prefix: "t1",
          body: "this is a test"
        },

        "with only an end tab stop": {
          prefix: "t1a",
          body: "something $0 strange"
        },

        "overlapping prefix": {
          prefix: "tt1",
          body: "this is another test"
        },

        "special chars": {
          prefix: "@unique",
          body: "@unique see"
        },

        "tab stops": {
          prefix: "t2",
          body: `\
go here next:($2) and finally go here:($0)
go here first:($1)
\
`
        },

        "indented second line": {
          prefix: "t3",
          body: `\
line 1
\tline 2$1
$2\
`
        },

        "multiline with indented placeholder tabstop": {
          prefix: "t4",
          body: `\
line \${1:1}
\${2:body...}\
`
        },

        "multiline starting with tabstop": {
          prefix: "t4b",
          body: `\
$1 = line 1 {
line 2
}\
`
        },

        "nested tab stops": {
          prefix: "t5",
          body: '${1:"${2:key}"}: ${3:value}'
        },

        "caused problems with undo": {
          prefix: "t6",
          body: `\
first line$1
\${2:placeholder ending second line}\
`
        },

        "tab stops at beginning and then end of snippet": {
          prefix: "t6b",
          body: "$1expanded$0"
        },

        "tab stops at end and then beginning of snippet": {
          prefix: "t6c",
          body: "$0expanded$1"
        },

        "contains empty lines": {
          prefix: "t7",
          body: `\
first line $1


fourth line after blanks $2\
`
        },
        "with/without placeholder": {
          prefix: "t8",
          body: `\
with placeholder \${1:test}
without placeholder \${2}\
`
        },

        "multi-caret": {
          prefix: "t9",
          body: `\
with placeholder \${1:test}
without placeholder $1\
`
        },

        "multi-caret-multi-tabstop": {
          prefix: "t9b",
          body: `\
with placeholder \${1:test}
without placeholder $1
second tabstop $2
third tabstop $3\
`
        },

        "large indices": {
          prefix: "t10",
          body: `\
hello\${10} \${11:large} indices\${1}\
`
        },

        "no body": {
          prefix: "bad1"
        },

        "number body": {
          prefix: "bad2",
          body: 100
        },

        "many tabstops": {
          prefix: "t11",
          body: `\
$0one\${1} \${2:two} three\${3}\
`
        },

        "simple transform": {
          prefix: "t12",
          body: `\
[\${1:b}][/\${1/[ ]+.*$//}]\
`
        },
        "transform with non-transforming mirrors": {
          prefix: "t13",
          body: `\
\${1:placeholder}\n\${1/(.)/\\u$1/}\n$1\
`
        },
        "multiple tab stops, some with transforms and some without": {
          prefix: "t14",
          body: `\
\${1:placeholder} \${1/(.)/\\u$1/} $1 \${2:ANOTHER} \${2/^(.*)$/\\L$1/} $2\
`
        },
        "has a transformed tab stop without a corresponding ordinary tab stop": {
          prefix: 't15',
          body: `\
\${1/(.)/\\u$1/} & $2\
`
        },
        "has a transformed tab stop that occurs before the corresponding ordinary tab stop": {
          prefix: 't16',
          body: `\
& \${1/(.)/\\u$1/} & \${1:q}\
`
        },
        "has a placeholder that mirrors another tab stop's content": {
          prefix: 't17',
          body: "$4console.${3:log}('${2:uh $1}', $1);$0"
        },
        "has a transformed tab stop such that it is possible to move the cursor between the ordinary tab stop and its transformed version without an intermediate step": {
          prefix: 't18',
          body: '// $1\n// ${1/./=/}'
        }
      }
    }
    ));

    it("parses snippets once, reusing cached ones on subsequent queries", function() {
      spyOn(Snippets, "getBodyParser").andCallThrough();

      editor.insertText("t1");
      simulateTabKeyEvent();

      expect(Snippets.getBodyParser).toHaveBeenCalled();
      expect(editor.lineTextForBufferRow(0)).toBe("this is a testvar quicksort = function () {");
      expect(editor.getCursorScreenPosition()).toEqual([0, 14]);

      Snippets.getBodyParser.reset();

      editor.setText("");
      editor.insertText("t1");
      simulateTabKeyEvent();

      expect(Snippets.getBodyParser).not.toHaveBeenCalled();
      expect(editor.lineTextForBufferRow(0)).toBe("this is a test");
      expect(editor.getCursorScreenPosition()).toEqual([0, 14]);

      Snippets.getBodyParser.reset();

      Snippets.add(__filename, {
        ".source.js": {
          "invalidate previous snippet": {
            prefix: "t1",
            body: "new snippet"
          }
        }
      }
      );

      editor.setText("");
      editor.insertText("t1");
      simulateTabKeyEvent();

      expect(Snippets.getBodyParser).toHaveBeenCalled();
      expect(editor.lineTextForBufferRow(0)).toBe("new snippet");
      return expect(editor.getCursorScreenPosition()).toEqual([0, 11]);
  });

    describe("when the snippet body is invalid or missing", () => it("does not register the snippet", function() {
      editor.setText('');
      editor.insertText('bad1');
      atom.commands.dispatch(editorElement, 'snippets:expand');
      expect(editor.getText()).toBe('bad1');

      editor.setText('');
      editor.setText('bad2');
      atom.commands.dispatch(editorElement, 'snippets:expand');
      return expect(editor.getText()).toBe('bad2');
    }));

    describe("when the letters preceding the cursor trigger a snippet", function() {
      describe("when the snippet contains no tab stops", function() {
        it("replaces the prefix with the snippet text and places the cursor at its end", function() {
          editor.insertText("t1");
          expect(editor.getCursorScreenPosition()).toEqual([0, 2]);

          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(0)).toBe("this is a testvar quicksort = function () {");
          return expect(editor.getCursorScreenPosition()).toEqual([0, 14]);
      });

        return it("inserts a real tab the next time a tab is pressed after the snippet is expanded", function() {
          editor.insertText("t1");
          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(0)).toBe("this is a testvar quicksort = function () {");
          simulateTabKeyEvent();
          return expect(editor.lineTextForBufferRow(0)).toBe("this is a test  var quicksort = function () {");
        });
      });

      describe("when the snippet contains tab stops", function() {
        it("places the cursor at the first tab-stop, and moves the cursor in response to 'next-tab-stop' events", function() {
          const markerCountBefore = editor.getMarkerCount();
          editor.setCursorScreenPosition([2, 0]);
          editor.insertText('t2');
          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(2)).toBe("go here next:() and finally go here:()");
          expect(editor.lineTextForBufferRow(3)).toBe("go here first:()");
          expect(editor.lineTextForBufferRow(4)).toBe("    if (items.length <= 1) return items;");
          expect(editor.getSelectedBufferRange()).toEqual([[3, 15], [3, 15]]);

          simulateTabKeyEvent();
          expect(editor.getSelectedBufferRange()).toEqual([[2, 14], [2, 14]]);
          editor.insertText('abc');

          simulateTabKeyEvent();
          expect(editor.getSelectedBufferRange()).toEqual([[2, 40], [2, 40]]);

          // tab backwards
          simulateTabKeyEvent({shift: true});
          expect(editor.getSelectedBufferRange()).toEqual([[2, 14], [2, 17]]); // should highlight text typed at tab stop

          simulateTabKeyEvent({shift: true});
          expect(editor.getSelectedBufferRange()).toEqual([[3, 15], [3, 15]]);

          // shift-tab on first tab-stop does nothing
          simulateTabKeyEvent({shift: true});
          expect(editor.getCursorScreenPosition()).toEqual([3, 15]);

          // tab through all tab stops, then tab on last stop to terminate snippet
          simulateTabKeyEvent();
          simulateTabKeyEvent();
          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(2)).toBe("go here next:(abc) and finally go here:(  )");
          return expect(editor.getMarkerCount()).toBe(markerCountBefore);
        });

        describe("when tab stops are nested", () => it("destroys the inner tab stop if the outer tab stop is modified", function() {
          editor.setText('');
          editor.insertText('t5');
          atom.commands.dispatch(editorElement, 'snippets:expand');
          expect(editor.lineTextForBufferRow(0)).toBe('"key": value');
          expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 5]]);
          editor.insertText("foo");
          simulateTabKeyEvent();
          return expect(editor.getSelectedBufferRange()).toEqual([[0, 5], [0, 10]]);
      }));

        describe("when the only tab stop is an end stop", () => it("terminates the snippet immediately after moving the cursor to the end stop", function() {
          editor.setText('');
          editor.insertText('t1a');
          simulateTabKeyEvent();

          expect(editor.lineTextForBufferRow(0)).toBe("something  strange");
          expect(editor.getCursorBufferPosition()).toEqual([0, 10]);

          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(0)).toBe("something    strange");
          return expect(editor.getCursorBufferPosition()).toEqual([0, 12]);
      }));

        describe("when tab stops are separated by blank lines", () => it("correctly places the tab stops (regression)", function() {
          editor.setText('');
          editor.insertText('t7');
          atom.commands.dispatch(editorElement, 'snippets:expand');
          atom.commands.dispatch(editorElement, 'snippets:next-tab-stop');
          return expect(editor.getCursorBufferPosition()).toEqual([3, 25]);
      }));

        describe("when the cursor is moved beyond the bounds of the current tab stop", () => it("terminates the snippet", function() {
          editor.setCursorScreenPosition([2, 0]);
          editor.insertText('t2');
          simulateTabKeyEvent();

          editor.moveUp();
          editor.moveLeft();
          simulateTabKeyEvent();

          expect(editor.lineTextForBufferRow(2)).toBe("go here next:(  ) and finally go here:()");
          expect(editor.getCursorBufferPosition()).toEqual([2, 16]);

          // test we can terminate with shift-tab
          editor.setCursorScreenPosition([4, 0]);
          editor.insertText('t2');
          simulateTabKeyEvent();
          simulateTabKeyEvent();

          editor.moveRight();
          simulateTabKeyEvent({shift: true});
          return expect(editor.getCursorBufferPosition()).toEqual([4, 15]);
      }));

        describe("when the cursor is moved within the bounds of the current tab stop", () => it("should not terminate the snippet", function() {
          editor.setCursorScreenPosition([0, 0]);
          editor.insertText('t8');
          simulateTabKeyEvent();

          expect(editor.lineTextForBufferRow(0)).toBe("with placeholder test");
          editor.moveRight();
          editor.moveLeft();
          editor.insertText("foo");
          expect(editor.lineTextForBufferRow(0)).toBe("with placeholder tesfoot");

          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(1)).toBe("without placeholder var quicksort = function () {");
          editor.insertText("test");
          expect(editor.lineTextForBufferRow(1)).toBe("without placeholder testvar quicksort = function () {");
          editor.moveLeft();
          editor.insertText("foo");
          return expect(editor.lineTextForBufferRow(1)).toBe("without placeholder tesfootvar quicksort = function () {");
        }));

        return describe("when the backspace is press within the bounds of the current tab stop", () => it("should not terminate the snippet", function() {
          editor.setCursorScreenPosition([0, 0]);
          editor.insertText('t8');
          simulateTabKeyEvent();

          expect(editor.lineTextForBufferRow(0)).toBe("with placeholder test");
          editor.moveRight();
          editor.backspace();
          editor.insertText("foo");
          expect(editor.lineTextForBufferRow(0)).toBe("with placeholder tesfoo");

          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(1)).toBe("without placeholder var quicksort = function () {");
          editor.insertText("test");
          expect(editor.lineTextForBufferRow(1)).toBe("without placeholder testvar quicksort = function () {");
          editor.backspace();
          editor.insertText("foo");
          return expect(editor.lineTextForBufferRow(1)).toBe("without placeholder tesfoovar quicksort = function () {");
        }));
      });

      describe("when the snippet contains hard tabs", function() {
        describe("when the edit session is in soft-tabs mode", () => it("translates hard tabs in the snippet to the appropriate number of spaces", function() {
          expect(editor.getSoftTabs()).toBeTruthy();
          editor.insertText("t3");
          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(1)).toBe("  line 2");
          return expect(editor.getCursorBufferPosition()).toEqual([1, 8]);
      }));

        return describe("when the edit session is in hard-tabs mode", () => it("inserts hard tabs in the snippet directly", function() {
          editor.setSoftTabs(false);
          editor.insertText("t3");
          simulateTabKeyEvent();
          expect(editor.lineTextForBufferRow(1)).toBe("\tline 2");
          return expect(editor.getCursorBufferPosition()).toEqual([1, 7]);
      }));
    });

      describe("when the snippet prefix is indented", function() {
        describe("when the snippet spans a single line", () => it("does not indent the next line", function() {
          editor.setCursorScreenPosition([2, Infinity]);
          editor.insertText(' t1');
          atom.commands.dispatch(editorElement, 'snippets:expand');
          return expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
        }));

        return describe("when the snippet spans multiple lines", () => it("indents the subsequent lines of the snippet to be even with the start of the first line", function() {
          expect(editor.getSoftTabs()).toBeTruthy();
          editor.setCursorScreenPosition([2, Infinity]);
          editor.insertText(' t3');
          atom.commands.dispatch(editorElement, 'snippets:expand');
          expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items; line 1");
          expect(editor.lineTextForBufferRow(3)).toBe("      line 2");
          return expect(editor.getCursorBufferPosition()).toEqual([3, 12]);
      }));
    });

      describe("when the snippet spans multiple lines", function() {
        beforeEach(function() {
          editor.update({autoIndent: true});
          // editor.update() returns a Promise that never gets resolved, so we
          // need to return undefined to avoid a timeout in the spec.
          // TODO: Figure out why `editor.update({autoIndent: true})` never gets resolved.
        });

        it("places tab stops correctly", function() {
          expect(editor.getSoftTabs()).toBeTruthy();
          editor.setCursorScreenPosition([2, Infinity]);
          editor.insertText(' t3');
          atom.commands.dispatch(editorElement, 'snippets:expand');
          expect(editor.getCursorBufferPosition()).toEqual([3, 12]);
          atom.commands.dispatch(editorElement, 'snippets:next-tab-stop');
          return expect(editor.getCursorBufferPosition()).toEqual([4, 4]);
      });

        it("indents the subsequent lines of the snippet based on the indent level before the snippet is inserted", function() {
          editor.setCursorScreenPosition([2, Infinity]);
          editor.insertNewline();
          editor.insertText('t4b');
          atom.commands.dispatch(editorElement, 'snippets:expand');

          expect(editor.lineTextForBufferRow(3)).toBe("     = line 1 {"); // 4 + 1 spaces (because the tab stop is invisible)
          expect(editor.lineTextForBufferRow(4)).toBe("      line 2");
          expect(editor.lineTextForBufferRow(5)).toBe("    }");
          return expect(editor.getCursorBufferPosition()).toEqual([3, 4]);
      });

        return it("does not change the relative positioning of the tab stops when inserted multiple times", function() {
          editor.setCursorScreenPosition([2, Infinity]);
          editor.insertNewline();
          editor.insertText('t4');
          atom.commands.dispatch(editorElement, 'snippets:expand');

          expect(editor.getSelectedBufferRange()).toEqual([[3, 9], [3, 10]]);
          atom.commands.dispatch(editorElement, 'snippets:next-tab-stop');
          expect(editor.getSelectedBufferRange()).toEqual([[4, 6], [4, 13]]);

          editor.insertText('t4');
          atom.commands.dispatch(editorElement, 'snippets:expand');

          expect(editor.getSelectedBufferRange()).toEqual([[4, 11], [4, 12]]);
          atom.commands.dispatch(editorElement, 'snippets:next-tab-stop');
          expect(editor.getSelectedBufferRange()).toEqual([[5, 8], [5, 15]]);

          editor.setText(''); // Clear editor
          editor.insertText('t4');
          atom.commands.dispatch(editorElement, 'snippets:expand');

          expect(editor.getSelectedBufferRange()).toEqual([[0, 5], [0, 6]]);
          atom.commands.dispatch(editorElement, 'snippets:next-tab-stop');
          return expect(editor.getSelectedBufferRange()).toEqual([[1, 2], [1, 9]]);
      });
    });

      return describe("when multiple snippets match the prefix", () => it("expands the snippet that is the longest match for the prefix", function() {
        editor.insertText('t113');
        expect(editor.getCursorScreenPosition()).toEqual([0, 4]);

        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("t113  var quicksort = function () {");
        expect(editor.getCursorScreenPosition()).toEqual([0, 6]);

        editor.undo();
        editor.undo();

        editor.insertText("tt1");
        expect(editor.getCursorScreenPosition()).toEqual([0, 3]);

        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("this is another testvar quicksort = function () {");
        expect(editor.getCursorScreenPosition()).toEqual([0, 20]);

        editor.undo();
        editor.undo();

        editor.insertText("@t1");
        expect(editor.getCursorScreenPosition()).toEqual([0, 3]);

        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("@this is a testvar quicksort = function () {");
        return expect(editor.getCursorScreenPosition()).toEqual([0, 15]);
    }));
  });

    describe("when the word preceding the cursor ends with a snippet prefix", () => it("inserts a tab as normal", function() {
      editor.insertText("t1t1t1");
      simulateTabKeyEvent();
      return expect(editor.lineTextForBufferRow(0)).toBe("t1t1t1  var quicksort = function () {");
    }));

    describe("when the letters preceding the cursor don't match a snippet", () => it("inserts a tab as normal", function() {
      editor.insertText("xxte");
      expect(editor.getCursorScreenPosition()).toEqual([0, 4]);

      simulateTabKeyEvent();
      expect(editor.lineTextForBufferRow(0)).toBe("xxte  var quicksort = function () {");
      return expect(editor.getCursorScreenPosition()).toEqual([0, 6]);
  }));

    describe("when text is selected", () => it("inserts a tab as normal", function() {
      editor.insertText("t1");
      editor.setSelectedBufferRange([[0, 0], [0, 2]]);

      simulateTabKeyEvent();
      expect(editor.lineTextForBufferRow(0)).toBe("  t1var quicksort = function () {");
      return expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 4]]);
  }));

    describe("when a previous snippet expansion has just been undone", function() {
      describe("when the tab stops appear in the middle of the snippet", () => it("expands the snippet based on the current prefix rather than jumping to the old snippet's tab stop", function() {
        editor.insertText('t6\n');
        editor.setCursorBufferPosition([0, 2]);
        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("first line");
        editor.undo();
        expect(editor.lineTextForBufferRow(0)).toBe("t6");
        simulateTabKeyEvent();
        return expect(editor.lineTextForBufferRow(0)).toBe("first line");
      }));

      describe("when the tab stops appear at the beginning and then the end of snippet", () => it("expands the snippet based on the current prefix rather than jumping to the old snippet's tab stop", function() {
        editor.insertText('t6b\n');
        editor.setCursorBufferPosition([0, 3]);
        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("expanded");
        editor.undo();
        expect(editor.lineTextForBufferRow(0)).toBe("t6b");
        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("expanded");
        return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
      }));

      return describe("when the tab stops appear at the end and then the beginning of snippet", () => it("expands the snippet based on the current prefix rather than jumping to the old snippet's tab stop", function() {
        editor.insertText('t6c\n');
        editor.setCursorBufferPosition([0, 3]);
        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("expanded");
        editor.undo();
        expect(editor.lineTextForBufferRow(0)).toBe("t6c");
        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("expanded");
        return expect(editor.getCursorBufferPosition()).toEqual([0, 8]);
      }));
    });

    describe("when the prefix contains non-word characters", function() {
      it("selects the non-word characters as part of the prefix", function() {
        editor.insertText("@unique");
        expect(editor.getCursorScreenPosition()).toEqual([0, 7]);

        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("@unique seevar quicksort = function () {");
        expect(editor.getCursorScreenPosition()).toEqual([0, 11]);

        editor.setCursorBufferPosition([10, 0]);
        editor.insertText("'@unique");

        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(10)).toBe("'@unique see");
        return expect(editor.getCursorScreenPosition()).toEqual([10, 12]);
    });

      return it("does not select the whitespace before the prefix", function() {
        editor.insertText("a; @unique");
        expect(editor.getCursorScreenPosition()).toEqual([0, 10]);

        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("a; @unique seevar quicksort = function () {");
        return expect(editor.getCursorScreenPosition()).toEqual([0, 14]);
    });
  });

    describe("when snippet contains tabstops with or without placeholder", () => it("should create two markers", function() {
      editor.setCursorScreenPosition([0, 0]);
      editor.insertText('t8');
      simulateTabKeyEvent();
      expect(editor.lineTextForBufferRow(0)).toBe("with placeholder test");
      expect(editor.lineTextForBufferRow(1)).toBe("without placeholder var quicksort = function () {");

      expect(editor.getSelectedBufferRange()).toEqual([[0, 17], [0, 21]]);

      simulateTabKeyEvent();
      return expect(editor.getSelectedBufferRange()).toEqual([[1, 20], [1, 20]]);
  }));

    describe("when snippet contains multi-caret tabstops with or without placeholder", function() {
      it("should create two markers", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.insertText('t9');
        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("with placeholder test");
        expect(editor.lineTextForBufferRow(1)).toBe("without placeholder var quicksort = function () {");
        editor.insertText('hello');
        expect(editor.lineTextForBufferRow(0)).toBe("with placeholder hello");
        return expect(editor.lineTextForBufferRow(1)).toBe("without placeholder hellovar quicksort = function () {");
      });

      it("terminates the snippet when cursors are destroyed", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.insertText('t9b');
        simulateTabKeyEvent();
        editor.getCursors()[0].destroy();
        editor.getCursorBufferPosition();
        simulateTabKeyEvent();

        return expect(editor.lineTextForBufferRow(1)).toEqual("without placeholder   ");
      });

      it("terminates the snippet expansion if a new cursor moves outside the bounds of the tab stops", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.insertText('t9b');
        simulateTabKeyEvent();
        editor.insertText('test');

        editor.getCursors()[0].destroy();
        editor.moveDown(); // this should destroy the previous expansion
        editor.moveToBeginningOfLine();

        // this should insert whitespace instead of going through tabstops of the previous destroyed snippet
        simulateTabKeyEvent();
        return expect(editor.lineTextForBufferRow(2).indexOf("  second")).toBe(0);
      });

      it("moves to the second tabstop after a multi-caret tabstop", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.insertText('t9b');
        simulateTabKeyEvent();
        editor.insertText('line 1');

        simulateTabKeyEvent();
        editor.insertText('line 2');

        simulateTabKeyEvent();
        editor.insertText('line 3');

        return expect(editor.lineTextForBufferRow(2).indexOf("line 2 ")).toBe(-1);
      });

      return it("mirrors input properly when a tabstop's placeholder refers to another tabstop", function() {
        editor.setText('t17');
        editor.setCursorScreenPosition([0, 3]);
        simulateTabKeyEvent();
        editor.insertText("foo");
        expect(editor.getText()).toBe("console.log('uh foo', foo);");
        simulateTabKeyEvent();
        editor.insertText("bar");
        return expect(editor.getText()).toBe("console.log('bar', foo);");
      });
    });

    describe("when the snippet contains tab stops with transformations", function() {
      it("transforms the text typed into the first tab stop before setting it in the transformed tab stop", function() {
        editor.setText('t12');
        editor.setCursorScreenPosition([0, 3]);
        simulateTabKeyEvent();
        expect(editor.getText()).toBe("[b][/b]");
        editor.insertText('img src');
        return expect(editor.getText()).toBe("[img src][/img]");
      });

      it("bundles the transform mutations along with the original manual mutation for the purposes of undo and redo", function() {
        editor.setText('t12');
        editor.setCursorScreenPosition([0, 3]);
        simulateTabKeyEvent();
        editor.insertText('i');
        expect(editor.getText()).toBe("[i][/i]");

        editor.insertText('mg src');
        expect(editor.getText()).toBe("[img src][/img]");

        editor.undo();
        expect(editor.getText()).toBe("[i][/i]");

        editor.redo();
        return expect(editor.getText()).toBe("[img src][/img]");
      });

      it("can pick the right insertion to use as the primary even if a transformed insertion occurs first in the snippet", function() {
        editor.setText('t16');
        editor.setCursorScreenPosition([0, 3]);
        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("& Q & q");
        expect(editor.getCursorBufferPosition()).toEqual([0, 7]);

        editor.insertText('rst');
        return expect(editor.lineTextForBufferRow(0)).toBe("& RST & rst");
      });

      return it("silently ignores a tab stop without a non-transformed insertion to use as the primary", function() {
        editor.setText('t15');
        editor.setCursorScreenPosition([0, 3]);
        simulateTabKeyEvent();
        editor.insertText('a');
        expect(editor.lineTextForBufferRow(0)).toBe(" & a");
        return expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      });
    });

    describe("when the snippet contains mirrored tab stops and tab stops with transformations", () => it("adds cursors for the mirrors but not the transformations", function() {
      editor.setText('t13');
      editor.setCursorScreenPosition([0, 3]);
      simulateTabKeyEvent();
      expect(editor.getCursors().length).toBe(2);
      expect(editor.getText()).toBe(`\
placeholder
PLACEHOLDER
\
`
      );

      editor.insertText('foo');

      return expect(editor.getText()).toBe(`\
foo
FOO
foo\
`
      );
    }));

    describe("when the snippet contains multiple tab stops, some with transformations and some without", () => it("does not get confused", function() {
      editor.setText('t14');
      editor.setCursorScreenPosition([0, 3]);
      simulateTabKeyEvent();
      expect(editor.getCursors().length).toBe(2);
      expect(editor.getText()).toBe("placeholder PLACEHOLDER  ANOTHER another ");
      simulateTabKeyEvent();
      expect(editor.getCursors().length).toBe(2);
      editor.insertText('FOO');
      return expect(editor.getText()).toBe(`\
placeholder PLACEHOLDER  FOO foo FOO\
`
      );
    }));

    describe("when the snippet has a transformed tab stop such that it is possible to move the cursor between the ordinary tab stop and its transformed version without an intermediate step", () => it("terminates the snippet upon such a cursor move", function() {
      editor.setText('t18');
      editor.setCursorScreenPosition([0, 3]);
      simulateTabKeyEvent();
      expect(editor.getText()).toBe("// \n// ");
      expect(editor.getCursorBufferPosition()).toEqual([0, 3]);
      editor.insertText('wat');
      expect(editor.getText()).toBe("// wat\n// ===");
      // Move the cursor down one line, then up one line. This puts the cursor
      // back in its previous position, but the snippet should no longer be
      // active, so when we type more text, it should not be mirrored.
      editor.setCursorScreenPosition([1, 6]);
      editor.setCursorScreenPosition([0, 6]);
      editor.insertText('wat');
      return expect(editor.getText()).toBe("// watwat\n// ===");
    }));


    describe("when the snippet contains tab stops with an index >= 10", () => it("parses and orders the indices correctly", function() {
      editor.setText('t10');
      editor.setCursorScreenPosition([0, 3]);
      simulateTabKeyEvent();
      expect(editor.getText()).toBe("hello large indices");
      expect(editor.getCursorBufferPosition()).toEqual([0, 19]);
      simulateTabKeyEvent();
      expect(editor.getCursorBufferPosition()).toEqual([0, 5]);
      simulateTabKeyEvent();
      return expect(editor.getSelectedBufferRange()).toEqual([[0, 6], [0, 11]]);
  }));

    describe("when there are multiple cursors", function() {
      describe("when the cursors share a common snippet prefix", function() {
        it("expands the snippet for all cursors and allows simultaneous editing", function() {
          editor.insertText('t9');
          editor.setCursorBufferPosition([12, 2]);
          editor.insertText(' t9');
          editor.addCursorAtBufferPosition([0, 2]);
          simulateTabKeyEvent();

          expect(editor.lineTextForBufferRow(0)).toBe("with placeholder test");
          expect(editor.lineTextForBufferRow(1)).toBe("without placeholder var quicksort = function () {");
          expect(editor.lineTextForBufferRow(13)).toBe("}; with placeholder test");
          expect(editor.lineTextForBufferRow(14)).toBe("without placeholder ");

          editor.insertText('hello');
          expect(editor.lineTextForBufferRow(0)).toBe("with placeholder hello");
          expect(editor.lineTextForBufferRow(1)).toBe("without placeholder hellovar quicksort = function () {");
          expect(editor.lineTextForBufferRow(13)).toBe("}; with placeholder hello");
          return expect(editor.lineTextForBufferRow(14)).toBe("without placeholder hello");
        });

        it("applies transformations identically to single-expansion mode", function() {
          editor.setText('t14\nt14');
          editor.setCursorBufferPosition([1, 3]);
          editor.addCursorAtBufferPosition([0, 3]);
          simulateTabKeyEvent();

          expect(editor.lineTextForBufferRow(0)).toBe("placeholder PLACEHOLDER  ANOTHER another ");
          expect(editor.lineTextForBufferRow(1)).toBe("placeholder PLACEHOLDER  ANOTHER another ");

          editor.insertText("testing");

          expect(editor.lineTextForBufferRow(0)).toBe("testing TESTING testing ANOTHER another ");
          expect(editor.lineTextForBufferRow(1)).toBe("testing TESTING testing ANOTHER another ");

          simulateTabKeyEvent();
          editor.insertText("AGAIN");

          expect(editor.lineTextForBufferRow(0)).toBe("testing TESTING testing AGAIN again AGAIN");
          return expect(editor.lineTextForBufferRow(1)).toBe("testing TESTING testing AGAIN again AGAIN");
        });

        it("bundles transform-induced mutations into a single history entry along with their triggering edit, even across multiple snippets", function() {
          editor.setText('t14\nt14');
          editor.setCursorBufferPosition([1, 3]);
          editor.addCursorAtBufferPosition([0, 3]);
          simulateTabKeyEvent();

          expect(editor.lineTextForBufferRow(0)).toBe("placeholder PLACEHOLDER  ANOTHER another ");
          expect(editor.lineTextForBufferRow(1)).toBe("placeholder PLACEHOLDER  ANOTHER another ");

          editor.insertText("testing");

          expect(editor.lineTextForBufferRow(0)).toBe("testing TESTING testing ANOTHER another ");
          expect(editor.lineTextForBufferRow(1)).toBe("testing TESTING testing ANOTHER another ");

          simulateTabKeyEvent();
          editor.insertText("AGAIN");

          expect(editor.lineTextForBufferRow(0)).toBe("testing TESTING testing AGAIN again AGAIN");
          expect(editor.lineTextForBufferRow(1)).toBe("testing TESTING testing AGAIN again AGAIN");

          editor.undo();
          expect(editor.lineTextForBufferRow(0)).toBe("testing TESTING testing ANOTHER another ");
          expect(editor.lineTextForBufferRow(1)).toBe("testing TESTING testing ANOTHER another ");

          editor.undo();
          expect(editor.lineTextForBufferRow(0)).toBe("placeholder PLACEHOLDER  ANOTHER another ");
          expect(editor.lineTextForBufferRow(1)).toBe("placeholder PLACEHOLDER  ANOTHER another ");

          editor.redo();
          expect(editor.lineTextForBufferRow(0)).toBe("testing TESTING testing ANOTHER another ");
          expect(editor.lineTextForBufferRow(1)).toBe("testing TESTING testing ANOTHER another ");

          editor.redo();
          expect(editor.lineTextForBufferRow(0)).toBe("testing TESTING testing AGAIN again AGAIN");
          return expect(editor.lineTextForBufferRow(1)).toBe("testing TESTING testing AGAIN again AGAIN");
        });

        return describe("when there are many tabstops", () => it("moves the cursors between the tab stops for their corresponding snippet when tab and shift-tab are pressed", function() {
          editor.addCursorAtBufferPosition([7, 5]);
          editor.addCursorAtBufferPosition([12, 2]);
          editor.insertText('t11');
          simulateTabKeyEvent();

          const cursors = editor.getCursors();
          expect(cursors.length).toEqual(3);

          expect(cursors[0].getBufferPosition()).toEqual([0, 3]);
          expect(cursors[1].getBufferPosition()).toEqual([7, 8]);
          expect(cursors[2].getBufferPosition()).toEqual([12, 5]);
          expect(cursors[0].selection.isEmpty()).toBe(true);
          expect(cursors[1].selection.isEmpty()).toBe(true);
          expect(cursors[2].selection.isEmpty()).toBe(true);

          simulateTabKeyEvent();
          expect(cursors[0].getBufferPosition()).toEqual([0, 7]);
          expect(cursors[1].getBufferPosition()).toEqual([7, 12]);
          expect(cursors[2].getBufferPosition()).toEqual([12, 9]);
          expect(cursors[0].selection.isEmpty()).toBe(false);
          expect(cursors[1].selection.isEmpty()).toBe(false);
          expect(cursors[2].selection.isEmpty()).toBe(false);
          expect(cursors[0].selection.getText()).toEqual('two');
          expect(cursors[1].selection.getText()).toEqual('two');
          expect(cursors[2].selection.getText()).toEqual('two');

          simulateTabKeyEvent();
          expect(cursors[0].getBufferPosition()).toEqual([0, 13]);
          expect(cursors[1].getBufferPosition()).toEqual([7, 18]);
          expect(cursors[2].getBufferPosition()).toEqual([12, 15]);
          expect(cursors[0].selection.isEmpty()).toBe(true);
          expect(cursors[1].selection.isEmpty()).toBe(true);
          expect(cursors[2].selection.isEmpty()).toBe(true);

          simulateTabKeyEvent();
          expect(cursors[0].getBufferPosition()).toEqual([0, 0]);
          expect(cursors[1].getBufferPosition()).toEqual([7, 5]);
          expect(cursors[2].getBufferPosition()).toEqual([12, 2]);
          expect(cursors[0].selection.isEmpty()).toBe(true);
          expect(cursors[1].selection.isEmpty()).toBe(true);
          return expect(cursors[2].selection.isEmpty()).toBe(true);
        }));
      });

      describe("when the cursors do not share common snippet prefixes", () => it("inserts tabs as normal", function() {
        editor.insertText('t9');
        editor.setCursorBufferPosition([12, 2]);
        editor.insertText(' t8');
        editor.addCursorAtBufferPosition([0, 2]);
        simulateTabKeyEvent();
        expect(editor.lineTextForBufferRow(0)).toBe("t9  var quicksort = function () {");
        return expect(editor.lineTextForBufferRow(12)).toBe("}; t8 ");
      }));

      return describe("when a snippet is triggered within an existing snippet expansion", () => it("ignores the snippet expansion and goes to the next tab stop", function() {
        editor.addCursorAtBufferPosition([7, 5]);
        editor.addCursorAtBufferPosition([12, 2]);
        editor.insertText('t11');
        simulateTabKeyEvent();
        simulateTabKeyEvent();

        editor.insertText('t1');
        simulateTabKeyEvent();

        const cursors = editor.getCursors();
        expect(cursors.length).toEqual(3);

        expect(cursors[0].getBufferPosition()).toEqual([0, 12]);
        expect(cursors[1].getBufferPosition()).toEqual([7, 17]);
        expect(cursors[2].getBufferPosition()).toEqual([12, 14]);
        expect(cursors[0].selection.isEmpty()).toBe(true);
        expect(cursors[1].selection.isEmpty()).toBe(true);
        expect(cursors[2].selection.isEmpty()).toBe(true);
        expect(editor.lineTextForBufferRow(0)).toBe("one t1 threevar quicksort = function () {");
        expect(editor.lineTextForBufferRow(7)).toBe("    }one t1 three");
        return expect(editor.lineTextForBufferRow(12)).toBe("};one t1 three");
      }));
    });

    return describe("when the editor is not a pane item (regression)", () => it("handles tab stops correctly", function() {
      editor = new TextEditor();
      atom.grammars.assignLanguageMode(editor, 'source.js');
      editorElement = editor.getElement();

      editor.insertText('t2');
      simulateTabKeyEvent();
      editor.insertText('ABC');
      expect(editor.getText()).toContain('go here first:(ABC)');

      editor.undo();
      editor.undo();
      expect(editor.getText()).toBe('t2');
      simulateTabKeyEvent();
      editor.insertText('ABC');
      return expect(editor.getText()).toContain('go here first:(ABC)');
    }));
  });

  describe("when atom://.atom/snippets is opened", () => it("opens ~/.atom/snippets.cson", function() {
    jasmine.unspy(Snippets, 'getUserSnippetsPath');
    atom.workspace.destroyActivePaneItem();
    const configDirPath = temp.mkdirSync('atom-config-dir-');
    spyOn(atom, 'getConfigDirPath').andReturn(configDirPath);
    atom.workspace.open('atom://.atom/snippets');

    waitsFor(() => atom.workspace.getActiveTextEditor() != null);

    return runs(() => expect(atom.workspace.getActiveTextEditor().getURI()).toBe(path.join(configDirPath, 'snippets.cson')));
  }));

  describe("snippet insertion API", () => it("will automatically parse snippet definition and replace selection", function() {
    editor.setSelectedBufferRange([[0, 4], [0, 13]]);
    Snippets.insert("hello ${1:world}", editor);

    expect(editor.lineTextForBufferRow(0)).toBe("var hello world = function () {");
    return expect(editor.getSelectedBufferRange()).toEqual([[0, 10], [0, 15]]);
}));

  return describe("when the 'snippets:available' command is triggered", function() {
    let availableSnippetsView = null;

    beforeEach(function() {
      Snippets.add(__filename, {
        ".source.js": {
          "test": {
            prefix: "test",
            body: "${1:Test pass you will}, young "
          },

          "challenge": {
            prefix: "chal",
            body: "$1: ${2:To pass this challenge}"
          }
        }
      }
      );

      delete Snippets.availableSnippetsView;

      atom.commands.dispatch(editorElement, "snippets:available");

      waitsFor(() => atom.workspace.getModalPanels().length === 1);

      return runs(() => availableSnippetsView = atom.workspace.getModalPanels()[0].getItem());
    });

    it("renders a select list of all available snippets", function() {
      expect(availableSnippetsView.selectListView.getSelectedItem().prefix).toBe('test');
      expect(availableSnippetsView.selectListView.getSelectedItem().name).toBe('test');
      expect(availableSnippetsView.selectListView.getSelectedItem().bodyText).toBe('${1:Test pass you will}, young ');

      availableSnippetsView.selectListView.selectNext();

      expect(availableSnippetsView.selectListView.getSelectedItem().prefix).toBe('chal');
      expect(availableSnippetsView.selectListView.getSelectedItem().name).toBe('challenge');
      return expect(availableSnippetsView.selectListView.getSelectedItem().bodyText).toBe('$1: ${2:To pass this challenge}');
    });

    it("writes the selected snippet to the editor as snippet", function() {
      availableSnippetsView.selectListView.confirmSelection();

      expect(editor.getCursorScreenPosition()).toEqual([0, 18]);
      expect(editor.getSelectedText()).toBe('Test pass you will');
      return expect(editor.lineTextForBufferRow(0)).toBe('Test pass you will, young var quicksort = function () {');
    });

    return it("closes the dialog when triggered again", function() {
      atom.commands.dispatch(availableSnippetsView.selectListView.refs.queryEditor.element, 'snippets:available');
      return expect(atom.workspace.getModalPanels().length).toBe(0);
    });
  });
});
