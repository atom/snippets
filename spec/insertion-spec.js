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

  afterEach(() => {
    waitsForPromise(() => atom.packages.deactivatePackage('snippets'))
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
    Snippets.clearExpansions(editor)
    return editor.getText()
  }

  function transform (input, transform, replacement, flags = '') {
    return resolve(`\${1:${input}}\${1/${transform}/${replacement}/${flags}}`).slice(input.length)
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
    expect(resolve('${1:one${2:two${3:thr}e}e}')).toEqual('onetwothree')
  })

  describe('when resolving choices', () => {
    it('uses the first choice as a placeholder', () => {
      expect(resolve('${1|one,two,three|}')).toEqual('one')
    })

    it('uses the first non transforming placeholder for transformations', () => {
      expect(resolve('${1:foo} ${1|one,two,three|} ${1/.*/$0/}')).toEqual('foo one foo')
      expect(resolve('${1|one,two,three|} ${1:foo} ${1/.*/$0/}')).toEqual('one foo one')
    })
  })

  describe('when resolving variables', () => {
    it('resolves base variables', () => {
      expect(resolve('$TM_LINE_INDEX')).toEqual('0')
      expect(resolve('$TM_LINE_NUMBER')).toEqual('1')
      expect(/\d{4,}/.test(resolve('$CURRENT_YEAR'))).toEqual(true)

      atom.clipboard.write('foo')
      expect(resolve('$CLIPBOARD')).toEqual('foo')
    })

    it('allows more resolvers to be provided', () => {
      Snippets.consumeResolver({
        variableResolvers: {
          'EXTENDED': () => 'calculated resolution',
          'POSITION': ({row}) => `${row}`
        }
      })

      expect(resolve('$EXTENDED')).toEqual('calculated resolution')
      expect(resolve('$POSITION\n$POSITION')).toEqual('0\n1')
    })

    describe('when a variable is unknown', () => {
      it('uses uses the variable name as a placeholder', () => {
        expect(resolve('$GaRBag3')).toEqual('GaRBag3')
      })

      it('will not try to transform an unknown variable', () => {
        expect(resolve('${GaRBag3/.*/foo/}')).toEqual('GaRBag3')
      })
    })

    describe('when a variable is known but not set', () => {
      beforeEach(() => {
        Snippets.consumeResolver({
          variableResolvers: {
            'UNDEFINED': () => undefined,
            'NULL': () => null,
            'EMPTY': () => ''
          }
        })
      })

      it('uses the placeholder value if possible', () => {
        expect(resolve('${UNDEFINED:placeholder}')).toEqual('placeholder')
        expect(resolve('${NULL:placeholder}')).toEqual('placeholder')
        expect(resolve('${EMPTY:placeholder}')).toEqual('') // empty string is a valid resolution
      })

      it('will transform an unset variable as if it was the empty string', () => {
        expect(resolve('${UNDEFINED/^$/foo/}')).toEqual('foo')
      })

      it('can resolve variables in placeholders', () => {
        expect(resolve('${UNDEFINED:$TM_LINE_INDEX}')).toEqual('0')
      })
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
          'D': () => 'baz foo',
          'E': () => 'foo baz foo'
        }
      })
    })

    it('leaves the existing value when the transform is empty', () => {
      expect(resolve('${A///}')).toEqual('hello world')
    })

    it('respects the provided regex flags', () => {
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
      expect(resolve('${E/foo/bar/g}')).toEqual('bar baz bar')
      expect(resolve('${E/foo/bar/gy}')).toEqual('bar baz foo')
    })
  })

  describe('when there are case flags', () => {
    it('transforms the case of the next character when encountering a \\u or \\l flag', () => {
      let find = '(.)(.)(.*)'
      let replace = '$1\\u$2$3'
      expect(transform('foo!', find, replace, 'g')).toEqual('fOo!')
      expect(transform('fOo!', find, replace, 'g')).toEqual('fOo!')
      expect(transform('FOO!', find, replace, 'g')).toEqual('FOO!')

      find = '(.{2})(.)(.*)'
      replace = '$1\\l$2$3'
      expect(transform('FOO!', find, replace, 'g')).toEqual('FOo!')
      expect(transform('FOo!', find, replace, 'g')).toEqual('FOo!')
      expect(transform('FoO!', find, replace, 'g')).toEqual('Foo!')
      expect(transform('foo!', find, replace, 'g')).toEqual('foo!')
    })

    it('transforms the case of all remaining characters when encountering a \\U or \\L flag, up until it sees a \\E flag', () => {
      let find = '(.)(.*)'
      let replace = '$1\\U$2'
      expect(transform('lorem ipsum!', find, replace)).toEqual('lOREM IPSUM!')
      expect(transform('lOREM IPSUM!', find, replace)).toEqual('lOREM IPSUM!')
      expect(transform('LOREM IPSUM!', find, replace)).toEqual('LOREM IPSUM!')

      find = '(.)(.{3})(.*)'
      replace = '$1\\U$2\\E$3'
      expect(transform('lorem ipsum!', find, replace)).toEqual('lOREm ipsum!')
      expect(transform('lOREm ipsum!', find, replace)).toEqual('lOREm ipsum!')
      expect(transform('LOREM IPSUM!', find, replace)).toEqual('LOREM IPSUM!')

      expect(transform('LOREM IPSUM!', '(.{4})(.)(.*)', '$1\\L$2WHAT')).toEqual('LOREmwhat')

      find = '^([A-Fa-f])(.*)(.)$'
      replace = '$1\\L$2\\E$3'
      expect(transform('LOREM IPSUM!', find, replace)).toEqual('LOREM IPSUM!')
      expect(transform('CONSECUETUR', find, replace)).toEqual('ConsecuetuR')
    })
  })

  describe('when there are replacement transformations', () => {
    it('knows some basic transformations', () => {
      expect(transform('foo', '.*', '${0:/upcase}')).toEqual('FOO')
      expect(transform('FOO', '.*', '${0:/downcase}')).toEqual('foo')
      expect(transform('foo bar', '.*', '${0:/capitalize}')).toEqual('Foo bar')
    })

    it('uses the empty string for an unknown transformation', () => {
      expect(transform('foo', '.*', '${0:/GaRBagE}')).toEqual('')
    })

    it('allows more transformations to be provided', () => {
      expect(transform('foo', '.*', '${0:/extension}')).toEqual('')
      Snippets.consumeResolver({
        transformResolvers: {
          'extension': () => 'extended',
          'echo': ({input}) => input + '... ' + input
        }
      })
      expect(transform('foo', '.*', '${0:/extension}')).toEqual('extended')
      expect(transform('foo', '.*', '${0:/echo}')).toEqual('foo... foo')
    })

    it('allows provided transformations to override builtins', () => {
      expect(transform('foo', '.*', '${0:/capitalize}')).toEqual('Foo')
      Snippets.consumeResolver({
        transformResolvers: {
          'capitalize': () => 'different'
        }
      })
      expect(transform('foo', '.*', '${0:/capitalize}')).toEqual('different')
    })

    it('lets verbose transforms take priority over case flags', () => {
      expect(transform('foo bar baz', '(foo) (bar) (baz)', '$1 \\U$2 $3')).toEqual('foo BAR BAZ')
      expect(transform('foo bar baz', '(foo) (bar) (baz)', '$1 \\U${2:/downcase} $3')).toEqual('foo bar BAZ')
    })
  })
})
