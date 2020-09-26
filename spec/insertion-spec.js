const Insertion = require('../lib/insertion')
const { Range } = require('atom')

const range = new Range(0, 0)

describe('Insertion', () => {
  it('returns what it was given when it has no substitution', () => {
    const insertion = new Insertion({
      range,
      substitution: undefined
    })
    const transformed = insertion.transform('foo!')

    expect(transformed).toEqual('foo!')
  })

  it('transforms what it was given when it has a regex transformation', () => {
    const insertion = new Insertion({
      range,
      substitution: {
        find: /foo/g,
        replace: ['bar']
      }
    })
    const transformed = insertion.transform('foo!')

    expect(transformed).toEqual('bar!')
  })

  it('transforms the case of the next character when encountering a \\u or \\l flag', () => {
    const uInsertion = new Insertion({
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

    const lInsertion = new Insertion({
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
    const uInsertion = new Insertion({
      range,
      substitution: {
        find: /(.)(.*)/,
        replace: [{ backreference: 1 }, { escape: 'U' }, { backreference: 2 }]
      }
    })

    expect(uInsertion.transform('lorem ipsum!')).toEqual('lOREM IPSUM!')
    expect(uInsertion.transform('lOREM IPSUM!')).toEqual('lOREM IPSUM!')
    expect(uInsertion.transform('LOREM IPSUM!')).toEqual('LOREM IPSUM!')

    const ueInsertion = new Insertion({
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

    const lInsertion = new Insertion({
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

    const leInsertion = new Insertion({
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
