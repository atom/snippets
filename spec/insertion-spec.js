const Insertion = require('../lib/insertion')
const {Range, TextEditor} = require('atom')

const range = new Range(0, 0)

const Snippets = require('../lib/snippets')

describe('Insertion', () => {
  let editor
  let editorElement

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

  function resolve (snippet) {
    Snippets.add(__filename, {
      '*': {
        'a': {
          prefix: 'a',
          body: snippet
        }
      }
    })

    editor.setText('a')
    editor.setCursorBufferPosition([0, 1])
    atom.commands.dispatch(editorElement, 'snippets:expand')
    return editor.getText()
  }

  it('resolves a plain snippet', () => {
    expect(resolve('${} $ n $}1} ${/upcase/} \n world ${||}'))
      .toEqual('${} $ n $}1} ${/upcase/} \n world ${||}')
  })

  it('resolves a snippet with tabstops', () => {
    expect(resolve('hello$1world${2}')).toEqual('helloworld')
  })

  it('resolves snippets with placeholders', () => {
    expect(resolve('${1:hello} world')).toEqual('hello world')
    expect(resolve('${1:one${2:tw${3:othre}e}}')).toEqual('onetwothree')
  })

  it('uses the first choice as a placeholder', () => {
    expect(resolve('${1|one,two,three|}')).toEqual('one')
  })

  describe('when resolving variables', () => {
    it('resolves base variables', () => {
      expect(resolve('$TM_LINE_INDEX')).toEqual('0')
      expect(resolve('$TM_LINE_NUMBER')).toEqual('1')
      expect(/\d{4,}/.test(resolve('$CURRENT_YEAR'))).toEqual(true)

      atom.clipboard.write('foo')
      expect(resolve('$CLIPBOARD')).toEqual('foo')
    })

    it('uses unknown variables as placeholders', () => {
      expect(resolve('$GaRBag3')).toEqual('GaRBag3')
    })

    it('allows more resolvers to be provided', () => {
      Snippets.consumeResolver({
        variableResolvers: {
          'EXTENDED': () => 'calculated resolution',
          'POSITION': ({row}) => `${row}`
        }
      })

      expect(resolve('$EXTENDED')).toEqual('calculated resolution')
      expect(resolve('foo\n$POSITION')).toEqual('foo\n1')
    })

    it('allows provided resolvers to override builtins', () => {
      expect(resolve('$TM_LINE_INDEX')).toEqual('0')
      Snippets.consumeResolver({
        variableResolvers: {
          'TM_LINE_INDEX': () => 'umbrella'
        }
      })
      expect(resolve('$TM_LINE_INDEX')).toEqual('umbrella')
    })
  })

  describe('when resolving transforms', () => {
    beforeEach(() => {
      Snippets.consumeResolver({
        variableResolvers: {
          'A': () => 'hello world',
          'B': () => 'foo\nbar\nbaz',
          'C': () => '😄foo',
          'D': () => 'baz foo'
        }
      })
    })

    it('respects the provided flags', () => {
      expect(resolve('${A/.//}')).toEqual('ello world')
      expect(resolve('${A/.//g}')).toEqual('')

      expect(resolve('${A/HELLO//}')).toEqual('hello world')
      expect(resolve('${A/HELLO//i}')).toEqual(' world')

      expect(resolve('${B/^ba(.)$/$1/}')).toEqual('foo\nbar\nbaz')
      expect(resolve('${B/^ba(.)$/$1/m}')).toEqual('foo\nr\nbaz')

      expect(resolve('${C/^.foo$/bar/}')).toEqual('😄foo') // without /u, the emoji is seen as two characters
      expect(resolve('${C/^.foo$/bar/u}')).toEqual('bar')

      expect(resolve('${D/foo/bar/}')).toEqual('baz bar')
      expect(resolve('${D/foo/bar/y}')).toEqual('baz foo') // with /y, the search is only from index 0 and fails
    })
  })

  it('returns what it was given when it has no substitution', () => {
    let insertion = new Insertion({
      range,
      substitution: undefined
    })
    let transformed = insertion.transform('foo!')

    expect(transformed).toEqual('foo!')
  })

  it('transforms what it was given when it has a regex transformation', () => {
    let insertion = new Insertion({
      range,
      substitution: {
        find: /foo/g,
        replace: ['bar']
      }
    })
    let transformed = insertion.transform('foo!')

    expect(transformed).toEqual('bar!')
  })

  it('transforms the case of the next character when encountering a \\u or \\l flag', () => {
    let uInsertion = new Insertion({
      range,
      substitution: {
        find: /(.)(.)(.*)/g,
        replace: [
          { backreference: 1 },
          { escape: 'u' },
          { backreference: 2 },
          { backreference: 3 }
        ]
      }
    })

    expect(uInsertion.transform('foo!')).toEqual('fOo!')
    expect(uInsertion.transform('fOo!')).toEqual('fOo!')
    expect(uInsertion.transform('FOO!')).toEqual('FOO!')

    let lInsertion = new Insertion({
      range,
      substitution: {
        find: /(.{2})(.)(.*)/g,
        replace: [
          { backreference: 1 },
          { escape: 'l' },
          { backreference: 2 },
          { backreference: 3 }
        ]
      }
    })

    expect(lInsertion.transform('FOO!')).toEqual('FOo!')
    expect(lInsertion.transform('FOo!')).toEqual('FOo!')
    expect(lInsertion.transform('FoO!')).toEqual('Foo!')
    expect(lInsertion.transform('foo!')).toEqual('foo!')
  })

  it('transforms the case of all remaining characters when encountering a \\U or \\L flag, up until it sees a \\E flag', () => {
    let uInsertion = new Insertion({
      range,
      substitution: {
        find: /(.)(.*)/,
        replace: [
          { backreference: 1 },
          { escape: 'U' },
          { backreference: 2 }
        ]
      }
    })

    expect(uInsertion.transform('lorem ipsum!')).toEqual('lOREM IPSUM!')
    expect(uInsertion.transform('lOREM IPSUM!')).toEqual('lOREM IPSUM!')
    expect(uInsertion.transform('LOREM IPSUM!')).toEqual('LOREM IPSUM!')

    let ueInsertion = new Insertion({
      range,
      substitution: {
        find: /(.)(.{3})(.*)/,
        replace: [
          { backreference: 1 },
          { escape: 'U' },
          { backreference: 2 },
          { escape: 'E' },
          { backreference: 3 }
        ]
      }
    })

    expect(ueInsertion.transform('lorem ipsum!')).toEqual('lOREm ipsum!')
    expect(ueInsertion.transform('lOREm ipsum!')).toEqual('lOREm ipsum!')
    expect(ueInsertion.transform('LOREM IPSUM!')).toEqual('LOREM IPSUM!')

    let lInsertion = new Insertion({
      range,
      substitution: {
        find: /(.{4})(.)(.*)/,
        replace: [
          { backreference: 1 },
          { escape: 'L' },
          { backreference: 2 },
          'WHAT'
        ]
      }
    })

    expect(lInsertion.transform('LOREM IPSUM!')).toEqual('LOREmwhat')

    let leInsertion = new Insertion({
      range,
      substitution: {
        find: /^([A-Fa-f])(.*)(.)$/,
        replace: [
          { backreference: 1 },
          { escape: 'L' },
          { backreference: 2 },
          { escape: 'E' },
          { backreference: 3 }
        ]
      }
    })

    expect(leInsertion.transform('LOREM IPSUM!')).toEqual('LOREM IPSUM!')
    expect(leInsertion.transform('CONSECUETUR')).toEqual('ConsecuetuR')
  })
})
